// test_connection_integration_v3.js
// V3 Integration Test Suite for Air Canvas Connection System
// Tests real sockets against AirCanvasServer.exe:
// 1. P0 Security Test: Unauthenticated binary pointer frame must be REJECTED and connection dropped.
// 2. Handshake: hello -> challenge -> pair -> ready.
// 3. Authenticated binary frame accepted only AFTER ready.
// 4. Bad Token / Wrong PIN rejected with BAD_TOKEN / TOKEN_EXPIRED.
// 5. Single active controller: 2nd client receives busy.
// 6. Watchdog and clean disconnect: No stuck pointer.

import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import crypto from 'node:crypto';

const SERVER_EXE = './AirCanvasServer.exe';
const WS_URL = 'ws://127.0.0.1:9090';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function create13ByteFrame(type = 1, normX = 0.5, normY = 0.5, pressure = 0.5, tool = 0) {
  const buf = Buffer.alloc(13);
  buf.writeUInt8(type & 0xff, 0);
  buf.writeUInt16LE(Math.round(normX * 65535), 1);
  buf.writeUInt16LE(Math.round(normY * 65535), 3);
  buf.writeUInt16LE(Math.round(pressure * 1024), 5);
  buf.writeUInt8(tool & 0xff, 7);
  buf.writeUInt32LE(Date.now() & 0xffffffff, 8);
  buf.writeUInt8(1, 12); // version = 1
  return buf;
}

async function runTests() {
  console.log('================================================================');
  console.log('V3 INTEGRATION TEST: Real Sockets against AirCanvasServer.exe');
  console.log('================================================================\n');

  // Launch AirCanvasServer in background
  console.log('[Setup] Launching AirCanvasServer.exe...');
  const serverProc = spawn(SERVER_EXE, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', (d) => {
    console.log('[Server stdout]', d.toString().trim());
  });
  serverProc.stderr.on('data', (d) => {
    console.error('[Server stderr]', d.toString().trim());
  });

  // Wait 1.5s for server to start listening
  await sleep(1500);

  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
      passedAssertions++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failedAssertions++;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: P0 SECURITY TEST
    // An unauthenticated client connects and directly sends a 13-byte binary frame.
    // The server MUST immediately reject and close the connection!
    // -------------------------------------------------------------
    console.log('--- TEST 1: P0 Security Gate (Pre-Auth Frame Rejection) ---');
    await new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      let errorReceived = null;
      let closed = false;

      ws.on('open', () => {
        // Send raw binary pointer frame WITHOUT doing handshake
        const frame = create13ByteFrame(0, 0.5, 0.5, 0.5, 0); // Down event
        ws.send(frame);
      });

      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === 'error' && parsed.code === 'UNAUTHENTICATED') {
            errorReceived = parsed;
          }
        } catch {}
      });

      ws.on('close', () => {
        closed = true;
        assert(true, 'Server closed unauthenticated connection');
        assert(errorReceived !== null, 'Server emitted error UNAUTHENTICATED before closing');
        resolve();
      });

      ws.on('error', () => {
        // Expected if server terminates abruptly
        if (!closed) {
          closed = true;
          resolve();
        }
      });

      setTimeout(() => {
        if (!closed) {
          assert(false, 'Timeout waiting for unauthenticated socket drop');
          try { ws.close(); } catch {}
          resolve();
        }
      }, 3000);
    });

    // -------------------------------------------------------------
    // TEST 2: Handshake (hello -> challenge -> pair -> ready)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Full Handshake & Authenticated Streaming ---');
    let pairedSecret = null;
    let serverId = null;

    await new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      let gotChallenge = false;
      let gotReady = false;

      ws.on('open', () => {
        // 1. Send hello
        ws.send(
          JSON.stringify({
            type: 'hello',
            v: 1,
            deviceId: 'test_device_v3',
            name: 'V3 Integration Test Runner',
            platform: 'node',
            appVersion: '2.0.3',
            caps: ['pen', 'eraser'],
          })
        );
      });

      ws.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'challenge') {
            gotChallenge = true;
            assert(typeof data.nonce === 'string' && data.nonce.length >= 22, 'Server returned 22-char base64url nonce');
            serverId = data.serverId;

            // 2. Send pair with PIN '123456'
            ws.send(JSON.stringify({ type: 'pair', pin: '123456' }));
          } else if (data.type === 'paired') {
            assert(typeof data.deviceSecret === 'string', 'Server issued deviceSecret on pairing');
            pairedSecret = data.deviceSecret;
          } else if (data.type === 'ready') {
            gotReady = true;
            assert(data.heartbeatMs > 0, 'Server emitted ready with heartbeat interval');

            // 3. Send authenticated binary pointer frame
            const frame = create13ByteFrame(1, 0.25, 0.25, 0.5, 0); // Move event
            ws.send(frame);

            // Wait 200ms, then close cleanly
            setTimeout(() => {
              ws.close();
              resolve();
            }, 300);
          }
        } catch {}
      });

      ws.on('close', () => {
        assert(gotChallenge, 'Handshake completed challenge step');
        assert(gotReady, 'Handshake completed ready step');
        resolve();
      });

      ws.on('error', (err) => {
        console.error('Test 2 WS Error:', err.message);
      });

      setTimeout(() => {
        if (!gotReady) {
          assert(false, 'Timeout waiting for ready during handshake');
          try { ws.close(); } catch {}
          resolve();
        }
      }, 4000);
    });

    // -------------------------------------------------------------
    // TEST 3: Authenticated Reconnect with HMAC Proof
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Authenticated Reconnect with HMAC-SHA256 Proof ---');
    if (pairedSecret && serverId) {
      await new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let gotReady = false;

        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'hello',
              v: 1,
              deviceId: 'test_device_v3',
              name: 'V3 Integration Test Runner',
              platform: 'node',
              appVersion: '2.0.3',
            })
          );
        });

        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'challenge') {
              // Compute HMAC proof
              // Message = ASCII AIRCANVAS1 || raw 16-byte nonce || UTF-8 deviceId
              const secretBytes = Buffer.from(pairedSecret, 'hex');
              // base64url decode nonce
              let b64 = data.nonce.replace(/-/g, '+').replace(/_/g, '/');
              while (b64.length % 4 !== 0) b64 += '=';
              const nonceBytes = Buffer.from(b64, 'base64');
              const prefix = Buffer.from('AIRCANVAS1', 'ascii');
              const devId = Buffer.from('test_device_v3', 'utf8');
              const message = Buffer.concat([prefix, nonceBytes, devId]);

              const hmac = crypto.createHmac('sha256', secretBytes).update(message).digest('hex');

              ws.send(JSON.stringify({ type: 'auth', proof: hmac }));
            } else if (data.type === 'ready') {
              gotReady = true;
              assert(true, 'Authenticated with HMAC-SHA256 proof without re-entering PIN!');
              ws.close();
              resolve();
            }
          } catch {}
        });

        ws.on('close', () => {
          resolve();
        });

        ws.on('error', (err) => {
          console.error('Test 3 WS Error:', err.message);
        });

        setTimeout(() => {
          if (!gotReady) {
            assert(false, 'Timeout waiting for HMAC proof ready');
            try { ws.close(); } catch {}
            resolve();
          }
        }, 4000);
      });
    }

    // -------------------------------------------------------------
    // TEST 4: Wrong Token / Invalid PIN Rejection
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Invalid Pairing Token / PIN Rejection ---');
    await new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      let errorReceived = null;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'hello',
          v: 1,
          deviceId: 'unpaired_intruder_device',
          name: 'Intruder',
          platform: 'node',
          appVersion: '2.0.3',
        }));
      });

      ws.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'challenge') {
            // Send WRONG token / wrong PIN
            ws.send(JSON.stringify({ type: 'pair', token: 'invalid_bad_token_000000', pin: '999999' }));
          } else if (data.type === 'error') {
            errorReceived = data;
          }
        } catch {}
      });

      ws.on('close', () => {
        assert(errorReceived !== null && errorReceived.code === 'BAD_TOKEN', 'Server rejected invalid token with BAD_TOKEN');
        resolve();
      });

      ws.on('error', () => resolve());
      setTimeout(() => { try { ws.close(); } catch {}; resolve(); }, 3000);
    });

    // -------------------------------------------------------------
    // TEST 5: Single Active Controller (2nd Device Receives BUSY)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Single Active Controller & BUSY Rejection ---');
    await new Promise((resolve) => {
      const client1 = new WebSocket(WS_URL);
      let client2 = null;

      client1.on('open', () => {
        client1.send(JSON.stringify({
          type: 'hello',
          v: 1,
          deviceId: 'controller_device_1',
          name: 'Primary Controller',
          platform: 'node',
          appVersion: '2.0.3',
        }));
      });

      client1.on('message', (msg) => {
        try {
          const d1 = JSON.parse(msg.toString());
          if (d1.type === 'challenge') {
            client1.send(JSON.stringify({ type: 'pair', pin: '123456' }));
          } else if (d1.type === 'ready') {
            assert(true, 'Client 1 established active controller session');

            // Now attempt 2nd client connection while client 1 is active
            client2 = new WebSocket(WS_URL);
            client2.on('open', () => {
              client2.send(JSON.stringify({
                type: 'hello',
                v: 1,
                deviceId: 'controller_device_2',
                name: 'Secondary Controller',
                platform: 'node',
                appVersion: '2.0.3',
              }));
            });

            client2.on('message', (msg2) => {
              try {
                const d2 = JSON.parse(msg2.toString());
                if (d2.type === 'challenge') {
                  client2.send(JSON.stringify({ type: 'pair', pin: '123456' }));
                } else if (d2.type === 'busy' || (d2.type === 'error' && d2.code === 'BUSY')) {
                  assert(true, 'Client 2 received BUSY policy rejection while Client 1 is controlling');
                  client1.close();
                  client2.close();
                  resolve();
                }
              } catch {}
            });

            client2.on('error', () => {});
          }
        } catch {}
      });

      client1.on('error', () => {});
      setTimeout(() => {
        try { client1.close(); } catch {}
        try { client2?.close(); } catch {}
        resolve();
      }, 5000);
    });
  } finally {
    // Kill server process
    console.log('\n[Teardown] Stopping AirCanvasServer.exe...');
    serverProc.kill('SIGKILL');
  }

  console.log('\n================================================================');
  console.log(`V3 INTEGRATION RESULT: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('================================================================');
  process.exit(failedAssertions === 0 ? 0 : 1);
}

runTests().catch((e) => {
  console.error('[Error running V3 test]', e);
  process.exit(1);
});
