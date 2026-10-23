import React, { useState } from 'react';
import {
  Crown,
  CheckCircle2,
  XCircle,
  Zap,
  ShieldCheck,
  Key,
  Sparkles,
  ArrowRight,
  Monitor,
  Smartphone,
  Sliders,
  Download,
  Activity,
  X,
  Layers,
  Check,
} from 'lucide-react';
import { LicenseService, TierType } from '../../services/licenseService.ts';

interface ProUpgradeModalProps {
  license: LicenseService;
  isOpen: boolean;
  onClose: () => void;
}

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({ license, isOpen, onClose }) => {
  const [keyInput, setKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedBilling, setSelectedBilling] = useState<'lifetime' | 'monthly'>('lifetime');

  if (!isOpen) return null;

  const isPro = license.isPro;
  const features = license.features;

  const handleActivateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    const res = license.activatePro(keyInput);
    setKeyStatus(res);
    if (res.success) {
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const handleQuickUnlock = () => {
    const res = license.activatePro('AIRPRO-2026-STUDIO');
    setKeyStatus(res);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleSwitchToFree = () => {
    license.switchToFree();
    setKeyStatus({ success: true, message: 'Switched to Free Edition mode.' });
  };

  const comparisonRows = [
    {
      feature: 'Latency Performance',
      free: 'Standard (~25ms)',
      pro: 'Ultra-Low Latency Turbo (<4ms)',
      proHighlight: true,
    },
    {
      feature: 'Stylus Pressure Levels',
      free: '1024 Levels',
      pro: '8192 Levels + Bezier Curves',
      proHighlight: true,
    },
    {
      feature: 'Display Coordinate Mapping',
      free: 'Standard 1080p Single Canvas',
      pro: 'PerMonitorV2 Authoritative Pixel Engine (±0 px)',
      proHighlight: true,
    },
    {
      feature: 'High-DPI Scaling Support',
      free: 'Basic (100% only)',
      pro: 'Full High-DPI (125%, 150%, 175%, 200%)',
      proHighlight: true,
    },
    {
      feature: 'Multi-Monitor Switching',
      free: 'Primary Display Only',
      pro: 'All Displays, Extended & Windows',
      proHighlight: true,
    },
    {
      feature: 'Studio Vector & UHD Export',
      free: 'Standard PNG (72 DPI)',
      pro: 'Scalable SVG + 4K UHD PNG (300 DPI)',
      proHighlight: true,
    },
    {
      feature: '1-Euro Adaptive Filter',
      free: 'Fixed Smoothing',
      pro: 'Custom Beta & Frequency Cutoff Sliders',
      proHighlight: true,
    },
    {
      feature: 'Hardware Reticle & HUD',
      free: 'Basic FPS',
      pro: 'Full Microsecond & Jitter Telemetry HUD',
      proHighlight: true,
    },
    {
      feature: 'Watermark / Ads',
      free: 'None',
      pro: '100% Commercial Studio License',
      proHighlight: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in select-none overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#0A0D18] border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(0,229,255,0.2)] text-slate-100 flex flex-col p-4 sm:p-6">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.4)] text-slate-950 shrink-0">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Air Canvas Editions</h2>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                  isPro
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {isPro ? 'PRO ACTIVE' : 'FREE EDITION'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Compare features, activate your Pro Studio license, or switch live modes.
            </p>
          </div>
        </div>

        {/* Quick Tier Live Switcher (for immediate testing) */}
        <div className="my-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold">Active Mode:</span>
            <span
              className={`font-black uppercase tracking-wider ${
                isPro ? 'text-amber-400' : 'text-cyan-400'
              }`}
            >
              {isPro ? '★ Air Canvas Pro' : 'Air Canvas Free'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleSwitchToFree}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                !isPro
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Test Free Edition
            </button>
            <button
              type="button"
              onClick={handleQuickUnlock}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                isPro
                  ? 'bg-gradient-to-r from-amber-400 to-purple-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-amber-300 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Test Pro Edition (Turbo)
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Free Edition Card */}
          <div
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
              !isPro
                ? 'bg-slate-900/90 border-cyan-500/60 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                : 'bg-slate-900/40 border-slate-800 opacity-80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Basic Edition
                </span>
                {!isPro && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                    Current
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black text-white mt-1">Air Canvas Free</h3>
              <div className="text-2xl font-black text-white my-2">
                $0 <span className="text-xs text-slate-400 font-normal">/ forever</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Perfect for casual note-taking and basic stylus drawing with standard 1080p mapping.
              </p>
              <ul className="text-xs space-y-1.5 text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400" /> Standard 1024 Pressure Levels
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400" /> Standard Latency (~25ms)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400" /> 1-Euro Basic Smoothing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400" /> Standard PNG Canvas Export
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleSwitchToFree}
              className={`w-full mt-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                !isPro
                  ? 'bg-slate-800 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {!isPro ? 'Active Tier' : 'Switch to Free'}
            </button>
          </div>

          {/* Pro Edition Card */}
          <div
            className={`p-4 rounded-xl border relative overflow-hidden transition-all flex flex-col justify-between ${
              isPro
                ? 'bg-gradient-to-br from-purple-950/40 via-slate-900 to-amber-950/20 border-amber-400/70 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
                : 'bg-gradient-to-br from-purple-950/20 to-slate-900 border-purple-500/40 hover:border-amber-400/50'
            }`}
          >
            <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-l from-amber-400 to-pink-500 text-slate-950 font-black text-[10px] rounded-bl-xl shadow-md uppercase">
              Pro Studio
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Professional
                </span>
                {isPro && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black text-white mt-1">Air Canvas Pro</h3>
              <div className="text-2xl font-black text-white my-2 flex items-baseline gap-2">
                <span>$29.99</span>
                <span className="text-xs text-amber-400 font-bold">One-Time Lifetime</span>
                <span className="text-xs text-slate-400 line-through">$49.99</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                For digital artists, animators, and architects demanding 100% geometric accuracy.
              </p>
              <ul className="text-xs space-y-1.5 text-slate-200">
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Ultra-Low Latency Turbo (&lt;4ms)
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> 8192 Pressure Levels + Bezier Curves
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> High-DPI PerMonitorV2 Physical Lock
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Scalable SVG & 4K UHD 300 DPI Export
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Multi-Monitor Display Switching
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleQuickUnlock}
              className="w-full mt-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 hover:from-amber-300 hover:to-purple-500 text-slate-950 shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Crown className="w-4 h-4" />
              <span>{isPro ? 'Pro Active (Studio Unlocked)' : 'Unlock Air Canvas Pro Now'}</span>
            </button>
          </div>
        </div>

        {/* Feature Comparison Matrix Table */}
        <div className="mt-2 mb-4 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-white">
            <span>Detailed Feature Comparison</span>
            <span className="text-[10px] text-slate-400">Air Canvas 2026 Engine</span>
          </div>
          <div className="divide-y divide-slate-800/80 text-xs">
            {comparisonRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 p-2 hover:bg-slate-800/30 items-center">
                <span className="col-span-5 font-semibold text-slate-300 text-[11px]">
                  {row.feature}
                </span>
                <span className="col-span-3 text-slate-400 text-[10px]">{row.free}</span>
                <span
                  className={`col-span-4 text-[10px] font-bold ${
                    row.proHighlight ? 'text-amber-300' : 'text-slate-200'
                  }`}
                >
                  {row.pro}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Enter License Key Section */}
        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
          <form onSubmit={handleActivateKey} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter License Key (e.g. AIRPRO-2026-TURBO)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shrink-0 transition-colors flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Activate Key</span>
            </button>
          </form>

          {keyStatus && (
            <div
              className={`mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                keyStatus.success
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              }`}
            >
              {keyStatus.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{keyStatus.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
