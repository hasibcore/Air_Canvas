import React, { useEffect, useRef, useCallback } from 'react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { PointerKind, Stroke } from '../../types/index.ts';

interface DrawingCanvasProps {
  engine: DrawingEngine;
  readOnly?: boolean;
  className?: string;
  showGrid?: boolean;
  rotationDeg?: 0 | 90 | -90;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  engine,
  readOnly = false,
  className = '',
  showGrid = true,
  rotationDeg = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerKindRef = useRef<PointerKind>('finger');

  // Resize canvas using unrotated layout dimensions (clientWidth / clientHeight)
  // so CSS 90deg rotation never swaps or distorts the internal canvas resolution
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const width = Math.max(100, Math.round(container.clientWidth || 300));
    const height = Math.max(100, Math.round(container.clientHeight || 200));

    const targetPixelW = Math.floor(width * dpr);
    const targetPixelH = Math.floor(height * dpr);

    if (canvas.width !== targetPixelW || canvas.height !== targetPixelH) {
      canvas.width = targetPixelW;
      canvas.height = targetPixelH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (!inkCanvasRef.current) {
        inkCanvasRef.current = document.createElement('canvas');
      }
      inkCanvasRef.current.width = targetPixelW;
      inkCanvasRef.current.height = targetPixelH;

      engine.updateCanvasDimensions(width, height);
    }
  }, [engine]);

  useEffect(() => {
    handleResize();
    const ro = new ResizeObserver(() => handleResize());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [handleResize, rotationDeg]);

  // Prevent iOS Safari / Android bounce scroll & pinch/gesture interference on the drawing surface
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventDefaultTouch = (e: TouchEvent) => {
      if (!readOnly) {
        e.preventDefault();
      }
    };
    canvas.addEventListener('touchstart', preventDefaultTouch, { passive: false });
    canvas.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', preventDefaultTouch);
      canvas.removeEventListener('touchmove', preventDefaultTouch);
    };
  }, [readOnly]);

  // Global window pointerup/pointercancel/blur/visibilitychange safety listener so releasing or switching apps never leaves a stroke stuck open
  useEffect(() => {
    const handleGlobalPointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId === activePointerIdRef.current) {
        activePointerIdRef.current = null;
        engine.onPointerUp(activePointerKindRef.current, e.pointerId, 0);
      }
    };
    const handleWindowInterruption = () => {
      if (activePointerIdRef.current !== null) {
        const pid = activePointerIdRef.current;
        activePointerIdRef.current = null;
        engine.onPointerUp(activePointerKindRef.current, pid, 0);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerEnd);
    window.addEventListener('pointercancel', handleGlobalPointerEnd);
    window.addEventListener('blur', handleWindowInterruption);
    document.addEventListener('visibilitychange', handleWindowInterruption);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      window.removeEventListener('blur', handleWindowInterruption);
      document.removeEventListener('visibilitychange', handleWindowInterruption);
    };
  }, [engine]);

  // Main Render Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    engine.recordFrame();

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0A0A12';
    ctx.fillRect(0, 0, w, h);

    // Background Image (e.g. loaded from Google Drive)
    if (engine.backgroundImage) {
      ctx.drawImage(engine.backgroundImage, 0, 0, w, h);
    }

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

      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.fillRect(0, 0, w, by);
      ctx.fillRect(0, by + bh, w, h - (by + bh));
      ctx.fillRect(0, by, bx, bh);
      ctx.fillRect(bx + bw, by, w - (bx + bw), bh);

      ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(bx, by, bw, bh);

      const cLen = 16;
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by + cLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + cLen, by);
      ctx.moveTo(bx + bw - cLen, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + cLen);
      ctx.moveTo(bx, by + bh - cLen);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx + cLen, by + bh);
      ctx.moveTo(bx + bw - cLen, by + bh);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw, by + bh - cLen);
      ctx.stroke();
    }

    // Prepare isolated Offscreen Ink Layer so destination-out pixel eraser
    // only wipes user strokes and never erases the #0A0A12 background, grid, or background image
    if (!inkCanvasRef.current) {
      inkCanvasRef.current = document.createElement('canvas');
    }
    const inkCanvas = inkCanvasRef.current;
    if (inkCanvas.width !== canvas.width || inkCanvas.height !== canvas.height) {
      inkCanvas.width = canvas.width;
      inkCanvas.height = canvas.height;
    }
    const inkCtx = inkCanvas.getContext('2d');

    if (inkCtx) {
      inkCtx.save();
      inkCtx.setTransform(1, 0, 0, 1, 0, 0);
      inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
      inkCtx.scale(dpr, dpr);

      // Render strokes with exact C1 midpoint quadratic Bézier interpolation onto inkCtx
      const drawStroke = (stroke: Stroke) => {
        const pts = stroke.points;
        if (pts.length === 0) return;

        const getX = (p: (typeof pts)[0]) => (p.normX !== undefined ? p.normX * w : p.x);
        const getY = (p: (typeof pts)[0]) => (p.normY !== undefined ? p.normY * h : p.y);

        const isEraser =
          stroke.settings.mode === 'eraser' ||
          pts.some((p) => p.pointerType === 'eraser');
        const isHighlighter = stroke.settings.mode === 'highlighter';

        inkCtx.save();
        if (isEraser) {
          inkCtx.strokeStyle = 'rgba(0,0,0,1)';
          inkCtx.fillStyle = 'rgba(0,0,0,1)';
          inkCtx.globalAlpha = 1.0;
          inkCtx.globalCompositeOperation = 'destination-out';
        } else if (isHighlighter) {
          inkCtx.strokeStyle = stroke.settings.color;
          inkCtx.fillStyle = stroke.settings.color;
          inkCtx.globalAlpha = 0.35;
          inkCtx.globalCompositeOperation = 'source-over';
        } else {
          inkCtx.strokeStyle = stroke.settings.color;
          inkCtx.fillStyle = stroke.settings.color;
          inkCtx.globalAlpha = Math.max(0.1, Math.min(1.0, stroke.settings.opacity));
          inkCtx.globalCompositeOperation = 'source-over';
        }

        inkCtx.lineCap = 'round';
        inkCtx.lineJoin = 'round';

        if (pts.length === 1) {
          const pt = pts[0];
          inkCtx.beginPath();
          inkCtx.arc(getX(pt), getY(pt), Math.max(1, pt.width / 2), 0, Math.PI * 2);
          inkCtx.fill();
          inkCtx.restore();
          return;
        }

        if (pts.length === 2) {
          const p0 = pts[0];
          const p1 = pts[1];
          inkCtx.lineWidth = Math.max(0.8, (p0.width + p1.width) / 2);
          inkCtx.beginPath();
          inkCtx.moveTo(getX(p0), getY(p0));
          inkCtx.lineTo(getX(p1), getY(p1));
          inkCtx.stroke();
          inkCtx.restore();
          return;
        }

        // 1. First half-segment from point 0 to midpoint(0, 1)
        const p0 = pts[0];
        const p1 = pts[1];
        const x0 = getX(p0);
        const y0 = getY(p0);
        const x1 = getX(p1);
        const y1 = getY(p1);
        inkCtx.lineWidth = Math.max(0.8, (p0.width + p1.width) / 2);
        inkCtx.beginPath();
        inkCtx.moveTo(x0, y0);
        inkCtx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
        inkCtx.stroke();

        // 2. Interior C1 quadratic Bézier segments from midpoint(i-1, i) -> control(i) -> midpoint(i, i+1)
        for (let i = 1; i < pts.length - 1; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const next = pts[i + 1];

          const px = getX(prev);
          const py = getY(prev);
          const cx = getX(curr);
          const cy = getY(curr);
          const nx = getX(next);
          const ny = getY(next);

          const midPrevX = (px + cx) / 2;
          const midPrevY = (py + cy) / 2;
          const midNextX = (cx + nx) / 2;
          const midNextY = (cy + ny) / 2;

          inkCtx.lineWidth = Math.max(0.8, (prev.width + curr.width + next.width) / 3);
          inkCtx.beginPath();
          inkCtx.moveTo(midPrevX, midPrevY);
          inkCtx.quadraticCurveTo(cx, cy, midNextX, midNextY);
          inkCtx.stroke();
        }

        // 3. Final half-segment from midpoint(n-2, n-1) to last point(n-1)
        const prevLast = pts[pts.length - 2];
        const last = pts[pts.length - 1];
        const plx = getX(prevLast);
        const ply = getY(prevLast);
        const lx = getX(last);
        const ly = getY(last);
        inkCtx.lineWidth = Math.max(0.8, (prevLast.width + last.width) / 2);
        inkCtx.beginPath();
        inkCtx.moveTo((plx + lx) / 2, (ply + ly) / 2);
        inkCtx.lineTo(lx, ly);
        inkCtx.stroke();

        inkCtx.restore();
      };

      // Draw all completed strokes
      for (const stroke of engine.strokes) {
        drawStroke(stroke);
      }

      // Draw active local stroke
      if (engine.currentStroke) {
        drawStroke(engine.currentStroke);
      }

      // Draw active remote stroke
      if (engine.currentRemoteStroke) {
        drawStroke(engine.currentRemoteStroke);
      }

      inkCtx.restore();

      // Composite the clean Ink Layer onto the main display canvas
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(inkCanvas, 0, 0);
      ctx.restore();
    }

    // Live cursor / hover indicator (shows circular pixel eraser boundary when erasing)
    if (engine.predictedPosition) {
      const isEraserCursor =
        engine.currentStroke?.settings.mode === 'eraser' ||
        engine.currentRemoteStroke?.settings.mode === 'eraser' ||
        engine.brushSettings.mode === 'eraser';

      ctx.save();
      if (isEraserCursor) {
        const eraserRadius = Math.max(5, (engine.brushSettings.baseWidth * 2.2) / 2);
        ctx.strokeStyle = '#FB7185';
        ctx.fillStyle = 'rgba(244, 63, 94, 0.14)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(
          engine.predictedPosition.x,
          engine.predictedPosition.y,
          eraserRadius,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = '#00E5FF';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(engine.predictedPosition.x, engine.predictedPosition.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Center alignment diagnostic guide
    if (engine.showCenterGuide) {
      const cx = w * 0.5;
      const cy = h * 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

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

  const extractPointerKind = (e: React.PointerEvent): PointerKind => {
    const rawType = (e.pointerType || '') as string;
    if (
      rawType === 'eraser' ||
      (rawType === 'pen' &&
        ((e.buttons & 32) !== 0 ||
          e.button === 5 ||
          (e.buttons & 2) !== 0 ||
          e.button === 2))
    ) {
      return 'eraser';
    }
    if (engine.brushSettings.mode === 'eraser') {
      return 'eraser';
    }
    if (rawType === 'pen') return 'stylus';
    if (rawType === 'mouse') return 'mouse';
    return 'finger';
  };

  const extractPressure = (e: React.PointerEvent): number => {
    if (typeof e.pressure === 'number' && e.pressure > 0 && e.pressure <= 1) {
      return e.pressure;
    }
    return 0.5;
  };

  // Map screen clientX/clientY into unrotated canvas coordinates, supporting 0deg, +90deg CW, and -90deg CCW rotated fullscreen
  const mapClientToCanvas = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const logicalW = Math.max(1, container.clientWidth || Math.round(rect.width));
    const logicalH = Math.max(1, container.clientHeight || Math.round(rect.height));

    if (engine.canvasWidth !== logicalW || engine.canvasHeight !== logicalH) {
      engine.updateCanvasDimensions(logicalW, logicalH);
    }

    let x: number;
    let y: number;

    if (rotationDeg === 90) {
      // +90deg clockwise rotation:
      // Screen vertical (top -> bottom) is Canvas X (0 -> logicalW)
      // Screen horizontal (right -> left) is Canvas Y (0 -> logicalH)
      x = ((clientY - rect.top) / rect.height) * logicalW;
      y = ((rect.right - clientX) / rect.width) * logicalH;
    } else if (rotationDeg === -90) {
      // -90deg counter-clockwise rotation:
      // Screen vertical (bottom -> top) is Canvas X (0 -> logicalW)
      // Screen horizontal (left -> right) is Canvas Y (0 -> logicalH)
      x = ((rect.bottom - clientY) / rect.height) * logicalW;
      y = ((clientX - rect.left) / rect.width) * logicalH;
    } else {
      x = ((clientX - rect.left) / rect.width) * logicalW;
      y = ((clientY - rect.top) / rect.height) * logicalH;
    }

    return {
      x: Math.max(0, Math.min(logicalW, x)),
      y: Math.max(0, Math.min(logicalH, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const kind = extractPointerKind(e);

    // Multi-touch & palm lock: ignore secondary fingers while one finger/stylus is already drawing
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
      if (kind === 'stylus' && activePointerKindRef.current === 'finger') {
        // Allow stylus to take over from accidental palm touch
        activePointerIdRef.current = e.pointerId;
        activePointerKindRef.current = kind;
      } else {
        return;
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const mapped = mapClientToCanvas(e.clientX, e.clientY);
    if (!mapped) return;

    activePointerIdRef.current = e.pointerId;
    activePointerKindRef.current = kind;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors on certain iOS WebKit builds
    }

    const p = extractPressure(e);
    engine.onPointerDown(
      mapped.x,
      mapped.y,
      p,
      kind,
      e.pointerId,
      e.tiltX || 0,
      e.tiltY || 0,
      e.buttons || 1
    );
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
      return;
    }

    // If mouse button was released outside window, terminate stroke immediately
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      activePointerIdRef.current = null;
      engine.onPointerUp('mouse', e.pointerId, 0);
      return;
    }

    const kind = extractPointerKind(e);
    const nativeEv = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const coalesced =
      typeof nativeEv.getCoalescedEvents === 'function' ? nativeEv.getCoalescedEvents() : null;

    if (coalesced && coalesced.length > 1) {
      for (const ce of coalesced) {
        const mappedPt = mapClientToCanvas(ce.clientX, ce.clientY);
        if (!mappedPt) continue;
        const cp =
          typeof ce.pressure === 'number' && ce.pressure > 0 && ce.pressure <= 1
            ? ce.pressure
            : extractPressure(e);
        engine.onPointerMove(
          mappedPt.x,
          mappedPt.y,
          cp,
          kind,
          e.pointerId,
          ce.tiltX || e.tiltX || 0,
          ce.tiltY || e.tiltY || 0,
          ce.buttons || e.buttons || 1
        );
      }
      return;
    }

    const mapped = mapClientToCanvas(e.clientX, e.clientY);
    if (!mapped) return;

    const p = extractPressure(e);
    engine.onPointerMove(
      mapped.x,
      mapped.y,
      p,
      kind,
      e.pointerId,
      e.tiltX || 0,
      e.tiltY || 0,
      e.buttons || 1
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    try {
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore on iOS Safari
    }

    activePointerIdRef.current = null;
    const kind = extractPointerKind(e);
    engine.onPointerUp(kind, e.pointerId, e.buttons);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    try {
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore on iOS Safari
    }

    activePointerIdRef.current = null;
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
