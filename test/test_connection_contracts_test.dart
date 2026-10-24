// test/test_connection_contracts_test.dart
// Deterministic unit tests for Appendix A Connection Vectors in Dart.

import 'dart:convert';
import 'dart:io';
import '../lib/services/connection_contracts.dart';

void main() {
  final file = File('contracts/connection-vectors.json');
  if (!file.existsSync()) {
    print('ERROR: contracts/connection-vectors.json not found!');
    exitCode = 1;
    return;
  }

  final json = jsonDecode(file.readAsStringSync());
  int total = 0;
  int passed = 0;
  int failed = 0;

  void assertTest(bool condition, String message) {
    total++;
    if (condition) {
      passed++;
      print('  [PASS] $message');
    } else {
      failed++;
      print('  [FAIL] $message');
      exitCode = 1;
    }
  }

  print('================================================================');
  print('DART TEST SUITE: Appendix A Connection Contract Vectors');
  print('================================================================\n');

  // 1. Subnet & Broadcast Math (A.1)
  print('--- 1. Subnet & Broadcast Math (A.1) ---');
  for (final tc in (json['subnetMath'] as List)) {
    final res = ConnectionContracts.computeSubnet(tc['ip'], tc['mask']);
    assertTest(res['network'] == tc['expectedNetwork'], 'Network for ${tc['ip']}/${tc['mask']} == ${tc['expectedNetwork']}');
    assertTest(res['broadcast'] == tc['expectedBroadcast'], 'Broadcast for ${tc['ip']}/${tc['mask']} == ${tc['expectedBroadcast']}');
    final isSame = (res['isSameNetwork'] as bool Function(String))(tc['peer']);
    assertTest(isSame == tc['sameNetwork'], 'Same network (${tc['ip']} & ${tc['peer']}) == ${tc['sameNetwork']}');
  }

  // 2. Address Classification (A.2)
  print('\n--- 2. Address Classification (A.2) ---');
  for (final tc in (json['addressClassification'] as List)) {
    final cls = ConnectionContracts.classifyAddress(tc['ip']);
    assertTest(cls == tc['expectedClass'], 'Class of ${tc['ip']} == ${tc['expectedClass']} (got $cls)');
  }

  // 3. QR Payload Parse & Malformed (A.4)
  print('\n--- 3. QR Payload Valid & Malformed (A.4) ---');
  final validRes = ConnectionContracts.parseQrPayload(json['qrPayloads']['valid']['uri']);
  assertTest(validRes['ok'] == true, 'Valid QR URI parsed successfully');
  final vData = validRes['data'] as Map<String, dynamic>;
  final expectedV = json['qrPayloads']['valid']['expected'] as Map<String, dynamic>;
  assertTest(vData['sid'] == expectedV['sid'], 'Valid QR sid matches');
  assertTest(vData['tok'] == expectedV['tok'], 'Valid QR tok matches');
  assertTest(vData['exp'] == expectedV['exp'], 'Valid QR exp matches');
  assertTest(vData['name'] == expectedV['name'], 'Valid QR name matches');
  assertTest(jsonEncode(vData['lan']) == jsonEncode(expectedV['lan']), 'Valid QR lan candidates match');
  assertTest(vData['relay'] == expectedV['relay'], 'Valid QR relay matches');

  for (final m in (json['qrPayloads']['malformed'] as List)) {
    final mRes = ConnectionContracts.parseQrPayload(m['uri']);
    assertTest(mRes['ok'] == false, 'Malformed ${m['id']} (${m['change']}) rejected');
    assertTest(mRes['error'] == m['expectedError'], 'Malformed ${m['id']} error code \'${mRes['error']}\' == \'${m['expectedError']}\'');
  }

  // 4. Backoff Schedule (A.5)
  print('\n--- 4. Backoff Schedule & Jitter (A.5) ---');
  for (final tc in (json['backoffSchedule'] as List)) {
    final b = ConnectionContracts.computeBackoff((tc['attempt'] as num).toInt(), () => 0.5);
    assertTest(b['base'] == (tc['baseDelaySeconds'] as num).toDouble(), 'Attempt ${tc['attempt']} base delay == ${tc['baseDelaySeconds']}s');
    assertTest((b['min']! - (tc['minJitter'] as num).toDouble()).abs() < 0.001, 'Attempt ${tc['attempt']} min jitter == ${tc['minJitter']}s');
    assertTest((b['max']! - (tc['maxJitter'] as num).toDouble()).abs() < 0.001, 'Attempt ${tc['attempt']} max jitter == ${tc['maxJitter']}s');
  }

  // 5. HMAC Proof Vector (A.7)
  print('\n--- 5. HMAC-SHA256 Proof Vector (A.7) ---');
  final hmac = ConnectionContracts.computeHmacHex(
    json['hmacProof']['secretHex'],
    json['hmacProof']['nonceHex'],
    json['hmacProof']['deviceId'],
  );
  assertTest(hmac == json['hmacProof']['expectedHmacHex'], 'HMAC matches Appendix A.7: $hmac');

  // 6. ADB Output Parser Fixtures (D.4)
  print('\n--- 6. ADB Output Parser Fixtures (D.4) ---');
  for (final fix in (json['adbFixtures'] as List)) {
    final parsedDevices = ConnectionContracts.parseAdbDevicesOutput(fix['raw']);
    final expectedList = (fix['expected'] as List);
    assertTest(parsedDevices.length == expectedList.length, 'Fixture \'${fix['name']}\' parsed ${parsedDevices.length} devices');
    for (int i = 0; i < expectedList.length; i++) {
      assertTest(parsedDevices[i]['serial'] == expectedList[i]['serial'], 'Device #$i serial matches');
      assertTest(parsedDevices[i]['state'] == expectedList[i]['state'], 'Device #$i state matches');
    }
  }

  print('\n================================================================');
  print('SUMMARY: $passed / $total assertions PASSED ($failed failures).');
  print('================================================================');

  if (failed > 0) exit(1);
}
