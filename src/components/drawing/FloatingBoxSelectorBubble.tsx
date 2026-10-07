import React, { useState } from 'react';
import { Crop, Crosshair, Sparkles, X, Check } from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';

interface FloatingBoxSelectorBubbleProps {
  engine: DrawingEngine;
}

export const FloatingBoxSelectorBubble: React.FC<FloatingBoxSelectorBubbleProps> = ({ engine }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Custom Drawing Box & Snipping Tool"
        className={`w-9 h-9 rounded-full flex items-center justify-center border shadow-lg transition-all ${
          engine.customBoxEnabled
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.4)]'
            : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-cyan-500/50'
        }`}
      >
        <Crop className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-11 right-0 w-64 bg-slate-900/95 border border-cyan-500/30 rounded-xl p-3 shadow-2xl backdrop-blur-md z-50 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" /> Drawing Area Box
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-slate-300">Enable Custom Box</span>
              <input
                type="checkbox"
                checked={engine.customBoxEnabled}
                onChange={(e) => {
                  engine.customBoxEnabled = e.target.checked;
                  engine.notify();
                }}
                className="accent-cyan-400 w-4 h-4 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-slate-300">Map Box to Full PC</span>
              <input
                type="checkbox"
                checked={engine.boxMapsToFullScreen}
                onChange={(e) => {
                  engine.boxMapsToFullScreen = e.target.checked;
                  engine.notify();
                }}
                className="accent-cyan-400 w-4 h-4 rounded"
              />
            </label>

            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Presets</span>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    engine.customBoxEnabled = true;
                    engine.setCustomBoxPreset('centeredLarge');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700/80 text-left"
                >
                  Centered (80%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.customBoxEnabled = true;
                    engine.setCustomBoxPreset('topHalf');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700/80 text-left"
                >
                  Top Half
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.customBoxEnabled = true;
                    engine.setCustomBoxPreset('bottomHalf');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700/80 text-left"
                >
                  Bottom Half
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.customBoxEnabled = true;
                    engine.setCustomBoxPreset('cornerCompact');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700/80 text-left"
                >
                  Compact Corner
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                engine.customBoxEnabled = true;
                engine.isSnippingBox = true;
                setIsOpen(false);
                engine.notify();
              }}
              className="w-full mt-2 py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-slate-900 font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
            >
              <Crop className="w-3.5 h-3.5" /> Drag & Snipe New Area
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
