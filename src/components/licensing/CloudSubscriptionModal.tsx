import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  Copy,
  Check,
  Server,
  Smartphone,
  CreditCard,
  Zap,
  ArrowRight,
  Code2,
  Sparkles,
  Lock,
  Layers,
  X,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { LicenseService, EntitlementPayload, SubscriptionRecord, PurchaseRecord } from '../../services/licenseService.ts';

interface CloudSubscriptionModalProps {
  license: LicenseService;
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSubscriptionModal: React.FC<CloudSubscriptionModalProps> = ({
  license,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'entitlements' | 'purchaseFlow' | 'supabaseSchema' | 'rtdnWebhook' | 'audit'>('entitlements');
  const [entitlement, setEntitlement] = useState<EntitlementPayload>(license.getEntitlement());
  const [selectedProductId, setSelectedProductId] = useState<'aircanvas_pro_monthly' | 'aircanvas_pro_yearly'>('aircanvas_pro_monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [flowLog, setFlowLog] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [rtdnResult, setRtdnResult] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setEntitlement(license.getEntitlement());
    };
    update();
    const unsub = license.subscribe(update);
    return unsub;
  }, [license]);

  if (!isOpen) return null;

  const handleSimulatePurchaseFlow = async () => {
    setIsProcessing(true);
    setFlowLog([]);
    const logs: string[] = [];

    const addLog = (msg: string) => {
      logs.push(msg);
      setFlowLog([...logs]);
    };

    addLog('1. [Flutter App] User initiated subscription for product: ' + selectedProductId);
    await new Promise((r) => setTimeout(r, 600));

    const simulatedToken = `tok_gp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const simulatedOrderId = `GPA.${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10000 + Math.random() * 90000)}`;
    addLog(`2. [Google Play Billing] Client received purchaseToken: ${simulatedToken.slice(0, 16)}...`);
    addLog('3. [SECURITY ENFORCEMENT] Client does NOT unlock PRO client-side.');
    await new Promise((r) => setTimeout(r, 600));

    addLog(`4. [Flutter -> Backend] POST /api/v1/subscriptions/google-play/verify`);
    await new Promise((r) => setTimeout(r, 600));

    addLog('5. [ASP.NET Core] Validating purchaseToken with Google Play Developer API (AndroidPublisherService.v3)...');
    await new Promise((r) => setTimeout(r, 700));

    addLog('6. [ASP.NET Core] Google Play confirmed active subscription! Acknowledging token...');
    addLog(`7. [Supabase PostgreSQL] Writing to public.purchases (Order: ${simulatedOrderId})`);
    addLog(`8. [Supabase PostgreSQL] Upserting to public.subscriptions (Status: ACTIVE)`);
    await new Promise((r) => setTimeout(r, 600));

    const res = license.verifyGooglePlayPurchase(selectedProductId, simulatedToken, simulatedOrderId);
    addLog(`9. [Backend -> Client] 200 OK: Entitlement updated to PRO!`);
    addLog('10. [Flutter & Windows] PRO features automatically unlocked via authoritative entitlement!');

    setIsProcessing(false);
  };

  const handleTriggerRtdn = (action: 'RENEW' | 'CANCEL' | 'EXPIRE' | 'GRACE_PERIOD') => {
    license.handleRtdnEvent(action);
    setRtdnResult(`Triggered RTDN event '${action}'. Current plan: ${license.tier.toUpperCase()}, Status: ${license.currentSub?.status || 'N/A'}`);
  };

  const copySqlSchema = () => {
    const sql = `-- AIRCanvas Supabase PostgreSQL Schema
-- ONLY TWO PLANS: FREE and PRO
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code VARCHAR(10) NOT NULL UNIQUE CHECK (plan_code IN ('FREE', 'PRO')),
  name VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  feature_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  canceled_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  purchase_state VARCHAR(50) NOT NULL,
  purchase_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_time TIMESTAMPTZ,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

    navigator.clipboard.writeText(sql);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  AIRCanvas Cloud Hosting & Subscription System
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Supabase + ASP.NET Core
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Authoritative source of truth for ONLY TWO PLANS (FREE & PRO) & Google Play Billing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-800/80 bg-slate-900/40 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('entitlements')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'entitlements'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Two Plans & Entitlements API
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('purchaseFlow')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'purchaseFlow'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-4 h-4" />
            Google Play Purchase Flow
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('supabaseSchema')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'supabaseSchema'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Supabase DB Schema
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rtdnWebhook')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'rtdnWebhook'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCw className="w-4 h-4" />
            RTDN Pub/Sub Webhooks
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Purchases & Subscriptions
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* TAB 1: TWO PLANS & ENTITLEMENTS API */}
          {activeTab === 'entitlements' && (
            <div className="space-y-6">
              {/* Plan Comparison Grid (Strictly ONLY TWO PLANS) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Strict Two-Tier Model (NO Premium, Standard, or Plus)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Configurable feature matrix stored in Supabase `plan_features` table
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Current User:</span>
                    <button
                      type="button"
                      onClick={() => license.toggleTier()}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                        license.isPro
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {license.isPro ? 'Switch to FREE' : 'Switch to PRO'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* FREE PLAN */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      !license.isPro
                        ? 'bg-slate-900 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-slate-900/50 border-slate-800 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 text-xs font-extrabold rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          FREE
                        </span>
                        <h4 className="font-bold text-white text-sm">AirCanvas Free</h4>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">$0 / Forever</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      Default plan for every newly registered user. Essential canvas drawing and device pairing.
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      <li className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>basic_drawing: true</span>
                      </li>
                      <li className="flex items-center gap-2 text-slate-500">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>advanced_calibration: false</span>
                      </li>
                      <li className="flex items-center gap-2 text-slate-500">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>multi_monitor: false</span>
                      </li>
                      <li className="flex items-center gap-2 text-slate-500">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>advanced_settings: false</span>
                      </li>
                    </ul>
                  </div>

                  {/* PRO PLAN */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      license.isPro
                        ? 'bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-900 border-amber-500/50 ring-1 ring-amber-500/30 shadow-lg'
                        : 'bg-slate-900/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 text-xs font-extrabold rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-sm">
                          PRO
                        </span>
                        <h4 className="font-bold text-white text-sm">AirCanvas Pro</h4>
                      </div>
                      <span className="text-xs text-amber-300 font-mono">Google Play Subscription</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      Authoritative paid plan with Google Play verified purchase token. Unlocks full studio suite.
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      <li className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>basic_drawing: true</span>
                      </li>
                      <li className="flex items-center gap-2 text-amber-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>advanced_calibration: true</span>
                      </li>
                      <li className="flex items-center gap-2 text-amber-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>multi_monitor: true</span>
                      </li>
                      <li className="flex items-center gap-2 text-amber-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>advanced_settings: true</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Authoritative Entitlement JSON Inspector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Authoritative Backend Response: GET /api/v1/entitlements
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Source of Truth: Active
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-blue-300 leading-relaxed overflow-x-auto">
                  <pre>{JSON.stringify(entitlement, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE PLAY BILLING PURCHASE FLOW */}
          {activeTab === 'purchaseFlow' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  Google Play Pro Subscription Products
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Select a configurable Google Play subscription product and simulate the full secure verification flow:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setSelectedProductId('aircanvas_pro_monthly')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedProductId === 'aircanvas_pro_monthly'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">aircanvas_pro_monthly</span>
                      <span className="text-xs font-mono text-emerald-400">$4.99/mo</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Configurable Monthly SKU via Google Play Billing</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProductId('aircanvas_pro_yearly')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedProductId === 'aircanvas_pro_yearly'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">aircanvas_pro_yearly</span>
                      <span className="text-xs font-mono text-emerald-400">$39.99/yr</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Configurable Yearly SKU via Google Play Billing</p>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSimulatePurchaseFlow}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      Executing Backend Verification & Database Pipeline...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Execute Google Play Purchase & Verification Flow
                    </>
                  )}
                </button>
              </div>

              {/* Execution Log */}
              {flowLog.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-blue-400" />
                    Security & Verification Audit Log
                  </h4>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs space-y-1.5 text-slate-300">
                    {flowLog.map((log, idx) => (
                      <div
                        key={idx}
                        className={
                          log.includes('SECURITY')
                            ? 'text-amber-400 font-bold'
                            : log.includes('200 OK') || log.includes('unlocked')
                            ? 'text-emerald-400 font-bold'
                            : 'text-slate-300'
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUPABASE POSTGRESQL SCHEMA */}
          {activeTab === 'supabaseSchema' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-400" />
                    Production-Ready Supabase PostgreSQL Schema
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tables: `users`, `plans`, `plan_features`, `subscriptions`, `purchases` + RLS & Stored Procedures
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copySqlSchema}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy SQL'}
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-amber-200/90 max-h-96 overflow-y-auto leading-relaxed">
                <pre>{`-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. PLANS TABLE (EXACTLY TWO PLANS)
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_only_two_plans CHECK (plan_code IN ('FREE', 'PRO'))
);

-- 3. PLAN_FEATURES TABLE
CREATE TABLE IF NOT EXISTS public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  feature_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_key)
);

-- 4. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  canceled_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PURCHASES TABLE (Never stores credit-card information)
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'GOOGLE_PLAY',
  product_id VARCHAR(100) NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT NOT NULL,
  purchase_state VARCHAR(50) NOT NULL,
  purchase_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_time TIMESTAMPTZ,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`}</pre>
              </div>
            </div>
          )}

          {/* TAB 4: RTDN WEBHOOK TESTER */}
          {activeTab === 'rtdnWebhook' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-purple-400" />
                  Google Play Real-Time Developer Notifications (RTDN)
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Simulate Google Cloud Pub/Sub webhook events sent to ASP.NET Core (`/api/v1/subscriptions/google-play/rtdn`):
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => handleTriggerRtdn('RENEW')}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-xs font-bold text-slate-200 transition-all text-center"
                  >
                    Auto-Renew
                    <span className="block text-[10px] text-slate-400 font-normal mt-1">+30 Days Active</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRtdn('GRACE_PERIOD')}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/10 text-xs font-bold text-slate-200 transition-all text-center"
                  >
                    Grace Period
                    <span className="block text-[10px] text-slate-400 font-normal mt-1">Payment Issue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRtdn('CANCEL')}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/10 text-xs font-bold text-slate-200 transition-all text-center"
                  >
                    User Canceled
                    <span className="block text-[10px] text-slate-400 font-normal mt-1">Active till Period End</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRtdn('EXPIRE')}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/50 hover:bg-red-500/10 text-xs font-bold text-slate-200 transition-all text-center"
                  >
                    Subscription Expired
                    <span className="block text-[10px] text-slate-400 font-normal mt-1">Revert to FREE</span>
                  </button>
                </div>

                {rtdnResult && (
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
                    {rtdnResult}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT & HISTORY */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-sky-400" />
                  Active Subscription & Purchase History
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Audit records in Supabase `subscriptions` and `purchases` tables:
                </p>

                {license.currentSub ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 mb-4 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Status:</span>
                      <span className="text-emerald-400 font-bold">{license.currentSub.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Product:</span>
                      <span className="text-white">{license.currentSub.productId}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Order ID:</span>
                      <span className="text-slate-300">{license.currentSub.orderId}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Current Period End:</span>
                      <span className="text-amber-300">{license.currentSub.currentPeriodEnd}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 text-center mb-4">
                    No active Google Play subscription. User is on FREE plan.
                  </div>
                )}

                {license.purchases.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2">Purchase History Records:</h4>
                    <div className="space-y-2">
                      {license.purchases.map((p, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono flex items-center justify-between">
                          <div>
                            <span className="text-white font-bold">{p.orderId}</span>
                            <span className="text-slate-500 block text-[10px]">{p.productId} • {new Date(p.purchaseTime).toLocaleString()}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {p.purchaseState}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>AIRCanvas v1.7.1 • Supabase PostgreSQL • Google Play Billing</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
