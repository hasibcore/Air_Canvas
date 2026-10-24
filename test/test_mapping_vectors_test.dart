// ==============================================================================
// test/test_mapping_vectors_test.dart
// Automated Dart verification of Appendix A test vectors:
// Aspect-fit, Normalization, Rounding, Projection, and RECT conversion
// ==============================================================================

import 'dart:convert';
import 'dart:io';

int roundDiv(int a, int b) {
  return ((2 * a + b) / (2 * b)).floor();
}

List<int> fitActiveRect(int padW, int padH, int tW, int tH) {
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

int roundHalfAwayFromZero(double v) {
  return v >= 0 ? (v + 0.5).floor() : (v - 0.5).ceil();
}

List<int> projectToRegion(double normX, double normY, List<int> region) {
  final left = region[0];
  final top = region[1];
  final width = region[2];
  final height = region[3];
  final clampedX = normX.clamp(0.0, 1.0);
  final clampedY = normY.clamp(0.0, 1.0);
  final targetX = left + roundHalfAwayFromZero(clampedX * (width - 1));
  final targetY = top + roundHalfAwayFromZero(clampedY * (height - 1));
  return [targetX, targetY];
}

List<double> normalizeToActive(double localX, double localY, List<int> active) {
  final left = active[0];
  final top = active[1];
  final w = active[2];
  final h = active[3];
  if (!localX.isFinite || !localY.isFinite || w < 2 || h < 2) {
    return [0.5, 0.5];
  }
  return [
    ((localX - left) / (w - 1)).clamp(0.0, 1.0),
    ((localY - top) / (h - 1)).clamp(0.0, 1.0)
  ];
}

void main() {
  print('================================================================');
  print('DART TEST SUITE: Appendix A Contract Vectors');
  print('================================================================');

  final file = File('contracts/protocol-vectors.json');
  final json = jsonDecode(file.readAsStringSync());

  int passed = 0;
  int total = 0;

  // 1. Aspect-Fit
  for (final v in json['aspectFit']) {
    total++;
    final pad = (v['pad'] as List).cast<int>();
    final target = (v['target'] as List).cast<int>();
    final expected = (v['expected'] as List).cast<int>();
    final res = fitActiveRect(pad[0], pad[1], target[0], target[1]);
    if (res[0] == expected[0] && res[1] == expected[1] && res[2] == expected[2] && res[3] == expected[3]) {
      passed++;
      print('  PASS: Aspect-Fit ${v['id']} -> [${res.join(', ')}]');
    } else {
      print('  FAIL: Aspect-Fit ${v['id']} -> got $res, expected $expected');
      exitCode = 1;
    }
  }

  // 2. Normalization
  final normList = (json['activeNormalization'] ?? json['normalization']) as List;
  for (int i = 0; i < normList.length; i++) {
    total++;
    final v = normList[i];
    final active = (v['active'] as List).cast<int>();
    final local = (v['local'] as List).map((e) => (e as num).toDouble()).toList();
    final expected = (v['expected'] as List).map((e) => (e as num).toDouble()).toList();
    final res = normalizeToActive(local[0], local[1], active);
    if ((res[0] - expected[0]).abs() < 0.0001 && (res[1] - expected[1]).abs() < 0.0001) {
      passed++;
      print('  PASS: Norm #${i + 1} -> (${res[0].toStringAsFixed(4)}, ${res[1].toStringAsFixed(4)})');
    } else {
      print('  FAIL: Norm #${i + 1} -> got $res, expected $expected');
      exitCode = 1;
    }
  }

  // 3. Projection
  for (int i = 0; i < (json['projection'] as List).length; i++) {
    total++;
    final v = json['projection'][i];
    final area = (v['area'] as List).cast<int>();
    final norm = (v['norm'] as List).map((e) => (e as num).toDouble()).toList();
    final expected = (v['expected'] as List).cast<int>();
    final res = projectToRegion(norm[0], norm[1], area);
    if (res[0] == expected[0] && res[1] == expected[1]) {
      passed++;
      print('  PASS: Proj #${i + 1} -> (${res[0]}, ${res[1]})');
    } else {
      print('  FAIL: Proj #${i + 1} -> got $res, expected $expected');
      exitCode = 1;
    }
  }

  // 4. RECT Conversion
  for (final v in json['rectConversion']) {
    total++;
    final ltrb = (v['ltrb'] as List).cast<int>();
    final exp = v['expected'];
    final width = ltrb[2] - ltrb[0];
    final height = ltrb[3] - ltrb[1];
    if (width == exp['width'] && height == exp['height'] && ltrb[0] == exp['left'] && ltrb[1] == exp['top']) {
      passed++;
      print('  PASS: RECT [${ltrb.join(', ')}] -> ${width}x$height');
    } else {
      print('  FAIL: RECT [${ltrb.join(', ')}]');
      exitCode = 1;
    }
  }

  print('\nSUMMARY: $passed / $total passed.');
  print('================================================================');
}
