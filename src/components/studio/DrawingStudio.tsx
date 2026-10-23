import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Share2,
  Grid,
  FileText,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Sparkles,
  ArrowLeft,
  Paintbrush,
  Palette,
  Maximize2,
  HardDrive,
} from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { Stroke } from '../../types/index.ts';
import { LicenseService } from '../../services/licenseService.ts';
import { Crown } from 'lucide-react';
import { GoogleDriveModal } from '../drive/GoogleDriveModal.tsx';

interface StudioPage {
  id: string;
  title: string;
  strokes: Stroke[];
  paperStyle: 'dark' | 'white' | 'grid' | 'ruled' | 'dots';
}

interface DrawingStudioProps {
  engine: DrawingEngine;
  connection: ConnectionManager;
  license?: LicenseService;
  onOpenProModal?: () => void;
  onExit: () => void;
}

const COLORS = [
  '#00E5FF',
  '#A855F7',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#FFFFFF',
  '#FACC15',
  '#38BDF8',
  '#EF4444',
  '#1E293B',
];

export const DrawingStudio: React.FC<DrawingStudioProps> = ({
  engine,
  connection,
  license: propLicense,
  onOpenProModal,
  onExit,
}) => {
  const license = propLicense || LicenseService.getInstance();
  const [pages, setPages] = useState<StudioPage[]>([
    {
      id: 'p1',
      title: 'Page 1',
      strokes: [],
      paperStyle: 'grid',
    },
  ]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const [activeTool, setActiveTool] = useState<
    'pen' | 'brush' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle'
  >('pen');
  const [activeColor, setActiveColor] = useState('#00E5FF');
  const [activeWidth, setActiveWidth] = useState(4);
  const [activeOpacity, setActiveOpacity] = useState(1.0);
  const [showDriveModal, setShowDriveModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentPtsRef = useRef<{ x: number; y: number; width: number }[]>([]);

  const currentPage = pages[activePageIndex] || pages[0];

  const handleOpenDrive = () => {
    engine.strokes = [...currentPage.strokes];
    setShowDriveModal(true);
  };

  // Add Page
  const handleAddPage = () => {
    const newPage: StudioPage = {
      id: 'p_' + Date.now(),
      title: `Page ${pages.length + 1}`,
      strokes: [],
      paperStyle: currentPage.paperStyle,
    };
    setPages([...pages, newPage]);
    setActivePageIndex(pages.length);
  };

  // Close Page
  const handleClosePage = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    const nextPages = pages.filter((_, i) => i !== index);
    setPages(nextPages);
    setActivePageIndex(Math.max(0, index - 1));
  };

  // Listen for keyboard shortcuts ('E' for Eraser, 'B' / 'P' for Pen/Brush) from PC keyboard or remote mobile shortcut dispatch
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = ev.key.toLowerCase();
      if (key === 'e') {
        setActiveTool('eraser');
        engine.updateBrush({ mode: 'eraser' });
      } else if (key === 'b' || key === 'p') {
        setActiveTool('pen');
        engine.updateBrush({ mode: 'pen' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  // Sync incoming tablet strokes and tool mode to current studio page
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      if (engine.brushSettings.mode === 'eraser') {
        setActiveTool((prev) => (prev === 'eraser' ? prev : 'eraser'));
      } else if (
        engine.brushSettings.mode === 'pen' ||
        engine.brushSettings.mode === 'brush' ||
        engine.brushSettings.mode === 'highlighter'
      ) {
        const mappedTool = engine.brushSettings.mode;
        setActiveTool((prev) =>
          ['line', 'arrow', 'rect', 'circle'].includes(prev) ? prev : mappedTool
        );
      }

      // Whenever engine has completed strokes from remote or local, keep studio synchronized
      if (
        engine.strokes.length > 0 &&
        engine.currentStroke === null &&
        engine.currentRemoteStroke === null
      ) {
        setPages((prev) => {
          const updated = [...prev];
          const curr = updated[activePageIndex];
          if (curr) {
            const lastEngineStroke = engine.strokes[engine.strokes.length - 1];
            if (lastEngineStroke && !curr.strokes.some((s) => s.id === lastEngineStroke.id)) {
              curr.strokes = [...curr.strokes, lastEngineStroke];
            }
          }
          return updated;
        });
      }
    });
    return unsub;
  }, [engine, activePageIndex]);

  // Canvas Resize
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

      if (!inkCanvasRef.current) {
        inkCanvasRef.current = document.createElement('canvas');
      }
      inkCanvasRef.current.width = width * dpr;
      inkCanvasRef.current.height = height * dpr;

      engine.updateCanvasDimensions(width, height);
    }
  }, [engine]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background paper
    const paper = currentPage.paperStyle;
    if (paper === 'white') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#07111D';
      ctx.fillRect(0, 0, w, h);
    }

    if (engine.backgroundImage) {
      ctx.drawImage(engine.backgroundImage, 0, 0, w, h);
    }

    // Grid / Ruled / Dots overlay
    if (paper === 'grid') {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 32;
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
    } else if (paper === 'ruled') {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.lineWidth = 1;
      const step = 28;
      ctx.beginPath();
      for (let y = 30; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    } else if (paper === 'dots') {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
      const step = 24;
      for (let x = 12; x <= w; x += step) {
        for (let y = 12; y <= h; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Dedicated Offscreen Ink Layer so pixel eraser (destination-out) cleanly wipes only ink
    // and never paints opaque lines over paper grids, dots, or background images
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

      const renderStrokeOnInk = (stroke: Stroke) => {
        const pts = stroke.points;
        if (pts.length === 0) return;

        const getX = (p: (typeof pts)[0]) => (p.normX !== undefined ? p.normX * w : p.x);
        const getY = (p: (typeof pts)[0]) => (p.normY !== undefined ? p.normY * h : p.y);

        const isEraser =
          stroke.settings.mode === 'eraser' || pts[0]?.pointerType === 'eraser';

        inkCtx.save();
        if (isEraser) {
          inkCtx.strokeStyle = 'rgba(0,0,0,1)';
          inkCtx.fillStyle = 'rgba(0,0,0,1)';
          inkCtx.globalAlpha = 1.0;
          inkCtx.globalCompositeOperation = 'destination-out';
        } else if (stroke.settings.mode === 'highlighter') {
          inkCtx.strokeStyle = stroke.settings.color;
          inkCtx.fillStyle = stroke.settings.color;
          inkCtx.globalAlpha = 0.35;
          inkCtx.globalCompositeOperation = 'source-over';
        } else {
          inkCtx.strokeStyle = stroke.settings.color;
          inkCtx.fillStyle = stroke.settings.color;
          inkCtx.globalAlpha = stroke.settings.opacity;
          inkCtx.globalCompositeOperation = 'source-over';
        }

        inkCtx.lineCap = 'round';
        inkCtx.lineJoin = 'round';

        if (pts.length === 1) {
          inkCtx.beginPath();
          inkCtx.arc(getX(pts[0]), getY(pts[0]), Math.max(1, pts[0].width / 2), 0, Math.PI * 2);
          inkCtx.fill();
        } else if (!stroke.settings.smoothing || pts.length <= 5) {
          // Linear path for geometric shapes (lines, rectangles, arrows)
          inkCtx.lineWidth = isEraser
            ? Math.max(4, (stroke.settings.baseWidth || 4) * 2.2)
            : stroke.settings.baseWidth || 3;
          inkCtx.beginPath();
          inkCtx.moveTo(getX(pts[0]), getY(pts[0]));
          for (let i = 1; i < pts.length; i++) {
            inkCtx.lineTo(getX(pts[i]), getY(pts[i]));
          }
          inkCtx.stroke();
        } else {
          // Smooth curved interpolation for freehand drawing
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            inkCtx.lineWidth = Math.max(1, (p1.width + p2.width) / 2);
            inkCtx.beginPath();
            if (i === 0) {
              inkCtx.moveTo(getX(p1), getY(p1));
              inkCtx.lineTo((getX(p1) + getX(p2)) / 2, (getY(p1) + getY(p2)) / 2);
            } else {
              const prev = pts[i - 1];
              inkCtx.moveTo((getX(prev) + getX(p1)) / 2, (getY(prev) + getY(p1)) / 2);
              inkCtx.quadraticCurveTo(
                getX(p1),
                getY(p1),
                (getX(p1) + getX(p2)) / 2,
                (getY(p1) + getY(p2)) / 2
              );
            }
            inkCtx.stroke();
          }
        }
        inkCtx.restore();
      };

      // Draw completed strokes on current page
      for (const stroke of currentPage.strokes) {
        renderStrokeOnInk(stroke);
      }

      // Draw live incoming remote stroke from Mobile Pad
      if (engine.currentRemoteStroke) {
        renderStrokeOnInk(engine.currentRemoteStroke);
      }

      // Draw live local engine stroke if any
      if (engine.currentStroke) {
        renderStrokeOnInk(engine.currentStroke);
      }

      // Draw active studio mouse/stylus stroke or shape preview
      if (isDrawingRef.current && currentPtsRef.current.length > 0) {
        inkCtx.save();
        const pts = currentPtsRef.current;
        if (activeTool === 'eraser') {
          inkCtx.strokeStyle = 'rgba(0,0,0,1)';
          inkCtx.fillStyle = 'rgba(0,0,0,1)';
          inkCtx.globalAlpha = 1.0;
          inkCtx.globalCompositeOperation = 'destination-out';
          inkCtx.lineWidth = Math.max(6, activeWidth * 2.2);
        } else {
          inkCtx.strokeStyle = activeColor;
          inkCtx.fillStyle = activeColor;
          inkCtx.globalAlpha = activeTool === 'highlighter' ? 0.35 : activeOpacity;
          inkCtx.globalCompositeOperation = 'source-over';
          inkCtx.lineWidth = activeWidth;
        }
        inkCtx.lineCap = 'round';
        inkCtx.lineJoin = 'round';

        if (['line', 'arrow', 'rect', 'circle'].includes(activeTool) && shapeStartRef.current) {
          const start = shapeStartRef.current;
          const end = pts[pts.length - 1];

          if (activeTool === 'line') {
            inkCtx.beginPath();
            inkCtx.moveTo(start.x, start.y);
            inkCtx.lineTo(end.x, end.y);
            inkCtx.stroke();
          } else if (activeTool === 'arrow') {
            inkCtx.beginPath();
            inkCtx.moveTo(start.x, start.y);
            inkCtx.lineTo(end.x, end.y);
            inkCtx.stroke();
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headlen = 15;
            inkCtx.beginPath();
            inkCtx.moveTo(end.x, end.y);
            inkCtx.lineTo(
              end.x - headlen * Math.cos(angle - Math.PI / 6),
              end.y - headlen * Math.sin(angle - Math.PI / 6)
            );
            inkCtx.moveTo(end.x, end.y);
            inkCtx.lineTo(
              end.x - headlen * Math.cos(angle + Math.PI / 6),
              end.y - headlen * Math.sin(angle + Math.PI / 6)
            );
            inkCtx.stroke();
          } else if (activeTool === 'rect') {
            inkCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
          } else if (activeTool === 'circle') {
            const rx = Math.abs(end.x - start.x) / 2;
            const ry = Math.abs(end.y - start.y) / 2;
            const cx = Math.min(start.x, end.x) + rx;
            const cy = Math.min(start.y, end.y) + ry;
            inkCtx.beginPath();
            inkCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            inkCtx.stroke();
          }
        } else {
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            inkCtx.beginPath();
            inkCtx.moveTo(p1.x, p1.y);
            inkCtx.lineTo(p2.x, p2.y);
            inkCtx.stroke();
          }
        }
        inkCtx.restore();
      }

      inkCtx.restore();

      // Composite Ink Layer onto the main Studio display canvas
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(inkCanvas, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }, [currentPage, activeColor, activeWidth, activeOpacity, activeTool, engine]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [render]);

  const selectStudioTool = (
    tool: 'pen' | 'brush' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle'
  ) => {
    setActiveTool(tool);
    if (tool === 'eraser') {
      engine.updateBrush({ mode: 'eraser' });
      connection.sendBrushUpdate({ mode: 'eraser' });
      connection.sendAction('eraserShortcut');
    } else if (tool === 'pen' || tool === 'brush' || tool === 'highlighter') {
      engine.updateBrush({ mode: tool });
      connection.sendBrushUpdate({ mode: tool });
      connection.sendAction('brushShortcut');
    }
  };

  // Pointer interactions for direct Studio drawing
  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    // Hardware stylus eraser & side barrel button auto-detection
    const rawType = (e.pointerType || '') as string;
    const isHardwareEraser =
      rawType === 'eraser' ||
      (rawType === 'pen' &&
        ((e.buttons & 32) !== 0 ||
          e.button === 5 ||
          (e.buttons & 2) !== 0 ||
          e.button === 2));

    const effectiveTool =
      isHardwareEraser || engine.brushSettings.mode === 'eraser' ? 'eraser' : activeTool;

    if (effectiveTool === 'eraser' && activeTool !== 'eraser') {
      setActiveTool('eraser');
      engine.updateBrush({ mode: 'eraser' });
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = effectiveTool === 'eraser' ? Math.max(6, activeWidth * 2.2) : activeWidth;

    isDrawingRef.current = true;
    shapeStartRef.current = { x, y };
    currentPtsRef.current = [{ x, y, width: w }];
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isEraserNow = activeTool === 'eraser' || engine.brushSettings.mode === 'eraser';
    const w = isEraserNow ? Math.max(6, activeWidth * 2.2) : activeWidth;

    currentPtsRef.current.push({ x, y, width: w });
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const pts = currentPtsRef.current;
    if (pts.length > 0) {
      const isEraserMode = activeTool === 'eraser' || engine.brushSettings.mode === 'eraser';
      let strokePoints = pts.map((p) => ({
        x: p.x,
        y: p.y,
        pressure: 0.5,
        pointerType: (isEraserMode ? 'eraser' : 'mouse') as 'eraser' | 'mouse',
        width: p.width,
        timestamp: Date.now(),
      }));

      const isShapeTool = ['line', 'arrow', 'rect', 'circle'].includes(activeTool);

      if (isShapeTool && shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = pts[pts.length - 1];

        if (activeTool === 'line') {
          strokePoints = [
            { x: start.x, y: start.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: end.x, y: end.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
          ];
        } else if (activeTool === 'rect') {
          strokePoints = [
            { x: start.x, y: start.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: end.x, y: start.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: end.x, y: end.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: start.x, y: end.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: start.x, y: start.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
          ];
        } else if (activeTool === 'circle') {
          const rx = Math.abs(end.x - start.x) / 2;
          const ry = Math.abs(end.y - start.y) / 2;
          const cx = Math.min(start.x, end.x) + rx;
          const cy = Math.min(start.y, end.y) + ry;
          const circlePts = [];
          const segments = 36;
          for (let i = 0; i <= segments; i++) {
            const th = (i / segments) * Math.PI * 2;
            circlePts.push({
              x: cx + rx * Math.cos(th),
              y: cy + ry * Math.sin(th),
              pressure: 0.5,
              pointerType: 'mouse' as const,
              width: activeWidth,
              timestamp: Date.now(),
            });
          }
          strokePoints = circlePts;
        } else if (activeTool === 'arrow') {
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const headlen = 16;
          const h1x = end.x - headlen * Math.cos(angle - Math.PI / 6);
          const h1y = end.y - headlen * Math.sin(angle - Math.PI / 6);
          const h2x = end.x - headlen * Math.cos(angle + Math.PI / 6);
          const h2y = end.y - headlen * Math.sin(angle + Math.PI / 6);
          strokePoints = [
            { x: start.x, y: start.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: end.x, y: end.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: h1x, y: h1y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: end.x, y: end.y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
            { x: h2x, y: h2y, pressure: 0.5, pointerType: 'mouse', width: activeWidth, timestamp: Date.now() },
          ];
        }
      }

      const newStroke: Stroke = {
        id: 'studio_' + Date.now(),
        points: strokePoints,
        settings: {
          color: activeColor,
          baseWidth: activeWidth,
          pressureSensitivity: 0.5,
          opacity: activeOpacity,
          mode: isEraserMode ? 'eraser' : activeTool === 'highlighter' ? 'highlighter' : 'pen',
          smoothing: !isShapeTool,
          smoothingStrength: isShapeTool ? 0 : 3,
        },
        startTime: Date.now(),
      };

      setPages((prev) => {
        const updated = [...prev];
        if (updated[activePageIndex]) {
          updated[activePageIndex].strokes.push(newStroke);
        }
        return updated;
      });
    }

    currentPtsRef.current = [];
    shapeStartRef.current = null;
  };

  // Export to PNG (Free + Pro)
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aircanvas_${currentPage.title.toLowerCase().replace(/\s+/g, '_')}.png`;
    a.click();
  };

  // Export to Scalable Vector SVG
  const handleExportSVG = () => {
    const canvas = canvasRef.current;
    const w = canvas ? canvas.width / (window.devicePixelRatio || 1) : 1920;
    const h = canvas ? canvas.height / (window.devicePixelRatio || 1) : 1080;

    let svgPaths = '';
    for (const stroke of currentPage.strokes) {
      if (stroke.points.length === 0) continue;
      if (
        stroke.settings.mode === 'eraser' ||
        stroke.points.some((p) => p.pointerType === 'eraser')
      ) {
        continue;
      }
      const pts = stroke.points;
      const strokeColor = stroke.settings.color;
      const strokeWidth = stroke.settings.baseWidth || 3;
      const opacity = stroke.settings.opacity || 1;

      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
      }

      svgPaths += `\n  <path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#030C14" />
  ${svgPaths}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aircanvas_${currentPage.title.toLowerCase().replace(/\s+/g, '_')}_vector.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export 4K UHD Ultra-High-Res PNG
  const handleExport4K = () => {
    const targetW = 3840;
    const targetH = 2160;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetW;
    offCanvas.height = targetH;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    // Fill background
    offCtx.fillStyle = currentPage.paperStyle === 'white' ? '#FFFFFF' : '#030C14';
    offCtx.fillRect(0, 0, targetW, targetH);

    const inkLayer = document.createElement('canvas');
    inkLayer.width = targetW;
    inkLayer.height = targetH;
    const inkCtx = inkLayer.getContext('2d');
    if (!inkCtx) return;

    const canvas = canvasRef.current;
    const curW = canvas ? canvas.width / (window.devicePixelRatio || 1) : 1920;
    const curH = canvas ? canvas.height / (window.devicePixelRatio || 1) : 1080;
    const scaleX = targetW / curW;
    const scaleY = targetH / curH;

    for (const stroke of currentPage.strokes) {
      const pts = stroke.points;
      if (pts.length === 0) continue;
      const isEraser =
        stroke.settings.mode === 'eraser' || pts.some((p) => p.pointerType === 'eraser');
      inkCtx.save();
      if (isEraser) {
        inkCtx.strokeStyle = 'rgba(0,0,0,1)';
        inkCtx.globalAlpha = 1.0;
        inkCtx.globalCompositeOperation = 'destination-out';
        inkCtx.lineWidth = Math.max(4, stroke.settings.baseWidth * 2.2) * scaleX;
      } else {
        inkCtx.strokeStyle = stroke.settings.color;
        inkCtx.globalAlpha = stroke.settings.opacity || 1;
        inkCtx.globalCompositeOperation = 'source-over';
        inkCtx.lineWidth = stroke.settings.baseWidth * scaleX;
      }
      inkCtx.lineCap = 'round';
      inkCtx.lineJoin = 'round';

      inkCtx.beginPath();
      inkCtx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
      for (let i = 1; i < pts.length; i++) {
        inkCtx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
      }
      inkCtx.stroke();
      inkCtx.restore();
    }

    offCtx.drawImage(inkLayer, 0, 0);

    const url = offCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aircanvas_${currentPage.title.toLowerCase().replace(/\s+/g, '_')}_4K_UHD.png`;
    a.click();
  };

  const handleClear = () => {
    setPages((prev) => {
      const updated = [...prev];
      if (updated[activePageIndex]) {
        updated[activePageIndex].strokes = [];
      }
      return updated;
    });
  };

  const handleUndo = () => {
    setPages((prev) => {
      const updated = [...prev];
      if (updated[activePageIndex] && updated[activePageIndex].strokes.length > 0) {
        updated[activePageIndex].strokes.pop();
      }
      return updated;
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#030C14] text-slate-100 select-none overflow-hidden">
      {/* Top Header & Page Tabs */}
      <div className="flex items-center justify-between bg-[#07111D] border-b border-cyan-500/20 px-3 py-1.5 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onExit}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Hub
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
            <div className="w-6 h-6 rounded bg-gradient-to-tr from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-slate-950 text-xs">
              AC
            </div>
            <span className="font-bold text-xs text-white">Drawing Studio</span>
          </div>
        </div>

        {/* Notebook Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-4">
          {pages.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => setActivePageIndex(idx)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-semibold cursor-pointer border-t-2 transition-all ${
                activePageIndex === idx
                  ? 'bg-[#030C14] border-cyan-400 text-cyan-300 shadow-md'
                  : 'bg-slate-800/40 border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{p.title}</span>
              {pages.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleClosePage(e, idx)}
                  className="hover:text-rose-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddPage}
            title="Add Page"
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-dashed border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Export & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {connection.state === 'connected' && (
            <span className="hidden sm:flex text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Mirroring Active
            </span>
          )}

          <button
            type="button"
            onClick={handleExportPNG}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 shadow"
            title="Export standard resolution PNG"
          >
            <Download className="w-3.5 h-3.5" /> PNG
          </button>

          <button
            type="button"
            onClick={handleExportSVG}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 shadow"
            title="Export scalable vector SVG"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>SVG</span>
          </button>

          <button
            type="button"
            onClick={handleExport4K}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow"
            title="Export 3840x2160 Ultra-HD PNG"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>4K PNG</span>
          </button>

          <button
            type="button"
            onClick={handleOpenDrive}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow"
            title="Save Page to or Load Artwork from Google Drive"
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Drive</span>
          </button>
        </div>
      </div>

      {/* Main Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#07111D]/90 border-b border-cyan-500/15 text-xs">
        {/* Tools */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('pen');
            }}
            onClick={() => selectStudioTool('pen')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 touch-manipulation ${
              activeTool === 'pen' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Pen className="w-3.5 h-3.5" /> Pen
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('brush');
            }}
            onClick={() => selectStudioTool('brush')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 touch-manipulation ${
              activeTool === 'brush' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" /> Brush
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('highlighter');
            }}
            onClick={() => selectStudioTool('highlighter')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 touch-manipulation ${
              activeTool === 'highlighter' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" /> Marker
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('eraser');
            }}
            onClick={() => selectStudioTool('eraser')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 touch-manipulation ${
              activeTool === 'eraser' ? 'bg-rose-500 text-white font-bold shadow-[0_0_10px_rgba(244,63,94,0.45)]' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" /> Eraser
          </button>
        </div>

        {/* Shapes */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('line');
            }}
            onClick={() => selectStudioTool('line')}
            title="Line"
            className={`p-1.5 rounded-lg touch-manipulation ${activeTool === 'line' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('arrow');
            }}
            onClick={() => selectStudioTool('arrow')}
            title="Arrow"
            className={`p-1.5 rounded-lg touch-manipulation ${activeTool === 'arrow' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('rect');
            }}
            onClick={() => selectStudioTool('rect')}
            title="Rectangle"
            className={`p-1.5 rounded-lg touch-manipulation ${activeTool === 'rect' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              selectStudioTool('circle');
            }}
            onClick={() => selectStudioTool('circle')}
            title="Circle"
            className={`p-1.5 rounded-lg touch-manipulation ${activeTool === 'circle' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Circle className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Colors */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-800">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                setActiveColor(c);
                engine.updateBrush({ color: c, mode: activeTool === 'eraser' ? 'pen' : undefined });
                if (activeTool === 'eraser') setActiveTool('pen');
              }}
              onClick={() => {
                setActiveColor(c);
                engine.updateBrush({ color: c, mode: activeTool === 'eraser' ? 'pen' : undefined });
                if (activeTool === 'eraser') setActiveTool('pen');
              }}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-full border transition-all touch-manipulation ${
                activeTool !== 'eraser' && activeColor === c ? 'scale-125 border-white shadow' : 'border-transparent opacity-80 hover:opacity-100'
              }`}
            />
          ))}
          <input
            type="color"
            value={activeColor}
            onChange={(e) => {
              setActiveColor(e.target.value);
              if (activeTool === 'eraser') {
                setActiveTool('pen');
                engine.updateBrush({ color: e.target.value, mode: 'pen' });
              }
            }}
            className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0 p-0"
          />
        </div>

        {/* Paper style selector */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold px-1.5">Paper</span>
          {(['grid', 'ruled', 'dots', 'dark', 'white'] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => {
                setPages((prev) => {
                  const updated = [...prev];
                  if (updated[activePageIndex]) updated[activePageIndex].paperStyle = style;
                  return updated;
                });
              }}
              className={`px-2 py-0.5 rounded text-[11px] capitalize font-medium ${
                currentPage.paperStyle === style ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {style}
            </button>
          ))}
        </div>

        {/* Undo / Clear */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            title="Undo"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            title="Clear Page"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Studio Canvas Area */}
      <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden bg-[#07111D]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="block w-full h-full cursor-crosshair touch-none"
        />
      </div>

      {/* Google Drive Cloud Storage Modal */}
      <GoogleDriveModal
        isOpen={showDriveModal}
        onClose={() => {
          setShowDriveModal(false);
          if (engine.strokes.length > 0) {
            setPages((prev) => {
              const updated = [...prev];
              if (updated[activePageIndex]) {
                updated[activePageIndex].strokes = [...engine.strokes];
              }
              return updated;
            });
          }
        }}
        engine={engine}
      />
    </div>
  );
};
