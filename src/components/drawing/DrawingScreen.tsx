import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  Laptop,
  Smartphone,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Crosshair,
  Zap,
  X,
  RefreshCw,
  Activity,
  Gauge,
  MoveHorizontal,
  RotateCw,
  EyeOff,
  Eye,
  AppWindow,
  HardDrive,
  Eraser,
  Pen,
} from 'lucide-react';
import { DrawingEngine, PC_SOFTWARE_PROFILES } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { DrawingCanvas } from '../canvas/DrawingCanvas.tsx';
import { ToolbarWidget } from './ToolbarWidget.tsx';
import { GoogleDriveModal } from '../drive/GoogleDriveModal.tsx';

interface DrawingScreenProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  onExit: () => void;
  onOpenTestSuite?: () => void;
}

type RotationMode = 'auto' | 90 | -90 | 0;

export const DrawingScreen: React.FC<DrawingScreenProps> = ({
  engine,
  connection,
  onExit,
  onOpenTestSuite,
}) => {
  const [showToolbar, setShowToolbar] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [showSoftwareBar, setShowSoftwareBar] = useState(false);
  const [toolbarDock, setToolbarDock] = useState<'bottom' | 'top'>('bottom');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Automatic Landscape Rotation by default:
  // When viewport is portrait (height > width), 'auto' automatically rotates 90° into Landscape
  const [rotationMode, setRotationMode] = useState<RotationMode>('auto');
  const [autoDirection, setAutoDirection] = useState<90 | -90>(90);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  });

  const [showPairModal, setShowPairModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [pairPin, setPairPin] = useState(connection.pairingPin || '1234');
  const [isPairing, setIsPairing] = useState(false);
  const [wideScrollableMode, setWideScrollableMode] = useState(false);
  const [canvasScrollX, setCanvasScrollX] = useState(0);
  const [, setTick] = useState(0);

  // Fixed-position layer refs and dynamic non-overlapping insets
  const topLayerRef = useRef<HTMLElement | null>(null);
  const bottomLayerRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [topInset, setTopInset] = useState<number>(44);
  const [bottomInset, setBottomInset] = useState<number>(54);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? Math.max(200, window.innerHeight - 98) : 620,
  });

  const isPortraitViewport = viewportSize.h > viewportSize.w;

  // Effective CSS rotation angle:
  // In 'auto' mode, portrait screens (mobile/tablet held vertically or with portrait lock)
  // automatically rotate 90° into horizontal landscape. PC or already-landscape screens stay 0°.
  const effectiveRotationDeg: 0 | 90 | -90 =
    rotationMode === 'auto'
      ? isPortraitViewport
        ? autoDirection
        : 0
      : rotationMode;

  // Subscribe to connection and engine changes
  useEffect(() => {
    const unsubConn = connection.subscribe(() => setTick((t) => t + 1));
    const unsubEng = engine.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsubConn();
      unsubEng();
    };
  }, [connection, engine]);

  // Attempt native screen landscape lock when available on mobile fullscreen, with CSS auto-rotation fallback
  useEffect(() => {
    if (isPortraitViewport && rotationMode === 'auto') {
      try {
        const scr = window.screen as Screen & {
          orientation?: { lock?: (orientation: string) => Promise<void> };
        };
        scr?.orientation?.lock?.('landscape')?.catch(() => {});
      } catch {
        // Handled seamlessly by CSS 90° auto-rotation
      }
    }
  }, [isPortraitViewport, rotationMode]);

  // Continuously measure Fixed Top Toolbar Layer, Fixed Bottom Toolbar Layer, and Disjoint Canvas Stage Layer
  // so drawing controls and canvas elements NEVER overlap on any mobile or PC screen size
  useEffect(() => {
    const updateGeometry = () => {
      if (typeof window !== 'undefined') {
        setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      }

      const measuredTop = topLayerRef.current ? topLayerRef.current.offsetHeight : 0;
      const measuredBottom = bottomLayerRef.current ? bottomLayerRef.current.offsetHeight : 0;

      setTopInset(measuredTop);
      setBottomInset(measuredBottom);

      if (stageRef.current) {
        const w = stageRef.current.clientWidth;
        const h = stageRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setStageSize({ width: w, height: h });
          return;
        }
      }

      if (typeof window !== 'undefined') {
        const totalW = effectiveRotationDeg !== 0 ? window.innerHeight : window.innerWidth;
        const totalH = effectiveRotationDeg !== 0 ? window.innerWidth : window.innerHeight;
        setStageSize({
          width: Math.max(120, totalW),
          height: Math.max(120, totalH - measuredTop - measuredBottom),
        });
      }
    };

    updateGeometry();
    const timer1 = setTimeout(updateGeometry, 30);
    const timer2 = setTimeout(updateGeometry, 120);

    const ro = new ResizeObserver(() => updateGeometry());
    if (topLayerRef.current) ro.observe(topLayerRef.current);
    if (bottomLayerRef.current) ro.observe(bottomLayerRef.current);
    if (stageRef.current) ro.observe(stageRef.current);

    window.addEventListener('resize', updateGeometry);
    window.addEventListener('orientationchange', updateGeometry);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      ro.disconnect();
      window.removeEventListener('resize', updateGeometry);
      window.removeEventListener('orientationchange', updateGeometry);
    };
  }, [
    showToolbar,
    showHeader,
    showSoftwareBar,
    toolbarDock,
    effectiveRotationDeg,
    wideScrollableMode,
    engine.activeSoftwareId,
  ]);

  // Active stroke proximity detection for non-intrusive visual feedback
  const activeStroke = engine.currentStroke || engine.currentRemoteStroke;
  const isActivelyDrawing = activeStroke !== null;
  const lastStrokePt =
    activeStroke && activeStroke.points.length > 0
      ? activeStroke.points[activeStroke.points.length - 1]
      : null;
  const pointerNormX = lastStrokePt?.normX ?? 0.5;
  const pointerNormY = lastStrokePt?.normY ?? 0.5;
  const isNearBottomRightCorner =
    isActivelyDrawing && pointerNormX > 0.72 && pointerNormY > 0.82;

  const activeProfile = engine.getActiveSoftwareProfile();
  const swPixels = engine.getSoftwareWorkingAreaPixels();
  const mappedLivePixel = engine.mapMobilePadToPcSoftwarePixel(pointerNormX, pointerNormY);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Flip 180° between 90° Right and 90° Left when in rotated landscape mode, or toggle rotation on landscape
  const handleFlipOrCycleRotation = () => {
    if (effectiveRotationDeg === 90) {
      if (rotationMode === 'auto') {
        setAutoDirection(-90);
      } else {
        setRotationMode(-90);
      }
    } else if (effectiveRotationDeg === -90) {
      if (rotationMode === 'auto') {
        setAutoDirection(90);
      } else {
        setRotationMode(90);
      }
    } else {
      setRotationMode(90);
    }
    engine.notify();
  };

  const isFullTablet = engine.fullScreenTabletMode;

  // Compute exact stage dimensions:
  // - When isFullTablet is true (default on Mobile): 100% of the Mobile screen stage is used as a Full Tablet Pad!
  //   Every point (0..1) on the Mobile Full Pad maps 1:1 to 100% of the PC Software's Working Area.
  // - When isFullTablet is false (PC Software Working Area View): shows the PC Monitor frame with the Software UI docks
  //   (Top Menu, Left Tools, Right Layers) and mounts the active DrawingCanvas inside the exact Software Working Area!
  const targetRatio = engine.serverAspectRatio || 16 / 9;
  const padding = isFullTablet ? 2 : 10;
  const availW = Math.max(120, stageSize.width - padding);
  const availH = Math.max(120, stageSize.height - padding);

  let fittedWidth = availW;
  let fittedHeight = availW / targetRatio;
  if (fittedHeight > availH) {
    fittedHeight = availH;
    fittedWidth = availH * targetRatio;
  }

  const canvasRenderWidth = wideScrollableMode
    ? Math.max(availW * 1.65, availH * targetRatio)
    : isFullTablet
      ? availW
      : Math.floor(fittedWidth);
  const canvasRenderHeight = wideScrollableMode
    ? availH
    : isFullTablet
      ? availH
      : Math.floor(fittedHeight);

  const maxPanOffset = Math.max(0, Math.floor(canvasRenderWidth - availW));

  const handlePanSliderChange = (val: number) => {
    setCanvasScrollX(val);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = val;
    }
  };

  // Latency health color
  const latencyMs = connection.state === 'connected' ? Math.max(1, connection.latencyMs) : 2;
  const latencyHealthColor =
    latencyMs <= 12
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : latencyMs <= 30
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-rose-300 border-rose-500/40 bg-rose-500/10';

  const smoothedPressurePct = Math.round((engine.liveSmoothedPressure || 0) * 100);

  const swRect = engine.softwareWorkingArea;
  const hasSoftwareMargins =
    swRect.left > 0.005 || swRect.top > 0.005 || swRect.right < 0.995 || swRect.bottom < 0.995;

  // Render Top Status & Control Layer — Single-row responsive bar
  const renderStatusHeader = () => {
    if (!showHeader) return null;
    return (
      <div className="w-full border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-xl px-2 sm:px-4 py-1 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {/* Group 1 (Left): Back to Connect, Pair Status & Target PC Software Working Area */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onExit}
              title="Back to Connect"
              className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl border border-slate-800 flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Connect</span>
            </button>

            {connection.state === 'connected' ? (
              <button
                type="button"
                onClick={() => setShowPairModal(true)}
                className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                title="Connected to PC — Tap to view PIN or switch device"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span>PIN {connection.pairingPin || '1234'}</span>
              </button>
            ) : connection.state === 'connecting' ? (
              <div className="h-8 px-2.5 bg-slate-900 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                <span>Connecting...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPairModal(true)}
                className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 hover:text-white rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Pair ({connection.pairingPin || '1234'})</span>
              </button>
            )}

            {/* Target PC Software Working Area Selector Toggle */}
            <button
              type="button"
              onClick={() => setShowSoftwareBar((prev) => !prev)}
              className={`h-8 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                showSoftwareBar
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25'
              }`}
              title="Select Target PC Drawing Software so Mobile Full Pad maps 1:1 to Software Working Area"
            >
              <AppWindow className="w-3.5 h-3.5 shrink-0" />
              <span>PC App: {activeProfile.shortName}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showSoftwareBar ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Quick 1-Tap Mobile Pen / Pixel Eraser Toggle */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                const nextMode = engine.brushSettings.mode === 'eraser' ? 'pen' : 'eraser';
                engine.updateBrush({ mode: nextMode });
                connection.sendBrushUpdate({ mode: nextMode });
                connection.sendAction(nextMode === 'eraser' ? 'eraserShortcut' : 'brushShortcut');
              }}
              onClick={() => {
                // Handled onPointerDown for instant touch response; fallback for keyboard accessibility
              }}
              className={`h-8 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                engine.brushSettings.mode === 'eraser'
                  ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.45)]'
                  : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
              title="Toggle Pixel Eraser (Sends Windows Ink 0x04 + Shortcut E)"
            >
              {engine.brushSettings.mode === 'eraser' ? (
                <>
                  <Eraser className="w-3.5 h-3.5 shrink-0" />
                  <span>Eraser ON</span>
                </>
              ) : (
                <>
                  <Eraser className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Erase</span>
                </>
              )}
            </button>
          </div>

          {/* Group 2 (Center): Live Latency Monitor & Pressure Smoothing Telemetry */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 ${latencyHealthColor}`}
              title="Real-Time Latency Monitor, Polling Rate & Frame Rate"
            >
              <Gauge className="w-3.5 h-3.5 shrink-0" />
              <span>{latencyMs}ms</span>
              <span className="opacity-40">·</span>
              <span>{engine.livePollingRateHz}Hz</span>
              <span className="opacity-40">·</span>
              <span>{engine.liveFps}fps</span>
            </div>

            <div
              className="h-8 px-2.5 rounded-xl border border-slate-800 bg-slate-900/90 flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-cyan-300 whitespace-nowrap shrink-0"
              title="Real-Time Smoothed Stylus/Touch Pressure"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="w-10 sm:w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${Math.max(8, smoothedPressurePct)}%` }}
                />
              </div>
              <span className="w-7 text-right">{smoothedPressurePct}%</span>
            </div>
          </div>

          {/* Group 3 (Right): Full Tablet Pad vs PC Software View, Auto-Landscape, Scroll L-R, Test, Clean & Fullscreen */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                engine.fullScreenTabletMode = !isFullTablet;
                setWideScrollableMode(false);
                engine.notify();
              }}
              className={`h-8 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isFullTablet
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/50'
              }`}
              title="Toggle between Mobile Full-Screen Tablet Pad (100% Pad) and PC Software Working Area Preview"
            >
              {isFullTablet ? (
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Laptop className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isFullTablet ? 'Full Tablet Pad (100%)' : 'PC Software View'}</span>
            </button>

            <button
              type="button"
              onClick={handleFlipOrCycleRotation}
              className={`h-8 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                effectiveRotationDeg !== 0
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
              title={
                effectiveRotationDeg !== 0
                  ? 'Auto-Landscape Active — Tap to Flip 180° (Left/Right Hand)'
                  : 'Landscape Active — Tap to Rotate 90°'
              }
            >
              <RotateCw className="w-3.5 h-3.5 shrink-0" />
              <span>
                {effectiveRotationDeg === 90
                  ? '90° R'
                  : effectiveRotationDeg === -90
                    ? '90° L'
                    : 'Rotate'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !wideScrollableMode;
                setWideScrollableMode(next);
                setCanvasScrollX(0);
              }}
              className={`h-8 px-2.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                wideScrollableMode
                  ? 'bg-purple-500/20 text-purple-300 border-purple-400/60'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
              }`}
              title="Enable Wide Scrollable Canvas (Pan Left to Right)"
            >
              <MoveHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>Scroll L-R</span>
            </button>

            {onOpenTestSuite && (
              <button
                type="button"
                onClick={onOpenTestSuite}
                title="Run PC-Mobile Accuracy Test"
                className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-white rounded-xl border border-slate-800 flex items-center gap-1 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Crosshair className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Test</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDriveModal(true)}
              title="Save to or Open Artwork from Google Drive"
              className="h-8 px-2.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 hover:text-white rounded-xl border border-cyan-500/35 flex items-center gap-1 text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Drive</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowHeader(false);
                setShowToolbar(false);
                setShowSoftwareBar(false);
              }}
              title="Immersive Full-Screen Tablet Pad (Hide Bars for 100% Pad Area)"
              className="h-8 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 flex items-center gap-1 text-[11px] sm:text-xs font-semibold transition-colors shrink-0"
            >
              <EyeOff className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden lg:inline">Clean</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="h-8 w-8 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 flex items-center justify-center transition-colors shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* PC Software Working Area Calibration Bar (Automatically measured by ResizeObserver so it never overlaps canvas) */}
        {showSoftwareBar && (
          <div className="max-w-7xl mx-auto mt-1.5 pt-1.5 border-t border-slate-800/90 space-y-1.5">
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-cyan-400 whitespace-nowrap mr-1">
                  Target PC Software Working Area:
                </span>
                {PC_SOFTWARE_PROFILES.map((prof) => {
                  const isSelected = engine.activeSoftwareId === prof.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => engine.setSoftwareProfile(prof.id)}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap shrink-0 border ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {prof.shortName}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                <span>
                  Mobile Full Pad (100%) ➔ {activeProfile.shortName} Working Area: {swPixels.width}×{swPixels.height}px
                </span>
              </div>
            </div>

            {/* Custom Software Working Area Margin Sliders when 'custom' is active */}
            {engine.activeSoftwareId === 'custom' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] bg-slate-900/70 p-2 rounded-xl border border-slate-800/80">
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 whitespace-nowrap">Left UI: {Math.round(swRect.left * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    value={Math.round(swRect.left * 100)}
                    onChange={(e) =>
                      engine.updateCustomSoftwareWorkingArea({ left: Number(e.target.value) / 100 })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 whitespace-nowrap">Top UI: {Math.round(swRect.top * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    value={Math.round(swRect.top * 100)}
                    onChange={(e) =>
                      engine.updateCustomSoftwareWorkingArea({ top: Number(e.target.value) / 100 })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 whitespace-nowrap">
                    Right UI: {Math.round((1 - swRect.right) * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    value={Math.round((1 - swRect.right) * 100)}
                    onChange={(e) =>
                      engine.updateCustomSoftwareWorkingArea({
                        right: 1 - Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 whitespace-nowrap">
                    Bottom UI: {Math.round((1 - swRect.bottom) * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    value={Math.round((1 - swRect.bottom) * 100)}
                    onChange={(e) =>
                      engine.updateCustomSoftwareWorkingArea({
                        bottom: 1 - Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* Left-to-Right Horizontal Pan Slider when Wide Scrollable Canvas Mode is active */}
        {wideScrollableMode && maxPanOffset > 0 && (
          <div className="max-w-7xl mx-auto mt-1 pt-1 border-t border-slate-800/80 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs">
            <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1 whitespace-nowrap">
              <MoveHorizontal className="w-3.5 h-3.5" />
              <span>Pan Canvas L ↔ R</span>
            </span>
            <input
              type="range"
              min={0}
              max={maxPanOffset}
              value={canvasScrollX}
              onChange={(e) => handlePanSliderChange(Number(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="text-[11px] font-mono tabular-nums text-slate-400 w-12 text-right">
              {Math.round((canvasScrollX / Math.max(1, maxPanOffset)) * 100)}%
            </span>
          </div>
        )}
      </div>
    );
  };

  // Render Fixed Toolbar Dock Layer
  const renderToolbarDock = () =>
    showToolbar ? (
      <ToolbarWidget
        engine={engine}
        connection={connection}
        onClose={() => setShowToolbar(false)}
        dockPosition={toolbarDock}
        onToggleDockPosition={() =>
          setToolbarDock((prev) => (prev === 'bottom' ? 'top' : 'bottom'))
        }
      />
    ) : (
      <div className="flex items-center justify-center gap-2 py-1 bg-slate-950/95 border-t border-slate-800/80 px-3">
        {!showHeader && (
          <button
            type="button"
            onClick={() => setShowHeader(true)}
            className="h-7 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>Show Top Bar</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowToolbar(true)}
          className="h-7 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
        >
          {toolbarDock === 'bottom' ? (
            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
          )}
          <span>Show Tools</span>
        </button>
        {effectiveRotationDeg !== 0 && (
          <button
            type="button"
            onClick={handleFlipOrCycleRotation}
            className="h-7 px-3 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          >
            <RotateCw className="w-3 h-3" />
            <span>Flip 180°</span>
          </button>
        )}
      </div>
    );

  const workspaceClass =
    effectiveRotationDeg === 90
      ? 'drawing-workspace-rotated-90'
      : effectiveRotationDeg === -90
        ? 'drawing-workspace-rotated-minus-90'
        : 'drawing-workspace-fixed';

  return (
    <div className={`${workspaceClass} bg-[#0A0A12] text-slate-100 select-none`}>
      {/* Fixed-Position Top Toolbar Layer (Strictly Disjoint from Canvas Stage) */}
      <header ref={topLayerRef} className="fixed-toolbar-layer-top">
        {toolbarDock === 'top' ? (
          <div className="flex flex-col">
            {renderStatusHeader()}
            {renderToolbarDock()}
          </div>
        ) : (
          renderStatusHeader()
        )}
      </header>

      {/* Disjoint Canvas Stage Layer — Dynamically bounded by topInset and bottomInset so controls NEVER overlap canvas */}
      <main
        ref={stageRef}
        style={{
          top: `${topInset}px`,
          bottom: `${bottomInset}px`,
        }}
        className="fixed-canvas-stage-layer grid place-items-center p-0.5 sm:p-1"
      >
        <div
          ref={scrollContainerRef}
          onScroll={(e) => setCanvasScrollX(e.currentTarget.scrollLeft)}
          className={`relative flex items-center ${
            wideScrollableMode
              ? 'w-full h-full overflow-x-auto overflow-y-hidden justify-start no-scrollbar'
              : 'w-full h-full overflow-hidden justify-center'
          }`}
        >
          {isFullTablet ? (
            /* MODE 1 (DEFAULT ON MOBILE): 100% Full-Screen Tablet Pad -> Maps 1:1 to PC Software Working Area */
            <div
              style={{
                width: `${canvasRenderWidth}px`,
                height: `${canvasRenderHeight}px`,
              }}
              className="relative shrink-0 flex items-center justify-center rounded-xl border-2 border-emerald-400/50 shadow-[0_0_24px_rgba(16,185,129,0.12)] overflow-hidden bg-[#0A0A12]"
            >
              <DrawingCanvas
                engine={engine}
                showGrid={true}
                rotationDeg={effectiveRotationDeg}
                className="w-full h-full"
              />

              {/* Subtle Corner Pad Guides showing Full Pad 1:1 Lock */}
              <div className="pointer-events-none absolute inset-1.5 border border-dashed border-cyan-500/20 rounded-lg" />

              {/* Dynamically Positioned Mapping HUD Badge (Moves away when drawing near bottom-right corner) */}
              <div
                className={`absolute pointer-events-none max-w-[calc(100%-16px)] text-[10px] font-mono tabular-nums text-slate-200 bg-slate-950/85 border border-slate-800/90 px-2.5 py-1 rounded-lg transition-all duration-150 flex items-center gap-2 overflow-hidden ${
                  isNearBottomRightCorner
                    ? 'top-2 left-2.5 opacity-70'
                    : 'bottom-2 right-2.5 opacity-95'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">
                  Full Pad (100%) ➔ PC [{activeProfile.shortName}] ({swPixels.width}×{swPixels.height}px)
                </span>
                {isActivelyDrawing && (
                  <span className="text-cyan-300 font-bold shrink-0">
                    • ({mappedLivePixel.x}, {mappedLivePixel.y})
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* MODE 2 (PC SOFTWARE WORKING AREA VIEW): Shows PC Screen with Software UI Frame & Active Working Area Canvas */
            <div
              style={{
                width: `${canvasRenderWidth}px`,
                height: `${canvasRenderHeight}px`,
              }}
              className="relative shrink-0 rounded-xl border border-indigo-400/50 shadow-[0_0_24px_rgba(99,102,241,0.12)] overflow-hidden bg-slate-950"
            >
              {/* Simulated PC Software Non-Drawing UI Zones (Top Menu, Left Tools, Right Panels, Bottom Status) */}
              {hasSoftwareMargins && (
                <>
                  {/* Top Software Menu / Ribbon Bar */}
                  {swRect.top > 0 && (
                    <div
                      style={{
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: `${swRect.top * 100}%`,
                      }}
                      className="absolute bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-3 text-[10px] font-mono text-slate-400 select-none pointer-events-none overflow-hidden"
                    >
                      <span className="font-bold text-slate-300 truncate">
                        {activeProfile.name} — {activeProfile.topBarLabel || 'Top Menu & Ribbon'}
                      </span>
                      <span className="shrink-0 ml-2 hidden sm:inline">
                        PC Monitor {engine.pcScreenWidth}×{engine.pcScreenHeight}
                      </span>
                    </div>
                  )}

                  {/* Left Software Tool Dock */}
                  {swRect.left > 0 && (
                    <div
                      style={{
                        left: 0,
                        top: `${swRect.top * 100}%`,
                        width: `${swRect.left * 100}%`,
                        height: `${(swRect.bottom - swRect.top) * 100}%`,
                      }}
                      className="absolute bg-slate-900/90 border-r border-slate-800 flex items-center justify-center text-[9px] font-mono text-slate-500 select-none pointer-events-none overflow-hidden"
                    >
                      {swRect.left >= 0.05 && (
                        <span className="-rotate-90 whitespace-nowrap">
                          {activeProfile.leftDockLabel || 'Tools'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Right Software Layers / Properties Dock */}
                  {swRect.right < 1 && (
                    <div
                      style={{
                        left: `${swRect.right * 100}%`,
                        top: `${swRect.top * 100}%`,
                        width: `${(1 - swRect.right) * 100}%`,
                        height: `${(swRect.bottom - swRect.top) * 100}%`,
                      }}
                      className="absolute bg-slate-900/90 border-l border-slate-800 flex flex-col items-center justify-center p-1 text-[9px] font-mono text-slate-400 select-none pointer-events-none text-center overflow-hidden"
                    >
                      {1 - swRect.right >= 0.08 && (
                        <>
                          <span className="truncate w-full">{activeProfile.rightDockLabel || 'Layers & Panels'}</span>
                          <span className="text-[8px] text-slate-500 mt-1 hidden sm:inline">(Protected UI)</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Bottom Software Status Bar */}
                  {swRect.bottom < 1 && (
                    <div
                      style={{
                        left: 0,
                        top: `${swRect.bottom * 100}%`,
                        width: '100%',
                        height: `${(1 - swRect.bottom) * 100}%`,
                      }}
                      className="absolute bg-slate-900/95 border-t border-slate-800 flex items-center justify-between px-3 text-[9px] font-mono text-slate-500 select-none pointer-events-none overflow-hidden"
                    >
                      {1 - swRect.bottom >= 0.06 && (
                        <>
                          <span className="truncate">{activeProfile.bottomBarLabel || 'Status'}</span>
                          <span className="shrink-0 ml-2 hidden sm:inline">
                            Working Area: {swPixels.width}×{swPixels.height}px
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Active PC Software Working Area Canvas — 100% of Mobile Full Pad maps 1:1 into this box */}
              <div
                style={{
                  left: `${swRect.left * 100}%`,
                  top: `${swRect.top * 100}%`,
                  width: `${(swRect.right - swRect.left) * 100}%`,
                  height: `${(swRect.bottom - swRect.top) * 100}%`,
                }}
                className="absolute border-2 border-cyan-400/70 shadow-[0_0_20px_rgba(0,229,255,0.15)] overflow-hidden bg-[#0A0A12]"
              >
                <DrawingCanvas
                  engine={engine}
                  showGrid={true}
                  rotationDeg={effectiveRotationDeg}
                  className="w-full h-full"
                />

                <div
                  className={`absolute pointer-events-none max-w-[calc(100%-12px)] truncate text-[10px] font-mono tabular-nums text-cyan-300 bg-slate-950/85 border border-cyan-500/40 px-2 py-0.5 rounded-md transition-all duration-150 ${
                    isNearBottomRightCorner
                      ? 'top-1.5 left-2 opacity-70'
                      : 'bottom-1.5 right-2 opacity-95'
                  }`}
                >
                  {activeProfile.shortName} ({swPixels.width}×{swPixels.height}px) ⇄ 100% Mobile Pad
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Fixed-Position Bottom Toolbar Layer (Strictly Disjoint from Canvas Stage) */}
      <footer ref={bottomLayerRef} className="fixed-toolbar-layer-bottom">
        {toolbarDock === 'bottom' && renderToolbarDock()}
      </footer>

      {/* Quick Pair PIN Modal */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xs p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Pair with PC</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                maxLength={6}
                value={pairPin}
                onChange={(e) => setPairPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="PIN (1234)"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-center text-white font-mono tabular-nums text-xl tracking-widest font-bold focus:outline-none focus:border-cyan-400"
              />

              <button
                type="button"
                disabled={isPairing || !pairPin}
                onClick={async () => {
                  setIsPairing(true);
                  const success = await connection.connectToServer(
                    'relay',
                    3000,
                    pairPin,
                    'cloud'
                  );
                  setIsPairing(false);
                  if (success) {
                    setShowPairModal(false);
                  }
                }}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isPairing ? 'Connecting...' : 'Connect Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Cloud Storage Modal */}
      <GoogleDriveModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        engine={engine}
      />
    </div>
  );
};
