// ==============================================================================
// lib/services/drawing_provider.dart
// Mobile Viewport Normalization & Touch Position Sampling Service
// Guarantees exact (0.0 .. 1.0) normalized coordinate boundaries
// ==============================================================================

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class DrawingProvider extends ChangeNotifier {
  double canvasWidth = 1920.0;
  double canvasHeight = 1080.0;
  bool isFullScreenTablet = true;
  double currentPressure = 0.5;
  String activeTool = 'pen'; // 'pen' | 'eraser' | 'highlighter'

  // Last sampled point telemetry
  double lastNormalizedX = 0.5;
  double lastNormalizedY = 0.5;
  String latestTelemetryLog = '';

  void setTool(String tool) {
    activeTool = tool;
    notifyListeners();
  }

  void updateCanvasSize(Size size) {
    if (size.width > 0 && size.height > 0) {
      canvasWidth = size.width;
      canvasHeight = size.height;
      notifyListeners();
    }
  }

  /// Normalizes touch offset against the exact drawing RenderBox bounds,
  /// strictly excluding system status bars, notches, or window chrome.
  Offset normalizeTouch(Offset localTouchPosition) {
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return const Offset(0.5, 0.5);
    }

    final double normX = (localTouchPosition.dx / (canvasWidth - 1)).clamp(0.0, 1.0);
    final double normY = (localTouchPosition.dy / (canvasHeight - 1)).clamp(0.0, 1.0);

    lastNormalizedX = normX;
    lastNormalizedY = normY;

    latestTelemetryLog =
        '[Touch In] Mobile(x: ${normX.toStringAsFixed(3)}, y: ${normY.toStringAsFixed(3)}) -> '
        '[Canvas Bounds] (${canvasWidth.toInt()}x${canvasHeight.toInt()})';

    notifyListeners();
    return Offset(normX, normY);
  }
}
