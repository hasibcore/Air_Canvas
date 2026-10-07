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
} from 'lucide-react';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { Stroke } from '../../types/index.ts';
import { LicenseService } from '../../services/licenseService.ts';
import { Crown } from 'lucide-react';

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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentPtsRef = useRef<{ x: number; y: number; width: number }[]>([]);

  const currentPage = pages[activePageIndex] || pages[0];

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

  // Sync incoming tablet strokes to current studio page
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      // Whenever engine has strokes from remote or local, keep studio synchronized if tablet drawing
      if (engine.strokes.length > 0 && engine.currentStroke === null) {
        setPages((prev) => {
          const updated = [...prev];
          const curr = updated[activePageIndex];
          if (curr) {
            // merge recent strokes
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
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }, []);

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

    // Draw completed strokes
    for (const stroke of currentPage.strokes) {
      const pts = stroke.points;
      if (pts.length === 0) continue;

      ctx.save();
      if (stroke.settings.mode === 'eraser') {
        ctx.strokeStyle = paper === 'white' ? '#FFFFFF' : '#07111D';
        ctx.fillStyle = paper === 'white' ? '#FFFFFF' : '#07111D';
      } else if (stroke.settings.mode === 'highlighter') {
        ctx.strokeStyle = stroke.settings.color;
        ctx.fillStyle = stroke.settings.color;
        ctx.globalAlpha = 0.35;
      } else {
        ctx.strokeStyle = stroke.settings.color;
        ctx.fillStyle = stroke.settings.color;
        ctx.globalAlpha = stroke.settings.opacity;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, Math.max(1, pts[0].width / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          ctx.lineWidth = Math.max(1, (p1.width + p2.width) / 2);
          ctx.beginPath();
          if (i === 0) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          } else {
            const prev = pts[i - 1];
            ctx.moveTo((prev.x + p1.x) / 2, (prev.y + p1.y) / 2);
            ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Draw active stroke or shape preview
    if (isDrawingRef.current && currentPtsRef.current.length > 0) {
      ctx.save();
      const pts = currentPtsRef.current;
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = activeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (['line', 'arrow', 'rect', 'circle'].includes(activeTool) && shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = pts[pts.length - 1];

        if (activeTool === 'line') {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        } else if (activeTool === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const headlen = 15;
          ctx.beginPath();
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headlen * Math.cos(angle - Math.PI / 6), end.y - headlen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headlen * Math.cos(angle + Math.PI / 6), end.y - headlen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        } else if (activeTool === 'rect') {
          ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (activeTool === 'circle') {
          const rx = Math.abs(end.x - start.x) / 2;
          const ry = Math.abs(end.y - start.y) / 2;
          const cx = Math.min(start.x, end.x) + rx;
          const cy = Math.min(start.y, end.y) + ry;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Freehand in-progress line
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [currentPage, activeColor, activeWidth, activeTool]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [render]);

  // Pointer interactions for direct Studio drawing
  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawingRef.current = true;
    shapeStartRef.current = { x, y };
    currentPtsRef.current = [{ x, y, width: activeWidth }];
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentPtsRef.current.push({ x, y, width: activeWidth });
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const pts = currentPtsRef.current;
    if (pts.length > 0) {
      const newStroke: Stroke = {
        id: 'studio_' + Date.now(),
        points: pts.map((p) => ({
          x: p.x,
          y: p.y,
          pressure: 0.5,
          pointerType: 'mouse',
          width: p.width,
          timestamp: Date.now(),
        })),
        settings: {
          color: activeColor,
          baseWidth: activeWidth,
          pressureSensitivity: 0.5,
          opacity: activeOpacity,
          mode: activeTool === 'eraser' ? 'eraser' : activeTool === 'highlighter' ? 'highlighter' : 'pen',
          smoothing: true,
          smoothingStrength: 3,
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

  // Export to Scalable Vector SVG (Pro Feature)
  const handleExportSVG = () => {
    if (!license.isPro) {
      onOpenProModal?.();
      return;
    }

    const canvas = canvasRef.current;
    const w = canvas ? canvas.width / (window.devicePixelRatio || 1) : 1920;
    const h = canvas ? canvas.height / (window.devicePixelRatio || 1) : 1080;

    let svgPaths = '';
    for (const stroke of currentPage.strokes) {
      if (stroke.points.length === 0) continue;
      const pts = stroke.points;
      const strokeColor = stroke.settings.mode === 'eraser' ? '#030C14' : stroke.settings.color;
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

  // Export 4K UHD Ultra-High-Res PNG (Pro Feature)
  const handleExport4K = () => {
    if (!license.isPro) {
      onOpenProModal?.();
      return;
    }

    const targetW = 3840;
    const targetH = 2160;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetW;
    offCanvas.height = targetH;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    // Fill dark background
    offCtx.fillStyle = '#030C14';
    offCtx.fillRect(0, 0, targetW, targetH);

    const canvas = canvasRef.current;
    const curW = canvas ? canvas.width / (window.devicePixelRatio || 1) : 1920;
    const curH = canvas ? canvas.height / (window.devicePixelRatio || 1) : 1080;
    const scaleX = targetW / curW;
    const scaleY = targetH / curH;

    for (const stroke of currentPage.strokes) {
      const pts = stroke.points;
      if (pts.length === 0) continue;
      offCtx.save();
      offCtx.strokeStyle = stroke.settings.mode === 'eraser' ? '#030C14' : stroke.settings.color;
      offCtx.lineWidth = stroke.settings.baseWidth * scaleX;
      offCtx.lineCap = 'round';
      offCtx.lineJoin = 'round';
      offCtx.globalAlpha = stroke.settings.opacity || 1;

      offCtx.beginPath();
      offCtx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
      for (let i = 1; i < pts.length; i++) {
        offCtx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
      }
      offCtx.stroke();
      offCtx.restore();
    }

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
          {/* Pro / Free Status Button */}
          {onOpenProModal && (
            <button
              type="button"
              onClick={onOpenProModal}
              className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                license.isPro
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Click to manage license & compare Free vs Pro features"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>{license.isPro ? 'Pro Studio' : 'Free (Upgrade)'}</span>
            </button>
          )}

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
            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow ${
              license.isPro
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                : 'bg-slate-800 text-purple-300 border border-purple-500/30 hover:bg-slate-700'
            }`}
            title={license.isPro ? 'Export scalable vector SVG' : 'Unlock Vector SVG Export in Pro'}
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Vector SVG</span>
          </button>

          <button
            type="button"
            onClick={handleExport4K}
            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow ${
              license.isPro
                ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/30'
                : 'bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:bg-slate-700'
            }`}
            title={license.isPro ? 'Export 3840x2160 Ultra-HD PNG' : 'Unlock 4K UHD Export in Pro'}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>4K UHD</span>
          </button>
        </div>
      </div>

      {/* Main Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#07111D]/90 border-b border-cyan-500/15 text-xs">
        {/* Tools */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTool('pen')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              activeTool === 'pen' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Pen className="w-3.5 h-3.5" /> Pen
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('brush')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              activeTool === 'brush' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" /> Brush
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('highlighter')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              activeTool === 'highlighter' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" /> Marker
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('eraser')}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              activeTool === 'eraser' ? 'bg-rose-500 text-white font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" /> Eraser
          </button>
        </div>

        {/* Shapes */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTool('line')}
            title="Line"
            className={`p-1.5 rounded-lg ${activeTool === 'line' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('arrow')}
            title="Arrow"
            className={`p-1.5 rounded-lg ${activeTool === 'arrow' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('rect')}
            title="Rectangle"
            className={`p-1.5 rounded-lg ${activeTool === 'rect' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('circle')}
            title="Circle"
            className={`p-1.5 rounded-lg ${activeTool === 'circle' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
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
              onClick={() => setActiveColor(c)}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-full border transition-all ${
                activeColor === c ? 'scale-125 border-white shadow' : 'border-transparent opacity-80 hover:opacity-100'
              }`}
            />
          ))}
          <input
            type="color"
            value={activeColor}
            onChange={(e) => setActiveColor(e.target.value)}
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
    </div>
  );
};
