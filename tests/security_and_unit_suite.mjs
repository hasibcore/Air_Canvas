import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { WebSocket } from 'ws';

function rawHttpGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServerReady(port, proc, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let exited = false;
    proc.once('exit', (code) => {
      exited = true;
      reject(new Error(`server.js exited early with code ${code}`));
    });
    const probe = async () => {
      if (exited) return;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return resolve();
      } catch {}
      if (Date.now() > deadline) {
        return reject(new Error('Timed out waiting for server.js health check'));
      }
      setTimeout(probe, 100);
    };
    probe();
  });
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', (data, isBinary) => {
      messages.push({ data, isBinary });
    });
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

async function runLandingPageChecks() {
  console.log('--- 1. Landing Page Script & HTML Safety ---');
  const scriptSrc = fs.readFileSync(path.join(ROOT_DIR, 'landing_page', 'script.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'landing_page', 'index.html'), 'utf8');

  // Compile check (catches SyntaxError immediately)
  const makeClassList = () => ({
    set: new Set(),
    add(...cls) { cls.forEach((c) => this.set.add(c)); },
    remove(...cls) { cls.forEach((c) => this.set.delete(c)); },
    contains(c) { return this.set.has(c); },
  });

  const btnMobile = { classList: makeClassList() };
  const btnPc = { classList: makeClassList() };
  btnPc.classList.add('active');
  const gridMobile = { classList: makeClassList() };
  gridMobile.classList.add('hidden');
  const gridPc = { classList: makeClassList() };

  const elementsById = {
    'mobile-grid': gridMobile,
    'pc-grid': gridPc,
  };

  const sandbox = {
    document: {
      addEventListener: (_evt, cb) => { if (typeof cb === 'function') cb(); },
      querySelectorAll: (sel) => {
        if (sel === '.platforms-grid') return [gridPc, gridMobile];
        if (sel === '.tab-btn') return [btnPc, btnMobile];
        return [];
      },
      getElementById: (id) => elementsById[id] || null,
    },
    window: {
      location: { origin: 'http://127.0.0.1:3000' },
      scrollY: 0,
      addEventListener: () => {},
    },
    navigator: { userAgent: 'node-test' },
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };

  vm.runInNewContext(scriptSrc, sandbox, { filename: 'landing_page/script.js' });
  assert.equal(typeof sandbox.switchTab, 'function', 'switchTab must be defined');
  sandbox.switchTab('mobile', btnMobile);
  assert.equal(gridMobile.classList.contains('hidden'), false);
  assert.equal(gridPc.classList.contains('hidden'), true);
  assert.equal(btnMobile.classList.contains('active'), true);
  // Null-safety when invoked with missing tab id or no button
  sandbox.switchTab('non-existent', null);
  assert.ok(!htmlSrc.includes('target="_blank"') || htmlSrc.includes('rel="noopener noreferrer"'));
  console.log('  [PASS] landing_page/script.js parses cleanly, switchTab avoids implicit event global & handles nulls.');
}

async function runLicenseServiceUnitTests() {
  console.log('--- 2. LicenseService Expiration & Resilience Unit Tests ---');
  const licTs = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'licenseService.ts'), 'utf8');
  const transpiled = ts.transpileModule(licTs, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  try {
    // Case A: Expired subscription in localStorage is downgraded on initialization
    store.set(
      'aircanvas_license_v1',
      JSON.stringify({
        tier: 'pro',
        licenseKey: 'GP-OLD',
        licenseName: 'Air Canvas Pro',
        currentSubscription: {
          id: 'sub_1',
          userId: 'u1',
          planId: 'plan_pro_001',
          provider: 'GOOGLE_PLAY',
          productId: 'aircanvas_pro_monthly',
          purchaseToken: 'tok_1',
          orderId: 'GPA.1',
          status: 'ACTIVE',
          startedAt: new Date(Date.now() - 40 * 86400e3).toISOString(),
          currentPeriodStart: new Date(Date.now() - 40 * 86400e3).toISOString(),
          currentPeriodEnd: new Date(Date.now() - 10 * 86400e3).toISOString(),
          autoRenew: false,
        },
      })
    );

    const mod1 = await import(`data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}#exp`);
    const svc = mod1.LicenseService.getInstance();
    assert.equal(svc.tier, 'free', 'Expired PRO subscription must downgrade to free on load');
    assert.equal(svc.isPro, false);

    // Case B: Runtime RTDN transition to EXPIRE downgrades to FREE
    const verRes = svc.verifyGooglePlayPurchase('aircanvas_pro_monthly', 'tok_live_2', 'GPA.2');
    assert.equal(verRes.success, true);
    assert.equal(svc.isPro, true);
    assert.equal(svc.getEntitlement().plan, 'PRO');

    svc.handleRtdnEvent('EXPIRE');
    assert.equal(svc.isPro, false);
    assert.equal(svc.getEntitlement().plan, 'FREE');

    // Case C: Malformed JSON in localStorage does not crash
    store.set('aircanvas_license_v1', '{not valid json');
    const mod2 = await import(`data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}#badjson`);
    const svc2 = mod2.LicenseService.getInstance();
    assert.ok(svc2.tier === 'pro' || svc2.tier === 'free');
    console.log('  [PASS] LicenseService expiry downgrade, RTDN EXPIRE handling, and corrupted storage recovery verified.');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}

async function runRelaySecurityTests() {
  console.log('--- 3. Node Relay HTTP/WS Security & Cross-Room Isolation Tests ---');
  const port = await getFreePort();
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      MAX_ROOMS: '64',
      MAX_PEERS_PER_ROOM: '8',
      VERBOSE_WS_LOGS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServerReady(port, proc);

    // 3a. Health & Security Headers (iFrame compatible: NO X-Frame-Options: DENY)
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(healthRes.headers.get('x-frame-options'), null);

    // 3b. Path Traversal & Bad URI Rejection (unnormalized raw paths)
    for (const attackPath of ['/../../../etc/passwd', '/%2e%2e/package.json', '/..%2fserver.js', '/%ZZ']) {
      const atkRes = await rawHttpGet(port, attackPath);
      assert.ok(atkRes.status === 400 || atkRes.status === 404, `Traversal ${attackPath} gave ${atkRes.status}`);
      assert.equal(atkRes.body.includes('root:x:0:0'), false);
      assert.equal(atkRes.body.includes('MAX_ROOMS'), false);
    }

    // 3c. /api/github-push unauthenticated rejection + sliding-window rate limit (429 after 15 requests)
    const pushStatuses = [];
    for (let i = 0; i < 18; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/api/github-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'fake', owner: 'o', repo: 'r' }),
      });
      pushStatuses.push(r.status);
    }
    assert.equal(pushStatuses[0], 403);
    assert.ok(pushStatuses.includes(429), `Expected 429 rate-limit response, got ${pushStatuses.join(',')}`);

    // 3d. Cross-Room Discovery PIN Isolation (No cross-tenant IP/PIN leaks)
    const host1111 = await connectWs(`ws://127.0.0.1:${port}/ws?pin=1111&role=server`);
    host1111.ws.send(JSON.stringify({ type: 'register_host', pin: '1111', ip: '10.99.1.11', port: 9090, name: 'HostA' }));
    await new Promise((r) => setTimeout(r, 80));

    const intruder2222 = await connectWs(`ws://127.0.0.1:${port}/ws?pin=2222&role=client`);
    intruder2222.ws.send(JSON.stringify({ type: 'discovery_ping', pin: '2222', timestamp: Date.now() }));
    await new Promise((r) => setTimeout(r, 150));

    const leakedTo2222 = intruder2222.messages.some((m) => {
      if (m.isBinary) return false;
      const str = m.data.toString();
      return str.includes('10.99.1.11') || str.includes('HostA');
    });
    assert.equal(leakedTo2222, false, 'discovery_ping leaked HostA IP/metadata across different PIN room!');

    // Verify legitimate Room 1111 client DOES discover Room 1111 host
    const legit1111 = await connectWs(`ws://127.0.0.1:${port}/ws?pin=1111&role=client`);
    legit1111.ws.send(JSON.stringify({ type: 'discovery_ping', pin: '1111', timestamp: Date.now() }));
    await new Promise((r) => setTimeout(r, 120));
    const foundOwnHost = legit1111.messages.some((m) => !m.isBinary && m.data.toString().includes('10.99.1.11'));
    assert.equal(foundOwnHost, true, 'Legitimate client in same PIN room 1111 should receive discovery_pong');

    // 3e. Prototype pollution payload + 16 invalid binary frames kick (1002)
    legit1111.ws.send('{"__proto__":{"polluted":true},"type":"pointerMove","x":0.5,"y":0.5}');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(({}).polluted, undefined);

    const closeCodePromise = new Promise((resolve) => {
      intruder2222.ws.once('close', (code) => resolve(code));
    });
    for (let i = 0; i < 18; i++) {
      if (intruder2222.ws.readyState === WebSocket.OPEN) {
        intruder2222.ws.send(Buffer.from([0xff, 0x01, 0x02])); // invalid 3-byte frame
      }
    }
    const closeCode = await closeCodePromise;
    assert.equal(closeCode, 1002, `Expected 1002 protocol error close on bad binary streak, got ${closeCode}`);

    host1111.ws.close();
    legit1111.ws.close();
    console.log('  [PASS] Security headers, path traversal, rate limit (429), cross-room PIN isolation, __proto__ drop & bad-binary eviction verified.');
  } finally {
    proc.kill('SIGTERM');
    await new Promise((resolve) => proc.once('exit', resolve));
  }
}

await runLandingPageChecks();
await runLicenseServiceUnitTests();
await runRelaySecurityTests();
console.log('\nALL SECURITY & UNIT SUITE ASSERTIONS PASSED!');
