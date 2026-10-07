import {
  BrushMode,
  BrushSettings,
  InputEventData,
  NormalizedRect,
  PointerKind,
  PrecisionMode,
  PressureCurveType,
  Stroke,
  StrokePoint,
  WritingAnchor,
  WritingScalePreset,
} from '../types/index.ts';
import { OneEuroFilter2D } from './oneEuroFilter.ts';
import { transformPressure } from './pressureCurves.ts';

export class DrawingEngine {
  private static instance: DrawingEngine;

  // Stroke collections
  public strokes: Stroke[] = [];
  public currentStroke: Stroke | null = null;
  private undoStack: Stroke[][] = [];
  private redoStack: Stroke[][] = [];

  // Brush settings
  public brushSettings: BrushSettings = {
    color: '#00E5FF',
    baseWidth: 3.5,
    pressureSensitivity: 0.75,
    opacity: 1.0,
    mode: 'pen',
    smoothing: true,
    smoothingStrength: 3,
  };

  // Modes & Calibration
  public precisionMode: PrecisionMode = 'proAdaptive';
  public pressureCurve: PressureCurveType = 'standard';
  public fullScreenTabletMode = false; // Default: 16:9 PC Fit mode for 1:1 true circle geometry!
  public directTabletMode = false;
  public palmRejection = true;
  public stylusOnlyMode = false;
  public enablePrediction = true;
  public predictedPosition: { x: number; y: number } | null = null;
  public showCenterGuide = false;
  public showPerformanceHUD = true;

  // Custom Box / Snipping Tool
  public customBoxEnabled = false;
  public isSnippingBox = false;
  public boxMapsToFullScreen = false;
  public customBoxNormalized: NormalizedRect = {
    left: 0.15,
    top: 0.15,
    right: 0.85,
    bottom: 0.85,
  };

  // Writing scale & anchor
  public writingScale: WritingScalePreset = 'full';
  public writingAnchor: WritingAnchor = 'topLeft';

  // Filters
  private oneEuro = new OneEuroFilter2D(1.2, 0.008, 1.0);
  private recentPointsForSmoothing: { x: number; y: number }[] = [];

  // Telemetry
  public liveFps = 60;
  public livePollingRateHz = 120;
  private frameCount = 0;
  private lastFpsTime = Date.now();
  private sampleCount = 0;
  private lastSampleTime = Date.now();

  // Canvas bounds (client-relative)
  public canvasWidth = 1920;
  public canvasHeight = 1080;
  public serverAspectRatio = 16 / 9;

  // DPI & Coordinate Diagnostic Telemetry
  public latestDiagnosticLog = 'Diagnostic system ready. Waiting for input stream...';
  public diagnosticLogs: string[] = [];

  // Sequence numbering
  private sequenceCounter = 0;

  // Event stream callback
  public onInputGenerated?: (event: InputEventData) => void;

  private listeners: Set<() => void> = new Set();

  public static getInstance(): DrawingEngine {
    if (!DrawingEngine.instance) {
      DrawingEngine.instance = new DrawingEngine();
    }
    return DrawingEngine.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  public recordDiagnostic(log: string): void {
    this.latestDiagnosticLog = log;
    this.diagnosticLogs.unshift(log);
    if (this.diagnosticLogs.length > 50) {
      this.diagnosticLogs.pop();
    }
    this.notify();
  }

  public updateCanvasDimensions(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.canvasWidth = width;
      this.canvasHeight = height;
    }
  }

  public recordFrame(): void {
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 500) {
      const dt = (now - this.lastFpsTime) / 1000;
      this.liveFps = Math.min(144, Math.round(this.frameCount / dt));
      this.frameCount = 0;
      this.lastFpsTime = now;
      this.notify();
    }
  }

  private recordSample(): void {
    this.sampleCount++;
    const now = Date.now();
    if (now - this.lastSampleTime >= 500) {
      const dt = (now - this.lastSampleTime) / 1000;
      this.livePollingRateHz = Math.min(240, Math.round(this.sampleCount / dt));
      this.sampleCount = 0;
      this.lastSampleTime = now;
      this.notify();
    }
  }

  public updateBrush(settings: Partial<BrushSettings>): void {
    this.brushSettings = { ...this.brushSettings, ...settings };
    this.notify();
  }

  // Pointer Down
  public onPointerDown(
    localX: number,
    localY: number,
    pressure = 0.5,
    pointerType: PointerKind = 'finger',
    pointerId = 0,
    tiltX = 0,
    tiltY = 0,
    buttons = 1
  ): void {
    // Palm rejection: if palm rejection is on and a stylus is detected or stylus-only mode is active, reject large contact or non-stylus
    if (this.stylusOnlyMode && pointerType === 'finger') return;

    this.recordSample();
    this.oneEuro.reset();
    this.recentPointsForSmoothing = [];

    // Push previous state onto undo stack
    this.saveSnapshot();
    this.redoStack = [];

    // Transform pressure through selected curve
    const calibratedPressure = transformPressure(pressure, this.pressureCurve);

    // Filter position if proAdaptive mode
    let posX = localX;
    let posY = localY;

    if (this.precisionMode === 'proAdaptive') {
      const filtered = this.oneEuro.filter(posX, posY, Date.now());
      posX = filtered.x;
      posY = filtered.y;
    }

    this.recentPointsForSmoothing.push({ x: posX, y: posY });

    // Calculate dynamic stroke width
    const calculatedWidth = this.calculatePointWidth(calibratedPressure);

    const firstPoint: StrokePoint = {
      x: posX,
      y: posY,
      pressure: calibratedPressure,
      pointerType,
      width: calculatedWidth,
      timestamp: Date.now(),
      tiltX,
      tiltY,
    };

    this.currentStroke = {
      id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      points: [firstPoint],
      settings: { ...this.brushSettings },
      startTime: Date.now(),
    };

    // Emit InputEventData (normalized 0..1 coordinates)
    this.emitEvent('pointerDown', posX, posY, calibratedPressure, pointerType, pointerId, tiltX, tiltY, buttons);
    this.notify();
  }

  // Pointer Move
  public onPointerMove(
    localX: number,
    localY: number,
    pressure = 0.5,
    pointerType: PointerKind = 'finger',
    pointerId = 0,
    tiltX = 0,
    tiltY = 0,
    buttons = 1
  ): void {
    if (!this.currentStroke) return;
    if (this.stylusOnlyMode && pointerType === 'finger') return;

    this.recordSample();

    const calibratedPressure = transformPressure(pressure, this.pressureCurve);

    let posX = localX;
    let posY = localY;

    if (this.precisionMode === 'proAdaptive') {
      const filtered = this.oneEuro.filter(posX, posY, Date.now());
      posX = filtered.x;
      posY = filtered.y;
    } else if (this.precisionMode === 'studioSmooth') {
      // 3-point moving average
      this.recentPointsForSmoothing.push({ x: posX, y: posY });
      if (this.recentPointsForSmoothing.length > 4) {
        this.recentPointsForSmoothing.shift();
      }
      const sum = this.recentPointsForSmoothing.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 }
      );
      posX = sum.x / this.recentPointsForSmoothing.length;
      posY = sum.y / this.recentPointsForSmoothing.length;
    }

    // Predictive lead-point
    if (this.enablePrediction && this.currentStroke.points.length >= 2) {
      const last = this.currentStroke.points[this.currentStroke.points.length - 1];
      const vx = posX - last.x;
      const vy = posY - last.y;
      this.predictedPosition = {
        x: posX + vx * 0.4,
        y: posY + vy * 0.4,
      };
    } else {
      this.predictedPosition = null;
    }

    // Velocity-based dynamic tapering for natural cursive handwriting
    let velocity = 0;
    if (this.currentStroke.points.length > 0) {
      const last = this.currentStroke.points[this.currentStroke.points.length - 1];
      const dt = Math.max(1, Date.now() - last.timestamp);
      const dist = Math.hypot(posX - last.x, posY - last.y);
      velocity = dist / dt; // pixels per ms
    }

    const calculatedWidth = this.calculatePointWidth(calibratedPressure, velocity);

    const point: StrokePoint = {
      x: posX,
      y: posY,
      pressure: calibratedPressure,
      pointerType,
      width: calculatedWidth,
      timestamp: Date.now(),
      tiltX,
      tiltY,
    };

    this.currentStroke.points.push(point);
    this.emitEvent('pointerMove', posX, posY, calibratedPressure, pointerType, pointerId, tiltX, tiltY, buttons);
    this.notify();
  }

  // Pointer Up
  public onPointerUp(
    pointerType: PointerKind = 'finger',
    pointerId = 0,
    buttons = 0
  ): void {
    if (!this.currentStroke) return;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    const posX = lastPoint ? lastPoint.x : 0;
    const posY = lastPoint ? lastPoint.y : 0;
    const p = lastPoint ? lastPoint.pressure : 0.0;

    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
    this.predictedPosition = null;

    this.emitEvent('pointerUp', posX, posY, p, pointerType, pointerId, 0, 0, buttons);
    this.notify();
  }

  // Pointer Cancel
  public onPointerCancel(pointerType: PointerKind = 'finger', pointerId = 0): void {
    if (this.currentStroke) {
      this.strokes.push(this.currentStroke);
      this.currentStroke = null;
    }
    this.predictedPosition = null;
    this.emitEvent('pointerCancel', 0, 0, 0, pointerType, pointerId, 0, 0, 0);
    this.notify();
  }

  private calculatePointWidth(calibratedPressure: number, velocity = 0): number {
    const base = this.brushSettings.baseWidth;
    const sens = this.brushSettings.pressureSensitivity;
    if (this.brushSettings.mode === 'eraser') {
      return base * 2.2;
    }
    if (this.brushSettings.mode === 'highlighter') {
      return base * 3.5;
    }
    if (this.brushSettings.mode === 'pencil') {
      return base * (0.6 + calibratedPressure * 0.4 * sens);
    }
    // Dynamic handwriting tapering: fast strokes thin slightly for cursive calligraphy
    const velocityFactor = Math.max(0.7, Math.min(1.25, 1.05 - velocity * 0.06));
    return base * (0.35 + calibratedPressure * 0.9 * sens) * velocityFactor;
  }

  private emitEvent(
    type: InputEventData['type'],
    rawX: number,
    rawY: number,
    pressure: number,
    pointerType: PointerKind,
    pointerId: number,
    tiltX: number,
    tiltY: number,
    buttons: number
  ): void {
    const maxW = Math.max(1, this.canvasWidth - 1);
    const maxH = Math.max(1, this.canvasHeight - 1);
    let normX = rawX / maxW;
    let normY = rawY / maxH;

    // Scale writing area if compact or medium preset
    if (this.writingScale === 'compact') {
      normX = this.writingAnchor === 'center' ? (normX - 0.5) * 0.5 + 0.5 : normX * 0.5;
      normY = this.writingAnchor === 'center' ? (normY - 0.5) * 0.5 + 0.5 : normY * 0.5;
    } else if (this.writingScale === 'medium') {
      normX = this.writingAnchor === 'center' ? (normX - 0.5) * 0.75 + 0.5 : normX * 0.75;
      normY = this.writingAnchor === 'center' ? (normY - 0.5) * 0.75 + 0.5 : normY * 0.75;
    }

    // Custom Box mapping
    if (this.customBoxEnabled && this.boxMapsToFullScreen) {
      const box = this.customBoxNormalized;
      const bw = box.right - box.left;
      const bh = box.bottom - box.top;
      if (bw > 0.05 && bh > 0.05) {
        normX = Math.max(0, Math.min(1, (normX - box.left) / bw));
        normY = Math.max(0, Math.min(1, (normY - box.top) / bh));
      }
    }

    const event: InputEventData = {
      type,
      x: Math.max(0, Math.min(1, normX)),
      y: Math.max(0, Math.min(1, normY)),
      pressure: Math.max(0, Math.min(1, pressure)),
      pointerType,
      pointerId,
      tiltX,
      tiltY,
      buttons,
      sequenceNumber: ++this.sequenceCounter,
      timestamp: Date.now(),
    };

    this.onInputGenerated?.(event);
  }

  // Handle incoming remote stroke event (Server mode)
  public handleIncomingInputEvent(event: InputEventData): void {
    const maxW = Math.max(1, this.canvasWidth - 1);
    const maxH = Math.max(1, this.canvasHeight - 1);
    const rawX = event.x * maxW;
    const rawY = event.y * maxH;
    const pressure = event.pressure;

    // Log coordinate transformation telemetry in the requested diagnostic format
    const targetX = Math.round(event.x * maxW);
    const targetY = Math.round(event.y * maxH);
    const diagLog = `Incoming (${event.x.toFixed(4)}, ${event.y.toFixed(4)}) -> Target Screen Bounds [0, 0, ${this.canvasWidth}, ${this.canvasHeight}] -> Calculated (${targetX}, ${targetY}) -> Injected Cursor Pos (${targetX}, ${targetY})`;
    this.recordDiagnostic(diagLog);

    if (event.type === 'pointerDown') {
      if (this.currentStroke) {
        this.strokes.push(this.currentStroke);
      }
      const width = this.calculatePointWidth(pressure);
      this.currentStroke = {
        id: 'remote_' + Date.now(),
        points: [
          {
            x: rawX,
            y: rawY,
            pressure,
            pointerType: event.pointerType,
            width,
            timestamp: event.timestamp,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
          },
        ],
        settings: { ...this.brushSettings },
        startTime: event.timestamp,
      };
      this.notify();
    } else if (event.type === 'pointerMove') {
      const width = this.calculatePointWidth(pressure);
      if (!this.currentStroke) {
        this.currentStroke = {
          id: 'remote_' + Date.now(),
          points: [
            {
              x: rawX,
              y: rawY,
              pressure,
              pointerType: event.pointerType,
              width,
              timestamp: event.timestamp,
              tiltX: event.tiltX,
              tiltY: event.tiltY,
            },
          ],
          settings: { ...this.brushSettings },
          startTime: event.timestamp,
        };
      } else {
        this.currentStroke.points.push({
          x: rawX,
          y: rawY,
          pressure,
          pointerType: event.pointerType,
          width,
          timestamp: event.timestamp,
          tiltX: event.tiltX,
          tiltY: event.tiltY,
        });
      }
      this.notify();
    } else if (event.type === 'pointerUp' || event.type === 'pointerCancel') {
      if (this.currentStroke) {
        this.strokes.push(this.currentStroke);
        this.currentStroke = null;
        this.notify();
      }
    } else if (event.type === 'clear') {
      this.clearCanvas();
    }
  }

  private saveSnapshot(): void {
    this.undoStack.push(JSON.parse(JSON.stringify(this.strokes)));
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
  }

  public undo(): void {
    if (this.undoStack.length > 0) {
      this.redoStack.push(JSON.parse(JSON.stringify(this.strokes)));
      this.strokes = this.undoStack.pop() || [];
      this.notify();
    }
  }

  public redo(): void {
    if (this.redoStack.length > 0) {
      this.undoStack.push(JSON.parse(JSON.stringify(this.strokes)));
      this.strokes = this.redoStack.pop() || [];
      this.notify();
    }
  }

  public clearCanvas(): void {
    if (this.strokes.length > 0 || this.currentStroke !== null) {
      this.saveSnapshot();
      this.strokes = [];
      this.currentStroke = null;
      this.notify();
    }
  }

  public setCustomBoxPreset(preset: 'centeredLarge' | 'topHalf' | 'bottomHalf' | 'cornerCompact'): void {
    switch (preset) {
      case 'centeredLarge':
        this.customBoxNormalized = { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 };
        break;
      case 'topHalf':
        this.customBoxNormalized = { left: 0.05, top: 0.05, right: 0.95, bottom: 0.5 };
        break;
      case 'bottomHalf':
        this.customBoxNormalized = { left: 0.05, top: 0.5, right: 0.95, bottom: 0.95 };
        break;
      case 'cornerCompact':
        this.customBoxNormalized = { left: 0.05, top: 0.05, right: 0.55, bottom: 0.55 };
        break;
    }
    this.notify();
  }
}
