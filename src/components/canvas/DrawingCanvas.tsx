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
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const committedInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerKindRef = useRef<PointerKind>('finger');
  const lastBgKeyRef = useRef<string>('');
  const committedStateRef = useRef<{
    count: number;
    lastId: string | null;
    firstId: string | null;
    w: number;
    h: number;
    dpr: number;
  }>({ count: -1, lastId: null, firstId: null, w: 0, h: 0, dpr: 1 });
  const lastRenderVersionRef = useRef<number>(-1);
  const forceDirtyRef = useRef<boolean>(true);

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

      if (!bgCanvasRef.current) bgCanvasRef.current = document.createElement('canvas');
      bgCanvasRef.current.width = targetPixelW;
      bgCanvasRef.current.height = targetPixelH;

      if (!committedInkCanvasRef.current) committedInkCanvasRef.current = document.createElement('canvas');
      committedInkCanvasRef.current.width = targetPixelW;
      committedInkCanvasRef.current.height = targetPixelH;

      if (!inkCanvasRef.current) inkCanvasRef.current = document.createElement('canvas');
      inkCanvasRef.current.width = targetPixelW;
      inkCanvasRef.current.height = targetPixelH;

      lastBgKeyRef.current = '';
      committedStateRef.current.count = -1;
      forceDirtyRef.current = true;

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

  // Main Render Loop (Cached Static Background + Incremental Committed Strokes + Live Stroke Overlay)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (
      !forceDirtyRef.current &&
      lastRenderVersionRef.current === engine.renderVersion
    ) {
      return;
    }
    forceDirtyRef.current = false;
    lastRenderVersionRef.current = engine.renderVersion;

    const ctx =
      canvas.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings) ||
      canvas.getContext('2d');
    if (!ctx) return;

    engine.recordFrame();

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // 1. Cached Static Background & Grid Layer (only re-rendered when dimensions, grid, image, or custom box change)
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
      bgCanvas.width = canvas.width;
      bgCanvas.height = canvas.height;
      lastBgKeyRef.current = '';
    }
    const box = engine.customBoxNormalized;
    const bgKey = `${canvas.width}x${canvas.height}:${dpr}:${showGrid ? 1 : 0}:${engine.backgroundImage ? engine.backgroundImage.src.length : 0}:${engine.customBoxEnabled ? `${box.left},${box.top},${box.right},${box.bottom}` : '0'}`;

    if (lastBgKeyRef.current !== bgKey) {
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) {
        lastBgKeyRef.current = bgKey;
        bgCtx.save();
        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
        bgCtx.scale(dpr, dpr);

        bgCtx.fillStyle = '#0A0A12';
        bgCtx.fillRect(0, 0, w, h);

        if (engine.backgroundImage) {
          bgCtx.drawImage(engine.backgroundImage, 0, 0, w, h);
        }

        if (showGrid) {
          bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
          bgCtx.lineWidth = 0.5;
          const step = 40;
          bgCtx.beginPath();
          for (let x = 0; x <= w; x += step) {
            bgCtx.moveTo(x, 0);
            bgCtx.lineTo(x, h);
          }
          for (let y = 0; y <= h; y += step) {
            bgCtx.moveTo(0, y);
            bgCtx.lineTo(w, y);
          }
          bgCtx.stroke();
        }

        if (engine.customBoxEnabled) {
          const bx = box.left * w;
          const by = box.top * h;
          const bw = (box.right - box.left) * w;
          const bh = (box.bottom - box.top) * h;

          bgCtx.fillStyle = 'rgba(0, 0, 0, 0.52)';
          bgCtx.fillRect(0, 0, w, by);
          bgCtx.fillRect(0, by + bh, w, h - (by + bh));
          bgCtx.fillRect(0, by, bx, bh);
          bgCtx.fillRect(bx + bw, by, w - (bx + bw), bh);

          bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
          bgCtx.lineWidth = 1.8;
          bgCtx.strokeRect(bx, by, bw, bh);

          const cLen = 16;
          bgCtx.strokeStyle = '#00E5FF';
          bgCtx.lineWidth = 3.5;
          bgCtx.lineCap = 'round';
          bgCtx.beginPath();
          bgCtx.moveTo(bx, by + cLen);
          bgCtx.lineTo(bx, by);
          bgCtx.lineTo(bx + cLen, by);
          bgCtx.moveTo(bx + bw - cLen, by);
          bgCtx.lineTo(bx + bw, by);
          bgCtx.lineTo(bx + bw, by + cLen);
          bgCtx.moveTo(bx, by + bh - cLen);
          bgCtx.lineTo(bx, by + bh);
          bgCtx.lineTo(bx + cLen, by + bh);
          bgCtx.moveTo(bx + bw - cLen, by + bh);
          bgCtx.lineTo(bx + bw, by + bh);
          bgCtx.lineTo(bx + bw, by + bh - cLen);
          bgCtx.stroke();
        }

        bgCtx.restore();
      }
    }

    // Helper: Render a single stroke with C1 midpoint quadratic Bézier interpolation onto a target ink context
    const drawStrokeOnCtx = (targetCtx: CanvasRenderingContext2D, stroke: Stroke) => {
      const pts = stroke.points;
      if (pts.length === 0) return;

      const spanW = Math.max(1, w - 1);
      const spanH = Math.max(1, h - 1);
      const getX = (p: (typeof pts)[0]) => (p.normX !== undefined ? p.normX * spanW : p.x);
      const getY = (p: (typeof pts)[0]) => (p.normY !== undefined ? p.normY * spanH : p.y);

      const isEraser =
        stroke.settings.mode === 'eraser' ||
        pts.some((p) => p.pointerType === 'eraser');
      const isHighlighter = stroke.settings.mode === 'highlighter';

      targetCtx.save();
      if (isEraser) {
        targetCtx.strokeStyle = 'rgba(0,0,0,1)';
        targetCtx.fillStyle = 'rgba(0,0,0,1)';
        targetCtx.globalAlpha = 1.0;
        targetCtx.globalCompositeOperation = 'destination-out';
      } else if (isHighlighter) {
        targetCtx.strokeStyle = stroke.settings.color;
        targetCtx.fillStyle = stroke.settings.color;
        targetCtx.globalAlpha = 0.35;
        targetCtx.globalCompositeOperation = 'source-over';
      } else {
        targetCtx.strokeStyle = stroke.settings.color;
        targetCtx.fillStyle = stroke.settings.color;
        targetCtx.globalAlpha = Math.max(0.1, Math.min(1.0, stroke.settings.opacity));
        targetCtx.globalCompositeOperation = 'source-over';
      }

      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';

      if (pts.length === 1) {
        const pt = pts[0];
        targetCtx.beginPath();
        targetCtx.arc(getX(pt), getY(pt), Math.max(1, pt.width / 2), 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();
        return;
      }

      if (pts.length === 2) {
        const p0 = pts[0];
        const p1 = pts[1];
        targetCtx.lineWidth = Math.max(0.8, (p0.width + p1.width) / 2);
        targetCtx.beginPath();
        targetCtx.moveTo(getX(p0), getY(p0));
        targetCtx.lineTo(getX(p1), getY(p1));
        targetCtx.stroke();
        targetCtx.restore();
        return;
      }

      // 1. First half-segment from point 0 to midpoint(0, 1)
      const p0 = pts[0];
      const p1 = pts[1];
      const x0 = getX(p0);
      const y0 = getY(p0);
      const x1 = getX(p1);
      const y1 = getY(p1);
      targetCtx.lineWidth = Math.max(0.8, (p0.width + p1.width) / 2);
      targetCtx.beginPath();
      targetCtx.moveTo(x0, y0);
      targetCtx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
      targetCtx.stroke();

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

        targetCtx.lineWidth = Math.max(0.8, (prev.width + curr.width + next.width) / 3);
        targetCtx.beginPath();
        targetCtx.moveTo(midPrevX, midPrevY);
        targetCtx.quadraticCurveTo(cx, cy, midNextX, midNextY);
        targetCtx.stroke();
      }

      // 3. Final half-segment from midpoint(n-2, n-1) to last point(n-1)
      const prevLast = pts[pts.length - 2];
      const last = pts[pts.length - 1];
      const plx = getX(prevLast);
      const ply = getY(prevLast);
      const lx = getX(last);
      const ly = getY(last);
      targetCtx.lineWidth = Math.max(0.8, (prevLast.width + last.width) / 2);
      targetCtx.beginPath();
      targetCtx.moveTo((plx + lx) / 2, (ply + ly) / 2);
      targetCtx.lineTo(lx, ly);
      targetCtx.stroke();

      targetCtx.restore();
    };

    // 2. Incremental Committed Ink Layer (O(1) append on stroke end; full rebuild only on undo/clear/resize)
    if (!committedInkCanvasRef.current) {
      committedInkCanvasRef.current = document.createElement('canvas');
    }
    const committedCanvas = committedInkCanvasRef.current;
    if (committedCanvas.width !== canvas.width || committedCanvas.height !== canvas.height) {
      committedCanvas.width = canvas.width;
      committedCanvas.height = canvas.height;
      committedStateRef.current.count = -1;
    }

    const committedCtx = committedCanvas.getContext('2d');
    if (committedCtx) {
      const strokes = engine.strokes;
      const count = strokes.length;
      const firstId = count > 0 ? strokes[0].id : null;
      const lastId = count > 0 ? strokes[count - 1].id : null;
      const prev = committedStateRef.current;

      const isIncrementalAppend =
        prev.count >= 0 &&
        prev.w === canvas.width &&
        prev.h === canvas.height &&
        prev.dpr === dpr &&
        count === prev.count + 1 &&
        (prev.count === 0 || prev.firstId === firstId);

      const isIdentical =
        prev.count === count &&
        prev.w === canvas.width &&
        prev.h === canvas.height &&
        prev.dpr === dpr &&
        prev.firstId === firstId &&
        prev.lastId === lastId;

      if (isIncrementalAppend) {
        committedCtx.save();
        committedCtx.setTransform(1, 0, 0, 1, 0, 0);
        committedCtx.scale(dpr, dpr);
        drawStrokeOnCtx(committedCtx, strokes[count - 1]);
        committedCtx.restore();
      } else if (!isIdentical) {
        committedCtx.save();
        committedCtx.setTransform(1, 0, 0, 1, 0, 0);
        committedCtx.clearRect(0, 0, committedCanvas.width, committedCanvas.height);
        committedCtx.scale(dpr, dpr);
        for (const stroke of strokes) {
          drawStrokeOnCtx(committedCtx, stroke);
        }
        committedCtx.restore();
      }

      committedStateRef.current = {
        count,
        firstId,
        lastId,
        w: canvas.width,
        h: canvas.height,
        dpr,
      };
    }

    // 3. Blit cached background onto display canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCanvas, 0, 0);

    // 4. Composite Ink Layer (blit committed strokes + draw only active strokes if any)
    const hasActiveStrokes = Boolean(engine.currentStroke || engine.currentRemoteStroke);
    if (!hasActiveStrokes) {
      ctx.drawImage(committedCanvas, 0, 0);
    } else {
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
        inkCtx.drawImage(committedCanvas, 0, 0);
        inkCtx.scale(dpr, dpr);

        if (engine.currentStroke) {
          drawStrokeOnCtx(inkCtx, engine.currentStroke);
        }
        if (engine.currentRemoteStroke) {
          drawStrokeOnCtx(inkCtx, engine.currentRemoteStroke);
        }
        inkCtx.restore();

        ctx.drawImage(inkCanvas, 0, 0);
      }
    }
    ctx.restore();

    // 5. Live cursor / hover indicator & center diagnostic guide
    ctx.save();
    ctx.scale(dpr, dpr);

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
    forceDirtyRef.current = true;
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
      const mappedUp = mapClientToCanvas(e.clientX, e.clientY);
      engine.onPointerUp('mouse', e.pointerId, 0, mappedUp?.x, mappedUp?.y);
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
    const mapped = mapClientToCanvas(e.clientX, e.clientY);
    engine.onPointerUp(kind, e.pointerId, e.buttons, mapped?.x, mapped?.y);
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
