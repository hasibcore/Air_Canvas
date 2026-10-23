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
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const AirCanvasApp());
}

class AirCanvasApp extends StatelessWidget {
  const AirCanvasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Air Canvas v2.0.2',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0A0A14),
        primaryColor: const Color(0xFF00E5FF),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00E5FF),
          secondary: Color(0xFF7C4DFF),
        ),
      ),
      home: const MainHomeScreen(),
    );
  }
}

// ==============================================================================
// PC SOFTWARE WORKING AREA PRESET MODEL (1:1 Mobile Full-Screen Pad Mapping)
// ==============================================================================
class SoftwareWorkAreaPreset {
  final String id;
  final String name;
  final String shortLabel;
  final double top;
  final double bottom;
  final double left;
  final double right;

  const SoftwareWorkAreaPreset({
    required this.id,
    required this.name,
    required this.shortLabel,
    required this.top,
    required this.bottom,
    required this.left,
    required this.right,
  });

  double get activeWidthPercent => (1.0 - left - right) * 100.0;
  double get activeHeightPercent => (1.0 - top - bottom) * 100.0;
}

const List<SoftwareWorkAreaPreset> kSoftwarePresets = [
  SoftwareWorkAreaPreset(
    id: 'auto',
    name: 'Auto-Detect PC Software Working Area',
    shortLabel: 'Auto-Detect PC App',
    top: 0.08,
    bottom: 0.04,
    left: 0.05,
    right: 0.14,
  ),
  SoftwareWorkAreaPreset(
    id: 'photoshop-krita',
    name: 'Photoshop / Krita / Clip Studio',
    shortLabel: 'Photoshop / Krita',
    top: 0.08,
    bottom: 0.04,
    left: 0.06,
    right: 0.18,
  ),
  SoftwareWorkAreaPreset(
    id: 'onenote-pdf',
    name: 'OneNote / PDF Annotator / Xournal++',
    shortLabel: 'OneNote / PDF',
    top: 0.14,
    bottom: 0.02,
    left: 0.04,
    right: 0.04,
  ),
  SoftwareWorkAreaPreset(
    id: 'illustrator',
    name: 'Illustrator / Affinity Designer',
    shortLabel: 'Illustrator',
    top: 0.09,
    bottom: 0.03,
    left: 0.05,
    right: 0.16,
  ),
  SoftwareWorkAreaPreset(
    id: 'blender',
    name: 'Blender / ZBrush 3D Viewport',
    shortLabel: 'Blender / 3D',
    top: 0.06,
    bottom: 0.05,
    left: 0.05,
    right: 0.15,
  ),
  SoftwareWorkAreaPreset(
    id: 'mspaint',
    name: 'MS Paint / Whiteboard / Kiosk',
    shortLabel: 'MS Paint',
    top: 0.15,
    bottom: 0.04,
    left: 0.01,
    right: 0.01,
  ),
  SoftwareWorkAreaPreset(
    id: 'full-screen',
    name: 'Full Screen (100% Monitor Area)',
    shortLabel: 'Full Screen 100%',
    top: 0.0,
    bottom: 0.0,
    left: 0.0,
    right: 0.0,
  ),
];

// ==============================================================================
// DATA MODELS & STROKE SMOOTHING ENGINE
// ==============================================================================
enum ToolType { pen, eraser, laser }
enum PadBackground { dark, grid,lined, white }

class DrawPoint {
  final Offset offset; // Normalized 0.0 -> 1.0 across 100% Mobile Pad
  final double pressure;
  final int timestamp;

  DrawPoint({
    required this.offset,
    required this.pressure,
    required this.timestamp,
  });
}

class Stroke {
  final List<DrawPoint> points;
  final Color color;
  final double strokeWidth;
  final ToolType tool;

  Stroke({
    required this.points,
    required this.color,
    required this.strokeWidth,
    required this.tool,
  });
}

class DiscoveredPC {
  final String name;
  final String ip;
  final int port;
  final int latencyMs;

  DiscoveredPC({
    required this.name,
    required this.ip,
    required this.port,
    required this.latencyMs,
  });
}

// ==============================================================================
// WEBSOCKET & UDP AUTO-DISCOVERY NETWORK MANAGER
// ==============================================================================
class NetworkConnectionManager extends ChangeNotifier {
  static const String kCloudRelayHost = 'ais-pre-wagmzzgimsj3rkh5tc4yb3-89008514509.asia-southeast1.run.app';
  WebSocket? _socket;
  RawDatagramSocket? _udpSocket;
  bool isConnected = false;
  bool isConnecting = false;
  bool isScanning = false;
  String statusMessage = 'Ready to Connect (Auto-Bridge Wi-Fi / USB / PIN)';
  String connectedIp = '';
  int connectedPort = 9090;
  String pairingPin = '1234';
  String activeTransport = 'wifi';
  int latencyMs = 0;
  int packetsSent = 0;
  String lastError = '';

  SoftwareWorkAreaPreset selectedPreset = kSoftwarePresets.first;
  bool showSoftwareDockGuides = true;

  // Live auto-detected PC software working area metrics & 1:1 Aspect-Ratio Fit lock
  String targetMode = 'MONITOR'; // 'MONITOR' | 'WINDOW' | 'CANVAS'
  bool targetAvailable = true;
  bool canvasVerified = false;
  bool requiresCalibration = false;
  String calibrationStatus = 'NONE'; // 'NONE' | 'VALID' | 'INVALIDATED' | 'FAILED'
  String detectedPcAppName = 'Auto-Detect PC App';
  int detectedPcWorkWidth = 1555;
  int detectedPcWorkHeight = 950;
  double detectedPcAspectRatio = 1555.0 / 950.0;
  bool autoAspectFit = true;

  List<DiscoveredPC> discoveredDevices = [];
  Timer? _pingTimer;
  int _lastPingSent = 0;

  void setTargetMode(String mode) {
    targetMode = mode;
    syncWorkingAreaToPC();
    notifyListeners();
  }

  void setSoftwarePreset(SoftwareWorkAreaPreset preset) {
    selectedPreset = preset;
    targetMode = preset.id == 'full-screen' ? 'MONITOR' : 'CANVAS';
    final double wPct = (1.0 - preset.left - preset.right).clamp(0.1, 1.0);
    final double hPct = (1.0 - preset.top - preset.bottom).clamp(0.1, 1.0);
    detectedPcWorkWidth = (1920.0 * wPct).round();
    detectedPcWorkHeight = (1080.0 * hPct).round();
    detectedPcAspectRatio = detectedPcWorkWidth / math.max(1, detectedPcWorkHeight);
    detectedPcAppName = preset.shortLabel;
    syncWorkingAreaToPC();
    notifyListeners();
  }

  void toggleAutoAspectFit() {
    autoAspectFit = !autoAspectFit;
    notifyListeners();
  }

  void toggleSoftwareDockGuides() {
    showSoftwareDockGuides = !showSoftwareDockGuides;
    notifyListeners();
  }

  void syncWorkingAreaToPC() {
    if (!isConnected || _socket == null) return;
    try {
      final msg = jsonEncode({
        'type': 'workArea',
        'targetMode': targetMode,
        'preset': selectedPreset.id,
        'top': selectedPreset.top,
        'bottom': selectedPreset.bottom,
        'left': selectedPreset.left,
        'right': selectedPreset.right,
      });
      _socket!.add(msg);
    } catch (_) {}
  }

  Future<void> scanLocalNetwork() async {
    if (isScanning) return;
    isScanning = true;
    discoveredDevices.clear();
    lastError = '';
    statusMessage = 'Scanning Wi-Fi LAN & USB for AirCanvas PC Server...';
    notifyListeners();

    try {
      _udpSocket?.close();
      _udpSocket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      _udpSocket!.broadcastEnabled = true;

      _udpSocket!.listen((RawSocketEvent event) {
        if (event == RawSocketEvent.read) {
          final dg = _udpSocket!.receive();
          if (dg != null) {
            try {
              final msg = utf8.decode(dg.data).trim();
              final Map<String, dynamic> data = jsonDecode(msg);
              if (data['app'] == 'AirCanvas') {
                final String ip = dg.address.address;
                final int port = data['port'] ?? 9090;
                final String name = data['name'] ?? 'Windows PC ($ip)';

                if (!discoveredDevices.any((d) => d.ip == ip)) {
                  discoveredDevices.add(DiscoveredPC(
                    name: name,
                    ip: ip,
                    port: port,
                    latencyMs: 2,
                  ));
                  notifyListeners();
                }
              }
            } catch (_) {}
          }
        }
      });

      final probe = utf8.encode(jsonEncode({'type': 'DISCOVERY_PING', 'app': 'AirCanvas'}));
      try {
        _udpSocket!.send(probe, InternetAddress('255.255.255.255'), 9091);
      } catch (_) {}

      final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4);
      final List<Future<void>> scanFutures = [];

      // 1. Probe localhost (USB ADB reverse tcp:9090 tcp:9090 and tcp:3005)
      scanFutures.add(_probeHost('127.0.0.1', 9090));
      scanFutures.add(_probeHost('127.0.0.1', 3005));

      // 2. Probe Cloud Relay PIN Bridge so PC Host is always discoverable even if Firewall blocks LAN port 9090
      scanFutures.add(_probeCloudBridge(pairingPin));

      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (!addr.isLoopback) {
            final parts = addr.address.split('.');
            if (parts.length == 4) {
              final subnet = '${parts[0]}.${parts[1]}.${parts[2]}';
              try {
                _udpSocket?.send(probe, InternetAddress('$subnet.255'), 9091);
              } catch (_) {}

              for (int i = 1; i <= 254; i++) {
                final targetIp = '$subnet.$i';
                if (targetIp == addr.address) continue;
                scanFutures.add(_probeHost(targetIp, 9090));
              }
            }
          }
        }
      }

      await Future.wait(scanFutures).timeout(const Duration(seconds: 3), onTimeout: () => []);
    } catch (e) {
      lastError = 'Network scan error: $e';
    } finally {
      try {
        _udpSocket?.close();
      } catch (_) {}
      _udpSocket = null;
      isScanning = false;
      if (discoveredDevices.isEmpty) {
        statusMessage = 'No PC auto-detected. Enter PC IP or tap USB Cable (127.0.0.1).';
      } else {
        statusMessage = 'Found ${discoveredDevices.length} PC Server(s)! Tap to connect.';
      }
      notifyListeners();
    }
  }

  Future<void> _probeHost(String ip, int port) async {
    try {
      final sw = Stopwatch()..start();
      final socket = await Socket.connect(ip, port, timeout: const Duration(milliseconds: 260));
      sw.stop();
      socket.destroy();
      if (!discoveredDevices.any((d) => d.ip == ip)) {
        discoveredDevices.add(DiscoveredPC(
          name: ip == '127.0.0.1' ? 'USB Cable Server (ADB)' : 'AirCanvas PC ($ip)',
          ip: ip,
          port: port,
          latencyMs: sw.elapsedMilliseconds,
        ));
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> _probeCloudBridge(String pin) async {
    try {
      final cleanPin = pin.trim().isEmpty ? '1234' : pin.trim();
      final sw = Stopwatch()..start();
      final ws = await WebSocket.connect(
        'wss://$kCloudRelayHost/ws?pin=$cleanPin&role=client&name=Android-Scanner',
      ).timeout(const Duration(milliseconds: 1800));
      sw.stop();
      await ws.close();
      if (!discoveredDevices.any((d) => d.ip == 'auto-bridge')) {
        discoveredDevices.add(DiscoveredPC(
          name: 'PC Auto-Bridge (PIN: $cleanPin • Wi-Fi / USB / Cloud)',
          ip: 'auto-bridge',
          port: 9090,
          latencyMs: sw.elapsedMilliseconds.clamp(1, 999),
        ));
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<bool> connect(String ip, int port, {String? pin}) async {
    final cleanIp = ip.trim().isEmpty ? 'auto-bridge' : ip.trim();
    final cleanPin = (pin ?? pairingPin).trim().isEmpty ? '1234' : (pin ?? pairingPin).trim();
    pairingPin = cleanPin;

    await disconnect();
    isConnecting = true;
    lastError = '';
    statusMessage = 'Auto-Bridging to PC ($cleanIp:$port • PIN $cleanPin)...';
    notifyListeners();

    final List<Map<String, String>> candidates = [];
    final bool isDirectIp = cleanIp != 'auto-bridge' && cleanIp != 'cloud' && cleanIp != 'relay';

    if (isDirectIp) {
      final String transportTag = cleanIp == '127.0.0.1' ? 'usb' : 'wifi';
      candidates.add({
        'url': 'ws://$cleanIp:$port/aircanvas?pin=$cleanPin&role=client&name=Android-APK&transport=$transportTag',
        'label': '$cleanIp:$port',
        'transport': transportTag,
      });
      candidates.add({
        'url': 'ws://$cleanIp:$port',
        'label': '$cleanIp:$port',
        'transport': transportTag,
      });
      if (port != 3005) {
        candidates.add({
          'url': 'ws://$cleanIp:3005/ws?pin=$cleanPin&role=client&name=Android-APK&transport=$transportTag',
          'label': '$cleanIp:3005 (PC Desktop Bridge)',
          'transport': transportTag,
        });
      }
      if (cleanIp != '127.0.0.1') {
        candidates.add({
          'url': 'ws://127.0.0.1:9090/aircanvas?pin=$cleanPin&role=client&name=Android-APK&transport=usb',
          'label': '127.0.0.1:9090 (USB Direct)',
          'transport': 'usb',
        });
      }
    } else {
      // Try USB 127.0.0.1 first in case USB cable is connected
      candidates.add({
        'url': 'ws://127.0.0.1:9090/aircanvas?pin=$cleanPin&role=client&name=Android-APK&transport=usb',
        'label': '127.0.0.1:9090 (USB Direct)',
        'transport': 'usb',
      });
    }

    // Always append Cloud Relay PIN Auto-Bridge so if Windows Firewall or router AP isolation blocks port 9090,
    // the Android APK still connects to the PC and injects strokes seamlessly!
    candidates.add({
      'url': 'wss://$kCloudRelayHost/ws?pin=$cleanPin&role=client&name=Android-APK&transport=wifi',
      'label': 'Auto-Bridge PIN $cleanPin',
      'transport': 'cloud-bridge',
    });
    candidates.add({
      'url': 'wss://$kCloudRelayHost/aircanvas?pin=$cleanPin&role=client&name=Android-APK&transport=wifi',
      'label': 'Auto-Bridge Fallback PIN $cleanPin',
      'transport': 'cloud-bridge',
    });

    WebSocket? sock;
    String connectedLabel = '$cleanIp:$port';
    String selectedTransport = 'wifi';

    for (final cand in candidates) {
      try {
        statusMessage = 'Trying ${cand['label']}...';
        notifyListeners();
        final int timeoutMs = cand['transport'] == 'cloud-bridge' ? 3200 : 1400;
        sock = await WebSocket.connect(cand['url']!).timeout(Duration(milliseconds: timeoutMs));
        connectedLabel = cand['label']!;
        selectedTransport = cand['transport']!;
        break;
      } catch (_) {
        sock = null;
      }
    }

    if (sock == null) {
      isConnected = false;
      isConnecting = false;
      lastError = 'Could not reach PC ($cleanIp:$port or PIN $cleanPin). Check Wi-Fi/Internet and ensure AirCanvas is open on PC.';
      statusMessage = 'Connection failed';
      notifyListeners();
      return false;
    }

    try {
      _socket = sock;
      _socket!.pingInterval = const Duration(seconds: 2);

      isConnected = true;
      isConnecting = false;
      activeTransport = selectedTransport;
      connectedIp = isDirectIp ? cleanIp : 'PIN:$cleanPin';
      connectedPort = port;
      statusMessage = 'Connected ($connectedLabel) • 1:1 ${selectedPreset.shortLabel}';
      notifyListeners();

      // Send formal connect_request handshake for Web Studio & PC Desktop + sync PC Software Working Area preset
      try {
        _socket!.add(jsonEncode({
          'type': 'connect_request',
          'senderId': 'android_apk_${DateTime.now().millisecondsSinceEpoch}',
          'senderMode': 'client',
          'pin': cleanPin,
          'transportType': selectedTransport == 'usb' ? 'usb' : 'wifi',
          'deviceInfo': {
            'deviceName': 'Android Tablet / Phone (APK)',
            'deviceModel': 'Android Stylus Digitizer',
            'platform': 'android',
            'screenWidth': 1920,
            'screenHeight': 1080,
            'hasStylusSupport': true,
            'maxPressure': 1.0,
          },
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
      } catch (_) {}
      syncWorkingAreaToPC();

      _socket!.listen(
        (dynamic message) {
          if (message is String) {
            try {
              final data = jsonDecode(message);
              if (data['type'] == 'pong') {
                final now = DateTime.now().millisecondsSinceEpoch;
                latencyMs = (now - _lastPingSent).clamp(1, 999);
                notifyListeners();
              } else if (data['type'] == 'screen_sync') {
                final int sw = (data['screenWidth'] is num) ? (data['screenWidth'] as num).toInt() : detectedPcWorkWidth;
                final int sh = (data['screenHeight'] is num) ? (data['screenHeight'] as num).toInt() : detectedPcWorkHeight;
                if (sw >= 64 && sh >= 64) {
                  detectedPcWorkWidth = sw;
                  detectedPcWorkHeight = sh;
                  detectedPcAspectRatio = sw / sh;
                  notifyListeners();
                }
              } else if (data['type'] == 'workingAreaDetected') {
                final int w = (data['workWidth'] is num) ? (data['workWidth'] as num).toInt() : detectedPcWorkWidth;
                final int h = (data['workHeight'] is num) ? (data['workHeight'] as num).toInt() : detectedPcWorkHeight;
                if (w >= 64 && h >= 64) {
                  detectedPcWorkWidth = w;
                  detectedPcWorkHeight = h;
                  detectedPcAspectRatio = w / h;
                }
                if (data['appName'] is String && (data['appName'] as String).isNotEmpty) {
                  detectedPcAppName = data['appName'] as String;
                }
                if (data['targetMode'] is String) {
                  targetMode = data['targetMode'] as String;
                }
                if (data['targetAvailable'] is bool) {
                  targetAvailable = data['targetAvailable'] as bool;
                }
                if (data['canvasVerified'] is bool) {
                  canvasVerified = data['canvasVerified'] as bool;
                }
                if (data['requiresCalibration'] is bool) {
                  requiresCalibration = data['requiresCalibration'] as bool;
                }
                notifyListeners();
              }
            } catch (_) {}
          }
        },
        onDone: () {
          _handleDisconnect('PC Server closed the connection.');
        },
        onError: (err) {
          _handleDisconnect('Connection error: $err');
        },
      );

      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(const Duration(seconds: 2), (_) {
        if (isConnected && _socket != null) {
          _lastPingSent = DateTime.now().millisecondsSinceEpoch;
          try {
            _socket!.add(jsonEncode({'type': 'ping', 'timestamp': _lastPingSent}));
          } catch (_) {}
        }
      });

      return true;
    } catch (e) {
      isConnected = false;
      isConnecting = false;
      lastError = 'Could not reach $cleanIp:$port. Ensure AirCanvas.exe is running on PC.';
      statusMessage = 'Connection failed';
      notifyListeners();
      return false;
    }
  }

  void _handleDisconnect(String reason) {
    isConnected = false;
    isConnecting = false;
    _pingTimer?.cancel();
    statusMessage = reason;
    notifyListeners();
  }

  Future<void> disconnect() async {
    _pingTimer?.cancel();
    try {
      _udpSocket?.close();
    } catch (_) {}
    _udpSocket = null;
    try {
      await _socket?.close();
    } catch (_) {}
    _socket = null;
    isConnected = false;
    isConnecting = false;
    statusMessage = 'Disconnected';
    notifyListeners();
  }

  /// Encodes a 13-byte little-endian binary pointer frame per Appendix A.1 spec:
  /// [type:u8][x:u16 LE][y:u16 LE][pressure:u16 LE][tool:u8][timestamp:u32 LE][version:u8=1]
  static Uint8List encodeBinaryFrame({
    required int type,
    required double normX,
    required double normY,
    required double pressure,
    required int tool,
    required int timestamp,
    int version = 1,
  }) {
    final double clampedX = normX.isFinite ? normX.clamp(0.0, 1.0) : 0.5;
    final double clampedY = normY.isFinite ? normY.clamp(0.0, 1.0) : 0.5;
    final double clampedP = pressure.isFinite ? pressure.clamp(0.0, 1.0) : 0.0;

    final bd = ByteData(13);
    bd.setUint8(0, type & 0xFF);
    bd.setUint16(1, (clampedX * 65535.0).round(), Endian.little);
    bd.setUint16(3, (clampedY * 65535.0).round(), Endian.little);
    bd.setUint16(5, (clampedP * 1024.0).round(), Endian.little);
    bd.setUint8(7, tool & 0xFF);
    bd.setUint32(8, timestamp & 0xFFFFFFFF, Endian.little);
    bd.setUint8(12, version & 0xFF);
    return Uint8List.view(bd.buffer, bd.offsetInBytes, 13);
  }

  /// Validates and decodes a 13-byte little-endian binary pointer frame.
  /// Returns a map with `{ok: true, ...}` or `{ok: false, error: 'BadLength'|'BadVersion'|'BadEventType'|'BadTool'}`.
  static Map<String, dynamic> decodeBinaryFrame(Uint8List bytes) {
    if (bytes.length != 13) {
      return {'ok': false, 'error': 'BadLength'};
    }
    final bd = ByteData.sublistView(bytes);
    final int version = bd.getUint8(12);
    if (version != 1) {
      return {'ok': false, 'error': 'BadVersion'};
    }
    final int type = bd.getUint8(0);
    if (type > 3) {
      return {'ok': false, 'error': 'BadEventType'};
    }
    final int tool = bd.getUint8(7);
    if (tool > 2) {
      return {'ok': false, 'error': 'BadTool'};
    }
    final int rawX = bd.getUint16(1, Endian.little);
    final int rawY = bd.getUint16(3, Endian.little);
    final int rawP = bd.getUint16(5, Endian.little);
    final int timestamp = bd.getUint32(8, Endian.little);

    return {
      'ok': true,
      'type': type,
      'rawX': rawX,
      'rawY': rawY,
      'rawP': rawP,
      'normX': (rawX / 65535.0).clamp(0.0, 1.0),
      'normY': (rawY / 65535.0).clamp(0.0, 1.0),
      'pressure': (rawP / 1024.0).clamp(0.0, 1.0),
      'tool': tool,
      'timestamp': timestamp,
      'version': version,
    };
  }

  /// Sends ultra-fast 13-byte binary packet AND JSON packet for universal compatibility.
  /// Normalized (0.0 -> 1.0) coordinates represent 100% of the Mobile Full-Screen Pad
  /// and map 1:1 to the selected PC Software Working Area.
  void sendPointerEvent({
    required String type,
    required double normX,
    required double normY,
    required double pressure,
    required ToolType tool,
  }) {
    if (!isConnected || _socket == null) return;

    int pType = 1; // Move
    if (type == 'pointerDown') pType = 0;
    else if (type == 'pointerUp') pType = 2;
    else if (type == 'pointerHover') pType = 3;

    final double wirePressure = (pType == 2 || pType == 3)
        ? 0.0
        : (pressure.isFinite ? pressure.clamp(0.0, 1.0) : 0.5);
    final int toolId = tool == ToolType.eraser ? 1 : (tool == ToolType.laser ? 2 : 0);

    try {
      final frame = encodeBinaryFrame(
        type: pType,
        normX: normX,
        normY: normY,
        pressure: wirePressure,
        tool: toolId,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );
      _socket!.add(frame);
      packetsSent++;
    } catch (_) {}
  }

  void sendToolShortcut(ToolType tool) {
    if (!isConnected || _socket == null) return;
    try {
      final isEraser = tool == ToolType.eraser;
      final msg = jsonEncode({
        'type': 'action',
        'payload': {
          'action': isEraser ? 'eraserShortcut' : 'brushShortcut',
          'tool': isEraser ? 'eraser' : 'pen',
          'shortcutKey': isEraser ? 'E' : 'B',
          'penFlags': isEraser ? 6 : 0,
        },
      });
      _socket!.add(msg);
    } catch (_) {}
  }

  void sendCanvasAction(String action) {
    if (!isConnected || _socket == null) return;
    try {
      final msg = jsonEncode({
        'type': 'action',
        'payload': {
          'action': action,
        },
      });
      _socket!.add(msg);
    } catch (_) {}
  }
}

// ==============================================================================
// MAIN HOME SCREEN (TAB NAVIGATION + LANDSCAPE FULL-SCREEN TABLET PAD)
// ==============================================================================
class MainHomeScreen extends StatefulWidget {
  const MainHomeScreen({super.key});

  @override
  State<MainHomeScreen> createState() => _MainHomeScreenState();
}

class _MainHomeScreenState extends State<MainHomeScreen> {
  final NetworkConnectionManager _net = NetworkConnectionManager();
  int _selectedIndex = 0; // 0 = Full-Screen Tablet Pad, 1 = Connect & PC Working Area Setup
  bool _isLandscapeLocked = true;

  @override
  void initState() {
    super.initState();
    _applyOrientationLock(true);
    _net.addListener(_onNetUpdate);
    Future.delayed(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      _net.scanLocalNetwork();
    });
  }

  Future<void> _applyOrientationLock(bool landscape) async {
    _isLandscapeLocked = landscape;
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (landscape) {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } else {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    }
    if (mounted) setState(() {});
  }

  void _onNetUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _net.removeListener(_onNetUpdate);
    _net.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _selectedIndex == 0
            ? DrawingTabletPadView(
                net: _net,
                isLandscapeLocked: _isLandscapeLocked,
                onToggleOrientation: () => _applyOrientationLock(!_isLandscapeLocked),
                onOpenConnectionSheet: () => setState(() => _selectedIndex = 1),
              )
            : ConnectionSetupView(
                net: _net,
                onConnected: () {
                  _applyOrientationLock(true);
                  setState(() => _selectedIndex = 0);
                },
              ),
      ),
    );
  }
}

// ==============================================================================
// 1. FULL-SCREEN TABLET PAD VIEW (v2.0.0: DISJOINT TOOLBARS & ZERO STRAIGHT LINES)
// ==============================================================================
class DrawingTabletPadView extends StatefulWidget {
  final NetworkConnectionManager net;
  final bool isLandscapeLocked;
  final VoidCallback onToggleOrientation;
  final VoidCallback onOpenConnectionSheet;

  const DrawingTabletPadView({
    super.key,
    required this.net,
    required this.isLandscapeLocked,
    required this.onToggleOrientation,
    required this.onOpenConnectionSheet,
  });

  @override
  State<DrawingTabletPadView> createState() => _DrawingTabletPadViewState();
}

class _DrawingTabletPadViewState extends State<DrawingTabletPadView> with WidgetsBindingObserver {
  final List<Stroke> _strokes = [];
  final List<Stroke> _redoStack = [];
  Stroke? _currentStroke;

  // CRITICAL v2.0.0 FIX: Lock onto first active pointer ID to prevent multi-touch straight lines
  int? _activePointerId;

  ToolType _activeTool = ToolType.pen;
  PadBackground _padBg = PadBackground.grid;
  Color _selectedColor = const Color(0xFF00E5FF);
  double _strokeWidth = 4.0;
  bool _showBottomToolbar = true;

  Offset? _cursorNormalized;
  double _currentPressure = 0.0;

  final List<Color> _palette = const [
    Color(0xFF00E5FF),
    Color(0xFFFFFFFF),
    Color(0xFFFF3366),
    Color(0xFF00E676),
    Color(0xFFFFEA00),
    Color(0xFFAA00FF),
    Color(0xFFFF9100),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _forceFinishActiveStroke();
    }
  }

  // Latched active pad rect across an in-progress stroke (Phase 4.10.2 & 4.10.9)
  Rect? _latchedStrokePadRect;

  void _forceFinishActiveStroke() {
    if (_activePointerId != null || _currentStroke != null) {
      final lastNorm = _cursorNormalized ?? const Offset(0.5, 0.5);
      final ToolType effectiveTool = _currentStroke?.tool ?? _activeTool;
      widget.net.sendPointerEvent(
        type: 'pointerUp',
        normX: lastNorm.dx,
        normY: lastNorm.dy,
        pressure: 0.0,
        tool: effectiveTool,
      );
      setState(() {
        _activePointerId = null;
        _latchedStrokePadRect = null;
        _currentStroke = null;
        _currentPressure = 0.0;
      });
    }
  }

  double _normalizePadAxis(double localCoord, double extent) {
    if (!localCoord.isFinite || !extent.isFinite || extent < 2.0) {
      return 0.5;
    }
    return (localCoord / (extent - 1.0)).clamp(0.0, 1.0);
  }

  /// Computes the active drawing zone inside any mobile/tablet screen (e.g., 20:9 phone, 16:10 tablet, 4:3 iPad).
  /// When `autoAspectFit` is ON, it automatically fits the active PC software working area's exact aspect ratio
  /// inside the mobile pad so circles on the phone/tablet remain true circles on the PC without distortion.
  Rect _computeActivePadRect(Size padSize) {
    if (padSize.width < 2.0 || padSize.height < 2.0) {
      return Offset.zero & padSize;
    }
    if (!widget.net.autoAspectFit) {
      return Offset.zero & padSize;
    }
    final double targetAspect = widget.net.detectedPcAspectRatio.isFinite && widget.net.detectedPcAspectRatio > 0.1
        ? widget.net.detectedPcAspectRatio
        : (16.0 / 9.0);
    final double padAspect = padSize.width / padSize.height;

    double activeW = padSize.width;
    double activeH = padSize.height;
    if (padAspect > targetAspect) {
      activeH = padSize.height;
      activeW = activeH * targetAspect;
    } else {
      activeW = padSize.width;
      activeH = activeW / targetAspect;
    }
    final double left = (padSize.width - activeW) / 2.0;
    final double top = (padSize.height - activeH) / 2.0;
    return Rect.fromLTWH(left, top, activeW, activeH);
  }

  Offset _normalizePadPoint(Offset localPosition, Size padSize) {
    final Rect activeRect = _latchedStrokePadRect ?? _computeActivePadRect(padSize);
    final double nx = _normalizePadAxis(localPosition.dx - activeRect.left, activeRect.width);
    final double ny = _normalizePadAxis(localPosition.dy - activeRect.top, activeRect.height);
    return Offset(nx, ny);
  }

  void _onPointerDown(PointerDownEvent event, Size padSize) {
    if (padSize.width < 2.0 || padSize.height < 2.0) return;
    if (!widget.net.targetAvailable) return;

    // Lock strictly onto the first finger/stylus touching the pad; reject palm/2nd finger
    if (_activePointerId != null && _activePointerId != event.pointer) {
      return;
    }

    final Rect activeRect = _computeActivePadRect(padSize);
    // Reject outside-active-pad touches so letterboxed borders never start unintended strokes
    if (!activeRect.contains(event.localPosition)) {
      return;
    }

    _activePointerId = event.pointer;
    _latchedStrokePadRect = activeRect;

    final Offset normPt = _normalizePadPoint(event.localPosition, padSize);
    final double normX = normPt.dx;
    final double normY = normPt.dy;
    final double pressure = event.pressure > 0 ? event.pressure.clamp(0.1, 1.0) : 0.65;

    final bool isHardwareEraser = event.kind == PointerDeviceKind.invertedStylus ||
        (event.kind == PointerDeviceKind.stylus && (event.buttons & kSecondaryStylusButton) != 0);
    final ToolType effectiveTool = isHardwareEraser ? ToolType.eraser : _activeTool;

    final point = DrawPoint(
      offset: Offset(normX, normY),
      pressure: pressure,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    );

    setState(() {
      _cursorNormalized = Offset(normX, normY);
      _currentPressure = pressure;
      _redoStack.clear();
      _currentStroke = Stroke(
        points: [point],
        color: effectiveTool == ToolType.eraser ? Colors.transparent : _selectedColor,
        strokeWidth: effectiveTool == ToolType.eraser ? _strokeWidth * 3.0 : _strokeWidth,
        tool: effectiveTool,
      );
      _strokes.add(_currentStroke!);
    });

    widget.net.sendPointerEvent(
      type: 'pointerDown',
      normX: normX,
      normY: normY,
      pressure: pressure,
      tool: effectiveTool,
    );
  }

  void _onPointerMove(PointerMoveEvent event, Size padSize) {
    if (padSize.width <= 0 || padSize.height <= 0) return;
    if (_activePointerId == null || event.pointer != _activePointerId) return;

    final Offset normPt = _normalizePadPoint(event.localPosition, padSize);
    final double normX = normPt.dx;
    final double normY = normPt.dy;
    final double pressure = event.pressure > 0 ? event.pressure.clamp(0.1, 1.0) : 0.65;

    final now = DateTime.now().millisecondsSinceEpoch;

    // Guard against hardware touch controller jump (>35% of screen in a single frame)
    if (_currentStroke != null && _currentStroke!.points.isNotEmpty) {
      final prev = _currentStroke!.points.last;
      final dist = (Offset(normX, normY) - prev.offset).distance;
      if (dist > 0.35) {
        final ToolType effectiveTool = _currentStroke?.tool ?? _activeTool;
        widget.net.sendPointerEvent(
          type: 'pointerUp',
          normX: prev.offset.dx,
          normY: prev.offset.dy,
          pressure: 0.0,
          tool: effectiveTool,
        );
        final freshPoint = DrawPoint(offset: Offset(normX, normY), pressure: pressure, timestamp: now);
        setState(() {
          _cursorNormalized = Offset(normX, normY);
          _currentPressure = pressure;
          _currentStroke = Stroke(
            points: [freshPoint],
            color: effectiveTool == ToolType.eraser ? Colors.transparent : _selectedColor,
            strokeWidth: effectiveTool == ToolType.eraser ? _strokeWidth * 3.0 : _strokeWidth,
            tool: effectiveTool,
          );
          _strokes.add(_currentStroke!);
        });
        widget.net.sendPointerEvent(
          type: 'pointerDown',
          normX: normX,
          normY: normY,
          pressure: pressure,
          tool: effectiveTool,
        );
        return;
      }
    }

    final point = DrawPoint(
      offset: Offset(normX, normY),
      pressure: pressure,
      timestamp: now,
    );

    final ToolType effectiveTool = _currentStroke?.tool ?? _activeTool;

    setState(() {
      _cursorNormalized = Offset(normX, normY);
      _currentPressure = pressure;
      _currentStroke?.points.add(point);
    });

    widget.net.sendPointerEvent(
      type: 'pointerMove',
      normX: normX,
      normY: normY,
      pressure: pressure,
      tool: effectiveTool,
    );
  }

  void _onPointerUp(PointerUpEvent event, Size padSize) {
    if (_activePointerId != null && event.pointer != _activePointerId) return;

    final Offset normPt = _normalizePadPoint(event.localPosition, padSize);
    final double normX = normPt.dx;
    final double normY = normPt.dy;
    final ToolType effectiveTool = _currentStroke?.tool ?? _activeTool;

    setState(() {
      _activePointerId = null;
      _latchedStrokePadRect = null;
      _currentPressure = 0.0;
      if (_currentStroke?.tool == ToolType.laser) {
        _strokes.remove(_currentStroke);
      }
      _currentStroke = null;
    });

    widget.net.sendPointerEvent(
      type: 'pointerUp',
      normX: normX,
      normY: normY,
      pressure: 0.0,
      tool: effectiveTool,
    );
  }

  void _onPointerCancel(PointerCancelEvent event) {
    if (_activePointerId != null && event.pointer != _activePointerId) return;
    _forceFinishActiveStroke();
  }

  void _onPointerHover(PointerHoverEvent event, Size padSize) {
    if (padSize.width <= 0 || padSize.height <= 0) return;
    final Offset normPt = _normalizePadPoint(event.localPosition, padSize);
    final double normX = normPt.dx;
    final double normY = normPt.dy;

    setState(() {
      _cursorNormalized = Offset(normX, normY);
    });

    widget.net.sendPointerEvent(
      type: 'pointerHover',
      normX: normX,
      normY: normY,
      pressure: 0.0,
      tool: _activeTool,
    );
  }

  void _undo() {
    if (_strokes.isNotEmpty) {
      setState(() {
        _redoStack.add(_strokes.removeLast());
      });
      widget.net.sendCanvasAction('undo');
    }
  }

  void _redo() {
    if (_redoStack.isNotEmpty) {
      setState(() {
        _strokes.add(_redoStack.removeLast());
      });
      widget.net.sendCanvasAction('redo');
    }
  }

  void _clearCanvas() {
    setState(() {
      _strokes.clear();
      _redoStack.clear();
    });
    widget.net.sendCanvasAction('clearCanvas');
  }

  void _showSoftwareWorkingAreaPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF121222),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.desktop_windows, color: Color(0xFF00E5FF), size: 20),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'PC Software Working Area (100% Pad ➔ 1:1 Canvas)',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () {
                        widget.net.toggleSoftwareDockGuides();
                        Navigator.pop(ctx);
                      },
                      icon: Icon(
                        widget.net.showSoftwareDockGuides ? Icons.visibility : Icons.visibility_off,
                        size: 16,
                        color: const Color(0xFF00E5FF),
                      ),
                      label: Text(
                        widget.net.showSoftwareDockGuides ? 'Guides ON' : 'Guides OFF',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF00E5FF)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: kSoftwarePresets.length,
                    itemBuilder: (_, idx) {
                      final p = kSoftwarePresets[idx];
                      final isSelected = widget.net.selectedPreset.id == p.id;
                      return ListTile(
                        dense: true,
                        selected: isSelected,
                        selectedTileColor: const Color(0xFF00E5FF).withOpacity(0.12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        leading: Icon(
                          isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
                          color: isSelected ? const Color(0xFF00E5FF) : Colors.white54,
                          size: 18,
                        ),
                        title: Text(
                          p.name,
                          style: TextStyle(
                            color: isSelected ? const Color(0xFF00E5FF) : Colors.white,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          'Active Working Area: ${p.activeWidthPercent.round()}% W × ${p.activeHeightPercent.round()}% H',
                          style: const TextStyle(color: Colors.white54, fontSize: 11),
                        ),
                        onTap: () {
                          widget.net.setSoftwarePreset(p);
                          Navigator.pop(ctx);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final preset = widget.net.selectedPreset;

    // Strictly disjoint Column layout: Top Bar + Expanded 100% Tablet Pad + Bottom Toolbar
    return Column(
      children: [
        // 1. TOP CONTROL BAR (Never overlaps the drawing canvas; horizontally scrollable in portrait)
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: const BoxDecoration(
            color: Color(0xFF10101E),
            border: Border(bottom: BorderSide(color: Colors.white12, width: 1)),
          ),
          child: LayoutBuilder(
            builder: (context, barConstraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: barConstraints.maxWidth),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Connection Status Pill
                          InkWell(
                            onTap: widget.onOpenConnectionSheet,
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: widget.net.isConnected
                                    ? Colors.greenAccent.withOpacity(0.12)
                                    : Colors.orangeAccent.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: widget.net.isConnected ? Colors.greenAccent : Colors.orangeAccent,
                                  width: 1,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    widget.net.isConnected ? Icons.wifi : Icons.wifi_find,
                                    size: 13,
                                    color: widget.net.isConnected ? Colors.greenAccent : Colors.orangeAccent,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    widget.net.isConnected
                                        ? '${widget.net.connectedIp} (${widget.net.latencyMs}ms)'
                                        : 'Connect PC',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // PC Software Working Area Preset Button
                          InkWell(
                            onTap: _showSoftwareWorkingAreaPicker,
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFF00E5FF).withOpacity(0.12),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFF00E5FF).withOpacity(0.45)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.aspect_ratio, size: 13, color: Color(0xFF00E5FF)),
                                  const SizedBox(width: 5),
                                  Text(
                                    '1:1 ${widget.net.detectedPcAppName} (${widget.net.detectedPcWorkWidth}×${widget.net.detectedPcWorkHeight})',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF00E5FF),
                                    ),
                                  ),
                                  const Icon(Icons.arrow_drop_down, size: 15, color: Color(0xFF00E5FF)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),

                          // Auto Aspect-Ratio Fit Toggle (Prevents Oval Distortion on Different Phone/Tablet Sizes)
                          InkWell(
                            onTap: () => widget.net.toggleAutoAspectFit(),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                              decoration: BoxDecoration(
                                color: widget.net.autoAspectFit
                                    ? const Color(0xFF00E676).withOpacity(0.14)
                                    : Colors.white.withOpacity(0.06),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: widget.net.autoAspectFit ? const Color(0xFF00E676) : Colors.white24,
                                ),
                              ),
                              child: Text(
                                widget.net.autoAspectFit ? 'Ratio Lock: ON' : 'Full Stretch',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: widget.net.autoAspectFit ? const Color(0xFF00E676) : Colors.white70,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),

                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Live Coordinate Readout
                          if (_cursorNormalized != null)
                            Padding(
                              padding: const EdgeInsets.only(left: 8, right: 6),
                              child: Text(
                                'X:${(_cursorNormalized!.dx * 100).toStringAsFixed(0)}% Y:${(_cursorNormalized!.dy * 100).toStringAsFixed(0)}%',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontFamily: 'monospace',
                                  color: Colors.white60,
                                ),
                              ),
                            ),

                          // Undo / Redo / Clear
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: const Icon(Icons.undo, size: 17, color: Colors.white70),
                            onPressed: _strokes.isNotEmpty ? _undo : null,
                            tooltip: 'Undo',
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: const Icon(Icons.redo, size: 17, color: Colors.white70),
                            onPressed: _redoStack.isNotEmpty ? _redo : null,
                            tooltip: 'Redo',
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: const Icon(Icons.delete_outline, size: 17, color: Colors.redAccent),
                            onPressed: (_strokes.isNotEmpty || _redoStack.isNotEmpty) ? _clearCanvas : null,
                            tooltip: 'Clear Pad',
                          ),

                          // Landscape / Portrait Orientation Switch
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: Icon(
                              widget.isLandscapeLocked ? Icons.screen_lock_landscape : Icons.screen_rotation,
                              size: 17,
                              color: const Color(0xFF00E5FF),
                            ),
                            onPressed: widget.onToggleOrientation,
                            tooltip: 'Toggle Full-Screen Landscape Mode',
                          ),

                          // Toggle Bottom Toolbar
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            icon: Icon(
                              _showBottomToolbar ? Icons.keyboard_arrow_down : Icons.keyboard_arrow_up,
                              size: 18,
                              color: Colors.white70,
                            ),
                            onPressed: () => setState(() => _showBottomToolbar = !_showBottomToolbar),
                            tooltip: 'Toggle Bottom Toolbar',
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // 2. MIDDLE 100% FULL-SCREEN TABLET PAD (Maps 1:1 to PC Software Working Area)
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final Size padSize = Size(constraints.maxWidth, constraints.maxHeight);
              final Rect activePadRect = _computeActivePadRect(padSize);
              return Listener(
                behavior: HitTestBehavior.opaque,
                onPointerDown: (e) => _onPointerDown(e, padSize),
                onPointerMove: (e) => _onPointerMove(e, padSize),
                onPointerUp: (e) => _onPointerUp(e, padSize),
                onPointerCancel: _onPointerCancel,
                onPointerHover: (e) => _onPointerHover(e, padSize),
                child: CustomPaint(
                  size: padSize,
                  painter: TabletCanvasPainter(
                    strokes: _strokes,
                    background: _padBg,
                    cursorNormalized: _cursorNormalized,
                    currentPressure: _currentPressure,
                    preset: preset,
                    showSoftwareGuides: widget.net.showSoftwareDockGuides,
                    activePadRect: activePadRect,
                  ),
                ),
              );
            },
          ),
        ),

        // 3. BOTTOM DRAWING TOOLBAR (Disjoint from canvas, collapsible for 100% pad space)
        if (_showBottomToolbar)
          Container(
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: const BoxDecoration(
              color: Color(0xFF10101E),
              border: Border(top: BorderSide(color: Colors.white12, width: 1)),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildToolChip(ToolType.pen, Icons.edit, 'Pen'),
                  const SizedBox(width: 6),
                  _buildToolChip(ToolType.eraser, Icons.cleaning_services, 'Eraser'),
                  const SizedBox(width: 6),
                  _buildToolChip(ToolType.laser, Icons.flare, 'Laser'),
                  const SizedBox(width: 12),

                  // Color Swatches
                  ..._palette.map((color) {
                    final isSelected = _selectedColor == color && _activeTool != ToolType.eraser;
                    return GestureDetector(
                      onTap: () {
                        final bool wasEraser = _activeTool == ToolType.eraser;
                        setState(() {
                          _selectedColor = color;
                          if (wasEraser) _activeTool = ToolType.pen;
                        });
                        if (wasEraser) {
                          widget.net.sendToolShortcut(ToolType.pen);
                        }
                      },
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: isSelected ? 22 : 18,
                        height: isSelected ? 22 : 18,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected ? Colors.white : Colors.white24,
                            width: isSelected ? 2.0 : 1.0,
                          ),
                        ),
                      ),
                    );
                  }),

                  const SizedBox(width: 10),
                  const Icon(Icons.line_weight, size: 14, color: Colors.white54),
                  SizedBox(
                    width: 100,
                    child: Slider(
                      value: _strokeWidth,
                      min: 1.0,
                      max: 20.0,
                      activeColor: const Color(0xFF00E5FF),
                      onChanged: (v) => setState(() => _strokeWidth = v),
                    ),
                  ),

                  // Background cycle button
                  TextButton.icon(
                    onPressed: () {
                      setState(() {
                        final next = (_padBg.index + 1) % PadBackground.values.length;
                        _padBg = PadBackground.values[next];
                      });
                    },
                    icon: const Icon(Icons.grid_4x4, size: 14, color: Colors.white70),
                    label: Text(
                      _padBg.name.toUpperCase(),
                      style: const TextStyle(fontSize: 10, color: Colors.white70),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildToolChip(ToolType tool, IconData icon, String label) {
    final bool active = _activeTool == tool;
    return InkWell(
      onTap: () {
        setState(() => _activeTool = tool);
        widget.net.sendToolShortcut(tool);
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF00E5FF).withOpacity(0.18) : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active ? const Color(0xFF00E5FF) : Colors.white12,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: active ? const Color(0xFF00E5FF) : Colors.white70),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: active ? FontWeight.bold : FontWeight.normal,
                color: active ? const Color(0xFF00E5FF) : Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ==============================================================================
// CUSTOM PAINTER: 100% MOBILE PAD <-> PC SOFTWARE WORKING AREA 1:1 MAPPER
// ==============================================================================
class TabletCanvasPainter extends CustomPainter {
  final List<Stroke> strokes;
  final PadBackground background;
  final Offset? cursorNormalized;
  final double currentPressure;
  final SoftwareWorkAreaPreset preset;
  final bool showSoftwareGuides;
  final Rect activePadRect;

  TabletCanvasPainter({
    required this.strokes,
    required this.background,
    required this.cursorNormalized,
    required this.currentPressure,
    required this.preset,
    required this.showSoftwareGuides,
    required this.activePadRect,
  });

  Offset _mapNormalizedToCanvas(Offset norm) {
    return Offset(
      activePadRect.left + (norm.dx * activePadRect.width),
      activePadRect.top + (norm.dy * activePadRect.height),
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Background Fill
    final bgColor = background == PadBackground.white ? const Color(0xFFF5F7FA) : const Color(0xFF0A0A14);
    canvas.drawRect(Offset.zero & size, Paint()..color = bgColor);

    // 2. Grid / Lined Rule Guides
    final linePaint = Paint()
      ..color = background == PadBackground.white
          ? Colors.black.withOpacity(0.07)
          : Colors.white.withOpacity(0.05)
      ..strokeWidth = 1.0;

    if (background == PadBackground.grid) {
      const double step = 36.0;
      for (double x = step; x < size.width; x += step) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), linePaint);
      }
      for (double y = step; y < size.height; y += step) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
      }
    } else if (background == PadBackground.lined) {
      const double step = 36.0;
      for (double y = step; y < size.height; y += step) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
      }
    }

    // 3. 1:1 PC Software Working Area Boundary & Center Crosshair (Aspect-Ratio Matched)
    if (showSoftwareGuides) {
      final borderPaint = Paint()
        ..color = const Color(0xFF00E5FF).withOpacity(0.38)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6;
      canvas.drawRect(
        activePadRect.deflate(1.5),
        borderPaint,
      );

      // Subtle center crosshair (0.5, 0.5) inside the active 1:1 working area
      final center = activePadRect.center;
      final crossPaint = Paint()
        ..color = const Color(0xFF00E5FF).withOpacity(0.22)
        ..strokeWidth = 1.0;
      canvas.drawLine(Offset(center.dx - 14, center.dy), Offset(center.dx + 14, center.dy), crossPaint);
      canvas.drawLine(Offset(center.dx, center.dy - 14), Offset(center.dx, center.dy + 14), crossPaint);
    }

    // 4. Render Smoothed Strokes on an isolated Ink Layer so Eraser (BlendMode.clear)
    // wipes ink cleanly without erasing the background or reference grid.
    canvas.saveLayer(Offset.zero & size, Paint());
    for (final stroke in strokes) {
      if (stroke.points.isEmpty) continue;
      final bool isEraser = stroke.tool == ToolType.eraser;

      final paint = Paint()
        ..color = isEraser ? const Color(0xFFFFFFFF) : stroke.color
        ..blendMode = isEraser ? BlendMode.clear : BlendMode.srcOver
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke.strokeWidth;

      if (stroke.tool == ToolType.laser) {
        paint.maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
      }

      if (stroke.points.length == 1) {
        final p = _mapNormalizedToCanvas(stroke.points.first.offset);
        final dotPaint = Paint()
          ..color = isEraser ? const Color(0xFFFFFFFF) : stroke.color
          ..blendMode = isEraser ? BlendMode.clear : BlendMode.srcOver;
        canvas.drawCircle(p, stroke.strokeWidth / 2, dotPaint);
        continue;
      }

      final path = Path();
      final first = _mapNormalizedToCanvas(stroke.points.first.offset);
      path.moveTo(first.dx, first.dy);

      for (int i = 1; i < stroke.points.length - 1; i++) {
        final p0 = _mapNormalizedToCanvas(stroke.points[i].offset);
        final p1 = _mapNormalizedToCanvas(stroke.points[i + 1].offset);
        final mid = Offset((p0.dx + p1.dx) / 2, (p0.dy + p1.dy) / 2);
        path.quadraticBezierTo(p0.dx, p0.dy, mid.dx, mid.dy);
      }

      final last = _mapNormalizedToCanvas(stroke.points.last.offset);
      path.lineTo(last.dx, last.dy);
      canvas.drawPath(path, paint);
    }
    canvas.restore();

    // 5. Active Stylus / Touch Cursor Ring
    if (cursorNormalized != null) {
      final pos = _mapNormalizedToCanvas(cursorNormalized!);
      final radius = 6.0 + (currentPressure * 8.0);
      canvas.drawCircle(
        pos,
        radius,
        Paint()
          ..color = const Color(0xFF00E5FF).withOpacity(0.85)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.8,
      );
      canvas.drawCircle(
        pos,
        2.0,
        Paint()..color = Colors.white,
      );
    }
  }

  @override
  bool shouldRepaint(covariant TabletCanvasPainter oldDelegate) {
    return true;
  }
}

// ==============================================================================
// 2. CONNECTION & PC WORKING AREA SETUP VIEW
// ==============================================================================
class ConnectionSetupView extends StatefulWidget {
  final NetworkConnectionManager net;
  final VoidCallback onConnected;

  const ConnectionSetupView({
    super.key,
    required this.net,
    required this.onConnected,
  });

  @override
  State<ConnectionSetupView> createState() => _ConnectionSetupViewState();
}

class _ConnectionSetupViewState extends State<ConnectionSetupView> {
  final TextEditingController _ipController = TextEditingController(text: '192.168.0.100');
  final TextEditingController _portController = TextEditingController(text: '9090');
  final TextEditingController _pinController = TextEditingController(text: '1234');

  @override
  void initState() {
    super.initState();
    widget.net.addListener(_onNetChanged);
    if (widget.net.connectedIp.isNotEmpty && !widget.net.connectedIp.startsWith('PIN:')) {
      _ipController.text = widget.net.connectedIp;
    }
    _portController.text = widget.net.connectedPort.toString();
    _pinController.text = widget.net.pairingPin;
  }

  void _onNetChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.net.removeListener(_onNetChanged);
    _ipController.dispose();
    _portController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF121222),
        title: const Text(
          'Air Canvas v2.0.2 — Auto-Bridge Connect & PC Working Area',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        ),
        actions: [
          TextButton.icon(
            onPressed: widget.onConnected,
            icon: const Icon(Icons.brush, size: 16, color: Color(0xFF00E5FF)),
            label: const Text('Open Full-Screen Pad', style: TextStyle(color: Color(0xFF00E5FF))),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // PC Software Working Area Card
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF141428),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF00E5FF).withOpacity(0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.aspect_ratio, color: Color(0xFF00E5FF), size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '100% Mobile Pad ➔ PC Software Working Area (1:1)',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Your entire mobile screen works as the tablet pad and maps 1:1 into your active PC drawing software working area.',
                  style: TextStyle(fontSize: 11, color: Colors.white70),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kSoftwarePresets.map((preset) {
                    final selected = widget.net.selectedPreset.id == preset.id;
                    return ChoiceChip(
                      label: Text(
                        preset.shortLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                          color: selected ? Colors.black : Colors.white,
                        ),
                      ),
                      selected: selected,
                      selectedColor: const Color(0xFF00E5FF),
                      backgroundColor: const Color(0xFF1E1E36),
                      onSelected: (_) => setState(() => widget.net.setSoftwarePreset(preset)),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Quick Auto-Detect, USB & Auto-Bridge PIN Row
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00E5FF),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: widget.net.isScanning
                      ? null
                      : () {
                          widget.net.pairingPin = _pinController.text.trim().isEmpty ? '1234' : _pinController.text.trim();
                          widget.net.scanLocalNetwork();
                        },
                  icon: const Icon(Icons.radar, size: 18),
                  label: Text(widget.net.isScanning ? 'Scanning...' : 'Auto-Detect PC'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.greenAccent,
                    side: const BorderSide(color: Colors.greenAccent),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: widget.net.isConnecting
                      ? null
                      : () async {
                          _ipController.text = '127.0.0.1';
                          final ok = await widget.net.connect('127.0.0.1', 9090, pin: _pinController.text.trim());
                          if (!mounted) return;
                          if (ok) widget.onConnected();
                        },
                  icon: const Icon(Icons.usb, size: 18),
                  label: const Text('USB (127.0.0.1)'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Discovered PCs List
          if (widget.net.discoveredDevices.isNotEmpty) ...[
            const Text(
              'Discovered PC Servers (Wi-Fi / USB / Auto-Bridge):',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white70),
            ),
            const SizedBox(height: 6),
            ...widget.net.discoveredDevices.map((pc) => Card(
                  color: const Color(0xFF16162A),
                  child: ListTile(
                    leading: const Icon(Icons.computer, color: Color(0xFF00E5FF)),
                    title: Text(pc.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('${pc.ip}:${pc.port} • ${pc.latencyMs}ms'),
                    trailing: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00E5FF),
                        foregroundColor: Colors.black,
                      ),
                      onPressed: widget.net.isConnecting
                          ? null
                          : () async {
                              final ok = await widget.net.connect(pc.ip, pc.port, pin: _pinController.text.trim());
                              if (!mounted) return;
                              if (ok) widget.onConnected();
                            },
                      child: const Text('Connect'),
                    ),
                  ),
                )),
            const SizedBox(height: 14),
          ],

          // Tri-Transport Direct IP + Port + PIN Auto-Bridge Card
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF141428),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Direct Wi-Fi IP:Port + PIN Auto-Bridge (Firewall-Safe):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white70),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: _ipController,
                        style: const TextStyle(fontSize: 13),
                        decoration: const InputDecoration(
                          labelText: 'PC Local IP',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      flex: 1,
                      child: TextField(
                        controller: _portController,
                        style: const TextStyle(fontSize: 13),
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Port',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      flex: 1,
                      child: TextField(
                        controller: _pinController,
                        style: const TextStyle(fontSize: 13),
                        decoration: const InputDecoration(
                          labelText: 'PIN',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00E5FF),
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      ),
                      onPressed: widget.net.isConnecting
                          ? null
                          : () async {
                              final parsedPort = int.tryParse(_portController.text.trim());
                              if (parsedPort == null || parsedPort < 1 || parsedPort > 65535) {
                                setState(() {
                                  widget.net.lastError = 'Please enter a valid TCP port (1–65535).';
                                });
                                return;
                              }
                              final ok = await widget.net.connect(
                                _ipController.text.trim(),
                                parsedPort,
                                pin: _pinController.text.trim(),
                              );
                              if (!mounted) return;
                              if (ok) widget.onConnected();
                            },
                      child: Text(widget.net.isConnecting ? 'Connecting...' : 'Connect'),
                    ),
                  ],
                ),
                if (widget.net.lastError.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    widget.net.lastError,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 11),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
