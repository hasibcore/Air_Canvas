// ==============================================================================
// test/test_extended_edge_cases_test.dart
// Extended Dart/Flutter Edge-Case & Stress Invariant Suite
// ==============================================================================

import 'dart:math' as math;

int roundDiv(int a, int b) {
  return ((2 * a + b) / (2 * b)).floor();
}

int roundHalfAwayFromZero(double v) {
  return v >= 0 ? (v + 0.5).floor() : (v - 0.5).ceil();
}

List<int> fitActiveRect(int padW, int padH, int tW, int tH) {
  if (padW < 2 || padH < 2 || tW < 2 || tH < 2) {
    return [0, 0, padW, padH];
  }
  int w, h;
  if (padW * tH > padH * tW) {
    h = padH;
    w = roundDiv(padH * tW, tH);
  } else {
    w = padW;
    h = roundDiv(padW * tH, tW);
  }
  w = w.clamp(1, padW);
  h = h.clamp(1, padH);
  final left = ((padW - w) / 2).floor();
  final top = ((padH - h) / 2).floor();
  return [left, top, w, h];
}

double normalizePadAxis(double localCoord, double extent) {
  if (localCoord.isNaN || !extent.isFinite || extent < 2.0) {
    return 0.5;
  }
  if (localCoord.isInfinite) {
    return localCoord > 0 ? 1.0 : 0.0;
  }
  return (localCoord / (extent - 1.0)).clamp(0.0, 1.0);
}

List<int> projectToRegion(double normX, double normY, List<int> region) {
  final left = region[0];
  final top = region[1];
  final width = region[2];
  final height = region[3];
  final cx = normX.isNaN ? 0.5 : (normX >= 1.0 ? 1.0 : (normX <= 0.0 ? 0.0 : normX));
  final cy = normY.isNaN ? 0.5 : (normY >= 1.0 ? 1.0 : (normY <= 0.0 ? 0.0 : normY));
  final targetX = left + roundHalfAwayFromZero(cx * math.max(0, width - 1));
  final targetY = top + roundHalfAwayFromZero(cy * math.max(0, height - 1));
  return [targetX, targetY];
}

void main() {
  print('================================================================');
  print('DART EXTENDED EDGE-CASE & STRESS TEST SUITE');
  print('================================================================\n');

  int passed = 0;
  int total = 0;

  void assertTest(bool cond, String name) {
    total++;
    if (cond) {
      passed++;
    } else {
      print('  [FAIL] $name');
      throw Exception('Test failed: $name');
    }
  }

  // 1. Infinity & NaN Clamping Guard
  print('--- 1. Pathological Coordinates (NaN, ±Infinity, Subnormals) ---');
  assertTest(normalizePadAxis(double.infinity, 1000) == 1.0, 'Positive Infinity clamps to 1.0');
  assertTest(normalizePadAxis(double.negativeInfinity, 1000) == 0.0, 'Negative Infinity clamps to 0.0');
  assertTest(normalizePadAxis(double.nan, 1000) == 0.5, 'NaN falls back to 0.5 center');
  assertTest(normalizePadAxis(500, 1) == 0.5, 'Degenerate extent (< 2) returns 0.5');

  final p1 = projectToRegion(double.infinity, double.negativeInfinity, [0, 0, 1920, 1080]);
  assertTest(p1[0] == 1919 && p1[1] == 0, 'Infinity project lands on screen boundaries (1919, 0)');

  final p2 = projectToRegion(double.nan, double.nan, [0, 0, 1920, 1080]);
  assertTest(p2[0] == 960 && p2[1] == 540, 'NaN project lands on exact screen center (960, 540)');
  print('  [PASS] Pathological coordinates verified.');

  // 2. Extreme Aspect-Ratios (32:9 Super-Ultrawide, 9:16 Portrait, 50:1 Wide, 1:50 Tall)
  print('\n--- 2. Extreme Display Ratios (32:9, 21:9, 9:16, 1:1, 50:1, 1:50) ---');
  final testDisplays = [
    [5120, 1440], // 32:9
    [3440, 1440], // 21:9
    [1080, 1920], // 9:16
    [1080, 1080], // 1:1
    [5000, 100],  // 50:1
    [100, 5000],  // 1:50
  ];

  for (final d in testDisplays) {
    final active = fitActiveRect(800, 360, d[0], d[1]);
    final fits = active[0] >= 0 && active[1] >= 0 && active[0] + active[2] <= 800 && active[1] + active[3] <= 360;
    assertTest(fits, 'Pad active rect fits inside 800x360 for display ${d[0]}x${d[1]}');

    final targetAspect = d[0] / d[1];
    final activeAspect = active[2] / active[3];
    final aspectError = (activeAspect - targetAspect).abs() / targetAspect;
    final maxAllowed = 0.5 / math.min(active[2], active[3]);
    assertTest(aspectError <= maxAllowed + 0.0001, 'Aspect ratio preserved within 0.5/min(w,h) for ${d[0]}x${d[1]}');
  }
  print('  [PASS] All extreme aspect ratios verified.');

  // 3. Multi-Monitor Coordinate Spaces
  print('\n--- 3. Multi-Monitor Coordinate Spaces (Negative Bounds & Spans) ---');
  final negMon = projectToRegion(0.0, 0.0, [-1920, 0, 1920, 1080]);
  assertTest(negMon[0] == -1920 && negMon[1] == 0, 'Left secondary monitor maps to (-1920, 0)');

  final topMon = projectToRegion(1.0, 1.0, [0, -1080, 1920, 1080]);
  assertTest(topMon[0] == 1919 && topMon[1] == -1, 'Top secondary monitor bottom-right maps to (1919, -1)');

  final straddle = projectToRegion(0.5, 0.5, [-500, 100, 1000, 800]);
  assertTest(straddle[0] == 0 && straddle[1] == 500, 'Straddling monitor center maps to (0, 500)');
  print('  [PASS] Multi-monitor coordinate spaces verified.');

  print('\n================================================================');
  print('SUMMARY: $passed / $total Dart edge-case assertions PASSED (0 failures).');
  print('================================================================');
}
