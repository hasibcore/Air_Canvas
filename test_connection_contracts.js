// test_connection_contracts.js
// Appendix A Connection System Deterministic Test Runner (Node.js)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorsPath = path.join(__dirname, 'contracts', 'connection-vectors.json');
const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

// -------------------------------------------------------------
// 1. Pure Subnet & Directed-Broadcast Math (A.1)
// -------------------------------------------------------------
export function ipv4ToUint32(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function uint32ToIpv4(val) {
  return [
    (val >>> 24) & 0xff,
    (val >>> 16) & 0xff,
    (val >>> 8) & 0xff,
    val & 0xff,
  ].join('.');
}

export function computeSubnet(ip, mask) {
  const ipNum = ipv4ToUint32(ip);
  const maskNum = ipv4ToUint32(mask);
  const netNum = (ipNum & maskNum) >>> 0;
  const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;
  return {
    network: uint32ToIpv4(netNum),
    broadcast: uint32ToIpv4(bcastNum),
    isSameNetwork: (peerIp) => {
      const peerNum = ipv4ToUint32(peerIp);
      return (peerNum & maskNum) >>> 0 === netNum;
    },
  };
}

// -------------------------------------------------------------
// 2. Address Classification (A.2)
// -------------------------------------------------------------
export function classifyAddress(ip) {
  if (ip === '127.0.0.1' || ip.startsWith('127.')) return 'loopback';
  if (ip.startsWith('169.254.')) return 'link_local';
  
  const num = ipv4ToUint32(ip);
  // 10.0.0.0/8
  if ((num & 0xff000000) >>> 0 === 0x0a000000) return 'private';
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if ((num & 0xfff00000) >>> 0 === 0xac100000) return 'private';
  // 192.168.0.0/16
  if ((num & 0xffff0000) >>> 0 === 0xc0a80000) return 'private';
  // 100.64.0.0/10 (100.64.0.0 - 100.127.255.255) CGNAT / VPN overlay
  if ((num & 0xffc00000) >>> 0 === 0x64400000) return 'cgnat_overlay';

  return 'public';
}

// -------------------------------------------------------------
// 3. QR Payload Encoder & Strict Parser (A.4, B6)
// -------------------------------------------------------------
export function parseQrPayload(rawUri, options = { allowInsecureRelay: false }) {
  if (typeof rawUri !== 'string') return { ok: false, error: 'InvalidType' };
  if (rawUri.length > 512) return { ok: false, error: 'TooLong' };
  if (!rawUri.startsWith('aircanvas://')) return { ok: false, error: 'BadScheme' };

  // Check for duplicate query parameters
  const queryIdx = rawUri.indexOf('?');
  if (queryIdx === -1) return { ok: false, error: 'MissingQuery' };
  const queryStr = rawUri.slice(queryIdx + 1);
  const keys = new Set();
  for (const part of queryStr.split('&')) {
    const k = part.split('=')[0];
    if (keys.has(k)) {
      return { ok: false, error: 'DuplicateKey' };
    }
    keys.add(k);
  }

  try {
    const url = new URL(rawUri);
    if (url.protocol !== 'aircanvas:') return { ok: false, error: 'BadScheme' };
    if (url.host !== 'pair') return { ok: false, error: 'BadHost' };

    const sp = url.searchParams;
    const v = sp.get('v');
    if (!v) return { ok: false, error: 'MissingField' };
    if (v !== '1') return { ok: false, error: 'UnsupportedVersion' };

    const sid = sp.get('sid');
    const tok = sp.get('tok');
    const expStr = sp.get('exp');
    const name = sp.get('name') || '';
    const lanStr = sp.get('lan') || '';
    const relay = sp.get('relay') || '';

    if (!sid || !tok || !expStr) return { ok: false, error: 'MissingField' };

    // Base64url check: 22 chars unpadded for 128-bit
    const b64urlRegex = /^[A-Za-z0-9_-]{22}$/;
    if (!b64urlRegex.test(tok) || !/^[A-Za-z0-9_-]{22,}$/.test(sid)) {
      return { ok: false, error: 'BadToken' };
    }

    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || !/^\d+$/.test(expStr)) return { ok: false, error: 'BadExp' };

    // Validate LAN candidates: at most 4, valid IPv4:port
    const lan = [];
    if (lanStr) {
      const parts = lanStr.split(',');
      if (parts.length > 4) return { ok: false, error: 'TooManyCandidates' };
      for (const item of parts) {
        const [ip, portStr] = item.split(':');
        const port = parseInt(portStr, 10);
        if (!port || isNaN(port) || port < 1 || port > 65535) {
          return { ok: false, error: 'BadPort' };
        }
        const cls = classifyAddress(ip);
        if (cls !== 'private' && cls !== 'cgnat_overlay') {
          return { ok: false, error: 'BadCandidate' };
        }
        lan.push(`${ip}:${port}`);
      }
    }

    if (relay) {
      if (!relay.startsWith('wss://') && !(options.allowInsecureRelay && relay.startsWith('ws://'))) {
        return { ok: false, error: 'InsecureRelay' };
      }
    }

    return {
      ok: true,
      data: { v: 1, sid, tok, exp, name, lan, relay },
    };
  } catch {
    return { ok: false, error: 'MalformedUri' };
  }
}

export function encodeQrPayload({ v = 1, sid, tok, exp, name, lan = [], relay }) {
  const lanEncoded = lan.slice(0, 4).join(',');
  const params = new URLSearchParams();
  params.set('v', String(v));
  params.set('sid', sid);
  params.set('tok', tok);
  params.set('exp', String(exp));
  if (name) params.set('name', name);
  if (lanEncoded) params.set('lan', lanEncoded);
  if (relay) params.set('relay', relay);
  return `aircanvas://pair?${params.toString()}`;
}

// -------------------------------------------------------------
// 4. Backoff Schedule (A.5)
// -------------------------------------------------------------
export function computeBackoffDelay(attempt, rng = () => 0.5) {
  // delay(n) = min(0.5 * 2^(n-1), 10)
  const base = Math.min(0.5 * Math.pow(2, attempt - 1), 10);
  // uniform jitter of +- 20%
  // jitter range: [0.8 * base, 1.2 * base]
  const jitterFactor = 0.8 + 0.4 * rng();
  return {
    base,
    delay: Number((base * jitterFactor).toFixed(4)),
    min: Number((base * 0.8).toFixed(4)),
    max: Number((base * 1.2).toFixed(4)),
  };
}

// -------------------------------------------------------------
// 5. HMAC Proof Vector (A.7)
// -------------------------------------------------------------
export function computeHmacProof(secretHex, nonceHex, deviceId) {
  const secret = Buffer.from(secretHex, 'hex');
  const nonce = Buffer.from(nonceHex, 'hex');
  const prefix = Buffer.from('AIRCANVAS1', 'ascii');
  const devIdBuf = Buffer.from(deviceId, 'utf8');
  
  const message = Buffer.concat([prefix, nonce, devIdBuf]);
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

// -------------------------------------------------------------
// 6. ADB Output Parser (D.4)
// -------------------------------------------------------------
export function parseAdbDevicesOutput(rawOutput) {
  const lines = rawOutput.split(/\r?\n/);
  const devices = [];
  let foundHeader = false;
  const validStates = new Set(['device', 'unauthorized', 'offline', 'authorizing', 'recovery', 'sideload', 'bootloader']);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('List of devices attached')) {
      foundHeader = true;
      continue;
    }
    if (!foundHeader) continue;

    const cols = trimmed.split(/\s+/);
    if (cols.length >= 2) {
      const serial = cols[0];
      const state = cols[1];
      if (serial.includes('*') || serial.includes('daemon') || !validStates.has(state)) continue;
      
      const dev = { serial, state };
      for (let i = 2; i < cols.length; i++) {
        if (cols[i].startsWith('model:')) {
          dev.model = cols[i].slice('model:'.length);
        }
      }
      devices.push(dev);
    }
  }
  return devices;
}


// -------------------------------------------------------------
// 7. Token & PIN Lifecycle Manager with Injected Clock (A.6, B5)
// -------------------------------------------------------------
export class PairingTokenManager {
  constructor(clock = () => Date.now(), tokenTtlMs = 120000, maxPinAttempts = 5) {
    this.clock = clock;
    this.tokenTtlMs = tokenTtlMs;
    this.maxPinAttempts = maxPinAttempts;
    this.activeTokens = new Map(); // tokHash -> { sid, expiresAt, burned: false }
    this.activePins = new Map(); // pin -> { attempts: 0, expiresAt, burned: false }
  }

  registerToken(sid, rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.activeTokens.set(hash, {
      sid,
      expiresAt: this.clock() + this.tokenTtlMs,
      burned: false,
    });
    return hash;
  }

  registerPin(pin) {
    this.activePins.set(pin, {
      attempts: 0,
      expiresAt: this.clock() + this.tokenTtlMs,
      burned: false,
    });
  }

  verifyAndConsumeToken(sid, rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const entry = this.activeTokens.get(hash);
    if (!entry) return { ok: false, error: 'BAD_TOKEN' };
    if (entry.burned) return { ok: false, error: 'BAD_TOKEN' };
    if (this.clock() > entry.expiresAt) return { ok: false, error: 'TOKEN_EXPIRED' };
    if (entry.sid !== sid) return { ok: false, error: 'BAD_TOKEN' };

    // Single-use: burn atomically
    entry.burned = true;
    this.activeTokens.delete(hash);
    return { ok: true };
  }

  verifyPin(pin) {
    const entry = this.activePins.get(pin);
    if (!entry || entry.burned) return { ok: false, error: 'BAD_TOKEN' };
    if (this.clock() > entry.expiresAt) return { ok: false, error: 'TOKEN_EXPIRED' };

    entry.attempts++;
    if (entry.attempts > this.maxPinAttempts) {
      entry.burned = true;
      return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
    }
    return { ok: true };
  }
}

// =============================================================
// RUN DETERMINISTIC VECTORS
// =============================================================
console.log('================================================================');
console.log('TEST SUITE: Appendix A Connection Contract Vectors (Node.js)');
console.log('================================================================\n');

// 1. Subnet & Broadcast Math
console.log('--- 1. Subnet & Broadcast Math (A.1) ---');
for (const tc of vectors.subnetMath) {
  const res = computeSubnet(tc.ip, tc.mask);
  assert(res.network === tc.expectedNetwork, `Network for ${tc.ip}/${tc.mask} == ${tc.expectedNetwork}`);
  assert(res.broadcast === tc.expectedBroadcast, `Broadcast for ${tc.ip}/${tc.mask} == ${tc.expectedBroadcast}`);
  assert(res.isSameNetwork(tc.peer) === tc.sameNetwork, `Same network (${tc.ip} & ${tc.peer}) == ${tc.sameNetwork}`);
}

// 2. Address Classification
console.log('\n--- 2. Address Classification (A.2) ---');
for (const tc of vectors.addressClassification) {
  const cls = classifyAddress(tc.ip);
  assert(cls === tc.expectedClass, `Class of ${tc.ip} == ${tc.expectedClass} (got ${cls})`);
}

// 3. QR Payload Parse & Validation
console.log('\n--- 3. QR Payload Valid & Malformed (A.4) ---');
const validRes = parseQrPayload(vectors.qrPayloads.valid.uri);
assert(validRes.ok === true, 'Valid QR URI parsed successfully');
assert(validRes.data.sid === vectors.qrPayloads.valid.expected.sid, 'Valid QR sid matches');
assert(validRes.data.tok === vectors.qrPayloads.valid.expected.tok, 'Valid QR tok matches');
assert(validRes.data.exp === vectors.qrPayloads.valid.expected.exp, 'Valid QR exp matches');
assert(validRes.data.name === vectors.qrPayloads.valid.expected.name, 'Valid QR name matches');
assert(JSON.stringify(validRes.data.lan) === JSON.stringify(vectors.qrPayloads.valid.expected.lan), 'Valid QR lan candidates match');
assert(validRes.data.relay === vectors.qrPayloads.valid.expected.relay, 'Valid QR relay matches');

for (const m of vectors.qrPayloads.malformed) {
  const mRes = parseQrPayload(m.uri);
  assert(mRes.ok === false, `Malformed ${m.id} (${m.change}) rejected`);
  assert(mRes.error === m.expectedError, `Malformed ${m.id} error code '${mRes.error}' == '${m.expectedError}'`);
}

// 4. Backoff Schedule
console.log('\n--- 4. Backoff Schedule & Jitter (A.5) ---');
for (const tc of vectors.backoffSchedule) {
  const b = computeBackoffDelay(tc.attempt, () => 0.5);
  assert(b.base === tc.baseDelaySeconds, `Attempt ${tc.attempt} base delay == ${tc.baseDelaySeconds}s`);
  assert(Math.abs(b.min - tc.minJitter) < 0.001, `Attempt ${tc.attempt} min jitter == ${tc.minJitter}s`);
  assert(Math.abs(b.max - tc.maxJitter) < 0.001, `Attempt ${tc.attempt} max jitter == ${tc.maxJitter}s`);
}

// 5. HMAC Proof Vector
console.log('\n--- 5. HMAC-SHA256 Proof Vector (A.7) ---');
const hmac = computeHmacProof(
  vectors.hmacProof.secretHex,
  vectors.hmacProof.nonceHex,
  vectors.hmacProof.deviceId
);
assert(hmac === vectors.hmacProof.expectedHmacHex, `HMAC matches Appendix A.7: ${hmac}`);

// 6. ADB Output Parser Fixtures
console.log('\n--- 6. ADB Output Parser Fixtures (D.4) ---');
for (const fix of vectors.adbFixtures) {
  const parsedDevices = parseAdbDevicesOutput(fix.raw);
  assert(parsedDevices.length === fix.expected.length, `Fixture '${fix.name}' parsed ${parsedDevices.length} devices`);
  for (let i = 0; i < fix.expected.length; i++) {
    assert(parsedDevices[i].serial === fix.expected[i].serial, `Device #${i} serial matches`);
    assert(parsedDevices[i].state === fix.expected[i].state, `Device #${i} state matches`);
  }
}

// 7. Token & PIN Lifecycle Manager with Injected Clock
console.log('\n--- 7. Token & PIN Lifecycle with Fake Clock (A.6, B5) ---');
let fakeTime = 1000000;
const mgr = new PairingTokenManager(() => fakeTime, 120000, 5);
const sid = 'Zk9mPq2WvB7nXc4TdR1uHA';
const tok = 'q3Vf0xTn8Zl2mA9bKcWd4g';
mgr.registerToken(sid, tok);

// Valid consume at TTL - 1 ms
fakeTime = 1000000 + 119999;
const consume1 = mgr.verifyAndConsumeToken(sid, tok);
assert(consume1.ok === true, 'Token consumes successfully before TTL (at TTL - 1 ms)');

// Single-use: attempt consume again must fail
const consume2 = mgr.verifyAndConsumeToken(sid, tok);
assert(consume2.ok === false && consume2.error === 'BAD_TOKEN', 'Token cannot be reused (single-use burned)');

// Expiry test on second token
const tok2 = 'secondToken_1234567890';
mgr.registerToken(sid, tok2);
fakeTime += 120001; // Past TTL
const consumeExpired = mgr.verifyAndConsumeToken(sid, tok2);
assert(consumeExpired.ok === false && consumeExpired.error === 'TOKEN_EXPIRED', 'Token expires on server clock at TTL');

// PIN attempt counter & lockout test
mgr.registerPin('123456');
// Time is currently within TTL of registerPin
for (let i = 1; i <= 5; i++) {
  const pRes = mgr.verifyPin('123456');
  assert(pRes.ok === true, `PIN attempt #${i} accepted within threshold`);
}
// 6th attempt must trigger TOO_MANY_ATTEMPTS
const pResLocked = mgr.verifyPin('123456');
assert(pResLocked.ok === false && pResLocked.error === 'TOO_MANY_ATTEMPTS', 'PIN locks out after exceeding max attempts');


console.log('\n================================================================');
console.log(`SUMMARY: ${passed} / ${total} assertions PASSED (${failed} failures).`);
console.log('================================================================');

if (failed > 0) process.exit(1);
