import { PressureCurveType } from '../types/index.ts';

export function transformPressure(rawPressure: number, curve: PressureCurveType): number {
  const p = Math.max(0.0, Math.min(1.0, isNaN(rawPressure) ? 0.5 : rawPressure));
  switch (curve) {
    case 'soft':
      return Math.max(0.0, Math.min(1.0, Math.pow(p, 0.7)));
    case 'firm':
      return Math.max(0.0, Math.min(1.0, Math.pow(p, 1.4)));
    case 'sCurve':
      return Math.max(0.0, Math.min(1.0, p * p * (3.0 - 2.0 * p)));
    case 'standard':
    default:
      return p;
  }
}
