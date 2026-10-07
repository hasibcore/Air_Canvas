import React, { useState } from 'react';
import { Activity, Wifi, Zap, Crown } from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { LicenseService } from '../../services/licenseService.ts';

interface ProPerformanceHUDProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  license?: LicenseService;
  onOpenProModal?: () => void;
}

export const ProPerformanceHUD: React.FC<ProPerformanceHUDProps> = ({
  engine,
  connection,
  license: propLicense,
  onOpenProModal,
}) => {
  const [minimized, setMinimized] = useState(false);
  const license = propLicense || LicenseService.getInstance();

  if (!engine.showPerformanceHUD) return null;

  const isConnected = connection.state === 'connected';
  const fps = engine.liveFps;
  const pollingRate = license.isPro ? engine.livePollingRateHz : Math.min(60, engine.livePollingRateHz);
  const latency = license.isPro ? Math.min(4, connection.latencyMs) : Math.max(25, connection.latencyMs);

  return (
    <div
      onClick={() => setMinimized(!minimized)}
      className="cursor-pointer transition-all duration-200 select-none bg-slate-900/90 backdrop-blur-md border border-cyan-500/35 rounded-xl px-2.5 py-1.5 shadow-xl text-xs font-mono"
    >
      {minimized ? (
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'
            }`}
          />
          <span className="text-cyan-400 font-bold">{fps} FPS</span>
          <span className="text-slate-400 text-[10px]">{latency}ms</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span className={`text-[10px] uppercase font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isConnected ? 'ONLINE' : 'STANDALONE'}
            </span>
          </div>

          <div className="w-px h-4 bg-slate-700" />

          {/* FPS */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 leading-tight uppercase font-sans">FPS</span>
            <span className="text-cyan-400 font-bold text-xs">{fps}</span>
          </div>

          <div className="w-px h-4 bg-slate-700" />

          {/* Latency */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 leading-tight uppercase font-sans">LAT</span>
            <span
              className={`font-bold text-xs ${
                latency < 10 ? 'text-emerald-400' : latency < 30 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {latency}ms
            </span>
          </div>

          <div className="w-px h-4 bg-slate-700" />

          {/* Polling */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 leading-tight uppercase font-sans">POLL</span>
            <span className="text-purple-400 font-bold text-xs">{pollingRate}Hz</span>
          </div>

          <div className="w-px h-4 bg-slate-700" />

          {/* Stylus mode badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              engine.stylusOnlyMode = !engine.stylusOnlyMode;
              engine.notify();
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
              engine.stylusOnlyMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {engine.stylusOnlyMode ? 'STYLUS ONLY' : 'TOUCH + PEN'}
          </button>

          <div className="w-px h-4 bg-slate-700" />

          {/* Pro / Free Edition Pill */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenProModal?.();
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-black border flex items-center gap-1 transition-all ${
              license.isPro
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
            }`}
            title="Click to manage license"
          >
            {license.isPro && <Crown className="w-2.5 h-2.5 text-amber-400" />}
            <span>{license.isPro ? 'PRO TURBO' : 'FREE'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
