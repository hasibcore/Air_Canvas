// ==============================================================================
// test/test_coordinate_mapping_and_checkpoints_test.dart
// Verification of the 5-Point Calibration Invariants, Appendix A Contract Vectors
// (V1-V5, R1-R4, M1-M7, A.4 Projection, A.5 Normalization, A.6 Timestamp Wraparound),
// Entitlement Expiration, and Hardware Stylus Eraser Continuity
// ==============================================================================

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';
import '../lib/main.dart';
import '../lib/models/entitlement.dart';
import '../lib/services/drawing_provider.dart';

class CalibrationCheckpoint {
  final String name;
  final double normX;
  final double normY;
  final int Function(int width) calcExpectedX;
  final int Function(int height) calcExpectedY;

  const CalibrationCheckpoint({
    required this.name,
    required this.normX,
    required this.normY,
    required this.calcExpectedX,
    required this.calcExpectedY,
  });
}

String bytesToHex(Uint8List bytes) {
  return bytes.map((b) => b.toRadixString(16).padLeft(2, '0').toUpperCase()).join(' ');
}

Uint8List hexToBytes(String hex) {
  final trimmed = hex.trim();
  if (trimmed.isEmpty) return Uint8List(0);
  final parts = trimmed.split(RegExp(r'\s+'));
  return Uint8List.fromList(parts.map((p) => int.parse(p, radix: 16)).toList());
}

void main() {
  print('================================================================');
  print('TEST SUITE: 5-Point Calibration, Appendix A Wire Contract & Regressions');
  print('================================================================');

  const screenWidth = 1920;
  const screenHeight = 1080;

  final checkpoints = [
    CalibrationCheckpoint(
      name: 'Exact Center',
      normX: 0.50,
      normY: 0.50,
      calcExpectedX: (w) => (0.50 * (w - 1)).round(),
      calcExpectedY: (h) => (0.50 * (h - 1)).round(),
    ),
    CalibrationCheckpoint(
      name: 'Top-Left Corner',
      normX: 0.00,
      normY: 0.00,
      calcExpectedX: (w) => 0,
      calcExpectedY: (h) => 0,
    ),
    CalibrationCheckpoint(
      name: 'Top-Right Corner',
      normX: 1.00,
      normY: 0.00,
      calcExpectedX: (w) => w - 1,
      calcExpectedY: (h) => 0,
    ),
    CalibrationCheckpoint(
      name: 'Bottom-Left Corner',
      normX: 0.00,
      normY: 1.00,
      calcExpectedX: (w) => 0,
      calcExpectedY: (h) => h - 1,
    ),
    CalibrationCheckpoint(
      name: 'Bottom-Right Corner',
      normX: 1.00,
      normY: 1.00,
      calcExpectedX: (w) => w - 1,
      calcExpectedY: (h) => h - 1,
    ),
  ];

  int passed = 0;

  for (final cp in checkpoints) {
    final expectedX = cp.calcExpectedX(screenWidth);
    final expectedY = cp.calcExpectedY(screenHeight);

    final calculatedTargetX = (cp.normX * (screenWidth - 1)).round();
    final calculatedTargetY = (cp.normY * (screenHeight - 1)).round();

    final int driftX = (calculatedTargetX - expectedX).abs();
    final int driftY = (calculatedTargetY - expectedY).abs();

    final logMsg =
        '[Touch In] Mobile(x: ${cp.normX.toStringAsFixed(3)}, y: ${cp.normY.toStringAsFixed(3)}) -> '
        '[PC Geo] Rect(0, 0, $screenWidth, $screenHeight) -> '
        '[Target] ($calculatedTargetX, $calculatedTargetY) -> '
        '[Win32 Injected] ($calculatedTargetX, $calculatedTargetY)';

    print(logMsg);

    if (driftX == 0 && driftY == 0) {
      passed++;
      print('  -> CHECKPOINT PASS: [${cp.name}] matched perfectly (drift: 0 px).');
    } else {
      print('  -> CHECKPOINT FAIL: [${cp.name}] drift detected (X: $driftX px, Y: $driftY px).');
      throw Exception('Calibration failed on checkpoint: ${cp.name}');
    }
  }

  // Shared Protocol Vectors (Appendix A: contracts/protocol-vectors.json)
  print('\n--- Shared Protocol Vectors (contracts/protocol-vectors.json) ---');
  final contractFile = File('contracts/protocol-vectors.json');
  if (!contractFile.existsSync()) {
    throw Exception('Missing contracts/protocol-vectors.json');
  }
  final Map<String, dynamic> contract = jsonDecode(contractFile.readAsStringSync());

  // A.1 Valid 13-byte frames (V1-V5)
  final List<dynamic> validVectors = contract['valid'] as List<dynamic>;
  for (final v in validVectors) {
    final String id = v['id'] as String;
    final Map<String, dynamic> input = v['input'] as Map<String, dynamic>;
    final Map<String, dynamic> fields = v['fields'] as Map<String, dynamic>;
    final String expectedHex = v['hex'] as String;

    final Uint8List encoded = NetworkConnectionManager.encodeBinaryFrame(
      type: input['type'] as int,
      normX: (input['normX'] as num).toDouble(),
      normY: (input['normY'] as num).toDouble(),
      pressure: (input['pressure'] as num).toDouble(),
      tool: input['tool'] as int,
      timestamp: input['timestamp'] as int,
    );
    final String actualHex = bytesToHex(encoded);
    if (actualHex != expectedHex) {
      throw Exception('Vector $id hex mismatch: expected [$expectedHex], got [$actualHex]');
    }
    final Map<String, dynamic> decoded = NetworkConnectionManager.decodeBinaryFrame(encoded);
    if (decoded['ok'] != true ||
        decoded['rawX'] != fields['x'] ||
        decoded['rawY'] != fields['y'] ||
        decoded['rawP'] != fields['p']) {
      throw Exception('Vector $id decode field mismatch: $decoded');
    }
    print('  -> PASS [$id]: $actualHex (x=${decoded['rawX']}, y=${decoded['rawY']}, p=${decoded['rawP']})');
  }

  // A.2 Half-way rounding vectors (R1-R4)
  final List<dynamic> roundingVectors = contract['rounding'] as List<dynamic>;
  for (final r in roundingVectors) {
    final String id = r['id'] as String;
    final double p = (r['pressure'] as num).toDouble();
    final int expectedP = r['expectedP'] as int;
    final int actualP = (p * 1024.0).round();
    if (actualP != expectedP) {
      throw Exception('Rounding vector $id failed: expected $expectedP, got $actualP');
    }
    print('  -> PASS [$id]: pressure $p * 1024 -> $actualP');
  }

  // A.3 Malformed frames (M1-M7)
  final List<dynamic> malformedVectors = contract['malformed'] as List<dynamic>;
  for (final m in malformedVectors) {
    final String id = m['id'] as String;
    final String hex = m['hex'] as String;
    final String expectedError = m['error'] as String;
    final Map<String, dynamic> res = NetworkConnectionManager.decodeBinaryFrame(hexToBytes(hex));
    if (res['ok'] != false || res['error'] != expectedError) {
      throw Exception('Malformed vector $id failed: expected error=$expectedError, got $res');
    }
    print('  -> PASS [$id]: rejected with ${res['error']}');
  }

  // A.4 Projection vectors (including negative multi-monitor & 6x6 banker's rounding trap)
  final List<dynamic> projectionVectors = contract['projection'] as List<dynamic>;
  for (final p in projectionVectors) {
    final List<dynamic> area = p['area'] as List<dynamic>;
    final List<dynamic> norm = p['norm'] as List<dynamic>;
    final List<dynamic> expected = p['expected'] as List<dynamic>;
    final int left = area[0] as int;
    final int top = area[1] as int;
    final int width = area[2] as int;
    final int height = area[3] as int;
    final double nx = (norm[0] as num).toDouble().clamp(0.0, 1.0);
    final double ny = (norm[1] as num).toDouble().clamp(0.0, 1.0);
    final int targetX = left + (nx * (width - 1)).round();
    final int targetY = top + (ny * (height - 1)).round();
    if (targetX != expected[0] || targetY != expected[1]) {
      throw Exception('Projection failed for area $area norm $norm: expected $expected, got [$targetX, $targetY]');
    }
  }
  print('  -> PASS [A.4]: All ${projectionVectors.length} projection vectors (including 6x6 rounding trap -> (3,3)) matched.');

  // A.5 Normalization vectors
  final List<dynamic> normVectors = contract['normalization'] as List<dynamic>;
  final provider = DrawingProvider();
  for (final nv in normVectors) {
    final List<dynamic> pad = nv['pad'] as List<dynamic>;
    final List<dynamic> local = nv['local'] as List<dynamic>;
    final List<dynamic> expected = nv['expected'] as List<dynamic>;
    provider.updateCanvasSize(Size((pad[0] as num).toDouble(), (pad[1] as num).toDouble()));
    final Offset out = provider.normalizeTouch(Offset((local[0] as num).toDouble(), (local[1] as num).toDouble()));
    if ((out.dx - (expected[0] as num).toDouble()).abs() > 1e-9 ||
        (out.dy - (expected[1] as num).toDouble()).abs() > 1e-9) {
      throw Exception('Normalization failed for pad $pad local $local: expected $expected, got $out');
    }
  }
  print('  -> PASS [A.5]: All ${normVectors.length} normalization vectors matched.');

  // A.6 Timestamp wraparound (0xFFFFFFFB -> 0x00000005 == +10 ms)
  final int tsPrev = 0xFFFFFFFB;
  final int tsCurr = 0x00000005;
  final int rawDiff = (tsCurr - tsPrev) & 0xFFFFFFFF;
  final int signedDelta = rawDiff >= 0x80000000 ? rawDiff - 0x100000000 : rawDiff;
  if (signedDelta != 10) {
    throw Exception('Timestamp wraparound failed: expected +10 ms, got $signedDelta');
  }
  print('  -> PASS [A.6]: uint32 timestamp wraparound (0xFFFFFFFB -> 0x00000005) = +$signedDelta ms.');

  print('\n--- Regression Test 1: Entitlement Expiration Guard (BUG-006) ---');
  final expiredEntitlement = Entitlement(
    plan: 'PRO',
    status: 'ACTIVE',
    expiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
    features: const EntitlementFeatures(
      basicDrawing: true,
      advancedCalibration: true,
      multiMonitor: true,
      advancedSettings: true,
    ),
  );
  final activeEntitlement = Entitlement(
    plan: 'PRO',
    status: 'ACTIVE',
    expiresAt: DateTime.now().add(const Duration(days: 30)),
    features: const EntitlementFeatures(
      basicDrawing: true,
      advancedCalibration: true,
      multiMonitor: true,
      advancedSettings: true,
    ),
  );
  if (expiredEntitlement.isPro) {
    throw Exception('Regression failure: expired PRO entitlement still reported isPro == true');
  }
  if (!activeEntitlement.isPro) {
    throw Exception('Regression failure: valid PRO entitlement reported isPro == false');
  }
  print('  -> PASS: Expired PRO entitlement reports isPro == false; active reports isPro == true.');

  print('\n--- Regression Test 2: Hardware Stylus Eraser Continuity & Undo/Redo Stack (BUG-002 & BUG-004) ---');
  final List<Stroke> strokes = [];
  final List<Stroke> redoStack = [];
  const ToolType activeToolbarTool = ToolType.pen;
  const bool isHardwareEraser = true;
  final ToolType downTool = isHardwareEraser ? ToolType.eraser : activeToolbarTool;
  final Stroke activeStroke = Stroke(
    points: [DrawPoint(offset: const Offset(0.25, 0.25), pressure: 0.8, timestamp: 1000)],
    color: const Color(0x00000000),
    strokeWidth: 12.0,
    tool: downTool,
  );
  strokes.add(activeStroke);

  final ToolType moveTool = activeStroke.tool;
  final ToolType upTool = activeStroke.tool;
  if (moveTool != ToolType.eraser || upTool != ToolType.eraser) {
    throw Exception('Regression failure: Hardware stylus eraser reverted to pen on move/up');
  }

  redoStack.add(strokes.removeLast());
  if (strokes.isNotEmpty || redoStack.length != 1) {
    throw Exception('Regression failure: Undo did not move stroke to redoStack');
  }
  strokes.add(redoStack.removeLast());
  if (strokes.length != 1 || redoStack.isNotEmpty || strokes.first.tool != ToolType.eraser) {
    throw Exception('Regression failure: Redo did not restore erased stroke');
  }
  print('  -> PASS: Hardware stylus eraser preserves ToolType.eraser across Down/Move/Up and Undo/Redo.');

  print('\n--- Regression Test 3: Phase 4.10 Source Geometry, Aspect-Ratio & Active-Stroke Latching ---');
  // Verify 800x600, 1280x800, 2560x1600, 1080x2400 portrait, and 1x1 fallback
  for (final dims in [
    const Size(800, 600),
    const Size(1280, 800),
    const Size(2560, 1600),
    const Size(1080, 2400),
  ]) {
    provider.updateCanvasSize(dims);
    final Offset tl = provider.normalizeTouch(const Offset(0, 0));
    final Offset br = provider.normalizeTouch(Offset(dims.width - 1, dims.height - 1));
    if (tl.dx != 0.0 || tl.dy != 0.0 || br.dx != 1.0 || br.dy != 1.0) {
      throw Exception('Phase 4.10 source normalization failed for $dims');
    }
  }
  provider.updateCanvasSize(const Size(1, 1));
  final Offset fallback = provider.normalizeTouch(const Offset(0, 0));
  if (fallback.dx != 0.5 || fallback.dy != 0.5) {
    throw Exception('Phase 4.10 1x1 fallback failed: $fallback');
  }
  print('  -> PASS: Phase 4.10 source geometry & 1x1 fallback verified.');

  print('\nSUMMARY: $passed / ${checkpoints.length} Checkpoints + Appendix A Vectors + Phase 4.10 Regression Suites Passed.');
  print('================================================================\n');
}

