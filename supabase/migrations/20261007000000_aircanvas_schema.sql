-- ==============================================================================
-- AIRCanvas Production Supabase PostgreSQL Schema
-- ONLY TWO PLANS: FREE and PRO
-- Google Play Subscription, Purchases & Entitlement Source of Truth
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. PLANS TABLE (EXACTLY TWO PLANS: FREE & PRO)
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- Strict guarantee: NO OTHER PLANS ALLOWED
  CONSTRAINT chk_only_two_plans CHECK (plan_code IN ('FREE', 'PRO'))
);

CREATE OR REPLACE TRIGGER set_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. PLAN_FEATURES TABLE (Configurable feature matrix)
CREATE TABLE IF NOT EXISTS public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  feature_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_key)
);

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  current_period_end TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  canceled_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_subscription_status CHECK (status IN ('ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'PAUSED', 'CANCELED', 'EXPIRED', 'REVOKED'))
);

CREATE OR REPLACE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. PURCHASES TABLE (Audit and purchase history, NEVER stores credit-card data)
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  purchase_state VARCHAR(50) NOT NULL,
  purchase_time TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expiry_time TIMESTAMPTZ,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE OR REPLACE TRIGGER set_purchases_updated_at
BEFORE UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for ultra-fast query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_token ON public.subscriptions(purchase_token);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON public.purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_token ON public.purchases(purchase_token);
CREATE INDEX IF NOT EXISTS idx_purchases_order ON public.purchases(order_id);

-- 7. SEED DATA: Exactly TWO Plans (FREE & PRO)
INSERT INTO public.plans (plan_code, name, description, is_active)
VALUES
  ('FREE', 'AirCanvas Free', 'Default plan for every new user with essential drawing and connectivity features.', true),
  ('PRO', 'AirCanvas Pro', 'Paid subscription unlocking advanced calibration, multi-monitor display, and studio settings.', true)
ON CONFLICT (plan_code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Seed Plan Features
DO $$
DECLARE
  free_plan_id UUID;
  pro_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE plan_code = 'FREE';
  SELECT id INTO pro_plan_id FROM public.plans WHERE plan_code = 'PRO';

  -- FREE Features (Restricted)
  INSERT INTO public.plan_features (plan_id, feature_key, feature_value) VALUES
    (free_plan_id, 'basic_drawing', 'true'::jsonb),
    (free_plan_id, 'advanced_calibration', 'false'::jsonb),
    (free_plan_id, 'multi_monitor', 'false'::jsonb),
    (free_plan_id, 'advanced_settings', 'false'::jsonb),
    (free_plan_id, 'high_polling_rate', 'false'::jsonb),
    (free_plan_id, 'ultra_low_latency', 'false'::jsonb)
  ON CONFLICT (plan_id, feature_key) DO UPDATE
  SET feature_value = EXCLUDED.feature_value;

  -- PRO Features (Full access)
  INSERT INTO public.plan_features (plan_id, feature_key, feature_value) VALUES
    (pro_plan_id, 'basic_drawing', 'true'::jsonb),
    (pro_plan_id, 'advanced_calibration', 'true'::jsonb),
    (pro_plan_id, 'multi_monitor', 'true'::jsonb),
    (pro_plan_id, 'advanced_settings', 'true'::jsonb),
    (pro_plan_id, 'high_polling_rate', 'true'::jsonb),
    (pro_plan_id, 'ultra_low_latency', 'true'::jsonb)
  ON CONFLICT (plan_id, feature_key) DO UPDATE
  SET feature_value = EXCLUDED.feature_value;
END $$;

-- 8. ENTITLEMENT FUNCTION (Source of Truth)
-- Returns exact entitlement object:
-- PRO user: { "plan": "PRO", "status": "ACTIVE", "expiresAt": "...", "features": { ... } }
-- FREE user: { "plan": "FREE", "status": "ACTIVE", "features": { ... } }
CREATE OR REPLACE FUNCTION public.get_user_entitlements(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_features JSONB := '{}'::jsonb;
  v_free_plan_id UUID;
  v_rec RECORD;
BEGIN
  -- 1. Check for active PRO subscription
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
    -- Build feature map for PRO
    FOR v_rec IN
      SELECT feature_key, feature_value
      FROM public.plan_features
      WHERE plan_id = v_sub.plan_id
    LOOP
      -- Convert snake_case to camelCase for client JSON consumption
      IF v_rec.feature_key = 'basic_drawing' THEN
        v_features := jsonb_set(v_features, '{basicDrawing}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'advanced_calibration' THEN
        v_features := jsonb_set(v_features, '{advancedCalibration}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'multi_monitor' THEN
        v_features := jsonb_set(v_features, '{multiMonitor}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'advanced_settings' THEN
        v_features := jsonb_set(v_features, '{advancedSettings}', v_rec.feature_value);
      ELSE
        v_features := jsonb_set(v_features, ARRAY[v_rec.feature_key], v_rec.feature_value);
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'plan', 'PRO',
      'status', v_sub.status,
      'expiresAt', to_char(v_sub.current_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'features', v_features
    );
  ELSE
    -- 2. Fallback to default FREE plan
    SELECT id INTO v_free_plan_id FROM public.plans WHERE plan_code = 'FREE' LIMIT 1;

    FOR v_rec IN
      SELECT feature_key, feature_value
      FROM public.plan_features
      WHERE plan_id = v_free_plan_id
    LOOP
      IF v_rec.feature_key = 'basic_drawing' THEN
        v_features := jsonb_set(v_features, '{basicDrawing}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'advanced_calibration' THEN
        v_features := jsonb_set(v_features, '{advancedCalibration}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'multi_monitor' THEN
        v_features := jsonb_set(v_features, '{multiMonitor}', v_rec.feature_value);
      ELSIF v_rec.feature_key = 'advanced_settings' THEN
        v_features := jsonb_set(v_features, '{advancedSettings}', v_rec.feature_value);
      ELSE
        v_features := jsonb_set(v_features, ARRAY[v_rec.feature_key], v_rec.feature_value);
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'plan', 'FREE',
      'status', 'ACTIVE',
      'features', v_features
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. SUPABASE AUTH INTEGRATION TRIGGER
-- When a user registers in Supabase auth.users, create their record in public.users automatically
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Plans & Features are publicly readable
CREATE POLICY "Allow public read on plans" ON public.plans FOR SELECT USING (true);
CREATE POLICY "Allow public read on plan_features" ON public.plan_features FOR SELECT USING (true);

-- Users can read and update their own user record
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Users can read their own subscriptions and purchases
CREATE POLICY "Users can read own subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own purchases" ON public.purchases FOR SELECT USING (auth.uid() = user_id);
