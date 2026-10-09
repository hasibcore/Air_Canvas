// ==============================================================================
// lib/main.dart
// Air Canvas - Wireless Graphics Tablet & Digital Drawing Studio (Mobile)
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Set immersive sticky full-screen mode to utilize the entire tablet screen
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  runApp(const AirCanvasApp());
}

class AirCanvasApp extends StatelessWidget {
  const AirCanvasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Air Canvas',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF090D16),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00E5FF),
          secondary: Color(0xFFA855F7),
          surface: Color(0xFF0F172A),
        ),
      ),
      home: const TabletScreen(),
    );
  }
}

// -----------------------------------------------------------------------------
// Stroke & Drawing Data Models
// -----------------------------------------------------------------------------
class TabletPoint {
  final double x; // Local canvas pixel X
  final double y; // Local canvas pixel Y
  final double normX; // 0.0 .. 1.0 normalized
  final double normY; // 0.0 .. 1.0 normalized
  final double pressure; // 0.0 .. 1.0 calibrated pressure
  final int timestamp;

  TabletPoint({
    required this.x,
    required this.y,
    required this.normX,
    required this.normY,
    required this.pressure,
    required this.timestamp,
  });
}

class TabletStroke {
  final List<TabletPoint> points;
  final Color color;
  final double strokeWidth;
  final String tool; // 'pen', 'pencil', 'highlighter', 'eraser'

  TabletStroke({
    required this.points,
    required this.color,
    required this.strokeWidth,
    required this.tool,
  });
}

// -----------------------------------------------------------------------------
// Main Tablet Screen
// -----------------------------------------------------------------------------
class TabletScreen extends StatefulWidget {
  const TabletScreen({super.key});

  @override
  State<TabletScreen> createState() => _TabletScreenState();
}

class _TabletScreenState extends State<TabletScreen> {
  // Connection Configuration
  String _serverIp = '192.168.1.105';
  int _serverPort = 9090;
  String _pairingPin = '1234';
  bool _useBinaryProtocol = true;

  // Connection State
  WebSocket? _socket;
  bool _isConnected = false;
  bool _isConnecting = false;
  String _connectionStatus = 'Disconnected';
  double _latencyMs = 0.0;
  int _packetsSent = 0;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  // Drawing & Digitizer State
  final List<TabletStroke> _strokes = [];
  TabletStroke? _currentStroke;
  Offset? _activePointerPos;
  double _activePressure = 0.5;
  String _activeTool = 'pen'; // 'pen', 'pencil', 'highlighter', 'eraser'
  Color _selectedColor = const Color(0xFF00E5FF);
  double _brushSize = 6.0;
  String _pressureCurve = 'linear'; // 'linear', 'soft', 'firm'
  bool _showHud = true;
  bool _dualScreenDraw = true; // Draw locally as well as streaming to PC

  // Canvas bounds
  Size _canvasSize = Size.zero;

  // Available Tools & Colors
  final List<Color> _paletteColors = [
    const Color(0xFF00E5FF), // Neon Cyan
    const Color(0xFFA855F7), // Purple
    const Color(0xFF10B981), // Emerald
    const Color(0xFFF59E0B), // Amber
    const Color(0xFFEF4444), // Crimson
    const Color(0xFFFFFFFF), // White
    const Color(0xFF334155), // Slate
  ];

  @override
  void initState() {
    super.initState();
    // Attempt auto-connect on startup
    _connectToServer();
  }

  @override
  void dispose() {
    _disconnectFromServer();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // WebSocket Connection Management
  // ---------------------------------------------------------------------------
  Future<void> _connectToServer() async {
    if (_isConnecting || _isConnected) return;

    setState(() {
      _isConnecting = true;
      _connectionStatus = 'Connecting to $_serverIp:$_serverPort...';
    });

    try {
      final uri = Uri.parse('ws://$_serverIp:$_serverPort/aircanvas?pin=$_pairingPin');
      final socket = await WebSocket.connect(uri.toString())
          .timeout(const Duration(seconds: 3));

      _socket = socket;
      setState(() {
        _isConnected = true;
        _isConnecting = false;
        _connectionStatus = 'Connected to PC ($_serverIp)';
      });

      // Listen for server incoming messages (latency pongs, screen bounds info)
      _socket?.listen(
        (data) {
          _handleServerMessage(data);
        },
        onError: (err) {
          _handleDisconnect('Connection error: $err');
        },
        onDone: () {
          _handleDisconnect('Disconnected by PC server');
        },
      );

      // Start ping loop for latency calculation
      _startPingLoop();
    } catch (e) {
      setState(() {
        _isConnecting = false;
        _isConnected = false;
        _connectionStatus = 'Failed to connect. Tap ⚙ to change IP';
      });
    }
  }

  void _disconnectFromServer() {
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _socket?.close();
    _socket = null;
    setState(() {
      _isConnected = false;
      _isConnecting = false;
      _connectionStatus = 'Disconnected';
    });
  }

  void _handleDisconnect(String reason) {
    _pingTimer?.cancel();
    _socket = null;
    if (mounted) {
      setState(() {
        _isConnected = false;
        _isConnecting = false;
        _connectionStatus = reason;
      });
    }
  }

  void _startPingLoop() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 2), (timer) {
      if (!_isConnected || _socket == null) return;
      final pingMsg = jsonEncode({
        'type': 'ping',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      try {
        _socket?.add(pingMsg);
      } catch (_) {}
    });
  }

  void _handleServerMessage(dynamic data) {
    if (data is String) {
      try {
        final map = jsonDecode(data);
        if (map['type'] == 'pong' && map['timestamp'] != null) {
          final int sentTime = map['timestamp'];
          final int now = DateTime.now().millisecondsSinceEpoch;
          setState(() {
            _latencyMs = ((now - sentTime) / 2.0).clamp(0.5, 999.0);
          });
        }
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Input Streaming (Binary & JSON)
  // ---------------------------------------------------------------------------
  void _sendPointerEvent(String eventType, double normX, double normY, double rawPressure) {
    if (!_isConnected || _socket == null) return;

    final double calibratedPressure = _applyPressureCurve(rawPressure);
    _packetsSent++;

    if (_useBinaryProtocol) {
      // High-speed 8-byte Binary Packet (matches AirCanvasServer.cs ProcessBinaryPacket):
      // Byte 0: Type (0=Down, 1=Move, 2=Up, 3=Hover)
      // Bytes 1-2: Normalized X (ushort 0..65535)
      // Bytes 3-4: Normalized Y (ushort 0..65535)
      // Bytes 5-6: Pressure (ushort 0..1024)
      // Byte 7: Tool (0=Pen, 1=Eraser, 2=Highlighter)
      int typeCode = 1;
      if (eventType == 'pointerDown') typeCode = 0;
      if (eventType == 'pointerUp') typeCode = 2;
      if (eventType == 'hover') typeCode = 3;

      final int xUshort = (normX * 65535.0).round().clamp(0, 65535);
      final int yUshort = (normY * 65535.0).round().clamp(0, 65535);
      final int pressureUshort = (calibratedPressure * 1024.0).round().clamp(0, 1024);
      final int toolByte = _activeTool == 'eraser' ? 1 : (_activeTool == 'highlighter' ? 2 : 0);

      final buffer = Uint8List(8);
      final bdata = ByteData.view(buffer.buffer);
      bdata.setUint8(0, typeCode);
      bdata.setUint16(1, xUshort, Endian.little);
      bdata.setUint16(3, yUshort, Endian.little);
      bdata.setUint16(5, pressureUshort, Endian.little);
      bdata.setUint8(7, toolByte);

      try {
        _socket?.add(buffer);
      } catch (_) {}
    } else {
      // Standard JSON Protocol
      final payload = jsonEncode({
        'type': eventType,
        'x': normX,
        'y': normY,
        'pressure': calibratedPressure,
        'tool': _activeTool,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });

      try {
        _socket?.add(payload);
      } catch (_) {}
    }
  }

  double _applyPressureCurve(double p) {
    if (_pressureCurve == 'soft') {
      return math.sqrt(p.clamp(0.01, 1.0));
    } else if (_pressureCurve == 'firm') {
      return math.pow(p.clamp(0.0, 1.0), 2.0).toDouble();
    }
    return p.clamp(0.0, 1.0);
  }

  // ---------------------------------------------------------------------------
  // Touch / Stylus Event Handlers
  // ---------------------------------------------------------------------------
  void _onPointerDown(PointerDownEvent event) {
    if (_canvasSize.width <= 0 || _canvasSize.height <= 0) return;

    final normX = (event.localPosition.dx / (_canvasSize.width - 1)).clamp(0.0, 1.0);
    final normY = (event.localPosition.dy / (_canvasSize.height - 1)).clamp(0.0, 1.0);
    final pressure = event.pressure > 0.0 ? event.pressure : 0.5;

    setState(() {
      _activePointerPos = event.localPosition;
      _activePressure = pressure;
    });

    if (_dualScreenDraw) {
      final point = TabletPoint(
        x: event.localPosition.dx,
        y: event.localPosition.dy,
        normX: normX,
        normY: normY,
        pressure: pressure,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _currentStroke = TabletStroke(
        points: [point],
        color: _activeTool == 'eraser' ? const Color(0xFF090D16) : _selectedColor,
        strokeWidth: _activeTool == 'eraser' ? _brushSize * 3 : _brushSize,
        tool: _activeTool,
      );
    }

    _sendPointerEvent('pointerDown', normX, normY, pressure);
  }

  void _onPointerMove(PointerMoveEvent event) {
    if (_canvasSize.width <= 0 || _canvasSize.height <= 0) return;

    final normX = (event.localPosition.dx / (_canvasSize.width - 1)).clamp(0.0, 1.0);
    final normY = (event.localPosition.dy / (_canvasSize.height - 1)).clamp(0.0, 1.0);
    final pressure = event.pressure > 0.0 ? event.pressure : 0.5;

    setState(() {
      _activePointerPos = event.localPosition;
      _activePressure = pressure;
    });

    if (_dualScreenDraw && _currentStroke != null) {
      final point = TabletPoint(
        x: event.localPosition.dx,
        y: event.localPosition.dy,
        normX: normX,
        normY: normY,
        pressure: pressure,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );
      _currentStroke!.points.add(point);
    }

    _sendPointerEvent('pointerMove', normX, normY, pressure);
  }

  void _onPointerUp(PointerUpEvent event) {
    if (_canvasSize.width <= 0 || _canvasSize.height <= 0) return;

    final normX = (event.localPosition.dx / (_canvasSize.width - 1)).clamp(0.0, 1.0);
    final normY = (event.localPosition.dy / (_canvasSize.height - 1)).clamp(0.0, 1.0);

    setState(() {
      _activePointerPos = null;
      if (_dualScreenDraw && _currentStroke != null) {
        _strokes.add(_currentStroke!);
        _currentStroke = null;
      }
    });

    _sendPointerEvent('pointerUp', normX, normY, 0.0);
  }

  void _onPointerCancel(PointerCancelEvent event) {
    setState(() {
      _activePointerPos = null;
      _currentStroke = null;
    });
    _sendPointerEvent('pointerUp', 0.5, 0.5, 0.0);
  }

  void _clearCanvas() {
    HapticFeedback.mediumImpact();
    setState(() {
      _strokes.clear();
      _currentStroke = null;
    });
  }

  void _undoStroke() {
    if (_strokes.isNotEmpty) {
      HapticFeedback.lightImpact();
      setState(() {
        _strokes.removeLast();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Settings & Connection Dialog
  // ---------------------------------------------------------------------------
  void _openSettingsDialog() {
    final ipController = TextEditingController(text: _serverIp);
    final portController = TextEditingController(text: _serverPort.toString());
    final pinController = TextEditingController(text: _pairingPin);

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: Color(0xFF334155), width: 1),
          ),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF00E5FF).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.wifi, color: Color(0xFF00E5FF), size: 24),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Connect to Windows PC',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  Text('AirCanvas Server Setup',
                      style: TextStyle(color: Colors.white54, fontSize: 11)),
                ],
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: SizedBox(
              width: 380,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Windows PC IP Address:',
                      style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: ipController,
                    style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      hintText: 'e.g. 192.168.1.105',
                      hintStyle: const TextStyle(color: Colors.white38),
                      prefixIcon: const Icon(Icons.computer, color: Color(0xFF00E5FF), size: 18),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF334155)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF00E5FF)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Port:',
                                style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            TextField(
                              controller: portController,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: const Color(0xFF1E293B),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(color: Color(0xFF334155)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Pairing PIN:',
                                style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            TextField(
                              controller: pinController,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: const Color(0xFF1E293B),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: const BorderSide(color: Color(0xFF334155)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Ultra-Fast Binary Protocol:',
                          style: TextStyle(color: Colors.white70, fontSize: 12)),
                      Switch(
                        value: _useBinaryProtocol,
                        activeColor: const Color(0xFF00E5FF),
                        onChanged: (val) {
                          setDialogState(() {
                            _useBinaryProtocol = val;
                          });
                          setState(() {
                            _useBinaryProtocol = val;
                          });
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Quick Test Calibration Button
                  InkWell(
                    onTap: () {
                      _sendPointerEvent('pointerDown', 0.5, 0.5, 0.75);
                      Future.delayed(const Duration(milliseconds: 100), () {
                        _sendPointerEvent('pointerUp', 0.5, 0.5, 0.0);
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Transmitted Exact Center (0.5, 0.5) to PC!'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.center_focus_strong, color: Color(0xFF00E5FF), size: 16),
                          SizedBox(width: 8),
                          Text('Send Center Checkpoint (0.5, 0.5)',
                              style: TextStyle(color: Color(0xFF00E5FF), fontSize: 11, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _serverIp = ipController.text.trim();
                  _serverPort = int.tryParse(portController.text.trim()) ?? 9090;
                  _pairingPin = pinController.text.trim();
                });
                Navigator.pop(ctx);
                _disconnectFromServer();
                _connectToServer();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00E5FF),
                foregroundColor: const Color(0xFF090D16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Connect', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Build Interface
  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF090D16),
      body: LayoutBuilder(
        builder: (context, constraints) {
          _canvasSize = Size(constraints.maxWidth, constraints.maxHeight);

          return Stack(
            children: [
              // 1. Raw High-Performance Digitizer Touch Surface & Canvas
              Positioned.fill(
                child: Listener(
                  behavior: HitTestBehavior.opaque,
                  onPointerDown: _onPointerDown,
                  onPointerMove: _onPointerMove,
                  onPointerUp: _onPointerUp,
                  onPointerCancel: _onPointerCancel,
                  child: CustomPaint(
                    size: _canvasSize,
                    painter: CanvasDrawingPainter(
                      strokes: _strokes,
                      currentStroke: _currentStroke,
                      activePointerPos: _activePointerPos,
                      activePressure: _activePressure,
                      selectedColor: _selectedColor,
                    ),
                  ),
                ),
              ),

              // 2. Center Calibration Watermark (Grid & Guidelines)
              IgnorePointer(
                child: Center(
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withOpacity(0.08), width: 1.5),
                    ),
                    child: Center(
                      child: Container(
                        width: 3,
                        height: 3,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withOpacity(0.15),
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // 3. Top Floating Control & Status Bar
              Positioned(
                top: 12,
                left: 16,
                right: 16,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Connection Status Pill
                    InkWell(
                      onTap: _openSettingsDialog,
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A).withOpacity(0.85),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _isConnected
                                ? const Color(0xFF10B981).withOpacity(0.4)
                                : const Color(0xFFEF4444).withOpacity(0.4),
                            width: 1,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.3),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _isConnected
                                    ? const Color(0xFF10B981)
                                    : (_isConnecting ? const Color(0xFFF59E0B) : const Color(0xFFEF4444)),
                                boxShadow: [
                                  if (_isConnected)
                                    BoxShadow(
                                      color: const Color(0xFF10B981).withOpacity(0.8),
                                      blurRadius: 6,
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _isConnected
                                  ? 'Connected (${_latencyMs > 0 ? "${_latencyMs.toStringAsFixed(1)}ms" : "<1ms"})'
                                  : (_isConnecting ? 'Connecting...' : 'Tap to Connect PC'),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(Icons.settings, color: Colors.white54, size: 14),
                          ],
                        ),
                      ),
                    ),

                    // Center Brand / Mode Indicator
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A).withOpacity(0.7),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.06)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.brush, color: Color(0xFF00E5FF), size: 14),
                          const SizedBox(width: 6),
                          Text(
                            _dualScreenDraw ? 'Studio Tablet Canvas' : 'Digitizer Trackpad',
                            style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),

                    // Quick Actions (Undo, Clear, HUD Toggle)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildQuickActionBtn(
                          icon: Icons.undo,
                          tooltip: 'Undo',
                          onTap: _undoStroke,
                        ),
                        const SizedBox(width: 6),
                        _buildQuickActionBtn(
                          icon: Icons.delete_outline,
                          tooltip: 'Clear Canvas',
                          onTap: _clearCanvas,
                        ),
                        const SizedBox(width: 6),
                        _buildQuickActionBtn(
                          icon: _showHud ? Icons.visibility : Icons.visibility_off,
                          tooltip: 'Toggle Diagnostics',
                          onTap: () {
                            setState(() => _showHud = !_showHud);
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // 4. Floating Drawing Tools & Palette Dock (Left Side)
              Positioned(
                left: 16,
                top: 70,
                bottom: 70,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A).withOpacity(0.9),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFF334155), width: 1),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.4),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Tool Selector
                        _buildToolBtn(icon: Icons.edit, tool: 'pen', label: 'Pen'),
                        const SizedBox(height: 6),
                        _buildToolBtn(icon: Icons.mode_edit_outline, tool: 'pencil', label: 'Pencil'),
                        const SizedBox(height: 6),
                        _buildToolBtn(icon: Icons.brush, tool: 'highlighter', label: 'Marker'),
                        const SizedBox(height: 6),
                        _buildToolBtn(icon: Icons.auto_fix_normal, tool: 'eraser', label: 'Eraser'),
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: SizedBox(
                            width: 24,
                            child: Divider(color: Color(0xFF334155), height: 1),
                          ),
                        ),

                        // Palette Colors
                        ..._paletteColors.map((color) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: InkWell(
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  setState(() {
                                    _selectedColor = color;
                                    if (_activeTool == 'eraser') _activeTool = 'pen';
                                  });
                                },
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  width: 24,
                                  height: 24,
                                  decoration: BoxDecoration(
                                    color: color,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: _selectedColor == color && _activeTool != 'eraser'
                                          ? Colors.white
                                          : Colors.transparent,
                                      width: 2.5,
                                    ),
                                    boxShadow: [
                                      if (_selectedColor == color)
                                        BoxShadow(
                                          color: color.withOpacity(0.6),
                                          blurRadius: 8,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            )),
                      ],
                    ),
                  ),
                ),
              ),

              // 5. Bottom Live Diagnostic HUD Overlay
              if (_showHud)
                Positioned(
                  bottom: 12,
                  left: 16,
                  right: 16,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Normalized coordinates & pressure readouts
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A).withOpacity(0.75),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withOpacity(0.06)),
                        ),
                        child: Text(
                          _activePointerPos != null && _canvasSize.width > 0
                              ? 'Normalized: (${(_activePointerPos!.dx / (_canvasSize.width - 1)).clamp(0.0, 1.0).toStringAsFixed(3)}, ${(_activePointerPos!.dy / (_canvasSize.height - 1)).clamp(0.0, 1.0).toStringAsFixed(3)})  •  Pressure: ${(_activePressure * 100).toInt()}%'
                              : 'Ready • Touch anywhere to draw on PC',
                          style: const TextStyle(
                            color: Color(0xFF00E5FF),
                            fontSize: 10,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),

                      // Packet count & Protocol
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A).withOpacity(0.75),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withOpacity(0.06)),
                        ),
                        child: Text(
                          'Packets: $_packetsSent  •  ${_useBinaryProtocol ? "Binary" : "JSON"}',
                          style: const TextStyle(
                            color: Colors.white54,
                            fontSize: 10,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildQuickActionBtn({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A).withOpacity(0.85),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Icon(icon, color: Colors.white70, size: 16),
        ),
      ),
    );
  }

  Widget _buildToolBtn({
    required IconData icon,
    required String tool,
    required String label,
  }) {
    final bool isSelected = _activeTool == tool;

    return Tooltip(
      message: label,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() {
            _activeTool = tool;
          });
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF00E5FF).withOpacity(0.2) : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? const Color(0xFF00E5FF) : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: Icon(
            icon,
            color: isSelected ? const Color(0xFF00E5FF) : Colors.white60,
            size: 16,
          ),
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Live Canvas Custom Painter
// -----------------------------------------------------------------------------
class CanvasDrawingPainter extends CustomPainter {
  final List<TabletStroke> strokes;
  final TabletStroke? currentStroke;
  final Offset? activePointerPos;
  final double activePressure;
  final Color selectedColor;

  CanvasDrawingPainter({
    required this.strokes,
    required this.currentStroke,
    required this.activePointerPos,
    required this.activePressure,
    required this.selectedColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Render all committed strokes
    for (final stroke in strokes) {
      _drawStroke(canvas, stroke);
    }

    // 2. Render in-progress active stroke
    if (currentStroke != null) {
      _drawStroke(canvas, currentStroke!);
    }

    // 3. Render glowing active touch cursor indicator
    if (activePointerPos != null) {
      final double radius = 8.0 + (activePressure * 16.0);

      // Outer glow
      final glowPaint = Paint()
        ..color = const Color(0xFF00E5FF).withOpacity(0.2)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(activePointerPos!, radius + 6, glowPaint);

      // Main reticle ring
      final ringPaint = Paint()
        ..color = const Color(0xFF00E5FF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawCircle(activePointerPos!, radius, ringPaint);

      // Center laser dot
      final centerPaint = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill;
      canvas.drawCircle(activePointerPos!, 2.5, centerPaint);
    }
  }

  void _drawStroke(Canvas canvas, TabletStroke stroke) {
    if (stroke.points.isEmpty) return;

    final paint = Paint()
      ..color = stroke.color
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    if (stroke.points.length == 1) {
      final p = stroke.points.first;
      final dotPaint = Paint()
        ..color = stroke.color
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(p.x, p.y), (stroke.strokeWidth / 2) * p.pressure.clamp(0.4, 1.2), dotPaint);
      return;
    }

    final path = Path();
    path.moveTo(stroke.points.first.x, stroke.points.first.y);

    for (int i = 1; i < stroke.points.length; i++) {
      final p1 = stroke.points[i - 1];
      final p2 = stroke.points[i];

      paint.strokeWidth = stroke.strokeWidth * p2.pressure.clamp(0.4, 1.5);
      canvas.drawLine(Offset(p1.x, p1.y), Offset(p2.x, p2.y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CanvasDrawingPainter oldDelegate) => true;
}
