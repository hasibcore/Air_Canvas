// 1-Euro Filter - Adaptive Noise & Jitter Filter for Drawing & Stylus Input
// Reference: Casiez, G., Roussel, N. and Vogel, D. (2012)
// "1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in HCI"
// Proceedings of the SIGCHI Conference on Human Factors in Computing Systems.

class LowPassFilter {
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    return this.s;
  }

  get lastValue(): number | null {
    return this.s;
  }

  reset(): void {
    this.s = null;
  }
}

export class OneEuroFilter {
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;

  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(minCutoff = 1.2, beta = 0.008, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static computeAlpha(rate: number, cutoff: number): number {
    if (rate <= 0.0 || cutoff <= 0.0) return 1.0;
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(value, 1.0);
    }

    const dtMs = timestampMs - this.lastTime;
    this.lastTime = timestampMs;

    const dt = dtMs > 0 ? dtMs / 1000.0 : 1.0 / 120.0;
    const rate = 1.0 / dt;

    const prevX = this.xFilter.lastValue ?? value;
    const rawDx = (value - prevX) * rate;

    // Filter the velocity derivative
    const dAlpha = OneEuroFilter.computeAlpha(rate, this.dCutoff);
    const filteredDx = this.dxFilter.filter(rawDx, dAlpha);

    // Adaptive cutoff: fc = minCutoff + beta * |dx|
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDx);
    const xAlpha = OneEuroFilter.computeAlpha(rate, cutoff);

    return this.xFilter.filter(value, xAlpha);
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuroFilter2D {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff = 1.2, beta = 0.008, dCutoff = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, timestampMs: number): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestampMs),
      y: this.filterY.filter(y, timestampMs),
    };
  }

  reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}
