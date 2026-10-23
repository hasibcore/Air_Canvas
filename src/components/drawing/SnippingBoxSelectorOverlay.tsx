import React, { useState, useRef } from 'react';
import { DrawingEngine } from '../../services/drawingEngine.ts';

interface SnippingBoxSelectorOverlayProps {
  engine: DrawingEngine;
}

export const SnippingBoxSelectorOverlay: React.FC<SnippingBoxSelectorOverlayProps> = ({ engine }) => {
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
  };

  const handlePointerUp = () => {
    if (startPos && currentPos && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const minX = Math.min(startPos.x, currentPos.x) / rect.width;
      const maxX = Math.max(startPos.x, currentPos.x) / rect.width;
      const minY = Math.min(startPos.y, currentPos.y) / rect.height;
      const maxY = Math.max(startPos.y, currentPos.y) / rect.height;

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
