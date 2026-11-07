import React, { useState } from 'react';
import {
  Pen,
  Pencil,
  Paintbrush,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Sliders,
  ChevronDown,
  Activity,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { BrushMode, PrecisionMode, PressureCurveType } from '../../types/index.ts';

interface ToolbarWidgetProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  onClose?: () => void;
  dockPosition?: 'bottom' | 'top';
  onToggleDockPosition?: () => void;
}

const PRESET_COLORS = [
  '#00E5FF',
  '#A855F7',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#FACC15',
  '#FFFFFF',
];

export const ToolbarWidget: React.FC<ToolbarWidgetProps> = ({
  engine,
  connection,
  onClose,
  dockPosition = 'bottom',
  onToggleDockPosition,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const brush = engine.brushSettings;

  const handleToolSelect = (mode: BrushMode) => {
    engine.updateBrush({ mode });
    connection.sendBrushUpdate({ mode });
    connection.sendAction(mode === 'eraser' ? 'eraserShortcut' : 'brushShortcut');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(8);
      } catch {}
    }
  };

  const handleColorSelect = (color: string) => {
    const nextMode: BrushMode = brush.mode === 'eraser' ? 'pen' : brush.mode;
    engine.updateBrush({ color, mode: nextMode });
    connection.sendBrushUpdate({ color, mode: nextMode });
    if (brush.mode === 'eraser') {
      connection.sendAction('brushShortcut');
    }
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

  const handlePressureSmoothingToggle = () => {
    engine.enablePressureSmoothing = !engine.enablePressureSmoothing;
    engine.notify();
  };

  const handleAlphaChange = (alpha: number) => {
    engine.pressureSmoothingAlpha = alpha;
    engine.notify();
  };

  return (
    <div className="w-full bg-slate-950/95 border-t border-b border-slate-800/90 backdrop-blur-xl px-2 sm:px-4 py-1.5 text-slate-100 shadow-2xl">
      <div className="max-w-7xl mx-auto">
        {/* Single-Row Responsive Fixed Toolbar Layer — Scrollable horizontally on ultra-small screens, centered/distributed on Mobile Landscape & PC */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 overflow-x-auto no-scrollbar">
          {/* Group 1: Drawing Tools (Pen, Pencil, Brush, Marker, Eraser) */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleToolSelect('pen');
              }}
              onClick={() => handleToolSelect('pen')}
              title="Pen (Shortcut: B)"
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 touch-manipulation ${
                brush.mode === 'pen'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Pen className="w-3.5 h-3.5 shrink-0" />
              <span>Pen</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleToolSelect('pencil');
              }}
              onClick={() => handleToolSelect('pencil')}
              title="Pencil"
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 touch-manipulation ${
                brush.mode === 'pencil'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              <span>Pencil</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleToolSelect('brush');
              }}
              onClick={() => handleToolSelect('brush')}
              title="Brush"
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 touch-manipulation ${
                brush.mode === 'brush'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5 shrink-0" />
              <span>Brush</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleToolSelect('highlighter');
              }}
              onClick={() => handleToolSelect('highlighter')}
              title="Highlighter / Marker"
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 touch-manipulation ${
                brush.mode === 'highlighter'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5 shrink-0" />
              <span>Marker</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleToolSelect('eraser');
              }}
              onClick={() => handleToolSelect('eraser')}
              title="Pixel Eraser (Shortcut: E)"
              className={`h-8 px-2.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 touch-manipulation ${
                brush.mode === 'eraser'
                  ? 'bg-rose-500 text-white font-bold shadow-[0_0_12px_rgba(244,63,94,0.5)] ring-1 ring-rose-300'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Eraser className="w-3.5 h-3.5 shrink-0" />
              <span>Erase</span>
            </button>
          </div>

          {/* Group 2: Color Swatches & Custom Color Picker */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/90 rounded-xl border border-slate-800 h-10 shrink-0">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleColorSelect(c);
                }}
                onClick={() => handleColorSelect(c)}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-transform shrink-0 border touch-manipulation ${
                  brush.mode !== 'eraser' && brush.color === c
                    ? 'scale-115 border-white shadow-[0_0_6px_rgba(255,255,255,0.7)]'
                    : 'border-transparent opacity-85 hover:opacity-100'
                }`}
                title={`Color ${c}`}
              />
            ))}
            <input
              type="color"
              value={brush.color}
              onChange={(e) => handleColorSelect(e.target.value)}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-full cursor-pointer bg-transparent border-0 p-0 shrink-0"
              title="Custom Color"
            />
          </div>

          {/* Group 3: Stroke Thickness Slider with Live Preview */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 h-10 text-xs shrink-0">
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              <span
                style={{
                  width: `${Math.max(3, Math.min(14, brush.baseWidth))}px`,
                  height: `${Math.max(3, Math.min(14, brush.baseWidth))}px`,
                  backgroundColor: brush.mode === 'eraser' ? '#F43F5E' : brush.color,
                }}
                className="rounded-full inline-block transition-all"
              />
            </span>
            <input
              type="range"
              min="1"
              max="24"
              step="0.5"
              value={brush.baseWidth}
              onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
              className="w-16 sm:w-24 accent-cyan-400 cursor-pointer"
              title="Brush Size"
            />
            <span className="text-slate-300 font-mono tabular-nums text-[11px] w-7 text-right">
              {brush.baseWidth.toFixed(1)}
            </span>
          </div>

          {/* Group 4: Pressure Smoothing Quick Toggle */}
          <button
            type="button"
            onClick={handlePressureSmoothingToggle}
            title="Toggle EMA + Moving Average Pressure Smoothing"
            className={`h-10 px-2.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              engine.enablePressureSmoothing
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Smooth {engine.enablePressureSmoothing ? 'ON' : 'OFF'}</span>
          </button>

          {/* Group 5: Essential Actions (Undo, Redo, Clear, Smoothing Settings, Dock Switch, Hide) */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                engine.undo();
                connection.sendAction('undo');
              }}
              title="Undo"
              className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                engine.redo();
              }}
              title="Redo"
              className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                engine.clearCanvas();
                connection.sendAction('clear');
              }}
              title="Clear Canvas"
              className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              title="Stroke & Pressure Smoothing Settings"
              className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                showSettings
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {onToggleDockPosition && (
              <button
                type="button"
                onClick={onToggleDockPosition}
                title={
                  dockPosition === 'bottom'
                    ? 'Move Toolbar Layer to Top'
                    : 'Move Toolbar Layer to Bottom'
                }
                className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
              >
                {dockPosition === 'bottom' ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Minimize Toolbar Layer"
                className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    dockPosition === 'top' ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Row: Smoothing & Pressure Curve Settings (Automatically updates fixed layer height so canvas never overlaps) */}
        {showSettings && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/90 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar text-xs">
            {/* Coordinate Filter */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 shrink-0">
              <span className="text-slate-400 font-semibold text-[11px] whitespace-nowrap">
                Filter:
              </span>
              <div className="flex gap-1">
                {(
                  [
                    { id: 'proAdaptive', label: '1€ Adaptive' },
                    { id: 'studioSmooth', label: 'Moving Avg' },
                    { id: 'rawDirect', label: 'Raw' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePrecisionChange(m.id)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      engine.precisionMode === m.id
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white bg-slate-950'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pressure EMA Strength */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 shrink-0">
              <span className="text-slate-400 font-semibold text-[11px] whitespace-nowrap">
                EMA:
              </span>
              <div className="flex gap-1">
                {(
                  [
                    { alpha: 0.18, label: 'Ultra Smooth' },
                    { alpha: 0.28, label: 'Balanced' },
                    { alpha: 0.5, label: 'Fast' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      engine.enablePressureSmoothing = true;
                      handleAlphaChange(preset.alpha);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      engine.enablePressureSmoothing &&
                      Math.abs(engine.pressureSmoothingAlpha - preset.alpha) < 0.05
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white bg-slate-950'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pressure Curve */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 shrink-0">
              <span className="text-slate-400 font-semibold text-[11px] whitespace-nowrap">
                Curve:
              </span>
              <div className="flex gap-1">
                {(
                  [
                    { id: 'standard', label: 'Linear' },
                    { id: 'soft', label: 'Soft' },
                    { id: 'firm', label: 'Firm' },
                    { id: 'sCurve', label: 'S-Curve' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handlePressureCurveChange(c.id)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      engine.pressureCurve === c.id
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white bg-slate-950'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
