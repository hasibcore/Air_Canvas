// ==============================================================================
// Phase 4.10 — Universal Target Auto-Detection & Adaptive Screen Mapping
// Authoritative Target-Geometry, Provider, Aspect-Ratio & 5-Point Calibration Manager
// ==============================================================================

export type TargetMode = 'MONITOR' | 'WINDOW' | 'CANVAS';
export type CoordinateUnits = 'logical_px' | 'physical_px' | 'css_px' | 'normalized';
export type OrientationMode = 'landscape' | 'portrait';

export interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SourceSurfaceGeometry {
  width: number;
  height: number;
  devicePixelRatio: number;
  orientation: OrientationMode;
  safeAreaInsets: { top: number; bottom: number; left: number; right: number };
}

export interface MonitorDescriptor {
  id: string;
  name: string;
  isPrimary: boolean;
  rcMonitor: TargetRect; // Full physical monitor bounds in virtual desktop coordinates (may have negative origin)
  rcWork: TargetRect; // Work area excluding taskbar
  dpiX: number;
  dpiY: number;
  scaleFactor: number;
  orientation: OrientationMode;
  isConnected: boolean;
}

export interface WindowDescriptor {
  hwnd: string;
  processId: number;
  processName: string;
  appId: string;
  title: string;
  visibleFrameBounds: TargetRect; // DWMWA_EXTENDED_FRAME_BOUNDS visible window rect (excludes invisible resize borders)
  clientBounds: TargetRect;
  isMinimized: boolean;
  isVisible: boolean;
  isDestroyed: boolean;
  childCanvasRect?: TargetRect | null;
  childCanvasClass?: string | null;
}

export interface CanvasDetectionResult {
  providerId: string;
  supported: boolean;
  verified: boolean;
  requiresCalibration: boolean;
  targetId: string;
  bounds: TargetRect | null;
  units: CoordinateUnits;
  reason: string;
}

export interface ITargetCanvasProvider {
  readonly providerId: string;
  readonly geometryUnits: CoordinateUnits;
  canProvideCanvas(win: WindowDescriptor): boolean;
  detectCanvas(win: WindowDescriptor): CanvasDetectionResult;
}

export interface CalibrationPointPair {
  label: 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight' | 'Center';
  sourceNorm: { x: number; y: number };
  targetPhysical: { x: number; y: number };
}

export interface CalibrationTransform {
  version: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  maxResidualPx: number;
  meanResidualPx: number;
  residualsPx: number[];
  thresholdPx: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceOrientation: OrientationMode;
  targetMode: TargetMode;
  targetId: string;
  targetBounds: TargetRect;
  createdAtMs: number;
}

export interface ProjectedTargetPoint {
  ok: boolean;
  targetX: number;
  targetY: number;
  normX: number;
  normY: number;
  insideActiveRegion: boolean;
  calibrationApplied: boolean;
  reason?: string;
}

export interface TargetGeometryState {
  targetMode: TargetMode;
  targetId: string;
  targetName: string;
  targetAvailable: boolean;
  targetUnavailableReason: string | null;
  sourceGeometry: SourceSurfaceGeometry;
  targetBounds: TargetRect;
  activeMappedBounds: TargetRect;
  coordinateUnits: CoordinateUnits;
  dpiAwareVerified: boolean;
  preserveAspectRatio: boolean;
  followActiveWindow: boolean;
  useMonitorWorkArea: boolean;
  providerId: string | null;
  canvasDetectionSupported: boolean;
  canvasBoundsVerified: boolean;
  requiresCalibrationFallback: boolean;
  calibrationStatus: 'NONE' | 'IN_PROGRESS' | 'VALID' | 'INVALIDATED' | 'FAILED';
  calibration: CalibrationTransform | null;
  calibrationError: string | null;
  generation: number;
  lastSuccessfulDetectionMs: number;
  lastFailureReason: string | null;
}

/**
 * Half-way away from zero rounding (identical across Dart .round(), C# MidpointRounding.AwayFromZero, and TypeScript).
 */
export function roundHalfAwayFromZero(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return val >= 0 ? Math.floor(val + 0.5) : Math.ceil(val - 0.5);
}

/**
 * Validates that a TargetRect has finite coordinates and width/height >= 2.
 */
export function isValidTargetRect(rect: TargetRect | null | undefined): rect is TargetRect {
  if (!rect) return false;
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width >= 2 &&
    rect.height >= 2
  );
}

/**
 * Phase 4.10.2: Normalizes widget-local coordinates using (W - 1) and (H - 1).
 * Handles dimensions smaller than two pixels (e.g., 1x1) using an explicit, tested fallback (0.5, 0.5),
 * and rejects <= 0 or non-finite dimensions/coordinates safely.
 */
export function normalizeSourcePoint(
  localX: number,
  localY: number,
  width: number,
  height: number
): {
  ok: boolean;
  valid: boolean;
  normX: number;
  normY: number;
  insideBounds: boolean;
  degenerateFallback: boolean;
} {
  if (
    !Number.isFinite(localX) ||
    !Number.isFinite(localY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {
      ok: false,
      valid: false,
      normX: 0.5,
      normY: 0.5,
      insideBounds: false,
      degenerateFallback: false,
    };
  }

  // Explicit tested fallback for valid positive dimensions smaller than 2 pixels (e.g. 1x1)
  if (width < 2 || height < 2) {
    return {
      ok: true,
      valid: true,
      normX: 0.5,
      normY: 0.5,
      insideBounds: localX >= 0 && localX <= width && localY >= 0 && localY <= height,
      degenerateFallback: true,
    };
  }

  const insideBounds =
    localX >= 0 && localX <= width - 1 && localY >= 0 && localY <= height - 1;

  const clampedLocalX = Math.max(0, Math.min(width - 1, localX));
  const clampedLocalY = Math.max(0, Math.min(height - 1, localY));

  return {
    ok: true,
    valid: true,
    normX: Math.max(0, Math.min(1, clampedLocalX / (width - 1))),
    normY: Math.max(0, Math.min(1, clampedLocalY / (height - 1))),
    insideBounds,
    degenerateFallback: false,
  };
}


/**
 * Phase 4.10.7: Computes the aspect-ratio-preserving active target rectangle
 * using uniform scale = min(targetWidth / sourceWidth, targetHeight / sourceHeight)
 * centered inside the target rectangle.
 */
export function computeAspectPreservingTargetRect(
  sourceWidth: number,
  sourceHeight: number,
  targetRect: TargetRect,
  preserveAspectRatio = true
): TargetRect {
  if (!isValidTargetRect(targetRect)) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  if (
    !preserveAspectRatio ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 2 ||
    sourceHeight < 2
  ) {
    return { ...targetRect };
  }

  const scale = Math.min(targetRect.width / sourceWidth, targetRect.height / sourceHeight);
  const activeWidth = Math.max(
    2,
    Math.min(targetRect.width, roundHalfAwayFromZero(sourceWidth * scale))
  );
  const activeHeight = Math.max(
    2,
    Math.min(targetRect.height, roundHalfAwayFromZero(sourceHeight * scale))
  );

  const offsetX = roundHalfAwayFromZero((targetRect.width - activeWidth) / 2);
  const offsetY = roundHalfAwayFromZero((targetRect.height - activeHeight) / 2);

  return {
    left: targetRect.left + offsetX,
    top: targetRect.top + offsetY,
    width: activeWidth,
    height: activeHeight,
  };
}

/**
 * Phase 4.10.7: Computes the active source pad sub-rectangle when letterboxing on the mobile/tablet pad.
 */
export function computeAspectPreservingSourceRect(
  padWidth: number,
  padHeight: number,
  targetWidth: number,
  targetHeight: number,
  preserveAspectRatio = true
): TargetRect {
  if (!Number.isFinite(padWidth) || !Number.isFinite(padHeight) || padWidth < 2 || padHeight < 2) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  if (
    !preserveAspectRatio ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth < 2 ||
    targetHeight < 2
  ) {
    return { left: 0, top: 0, width: padWidth, height: padHeight };
  }

  const scale = Math.min(padWidth / targetWidth, padHeight / targetHeight);
  const activeW = Math.max(2, Math.min(padWidth, roundHalfAwayFromZero(targetWidth * scale)));
  const activeH = Math.max(2, Math.min(padHeight, roundHalfAwayFromZero(targetHeight * scale)));
  const left = roundHalfAwayFromZero((padWidth - activeW) / 2);
  const top = roundHalfAwayFromZero((padHeight - activeH) / 2);

  return { left, top, width: activeW, height: activeH };
}

// ==============================================================================
// Phase 4.10.5 — Extensible Canvas Target Providers
// ==============================================================================

/**
 * Provider 1: Browser / Web Studio HTML5 Canvas Element Provider.
 * Accounts for CSS bounding rect, scroll, zoom, and devicePixelRatio.
 */
export class WebStudioDomCanvasProvider implements ITargetCanvasProvider {
  public readonly providerId = 'web-studio-dom-canvas';
  public readonly geometryUnits: CoordinateUnits = 'css_px';

  public canProvideCanvas(win: WindowDescriptor): boolean {
    const id = (win.appId + ' ' + win.processName).toLowerCase();
    return id.includes('webstudio') || id.includes('browser-canvas');
  }

  public detectCanvas(win: WindowDescriptor): CanvasDetectionResult {
    if (win.childCanvasRect && isValidTargetRect(win.childCanvasRect)) {
      return {
        providerId: this.providerId,
        supported: true,
        verified: true,
        requiresCalibration: false,
        targetId: `${win.hwnd}:canvas`,
        bounds: { ...win.childCanvasRect },
        units: this.geometryUnits,
        reason: 'Verified DOM <canvas> bounding client rect',
      };
    }
    return {
      providerId: this.providerId,
      supported: false,
      verified: false,
      requiresCalibration: true,
      targetId: win.hwnd,
      bounds: null,
      units: this.geometryUnits,
      reason: 'DOM <canvas> element rect not available',
    };
  }
}

/**
 * Provider 2: Verified Native Win32 Child Canvas Provider (e.g. MSPaintView, Acrobat View).
 * Only succeeds when the application exposes a verified native child canvas HWND.
 */
export class VerifiedWin32ChildCanvasProvider implements ITargetCanvasProvider {
  public readonly providerId = 'win32-verified-child-canvas';
  public readonly geometryUnits: CoordinateUnits = 'physical_px';

  private static readonly VERIFIED_CLASSES = [
    'mspaintview',
    'afxframeorview',
    'avl_avview',
    'xournalppcanvas',
    'csp_canvasviewport',
  ];


  public canProvideCanvas(win: WindowDescriptor): boolean {
    if (!win.childCanvasClass || !win.childCanvasRect) return false;
    const cls = win.childCanvasClass.toLowerCase();
    return VerifiedWin32ChildCanvasProvider.VERIFIED_CLASSES.some((c) => cls.includes(c));
  }

  public detectCanvas(win: WindowDescriptor): CanvasDetectionResult {
    if (!this.canProvideCanvas(win) || !isValidTargetRect(win.childCanvasRect)) {
      return {
        providerId: this.providerId,
        supported: false,
        verified: false,
        requiresCalibration: true,
        targetId: win.hwnd,
        bounds: null,
        units: this.geometryUnits,
        reason: 'No verified native child canvas HWND exposed by window',
      };
    }

    // Verify child canvas lies strictly within the visible window frame
    const parent = win.visibleFrameBounds;
    const child = win.childCanvasRect;
    const insideParent =
      child.left >= parent.left &&
      child.top >= parent.top &&
      child.left + child.width <= parent.left + parent.width + 4 &&
      child.top + child.height <= parent.top + parent.height + 4;

    if (!insideParent) {
      return {
        providerId: this.providerId,
        supported: false,
        verified: false,
        requiresCalibration: true,
        targetId: win.hwnd,
        bounds: null,
        units: this.geometryUnits,
        reason: 'Child canvas rect failed parent containment verification',
      };
    }

    return {
      providerId: this.providerId,
      supported: true,
      verified: true,
      requiresCalibration: false,
      targetId: `${win.hwnd}:${win.childCanvasClass}`,
      bounds: { ...child },
      units: this.geometryUnits,
      reason: `Verified native child canvas (${win.childCanvasClass})`,
    };
  }
}

// ==============================================================================
// Phase 4.10.6 — Five-Point Calibration Fallback Engine
// ==============================================================================

export class FivePointCalibrator {
  public static readonly REQUIRED_LABELS: CalibrationPointPair['label'][] = [
    'TopLeft',
    'TopRight',
    'BottomLeft',
    'BottomRight',
    'Center',
  ];

  /**
   * Computes the acceptance residual threshold (2.0 px on 1920x1080 per Phase 4.9,
   * scaled proportionally for other target resolutions, minimum 1.5 px).
   */
  public static computeAcceptanceThresholdPx(targetWidth: number, targetHeight: number): number {
    const diag = Math.hypot(Math.max(1, targetWidth), Math.max(1, targetHeight));
    const refDiag = Math.hypot(1920, 1080);
    return Math.max(1.5, Number(((2.0 * diag) / refDiag).toFixed(4)));
  }

  /**
   * Validates and fits a rectangular scale/offset calibration transform from 5 captured points.
   */
  public static computeCalibration(params: {
    points: CalibrationPointPair[];
    sourceWidth: number;
    sourceHeight: number;
    sourceOrientation: OrientationMode;
    targetMode: TargetMode;
    targetId: string;
    targetBounds: TargetRect;
    version?: number;
    nowMs?: number;
  }): { ok: boolean; transform?: CalibrationTransform; error?: string } {
    const {
      points,
      sourceWidth,
      sourceHeight,
      sourceOrientation,
      targetMode,
      targetId,
      targetBounds,
      version = 1,
      nowMs = Date.now(),
    } = params;

    if (!Array.isArray(points) || points.length !== 5) {
      return { ok: false, error: 'Five-point calibration requires exactly 5 points (TL, TR, BL, BR, Center).' };
    }

    if (!isValidTargetRect(targetBounds) || sourceWidth < 2 || sourceHeight < 2) {
      return { ok: false, error: 'Invalid source or target geometry for calibration.' };
    }

    // Verify all 5 required labels exist in order
    for (let i = 0; i < 5; i++) {
      const pt = points[i];
      if (!pt || pt.label !== FivePointCalibrator.REQUIRED_LABELS[i]) {
        return {
          ok: false,
          error: `Calibration point ${i} must be ${FivePointCalibrator.REQUIRED_LABELS[i]} (got ${pt?.label ?? 'missing'}).`,
        };
      }
      if (
        !Number.isFinite(pt.sourceNorm.x) ||
        !Number.isFinite(pt.sourceNorm.y) ||
        !Number.isFinite(pt.targetPhysical.x) ||
        !Number.isFinite(pt.targetPhysical.y)
      ) {
        return { ok: false, error: `Calibration point ${pt.label} contains non-finite coordinates.` };
      }
    }

    // Check for duplicate target points
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].targetPhysical.x - points[j].targetPhysical.x;
        const dy = points[i].targetPhysical.y - points[j].targetPhysical.y;
        if (Math.hypot(dx, dy) < 8) {
          return {
            ok: false,
            error: `Duplicate or near-duplicate calibration points (${points[i].label} and ${points[j].label}).`,
          };
        }
      }
    }

    const [tl, tr, bl, br, center] = points;

    // Validate geometric ordering of corners and center
    const topWidth = tr.targetPhysical.x - tl.targetPhysical.x;
    const bottomWidth = br.targetPhysical.x - bl.targetPhysical.x;
    const leftHeight = bl.targetPhysical.y - tl.targetPhysical.y;
    const rightHeight = br.targetPhysical.y - tr.targetPhysical.y;

    if (topWidth < 32 || bottomWidth < 32 || leftHeight < 32 || rightHeight < 32) {
      return {
        ok: false,
        error: 'Degenerate or inverted corner ordering: target width/height must be at least 32 px.',
      };
    }

    const minX = Math.min(tl.targetPhysical.x, bl.targetPhysical.x);
    const maxX = Math.max(tr.targetPhysical.x, br.targetPhysical.x);
    const minY = Math.min(tl.targetPhysical.y, tr.targetPhysical.y);
    const maxY = Math.max(bl.targetPhysical.y, br.targetPhysical.y);

    if (
      center.targetPhysical.x <= minX ||
      center.targetPhysical.x >= maxX ||
      center.targetPhysical.y <= minY ||
      center.targetPhysical.y >= maxY
    ) {
      return {
        ok: false,
        error: 'Calibration center point falls outside the corner bounding box.',
      };
    }

    // Fit least-squares rectangular scale + offset model:
    // X = offsetX + normX * scaleX
    // Y = offsetY + normY * scaleY
    let sumU = 0,
      sumV = 0,
      sumX = 0,
      sumY = 0,
      sumUU = 0,
      sumVV = 0,
      sumUX = 0,
      sumVY = 0;

    for (const p of points) {
      const u = p.sourceNorm.x;
      const v = p.sourceNorm.y;
      const x = p.targetPhysical.x;
      const y = p.targetPhysical.y;
      sumU += u;
      sumV += v;
      sumX += x;
      sumY += y;
      sumUU += u * u;
      sumVV += v * v;
      sumUX += u * x;
      sumVY += v * y;
    }

    const n = points.length;
    const denomU = n * sumUU - sumU * sumU;
    const denomV = n * sumVV - sumV * sumV;
    if (Math.abs(denomU) < 1e-9 || Math.abs(denomV) < 1e-9) {
      return { ok: false, error: 'Degenerate source normalized points; cannot solve transform.' };
    }

    const scaleX = (n * sumUX - sumU * sumX) / denomU;
    const offsetX = (sumX - scaleX * sumU) / n;
    const scaleY = (n * sumVY - sumV * sumY) / denomV;
    const offsetY = (sumY - scaleY * sumV) / n;

    if (scaleX < 32 || scaleY < 32) {
      return { ok: false, error: 'Solved calibration scale is too small or negative.' };
    }

    const residualsPx: number[] = [];
    let maxResidualPx = 0;
    let sumResidualPx = 0;

    for (const p of points) {
      const predX = offsetX + p.sourceNorm.x * scaleX;
      const predY = offsetY + p.sourceNorm.y * scaleY;
      const res = Math.hypot(predX - p.targetPhysical.x, predY - p.targetPhysical.y);
      residualsPx.push(Number(res.toFixed(4)));
      if (res > maxResidualPx) maxResidualPx = res;
      sumResidualPx += res;
    }

    const meanResidualPx = Number((sumResidualPx / n).toFixed(4));
    maxResidualPx = Number(maxResidualPx.toFixed(4));
    const thresholdPx = FivePointCalibrator.computeAcceptanceThresholdPx(
      targetBounds.width,
      targetBounds.height
    );

    if (maxResidualPx > thresholdPx) {
      return {
        ok: false,
        error: `Calibration residual ${maxResidualPx.toFixed(2)} px exceeds acceptance threshold ${thresholdPx.toFixed(2)} px. Please recapture.`,
      };
    }

    return {
      ok: true,
      transform: {
        version,
        scaleX,
        scaleY,
        offsetX,
        offsetY,
        maxResidualPx,
        meanResidualPx,
        residualsPx,
        thresholdPx,
        sourceWidth,
        sourceHeight,
        sourceOrientation,
        targetMode,
        targetId,
        targetBounds: { ...targetBounds },
        createdAtMs: nowMs,
      },
    };
  }

  /**
   * Checks if an existing calibration remains valid for the current source & target geometry.
   */
  public static isCalibrationCompatible(
    cal: CalibrationTransform | null,
    source: SourceSurfaceGeometry,
    targetMode: TargetMode,
    targetId: string,
    targetBounds: TargetRect
  ): boolean {
    if (!cal) return false;
    return (
      cal.sourceWidth === source.width &&
      cal.sourceHeight === source.height &&
      cal.sourceOrientation === source.orientation &&
      cal.targetMode === targetMode &&
      cal.targetId === targetId &&
      cal.targetBounds.left === targetBounds.left &&
      cal.targetBounds.top === targetBounds.top &&
      cal.targetBounds.width === targetBounds.width &&
      cal.targetBounds.height === targetBounds.height
    );
  }

  /**
   * Direct solver and validator used by automated test suites and TargetGeometryManager.
   */
  public static solveAndValidate(
    points: CalibrationPointPair[],
    source: SourceSurfaceGeometry,
    targetMode: TargetMode,
    targetId: string,
    targetBounds: TargetRect,
    customThresholdPx?: number
  ): { ok: boolean; calibration?: CalibrationTransform; error?: string } {
    if (!Array.isArray(points) || points.length !== 5) {
      return { ok: false, error: 'InvalidPointCount' };
    }
    // Check duplicate target points first
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].targetPhysical.x - points[j].targetPhysical.x;
        const dy = points[i].targetPhysical.y - points[j].targetPhysical.y;
        if (Math.hypot(dx, dy) < 8) {
          return { ok: false, error: 'DuplicateTargetPoints' };
        }
      }
    }
    const [tl, tr, bl, br] = points;
    if (tr.targetPhysical.x - tl.targetPhysical.x < 32 || br.targetPhysical.x - bl.targetPhysical.x < 32) {
      return { ok: false, error: 'InvalidCornerHorizontalOrder' };
    }
    if (bl.targetPhysical.y - tl.targetPhysical.y < 32 || br.targetPhysical.y - tr.targetPhysical.y < 32) {
      return { ok: false, error: 'InvalidCornerVerticalOrder' };
    }

    const res = FivePointCalibrator.computeCalibration({
      points,
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceOrientation: source.orientation,
      targetMode,
      targetId,
      targetBounds,
    });

    if (!res.ok) {
      if (res.error && res.error.includes('exceeds acceptance threshold')) {
        return { ok: false, error: `MaxResidualExceeded: ${res.error}` };
      }
      return { ok: false, error: res.error };
    }

    if (
      customThresholdPx !== undefined &&
      res.transform &&
      res.transform.maxResidualPx > customThresholdPx
    ) {
      return {
        ok: false,
        error: `MaxResidualExceeded: ${res.transform.maxResidualPx} > ${customThresholdPx}`,
      };
    }

    return { ok: true, calibration: res.transform };
  }
}


// ==============================================================================
// Phase 4.10.9 — Authoritative Target-Geometry & Active-Stroke Lifecycle Manager
// ==============================================================================

interface LatchedStrokeGeometry {
  sourceGeometry: SourceSurfaceGeometry;
  targetBounds: TargetRect;
  activeMappedBounds: TargetRect;
  calibration: CalibrationTransform | null;
  preserveAspectRatio: boolean;
  generation: number;
}

export class TargetGeometryManager {
  private monitors: Map<string, MonitorDescriptor> = new Map();
  private windows: Map<string, WindowDescriptor> = new Map();
  private canvasProviders: ITargetCanvasProvider[] = [
    new WebStudioDomCanvasProvider(),
    new VerifiedWin32ChildCanvasProvider(),
  ];

  private state: TargetGeometryState;
  private isStrokeActive = false;
  private latchedStroke: LatchedStrokeGeometry | null = null;
  private pendingGeometryUpdate = false;
  private onAutoPointerUpCallback?: (reason: string) => void;
  public onStrokeForceReleased?: (ev: { reason: string }) => void;
  private clock: () => number;

  constructor(options?: { clock?: () => number; onAutoPointerUp?: (reason: string) => void }) {
    this.clock = options?.clock ?? (() => Date.now());
    this.onAutoPointerUpCallback = options?.onAutoPointerUp;

    const defaultMonitors: MonitorDescriptor[] = [
      {
        id: 'MON-PRIMARY-1080P',
        name: 'Primary Monitor (1920×1080)',
        isPrimary: true,
        rcMonitor: { left: 0, top: 0, width: 1920, height: 1080 },
        rcWork: { left: 0, top: 0, width: 1920, height: 1040 },
        dpiX: 96,
        dpiY: 96,
        scaleFactor: 1.0,
        orientation: 'landscape',
        isConnected: true,
      },
      {
        id: 'MON-SECONDARY-QHD',
        name: 'Secondary QHD Monitor (2560×1440)',
        isPrimary: false,
        rcMonitor: { left: 1920, top: 0, width: 2560, height: 1440 },
        rcWork: { left: 1920, top: 0, width: 2560, height: 1400 },
        dpiX: 120,
        dpiY: 120,
        scaleFactor: 1.25,
        orientation: 'landscape',
        isConnected: true,
      },
      {
        id: 'MON-LEFT-NEG',
        name: 'Left Monitor (-1920, 0)',
        isPrimary: false,
        rcMonitor: { left: -1920, top: 0, width: 1920, height: 1080 },
        rcWork: { left: -1920, top: 0, width: 1920, height: 1040 },
        dpiX: 96,
        dpiY: 96,
        scaleFactor: 1.0,
        orientation: 'landscape',
        isConnected: true,
      },
    ];
    for (const m of defaultMonitors) {
      this.monitors.set(m.id, m);
    }

    const defaultWindows: WindowDescriptor[] = [
      {
        hwnd: 'HWND-CLIPSTUDIO',
        processId: 4100,
        processName: 'ClipStudioPaint.exe',
        appId: 'clipstudio',
        title: 'Clip Studio Paint — Canvas_01.clip',
        visibleFrameBounds: { left: 100, top: 60, width: 1600, height: 900 },
        clientBounds: { left: 100, top: 60, width: 1600, height: 900 },
        isMinimized: false,
        isVisible: true,
        isDestroyed: false,
        childCanvasRect: { left: 260, top: 140, width: 1200, height: 720 },
        childCanvasClass: 'CSP_CanvasViewport',
      },
      {
        hwnd: 'HWND-PHOTOSHOP',
        processId: 4200,
        processName: 'Photoshop.exe',
        appId: 'photoshop',
        title: 'Adobe Photoshop — Artwork.psd @ 100%',
        visibleFrameBounds: { left: 80, top: 40, width: 1720, height: 980 },
        clientBounds: { left: 80, top: 40, width: 1720, height: 980 },
        isMinimized: false,
        isVisible: true,
        isDestroyed: false,
        childCanvasRect: null,
        childCanvasClass: null,
      },
      {
        hwnd: 'HWND-WEBSTUDIO',
        processId: 4300,
        processName: 'WebStudio-Browser',
        appId: 'webstudio',
        title: 'Air Canvas Web Studio — HTML5 Canvas',
        visibleFrameBounds: { left: 0, top: 0, width: 1920, height: 1080 },
        clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
        isMinimized: false,
        isVisible: true,
        isDestroyed: false,
        childCanvasRect: { left: 160, top: 90, width: 1600, height: 900 },
        childCanvasClass: 'HTMLCanvasElement',
      },
    ];
    for (const w of defaultWindows) {
      this.windows.set(w.hwnd, w);
    }

    const defaultMonitor = defaultMonitors[0];
    const initialSource: SourceSurfaceGeometry = {
      width: 800,
      height: 450,
      devicePixelRatio: 2.0,
      orientation: 'landscape',
      safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    };

    const activeMapped = computeAspectPreservingTargetRect(
      initialSource.width,
      initialSource.height,
      defaultMonitor.rcMonitor,
      true
    );

    this.state = {
      targetMode: 'MONITOR',
      targetId: defaultMonitor.id,
      targetName: defaultMonitor.name,
      targetAvailable: true,
      targetUnavailableReason: null,
      sourceGeometry: initialSource,
      targetBounds: { ...defaultMonitor.rcMonitor },
      activeMappedBounds: activeMapped,
      coordinateUnits: 'physical_px',
      dpiAwareVerified: true,
      preserveAspectRatio: true,
      followActiveWindow: false,
      useMonitorWorkArea: false,
      providerId: null,
      canvasDetectionSupported: false,
      canvasBoundsVerified: false,
      requiresCalibrationFallback: false,
      calibrationStatus: 'NONE',
      calibration: null,
      calibrationError: null,
      generation: 1,
      lastSuccessfulDetectionMs: this.clock(),
      lastFailureReason: null,
    };
  }

  public getState(): Readonly<TargetGeometryState> {
    return {
      ...this.state,
      sourceGeometry: { ...this.state.sourceGeometry },
      targetBounds: { ...this.state.targetBounds },
      activeMappedBounds: { ...this.state.activeMappedBounds },
    };
  }

  public getMonitors(): MonitorDescriptor[] {
    return Array.from(this.monitors.values());
  }

  public getWindows(): WindowDescriptor[] {
    return Array.from(this.windows.values());
  }

  public getEligibleWindows(): WindowDescriptor[] {
    return Array.from(this.windows.values()).filter(
      (w) => w.isVisible && !w.isMinimized && !w.isDestroyed && isValidTargetRect(w.visibleFrameBounds)
    );
  }

  public registerCanvasProvider(provider: ITargetCanvasProvider): void {
    this.canvasProviders.unshift(provider);
  }

  public setPreserveAspectRatio(preserve: boolean): void {
    this.state.preserveAspectRatio = preserve;
    this.recomputeGeometry('aspect-ratio-mode-change');
  }

  public setUseMonitorWorkArea(useWorkArea: boolean): void {
    this.state.useMonitorWorkArea = useWorkArea;
    this.recomputeGeometry('monitor-work-area-toggle');
  }

  public setFollowActiveWindow(follow: boolean): void {
    this.state.followActiveWindow = follow;
  }

  /**
   * Updates the runtime mobile/tablet drawing widget geometry.
   * Accepts either (partial: Partial<SourceSurfaceGeometry>) or (width, height, dpr?, safeAreaInsets?).
   * If a stroke is currently active, latches the current stroke's transform until pointerUp/Cancel.
   */
  public updateSourceGeometry(
    first: Partial<SourceSurfaceGeometry> | number,
    heightArg?: number,
    dprArg?: number,
    safeAreaArg?: { top: number; bottom: number; left: number; right: number }
  ): boolean {
    const partial: Partial<SourceSurfaceGeometry> =
      typeof first === 'number'
        ? {
            width: first,
            height: heightArg,
            devicePixelRatio: dprArg,
            safeAreaInsets: safeAreaArg,
          }
        : first;

    const w = partial.width ?? this.state.sourceGeometry.width;
    const h = partial.height ?? this.state.sourceGeometry.height;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) {
      this.state.lastFailureReason = 'Rejected invalid source surface dimensions (< 2 px or non-finite)';
      return false;
    }

    const orientation: OrientationMode =
      partial.orientation ?? (w >= h ? 'landscape' : 'portrait');

    const nextSource: SourceSurfaceGeometry = {
      width: w,
      height: h,
      devicePixelRatio: partial.devicePixelRatio ?? this.state.sourceGeometry.devicePixelRatio,
      orientation,
      safeAreaInsets: partial.safeAreaInsets ?? this.state.sourceGeometry.safeAreaInsets,
    };

    if (this.isStrokeActive) {
      // Queue atomic update for after the current stroke ends while keeping latchedStroke intact
      this.state.sourceGeometry = nextSource;
      this.pendingGeometryUpdate = true;
      return true;
    }

    this.state.sourceGeometry = nextSource;
    this.recomputeGeometry('source-geometry-change');
    return true;
  }

  /**
   * Updates the list of physical monitors at runtime.
   */
  public setMonitors(monitors: MonitorDescriptor[], callbackGeneration?: number): boolean {
    if (callbackGeneration !== undefined && callbackGeneration < this.state.generation) {
      return false;
    }

    this.monitors.clear();
    for (const m of monitors) {
      if (isValidTargetRect(m.rcMonitor)) {
        this.monitors.set(m.id, { ...m });
      }
    }

    if (!this.monitors.has(this.state.targetId) && monitors.length > 0 && this.state.targetMode === 'MONITOR') {
      this.state.targetId = monitors[0].id;
    }

    this.recomputeGeometry('monitors-updated');
    return true;
  }

  public setMonitorConnected(monId: string, isConnected: boolean): void {
    const mon = this.monitors.get(monId);
    if (!mon) return;
    mon.isConnected = isConnected;
    this.recomputeGeometry('monitor-connection-change');
  }

  /**
   * Updates the list of application windows at runtime.
   */
  public setWindows(
    windows: WindowDescriptor[],
    foregroundHwnd?: string,
    callbackGeneration?: number
  ): boolean {
    if (callbackGeneration !== undefined && callbackGeneration < this.state.generation) {
      return false;
    }

    this.windows.clear();
    for (const w of windows) {
      this.windows.set(w.hwnd, { ...w });
    }

    if (
      this.state.followActiveWindow &&
      foregroundHwnd &&
      (this.state.targetMode === 'WINDOW' || this.state.targetMode === 'CANVAS') &&
      foregroundHwnd !== this.state.targetId
    ) {
      const fgWin = this.windows.get(foregroundHwnd);
      if (fgWin && fgWin.isVisible && !fgWin.isMinimized && !fgWin.isDestroyed) {
        this.state.targetId = foregroundHwnd;
      }
    }

    this.recomputeGeometry('windows-updated');
    return true;
  }

  public setWindowState(hwnd: string, patch: Partial<WindowDescriptor>): void {
    const existing = this.windows.get(hwnd);
    if (!existing) return;
    const updated: WindowDescriptor = {
      ...existing,
      ...patch,
      visibleFrameBounds: patch.visibleFrameBounds
        ? { ...patch.visibleFrameBounds }
        : existing.visibleFrameBounds,
    };
    this.windows.set(hwnd, updated);
    this.recomputeGeometry('window-state-change');
  }

  public setTargetMode(mode: TargetMode): boolean {
    let nextId = this.state.targetId;
    if (mode === 'MONITOR' && !this.monitors.has(nextId)) {
      const firstMon = Array.from(this.monitors.values())[0];
      if (firstMon) nextId = firstMon.id;
    } else if ((mode === 'WINDOW' || mode === 'CANVAS') && !this.windows.has(nextId)) {
      const firstWin = Array.from(this.windows.values())[0];
      if (firstWin) nextId = firstWin.hwnd;
    }
    return this.selectTarget(mode, nextId);
  }

  public selectMonitor(monId: string): boolean {
    return this.selectTarget('MONITOR', monId);
  }

  public selectWindow(hwnd: string): boolean {
    const mode = this.state.targetMode === 'CANVAS' ? 'CANVAS' : 'WINDOW';
    return this.selectTarget(mode, hwnd);
  }

  /**
   * Selects MONITOR, WINDOW, or CANVAS target mode and target identity.
   * Never silently falls back from CANVAS to WINDOW or MONITOR if unsupported.
   */
  public selectTarget(mode: TargetMode, targetId: string): boolean {
    if (this.isStrokeActive) {
      this.finalizeActiveStrokeSafely('target-mode-switched');
    }
    this.state.generation++;
    this.state.targetMode = mode;
    this.state.targetId = targetId;
    this.recomputeGeometry('select-target');
    return this.state.targetAvailable;
  }

  /**
   * Starts or applies 5-point manual calibration fallback.
   */
  public applyFivePointCalibration(points: CalibrationPointPair[]): {
    ok: boolean;
    calibration?: CalibrationTransform;
    transform?: CalibrationTransform;
    error?: string;
  } {
    if (this.isStrokeActive) {
      this.finalizeActiveStrokeSafely('calibration-started');
    }

    let refBounds = this.state.targetBounds;
    const win = this.windows.get(this.state.targetId);
    const mon = this.monitors.get(this.state.targetId) ?? this.getMonitors()[0];
    if (win && isValidTargetRect(win.visibleFrameBounds)) {
      refBounds = win.visibleFrameBounds;
    } else if (!isValidTargetRect(refBounds) && mon && isValidTargetRect(mon.rcMonitor)) {
      refBounds = mon.rcMonitor;
    }

    const nextVersion = (this.state.calibration?.version ?? 0) + 1;
    const res = FivePointCalibrator.computeCalibration({
      points,
      sourceWidth: this.state.sourceGeometry.width,
      sourceHeight: this.state.sourceGeometry.height,
      sourceOrientation: this.state.sourceGeometry.orientation,
      targetMode: this.state.targetMode,
      targetId: this.state.targetId,
      targetBounds: refBounds,
      version: nextVersion,
      nowMs: this.clock(),
    });

    if (!res.ok || !res.transform) {
      this.state.calibrationStatus = 'FAILED';
      this.state.calibrationError = res.error ?? 'Calibration failed';
      this.state.lastFailureReason = this.state.calibrationError;
      return res;
    }

    const calibratedRect: TargetRect = {
      left: roundHalfAwayFromZero(res.transform.offsetX),
      top: roundHalfAwayFromZero(res.transform.offsetY),
      width: Math.max(2, roundHalfAwayFromZero(res.transform.scaleX) + 1),
      height: Math.max(2, roundHalfAwayFromZero(res.transform.scaleY) + 1),
    };

    // Store the parent window/monitor reference bounds in calibration.targetBounds so we can detect window resize/move
    res.transform.targetBounds = { ...refBounds };
    this.state.calibration = res.transform;
    this.state.calibrationStatus = 'VALID';
    this.state.calibrationError = null;
    this.state.requiresCalibrationFallback = false;
    this.state.targetBounds = { ...calibratedRect };
    this.state.activeMappedBounds = { ...calibratedRect };
    this.state.targetAvailable = true;
    this.state.targetUnavailableReason = null;
    this.state.lastSuccessfulDetectionMs = this.clock();
    return { ok: true, calibration: res.transform, transform: res.transform };
  }

  public cancelCalibration(): void {
    if (this.isStrokeActive) {
      this.finalizeActiveStrokeSafely('calibration-cancelled');
    }
    this.state.calibration = null;
    this.state.calibrationError = null;
    this.state.calibrationStatus = 'NONE';
    this.recomputeGeometry('calibration-cancelled');
  }

  /**
   * Recomputes target bounds and validates calibration.
   * Never silently switches from a disconnected monitor or unsupported CANVAS to another target.
   */
  public recomputeGeometry(_triggerReason = 'recompute'): void {
    this.state.generation++;

    if (this.state.targetMode === 'MONITOR') {
      const mon = this.monitors.get(this.state.targetId);
      if (!mon || !mon.isConnected || !isValidTargetRect(mon.rcMonitor)) {
        this.markTargetUnavailable(`Selected monitor '${this.state.targetId}' is disconnected or unavailable.`);
        return;
      }

      const chosenRect =
        this.state.useMonitorWorkArea && isValidTargetRect(mon.rcWork)
          ? mon.rcWork
          : mon.rcMonitor;

      this.applyValidatedTargetBounds({
        targetName: mon.name,
        bounds: chosenRect,
        providerId: 'win32-monitor',
        canvasSupported: false,
        canvasVerified: false,
        requiresCalibration: false,
      });
      return;
    }

    if (this.state.targetMode === 'WINDOW') {
      const win = this.windows.get(this.state.targetId);
      if (!win || win.isDestroyed || !win.isVisible || win.isMinimized || !isValidTargetRect(win.visibleFrameBounds)) {
        const reason = !win
          ? `Selected window '${this.state.targetId}' was closed or not found.`
          : win.isMinimized
          ? `Minimized: Selected window '${win.title}' is minimized.`
          : `Selected window '${win.title}' has invalid bounds.`;
        this.markTargetUnavailable(reason);
        return;
      }

      this.applyValidatedTargetBounds({
        targetName: `${win.title} (${win.processName})`,
        bounds: win.visibleFrameBounds,
        providerId: 'win32-window-frame',
        canvasSupported: false,
        canvasVerified: false,
        requiresCalibration: false,
      });
      return;
    }

    if (this.state.targetMode === 'CANVAS') {
      const win = this.windows.get(this.state.targetId);
      if (!win || win.isDestroyed || !win.isVisible || win.isMinimized) {
        this.markTargetUnavailable(
          win?.isMinimized
            ? `Minimized: Target application window '${win.title}' is minimized.`
            : `Target application window '${this.state.targetId}' is unavailable or closed.`
        );
        return;
      }

      const provider = this.canvasProviders.find((p) => p.canProvideCanvas(win));
      if (provider) {
        const result = provider.detectCanvas(win);
        if (result.supported && result.verified && result.bounds && isValidTargetRect(result.bounds)) {
          this.applyValidatedTargetBounds({
            targetName: `${win.title} [Canvas]`,
            bounds: result.bounds,
            providerId: result.providerId,
            canvasSupported: true,
            canvasVerified: true,
            requiresCalibration: false,
          });
          return;
        }
      }

      // If a valid, compatible 5-point calibration already exists for this window, keep using it
      if (
        this.state.calibration &&
        FivePointCalibrator.isCalibrationCompatible(
          this.state.calibration,
          this.state.sourceGeometry,
          'CANVAS',
          this.state.targetId,
          win.visibleFrameBounds
        )
      ) {
        const calibratedRect: TargetRect = {
          left: roundHalfAwayFromZero(this.state.calibration.offsetX),
          top: roundHalfAwayFromZero(this.state.calibration.offsetY),
          width: Math.max(2, roundHalfAwayFromZero(this.state.calibration.scaleX) + 1),
          height: Math.max(2, roundHalfAwayFromZero(this.state.calibration.scaleY) + 1),
        };
        this.state.targetAvailable = true;
        this.state.targetUnavailableReason = null;
        this.state.canvasDetectionSupported = false;
        this.state.canvasBoundsVerified = false;
        this.state.requiresCalibrationFallback = false;
        this.state.calibrationStatus = 'VALID';
        this.state.targetBounds = calibratedRect;
        this.state.activeMappedBounds = calibratedRect;
        return;
      }

      // Automatic canvas detection is unsupported for this app — require 5-point calibration fallback!
      if (this.state.calibration) {
        this.state.calibrationStatus = 'INVALIDATED';
        this.state.calibration = null;
      }
      this.state.providerId = provider?.providerId ?? null;
      this.state.canvasDetectionSupported = false;
      this.state.canvasBoundsVerified = false;
      this.state.requiresCalibrationFallback = true;
      this.state.targetBounds = { ...win.visibleFrameBounds };
      this.state.activeMappedBounds = { left: 0, top: 0, width: 0, height: 0 };
      this.markTargetUnavailable(
        `Automatic CANVAS detection is unsupported for '${win.processName}'. Complete 5-point calibration or explicitly select WINDOW/MONITOR mode.`
      );
    }
  }

  private applyValidatedTargetBounds(info: {
    targetName: string;
    bounds: TargetRect;
    providerId: string;
    canvasSupported: boolean;
    canvasVerified: boolean;
    requiresCalibration: boolean;
  }): void {
    if (
      this.state.calibration &&
      !FivePointCalibrator.isCalibrationCompatible(
        this.state.calibration,
        this.state.sourceGeometry,
        this.state.targetMode,
        this.state.targetId,
        info.bounds
      )
    ) {
      this.state.calibration = null;
      this.state.calibrationStatus = 'INVALIDATED';
    }

    if (this.isStrokeActive) {
      // Queue atomic update until current stroke completes
      this.pendingGeometryUpdate = true;
      return;
    }

    this.state.targetName = info.targetName;
    this.state.targetBounds = { ...info.bounds };
    this.state.activeMappedBounds = computeAspectPreservingTargetRect(
      this.state.sourceGeometry.width,
      this.state.sourceGeometry.height,
      info.bounds,
      this.state.preserveAspectRatio
    );
    this.state.providerId = info.providerId;
    this.state.canvasDetectionSupported = info.canvasSupported;
    this.state.canvasBoundsVerified = info.canvasVerified;
    this.state.requiresCalibrationFallback = info.requiresCalibration;
    this.state.targetAvailable = true;
    this.state.targetUnavailableReason = null;
    this.state.lastSuccessfulDetectionMs = this.clock();
  }

  private markTargetUnavailable(reason: string): void {
    if (this.isStrokeActive) {
      this.finalizeActiveStrokeSafely(reason);
    }
    this.state.targetAvailable = false;
    this.state.targetUnavailableReason = reason;
    this.state.lastFailureReason = reason;
  }

  public hasActiveStroke(): boolean {
    return this.isStrokeActive;
  }

  public beginStroke(localX?: number, localY?: number): ProjectedTargetPoint {
    if (localX !== undefined && localY !== undefined) {
      return this.projectFromSourceLocal(localX, localY, 'pointerDown');
    }
    if (!this.state.targetAvailable) {
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: 0.5,
        normY: 0.5,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: this.state.targetUnavailableReason ?? 'Target unavailable',
      };
    }
    this.latchCurrentStroke();
    return this.projectNormalizedPoint(0.5, 0.5);
  }

  public moveStroke(localX: number, localY: number): ProjectedTargetPoint {
    return this.projectFromSourceLocal(localX, localY, 'pointerMove');
  }

  public endStroke(localX?: number, localY?: number): ProjectedTargetPoint {
    if (localX !== undefined && localY !== undefined) {
      return this.projectFromSourceLocal(localX, localY, 'pointerUp');
    }
    this.releaseLatchedStroke();
    return {
      ok: true,
      targetX: 0,
      targetY: 0,
      normX: 0.5,
      normY: 0.5,
      insideActiveRegion: true,
      calibrationApplied: false,
    };
  }

  private latchCurrentStroke(): void {
    this.isStrokeActive = true;
    this.latchedStroke = {
      sourceGeometry: { ...this.state.sourceGeometry },
      targetBounds: { ...this.state.targetBounds },
      activeMappedBounds: { ...this.state.activeMappedBounds },
      calibration: this.state.calibration ? { ...this.state.calibration } : null,
      preserveAspectRatio: this.state.preserveAspectRatio,
      generation: this.state.generation,
    };
  }

  private releaseLatchedStroke(): void {
    this.isStrokeActive = false;
    this.latchedStroke = null;
    if (this.pendingGeometryUpdate) {
      this.pendingGeometryUpdate = false;
      this.recomputeGeometry('apply-queued-post-stroke-geometry');
    }
  }

  public finalizeActiveStrokeSafely(reason: string): void {
    if (this.isStrokeActive) {
      this.isStrokeActive = false;
      this.latchedStroke = null;
      this.pendingGeometryUpdate = false;
      this.onAutoPointerUpCallback?.(reason);
      this.onStrokeForceReleased?.({ reason });
    }
  }

  public handleTransportDisconnect(reason: string): void {
    this.finalizeActiveStrokeSafely(reason);
  }

  public applyAsyncDetectionCallback(callbackGeneration: number, fn: () => void): boolean {
    if (callbackGeneration < this.state.generation) {
      return false;
    }
    fn();
    return true;
  }

  public onReconnect(): void {
    this.finalizeActiveStrokeSafely('reconnect-revalidation');
    this.recomputeGeometry('reconnect-revalidation');
  }

  /**
   * Projects normalized coordinates to physical target coordinates.
   * Honors latched stroke geometry during an active stroke and guarantees calibration is never applied twice.
   */
  public projectNormalizedPoint(
    normX: number,
    normY: number,
    alreadyCalibrated = false
  ): ProjectedTargetPoint {
    if (!this.state.targetAvailable && !this.isStrokeActive) {
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: 0.5,
        normY: 0.5,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: this.state.targetUnavailableReason ?? 'Target unavailable',
      };
    }

    if (!Number.isFinite(normX) || !Number.isFinite(normY)) {
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: 0.5,
        normY: 0.5,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: 'Non-finite normalized coordinates rejected',
      };
    }

    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    const activeBounds = this.latchedStroke
      ? this.latchedStroke.activeMappedBounds
      : this.state.activeMappedBounds;

    if (!isValidTargetRect(activeBounds)) {
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: clampedX,
        normY: clampedY,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: 'Active target bounds are degenerate or invalid',
      };
    }

    const spanW = Math.max(0, activeBounds.width - 1);
    const spanH = Math.max(0, activeBounds.height - 1);

    const targetX = activeBounds.left + roundHalfAwayFromZero(clampedX * spanW);
    const targetY = activeBounds.top + roundHalfAwayFromZero(clampedY * spanH);

    const hasCal = Boolean(this.latchedStroke ? this.latchedStroke.calibration : this.state.calibration);

    return {
      ok: true,
      targetX,
      targetY,
      normX: clampedX,
      normY: clampedY,
      insideActiveRegion: normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1,
      calibrationApplied: alreadyCalibrated ? true : hasCal,
    };
  }

  /**
   * Full pipeline from mobile/tablet widget-local pointer coordinates -> active source pad rect -> target physical pixels.
   */
  public projectFromSourceLocal(
    localX: number,
    localY: number,
    eventType: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerHover'
  ): ProjectedTargetPoint {
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: 0.5,
        normY: 0.5,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: 'Non-finite local coordinates rejected',
      };
    }

    if (eventType === 'pointerDown') {
      if (!this.state.targetAvailable) {
        return {
          ok: false,
          targetX: 0,
          targetY: 0,
          normX: 0.5,
          normY: 0.5,
          insideActiveRegion: false,
          calibrationApplied: false,
          reason: this.state.targetUnavailableReason ?? 'Target unavailable',
        };
      }
      this.latchCurrentStroke();
    }

    const src = this.latchedStroke ? this.latchedStroke.sourceGeometry : this.state.sourceGeometry;
    const normRes = normalizeSourcePoint(localX, localY, src.width, src.height);
    if (!normRes.valid) {
      if (eventType === 'pointerUp' || eventType === 'pointerDown') this.releaseLatchedStroke();
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: 0.5,
        normY: 0.5,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: 'Invalid source geometry',
      };
    }

    // Reject pointerDown outside the active source pad boundaries
    if (eventType === 'pointerDown' && !normRes.insideBounds) {
      this.releaseLatchedStroke();
      return {
        ok: false,
        targetX: 0,
        targetY: 0,
        normX: normRes.normX,
        normY: normRes.normY,
        insideActiveRegion: false,
        calibrationApplied: false,
        reason: 'PointerDown outside active drawing pad boundaries',
      };
    }

    const projected = this.projectNormalizedPoint(normRes.normX, normRes.normY, false);

    if (eventType === 'pointerUp') {
      this.releaseLatchedStroke();
    }

    return {
      ...projected,
      insideActiveRegion: normRes.insideBounds,
    };
  }
}

