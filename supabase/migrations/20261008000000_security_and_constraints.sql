-- ==============================================================================
-- Migration: 20261008000000_security_and_constraints.sql
-- Adds unique deduplication constraints for Google Play subscriptions/purchases
-- and fixes camelCase feature keys in get_user_entitlements RPC.
-- ==============================================================================

-- 1. Enforce unique purchase tokens/orders for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_purchase_token
  ON public.subscriptions(purchase_token);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_token_order
  ON public.purchases(purchase_token, order_id);

-- 2. Partial index for active/grace-period entitlement hot-path lookups (1M-user scale)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_user_period
  ON public.subscriptions(user_id, current_period_end DESC)
  WHERE status IN ('ACTIVE', 'GRACE_PERIOD');

-- 3. Fix camelCase mapping for high_polling_rate & ultra_low_latency in get_user_entitlements
CREATE OR REPLACE FUNCTION public.get_user_entitlements(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_features JSONB := '{}'::jsonb;
  v_free_plan_id UUID;
  v_rec RECORD;
  v_json_key TEXT;
BEGIN
  SELECT s.*, p.plan_code
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status IN ('ACTIVE', 'GRACE_PERIOD')
    AND s.current_period_end > timezone('utc'::text, now())
  ORDER BY s.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    FOR v_rec IN
      SELECT feature_key, feature_value
      FROM public.plan_features
      WHERE plan_id = v_sub.plan_id
    LOOP
      v_json_key := CASE v_rec.feature_key
        WHEN 'basic_drawing' THEN 'basicDrawing'
        WHEN 'advanced_calibration' THEN 'advancedCalibration'
        WHEN 'multi_monitor' THEN 'multiMonitor'
        WHEN 'advanced_settings' THEN 'advancedSettings'
        WHEN 'high_polling_rate' THEN 'highPollingRate'
        WHEN 'ultra_low_latency' THEN 'ultraLowLatency'
        ELSE v_rec.feature_key
      END;
      v_features := jsonb_set(v_features, ARRAY[v_json_key], v_rec.feature_value);
    END LOOP;

    RETURN jsonb_build_object(
      'plan', 'PRO',
      'status', v_sub.status,
      'expiresAt', to_char(v_sub.current_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'features', v_features
    );
  ELSE
    SELECT id INTO v_free_plan_id FROM public.plans WHERE plan_code = 'FREE' LIMIT 1;

    FOR v_rec IN
      SELECT feature_key, feature_value
      FROM public.plan_features
      WHERE plan_id = v_free_plan_id
    LOOP
      v_json_key := CASE v_rec.feature_key
        WHEN 'basic_drawing' THEN 'basicDrawing'
        WHEN 'advanced_calibration' THEN 'advancedCalibration'
        WHEN 'multi_monitor' THEN 'multiMonitor'
        WHEN 'advanced_settings' THEN 'advancedSettings'
        WHEN 'high_polling_rate' THEN 'highPollingRate'
        WHEN 'ultra_low_latency' THEN 'ultraLowLatency'
        ELSE v_rec.feature_key
      END;
      v_features := jsonb_set(v_features, ARRAY[v_json_key], v_rec.feature_value);
    END LOOP;

    RETURN jsonb_build_object(
      'plan', 'FREE',
      'status', 'ACTIVE',
      'features', v_features
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
