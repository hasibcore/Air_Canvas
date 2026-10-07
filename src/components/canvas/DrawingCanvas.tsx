import React, { useEffect, useRef, useCallback } from 'react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { PointerKind, Stroke } from '../../types/index.ts';

interface DrawingCanvasProps {
  engine: DrawingEngine;
  readOnly?: boolean;
  className?: string;
  showGrid?: boolean;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  engine,
  readOnly = false,
  className = '',
  showGrid = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Resize canvas according to devicePixelRatio for ultra-crisp Retina rendering
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(100, Math.floor(rect.width));
    const height = Math.max(100, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      engine.updateCanvasDimensions(width, height);
    }
  }, [engine]);

  useEffect(() => {
    handleResize();
    const ro = new ResizeObserver(() => handleResize());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  // Main Render Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    engine.recordFrame();

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0A0A12';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 0.5;
      const step = 40;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    // Custom Box Dimming
    if (engine.customBoxEnabled) {
      const box = engine.customBoxNormalized;
      const bx = box.left * w;
      const by = box.top * h;
      const bw = (box.right - box.left) * w;
      const bh = (box.bottom - box.top) * h;

      // Dim exterior
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      // Top
      ctx.fillRect(0, 0, w, by);
      // Bottom
      ctx.fillRect(0, by + bh, w, h - (by + bh));
      // Left
      ctx.fillRect(0, by, bx, bh);
      // Right
      ctx.fillRect(bx + bw, by, w - (bx + bw), bh);

      // Cyan glowing box border
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(bx, by, bw, bh);

      // Corner L-brackets
      const cLen = 16;
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(bx, by + cLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + cLen, by);
      // Top-Right
      ctx.moveTo(bx + bw - cLen, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + cLen);
      // Bottom-Left
      ctx.moveTo(bx, by + bh - cLen);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx + cLen, by + bh);
      // Bottom-Right
      ctx.moveTo(bx + bw - cLen, by + bh);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw, by + bh - cLen);
      ctx.stroke();
    }

    // Render strokes helper function
    const drawStroke = (stroke: Stroke) => {
      const pts = stroke.points;
      if (pts.length === 0) return;

      const isEraser = stroke.settings.mode === 'eraser';
      const isHighlighter = stroke.settings.mode === 'highlighter';

      ctx.save();
      if (isEraser) {
        ctx.strokeStyle = '#0A0A12';
        ctx.fillStyle = '#0A0A12';
        ctx.globalCompositeOperation = 'destination-out';
      } else if (isHighlighter) {
        ctx.strokeStyle = stroke.settings.color;
        ctx.fillStyle = stroke.settings.color;
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.strokeStyle = stroke.settings.color;
        ctx.fillStyle = stroke.settings.color;
        ctx.globalAlpha = Math.max(0.1, Math.min(1.0, stroke.settings.opacity));
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        const pt = pts[0];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, pt.width / 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      // Smooth C1 Bézier interpolation through midpoints
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        const avgWidth = (p1.width + p2.width) / 2;
        ctx.lineWidth = Math.max(0.8, avgWidth);

        ctx.beginPath();
        if (i === 0) {
          ctx.moveTo(p1.x, p1.y);
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          ctx.lineTo(midX, midY);
        } else {
          const prev = pts[i - 1];
          const midPrevX = (prev.x + p1.x) / 2;
          const midPrevY = (prev.y + p1.y) / 2;
          const midCurrX = (p1.x + p2.x) / 2;
          const midCurrY = (p1.y + p2.y) / 2;
          ctx.moveTo(midPrevX, midPrevY);
          ctx.quadraticCurveTo(p1.x, p1.y, midCurrX, midCurrY);
        }
        ctx.stroke();
      }

      // Final segment to last point
      if (pts.length > 2) {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const midPrevX = (pts[pts.length - 3].x + prev.x) / 2;
        const midPrevY = (pts[pts.length - 3].y + prev.y) / 2;
        ctx.lineWidth = Math.max(0.8, (prev.width + last.width) / 2);
        ctx.beginPath();
        ctx.moveTo(midPrevX, midPrevY);
        ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
        ctx.stroke();
      }

      ctx.restore();
    };

    // Draw all completed strokes
    for (const stroke of engine.strokes) {
      drawStroke(stroke);
    }

    // Draw active in-progress stroke
    if (engine.currentStroke) {
      drawStroke(engine.currentStroke);

      // Predictive lead line
      if (engine.enablePrediction && engine.predictedPosition && engine.currentStroke.points.length >= 2) {
        const last = engine.currentStroke.points[engine.currentStroke.points.length - 1];
        ctx.save();
        ctx.strokeStyle = engine.currentStroke.settings.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(1, last.width * 0.8);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(engine.predictedPosition.x, engine.predictedPosition.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Center alignment diagnostic guide
    if (engine.showCenterGuide) {
      const cx = w * 0.5;
      const cy = h * 0.5;
      ctx.save();
      // Halo
      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.stroke();

      // Dot
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair ticks
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy);
      ctx.lineTo(cx - 6, cy);
      ctx.moveTo(cx + 6, cy);
      ctx.lineTo(cx + 22, cy);
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx, cy - 6);
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx, cy + 22);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [engine, showGrid]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderCanvas();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  // Pointer event helpers
  const extractPointerKind = (e: React.PointerEvent): PointerKind => {
    if (e.pointerType === 'pen') return 'stylus';
    if (e.pointerType === 'mouse') return 'mouse';
    return 'finger';
  };

  const extractPressure = (e: React.PointerEvent): number => {
    if (e.pressure > 0) return e.pressure;
    if (e.pointerType === 'pen') return 0.5;
    return 0.5;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    // Keep engine dimensions in sync with render box to guarantee true normalization
    if (rect.width > 0 && rect.height > 0 && (engine.canvasWidth !== rect.width || engine.canvasHeight !== rect.height)) {
      engine.updateCanvasDimensions(rect.width, rect.height);
    }

    const kind = extractPointerKind(e);
    const p = extractPressure(e);

    engine.onPointerDown(x, y, p, kind, e.pointerId, e.tiltX || 0, e.tiltY || 0, e.buttons);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (engine.canvasWidth !== rect.width || engine.canvasHeight !== rect.height)) {
      engine.updateCanvasDimensions(rect.width, rect.height);
    }

    const kind = extractPointerKind(e);

    // Extract hardware coalesced events (120Hz/240Hz S-Pen / Apple Pencil / touch digitizers)
    const nativeEv = e.nativeEvent as PointerEvent;
    const coalescedList =
      typeof nativeEv.getCoalescedEvents === 'function' ? nativeEv.getCoalescedEvents() : null;

    if (coalescedList && coalescedList.length > 1) {
      for (let i = 0; i < coalescedList.length; i++) {
        const item = coalescedList[i];
        const cx = Math.max(0, Math.min(rect.width, item.clientX - rect.left));
        const cy = Math.max(0, Math.min(rect.height, item.clientY - rect.top));
        const cp = item.pressure > 0 ? item.pressure : extractPressure(e);
        engine.onPointerMove(cx, cy, cp, kind, e.pointerId, item.tiltX || 0, item.tiltY || 0, e.buttons);
      }
    } else {
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const p = extractPressure(e);
      engine.onPointerMove(x, y, p, kind, e.pointerId, e.tiltX || 0, e.tiltY || 0, e.buttons);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const kind = extractPointerKind(e);
    engine.onPointerUp(kind, e.pointerId, e.buttons);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const kind = extractPointerKind(e);
    engine.onPointerCancel(kind, e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none drawing-touch-surface ${className}`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="block w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
};
