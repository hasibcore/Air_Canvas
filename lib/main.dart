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
  String _connectionMode = 'wifi'; // 'wifi', 'usb', 'cloud'
  String _serverIp = '192.168.1.105';
  int _serverPort = 9090;
  String _pairingPin = '1234';
  String _cloudRelayHost = 'ais-dev-wagmzzgimsj3rkh5tc4yb3-89008514509.asia-southeast1.run.app';
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

  // Auto-discovery state
  bool _isDiscovering = false;

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
  // WebSocket Connection Management (USB, Wi-Fi, Cloud Relay)
  // ---------------------------------------------------------------------------
  void _parseAndApplyQrString(String raw) {
    final input = raw.trim();
    if (input.isEmpty) return;

    // 1. Try JSON format: {"app":"AirCanvas","ip":"...","port":9090,"pin":"1234"}
    if (input.startsWith('{') && input.endsWith('}')) {
      try {
        final map = jsonDecode(input);
        if (map['ip'] != null) {
          setState(() {
            _serverIp = map['ip'].toString();
            _serverPort = int.tryParse(map['port']?.toString() ?? '9090') ?? 9090;
            _pairingPin = map['pin']?.toString() ?? '1234';
            _connectionMode = 'wifi';
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Scanned Config: $_serverIp:$_serverPort (PIN: $_pairingPin)'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
          _disconnectFromServer();
          _connectToServer();
          return;
        }
      } catch (_) {}
    }

    // 2. Try URL / Deep Link: https://.../?connect=true&ip=...&port=9090&pin=1234
    if (input.startsWith('http://') ||
        input.startsWith('https://') ||
        input.startsWith('aircanvas://') ||
        input.startsWith('ws://') ||
        input.startsWith('wss://')) {
      try {
        final uri = Uri.parse(input);
        final ipParam = uri.queryParameters['ip'];
        final portParam = uri.queryParameters['port'];
        final pinParam = uri.queryParameters['pin'];

        if (ipParam != null && ipParam.isNotEmpty) {
          final isWebRelay = ipParam.contains('.run.app') || ipParam == 'relay' || ipParam == uri.host;
          setState(() {
            _serverIp = ipParam;
            _serverPort = int.tryParse(portParam ?? '9090') ?? 9090;
            _pairingPin = pinParam ?? '1234';
            if (isWebRelay) {
              _cloudRelayHost = uri.host.isNotEmpty ? uri.host : ipParam;
              _connectionMode = 'cloud';
            } else {
              _connectionMode = 'wifi';
            }
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Connected via QR Link (${_connectionMode.toUpperCase()})'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
          _disconnectFromServer();
          _connectToServer();
          return;
        } else if (uri.host.isNotEmpty) {
          setState(() {
            _cloudRelayHost = uri.host;
            _pairingPin = pinParam ?? '1234';
            _connectionMode = 'cloud';
          });
          _disconnectFromServer();
          _connectToServer();
          return;
        }
      } catch (_) {}
    }

    // 3. Plain IP:PORT:PIN or IP:PORT or plain IP
    final parts = input.split(':');
    if (parts.isNotEmpty) {
      final ip = parts[0].trim();
      if (ip.isNotEmpty) {
        final port = parts.length > 1 ? (int.tryParse(parts[1].trim()) ?? 9090) : 9090;
        final pin = parts.length > 2 ? parts[2].trim() : '1234';
        setState(() {
          _serverIp = ip;
          _serverPort = port;
          _pairingPin = pin;
          _connectionMode = 'wifi';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Connecting to $ip:$port...'),
            backgroundColor: const Color(0xFF00E5FF),
          ),
        );
        _disconnectFromServer();
        _connectToServer();
      }
    }
  }

  Future<void> _connectToServer() async {
    if (_isConnecting || _isConnected) return;

    // Sanitize Server IP
    String cleanIp = _serverIp.trim();
    if (cleanIp.startsWith('http://')) cleanIp = cleanIp.substring(7);
    if (cleanIp.startsWith('https://')) cleanIp = cleanIp.substring(8);
    if (cleanIp.startsWith('ws://')) cleanIp = cleanIp.substring(5);
    if (cleanIp.startsWith('wss://')) cleanIp = cleanIp.substring(6);
    if (cleanIp.contains(':')) {
      final split = cleanIp.split(':');
      cleanIp = split[0];
      if (split.length > 1) {
        _serverPort = int.tryParse(split[1]) ?? _serverPort;
      }
    }
    _serverIp = cleanIp.isNotEmpty ? cleanIp : '192.168.1.105';

    // Sanitize Cloud Relay Host
    String host = _cloudRelayHost.trim();
    if (host.startsWith('https://')) host = host.substring(8);
    if (host.startsWith('http://')) host = host.substring(7);
    if (host.startsWith('wss://')) host = host.substring(6);
    if (host.startsWith('ws://')) host = host.substring(5);
    if (host.endsWith('/')) host = host.substring(0, host.length - 1);
    _cloudRelayHost = host.isNotEmpty ? host : 'ais-dev-wagmzzgimsj3rkh5tc4yb3-89008514509.asia-southeast1.run.app';

    setState(() {
      _isConnecting = true;
      if (_connectionMode == 'usb') {
        _connectionStatus = 'Connecting via USB (127.0.0.1:$_serverPort)...';
      } else if (_connectionMode == 'cloud') {
        _connectionStatus = 'Connecting to Cloud Relay (PIN: $_pairingPin)...';
      } else {
        _connectionStatus = 'Connecting to Wi-Fi ($_serverIp:$_serverPort)...';
      }
    });

    try {
      Uri uri;
      if (_connectionMode == 'usb') {
        // USB Cable via adb reverse tcp:9090 tcp:9090
        uri = Uri.parse('ws://127.0.0.1:$_serverPort/aircanvas?pin=$_pairingPin');
      } else if (_connectionMode == 'cloud') {
        // Cloud Web Relay
        final scheme = (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.')) ? 'ws' : 'wss';
        uri = Uri.parse('$scheme://$host/ws?pin=$_pairingPin&role=client');
      } else {
        // Direct local Wi-Fi / LAN IP
        uri = Uri.parse('ws://$_serverIp:$_serverPort/aircanvas?pin=$_pairingPin');
      }

      final socket = await WebSocket.connect(uri.toString())
          .timeout(const Duration(seconds: 4));

      _socket = socket;
      setState(() {
        _isConnected = true;
        _isConnecting = false;
        if (_connectionMode == 'usb') {
          _connectionStatus = 'Connected via USB (0ms Latency)';
        } else if (_connectionMode == 'cloud') {
          _connectionStatus = 'Connected via Cloud (PIN: $_pairingPin)';
        } else {
          _connectionStatus = 'Connected to PC ($_serverIp:$_serverPort)';
        }
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
      // If USB failed on 127.0.0.1, attempt 10.0.2.2 fallback (for Android emulator testing)
      if (_connectionMode == 'usb') {
        try {
          final altUri = Uri.parse('ws://10.0.2.2:$_serverPort/aircanvas?pin=$_pairingPin');
          final altSocket = await WebSocket.connect(altUri.toString())
              .timeout(const Duration(seconds: 2));
          _socket = altSocket;
          setState(() {
            _isConnected = true;
            _isConnecting = false;
            _connectionStatus = 'Connected via USB (Host)';
          });
          _socket?.listen((d) => _handleServerMessage(d), onError: (err) => _handleDisconnect('$err'), onDone: () => _handleDisconnect('Disconnected'));
          _startPingLoop();
          return;
        } catch (_) {}
      }

      setState(() {
        _isConnecting = false;
        _isConnected = false;
        if (_connectionMode == 'usb') {
          _connectionStatus = 'USB failed. Run: adb reverse tcp:9090 tcp:9090';
        } else if (_connectionMode == 'cloud') {
          _connectionStatus = 'Cloud Relay failed. Check Internet or PIN: $_pairingPin';
        } else {
          _connectionStatus = 'Wi-Fi failed. Check IP & Windows Firewall.';
        }
      });
    }
  }

  Future<void> _autoDiscoverPc() async {
    if (_isDiscovering) return;
    setState(() {
      _isDiscovering = true;
      _connectionStatus = 'Searching local Wi-Fi for PC...';
    });

    try {
      final RawDatagramSocket udp = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      udp.broadcastEnabled = true;
      final query = utf8.encode('AIR_CANVAS_DISCOVERY');
      udp.send(query, InternetAddress('255.255.255.255'), 9091);

      final completer = Completer<String?>();
      Timer(const Duration(seconds: 3), () {
        if (!completer.isCompleted) {
          try { udp.close(); } catch (_) {}
          completer.complete(null);
        }
      });

      udp.listen((event) {
        if (event == RawSocketEvent.read) {
          final dg = udp.receive();
          if (dg != null) {
            final reply = utf8.decode(dg.data);
            try {
              final map = jsonDecode(reply);
              if (map['ip'] != null) {
                final foundIp = map['ip'].toString();
                if (!completer.isCompleted) {
                  try { udp.close(); } catch (_) {}
                  completer.complete(foundIp);
                }
              }
            } catch (_) {}
          }
        }
      });

      final discoveredIp = await completer.future;
      setState(() {
        _isDiscovering = false;
      });

      if (discoveredIp != null && discoveredIp.isNotEmpty) {
        setState(() {
          _serverIp = discoveredIp;
          _connectionMode = 'wifi';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Found PC at $discoveredIp! Connecting...'),
            backgroundColor: const Color(0xFF10B981),
            duration: const Duration(seconds: 2),
          ),
        );
        _disconnectFromServer();
        _connectToServer();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not auto-detect PC. Enter IP manually or try USB cable mode.'),
            backgroundColor: Color(0xFFEF4444),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _isDiscovering = false;
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
  // Settings & Connection Dialog (Wi-Fi, USB Cable, Cloud Relay)
  // ---------------------------------------------------------------------------
  void _openSettingsDialog() {
    final ipController = TextEditingController(text: _serverIp);
    final portController = TextEditingController(text: _serverPort.toString());
    final pinController = TextEditingController(text: _pairingPin);
    String dialogMode = _connectionMode;

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
                child: Icon(
                  dialogMode == 'usb' ? Icons.usb : (dialogMode == 'cloud' ? Icons.cloud_queue : Icons.wifi),
                  color: const Color(0xFF00E5FF),
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Connect to Windows PC',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  Text(
                    dialogMode == 'usb' ? 'USB High-Speed Cable Mode' : (dialogMode == 'cloud' ? 'Web QR / Cloud Relay' : 'Local Wi-Fi Network Mode'),
                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: SizedBox(
              width: 440,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Mode Selection Segmented Buttons
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () => setDialogState(() => dialogMode = 'wifi'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: dialogMode == 'wifi' ? const Color(0xFF00E5FF) : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: Text(
                                  '📶 Wi-Fi LAN',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: dialogMode == 'wifi' ? const Color(0xFF090D16) : Colors.white70,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: InkWell(
                            onTap: () => setDialogState(() => dialogMode = 'usb'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: dialogMode == 'usb' ? const Color(0xFF00E5FF) : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: Text(
                                  '🔌 USB Cable',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: dialogMode == 'usb' ? const Color(0xFF090D16) : Colors.white70,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: InkWell(
                            onTap: () => setDialogState(() => dialogMode = 'cloud'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: dialogMode == 'cloud' ? const Color(0xFF00E5FF) : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: Text(
                                  '☁️ Cloud / QR',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: dialogMode == 'cloud' ? const Color(0xFF090D16) : Colors.white70,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Content based on selected mode
                  if (dialogMode == 'usb') ...[
                    // USB Mode Instructions
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF00E5FF).withOpacity(0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.bolt, color: Color(0xFF00E5FF), size: 16),
                              SizedBox(width: 6),
                              Text('Zero-Lag USB ADB Setup:', style: TextStyle(color: Color(0xFF00E5FF), fontSize: 12, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          const Text('1. Connect phone to PC via USB cable (Enable USB Debugging).', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          const SizedBox(height: 4),
                          const Text('2. In PC Command Prompt (CMD), run:', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.black45,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('adb reverse tcp:9090 tcp:9090', style: TextStyle(color: Color(0xFF00E5FF), fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.bold)),
                                InkWell(
                                  onTap: () {
                                    Clipboard.setData(const ClipboardData(text: 'adb reverse tcp:9090 tcp:9090'));
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Copied: adb reverse tcp:9090 tcp:9090'), duration: Duration(seconds: 2)),
                                    );
                                  },
                                  child: const Icon(Icons.copy, color: Color(0xFF00E5FF), size: 16),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text('3. Then tap "Connect USB" below!', style: TextStyle(color: Colors.white70, fontSize: 11)),
                        ],
                      ),
                    ),
                  ] else if (dialogMode == 'cloud') ...[
                    // Cloud Relay Mode
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFA855F7).withOpacity(0.4)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.cloud_done, color: Color(0xFFA855F7), size: 16),
                              SizedBox(width: 6),
                              Text('No Local Wi-Fi Needed (QR / Cloud):', style: TextStyle(color: Color(0xFFA855F7), fontSize: 12, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text('Enter the 4-digit PIN displayed on your PC screen (or paste QR Code / URL) to pair across any network!', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          const SizedBox(height: 10),
                          const Text('Pairing PIN:', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          TextField(
                            controller: pinController,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(color: Colors.white, fontSize: 18, fontFamily: 'monospace', fontWeight: FontWeight.bold, letterSpacing: 4),
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: const Color(0xFF0F172A),
                              prefixIcon: const Icon(Icons.key, color: Color(0xFFA855F7), size: 18),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFA855F7))),
                            ),
                          ),
                          const SizedBox(height: 10),
                          InkWell(
                            onTap: () async {
                              final clipData = await Clipboard.getData('text/plain');
                              if (clipData != null && clipData.text != null && clipData.text!.isNotEmpty) {
                                Navigator.pop(ctx);
                                _parseAndApplyQrString(clipData.text!);
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Clipboard is empty! Copy QR Link first.')),
                                );
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFA855F7).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFFA855F7).withOpacity(0.4)),
                              ),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.qr_code_scanner, color: Color(0xFFA855F7), size: 16),
                                  SizedBox(width: 8),
                                  Text('📋 Paste Scanned QR Link / IP', style: TextStyle(color: Color(0xFFA855F7), fontWeight: FontWeight.bold, fontSize: 12)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ] else ...[
                    // Wi-Fi LAN Mode
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Windows PC IP Address:', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                        InkWell(
                          onTap: () async {
                            Navigator.pop(ctx);
                            await _autoDiscoverPc();
                          },
                          child: const Text('🔍 Auto-Detect PC', style: TextStyle(color: Color(0xFF00E5FF), fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
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
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF00E5FF))),
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Quick Subnet helper chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          const Text('Presets: ', style: TextStyle(color: Colors.white38, fontSize: 10)),
                          _buildSubnetChip('192.168.1.', ipController),
                          const SizedBox(width: 4),
                          _buildSubnetChip('192.168.0.', ipController),
                          const SizedBox(width: 4),
                          _buildSubnetChip('192.168.43.', ipController),
                          const SizedBox(width: 4),
                          _buildSubnetChip('10.0.0.', ipController),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Port:', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              TextField(
                                controller: portController,
                                keyboardType: TextInputType.number,
                                style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                                decoration: InputDecoration(
                                  filled: true,
                                  fillColor: const Color(0xFF1E293B),
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
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
                              const Text('PIN:', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              TextField(
                                controller: pinController,
                                keyboardType: TextInputType.number,
                                style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                                decoration: InputDecoration(
                                  filled: true,
                                  fillColor: const Color(0xFF1E293B),
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF334155))),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Ultra-Fast Binary Protocol:', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      Switch(
                        value: _useBinaryProtocol,
                        activeColor: const Color(0xFF00E5FF),
                        onChanged: (val) {
                          setDialogState(() => _useBinaryProtocol = val);
                          setState(() => _useBinaryProtocol = val);
                        },
                      ),
                    ],
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
                  _connectionMode = dialogMode;
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
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(
                dialogMode == 'usb' ? 'Connect USB' : (dialogMode == 'cloud' ? 'Connect Cloud' : 'Connect Wi-Fi'),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubnetChip(String prefix, TextEditingController controller) {
    return InkWell(
      onTap: () {
        controller.text = '${prefix}100';
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.white12),
        ),
        child: Text('${prefix}x', style: const TextStyle(color: Colors.white60, fontSize: 10, fontFamily: 'monospace')),
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
