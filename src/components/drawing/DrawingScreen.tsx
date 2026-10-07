import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  Laptop,
  Smartphone,
  ChevronUp,
  ArrowLeft,
  Share2,
  Sliders,
  Crosshair,
} from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { DrawingCanvas } from '../canvas/DrawingCanvas.tsx';
import { ToolbarWidget } from './ToolbarWidget.tsx';
import { ProPerformanceHUD } from './ProPerformanceHUD.tsx';
import { FloatingBoxSelectorBubble } from './FloatingBoxSelectorBubble.tsx';
import { SnippingBoxSelectorOverlay } from './SnippingBoxSelectorOverlay.tsx';
import { DpiDiagnosticModal } from './DpiDiagnosticModal.tsx';
import { LicenseService } from '../../services/licenseService.ts';
import { Crown, Sparkles } from 'lucide-react';

interface DrawingScreenProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  license?: LicenseService;
  onOpenProModal?: () => void;
  onExit: () => void;
}

export const DrawingScreen: React.FC<DrawingScreenProps> = ({
  engine,
  connection,
  license: propLicense,
  onOpenProModal,
  onExit,
}) => {
  const license = propLicense || LicenseService.getInstance();
  const [showToolbar, setShowToolbar] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDpiModal, setShowDpiModal] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Auto-hide toolbar after 6 seconds of inactivity
  const resetToolbarTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      // Keep visible on desktop mouse hover, but allow collapse
    }, 6000);
  };

  useEffect(() => {
    resetToolbarTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isFullTablet = engine.fullScreenTabletMode;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0A12] text-slate-100 flex flex-col select-none">
      {/* Canvas Area with 16:9 PC Fit Mode vs Full Screen Mode */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        <div
          style={{
            width: isFullTablet ? '100%' : undefined,
            height: isFullTablet ? '100%' : undefined,
            aspectRatio: isFullTablet ? undefined : '16 / 9',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          className={`relative transition-all duration-300 flex items-center justify-center ${
            !isFullTablet
              ? 'rounded-xl border-2 border-cyan-400/60 shadow-[0_0_24px_rgba(0,229,255,0.2)] overflow-hidden'
              : 'w-full h-full'
          }`}
        >
          <DrawingCanvas engine={engine} showGrid={true} className="w-full h-full" />
        </div>
      </div>

      {/* Top Left: Pro Performance & Telemetry HUD */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={onExit}
          title="Return to Hub"
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 backdrop-blur-md shadow-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <ProPerformanceHUD
          engine={engine}
          connection={connection}
          license={license}
          onOpenProModal={onOpenProModal}
        />
      </div>

      {/* Top Right: Badges & Controls */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {/* Aspect Ratio Badge Toggle */}
        <button
          type="button"
          onClick={() => {
            engine.fullScreenTabletMode = !isFullTablet;
            engine.notify();
          }}
          className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg transition-all ${
            isFullTablet
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/80 shadow-[0_0_12px_rgba(0,229,255,0.3)]'
              : 'bg-purple-500/20 text-purple-300 border-purple-400/80 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
          }`}
        >
          {isFullTablet ? <Smartphone className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
          <span>{isFullTablet ? 'Full Screen' : '16:9 PC Fit'}</span>
        </button>

        {/* Floating Box Selector Bubble */}
        <FloatingBoxSelectorBubble engine={engine} />

        {/* DPI Diagnostic Button */}
        <button
          type="button"
          onClick={() => setShowDpiModal(true)}
          title="Open DPI & Coordinate Diagnostic"
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-cyan-300 hover:text-white rounded-full border border-cyan-500/40 backdrop-blur-md shadow-lg transition-colors"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full border border-slate-700 backdrop-blur-md shadow-lg transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Snipping Tool Drag Box Overlay */}
      {engine.isSnippingBox && <SnippingBoxSelectorOverlay engine={engine} />}

      {/* Coordinate & DPI Diagnostic Modal */}
      <DpiDiagnosticModal
        engine={engine}
        connection={connection}
        isOpen={showDpiModal}
        onClose={() => setShowDpiModal(false)}
      />

      {/* Bottom Floating Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
        {showToolbar ? (
          <div className="pointer-events-auto transition-transform duration-300 transform translate-y-0">
            <ToolbarWidget
              engine={engine}
              connection={connection}
              onClose={() => setShowToolbar(false)}
            />
          </div>
        ) : (
          <div className="pointer-events-auto flex justify-center pb-3">
            <button
              type="button"
              onClick={() => setShowToolbar(true)}
              className="px-4 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-cyan-500/40 rounded-full shadow-xl backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Show Toolbar</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
