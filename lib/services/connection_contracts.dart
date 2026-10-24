// lib/services/connection_contracts.dart
// Pure logic for Air Canvas Connection System: Subnet math, Address classification,
// QR payload encoding/decoding, Backoff schedule, HMAC-SHA256, and ADB parsing.

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

class ConnectionContracts {
  // -------------------------------------------------------------
  // 1. Subnet & Directed-Broadcast Math (Appendix A.1)
  // -------------------------------------------------------------
  static int ipv4ToUint32(String ip) {
    final parts = ip.split('.').map(int.parse).toList();
    if (parts.length != 4 || parts.any((p) => p < 0 || p > 255)) {
      throw FormatException('Invalid IPv4 address: $ip');
    }
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) & 0xffffffff;
  }

  static String uint32ToIpv4(int val) {
    return [
      (val >> 24) & 0xff,
      (val >> 16) & 0xff,
      (val >> 8) & 0xff,
      val & 0xff,
    ].join('.');
  }

  static Map<String, dynamic> computeSubnet(String ip, String mask) {
    final ipNum = ipv4ToUint32(ip);
    final maskNum = ipv4ToUint32(mask);
    final netNum = ipNum & maskNum;
    final bcastNum = (netNum | (~maskNum & 0xffffffff)) & 0xffffffff;

    return {
      'network': uint32ToIpv4(netNum),
      'broadcast': uint32ToIpv4(bcastNum),
      'isSameNetwork': (String peerIp) {
        final peerNum = ipv4ToUint32(peerIp);
        return (peerNum & maskNum) == netNum;
      },
    };
  }

  // -------------------------------------------------------------
  // 2. Address Classification (Appendix A.2)
  // -------------------------------------------------------------
  static String classifyAddress(String ip) {
    if (ip == '127.0.0.1' || ip.startsWith('127.')) return 'loopback';
    if (ip.startsWith('169.254.')) return 'link_local';

    final num = ipv4ToUint32(ip);
    // 10.0.0.0/8
    if ((num & 0xff000000) == 0x0a000000) return 'private';
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if ((num & 0xfff00000) == 0xac100000) return 'private';
    // 192.168.0.0/16
    if ((num & 0xffff0000) == 0xc0a80000) return 'private';
    // 100.64.0.0/10 (CGNAT / VPN overlay)
    if ((num & 0xffc00000) == 0x64400000) return 'cgnat_overlay';

    return 'public';
  }

  // -------------------------------------------------------------
  // 3. QR Payload Strict Parser (Appendix A.4, B6)
  // -------------------------------------------------------------
  static Map<String, dynamic> parseQrPayload(String rawUri, {bool allowInsecureRelay = false}) {
    if (rawUri.length > 512) return {'ok': false, 'error': 'TooLong'};
    if (!rawUri.startsWith('aircanvas://')) return {'ok': false, 'error': 'BadScheme'};

    final queryIdx = rawUri.indexOf('?');
    if (queryIdx == -1) return {'ok': false, 'error': 'MissingQuery'};
    final queryStr = rawUri.substring(queryIdx + 1);

    // Check duplicate keys
    final seenKeys = <String>{};
    for (final pair in queryStr.split('&')) {
      final k = pair.split('=')[0];
      if (seenKeys.contains(k)) {
        return {'ok': false, 'error': 'DuplicateKey'};
      }
      seenKeys.add(k);
    }

    try {
      final uri = Uri.parse(rawUri);
      if (uri.scheme != 'aircanvas') return {'ok': false, 'error': 'BadScheme'};
      if (uri.host != 'pair') return {'ok': false, 'error': 'BadHost'};

      final sp = uri.queryParameters;
      final v = sp['v'];
      if (v == null || v.isEmpty) return {'ok': false, 'error': 'MissingField'};
      if (v != '1') return {'ok': false, 'error': 'UnsupportedVersion'};

      final sid = sp['sid'];
      final tok = sp['tok'];
      final expStr = sp['exp'];
      final name = sp['name'] ?? '';
      final lanStr = sp['lan'] ?? '';
      final relay = sp['relay'] ?? '';

      if (sid == null || tok == null || expStr == null) {
        return {'ok': false, 'error': 'MissingField'};
      }

      final b64urlRegex = RegExp(r'^[A-Za-z0-9_-]{22}$');
      if (!b64urlRegex.hasMatch(tok) || !RegExp(r'^[A-Za-z0-9_-]{22,}$').hasMatch(sid)) {
        return {'ok': false, 'error': 'BadToken'};
      }

      if (!RegExp(r'^\d+$').hasMatch(expStr)) return {'ok': false, 'error': 'BadExp'};
      final exp = int.tryParse(expStr);
      if (exp == null) return {'ok': false, 'error': 'BadExp'};

      final List<String> lan = [];
      if (lanStr.isNotEmpty) {
        final parts = lanStr.split(',');
        if (parts.length > 4) return {'ok': false, 'error': 'TooManyCandidates'};
        for (final item in parts) {
          final pieces = item.split(':');
          if (pieces.length != 2) return {'ok': false, 'error': 'BadCandidate'};
          final ip = pieces[0];
          final port = int.tryParse(pieces[1]);
          if (port == null || port < 1 || port > 65535) {
            return {'ok': false, 'error': 'BadPort'};
          }
          final cls = classifyAddress(ip);
          if (cls != 'private' && cls != 'cgnat_overlay') {
            return {'ok': false, 'error': 'BadCandidate'};
          }
          lan.add('$ip:$port');
        }
      }

      if (relay.isNotEmpty) {
        if (!relay.startsWith('wss://') && !(allowInsecureRelay && relay.startsWith('ws://'))) {
          return {'ok': false, 'error': 'InsecureRelay'};
        }
      }

      return {
        'ok': true,
        'data': {
          'v': 1,
          'sid': sid,
          'tok': tok,
          'exp': exp,
          'name': name,
          'lan': lan,
          'relay': relay,
        }
      };
    } catch (_) {
      return {'ok': false, 'error': 'MalformedUri'};
    }
  }

  static String encodeQrPayload({
    int v = 1,
    required String sid,
    required String tok,
    required int exp,
    String? name,
    List<String> lan = const [],
    String? relay,
  }) {
    final queryParts = <String>[
      'v=$v',
      'sid=${Uri.encodeQueryComponent(sid)}',
      'tok=${Uri.encodeQueryComponent(tok)}',
      'exp=$exp',
    ];
    if (name != null && name.isNotEmpty) {
      queryParts.add('name=${Uri.encodeQueryComponent(name)}');
    }
    if (lan.isNotEmpty) {
      queryParts.add('lan=${Uri.encodeQueryComponent(lan.take(4).join(','))}');
    }
    if (relay != null && relay.isNotEmpty) {
      queryParts.add('relay=${Uri.encodeQueryComponent(relay)}');
    }
    return 'aircanvas://pair?${queryParts.join('&')}';
  }

  // -------------------------------------------------------------
  // 4. Backoff Schedule (Appendix A.5)
  // -------------------------------------------------------------
  static Map<String, double> computeBackoff(int attempt, [double Function()? rng]) {
    final double base = min(0.5 * pow(2, attempt - 1), 10.0).toDouble();
    final double r = rng != null ? rng() : 0.5;
    final double delay = base * (0.8 + 0.4 * r);
    return {
      'base': base,
      'delay': double.parse(delay.toStringAsFixed(4)),
      'min': double.parse((base * 0.8).toStringAsFixed(4)),
      'max': double.parse((base * 1.2).toStringAsFixed(4)),
    };
  }

  // -------------------------------------------------------------
  // 5. Pure SHA256 & HMAC-SHA256 (Appendix A.7)
  // -------------------------------------------------------------
  static Uint8List computeHmacSha256(Uint8List secret, Uint8List message) {
    return _HmacSha256Internal.compute(secret, message);
  }

  static String computeHmacHex(String secretHex, String nonceHex, String deviceId) {
    Uint8List parseHex(String h) {
      final list = Uint8List(h.length ~/ 2);
      for (int i = 0; i < h.length; i += 2) {
        list[i ~/ 2] = int.parse(h.substring(i, i + 2), radix: 16);
      }
      return list;
    }

    final secret = parseHex(secretHex);
    final nonce = parseHex(nonceHex);
    final prefix = Uint8List.fromList(ascii.encode('AIRCANVAS1'));
    final devId = Uint8List.fromList(utf8.encode(deviceId));

    final msg = Uint8List(prefix.length + nonce.length + devId.length);
    msg.setRange(0, prefix.length, prefix);
    msg.setRange(prefix.length, prefix.length + nonce.length, nonce);
    msg.setRange(prefix.length + nonce.length, msg.length, devId);

    final res = computeHmacSha256(secret, msg);
    return res.map((b) => b.toRadixString(16).padLeft(2, '0')).join('');
  }

  // -------------------------------------------------------------
  // 6. ADB Output Parser (Appendix D.4)
  // -------------------------------------------------------------
  static List<Map<String, String>> parseAdbDevicesOutput(String rawOutput) {
    final lines = rawOutput.split(RegExp(r'\r?\n'));
    final List<Map<String, String>> devices = [];
    bool foundHeader = false;
    final validStates = {'device', 'unauthorized', 'offline', 'authorizing', 'recovery', 'sideload', 'bootloader'};

    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;
      if (trimmed.startsWith('List of devices attached')) {
        foundHeader = true;
        continue;
      }
      if (!foundHeader) continue;

      final cols = trimmed.split(RegExp(r'\s+'));
      if (cols.length >= 2) {
        final serial = cols[0];
        final state = cols[1];
        if (serial.contains('*') || serial.contains('daemon') || !validStates.contains(state)) {
          continue;
        }

        final dev = <String, String>{'serial': serial, 'state': state};
        for (int i = 2; i < cols.length; i++) {
          if (cols[i].startsWith('model:')) {
            dev['model'] = cols[i].substring('model:'.length);
          }
        }
        devices.add(dev);
      }
    }
    return devices;
  }

  static double backoffDelay(int attempt) {
    return computeBackoff(attempt)['delay']!;
  }

  static String computeProof({
    required Uint8List secretBytes,
    required Uint8List nonceBytes,
    required String deviceId,
  }) {
    final prefix = Uint8List.fromList(ascii.encode('AIRCANVAS1'));
    final devId = Uint8List.fromList(utf8.encode(deviceId));

    final msg = Uint8List(prefix.length + nonceBytes.length + devId.length);
    msg.setRange(0, prefix.length, prefix);
    msg.setRange(prefix.length, prefix.length + nonceBytes.length, nonceBytes);
    msg.setRange(prefix.length + nonceBytes.length, msg.length, devId);

    final res = computeHmacSha256(secretBytes, msg);
    return res.map((b) => b.toRadixString(16).padLeft(2, '0')).join('');
  }

  static Uint8List hexToBytes(String hex) {
    final list = Uint8List(hex.length ~/ 2);
    for (int i = 0; i < hex.length; i += 2) {
      list[i ~/ 2] = int.parse(hex.substring(i, i + 2), radix: 16);
    }
    return list;
  }

  static Uint8List base64UrlDecode(String input) {
    String normalized = input.replaceAll('-', '+').replaceAll('_', '/');
    while (normalized.length % 4 != 0) {
      normalized += '=';
    }
    return base64.decode(normalized);
  }

  static String userFacingMessage(String code) {
    switch (code) {
      case 'BAD_TOKEN':
        return 'This code is not valid. Show a new QR on the PC.';
      case 'TOKEN_EXPIRED':
        return 'This code expired. Show a new QR on the PC.';
      case 'TOO_MANY_ATTEMPTS':
        return 'Too many tries. Wait a minute and try again.';
      case 'VERSION_MISMATCH':
        return 'Update the app (or the PC app) to the latest version.';
      case 'BUSY':
        return 'Another device is connected to this PC.';
      case 'DENIED':
        return 'The PC did not allow this device.';
      case 'REVOKED':
        return 'This device was removed. Pair again with a new QR.';
      case 'SERVER_SHUTTING_DOWN':
        return 'The PC app is closing.';
      case 'RELAY_UNAVAILABLE':
        return "Can't reach the connection service. Check your internet.";
      case 'LAN_BLOCKED':
        return "Can't reach the PC on this network. Try USB or scan the QR.";
      case 'InsecureRelay':
        return 'Relay must use secure WebSocket (wss://).';
      case 'BadScheme':
      case 'BadHost':
      case 'BadPort':
      case 'BadCandidate':
      case 'TooManyCandidates':
      case 'TooLong':
        return 'Invalid QR code format for Air Canvas.';
      default:
        return 'Connection error ($code). Please try again.';
    }
  }
}

class _HmacSha256Internal {
  static const List<int> _k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  static Uint8List hash(Uint8List data) {
    int h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    int h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    final bitLen = data.length * 8;
    final padLen = (data.length % 64 < 56) ? (56 - (data.length % 64)) : (120 - (data.length % 64));
    final padded = Uint8List(data.length + padLen + 8);
    padded.setRange(0, data.length, data);
    padded[data.length] = 0x80;
    final bd = ByteData.view(padded.buffer);
    bd.setUint64(padded.length - 8, bitLen, Endian.big);

    final w = Uint32List(64);
    for (int offset = 0; offset < padded.length; offset += 64) {
      for (int i = 0; i < 16; i++) {
        w[i] = bd.getUint32(offset + i * 4, Endian.big);
      }
      for (int i = 16; i < 64; i++) {
        final s0 = _rotr(w[i - 15], 7) ^ _rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
        final s1 = _rotr(w[i - 2], 17) ^ _rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & 0xffffffff;
      }

      int a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (int i = 0; i < 64; i++) {
        final s1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
        final ch = (e & f) ^ (~e & g);
        final t1 = (h + s1 + ch + _k[i] + w[i]) & 0xffffffff;
        final s0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
        final maj = (a & b) ^ (a & c) ^ (b & c);
        final t2 = (s0 + maj) & 0xffffffff;

        h = g; g = f; f = e; e = (d + t1) & 0xffffffff;
        d = c; c = b; b = a; a = (t1 + t2) & 0xffffffff;
      }

      h0 = (h0 + a) & 0xffffffff;
      h1 = (h1 + b) & 0xffffffff;
      h2 = (h2 + c) & 0xffffffff;
      h3 = (h3 + d) & 0xffffffff;
      h4 = (h4 + e) & 0xffffffff;
      h5 = (h5 + f) & 0xffffffff;
      h6 = (h6 + g) & 0xffffffff;
      h7 = (h7 + h) & 0xffffffff;
    }

    final out = Uint8List(32);
    final outBd = ByteData.view(out.buffer);
    outBd.setUint32(0, h0, Endian.big);
    outBd.setUint32(4, h1, Endian.big);
    outBd.setUint32(8, h2, Endian.big);
    outBd.setUint32(12, h3, Endian.big);
    outBd.setUint32(16, h4, Endian.big);
    outBd.setUint32(20, h5, Endian.big);
    outBd.setUint32(24, h6, Endian.big);
    outBd.setUint32(28, h7, Endian.big);
    return out;
  }

  static Uint8List compute(Uint8List key, Uint8List message) {
    var k = key;
    if (k.length > 64) {
      k = hash(k);
    }
    final kPad = Uint8List(64);
    kPad.setRange(0, k.length, k);

    final iPad = Uint8List(64);
    final oPad = Uint8List(64);
    for (int i = 0; i < 64; i++) {
      iPad[i] = kPad[i] ^ 0x36;
      oPad[i] = kPad[i] ^ 0x5c;
    }

    final inner = Uint8List(64 + message.length);
    inner.setRange(0, 64, iPad);
    inner.setRange(64, inner.length, message);
    final innerHash = hash(inner);

    final outer = Uint8List(64 + 32);
    outer.setRange(0, 64, oPad);
    outer.setRange(64, outer.length, innerHash);
    return hash(outer);
  }

  static int _rotr(int x, int n) => ((x >> n) | (x << (32 - n))) & 0xffffffff;
}
