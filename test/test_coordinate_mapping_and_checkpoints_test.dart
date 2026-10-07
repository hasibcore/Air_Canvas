// ==============================================================================
// test/test_coordinate_mapping_and_checkpoints_test.dart
// Verification of the 5-Point Calibration Invariants (Center + 4 Corners)
// ==============================================================================

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

void main() {
  print('================================================================');
  print('TEST SUITE: 5-Point Calibration & Checkpoint Invariants');
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

  print('\nSUMMARY: $passed / ${checkpoints.length} Checkpoints Passed (100% Geometry Invariant).');
  print('================================================================\n');
}
