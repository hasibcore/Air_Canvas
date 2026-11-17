// ==============================================================================
// tests/e2e_drawing_and_connection_qa.mjs
// Live Two-Device WebSocket + Production DrawingEngine / TargetGeometryManager QA
// Tests real running server on 127.0.0.1:3000 (or custom PORT/TARGET_BASE_URL)
// ==============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_HTTP = process.env.TARGET_BASE_URL || 'http://127.0.0.1:3000';
const TARGET_WS = TARGET_HTTP.replace(/^http/, 'ws');

// Transpile production TypeScript modules cleanly into a temp ESM tree
const tmpSrcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aircanvas-qa-'));
process.on('exit', () => {
  try {
    fs.rmSync(tmpSrcRoot, { recursive: true, force: true });
  } catch {}
});

function emitTsTree(subdir = '.') {
  const files = [
    'types/index.ts',
    'services/oneEuroFilter.ts',
    'services/pressureCurves.ts',
    'services/targetGeometryManager.ts',
    'services/drawingEngine.ts',
    'services/connectionManager.ts',
  ];
  const urls = {};
  for (const relSrcPath of files) {
    const absIn = path.join(ROOT_DIR, 'src', relSrcPath);
    const absOut = path.join(tmpSrcRoot, subdir, relSrcPath.replace(/\.ts$/, '.mjs'));
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    let code = fs.readFileSync(absIn, 'utf8');
    code = code.replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.mjs$2');
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    fs.writeFileSync(absOut, transpiled, 'utf8');
    urls[relSrcPath] = pathToFileURL(absOut).href;
  }
  return urls;
}

const baseUrls = emitTsTree('.');
const tgmUrl = baseUrls['services/targetGeometryManager.ts'];
const drawingEngineUrl = baseUrls['services/drawingEngine.ts'];
const connMgrUrl = baseUrls['services/connectionManager.ts'];

// Minimal localStorage stub so DrawingEngine singleton loads cleanly in Node
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
};

const { DrawingEngine } = await import(drawingEngineUrl);
const { TargetGeometryManager } = await import(tgmUrl);
const { ConnectionManager } = await import(connMgrUrl);

function waitFor(predicate, timeoutMs = 4000, label = 'condition') {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for ${label}`));
      }
      setTimeout(check, 10);
    };
    check();
  });
}

function connectWsClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const jsonMsgs = [];
    const binFrames = [];
    ws.on('message', (data, isBin) => {
      if (isBin) {
        binFrames.push(Buffer.from(data));
      } else {
        try {
          jsonMsgs.push(JSON.parse(data.toString('utf8')));
        } catch {}
      }
    });
    ws.once('open', () => resolve({ ws, jsonMsgs, binFrames }));
    ws.once('error', reject);
  });
}

console.log('================================================================');
console.log(`AIR CANVAS LIVE QA SUITE -> ${TARGET_HTTP}`);
console.log('================================================================\n');

// ------------------------------------------------------------------------------
// 1. Live Server Health, Discovery & Dynamic PIN Room Switch QA
// ------------------------------------------------------------------------------
console.log('--- QA 1: Live HTTP /health, /api/network-info, Discovery & Dynamic PIN Switch ---');
{
  const healthRes = await fetch(`${TARGET_HTTP}/health`);
  assert.equal(healthRes.status, 200, '/health must return 200');
  const healthJson = await healthRes.json();
  assert.equal(healthJson.status, 'ok');

  const netRes = await fetch(`${TARGET_HTTP}/api/network-info`);
  assert.equal(netRes.status, 200, '/api/network-info must return 200');
  const netJson = await netRes.json();
  assert.equal(typeof netJson.ip, 'string');
  assert.ok(Array.isArray(netJson.allIps) && netJson.allIps.includes('127.0.0.1'));

  const pinA = '7101';
  const pinB = '7102';

  // Client joins empty room pinA and sends discovery_ping -> must NOT receive phantom host!
  const probeClient = await connectWsClient(`${TARGET_WS}/ws?pin=${pinA}&role=client&name=QA-Phone`);
  probeClient.ws.send(JSON.stringify({ type: 'discovery_ping', pin: pinA, timestamp: Date.now() }));
  await waitFor(
    () => probeClient.jsonMsgs.some((m) => m.type === 'discovery_empty' && m.pin === pinA),
    3000,
    'discovery_empty on empty room'
  );
  assert.equal(
    probeClient.jsonMsgs.some((m) => m.type === 'discovery_pong'),
    false,
    'Empty PIN room must never return phantom discovery_pong'
  );

  // PC Host starts on default room and switches dynamically via register_host to pinA!
  const host = await connectWsClient(`${TARGET_WS}/ws?pin=9999&role=server&name=QA-PC-Host&ip=192.168.1.55&port=9090`);
  host.ws.send(
    JSON.stringify({
      type: 'register_host',
      pin: pinA,
      name: 'QA-Real-PC-Host',
      ip: '192.168.1.55',
      port: 9090,
    })
  );

  await waitFor(
    () =>
      host.jsonMsgs.some((m) => m.type === 'room_joined' && m.pin === pinA && m.peerCount === 2) &&
      probeClient.jsonMsgs.some((m) => m.type === 'peer_connected' && m.pin === pinA && m.role === 'server'),
    3000,
    'dynamic register_host room switch & peer_connected'
  );

  // Now discovery_ping from probeClient finds the real registered PC host
  probeClient.ws.send(JSON.stringify({ type: 'discovery_ping', pin: pinA, timestamp: Date.now() }));
  await waitFor(
    () => probeClient.jsonMsgs.some((m) => m.type === 'discovery_pong' && m.ip === '192.168.1.55'),
    3000,
    'discovery_pong for real host'
  );

  // Isolated client on pinB must NOT see pinA's host
  const isolatedClient = await connectWsClient(`${TARGET_WS}/ws?pin=${pinB}&role=client&name=Intruder`);
  isolatedClient.ws.send(JSON.stringify({ type: 'discovery_ping', pin: pinB, timestamp: Date.now() }));
  await waitFor(
    () => isolatedClient.jsonMsgs.some((m) => m.type === 'discovery_empty'),
    3000,
    'pinB isolated discovery_empty'
  );

  // Ping / Pong link stability check
  const pTs = Date.now();
  probeClient.ws.send(JSON.stringify({ type: 'ping', timestamp: pTs }));
  await waitFor(
    () => probeClient.jsonMsgs.some((m) => m.type === 'pong' && m.timestamp === pTs),
    3000,
    'ping/pong'
  );

  probeClient.ws.close();
  isolatedClient.ws.close();
  host.ws.close();
  console.log('  [PASS] QA 1: Health, network-info, non-phantom discovery, dynamic PIN switch, PIN isolation, and pong verified.');
}

// ------------------------------------------------------------------------------
// 2. Live Two-Device Drawing TEST A & TEST B over Port 3000 WS Relay + Production Engine
// ------------------------------------------------------------------------------
console.log('\n--- QA 2: TEST A (Lines, Diagonals, Circle, Square, Curves, Handwriting) & TEST B (Corners + Center) ---');
{
  const qaPin = '884422';
  const pcHostWs = await connectWsClient(`${TARGET_WS}/ws?pin=${qaPin}&role=server&name=PC-Studio&ip=127.0.0.1&port=9090`);
  const mobileWs = await connectWsClient(`${TARGET_WS}/ws?pin=${qaPin}&role=client&name=Mobile-Pad`);

  await waitFor(
    () => pcHostWs.jsonMsgs.some((m) => m.type === 'peer_connected') &&
          mobileWs.jsonMsgs.some((m) => m.type === 'peer_connected'),
    3000,
    'two-device WS pairing on live relay'
  );

  // Mobile DrawingEngine (1920x1080 logical surface, rawDirect for deterministic corner/shape check + proAdaptive test below)
  const mobileEngine = DrawingEngine.getInstance();
  mobileEngine.clearCanvas();
  mobileEngine.updateCanvasDimensions(1920, 1080);
  mobileEngine.precisionMode = 'rawDirect';
  mobileEngine.enablePressureSmoothing = false;

  // PC Receiver DrawingEngine + TargetGeometryManager (1920x1080 MONITOR + secondary negative monitor test)
  const pcTgm = new TargetGeometryManager();
  pcTgm.updateSourceGeometry(1920, 1080, 1.0);
  pcTgm.selectMonitor('MON-PRIMARY-1080P');
  pcTgm.setTargetMode('MONITOR');

  // Wire Mobile DrawingEngine -> 13-byte binary WebSocket stream -> Live /ws relay on port 3000 -> PC host!
  let activeMobileWs = mobileWs;
  const sentEvents = [];
  mobileEngine.onInputGenerated = (ev) => {
    sentEvents.push(ev);
    const typeCode = ev.type === 'pointerDown' ? 0 : ev.type === 'pointerMove' ? 1 : ev.type === 'pointerUp' ? 2 : 3;
    const frame = ConnectionManager.encodeBinaryFrame({
      type: typeCode,
      normX: ev.x,
      normY: ev.y,
      pressure: ev.pressure,
      tool: ev.brushMode === 'eraser' ? 1 : 0,
      timestamp: (ev.timestamp || Date.now()) >>> 0,
      version: 1,
    });
    activeMobileWs.ws.send(frame, { binary: true });
  };

  // Helper to drain incoming PC binary frames into a standalone stroke list & TGM pixel projection
  const decodedPcPoints = [];
  let pcExpectedCount = 0;
  async function flushBinaryToPc(expectedDelta) {
    pcExpectedCount += expectedDelta;
    await waitFor(() => pcHostWs.binFrames.length >= pcExpectedCount, 4000, `PC binary count=${pcExpectedCount}`);
    const out = [];
    while (decodedPcPoints.length < pcHostWs.binFrames.length) {
      const buf = pcHostWs.binFrames[decodedPcPoints.length];
      const dec = ConnectionManager.validateAndDecodeBinaryFrame(buf);
      assert.equal(dec.ok, true, 'Live binary frame must decode cleanly');
      for (const f of dec.frames) {
        const proj = pcTgm.projectNormalizedPoint(f.normX, f.normY);
        assert.equal(proj.ok, true);
        const rec = { ...f, pxX: proj.targetX, pxY: proj.targetY };
        decodedPcPoints.push(rec);
        out.push(rec);
      }
    }
    return out;
  }

  // --- TEST B: Coordinate Accuracy (Center, Top-Left, Top-Right, Bottom-Left, Bottom-Right) ---
  const testBCorners = [
    { name: 'Center', x: 959.5, y: 539.5, expectedPx: [960, 540] },
    { name: 'TopLeft', x: 0, y: 0, expectedPx: [0, 0] },
    { name: 'TopRight', x: 1919, y: 0, expectedPx: [1919, 0] },
    { name: 'BottomLeft', x: 0, y: 1079, expectedPx: [0, 1079] },
    { name: 'BottomRight', x: 1919, y: 1079, expectedPx: [1919, 1079] },
  ];

  for (const pt of testBCorners) {
    mobileEngine.onPointerDown(pt.x, pt.y, 0.7, 'stylus', 1);
    mobileEngine.onPointerUp('stylus', 1, 0, pt.x, pt.y);
  }
  const bFrames = await flushBinaryToPc(testBCorners.length * 2);
  for (let i = 0; i < testBCorners.length; i++) {
    const downF = bFrames[i * 2];
    const upF = bFrames[i * 2 + 1];
    assert.equal(downF.eventType, 'pointerDown');
    assert.equal(upF.eventType, 'pointerUp');
    assert.equal(upF.pressure, 0, 'BUG FIX CHECK: pointerUp MUST emit pressure === 0');
    assert.ok(
      Math.abs(downF.pxX - testBCorners[i].expectedPx[0]) <= 1 &&
        Math.abs(downF.pxY - testBCorners[i].expectedPx[1]) <= 1,
      `TEST B ${testBCorners[i].name} mismatch: expected ${testBCorners[i].expectedPx}, got [${downF.pxX}, ${downF.pxY}]`
    );
  }
  console.log('  [PASS] TEST B: Center (960,540), TL (0,0), TR (1919,0), BL (0,1079), BR (1919,1079) <= 1px across live relay.');

  // --- TEST A.1: Fast 2-Point Straight Line & Diagonal (Final pointerUp coordinate preservation!) ---
  mobileEngine.onPointerDown(100, 100, 0.65, 'stylus', 2);
  // Jump straight to (800, 100) on pointerUp without intermediate pointerMove (fast release test!)
  mobileEngine.onPointerUp('stylus', 2, 0, 800, 100);
  const lastLineStroke = mobileEngine.strokes[mobileEngine.strokes.length - 1];
  assert.equal(lastLineStroke.points.length, 2, 'BUG FIX CHECK: pointerUp(finalX, finalY) must append final endpoint');
  assert.equal(Math.round(lastLineStroke.points[1].x), 800);
  assert.equal(Math.round(lastLineStroke.points[1].y), 100);
  const lineFrames = await flushBinaryToPc(2);
  assert.ok(Math.abs(lineFrames[1].pxX - 800) <= 1 && Math.abs(lineFrames[1].pxY - 100) <= 1);

  // Diagonal line across canvas
  mobileEngine.onPointerDown(100, 100, 0.7, 'stylus', 3);
  for (let s = 1; s <= 10; s++) {
    mobileEngine.onPointerMove(100 + s * 160, 100 + s * 90, 0.7, 'stylus', 3);
  }
  mobileEngine.onPointerUp('stylus', 3, 0, 1700, 1000);
  await flushBinaryToPc(11); // down + 10 moves (last move is at 1700,1000 so pointerUp dist=0 doesn't duplicate point in stroke, still emits up event)
  await flushBinaryToPc(1);

  // --- TEST A.2: Square (4 corners closed via pointerUp at final closing corner) ---
  const sqCorners = [
    [400, 300],
    [700, 300],
    [700, 600],
    [400, 600],
    [400, 300],
  ];
  mobileEngine.onPointerDown(sqCorners[0][0], sqCorners[0][1], 0.8, 'stylus', 4);
  for (let i = 1; i < sqCorners.length - 1; i++) {
    mobileEngine.onPointerMove(sqCorners[i][0], sqCorners[i][1], 0.8, 'stylus', 4);
  }
  mobileEngine.onPointerUp('stylus', 4, 0, sqCorners[4][0], sqCorners[4][1]);
  const sqStroke = mobileEngine.strokes[mobileEngine.strokes.length - 1];
  assert.equal(sqStroke.points.length, 5, 'Square stroke must retain all 5 vertices including pointerUp closure');
  assert.equal(Math.round(sqStroke.points[4].x), 400);
  assert.equal(Math.round(sqStroke.points[4].y), 300);
  await flushBinaryToPc(5);

  // --- TEST A.3: 64-Point Circle with proAdaptive (1-Euro Filter) + Circularity Ratio Check ---
  mobileEngine.precisionMode = 'proAdaptive';
  const r = 300;
  const cx = 960;
  const cy = 540;
  const beforeCount = pcHostWs.binFrames.length;
  mobileEngine.onPointerDown(cx + r, cy, 0.75, 'stylus', 5);
  for (let i = 1; i < 64; i++) {
    const th = (2 * Math.PI * i) / 64;
    mobileEngine.onPointerMove(cx + r * Math.cos(th), cy + r * Math.sin(th), 0.75, 'stylus', 5);
  }
  mobileEngine.onPointerUp('stylus', 5, 0, cx + r, cy);
  const circleStroke = mobileEngine.strokes[mobileEngine.strokes.length - 1];
  assert.ok(circleStroke.points.length >= 60, `Circle stroke fragmented or missing points: ${circleStroke.points.length}`);
  await waitFor(() => pcHostWs.binFrames.length >= beforeCount + 65, 4000, '64-pt circle frames');
  const circleFrames = await flushBinaryToPc(pcHostWs.binFrames.length - decodedPcPoints.length);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cf of circleFrames) {
    if (cf.pxX < minX) minX = cf.pxX;
    if (cf.pxX > maxX) maxX = cf.pxX;
    if (cf.pxY < minY) minY = cf.pxY;
    if (cf.pxY > maxY) maxY = cf.pxY;
  }
  const diamX = maxX - minX;
  const diamY = maxY - minY;
  const aspectRatio = diamX / Math.max(1, diamY);
  assert.ok(
    Math.abs(aspectRatio - 1.0) <= 0.03,
    `Circle distortion under 1-Euro filter! diamX=${diamX}, diamY=${diamY}, ratio=${aspectRatio.toFixed(4)}`
  );

  // --- TEST A.4: Orphan Remote pointerMove After Far Stroke (BUG FIX CHECK: remoteOneEuro.reset()) ---
  mobileEngine.clearCanvas();
  mobileEngine.precisionMode = 'proAdaptive';
  // Stroke 1 ends near bottom-right (0.95, 0.95)
  mobileEngine.handleIncomingInputEvent({
    type: 'pointerDown',
    x: 0.9,
    y: 0.9,
    pressure: 0.7,
    pointerType: 'stylus',
    pointerId: 1,
    tiltX: 0,
    tiltY: 0,
    buttons: 1,
    sequenceNumber: 1,
    timestamp: 1000,
  });
  mobileEngine.handleIncomingInputEvent({
    type: 'pointerUp',
    x: 0.95,
    y: 0.95,
    pressure: 0,
    pointerType: 'stylus',
    pointerId: 1,
    tiltX: 0,
    tiltY: 0,
    buttons: 0,
    sequenceNumber: 2,
    timestamp: 1010,
  });
  // Stroke 2 starts with orphan pointerMove (missed pointerDown) at top-left (0.05, 0.05) 10ms later!
  // BEFORE FIX: remoteOneEuro filtered (0.05, 0.05) against stale (0.95, 0.95), pulling the first point halfway across the canvas!
  mobileEngine.handleIncomingInputEvent({
    type: 'pointerMove',
    x: 0.05,
    y: 0.05,
    pressure: 0.7,
    pointerType: 'stylus',
    pointerId: 1,
    tiltX: 0,
    tiltY: 0,
    buttons: 1,
    sequenceNumber: 3,
    timestamp: 1020,
  });
  mobileEngine.handleIncomingInputEvent({
    type: 'pointerUp',
    x: 0.1,
    y: 0.1,
    pressure: 0,
    pointerType: 'stylus',
    pointerId: 1,
    tiltX: 0,
    tiltY: 0,
    buttons: 0,
    sequenceNumber: 4,
    timestamp: 1030,
  });
  const orphanStroke = mobileEngine.strokes[mobileEngine.strokes.length - 1];
  assert.ok(
    orphanStroke.points[0].normX <= 0.06 && orphanStroke.points[0].normY <= 0.06,
    `BUG FIX CHECK: Orphan pointerMove pulled toward previous stroke! Got (${orphanStroke.points[0].normX.toFixed(3)}, ${orphanStroke.points[0].normY.toFixed(3)})`
  );
  assert.equal(orphanStroke.points.length, 2, 'Remote pointerUp must include final tip (0.1, 0.1)');

  // --- Network Drop & Reconnect Recovery Over Live Relay ---
  mobileWs.ws.terminate();
  await waitFor(
    () => pcHostWs.jsonMsgs.some((m) => m.type === 'peer_disconnected'),
    3000,
    'PC detects abrupt mobile disconnect'
  );
  const mobileReconnected = await connectWsClient(`${TARGET_WS}/ws?pin=${qaPin}&role=client&name=Mobile-Pad-Reconnected`);
  activeMobileWs = mobileReconnected;
  await waitFor(
    () => pcHostWs.jsonMsgs.filter((m) => m.type === 'peer_connected').length >= 2,
    3000,
    'Mobile reconnect peer_connected'
  );

  // --- TEST A.5: Smooth Sine Curve & Continuous Handwriting After Reconnect ---
  mobileEngine.clearCanvas();
  mobileEngine.precisionMode = 'proAdaptive';
  const beforeCurveCount = pcHostWs.binFrames.length;
  // Continuous S-curve (32 points)
  mobileEngine.onPointerDown(200, 540, 0.72, 'stylus', 6);
  for (let i = 1; i <= 31; i++) {
    const t = i / 31;
    const x = 200 + t * 1200;
    const y = 540 + Math.sin(t * Math.PI * 2) * 180;
    mobileEngine.onPointerMove(x, y, 0.72, 'stylus', 6);
  }
  mobileEngine.onPointerUp('stylus', 6, 0, 1400, 540);
  await waitFor(() => pcHostWs.binFrames.length >= beforeCurveCount + 33, 4000, 'curve frames');

  // Continuous multi-glyph handwriting ("AI" joined cursive ribbon across 3 strokes, rapid lifts)
  const beforeWriteCount = pcHostWs.binFrames.length;
  const glyphs = [
    [
      [300, 420], [340, 260], [380, 420], [315, 360], [365, 360],
    ],
    [
      [430, 260], [430, 420],
    ],
    [
      [480, 420], [480, 260], [540, 280], [540, 340], [480, 340], [550, 420],
    ],
  ];
  for (let g = 0; g < glyphs.length; g++) {
    const pts = glyphs[g];
    mobileEngine.onPointerDown(pts[0][0], pts[0][1], 0.7, 'stylus', 10 + g);
    for (let k = 1; k < pts.length - 1; k++) {
      mobileEngine.onPointerMove(pts[k][0], pts[k][1], 0.7, 'stylus', 10 + g);
    }
    const last = pts[pts.length - 1];
    mobileEngine.onPointerUp('stylus', 10 + g, 0, last[0], last[1]);
  }
  assert.equal(mobileEngine.strokes.length, 4, 'Curve + 3 handwriting strokes must stay distinct without unwanted gaps/merges');
  assert.equal(mobileEngine.strokes[2].points.length, 2, 'Short vertical "I" stroke must keep both start & pointerUp endpoints');
  await waitFor(() => pcHostWs.binFrames.length >= beforeWriteCount + 13, 4000, 'handwriting frames');

  const pendingNew = pcHostWs.binFrames.length - decodedPcPoints.length;
  if (pendingNew > 0) {
    await flushBinaryToPc(pendingNew);
  }

  // Reconnected client sends one final center point verify
  const checkFrame = ConnectionManager.encodeBinaryFrame({
    type: 0,
    normX: 0.5,
    normY: 0.5,
    pressure: 0.8,
    tool: 0,
    timestamp: Date.now() >>> 0,
    version: 1,
  });
  mobileReconnected.ws.send(checkFrame, { binary: true });
  const reconFrames = await flushBinaryToPc(1);
  assert.equal(reconFrames[0].pxX, 960);
  assert.equal(reconFrames[0].pxY, 540);

  mobileReconnected.ws.close();
  pcHostWs.ws.close();
  console.log(
    `  [PASS] TEST A & Reconnect: Straight lines, diagonal, closed square, 64-pt 1-Euro circle (diamX=${diamX}px, diamY=${diamY}px, ratio=${aspectRatio.toFixed(3)}), smooth sine curve, continuous handwriting, orphan pointerMove isolation, & reconnect recovery passed.`
  );
}

// ------------------------------------------------------------------------------
// 3. Full Paired Production Modules: Dual (ConnectionManager + DrawingEngine)
//    Exercises exact App.tsx wiring across live port-3000 /ws relay
// ------------------------------------------------------------------------------
console.log('\n--- QA 3: Full Dual Production Pair (PC Host ConnectionManager+DrawingEngine <-> Mobile ConnectionManager+DrawingEngine) ---');
{
  const parsedHttp = new URL(TARGET_HTTP);
  const prevWebSocket = globalThis.WebSocket;
  const prevWindow = globalThis.window;
  const prevKeyboardEvent = globalThis.KeyboardEvent;

  globalThis.WebSocket = WebSocket;
  globalThis.window = {
    location: {
      protocol: parsedHttp.protocol,
      host: parsedHttp.host,
      hostname: parsedHttp.hostname,
      port: parsedHttp.port || (parsedHttp.protocol === 'https:' ? '443' : '80'),
      origin: parsedHttp.origin,
    },
    innerWidth: 1920,
    innerHeight: 1080,
    screen: { width: 1920, height: 1080 },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  globalThis.KeyboardEvent = class KeyboardEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.key = init.key || '';
      this.code = init.code || '';
    }
  };

  const pcUrls = emitTsTree('pc');
  const mobUrls = emitTsTree('mobile');
  const { ConnectionManager: PcConnMgr } = await import(pcUrls['services/connectionManager.ts']);
  const { DrawingEngine: PcDrawEngine } = await import(pcUrls['services/drawingEngine.ts']);
  const { ConnectionManager: MobConnMgr } = await import(mobUrls['services/connectionManager.ts']);
  const { DrawingEngine: MobDrawEngine } = await import(mobUrls['services/drawingEngine.ts']);

  const pcConn = PcConnMgr.getInstance();
  const pcEngine = PcDrawEngine.getInstance();
  const mobConn = MobConnMgr.getInstance();
  const mobEngine = MobDrawEngine.getInstance();

  function wireDevice(conn, engine) {
    engine.onInputGenerated = (event) => conn.sendInputEvent(event);
    conn.onInputReceived = (event) => engine.handleIncomingInputEvent(event);
    conn.onBrushReceived = (brush) => engine.updateBrush(brush);
    conn.onActionReceived = (action) => {
      if (action === 'undo') engine.undo();
      if (action === 'redo') engine.redo();
      if (action === 'clear' || action === 'clearCanvas') engine.clearCanvas();
      if (action === 'eraserShortcut') engine.updateBrush({ mode: 'eraser' });
      if (action === 'brushShortcut' && engine.brushSettings.mode === 'eraser') {
        engine.updateBrush({ mode: 'pen' });
      }
    };
    conn.onScreenSyncReceived = (w, h) => engine.setPcScreenDimensions(w, h);
    engine.onSoftwareProfileChanged = (profileId, workingArea) => conn.sendSoftwareSync(profileId, workingArea);
    conn.onSoftwareSyncReceived = (profileId, workingArea) => engine.setSoftwareProfile(profileId, workingArea, false);
  }

  try {
    wireDevice(pcConn, pcEngine);
    wireDevice(mobConn, mobEngine);

    pcEngine.updateCanvasDimensions(1920, 1080);
    pcEngine.setPcScreenDimensions(1920, 1080);
    pcEngine.precisionMode = 'proAdaptive';
    mobEngine.updateCanvasDimensions(1080, 1920);
    mobEngine.precisionMode = 'proAdaptive';

    const qa3Pin = '5599';
    let screenSyncedOnMobile = false;
    let softwareSyncedOnMobile = false;
    const origScreenCb = mobConn.onScreenSyncReceived;
    mobConn.onScreenSyncReceived = (w, h) => {
      origScreenCb?.(w, h);
      if (w === 1920 && h === 1080) screenSyncedOnMobile = true;
    };
    const origSoftCb = mobConn.onSoftwareSyncReceived;
    mobConn.onSoftwareSyncReceived = (id, area) => {
      origSoftCb?.(id, area);
      if (id === 'photoshop') softwareSyncedOnMobile = true;
    };

    // Start PC Host and set software profile BEFORE Mobile joins (verifies startup/peer_connected replay fix)
    pcConn.serverConfig.screenWidth = 1920;
    pcConn.serverConfig.screenHeight = 1080;
    pcEngine.setSoftwareProfile('photoshop', undefined, true);
    pcConn.startServer(qa3Pin, '127.0.0.1', Number(globalThis.window.location.port));

    await waitFor(() => pcConn.relayState === 'connected', 3000, 'PC Host WebSocket relay ready');

    // Connect Mobile Pad via live /ws relay
    const connected = await mobConn.connectToServer('relay', Number(globalThis.window.location.port), qa3Pin, 'cloud');
    assert.equal(connected, true, 'Mobile ConnectionManager.connectToServer must succeed');
    assert.equal(mobConn.state, 'connected');
    assert.equal(pcConn.state, 'connected');

    await waitFor(
      () => screenSyncedOnMobile && softwareSyncedOnMobile,
      4000,
      'Mobile receives PC screen_sync (1920x1080) and software_sync (photoshop) on peer_connected'
    );
    assert.equal(mobEngine.pcScreenWidth, 1920);
    assert.equal(mobEngine.pcScreenHeight, 1080);
    assert.equal(mobEngine.activeSoftwareId, 'photoshop');

    // 1. Mobile changes brush color & width -> PC Engine reflects synced brush
    mobEngine.updateBrush({ mode: 'pen', color: '#FF3B30', baseWidth: 14 });
    mobConn.sendBrushUpdate({ mode: 'pen', color: '#FF3B30', baseWidth: 14 });
    await waitFor(
      () => pcEngine.brushSettings.color === '#FF3B30' && pcEngine.brushSettings.baseWidth === 14,
      3000,
      'PC receives Mobile brush update'
    );

    // 2. Mobile draws diagonal line + 40-point smooth circle + sine wave + cursive stroke
    // Diagonal
    mobEngine.onPointerDown(100, 200, 0.75, 'stylus', 1);
    for (let i = 1; i <= 8; i++) {
      mobEngine.onPointerMove(100 + i * 100, 200 + i * 120, 0.75, 'stylus', 1);
    }
    mobEngine.onPointerUp('stylus', 1, 0, 900, 1160);

    // Circle (on 1080x1920 mobile surface -> mapped to 1920x1080 PC normalized canvas)
    const cx = 540;
    const cy = 960;
    const r = 300;
    mobEngine.onPointerDown(cx + r, cy, 0.8, 'stylus', 2);
    for (let i = 1; i < 40; i++) {
      const th = (2 * Math.PI * i) / 40;
      mobEngine.onPointerMove(cx + r * Math.cos(th), cy + r * Math.sin(th), 0.8, 'stylus', 2);
    }
    mobEngine.onPointerUp('stylus', 2, 0, cx + r, cy);

    // Handwriting cursive glyph
    const hw = [
      [200, 1400], [260, 1280], [320, 1400], [380, 1300], [440, 1400],
    ];
    mobEngine.onPointerDown(hw[0][0], hw[0][1], 0.7, 'stylus', 3);
    for (let i = 1; i < hw.length - 1; i++) {
      mobEngine.onPointerMove(hw[i][0], hw[i][1], 0.7, 'stylus', 3);
    }
    mobEngine.onPointerUp('stylus', 3, 0, hw[hw.length - 1][0], hw[hw.length - 1][1]);

    await waitFor(() => pcEngine.strokes.length === 3, 5000, 'PC receives all 3 Mobile strokes');
    assert.equal(pcEngine.strokes[0].settings.color, '#FF3B30');
    assert.equal(pcEngine.strokes[0].settings.baseWidth, 14);
    assert.ok(pcEngine.strokes[1].points.length >= 35, 'Circle points must survive 1-Euro smoothing cleanly');

    // Verify endpoints normalized fidelity on Stroke 0
    const s0First = pcEngine.strokes[0].points[0];
    const s0Last = pcEngine.strokes[0].points[pcEngine.strokes[0].points.length - 1];
    assert.ok(Math.abs(s0First.normX - 100 / 1079) < 0.01);
    assert.ok(Math.abs(s0Last.normX - 900 / 1079) < 0.03);

    // 3. Mobile switches to Eraser and erases
    mobEngine.updateBrush({ mode: 'eraser' });
    mobConn.sendBrushUpdate({ mode: 'eraser' });
    mobEngine.onPointerDown(540, 960, 0.9, 'eraser', 4);
    mobEngine.onPointerMove(640, 960, 0.9, 'eraser', 4);
    mobEngine.onPointerUp('eraser', 4, 0, 740, 960);
    await waitFor(() => pcEngine.strokes.length === 4, 4000, 'PC receives Mobile eraser stroke');
    assert.equal(pcEngine.strokes[3].settings.mode, 'eraser');

    // 4. Mobile Undo / Redo / Clear actions sync to PC
    mobEngine.undo();
    mobConn.sendAction('undo');
    await waitFor(() => pcEngine.strokes.length === 3, 3000, 'PC mirrors Mobile undo');

    mobEngine.redo();
    mobConn.sendAction('redo');
    await waitFor(() => pcEngine.strokes.length === 4, 3000, 'PC mirrors Mobile redo');

    mobEngine.clearCanvas();
    mobConn.sendAction('clear');
    await waitFor(() => pcEngine.strokes.length === 0, 3000, 'PC mirrors Mobile clear');

    // 5. Simulate Offline -> Reconnect recovery test (verifies isSimulatedOffline fix)
    mobConn.simulateDisconnectedState('QA simulated drop');
    assert.equal(mobConn.isSimulatedOffline, true);
    const reconOk = await mobConn.connectToServer('relay', Number(globalThis.window.location.port), qa3Pin, 'cloud');
    assert.equal(reconOk, true);
    assert.equal(mobConn.isSimulatedOffline, false, 'isSimulatedOffline MUST reset on reconnect');

    mobEngine.updateBrush({ mode: 'pen', color: '#10B981', baseWidth: 6 });
    mobEngine.onPointerDown(540, 960, 0.7, 'stylus', 5);
    mobEngine.onPointerUp('stylus', 5, 0, 640, 1060);
    await waitFor(() => pcEngine.strokes.length === 1, 4000, 'PC receives stroke immediately after simulated offline recovery');

    console.log('  [PASS] QA 3: Full Dual Production ConnectionManager + DrawingEngine pairing, sync, multi-shape/cursive/eraser drawing, undo/redo/clear, and offline-recovery verified cleanly.');
  } finally {
    try { mobConn.disconnect(false); } catch {}
    try { pcConn.stopServer(); } catch {}
    globalThis.WebSocket = prevWebSocket;
    globalThis.window = prevWindow;
    globalThis.KeyboardEvent = prevKeyboardEvent;
  }
}

console.log('\n================================================================');
console.log('ALL LIVE TWO-DEVICE QA & DRAWING ENGINE TESTS PASSED!');
console.log('================================================================\n');
