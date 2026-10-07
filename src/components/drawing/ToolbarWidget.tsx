import React, { useState } from 'react';
import {
  Pen,
  Pencil,
  Paintbrush,
  Highlighter,
  Eraser,
  Undo2,
  Trash2,
  Settings2,
  Sliders,
  ChevronDown,
  ChevronUp,
  PowerOff,
  MoveRight,
  MoveLeft,
  Crosshair,
  Maximize2,
  Laptop,
  Flame,
  Radio,
} from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { BrushMode, PrecisionMode, PressureCurveType, WritingScalePreset } from '../../types/index.ts';

interface ToolbarWidgetProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  onClose?: () => void;
}

const PRESET_COLORS = [
  '#00E5FF', // Cyan
  '#A855F7', // Purple
  '#22C55E', // Green
  '#F97316', // Orange
  '#EC4899', // Pink
  '#FFFFFF', // White
  '#FACC15', // Yellow
  '#EF4444', // Red
];

export const ToolbarWidget: React.FC<ToolbarWidgetProps> = ({ engine, connection, onClose }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const brush = engine.brushSettings;

  const handleToolSelect = (mode: BrushMode) => {
    engine.updateBrush({ mode });
    connection.sendBrushUpdate({ mode });
  };

  const handleColorSelect = (color: string) => {
    engine.updateBrush({ color });
    connection.sendBrushUpdate({ color });
  };

  const handleWidthChange = (val: number) => {
    engine.updateBrush({ baseWidth: val });
    connection.sendBrushUpdate({ baseWidth: val });
  };

  const handlePrecisionChange = (mode: PrecisionMode) => {
    engine.precisionMode = mode;
    engine.notify();
  };

  const handlePressureCurveChange = (curve: PressureCurveType) => {
    engine.pressureCurve = curve;
    engine.notify();
  };

  const handleWritingScaleChange = (scale: WritingScalePreset) => {
    engine.writingScale = scale;
    engine.notify();
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-2 pb-2">
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl p-2.5 transition-all text-slate-100">
        {/* Main Toolbar Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Tool Modes */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              type="button"
              onClick={() => handleToolSelect('pen')}
              title="Ballpoint Pen"
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                brush.mode === 'pen'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Pen className="w-4 h-4" />
              <span className="hidden sm:inline">Pen</span>
            </button>

            <button
              type="button"
              onClick={() => handleToolSelect('pencil')}
              title="Graphite Pencil"
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                brush.mode === 'pencil'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Pencil</span>
            </button>

            <button
              type="button"
              onClick={() => handleToolSelect('brush')}
              title="Artist Brush"
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                brush.mode === 'brush'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Paintbrush className="w-4 h-4" />
              <span className="hidden sm:inline">Brush</span>
            </button>

            <button
              type="button"
              onClick={() => handleToolSelect('highlighter')}
              title="Fluorescent Highlighter"
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                brush.mode === 'highlighter'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Highlighter className="w-4 h-4" />
              <span className="hidden sm:inline">Highlight</span>
            </button>

            <button
              type="button"
              onClick={() => handleToolSelect('eraser')}
              title="Eraser Tip"
              className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                brush.mode === 'eraser'
                  ? 'bg-rose-500 text-white font-bold shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Eraser className="w-4 h-4" />
              <span className="hidden sm:inline">Eraser</span>
            </button>
          </div>

          {/* Color Swatches */}
          {brush.mode !== 'eraser' && (
            <div className="flex items-center gap-1.5 px-1.5 py-1 bg-slate-800/80 rounded-xl border border-slate-700/50">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleColorSelect(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-all border ${
                    brush.color === c
                      ? 'scale-110 border-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                      : 'border-transparent opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                />
              ))}
              <input
                type="color"
                value={brush.color}
                onChange={(e) => handleColorSelect(e.target.value)}
                className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0 p-0 overflow-hidden"
                title="Custom color"
              />
            </div>
          )}

          {/* Stroke Width Slider */}
          <div className="hidden md:flex items-center gap-2 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700/50 text-xs">
            <span className="text-slate-400 font-mono text-[11px] w-6 text-right">
              {brush.baseWidth.toFixed(1)}
            </span>
            <input
              type="range"
              min="1"
              max="32"
              step="0.5"
              value={brush.baseWidth}
              onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
              className="w-20 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Action buttons (Undo, Clear, Presentation actions) */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              type="button"
              onClick={() => {
                engine.undo();
                connection.sendAction('undo');
              }}
              title="Undo last stroke"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                engine.clearCanvas();
                connection.sendAction('clear');
              }}
              title="Clear entire canvas"
              className="p-2 text-slate-300 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                connection.sendAction('pageUp');
              }}
              title="Previous Slide (Page Up on PC)"
              className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <MoveLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                connection.sendAction('pageDown');
              }}
              title="Next Slide (Page Down on PC)"
              className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <MoveRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              title="Calibration & Settings"
              className={`p-2 rounded-lg transition-colors ${
                showAdvanced
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {connection.state === 'connected' && (
              <button
                type="button"
                onClick={() => connection.disconnect()}
                title="Disconnect from PC"
                className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <PowerOff className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Advanced Calibration Panel */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Precision & Filter */}
            <div className="space-y-1.5 bg-slate-800/40 p-2 rounded-lg border border-slate-700/30">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Jitter & Smoothing Filter
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handlePrecisionChange('proAdaptive')}
                  className={`px-2 py-1 rounded text-left font-medium ${
                    engine.precisionMode === 'proAdaptive'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'text-slate-300 hover:bg-slate-700/40'
                  }`}
                >
                  ⚡ 1-Euro Adaptive (Zero-Lag)
                </button>
                <button
                  type="button"
                  onClick={() => handlePrecisionChange('rawDirect')}
                  className={`px-2 py-1 rounded text-left font-medium ${
                    engine.precisionMode === 'rawDirect'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'text-slate-300 hover:bg-slate-700/40'
                  }`}
                >
                  🎯 Direct Raw (No Filter)
                </button>
                <button
                  type="button"
                  onClick={() => handlePrecisionChange('studioSmooth')}
                  className={`px-2 py-1 rounded text-left font-medium ${
                    engine.precisionMode === 'studioSmooth'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'text-slate-300 hover:bg-slate-700/40'
                  }`}
                >
                  🎨 Studio Art Stabilizer
                </button>
              </div>
            </div>

            {/* Pressure Curve Calibration */}
            <div className="space-y-1.5 bg-slate-800/40 p-2 rounded-lg border border-slate-700/30">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Stylus Pressure Curve
              </span>
              <div className="grid grid-cols-2 gap-1">
                {(['standard', 'soft', 'firm', 'sCurve'] as PressureCurveType[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handlePressureCurveChange(c)}
                    className={`px-2 py-1 rounded text-center capitalize font-medium ${
                      engine.pressureCurve === c
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                        : 'text-slate-300 hover:bg-slate-700/40'
                    }`}
                  >
                    {c === 'soft' ? 'Soft (γ 0.7)' : c === 'firm' ? 'Firm (γ 1.4)' : c === 'sCurve' ? 'S-Curve' : 'Linear 1:1'}
                  </button>
                ))}
              </div>
              <div className="pt-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Sensitivity</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={brush.pressureSensitivity}
                  onChange={(e) =>
                    engine.updateBrush({ pressureSensitivity: parseFloat(e.target.value) })
                  }
                  className="w-24 accent-cyan-400"
                />
              </div>
            </div>

            {/* Scale Presets & Geometry */}
            <div className="space-y-1.5 bg-slate-800/40 p-2 rounded-lg border border-slate-700/30">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Handwriting Scale (on PC)
              </span>
              <div className="flex gap-1">
                {(['compact', 'medium', 'full'] as WritingScalePreset[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleWritingScaleChange(s)}
                    className={`flex-1 py-1 rounded text-center capitalize font-medium ${
                      engine.writingScale === s
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                        : 'text-slate-300 hover:bg-slate-700/40'
                    }`}
                  >
                    {s === 'compact' ? '50%' : s === 'medium' ? '75%' : '100%'}
                  </button>
                ))}
              </div>
              <div className="pt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Anchor</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      engine.writingAnchor = 'topLeft';
                      engine.notify();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      engine.writingAnchor === 'topLeft'
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Top-Left
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      engine.writingAnchor = 'center';
                      engine.notify();
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      engine.writingAnchor === 'center'
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Center
                  </button>
                </div>
              </div>
            </div>

            {/* Display & Guides */}
            <div className="space-y-1.5 bg-slate-800/40 p-2 rounded-lg border border-slate-700/30">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Guides & Telemetry
              </span>
              <div className="space-y-1">
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Center Target Reticle</span>
                  <input
                    type="checkbox"
                    checked={engine.showCenterGuide}
                    onChange={(e) => {
                      engine.showCenterGuide = e.target.checked;
                      engine.notify();
                    }}
                    className="accent-cyan-400 w-3.5 h-3.5 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Lead-Point Prediction</span>
                  <input
                    type="checkbox"
                    checked={engine.enablePrediction}
                    onChange={(e) => {
                      engine.enablePrediction = e.target.checked;
                      engine.notify();
                    }}
                    className="accent-cyan-400 w-3.5 h-3.5 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                  <span>Performance HUD</span>
                  <input
                    type="checkbox"
                    checked={engine.showPerformanceHUD}
                    onChange={(e) => {
                      engine.showPerformanceHUD = e.target.checked;
                      engine.notify();
                    }}
                    className="accent-cyan-400 w-3.5 h-3.5 rounded"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
