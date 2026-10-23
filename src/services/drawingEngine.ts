import {
  BrushSettings,
  InputEventData,
  NormalizedRect,
  PcSoftwareProfile,
  PcSoftwareProfileId,
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

export const PC_SOFTWARE_PROFILES: PcSoftwareProfile[] = [
  {
    id: 'autoDetect',
    name: 'Auto-Detect PC Working Area',
    shortName: 'Auto-Detect',
    description: 'Automatically detects active PC software working area and maps 100% Mobile Full Pad 1:1',
    workingArea: { left: 0.04, top: 0.08, right: 0.86, bottom: 0.96 },
    topBarLabel: 'Auto-Detected App Header & Menu (8%)',
    leftDockLabel: 'Tools (4%)',
    rightDockLabel: 'Inspector / Layers (14%)',
    bottomBarLabel: 'Status (4%)',
  },
  {
    id: 'photoshop',
    name: 'Photoshop / Krita / CSP',
    shortName: 'Photoshop / Krita',
    description: 'Maps 100% Mobile Full Pad to active Studio Canvas (excludes Top Menu, Left Tools & Right Layers)',
    workingArea: { left: 0.05, top: 0.09, right: 0.82, bottom: 0.96 },
    topBarLabel: 'Menu & Options Bar (9%)',
    leftDockLabel: 'Tools (5%)',
    rightDockLabel: 'Layers & Brushes (18%)',
    bottomBarLabel: 'Status Bar (4%)',
  },
  {
    id: 'onenote',
    name: 'OneNote / PDF / Classroom',
    shortName: 'OneNote / PDF',
    description: 'Maps 100% Mobile Full Pad to Document Page Area (excludes Top Ribbon & Left Page List)',
    workingArea: { left: 0.12, top: 0.11, right: 0.98, bottom: 0.97 },
    topBarLabel: 'Ribbon Toolbar (11%)',
    leftDockLabel: 'Pages (12%)',
    rightDockLabel: 'Margin (2%)',
    bottomBarLabel: 'Status (3%)',
  },
  {
    id: 'illustrator',
    name: 'Illustrator / Affinity',
    shortName: 'Illustrator',
    description: 'Maps 100% Mobile Full Pad to Vector Artboard Viewport (excludes Toolbars & Properties)',
    workingArea: { left: 0.04, top: 0.08, right: 0.84, bottom: 0.97 },
    topBarLabel: 'Control Bar (8%)',
    leftDockLabel: 'Tools (4%)',
    rightDockLabel: 'Properties & Artboards (16%)',
    bottomBarLabel: 'Status (3%)',
  },
  {
    id: 'blender',
    name: 'Blender / ZBrush 3D',
    shortName: 'Blender / ZBrush',
    description: 'Maps 100% Mobile Full Pad to 3D Sculpting Viewport (excludes Outliner & Timeline)',
    workingArea: { left: 0.05, top: 0.06, right: 0.80, bottom: 0.88 },
    topBarLabel: 'Header & Mode Bar (6%)',
    leftDockLabel: 'Shelf (5%)',
    rightDockLabel: 'Outliner & Properties (20%)',
    bottomBarLabel: 'Timeline (12%)',
  },
  {
    id: 'mspaint',
    name: 'MS Paint / Excalidraw / Web',
    shortName: 'MS Paint / Web',
    description: 'Maps 100% Mobile Full Pad to Drawing Board Area below Top Ribbon',
    workingArea: { left: 0.02, top: 0.13, right: 0.98, bottom: 0.96 },
    topBarLabel: 'Top Ribbon & Brushes (13%)',
    leftDockLabel: '2%',
    rightDockLabel: '2%',
    bottomBarLabel: 'Status (4%)',
  },
  {
    id: 'fullScreen',
    name: 'Full PC Screen / Whiteboard',
    shortName: 'Full PC Screen',
    description: 'Maps 100% Mobile Full Pad across 100% of the entire PC Monitor (Edge-to-Edge)',
    workingArea: { left: 0.0, top: 0.0, right: 1.0, bottom: 1.0 },
  },
  {
    id: 'custom',
    name: 'Custom Software Working Area',
    shortName: 'Custom Area',
    description: 'User-calibrated PC Software Working Area mapped 1:1 with Mobile Full Screen Pad',
    workingArea: { left: 0.08, top: 0.10, right: 0.88, bottom: 0.94 },
    topBarLabel: 'Top UI Offset',
    leftDockLabel: 'Left Offset',
    rightDockLabel: 'Right Offset',
    bottomBarLabel: 'Bottom Offset',
  },
];

export class DrawingEngine {
  private static instance: DrawingEngine;

  // Stroke collections (separate local and remote active strokes so they never interleave)
  public strokes: Stroke[] = [];
  public currentStroke: Stroke | null = null;
  public currentRemoteStroke: Stroke | null = null;
  private activePointerId: number | null = null;
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
  // Mobile Full Screen is used as a Full Tablet Pad by default (100% of Mobile screen area = 100% of PC Software Working Area)
  public fullScreenTabletMode = true;
  public directTabletMode = false;
  public palmRejection = true;
  public stylusOnlyMode = false;
  public enablePrediction = false;
  public predictedPosition: { x: number; y: number } | null = null;
  public showCenterGuide = false;
  public showPerformanceHUD = false;

  // PC Software Working Area Mapping State
  // Default: Auto-Detect PC Software Working Area -> Maps 100% of Mobile Full-Screen Tablet Pad (0..1) -> 100% of active PC Software Working Area
  public activeSoftwareId: PcSoftwareProfileId = 'autoDetect';
  public softwareWorkingArea: NormalizedRect = {
    left: 0.04,
    top: 0.08,
    right: 0.86,
    bottom: 0.96,
  };

  // Pressure Smoothing & Live Pressure Telemetry
  public enablePressureSmoothing = true;
  public pressureSmoothingAlpha = 0.28; // Exponential smoothing factor (lower = smoother)
  public pressureWindowSize = 5; // Moving average window size
  public liveSmoothedPressure = 0;
  public liveRawPressure = 0;
  private smoothedPressureValue: number | null = null;
  private recentPressures: number[] = [];
  private remoteSmoothedPressure: number | null = null;
  private remoteRecentPressures: number[] = [];

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
  private oneEuro = new OneEuroFilter2D(1.4, 0.01, 1.0);
  private recentPointsForSmoothing: { x: number; y: number }[] = [];

  // Telemetry
  public liveFps = 60;
  public livePollingRateHz = 120;
  private frameCount = 0;
  private lastFpsTime = Date.now();
  private sampleCount = 0;
  private lastSampleTime = Date.now();

  // Canvas bounds (client-relative) & Synchronized PC Screen Dimensions
  public canvasWidth = 1920;
  public canvasHeight = 1080;
  public pcScreenWidth = 1920;
  public pcScreenHeight = 1080;
  public serverAspectRatio = 16 / 9;
  public serverAspectLabel = '16:9';

  // DPI & Coordinate Diagnostic Telemetry
  public latestDiagnosticLog = 'Ready';
  public diagnosticLogs: string[] = [];

  // Sequence numbering
  private sequenceCounter = 0;

  // Event stream callbacks
  public onInputGenerated?: (event: InputEventData) => void;
  public onSoftwareProfileChanged?: (profileId: PcSoftwareProfileId, workingArea: NormalizedRect) => void;

  private listeners: Set<() => void> = new Set();

  public constructor() {
    this.detectLocalScreenDimensions();
    this.autoDetectPcSoftwareWorkingArea(false);
  }

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

  /**
   * Automatically computes the active PC Software Working Area based on the PC monitor/window aspect ratio
   * and available work area so 100% of the Mobile Full-Screen Tablet Pad maps accurately to the active drawing region.
   */
  public autoDetectPcSoftwareWorkingArea(broadcast = true): NormalizedRect {
    const ratio = this.pcScreenWidth / Math.max(1, this.pcScreenHeight);
    let detected: NormalizedRect;

    if (ratio >= 2.1) {
      // Ultrawide PC Monitor (21:9 / 32:9): wider side docks so center working area isn't horizontally stretched
      detected = { left: 0.08, top: 0.07, right: 0.84, bottom: 0.96 };
    } else if (ratio >= 1.55) {
      // Standard Widescreen PC (16:9 / 16:10): standard desktop studio working area
      detected = { left: 0.04, top: 0.08, right: 0.86, bottom: 0.96 };
    } else {
      // Compact / 4:3 / 3:2 Surface or Laptop screen
      detected = { left: 0.03, top: 0.08, right: 0.90, bottom: 0.96 };
    }

    if (this.activeSoftwareId === 'autoDetect') {
      this.softwareWorkingArea = detected;
      if (broadcast) {
        this.onSoftwareProfileChanged?.(this.activeSoftwareId, this.softwareWorkingArea);
      }
    }
    return detected;
  }

  public getActiveSoftwareProfile(): PcSoftwareProfile {
    const found = PC_SOFTWARE_PROFILES.find((p) => p.id === this.activeSoftwareId);
    if (found) {
      if (this.activeSoftwareId === 'custom' || this.activeSoftwareId === 'autoDetect') {
        return {
          ...found,
          workingArea: { ...this.softwareWorkingArea },
        };
      }
      return found;
    }
    return PC_SOFTWARE_PROFILES[0];
  }

  public setSoftwareProfile(
    profileId: PcSoftwareProfileId,
    customRect?: NormalizedRect,
    broadcast = true
  ): void {
    this.activeSoftwareId = profileId;
    if (customRect) {
      this.softwareWorkingArea = {
        left: Math.max(0, Math.min(0.45, customRect.left)),
        top: Math.max(0, Math.min(0.45, customRect.top)),
        right: Math.max(0.55, Math.min(1.0, customRect.right)),
        bottom: Math.max(0.55, Math.min(1.0, customRect.bottom)),
      };
    } else if (profileId === 'autoDetect') {
      this.autoDetectPcSoftwareWorkingArea(false);
    } else {
      const preset = PC_SOFTWARE_PROFILES.find((p) => p.id === profileId);
      if (preset) {
        this.softwareWorkingArea = { ...preset.workingArea };
      }
    }
    if (broadcast) {
      this.onSoftwareProfileChanged?.(this.activeSoftwareId, this.softwareWorkingArea);
    }
    this.notify();
  }

  public updateCustomSoftwareWorkingArea(
    partial: Partial<NormalizedRect>,
    broadcast = true
  ): void {
    this.activeSoftwareId = 'custom';
    this.softwareWorkingArea = {
      left: Math.max(0, Math.min(0.45, partial.left ?? this.softwareWorkingArea.left)),
      top: Math.max(0, Math.min(0.45, partial.top ?? this.softwareWorkingArea.top)),
      right: Math.max(0.55, Math.min(1.0, partial.right ?? this.softwareWorkingArea.right)),
      bottom: Math.max(0.55, Math.min(1.0, partial.bottom ?? this.softwareWorkingArea.bottom)),
    };
    if (broadcast) {
      this.onSoftwareProfileChanged?.(this.activeSoftwareId, this.softwareWorkingArea);
    }
    this.notify();
  }

  public getSoftwareWorkingAreaPixels(): {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
    aspectRatio: number;
    aspectLabel: string;
  } {
    const rect = this.softwareWorkingArea;
    const left = Math.round(rect.left * this.pcScreenWidth);
    const top = Math.round(rect.top * this.pcScreenHeight);
    const right = Math.round(rect.right * this.pcScreenWidth);
    const bottom = Math.round(rect.bottom * this.pcScreenHeight);
    const width = Math.max(100, right - left);
    const height = Math.max(100, bottom - top);
    const aspectRatio = width / height;
    const aspectLabel = DrawingEngine.formatAspectRatioLabel(width, height);
    return { left, top, width, height, right, bottom, aspectRatio, aspectLabel };
  }

  /**
   * Half-way rounding away from zero across all platforms (matches Dart .round() and C# MidpointRounding.AwayFromZero).
   */
  public static roundHalfAwayFromZero(val: number): number {
    if (!Number.isFinite(val)) return 0;
    return val >= 0 ? Math.floor(val + 0.5) : Math.ceil(val - 0.5);
  }

  /**
   * Normalizes pad-local coordinates against (W - 1) and (H - 1) per Phase 4.1 & Appendix A.5.
   * Returns (0.5, 0.5) fallback if either dimension is < 2 or inputs are non-finite.
   */
  public static normalizePadPoint(
    localX: number,
    localY: number,
    padWidth: number,
    padHeight: number
  ): { normX: number; normY: number } {
    if (
      !Number.isFinite(localX) ||
      !Number.isFinite(localY) ||
      !Number.isFinite(padWidth) ||
      !Number.isFinite(padHeight) ||
      padWidth < 2 ||
      padHeight < 2
    ) {
      return { normX: 0.5, normY: 0.5 };
    }
    const normX = Math.max(0, Math.min(1, localX / (padWidth - 1)));
    const normY = Math.max(0, Math.min(1, localY / (padHeight - 1)));
    return { normX, normY };
  }

  /**
   * Projects normalized [0..1] coordinates onto physical target bounds (including negative multi-monitor origins)
   * using half-away-from-zero rounding per Phase 4.3 & Appendix A.4.
   */
  public static projectNormalizedToTarget(
    normX: number,
    normY: number,
    area: { left: number; top: number; width: number; height: number }
  ): { targetX: number; targetY: number } {
    const clampedX = Number.isFinite(normX) ? Math.max(0, Math.min(1, normX)) : 0.5;
    const clampedY = Number.isFinite(normY) ? Math.max(0, Math.min(1, normY)) : 0.5;
    const spanW = Math.max(0, area.width - 1);
    const spanH = Math.max(0, area.height - 1);
    const targetX = area.left + DrawingEngine.roundHalfAwayFromZero(clampedX * spanW);
    const targetY = area.top + DrawingEngine.roundHalfAwayFromZero(clampedY * spanH);
    return { targetX, targetY };
  }

  /**
   * Computes signed 32-bit elapsed milliseconds across uint32 wraparound (0xFFFFFFFF -> 0) per Appendix A.6.
   */
  public static computeTimestampDeltaMs(prevTs: number, currTs: number): number {
    return (((currTs >>> 0) - (prevTs >>> 0)) | 0);
  }

  /**
   * Maps normalized Mobile Full-Screen Pad coordinates (0.0 - 1.0)
   * directly to the active PC Software Working Area pixel coordinates.
   */
  public mapMobilePadToPcSoftwarePixel(
    normX: number,
    normY: number
  ): { x: number; y: number; localX: number; localY: number } {
    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));
    const area = this.getSoftwareWorkingAreaPixels();
    const localX = DrawingEngine.roundHalfAwayFromZero(clampedX * Math.max(0, area.width - 1));
    const localY = DrawingEngine.roundHalfAwayFromZero(clampedY * Math.max(0, area.height - 1));
    return {
      x: area.left + localX,
      y: area.top + localY,
      localX,
      localY,
    };
  }

  public detectLocalScreenDimensions(): void {
    if (typeof window === 'undefined') return;
    const isMobile =
      window.innerWidth < 768 ||
      ('ontouchstart' in window && window.innerWidth < 1024) ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (!isMobile) {
      const w = Math.max(320, window.innerWidth || window.screen?.width || 1920);
      const h = Math.max(240, window.innerHeight || window.screen?.height || 1080);
      this.setPcScreenDimensions(w, h);
    }
  }

  public setPcScreenDimensions(width: number, height: number): void {
    const cleanW = Math.max(320, Math.round(width));
    const cleanH = Math.max(240, Math.round(height));
    const ratio = cleanW / cleanH;
    const clampedRatio = Math.max(0.5, Math.min(3.6, ratio));

    const changed =
      this.pcScreenWidth !== cleanW ||
      this.pcScreenHeight !== cleanH ||
      Math.abs(this.serverAspectRatio - clampedRatio) > 0.005;

    this.pcScreenWidth = cleanW;
    this.pcScreenHeight = cleanH;
    this.serverAspectRatio = clampedRatio;
    this.serverAspectLabel = DrawingEngine.formatAspectRatioLabel(cleanW, cleanH);

    if (this.activeSoftwareId === 'autoDetect') {
      this.autoDetectPcSoftwareWorkingArea(false);
    }

    if (changed) {
      this.notify();
    }
  }

  public static formatAspectRatioLabel(width: number, height: number): string {
    const r = width / Math.max(1, height);
    const presets: { label: string; value: number }[] = [
      { label: '16:9', value: 16 / 9 },
      { label: '16:10', value: 16 / 10 },
      { label: '21:9', value: 21 / 9 },
      { label: '32:9', value: 32 / 9 },
      { label: '3:2', value: 3 / 2 },
      { label: '4:3', value: 4 / 3 },
      { label: '5:4', value: 5 / 4 },
      { label: '9:16', value: 9 / 16 },
      { label: '1:1', value: 1 },
    ];
    for (const p of presets) {
      if (Math.abs(r - p.value) < 0.06) {
        return p.label;
      }
    }
    return `${r.toFixed(2)}:1`;
  }

  /**
   * Hybrid Moving Average + Exponential Smoothing (EMA) algorithm for incoming pressure values.
   * Ensures smooth, jitter-free line thickness transitions across Stylus, Apple Pencil, Finger, and Mouse.
   */
  public smoothPressure(rawPressure: number, isNewStroke = false, isRemote = false): number {
    const clamped = Math.max(0.05, Math.min(1.0, isNaN(rawPressure) ? 0.5 : rawPressure));
    this.liveRawPressure = clamped;

    const calibrated = transformPressure(clamped, this.pressureCurve);

    if (!this.enablePressureSmoothing) {
      this.liveSmoothedPressure = calibrated;
      return calibrated;
    }

    if (isRemote) {
      if (isNewStroke || this.remoteSmoothedPressure === null) {
        this.remoteRecentPressures = [calibrated];
        this.remoteSmoothedPressure = calibrated;
        this.liveSmoothedPressure = calibrated;
        return calibrated;
      }

      this.remoteRecentPressures.push(calibrated);
      const winSize = Math.max(2, Math.min(10, this.pressureWindowSize));
      if (this.remoteRecentPressures.length > winSize) {
        this.remoteRecentPressures.shift();
      }

      const movingAvg =
        this.remoteRecentPressures.reduce((sum, p) => sum + p, 0) /
        this.remoteRecentPressures.length;

      const alpha = Math.max(0.08, Math.min(0.85, this.pressureSmoothingAlpha));
      const ema = alpha * movingAvg + (1 - alpha) * this.remoteSmoothedPressure;

      const maxDelta = 0.075;
      const delta = ema - this.remoteSmoothedPressure;
      const bounded =
        Math.abs(delta) > maxDelta
          ? this.remoteSmoothedPressure + Math.sign(delta) * maxDelta
          : ema;

      this.remoteSmoothedPressure = Math.max(0.05, Math.min(1.0, bounded));
      this.liveSmoothedPressure = this.remoteSmoothedPressure;
      return this.remoteSmoothedPressure;
    }

    if (isNewStroke || this.smoothedPressureValue === null) {
      this.recentPressures = [calibrated];
      this.smoothedPressureValue = calibrated;
      this.liveSmoothedPressure = calibrated;
      return calibrated;
    }

    this.recentPressures.push(calibrated);
    const winSize = Math.max(2, Math.min(10, this.pressureWindowSize));
    if (this.recentPressures.length > winSize) {
      this.recentPressures.shift();
    }

    const movingAvg =
      this.recentPressures.reduce((sum, p) => sum + p, 0) / this.recentPressures.length;

    const alpha = Math.max(0.08, Math.min(0.85, this.pressureSmoothingAlpha));
    const ema = alpha * movingAvg + (1 - alpha) * this.smoothedPressureValue;

    const maxDelta = 0.075;
    const delta = ema - this.smoothedPressureValue;
    const bounded =
      Math.abs(delta) > maxDelta
        ? this.smoothedPressureValue + Math.sign(delta) * maxDelta
        : ema;

    this.smoothedPressureValue = Math.max(0.05, Math.min(1.0, bounded));
    this.liveSmoothedPressure = this.smoothedPressureValue;
    return this.smoothedPressureValue;
  }

  public recordDiagnostic(log: string): void {
    this.latestDiagnosticLog = log;
    this.diagnosticLogs.unshift(log);
    if (this.diagnosticLogs.length > 50) {
      this.diagnosticLogs.pop();
    }
  }

  public updateCanvasDimensions(width: number, height: number): void {
    const cleanW = Math.round(width);
    const cleanH = Math.round(height);
    if (cleanW > 0 && cleanH > 0) {
      if (this.canvasWidth === cleanW && this.canvasHeight === cleanH) return;
      const prevW = Math.max(1, this.canvasWidth);
      const prevH = Math.max(1, this.canvasHeight);
      this.canvasWidth = cleanW;
      this.canvasHeight = cleanH;

      const rescaleStroke = (stroke: Stroke) => {
        for (const pt of stroke.points) {
          const nx = pt.normX !== undefined ? pt.normX : pt.x / prevW;
          const ny = pt.normY !== undefined ? pt.normY : pt.y / prevH;
          pt.normX = nx;
          pt.normY = ny;
          pt.x = nx * cleanW;
          pt.y = ny * cleanH;
        }
      };

      for (const stroke of this.strokes) {
        rescaleStroke(stroke);
      }
      if (this.currentStroke) {
        rescaleStroke(this.currentStroke);
      }
      if (this.currentRemoteStroke) {
        rescaleStroke(this.currentRemoteStroke);
      }
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
    if (this.stylusOnlyMode && pointerType === 'finger') return;
    if (isNaN(localX) || isNaN(localY)) return;

    // Multi-touch & palm rejection guard:
    // If a stroke is already active with a different pointerId, ignore secondary finger touches
    if (this.currentStroke && this.activePointerId !== null && this.activePointerId !== pointerId) {
      const currentKind = this.currentStroke.points[0]?.pointerType;
      if (pointerType === 'stylus' && currentKind === 'finger') {
        if (this.currentStroke.points.length > 4) {
          this.strokes.push(this.currentStroke);
        }
        this.currentStroke = null;
      } else {
        return;
      }
    }

    if (this.currentStroke) {
      this.strokes.push(this.currentStroke);
      this.currentStroke = null;
    }

    this.activePointerId = pointerId;
    this.recordSample();
    this.oneEuro.reset();
    this.recentPointsForSmoothing = [];

    this.saveSnapshot();
    this.redoStack = [];

    const smoothedPressure = this.smoothPressure(pressure, true, false);

    const posX = Math.max(0, Math.min(this.canvasWidth, localX));
    const posY = Math.max(0, Math.min(this.canvasHeight, localY));

    if (this.precisionMode === 'proAdaptive') {
      this.oneEuro.filter(posX, posY, Date.now());
    }

    this.recentPointsForSmoothing.push({ x: posX, y: posY });

    const isEraserInput =
      pointerType === 'eraser' ||
      (buttons & 32) !== 0 ||
      (pointerType === 'stylus' && (buttons & 2) !== 0) ||
      this.brushSettings.mode === 'eraser';
    const effectiveMode = isEraserInput ? 'eraser' : this.brushSettings.mode;
    const effectivePointerType: PointerKind = isEraserInput ? 'eraser' : pointerType;
    const effectiveButtons = isEraserInput ? (buttons | 32) : buttons;

    const calculatedWidth = this.calculatePointWidth(smoothedPressure, 0, undefined, effectiveMode);
    const { normX, normY } = DrawingEngine.normalizePadPoint(
      posX,
      posY,
      this.canvasWidth,
      this.canvasHeight
    );

    const firstPoint: StrokePoint = {
      x: posX,
      y: posY,
      normX,
      normY,
      pressure: smoothedPressure,
      pointerType: effectivePointerType,
      width: calculatedWidth,
      timestamp: Date.now(),
      tiltX,
      tiltY,
    };

    this.currentStroke = {
      id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      points: [firstPoint],
      settings: { ...this.brushSettings, mode: effectiveMode },
      startTime: Date.now(),
    };

    this.predictedPosition = { x: posX, y: posY };
    this.emitEvent(
      'pointerDown',
      posX,
      posY,
      smoothedPressure,
      effectivePointerType,
      pointerId,
      tiltX,
      tiltY,
      effectiveButtons
    );
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
    if (this.activePointerId !== null && pointerId !== this.activePointerId) return;
    if (this.stylusOnlyMode && pointerType === 'finger') return;
    if (isNaN(localX) || isNaN(localY)) return;

    this.recordSample();

    const isEraserInput =
      this.currentStroke.settings.mode === 'eraser' ||
      pointerType === 'eraser' ||
      (buttons & 32) !== 0 ||
      (pointerType === 'stylus' && (buttons & 2) !== 0) ||
      this.brushSettings.mode === 'eraser';
    const effectiveMode = isEraserInput ? 'eraser' : this.currentStroke.settings.mode;
    const effectivePointerType: PointerKind = isEraserInput ? 'eraser' : pointerType;
    const effectiveButtons = isEraserInput ? (buttons | 32) : buttons;

    if (isEraserInput && this.currentStroke.settings.mode !== 'eraser') {
      this.currentStroke.settings = { ...this.currentStroke.settings, mode: 'eraser' };
    }

    let posX = Math.max(0, Math.min(this.canvasWidth, localX));
    let posY = Math.max(0, Math.min(this.canvasHeight, localY));

    const pts = this.currentStroke.points;
    const lastPt = pts[pts.length - 1];
    const now = Date.now();

    if (lastPt) {
      const rawDist = Math.hypot(posX - lastPt.x, posY - lastPt.y);
      const dt = Math.max(1, now - lastPt.timestamp);

      if (rawDist < 0.5) {
        return;
      }

      // Glitch / Missed-PointerUp Guard
      const maxJump = Math.max(this.canvasWidth, this.canvasHeight) * 0.3;
      if (dt > 160 && rawDist > maxJump) {
        this.strokes.push(this.currentStroke);
        this.oneEuro.reset();
        this.recentPointsForSmoothing = [{ x: posX, y: posY }];
        const smoothedP = this.smoothPressure(pressure, true, false);
        const w = this.calculatePointWidth(smoothedP, 0, undefined, effectiveMode);
        const { normX: jumpNormX, normY: jumpNormY } = DrawingEngine.normalizePadPoint(
          posX,
          posY,
          this.canvasWidth,
          this.canvasHeight
        );
        this.currentStroke = {
          id: 'stroke_' + now + '_' + Math.random().toString(36).substring(2, 6),
          points: [
            {
              x: posX,
              y: posY,
              normX: jumpNormX,
              normY: jumpNormY,
              pressure: smoothedP,
              pointerType: effectivePointerType,
              width: w,
              timestamp: now,
              tiltX,
              tiltY,
            },
          ],
          settings: { ...this.brushSettings, mode: effectiveMode },
          startTime: now,
        };
        this.emitEvent(
          'pointerDown',
          posX,
          posY,
          smoothedP,
          effectivePointerType,
          pointerId,
          tiltX,
          tiltY,
          effectiveButtons
        );
        this.notify();
        return;
      }
    }

    if (this.precisionMode === 'proAdaptive') {
      const filtered = this.oneEuro.filter(posX, posY, now);
      posX = filtered.x;
      posY = filtered.y;
    } else if (this.precisionMode === 'studioSmooth') {
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

    this.predictedPosition = { x: posX, y: posY };

    let velocity = 0;
    let prevWidth: number | undefined;
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const dt = Math.max(1, now - last.timestamp);
      const dist = Math.hypot(posX - last.x, posY - last.y);
      velocity = dist / dt;
      prevWidth = last.width;
    }

    let effectiveRawPressure = pressure;
    if (effectivePointerType !== 'stylus' && effectivePointerType !== 'eraser' && Math.abs(pressure - 0.5) < 0.02) {
      const speedMod = Math.max(-0.18, Math.min(0.18, (0.45 - velocity) * 0.22));
      effectiveRawPressure = Math.max(0.2, Math.min(0.85, 0.5 + speedMod));
    }

    const smoothedPressure = this.smoothPressure(effectiveRawPressure, false, false);
    const calculatedWidth = this.calculatePointWidth(smoothedPressure, velocity, prevWidth, effectiveMode);

    const { normX, normY } = DrawingEngine.normalizePadPoint(
      posX,
      posY,
      this.canvasWidth,
      this.canvasHeight
    );

    const point: StrokePoint = {
      x: posX,
      y: posY,
      normX,
      normY,
      pressure: smoothedPressure,
      pointerType: effectivePointerType,
      width: calculatedWidth,
      timestamp: now,
      tiltX,
      tiltY,
    };

    this.currentStroke.points.push(point);
    this.emitEvent(
      'pointerMove',
      posX,
      posY,
      smoothedPressure,
      effectivePointerType,
      pointerId,
      tiltX,
      tiltY,
      effectiveButtons
    );
    this.notify();
  }

  // Pointer Up
  public onPointerUp(
    pointerType: PointerKind = 'finger',
    pointerId = 0,
    buttons = 0
  ): void {
    if (!this.currentStroke) {
      this.activePointerId = null;
      return;
    }
    if (this.activePointerId !== null && pointerId !== 0 && pointerId !== this.activePointerId) {
      return;
    }

    const wasEraser =
      this.currentStroke.settings.mode === 'eraser' ||
      pointerType === 'eraser' ||
      this.brushSettings.mode === 'eraser';
    const effectivePointerType: PointerKind = wasEraser ? 'eraser' : pointerType;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    const posX = lastPoint ? lastPoint.x : 0;
    const posY = lastPoint ? lastPoint.y : 0;
    const p = lastPoint ? lastPoint.pressure : 0.0;

    this.emitEvent('pointerUp', posX, posY, p, effectivePointerType, pointerId, 0, 0, buttons);

    this.strokes.push(this.currentStroke);
    this.currentStroke = null;
    this.activePointerId = null;
    this.predictedPosition = null;
    this.liveSmoothedPressure = 0;
    this.liveRawPressure = 0;

    this.notify();
  }

  // Pointer Cancel
  public onPointerCancel(pointerType: PointerKind = 'finger', pointerId = 0): void {
    if (this.activePointerId !== null && pointerId !== 0 && pointerId !== this.activePointerId) {
      return;
    }
    const wasEraser =
      this.currentStroke?.settings.mode === 'eraser' ||
      pointerType === 'eraser' ||
      this.brushSettings.mode === 'eraser';
    const effectivePointerType: PointerKind = wasEraser ? 'eraser' : pointerType;

    this.emitEvent('pointerCancel', 0, 0, 0, effectivePointerType, pointerId, 0, 0, 0);

    if (this.currentStroke) {
      this.strokes.push(this.currentStroke);
      this.currentStroke = null;
    }
    this.activePointerId = null;
    this.predictedPosition = null;
    this.liveSmoothedPressure = 0;
    this.liveRawPressure = 0;
    this.notify();
  }

  private calculatePointWidth(
    smoothedPressure: number,
    velocity = 0,
    previousWidth?: number,
    modeOverride?: BrushSettings['mode'],
    baseWidthOverride?: number
  ): number {
    const base = baseWidthOverride ?? this.brushSettings.baseWidth;
    const sens = this.brushSettings.pressureSensitivity;
    const mode = modeOverride ?? this.brushSettings.mode;
    if (mode === 'eraser') {
      return base * 2.2;
    }
    if (mode === 'highlighter') {
      return base * 3.5;
    }

    let rawWidth: number;
    if (mode === 'pencil') {
      rawWidth = base * (0.6 + smoothedPressure * 0.4 * sens);
    } else {
      const velocityFactor = Math.max(0.75, Math.min(1.2, 1.04 - velocity * 0.045));
      rawWidth = base * (0.35 + smoothedPressure * 0.9 * sens) * velocityFactor;
    }

    if (previousWidth !== undefined && this.enablePressureSmoothing) {
      const widthAlpha = Math.max(0.15, Math.min(0.85, this.pressureSmoothingAlpha * 1.1));
      return widthAlpha * rawWidth + (1 - widthAlpha) * previousWidth;
    }

    return rawWidth;
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
    const { normX: baseNormX, normY: baseNormY } = DrawingEngine.normalizePadPoint(
      rawX,
      rawY,
      this.canvasWidth,
      this.canvasHeight
    );
    let normX = baseNormX;
    let normY = baseNormY;

    if (this.writingScale === 'compact') {
      normX = this.writingAnchor === 'center' ? (normX - 0.5) * 0.5 + 0.5 : normX * 0.5;
      normY = this.writingAnchor === 'center' ? (normY - 0.5) * 0.5 + 0.5 : normY * 0.5;
    } else if (this.writingScale === 'medium') {
      normX = this.writingAnchor === 'center' ? (normX - 0.5) * 0.75 + 0.5 : normX * 0.75;
      normY = this.writingAnchor === 'center' ? (normY - 0.5) * 0.75 + 0.5 : normY * 0.75;
    }

    if (this.customBoxEnabled && this.boxMapsToFullScreen) {
      const box = this.customBoxNormalized;
      const bw = box.right - box.left;
      const bh = box.bottom - box.top;
      if (bw > 0.05 && bh > 0.05) {
        normX = Math.max(0, Math.min(1, (normX - box.left) / bw));
        normY = Math.max(0, Math.min(1, (normY - box.top) / bh));
      }
    }

    const activeMode =
      this.currentStroke?.settings.mode ||
      (pointerType === 'eraser' || (buttons & 32) !== 0 ? 'eraser' : this.brushSettings.mode);
    const isEraser = activeMode === 'eraser';

    // Windows Ink PEN_FLAG_ERASER (0x04) | PEN_FLAG_INVERTED (0x02) = 0x06
    const penFlags = isEraser ? 0x06 : 0x00;
    const effectiveButtons =
      isEraser && (type === 'pointerDown' || type === 'pointerMove') ? (buttons | 32) : buttons;

    const event: InputEventData = {
      type,
      x: Math.max(0, Math.min(1, normX)),
      y: Math.max(0, Math.min(1, normY)),
      pressure: Math.max(0, Math.min(1, pressure)),
      pointerType: isEraser ? 'eraser' : pointerType,
      pointerId,
      tiltX,
      tiltY,
      buttons: effectiveButtons,
      sequenceNumber: ++this.sequenceCounter,
      timestamp: Date.now(),
      brushMode: activeMode,
      brushColor: this.brushSettings.color,
      brushWidth: this.brushSettings.baseWidth,
      penFlags,
      shortcutKey: isEraser ? 'e' : 'b',
    };

    this.onInputGenerated?.(event);
  }

  public handleIncomingInputEvent(event: InputEventData): void {
    this.recordSample();
    const normX = Math.max(0, Math.min(1, event.x));
    const normY = Math.max(0, Math.min(1, event.y));
    const spanW = Math.max(1, this.canvasWidth - 1);
    const spanH = Math.max(1, this.canvasHeight - 1);
    const rawX = normX * spanW;
    const rawY = normY * spanH;
    const incomingPressure = event.pressure ?? 0.5;

    const isRemoteEraser =
      event.brushMode === 'eraser' ||
      event.pointerType === 'eraser' ||
      ((event.penFlags ?? 0) & 0x04) !== 0 ||
      ((event.buttons ?? 0) & 32) !== 0 ||
      (event.brushMode === undefined && this.brushSettings.mode === 'eraser');

    const remoteMode: BrushSettings['mode'] = isRemoteEraser
      ? 'eraser'
      : event.brushMode || this.brushSettings.mode;

    const remoteColor = event.brushColor || this.brushSettings.color;
    const remoteBaseWidth = event.brushWidth || this.brushSettings.baseWidth;

    // Keep PC Host brush settings synchronized with incoming mobile stroke metadata
    if (
      this.brushSettings.mode !== remoteMode ||
      (event.brushColor && this.brushSettings.color !== event.brushColor) ||
      (event.brushWidth && this.brushSettings.baseWidth !== event.brushWidth)
    ) {
      this.brushSettings = {
        ...this.brushSettings,
        mode: remoteMode,
        color: remoteColor,
        baseWidth: remoteBaseWidth,
      };
    }

    const softwareMapped = this.mapMobilePadToPcSoftwarePixel(normX, normY);
    const profile = this.getActiveSoftwareProfile();
    const toolTag = isRemoteEraser
      ? `[ERASER • WinInk 0x04 + Key 'E']`
      : `[${remoteMode.toUpperCase()}]`;
    this.recordDiagnostic(
      `${toolTag} Mobile (${normX.toFixed(4)}, ${normY.toFixed(4)}) -> PC [${profile.shortName}] (${softwareMapped.x}, ${softwareMapped.y})`
    );

    if (event.type === 'pointerDown') {
      this.saveSnapshot();
      if (this.currentRemoteStroke) {
        this.strokes.push(this.currentRemoteStroke);
      }
      const smoothedP = this.smoothPressure(incomingPressure, true, true);
      const width = this.calculatePointWidth(smoothedP, 0, undefined, remoteMode, remoteBaseWidth);
      this.currentRemoteStroke = {
        id: 'remote_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        points: [
          {
            x: rawX,
            y: rawY,
            normX,
            normY,
            pressure: smoothedP,
            pointerType: isRemoteEraser ? 'eraser' : event.pointerType || 'stylus',
            width,
            timestamp: event.timestamp || Date.now(),
            tiltX: event.tiltX,
            tiltY: event.tiltY,
          },
        ],
        settings: {
          ...this.brushSettings,
          mode: remoteMode,
          color: remoteColor,
          baseWidth: remoteBaseWidth,
        },
        startTime: event.timestamp || Date.now(),
      };
      this.predictedPosition = { x: rawX, y: rawY };
      this.notify();
    } else if (event.type === 'pointerMove' || event.type === 'hover') {
      this.predictedPosition = { x: rawX, y: rawY };
      if (event.type === 'pointerMove' && (this.currentRemoteStroke || (event.buttons ?? 1) > 0)) {
        const now = event.timestamp || Date.now();
        const isFirst = !this.currentRemoteStroke || this.currentRemoteStroke.points.length === 0;

        if (!isFirst && this.currentRemoteStroke) {
          // If tool mode switched mid-stream, update the active remote stroke mode
          if (this.currentRemoteStroke.settings.mode !== remoteMode) {
            this.currentRemoteStroke.settings = {
              ...this.currentRemoteStroke.settings,
              mode: remoteMode,
            };
          }

          const last = this.currentRemoteStroke.points[this.currentRemoteStroke.points.length - 1];
          const dist = Math.hypot(rawX - last.x, rawY - last.y);
          const dt = Math.max(1, now - last.timestamp);
          if (dist < 0.4) return;

          const maxJump = Math.max(this.canvasWidth, this.canvasHeight) * 0.35;
          if (dt > 180 && dist > maxJump) {
            this.strokes.push(this.currentRemoteStroke);
            this.currentRemoteStroke = null;
          }
        }

        const smoothedP = this.smoothPressure(
          incomingPressure,
          !this.currentRemoteStroke,
          true
        );

        let velocity = 0;
        let prevWidth: number | undefined;
        if (this.currentRemoteStroke && this.currentRemoteStroke.points.length > 0) {
          const last = this.currentRemoteStroke.points[this.currentRemoteStroke.points.length - 1];
          const dt = Math.max(1, now - last.timestamp);
          const dist = Math.hypot(rawX - last.x, rawY - last.y);
          velocity = dist / dt;
          prevWidth = last.width;
        }

        const width = this.calculatePointWidth(
          smoothedP,
          velocity,
          prevWidth,
          remoteMode,
          remoteBaseWidth
        );

        if (!this.currentRemoteStroke) {
          this.currentRemoteStroke = {
            id: 'remote_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            points: [
              {
                x: rawX,
                y: rawY,
                normX,
                normY,
                pressure: smoothedP,
                pointerType: isRemoteEraser ? 'eraser' : event.pointerType || 'stylus',
                width,
                timestamp: now,
                tiltX: event.tiltX,
                tiltY: event.tiltY,
              },
            ],
            settings: {
              ...this.brushSettings,
              mode: remoteMode,
              color: remoteColor,
              baseWidth: remoteBaseWidth,
            },
            startTime: now,
          };
        } else {
          this.currentRemoteStroke.points.push({
            x: rawX,
            y: rawY,
            normX,
            normY,
            pressure: smoothedP,
            pointerType: isRemoteEraser ? 'eraser' : event.pointerType || 'stylus',
            width,
            timestamp: now,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
          });
        }
      }
      this.notify();
    } else if (event.type === 'pointerUp' || event.type === 'pointerCancel') {
      if (this.currentRemoteStroke) {
        if (isRemoteEraser && this.currentRemoteStroke.settings.mode !== 'eraser') {
          this.currentRemoteStroke.settings = {
            ...this.currentRemoteStroke.settings,
            mode: 'eraser',
          };
        }
        this.strokes.push(this.currentRemoteStroke);
        this.currentRemoteStroke = null;
      }
      this.predictedPosition = null;
      this.liveSmoothedPressure = 0;
      this.liveRawPressure = 0;
      this.notify();
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
    if (
      this.strokes.length > 0 ||
      this.currentStroke !== null ||
      this.currentRemoteStroke !== null
    ) {
      this.saveSnapshot();
      this.strokes = [];
      this.currentStroke = null;
      this.currentRemoteStroke = null;
      this.activePointerId = null;
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

  // =========================================================================
  // Google Drive & Project Data Serialization Methods
  // =========================================================================
  public backgroundImage: HTMLImageElement | null = null;

  public renderBackgroundImage(img: HTMLImageElement): void {
    this.backgroundImage = img;
    this.notify();
  }

  public exportAsImage(withBackground: boolean = true): string {
    const w = Math.max(300, this.canvasWidth || 1920);
    const h = Math.max(200, this.canvasHeight || 1080);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return '';

    if (withBackground) {
      ctx.fillStyle = '#0A0A12';
      ctx.fillRect(0, 0, w, h);
    }

    if (this.backgroundImage) {
      ctx.drawImage(this.backgroundImage, 0, 0, w, h);
    }

    // Dedicated Ink Layer so destination-out pixel eraser only wipes ink strokes
    // and never punches holes through the background fill or imported image
    const inkCanvas = document.createElement('canvas');
    inkCanvas.width = w;
    inkCanvas.height = h;
    const inkCtx = inkCanvas.getContext('2d');
    if (!inkCtx) return offCanvas.toDataURL('image/png');

    // Render all strokes onto inkCtx
    const allStrokes = [...this.strokes];
    if (this.currentStroke) allStrokes.push(this.currentStroke);
    if (this.currentRemoteStroke) allStrokes.push(this.currentRemoteStroke);

    for (const stroke of allStrokes) {
      const pts = stroke.points;
      if (pts.length === 0) continue;

      const getX = (p: (typeof pts)[0]) => (p.normX !== undefined ? p.normX * w : p.x);
      const getY = (p: (typeof pts)[0]) => (p.normY !== undefined ? p.normY * h : p.y);

      const isEraser = stroke.settings.mode === 'eraser';
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
        continue;
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
        continue;
      }

      const p0 = pts[0];
      const p1 = pts[1];
      inkCtx.lineWidth = Math.max(0.8, (p0.width + p1.width) / 2);
      inkCtx.beginPath();
      inkCtx.moveTo(getX(p0), getY(p0));
      inkCtx.lineTo((getX(p0) + getX(p1)) / 2, (getY(p0) + getY(p1)) / 2);
      inkCtx.stroke();

      for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const next = pts[i + 1];

        const startX = (getX(prev) + getX(curr)) / 2;
        const startY = (getY(prev) + getY(curr)) / 2;
        const endX = (getX(curr) + getX(next)) / 2;
        const endY = (getY(curr) + getY(next)) / 2;

        inkCtx.lineWidth = Math.max(0.8, curr.width);
        inkCtx.beginPath();
        inkCtx.moveTo(startX, startY);
        inkCtx.quadraticCurveTo(getX(curr), getY(curr), endX, endY);
        inkCtx.stroke();
      }

      const lastPrev = pts[pts.length - 2];
      const last = pts[pts.length - 1];
      inkCtx.lineWidth = Math.max(0.8, last.width);
      inkCtx.beginPath();
      inkCtx.moveTo((getX(lastPrev) + getX(last)) / 2, (getY(lastPrev) + getY(last)) / 2);
      inkCtx.lineTo(getX(last), getY(last));
      inkCtx.stroke();

      inkCtx.restore();
    }

    ctx.drawImage(inkCanvas, 0, 0);

    return offCanvas.toDataURL('image/png');
  }

  public exportAsProjectData(): any {
    return {
      appName: 'Air Canvas',
      version: '2.0.0',
      timestamp: Date.now(),
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      softwareProfile: this.activeSoftwareId,
      softwareWorkingArea: this.softwareWorkingArea,
      brushSettings: this.brushSettings,
      strokes: this.strokes,
    };
  }

  public loadProjectData(data: any): void {
    if (!data) return;
    this.saveSnapshot();
    if (data.strokes && Array.isArray(data.strokes)) {
      this.strokes = data.strokes;
    }
    if (data.brushSettings) {
      this.brushSettings = { ...this.brushSettings, ...data.brushSettings };
    }
    if (data.softwareProfile) {
      this.setSoftwareProfile(data.softwareProfile, data.softwareWorkingArea || null);
    }
    this.notify();
  }
}
