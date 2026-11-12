import React, { useState, useRef } from 'react';
import { DrawingEngine } from '../../services/drawingEngine.ts';

interface SnippingBoxSelectorOverlayProps {
  engine: DrawingEngine;
  rotationDeg?: 0 | 90 | -90;
}

export const SnippingBoxSelectorOverlay: React.FC<SnippingBoxSelectorOverlayProps> = ({
  engine,
  rotationDeg = 0,
}) => {
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const mapPointer = (clientX: number, clientY: number): { x: number; y: number; w: number; h: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const logicalW = Math.max(1, el.clientWidth || rect.width);
    const logicalH = Math.max(1, el.clientHeight || rect.height);

    let x: number;
    let y: number;
    if (rotationDeg === 90) {
      x = ((clientY - rect.top) / rect.height) * logicalW;
      y = ((rect.right - clientX) / rect.width) * logicalH;
    } else if (rotationDeg === -90) {
      x = ((rect.bottom - clientY) / rect.height) * logicalW;
      y = ((clientX - rect.left) / rect.width) * logicalH;
    } else {
      x = ((clientX - rect.left) / rect.width) * logicalW;
      y = ((clientY - rect.top) / rect.height) * logicalH;
    }
    return {
      x: Math.max(0, Math.min(logicalW, x)),
      y: Math.max(0, Math.min(logicalH, y)),
      w: logicalW,
      h: logicalH,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const pt = mapPointer(e.clientX, e.clientY);
    if (!pt) return;
    setStartPos({ x: pt.x, y: pt.y });
    setCurrentPos({ x: pt.x, y: pt.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos) return;
    const pt = mapPointer(e.clientX, e.clientY);
    if (!pt) return;
    setCurrentPos({ x: pt.x, y: pt.y });
  };

  const handlePointerUp = () => {
    if (startPos && currentPos && containerRef.current) {
      const el = containerRef.current;
      const logicalW = Math.max(1, el.clientWidth || el.getBoundingClientRect().width);
      const logicalH = Math.max(1, el.clientHeight || el.getBoundingClientRect().height);
      const minX = Math.min(startPos.x, currentPos.x) / logicalW;
      const maxX = Math.max(startPos.x, currentPos.x) / logicalW;
      const minY = Math.min(startPos.y, currentPos.y) / logicalH;
      const maxY = Math.max(startPos.y, currentPos.y) / logicalH;

      // Only apply if user dragged more than a tiny tap
      if (maxX - minX > 0.05 && maxY - minY > 0.05) {
        engine.customBoxNormalized = {
          left: Math.max(0, Math.min(1, minX)),
          top: Math.max(0, Math.min(1, minY)),
          right: Math.max(0, Math.min(1, maxX)),
          bottom: Math.max(0, Math.min(1, maxY)),
        };
        engine.customBoxEnabled = true;
      }
    }
    setStartPos(null);
    setCurrentPos(null);
    engine.isSnippingBox = false;
    engine.notify();
  };

  const left = startPos && currentPos ? Math.min(startPos.x, currentPos.x) : 0;
  const top = startPos && currentPos ? Math.min(startPos.y, currentPos.y) : 0;
  const width = startPos && currentPos ? Math.abs(currentPos.x - startPos.x) : 0;
  const height = startPos && currentPos ? Math.abs(currentPos.y - startPos.y) : 0;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="absolute inset-0 z-50 bg-black/70 cursor-crosshair flex flex-col items-center justify-center select-none"
    >
      <div className="absolute top-6 px-4 py-2 bg-slate-900/90 border border-cyan-400 text-cyan-300 font-bold text-xs rounded-full shadow-lg">
        Drag to select active drawing tablet area
      </div>

      {startPos && currentPos && (
        <div
          style={{
            position: 'absolute',
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
          }}
          className="border-2 border-dashed border-cyan-400 bg-cyan-500/10 pointer-events-none rounded"
        />
      )}
    </div>
  );
};
