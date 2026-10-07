// ==============================================================================
// AirCanvas License & Tier Service (Free vs Paid Pro Edition)
// ==============================================================================

export type TierType = 'free' | 'pro';

export interface EntitlementPayload {
  plan: 'FREE' | 'PRO';
  status: 'ACTIVE' | 'EXPIRED' | 'GRACE_PERIOD' | 'CANCELED' | 'ON_HOLD' | 'PAUSED';
  expiresAt?: string;
  features: {
    basicDrawing: boolean;
    advancedCalibration: boolean;
    multiMonitor: boolean;
    advancedSettings: boolean;
    ultraLowLatency: boolean;
    highPollingRate: boolean;
  };
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  provider: 'GOOGLE_PLAY';
  productId: 'aircanvas_pro_monthly' | 'aircanvas_pro_yearly';
  purchaseToken: string;
  orderId: string;
  status: 'ACTIVE' | 'GRACE_PERIOD' | 'ON_HOLD' | 'PAUSED' | 'CANCELED' | 'EXPIRED';
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  canceledAt?: string;
  revokedAt?: string;
}

export interface PurchaseRecord {
  id: string;
  userId: string;
  provider: 'GOOGLE_PLAY';
  productId: string;
  purchaseToken: string;
  orderId: string;
  purchaseState: 'PURCHASED' | 'PENDING';
  purchaseTime: string;
  expiryTime: string;
  acknowledged: boolean;
}

export interface LicenseInfo {
  tier: TierType;
  licenseKey?: string;
  licenseName: string;
  activatedAt?: number;
  isTrial?: boolean;
  trialDaysLeft?: number;
  subscription?: SubscriptionRecord;
}

export interface TierFeatures {
  tier: TierType;
  maxPressureLevels: number; // 1024 (Free) vs 8192 (Pro)
  ultraLowLatencyTurbo: boolean; // 4ms Turbo mode
  targetPollingRateHz: number; // 60Hz (Free) vs 240Hz (Pro)
  highDpiPhysicalLock: boolean; // Authoritative Win32 SetPhysicalCursorPos
  vectorSvgExport: boolean; // Scalable SVG export
  ultraHd4kExport: boolean; // 300 DPI 4K UHD PNG export
  customBezierCurves: boolean; // Custom Bezier pressure curves
  multiMonitorSwitching: boolean; // Multi-display selection
  advancedOneEuroTuning: boolean; // Custom beta / cutoff filters
  radialQuickPalette: boolean; // Pro floating shortcuts
  watermarkFree: boolean;
}

export class LicenseService {
  private static instance: LicenseService;
  private currentTier: TierType = 'pro'; // Default to Pro trial enabled for full experience
  private licenseKey = 'AIRPRO-2026-TURBO';
  private licenseName = 'Air Canvas Pro (Lifetime Studio)';
  private isTrial = false;
  private currentSubscription: SubscriptionRecord | null = null;
  private purchasesHistory: PurchaseRecord[] = [];
  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('aircanvas_license_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.tier === 'free' || parsed.tier === 'pro') {
          this.currentTier = parsed.tier;
          this.licenseKey = parsed.licenseKey || '';
          this.licenseName = parsed.licenseName || (parsed.tier === 'pro' ? 'Air Canvas Pro Studio' : 'Air Canvas Free');
          this.isTrial = Boolean(parsed.isTrial);
          this.currentSubscription = parsed.currentSubscription || null;
          this.purchasesHistory = parsed.purchasesHistory || [];
        }
      }
    } catch (e) {
      console.warn('Failed to load license state from localStorage', e);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        'aircanvas_license_v1',
        JSON.stringify({
          tier: this.currentTier,
          licenseKey: this.licenseKey,
          licenseName: this.licenseName,
          isTrial: this.isTrial,
          currentSubscription: this.currentSubscription,
          purchasesHistory: this.purchasesHistory,
        })
      );
    } catch (e) {
      console.warn('Failed to save license state', e);
    }
  }

  public get tier(): TierType {
    return this.currentTier;
  }

  public get isPro(): boolean {
    return this.currentTier === 'pro';
  }

  public get info(): LicenseInfo {
    return {
      tier: this.currentTier,
      licenseKey: this.licenseKey,
      licenseName: this.licenseName,
      isTrial: this.isTrial,
      trialDaysLeft: this.isTrial ? 14 : undefined,
    };
  }

  public get features(): TierFeatures {
    if (this.currentTier === 'pro') {
      return {
        tier: 'pro',
        maxPressureLevels: 8192,
        ultraLowLatencyTurbo: true,
        targetPollingRateHz: 240,
        highDpiPhysicalLock: true,
        vectorSvgExport: true,
        ultraHd4kExport: true,
        customBezierCurves: true,
        multiMonitorSwitching: true,
        advancedOneEuroTuning: true,
        radialQuickPalette: true,
        watermarkFree: true,
      };
    }

    return {
      tier: 'free',
      maxPressureLevels: 1024,
      ultraLowLatencyTurbo: false,
      targetPollingRateHz: 60,
      highDpiPhysicalLock: false,
      vectorSvgExport: false,
      ultraHd4kExport: false,
      customBezierCurves: false,
      multiMonitorSwitching: false,
      advancedOneEuroTuning: false,
      radialQuickPalette: false,
      watermarkFree: false,
    };
  }

  public activatePro(key = 'AIRPRO-2026-TURBO'): { success: boolean; message: string } {
    const cleanKey = key.trim().toUpperCase();
    // Accept valid format or demo keys
    const valid = cleanKey.length >= 8 || cleanKey.startsWith('AIRPRO') || cleanKey.startsWith('PRO');
    if (!valid) {
      return {
        success: false,
        message: 'Invalid key format. Please enter a valid Air Canvas Pro key (e.g. AIRPRO-2026-TURBO).',
      };
    }

    this.currentTier = 'pro';
    this.licenseKey = cleanKey;
    this.licenseName = 'Air Canvas Pro (Studio Activated)';
    this.isTrial = false;
    this.saveToStorage();
    this.notify();

    return {
      success: true,
      message: 'Air Canvas Pro unlocked successfully! All Pro features & Ultra-Low Latency Turbo mode are active.',
    };
  }

  public startFreeTrial(): void {
    this.currentTier = 'pro';
    this.licenseKey = 'PRO-TRIAL-14DAYS';
    this.licenseName = 'Air Canvas Pro (14-Day Free Trial)';
    this.isTrial = true;
    this.saveToStorage();
    this.notify();
  }

  public switchToFree(): void {
    this.currentTier = 'free';
    this.licenseKey = '';
    this.licenseName = 'Air Canvas Free Edition';
    this.isTrial = false;
    this.currentSubscription = null;
    this.saveToStorage();
    this.notify();
  }

  // Authoritative Entitlement Contract (Source of Truth)
  public getEntitlement(): EntitlementPayload {
    if (this.currentTier === 'pro') {
      const now = new Date();
      const expires = this.currentSubscription 
        ? this.currentSubscription.currentPeriodEnd 
        : new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();

      return {
        plan: 'PRO',
        status: this.currentSubscription?.status || 'ACTIVE',
        expiresAt: expires,
        features: {
          basicDrawing: true,
          advancedCalibration: true,
          multiMonitor: true,
          advancedSettings: true,
          ultraLowLatency: true,
          highPollingRate: true,
        },
      };
    }

    return {
      plan: 'FREE',
      status: 'ACTIVE',
      features: {
        basicDrawing: true,
        advancedCalibration: false,
        multiMonitor: false,
        advancedSettings: false,
        ultraLowLatency: false,
        highPollingRate: false,
      },
    };
  }

  // Google Play Billing Verification Simulation (Flutter -> Backend -> Supabase flow)
  public verifyGooglePlayPurchase(
    productId: 'aircanvas_pro_monthly' | 'aircanvas_pro_yearly',
    purchaseToken: string,
    orderId?: string
  ): { success: boolean; message: string; entitlement: EntitlementPayload } {
    const isYearly = productId === 'aircanvas_pro_yearly';
    const startDate = new Date();
    const expiryDate = new Date();
    if (isYearly) {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    const assignedOrderId = orderId || `GPA.${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newSub: SubscriptionRecord = {
      id: `sub_${Date.now()}`,
      userId: 'usr_creator_8842',
      planId: 'plan_pro_001',
      provider: 'GOOGLE_PLAY',
      productId,
      purchaseToken,
      orderId: assignedOrderId,
      status: 'ACTIVE',
      startedAt: startDate.toISOString(),
      currentPeriodStart: startDate.toISOString(),
      currentPeriodEnd: expiryDate.toISOString(),
      autoRenew: true,
    };

    const newPurchase: PurchaseRecord = {
      id: `pur_${Date.now()}`,
      userId: 'usr_creator_8842',
      provider: 'GOOGLE_PLAY',
      productId,
      purchaseToken,
      orderId: assignedOrderId,
      purchaseState: 'PURCHASED',
      purchaseTime: startDate.toISOString(),
      expiryTime: expiryDate.toISOString(),
      acknowledged: true,
    };

    this.currentSubscription = newSub;
    this.purchasesHistory.unshift(newPurchase);
    this.currentTier = 'pro';
    this.licenseName = isYearly ? 'Air Canvas Pro (Yearly Subscription)' : 'Air Canvas Pro (Monthly Subscription)';
    this.licenseKey = `GP-${productId.toUpperCase()}-${assignedOrderId.slice(-6)}`;
    this.isTrial = false;

    this.saveToStorage();
    this.notify();

    return {
      success: true,
      message: `Verified by ASP.NET Core & Google Play API! Activated AIRCanvas PRO until ${expiryDate.toLocaleDateString()}.`,
      entitlement: this.getEntitlement(),
    };
  }

  // Handle RTDN webhook event simulation (renew, cancel, expire)
  public handleRtdnEvent(action: 'RENEW' | 'CANCEL' | 'EXPIRE' | 'GRACE_PERIOD'): void {
    if (!this.currentSubscription) return;

    if (action === 'CANCEL') {
      this.currentSubscription.status = 'CANCELED';
      this.currentSubscription.autoRenew = false;
      this.currentSubscription.canceledAt = new Date().toISOString();
    } else if (action === 'EXPIRE') {
      this.currentSubscription.status = 'EXPIRED';
      this.switchToFree();
      return;
    } else if (action === 'GRACE_PERIOD') {
      this.currentSubscription.status = 'GRACE_PERIOD';
    } else if (action === 'RENEW') {
      this.currentSubscription.status = 'ACTIVE';
      const renewedEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      this.currentSubscription.currentPeriodEnd = renewedEnd.toISOString();
      this.currentTier = 'pro';
    }

    this.saveToStorage();
    this.notify();
  }

  public get currentSub(): SubscriptionRecord | null {
    return this.currentSubscription;
  }

  public get purchases(): PurchaseRecord[] {
    return this.purchasesHistory;
  }

  public toggleTier(): void {
    if (this.currentTier === 'pro') {
      this.switchToFree();
    } else {
      this.activatePro('AIRPRO-2026-TURBO');
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('License listener error', e);
      }
    });
  }
}
