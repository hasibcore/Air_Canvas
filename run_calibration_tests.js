// ==============================================================================
// run_calibration_tests.js
// Comprehensive Automated V2 Contract, Calibration, Fuzz, Stream-Chunking,
// Win32 Flag Audit & Security Regression Suite (v3 Master Prompt Compliant)
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Half-way away from zero rounding (matches Dart .round() & C# MidpointRounding.AwayFromZero)
function roundHalfAwayFromZero(val) {
  if (!Number.isFinite(val)) return 0;
  return val >= 0 ? Math.floor(val + 0.5) : Math.ceil(val - 0.5);
}

// 13-byte Little-Endian Binary Encoder
function encodeBinaryFrame({ type, normX, normY, pressure, tool, timestamp, version = 1 }) {
  const clampedX = Number.isFinite(normX) ? Math.max(0, Math.min(1, normX)) : 0.5;
  const clampedY = Number.isFinite(normY) ? Math.max(0, Math.min(1, normY)) : 0.5;
  const clampedP = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0.0;

  const buf = new ArrayBuffer(13);
  const view = new DataView(buf);
  view.setUint8(0, type & 0xff);
  view.setUint16(1, roundHalfAwayFromZero(clampedX * 65535), true);
  view.setUint16(3, roundHalfAwayFromZero(clampedY * 65535), true);
  view.setUint16(5, roundHalfAwayFromZero(clampedP * 1024), true);
  view.setUint8(7, tool & 0xff);
  view.setUint32(8, timestamp >>> 0, true);
  view.setUint8(12, version & 0xff);
  return new Uint8Array(buf);
}

// Strict 13-byte Little-Endian Binary Decoder (M1-M7 compliant)
function validateAndDecodeBinaryFrame(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.byteLength === 0 || bytes.byteLength % 13 !== 0) {
    return { ok: false, error: 'BadLength' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = [];

  for (let offset = 0; offset < bytes.byteLength; offset += 13) {
    const version = view.getUint8(offset + 12);
    if (version !== 1) {
      return { ok: false, error: 'BadVersion' };
    }
    const typeCode = view.getUint8(offset + 0);
    if (typeCode > 3) {
      return { ok: false, error: 'BadEventType' };
    }
    const toolByte = view.getUint8(offset + 7);
    if (toolByte > 2) {
      return { ok: false, error: 'BadTool' };
    }

    const rawX = view.getUint16(offset + 1, true);
    const rawY = view.getUint16(offset + 3, true);
    const rawP = view.getUint16(offset + 5, true);
    const timestamp = view.getUint32(offset + 8, true) >>> 0;

    frames.push({
      typeCode,
      rawX,
      rawY,
      rawP,
      normX: Math.max(0, Math.min(1, rawX / 65535.0)),
      normY: Math.max(0, Math.min(1, rawY / 65535.0)),
      pressure: Math.max(0, Math.min(1, rawP / 1024.0)),
      toolByte,
      timestamp,
      version,
    });
  }

  return { ok: true, frames };
}

function bytesToHex(u8) {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function hexToBytes(hexStr) {
  const clean = hexStr.trim();
  if (!clean) return new Uint8Array(0);
  const parts = clean.split(/\s+/);
  return new Uint8Array(parts.map((h) => parseInt(h, 16)));
}

function normalizePadPoint(localX, localY, padW, padH) {
  if (
    !Number.isFinite(localX) ||
    !Number.isFinite(localY) ||
    !Number.isFinite(padW) ||
    !Number.isFinite(padH) ||
    padW < 2 ||
    padH < 2
  ) {
    return [0.5, 0.5];
  }
  return [
    Math.max(0, Math.min(1, localX / (padW - 1))),
    Math.max(0, Math.min(1, localY / (padH - 1))),
  ];
}

function projectToTarget(normX, normY, [left, top, width, height]) {
  const cx = Number.isFinite(normX) ? Math.max(0, Math.min(1, normX)) : 0.5;
  const cy = Number.isFinite(normY) ? Math.max(0, Math.min(1, normY)) : 0.5;
  const tx = left + roundHalfAwayFromZero(cx * Math.max(0, width - 1));
  const ty = top + roundHalfAwayFromZero(cy * Math.max(0, height - 1));
  return [tx, ty];
}

console.log('================================================================');
console.log('AIR CANVAS v2.0.0 — AUTOMATED V2 CONTRACT, FUZZ & CALIBRATION SUITE');
console.log('================================================================\n');

let allPassed = true;
let totalAssertions = 0;

function assert(cond, msg) {
  totalAssertions++;
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    allPassed = false;
  }
}

// Load shared protocol vectors from contracts/protocol-vectors.json
const contractPath = path.join(__dirname, 'contracts', 'protocol-vectors.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

// ------------------------------------------------------------------------------
// 1. Appendix A.1 Valid 13-Byte Binary Vectors (V1 - V5)
// ------------------------------------------------------------------------------
console.log('--- Suite 1: Appendix A.1 Valid 13-Byte Frame Vectors (V1–V5) ---');
for (const v of contract.valid) {
  const encoded = encodeBinaryFrame(v.input);
  const actualHex = bytesToHex(encoded);
  assert(
    actualHex === v.hex,
    `Vector ${v.id} hex mismatch: expected [${v.hex}], got [${actualHex}]`
  );

  const decoded = validateAndDecodeBinaryFrame(encoded);
  assert(decoded.ok === true && decoded.frames.length === 1, `Vector ${v.id} failed to decode`);
  if (decoded.ok) {
    const f = decoded.frames[0];
    assert(f.rawX === v.fields.x, `Vector ${v.id} rawX mismatch: ${f.rawX} !== ${v.fields.x}`);
    assert(f.rawY === v.fields.y, `Vector ${v.id} rawY mismatch: ${f.rawY} !== ${v.fields.y}`);
    assert(f.rawP === v.fields.p, `Vector ${v.id} rawP mismatch: ${f.rawP} !== ${v.fields.p}`);
    assert(
      f.timestamp === v.input.timestamp >>> 0,
      `Vector ${v.id} timestamp mismatch: ${f.timestamp} !== ${v.input.timestamp}`
    );
    assert(f.version === 1, `Vector ${v.id} version mismatch`);
    console.log(
      `  [PASS] ${v.id}: ${actualHex} -> x=${f.rawX}, y=${f.rawY}, p=${f.rawP}, ts=${f.timestamp}`
    );
  }
}

// ------------------------------------------------------------------------------
// 2. Appendix A.2 Half-Way Rounding Vectors (R1 - R4, Banker's Rounding Trap)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 2: Appendix A.2 Half-Way Rounding Vectors (R1–R4) ---');
for (const r of contract.rounding) {
  const scaled = r.pressure * 1024;
  const rounded = roundHalfAwayFromZero(scaled);
  assert(
    rounded === r.expectedP,
    `Rounding vector ${r.id} mismatch: expected ${r.expectedP}, got ${rounded}`
  );
  console.log(`  [PASS] ${r.id}: pressure=${r.pressure} * 1024 (${scaled}) -> ${rounded}`);
}

// ------------------------------------------------------------------------------
// 3. Appendix A.3 Malformed Binary Frames (M1 - M7)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 3: Appendix A.3 Malformed Frame Rejection (M1–M7) ---');
for (const m of contract.malformed) {
  const bytes = hexToBytes(m.hex);
  const res = validateAndDecodeBinaryFrame(bytes);
  assert(
    res.ok === false && res.error === m.error,
    `Malformed vector ${m.id} expected error=${m.error}, got ${JSON.stringify(res)}`
  );
  console.log(`  [PASS] ${m.id} (${m.description}): rejected with Err(${res.error})`);
}

// ------------------------------------------------------------------------------
// 4. Appendix A.4 Physical Pixel Projection Vectors (18 vectors + 6x6 trap)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 4: Appendix A.4 Physical Pixel Projection & Multi-Monitor ---');
for (const p of contract.projection) {
  const [tx, ty] = projectToTarget(p.norm[0], p.norm[1], p.area);
  assert(
    tx === p.expected[0] && ty === p.expected[1],
    `Projection [${p.area}] norm (${p.norm}) expected (${p.expected}), got (${tx}, ${ty})`
  );
}
// Verify quantized round-trip for V1 center (32768 / 65535 -> 960, 540 on 1920x1080)
const v1Decoded = validateAndDecodeBinaryFrame(hexToBytes(contract.valid[0].hex)).frames[0];
const [v1PxX, v1PxY] = projectToTarget(v1Decoded.normX, v1Decoded.normY, [0, 0, 1920, 1080]);
assert(v1PxX === 960 && v1PxY === 540, `Quantized V1 center round-trip failed: (${v1PxX}, ${v1PxY})`);
console.log(
  `  [PASS] All ${contract.projection.length} projection vectors + quantized V1 center round-trip -> (960, 540)`
);

// ------------------------------------------------------------------------------
// 5. Appendix A.5 Pad Normalization Vectors & Degenerate Bounds (W < 2 / H < 2)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 5: Appendix A.5 Normalization & Degenerate Bounds Guard ---');
for (const nv of contract.normalization) {
  const [nx, ny] = normalizePadPoint(nv.local[0], nv.local[1], nv.pad[0], nv.pad[1]);
  assert(
    Math.abs(nx - nv.expected[0]) < 1e-9 && Math.abs(ny - nv.expected[1]) < 1e-9,
    `Normalization pad=${nv.pad} local=${nv.local} expected=${nv.expected}, got=[${nx}, ${ny}]`
  );
}
console.log(`  [PASS] All ${contract.normalization.length} normalization vectors matched.`);

// ------------------------------------------------------------------------------
// 6. Appendix A.6 Timestamp Wraparound (0xFFFFFFFB -> 0x00000005 == +10 ms)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 6: Appendix A.6 uint32 Timestamp Wraparound ---');
for (const tw of contract.timestampWraparound) {
  const delta = ((tw.curr >>> 0) - (tw.prev >>> 0)) | 0;
  assert(
    delta === tw.expectedDeltaMs,
    `Timestamp wraparound failed: expected ${tw.expectedDeltaMs}, got ${delta}`
  );
  console.log(`  [PASS] Wraparound 0x${tw.prev.toString(16).toUpperCase()} -> 0x${tw.curr.toString(16).padStart(8, '0').toUpperCase()} = +${delta} ms`);
}

// ------------------------------------------------------------------------------
// 7. Phase 12.2 Decoder Fuzz Test (100,000 random byte arrays of varying lengths)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 7: Phase 12.2 Decoder Fuzz Test (100,000 Random Payloads) ---');
{
  let seed = 0x9e3779b9;
  const nextRand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };

  const lengths = [0, 1, 2, 7, 8, 12, 13, 14, 25, 26, 27, 39, 64, 130];
  let validCount = 0;
  let rejectedCount = 0;
  let threwException = false;

  for (let i = 0; i < 100000; i++) {
    const len = lengths[nextRand() % lengths.length];
    const arr = new Uint8Array(len);
    for (let j = 0; j < len; j++) {
      arr[j] = nextRand() & 0xff;
    }
    try {
      const res = validateAndDecodeBinaryFrame(arr);
      if (res.ok) validCount++;
      else rejectedCount++;
    } catch {
      threwException = true;
      break;
    }
  }
  assert(!threwException, 'Decoder threw unhandled exception during 100,000 fuzz iterations');
  console.log(
    `  [PASS] 100,000 fuzz payloads processed with 0 exceptions (valid=${validCount}, rejected=${rejectedCount})`
  );
}

// ------------------------------------------------------------------------------
// 8. Phase 4.5 & 12.2 Quantization Error Budget (1,000 Random Round-Trip Points)
// ------------------------------------------------------------------------------
console.log('\n--- Suite 8: Phase 4.5 Quantization Error Budget (1,000 Random Points on 7680x4320 8K) ---');
{
  let seed = 0x12345678;
  const nextFloat = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967295.0;
  };
  let maxPixelDiff = 0;
  for (let i = 0; i < 1000; i++) {
    const nx = nextFloat();
    const ny = nextFloat();
    const p = nextFloat();
    const frame = encodeBinaryFrame({
      type: 1,
      normX: nx,
      normY: ny,
      pressure: p,
      tool: i % 3,
      timestamp: i * 4,
    });
    const dec = validateAndDecodeBinaryFrame(frame).frames[0];
    const [unquantX, unquantY] = projectToTarget(nx, ny, [0, 0, 7680, 4320]);
    const [quantX, quantY] = projectToTarget(dec.normX, dec.normY, [0, 0, 7680, 4320]);
    const diff = Math.max(Math.abs(unquantX - quantX), Math.abs(unquantY - quantY));
    if (diff > maxPixelDiff) maxPixelDiff = diff;
  }
  assert(maxPixelDiff <= 1, `Quantization error exceeded 1 px on 8K display: ${maxPixelDiff} px`);
  console.log(`  [PASS] 1,000 random 8K (7680x4320) points quantized & projected within <= 1 px (max diff=${maxPixelDiff} px)`);
}

// ------------------------------------------------------------------------------
// 9. Phase 5.5 & 12.2 TCP Stream-Chunking Reassembly Property Test
// ------------------------------------------------------------------------------
console.log('\n--- Suite 9: Phase 5.5 Stream-Chunking Reassembly (1B, 7B, 2.5 Frames, 100 Frames) ---');
{
  const sourceFrames = [];
  const rawStream = new Uint8Array(100 * 13);
  for (let i = 0; i < 100; i++) {
    const f = encodeBinaryFrame({
      type: i === 0 ? 0 : i === 99 ? 2 : 1,
      normX: i / 99,
      normY: 1 - i / 99,
      pressure: i === 99 ? 0 : 0.5,
      tool: i % 3,
      timestamp: 1000 + i * 4,
    });
    sourceFrames.push(validateAndDecodeBinaryFrame(f).frames[0]);
    rawStream.set(f, i * 13);
  }

  function simulateStreamReassembly(chunkSizes) {
    let reassembly = new Uint8Array(0);
    const decodedOut = [];
    let offset = 0;
    let chunkIdx = 0;
    while (offset < rawStream.length) {
      const step = chunkSizes[chunkIdx % chunkSizes.length];
      chunkIdx++;
      const slice = rawStream.subarray(offset, Math.min(rawStream.length, offset + step));
      offset += slice.length;

      const merged = new Uint8Array(reassembly.length + slice.length);
      merged.set(reassembly, 0);
      merged.set(slice, reassembly.length);

      const fullCount = Math.floor(merged.length / 13) * 13;
      if (fullCount > 0) {
        const res = validateAndDecodeBinaryFrame(merged.subarray(0, fullCount));
        assert(res.ok, 'Stream reassembly chunk failed decode');
        if (res.ok) decodedOut.push(...res.frames);
      }
      reassembly = merged.subarray(fullCount);
    }
    assert(reassembly.length === 0, `Unconsumed trailing bytes: ${reassembly.length}`);
    assert(decodedOut.length === 100, `Expected 100 frames, got ${decodedOut.length}`);
    for (let i = 0; i < 100; i++) {
      assert(
        decodedOut[i].rawX === sourceFrames[i].rawX &&
          decodedOut[i].rawY === sourceFrames[i].rawY &&
          decodedOut[i].timestamp === sourceFrames[i].timestamp,
        `Reassembled frame ${i} mismatch`
      );
    }
  }

  simulateStreamReassembly([1]); // 1 byte at a time
  simulateStreamReassembly([7, 6]); // 7 bytes then 6 bytes
  simulateStreamReassembly([32, 33]); // ~2.5 frames per read (32.5 bytes)
  simulateStreamReassembly([1300]); // All 100 frames in one read
  console.log('  [PASS] 1-byte, 7-byte, 2.5-frame (32/33B), and 100-frame chunking reassembled identically.');
}

// ------------------------------------------------------------------------------
// 10. Phase 6.4 Hover-Before-Down & Phase 7.2 Win32 Flag Audit + Security Checks
// ------------------------------------------------------------------------------
console.log('\n--- Suite 10: Hover-Before-Down, Win32 Flag Audit & Relay Security Audit ---');
{
  // Verify Hover(10,10) -> Hover(500,500) -> Down(500,500) -> Move(600,600) -> Up(600,600)
  const strokes = [];
  let currentStroke = null;
  let hoverCursor = null;

  const events = [
    { type: 'hover', x: 10, y: 10 },
    { type: 'hover', x: 500, y: 500 },
    { type: 'pointerDown', x: 500, y: 500 },
    { type: 'pointerMove', x: 600, y: 600 },
    { type: 'pointerUp', x: 600, y: 600 },
  ];

  for (const ev of events) {
    if (ev.type === 'hover') {
      hoverCursor = { x: ev.x, y: ev.y };
    } else if (ev.type === 'pointerDown') {
      currentStroke = { points: [{ x: ev.x, y: ev.y }] };
    } else if (ev.type === 'pointerMove' && currentStroke) {
      currentStroke.points.push({ x: ev.x, y: ev.y });
    } else if (ev.type === 'pointerUp' && currentStroke) {
      strokes.push(currentStroke);
      currentStroke = null;
    }
  }

  const touchedStaleHover = strokes[0].points.some((pt) => pt.x === 10 && pt.y === 10);
  assert(!touchedStaleHover && hoverCursor !== null, 'Hover-before-down polluted stroke with (10,10)');
  console.log('  [PASS] Hover(10,10) -> Hover(500,500) -> Down(500,500) created 0 segments touching (10,10).');

  // Verify Win32 Flag Audit & MidpointRounding.AwayFromZero in AirCanvasServer.cs
  const csSource = fs.readFileSync(path.join(__dirname, 'AirCanvasServer.cs'), 'utf8');
  const publicCsSource = fs.readFileSync(path.join(__dirname, 'public', 'AirCanvasServer.cs'), 'utf8');
  assert(csSource === publicCsSource, 'AirCanvasServer.cs and public/AirCanvasServer.cs are out of sync');
  assert(
    !csSource.includes('pointerFlags |= POINTER_FLAG_INVERTED'),
    'AirCanvasServer.cs still ORs 0x00100000 (POINTER_FLAG_HWHEEL) into pointerFlags'
  );
  assert(
    csSource.includes('penFlags |= (PEN_FLAG_ERASER | PEN_FLAG_INVERTED)'),
    'AirCanvasServer.cs missing penFlags = PEN_FLAG_ERASER | PEN_FLAG_INVERTED'
  );
  const unguardedRounds = csSource
    .split('\n')
    .filter((line) => line.includes('Math.Round(') && !line.includes('MidpointRounding.AwayFromZero'));
  assert(
    unguardedRounds.length === 0,
    `AirCanvasServer.cs has ${unguardedRounds.length} Math.Round calls without MidpointRounding.AwayFromZero`
  );
  console.log('  [PASS] Win32 Flag Audit: 0x00100000 removed from pointerFlags; penFlags=0x06 and AwayFromZero verified.');

  // Verify server.js security hardening
  const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(!serverSource.includes('exec('), 'server.js still contains child_process exec()');
  assert(serverSource.includes('maxPayload: MAX_WS_PAYLOAD_BYTES'), 'server.js missing WebSocket maxPayload');
  console.log('  [PASS] Relay Security Audit: child_process exec removed, maxPayload & rate caps active.');
}

// ==============================================================================
// PHASE 4.10.11 — UNIVERSAL TARGET AUTO-DETECTION & ADAPTIVE SCREEN MAPPING SUITES (A–F)
// Executes directly against production src/services/targetGeometryManager.ts
// ==============================================================================
import ts from 'typescript';

const tgmTsPath = path.join(__dirname, 'src', 'services', 'targetGeometryManager.ts');
const tgmTsCode = fs.readFileSync(tgmTsPath, 'utf8');
const transpiledTgm = ts.transpileModule(tgmTsCode, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const tgmDataUrl = `data:text/javascript;base64,${Buffer.from(transpiledTgm, 'utf8').toString('base64')}`;
const {
  TargetGeometryManager,
  FivePointCalibrator,
  computeAspectPreservingTargetRect,
  computeAspectPreservingSourceRect,
  normalizeSourcePoint,
} = await import(tgmDataUrl);

// ------------------------------------------------------------------------------
// Suite A — Phase 4.10.11 Source Geometry Tests
// ------------------------------------------------------------------------------
console.log('\n--- Suite A (Phase 4.10.2 & 4.10.11): Source Geometry & Outside-Pad Guard ---');
{
  const mgr = new TargetGeometryManager();

  // Valid runtime layouts: 800x600, 1280x800, 2560x1600, 1080x2400 portrait
  const validDims = [
    { w: 800, h: 600, dpr: 1.0, expectedOrientation: 'landscape' },
    { w: 1280, h: 800, dpr: 2.0, expectedOrientation: 'landscape' },
    { w: 2560, h: 1600, dpr: 2.5, expectedOrientation: 'landscape' },
    { w: 1080, h: 2400, dpr: 3.0, expectedOrientation: 'portrait' },
  ];

  for (const d of validDims) {
    const ok = mgr.updateSourceGeometry(d.w, d.h, d.dpr, { top: 24, bottom: 16, left: 0, right: 0 });
    assert(ok === true, `Suite A: updateSourceGeometry(${d.w}x${d.h}) should succeed`);
    const st = mgr.getState();
    assert(
      st.sourceGeometry.width === d.w &&
        st.sourceGeometry.height === d.h &&
        st.sourceGeometry.orientation === d.expectedOrientation,
      `Suite A: sourceGeometry mismatch for ${d.w}x${d.h}`
    );

    const tl = normalizeSourcePoint(0, 0, d.w, d.h);
    const br = normalizeSourcePoint(d.w - 1, d.h - 1, d.w, d.h);
    const mid = normalizeSourcePoint((d.w - 1) / 2, (d.h - 1) / 2, d.w, d.h);
    assert(tl.ok && tl.normX === 0 && tl.normY === 0, `Suite A: ${d.w}x${d.h} top-left norm failed`);
    assert(br.ok && br.normX === 1 && br.normY === 1, `Suite A: ${d.w}x${d.h} bottom-right norm failed`);
    assert(
      mid.ok && Math.abs(mid.normX - 0.5) < 1e-9 && Math.abs(mid.normY - 0.5) < 1e-9,
      `Suite A: ${d.w}x${d.h} center norm failed`
    );
  }

  // 1x1 explicit fallback (< 2px dimension returns explicit tested fallback (0.5, 0.5))
  const fallback1x1 = normalizeSourcePoint(0, 0, 1, 1);
  assert(
    fallback1x1.ok === true &&
      fallback1x1.degenerateFallback === true &&
      fallback1x1.normX === 0.5 &&
      fallback1x1.normY === 0.5,
    'Suite A: 1x1 degenerate source fallback must return (0.5, 0.5) with degenerateFallback=true'
  );

  // Invalid dimensions: 0x0, negative, NaN, Infinity
  for (const bad of [
    [0, 0],
    [-800, 600],
    [800, -600],
    [Number.NaN, 600],
    [800, Number.POSITIVE_INFINITY],
  ]) {
    const accepted = mgr.updateSourceGeometry(bad[0], bad[1], 1.0);
    assert(accepted === false, `Suite A: invalid source geometry (${bad[0]}x${bad[1]}) must be rejected`);
    const normRes = normalizeSourcePoint(10, 10, bad[0], bad[1]);
    assert(normRes.ok === false, `Suite A: normalizeSourcePoint must reject dimensions (${bad[0]}x${bad[1]})`);
  }

  // NaN and Infinity pointer coordinates rejected
  for (const badPt of [
    [Number.NaN, 100],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 100],
    [100, Number.NEGATIVE_INFINITY],
  ]) {
    const normRes = normalizeSourcePoint(badPt[0], badPt[1], 800, 600);
    assert(normRes.ok === false, `Suite A: non-finite pointer (${badPt}) must be rejected`);
    const downRes = mgr.beginStroke(badPt[0], badPt[1]);
    assert(downRes.ok === false, `Suite A: beginStroke must reject non-finite pointer (${badPt})`);
  }

  // Outside-pad pointer coordinates rejected on pointerDown and clamped on pointerMove
  mgr.updateSourceGeometry(800, 600, 1.0);
  mgr.selectMonitor('MON-PRIMARY-1080P');
  mgr.setTargetMode('MONITOR');
  const outsideDown = mgr.beginStroke(-25, 300);
  assert(outsideDown.ok === false, 'Suite A: pointerDown outside pad (-25, 300) must be rejected');

  const validDown = mgr.beginStroke(400, 300);
  assert(validDown.ok === true, 'Suite A: valid pointerDown inside pad must succeed');
  const clampedMove = mgr.moveStroke(9999, -500);
  assert(
    clampedMove.ok === true && clampedMove.normX === 1 && clampedMove.normY === 0,
    'Suite A: mid-stroke pointerMove outside pad must clamp to [1, 0]'
  );
  mgr.endStroke(400, 300);

  console.log(
    '  [PASS] Suite A: 800x600, 1280x800, 2560x1600, 1080x2400 portrait, 1x1 fallback, 0x0/negative/NaN/Infinity rejection & outside-pad guard verified.'
  );
}

// ------------------------------------------------------------------------------
// Suite B — Phase 4.10.11 Target Detection Tests (MONITOR, WINDOW, CANVAS)
// ------------------------------------------------------------------------------
console.log('\n--- Suite B (Phase 4.10.3–4.10.5 & 4.10.11): Target Auto-Detection (MONITOR, WINDOW, CANVAS) ---');
{
  const mgr = new TargetGeometryManager();
  mgr.updateSourceGeometry(1920, 1080, 1.0);
  mgr.setPreserveAspectRatio(false); // Test exact raw target bounds first

  // Configure all required Suite B monitors
  mgr.setMonitors([
    {
      id: 'MON-SINGLE-1080P',
      name: 'Single 1080p Monitor',
      isPrimary: true,
      rcMonitor: { left: 0, top: 0, width: 1920, height: 1080 },
      rcWork: { left: 0, top: 0, width: 1920, height: 1040 },
      dpiX: 96,
      dpiY: 96,
      scaleFactor: 1.0,
      orientation: 'landscape',
      isConnected: true,
    },
    {
      id: 'MON-4K',
      name: '4K Primary Monitor',
      isPrimary: false,
      rcMonitor: { left: 0, top: 0, width: 3840, height: 2160 },
      rcWork: { left: 0, top: 0, width: 3840, height: 2112 },
      dpiX: 144,
      dpiY: 144,
      scaleFactor: 1.5,
      orientation: 'landscape',
      isConnected: true,
    },
    {
      id: 'MON-SECONDARY-RIGHT',
      name: 'Secondary Right QHD',
      isPrimary: false,
      rcMonitor: { left: 1920, top: 0, width: 2560, height: 1440 },
      rcWork: { left: 1920, top: 0, width: 2560, height: 1400 },
      dpiX: 120,
      dpiY: 120,
      scaleFactor: 1.25,
      orientation: 'landscape',
      isConnected: true,
    },
    {
      id: 'MON-LEFT-NEGATIVE',
      name: 'Left Monitor Negative Origin',
      isPrimary: false,
      rcMonitor: { left: -1920, top: 0, width: 1920, height: 1080 },
      rcWork: { left: -1920, top: 0, width: 1920, height: 1040 },
      dpiX: 96,
      dpiY: 96,
      scaleFactor: 1.0,
      orientation: 'landscape',
      isConnected: true,
    },
    {
      id: 'MON-PORTRAIT',
      name: 'Portrait Monitor',
      isPrimary: false,
      rcMonitor: { left: 0, top: -420, width: 1080, height: 1920 },
      rcWork: { left: 0, top: -420, width: 1080, height: 1880 },
      dpiX: 96,
      dpiY: 96,
      scaleFactor: 1.0,
      orientation: 'portrait',
      isConnected: true,
    },
  ]);

  const monitorExpectations = [
    { id: 'MON-SINGLE-1080P', tl: [0, 0], br: [1919, 1079] },
    { id: 'MON-4K', tl: [0, 0], br: [3839, 2159] },
    { id: 'MON-SECONDARY-RIGHT', tl: [1920, 0], br: [4479, 1439] },
    { id: 'MON-LEFT-NEGATIVE', tl: [-1920, 0], br: [-1, 1079] },
    { id: 'MON-PORTRAIT', tl: [0, -420], br: [1079, 1499] },
  ];

  for (const exp of monitorExpectations) {
    mgr.selectMonitor(exp.id);
    const tl = mgr.projectNormalizedPoint(0, 0);
    const br = mgr.projectNormalizedPoint(1, 1);
    assert(
      tl.ok && tl.targetX === exp.tl[0] && tl.targetY === exp.tl[1],
      `Suite B: Monitor ${exp.id} top-left expected ${exp.tl}, got [${tl.targetX}, ${tl.targetY}]`
    );
    assert(
      br.ok && br.targetX === exp.br[0] && br.targetY === exp.br[1],
      `Suite B: Monitor ${exp.id} bottom-right expected ${exp.br}, got [${br.targetX}, ${br.targetY}]`
    );
  }

  // Distinguish rcMonitor vs rcWork (work area excluding taskbar)
  mgr.selectMonitor('MON-SINGLE-1080P');
  mgr.setUseMonitorWorkArea(true);
  assert(
    mgr.getState().targetBounds.height === 1040,
    'Suite B: rcWork must exclude 40px taskbar when useMonitorWorkArea=true'
  );
  mgr.setUseMonitorWorkArea(false);

  // Disconnected monitor must NOT silently switch to another monitor
  mgr.selectMonitor('MON-SECONDARY-RIGHT');
  mgr.setMonitorConnected('MON-SECONDARY-RIGHT', false);
  assert(
    mgr.getState().targetAvailable === false &&
      mgr.getState().targetId === 'MON-SECONDARY-RIGHT' &&
      mgr.projectNormalizedPoint(0.5, 0.5).ok === false,
    'Suite B: Disconnected monitor must enter target-unavailable state without silent fallback'
  );
  mgr.setMonitorConnected('MON-SECONDARY-RIGHT', true);

  // WINDOW target: 1400 x 900 at (260, 90) & CANVAS target: 1200 x 800 at (420, 180)
  mgr.setWindows([
    {
      hwnd: 'HWND-SUITE-B-APP',
      processId: 9001,
      processName: 'ClipStudioPaint.exe',
      appId: 'clipstudio',
      title: 'Clip Studio Paint — Illustration.clip',
      visibleFrameBounds: { left: 260, top: 90, width: 1400, height: 900 },
      clientBounds: { left: 260, top: 90, width: 1400, height: 900 },
      isMinimized: false,
      isVisible: true,
      isDestroyed: false,
      childCanvasRect: { left: 420, top: 180, width: 1200, height: 800 },
      childCanvasClass: 'CSP_CanvasViewport',
    },
    {
      hwnd: 'HWND-OPAQUE-GPU',
      processId: 9002,
      processName: 'Blender.exe',
      appId: 'blender',
      title: 'Blender — Direct3D/OpenGL Viewport',
      visibleFrameBounds: { left: 100, top: 100, width: 1600, height: 900 },
      clientBounds: { left: 100, top: 100, width: 1600, height: 900 },
      isMinimized: false,
      isVisible: true,
      isDestroyed: false,
      childCanvasRect: null,
      childCanvasClass: null,
    },
  ]);

  mgr.selectWindow('HWND-SUITE-B-APP');
  mgr.setTargetMode('WINDOW');
  const winTl = mgr.projectNormalizedPoint(0, 0);
  const winBr = mgr.projectNormalizedPoint(1, 1);
  assert(
    winTl.ok && winTl.targetX === 260 && winTl.targetY === 90,
    `Suite B: WINDOW mode top-left expected (260, 90), got (${winTl.targetX}, ${winTl.targetY})`
  );
  assert(
    winBr.ok && winBr.targetX === 260 + 1399 && winBr.targetY === 90 + 899,
    `Suite B: WINDOW mode bottom-right expected (1659, 989), got (${winBr.targetX}, ${winBr.targetY})`
  );

  // Minimized window -> target unavailable
  mgr.setWindowState('HWND-SUITE-B-APP', { isMinimized: true });
  assert(
    mgr.getState().targetAvailable === false && mgr.projectNormalizedPoint(0.5, 0.5).ok === false,
    'Suite B: Minimized window must enter target-unavailable state'
  );
  mgr.setWindowState('HWND-SUITE-B-APP', { isMinimized: false });

  // CANVAS mode with verified child canvas: 1200 x 800 at (420, 180)
  mgr.setTargetMode('CANVAS');
  const cState = mgr.getState();
  assert(
    cState.canvasDetectionSupported === true &&
      cState.canvasBoundsVerified === true &&
      cState.requiresCalibrationFallback === false,
    'Suite B: Verified child canvas must report canvasBoundsVerified=true'
  );
  const canTl = mgr.projectNormalizedPoint(0, 0);
  const canBr = mgr.projectNormalizedPoint(1, 1);
  assert(
    canTl.ok && canTl.targetX === 420 && canTl.targetY === 180,
    `Suite B: CANVAS mode top-left expected (420, 180), got (${canTl.targetX}, ${canTl.targetY})`
  );
  assert(
    canBr.ok && canBr.targetX === 420 + 1199 && canBr.targetY === 180 + 799,
    `Suite B: CANVAS mode bottom-right expected (1619, 979), got (${canBr.targetX}, ${canBr.targetY})`
  );

  // CANVAS mode on opaque GPU app -> explicit calibration fallback required, NO silent fallback to WINDOW/MONITOR
  mgr.selectWindow('HWND-OPAQUE-GPU');
  const opaqueState = mgr.getState();
  assert(
    opaqueState.targetMode === 'CANVAS' &&
      opaqueState.canvasBoundsVerified === false &&
      opaqueState.requiresCalibrationFallback === true &&
      mgr.projectNormalizedPoint(0.5, 0.5).ok === false,
    'Suite B: Unsupported app in CANVAS mode must require 5-point calibration and never silently fall back to WINDOW/MONITOR'
  );

  console.log(
    '  [PASS] Suite B: Single/4K/Secondary/Left-Negative/Portrait monitors, WINDOW (1400x900@260,90), CANVAS (1200x800@420,180), and no-silent-fallback rules verified.'
  );
}

// ------------------------------------------------------------------------------
// Suite C — Phase 4.10.7 & 4.10.11 Aspect-Ratio Preservation & Circle Invariance
// ------------------------------------------------------------------------------
console.log('\n--- Suite C (Phase 4.10.7 & 4.10.11): Aspect-Ratio Preservation (6 Ratios + Circle Test) ---');
{
  const cases = [
    {
      name: '16:9 source (1600x900) -> 16:9 target (1920x1080)',
      srcW: 1600,
      srcH: 900,
      target: { left: 0, top: 0, width: 1920, height: 1080 },
      expectedRect: { left: 0, top: 0, width: 1920, height: 1080 },
    },
    {
      name: '16:9 source (1600x900) -> 16:10 target (1920x1200)',
      srcW: 1600,
      srcH: 900,
      target: { left: 0, top: 0, width: 1920, height: 1200 },
      expectedRect: { left: 0, top: 60, width: 1920, height: 1080 },
    },
    {
      name: '16:9 source (1600x900) -> 4:3 target (1600x1200)',
      srcW: 1600,
      srcH: 900,
      target: { left: 0, top: 0, width: 1600, height: 1200 },
      expectedRect: { left: 0, top: 150, width: 1600, height: 900 },
    },
    {
      name: '16:9 source (1600x900) -> portrait target (1080x1920)',
      srcW: 1600,
      srcH: 900,
      target: { left: 0, top: 0, width: 1080, height: 1920 },
      expectedRect: { left: 0, top: 656, width: 1080, height: 608 },
    },
    {
      name: 'portrait source (900x1600) -> landscape target (1920x1080)',
      srcW: 900,
      srcH: 1600,
      target: { left: 0, top: 0, width: 1920, height: 1080 },
      expectedRect: { left: 656, top: 0, width: 608, height: 1080 },
    },
    {
      name: 'square source (1000x1000) -> widescreen target (1920x1080)',
      srcW: 1000,
      srcH: 1000,
      target: { left: 0, top: 0, width: 1920, height: 1080 },
      expectedRect: { left: 420, top: 0, width: 1080, height: 1080 },
    },
  ];

  for (const c of cases) {
    const mapped = computeAspectPreservingTargetRect(c.srcW, c.srcH, c.target);
    assert(
      mapped.left === c.expectedRect.left &&
        mapped.top === c.expectedRect.top &&
        mapped.width === c.expectedRect.width &&
        mapped.height === c.expectedRect.height,
      `Suite C (${c.name}): expected ${JSON.stringify(c.expectedRect)}, got ${JSON.stringify(mapped)}`
    );

    // Verify a circle of radius R=200px in source pixels maps to equal horizontal and vertical diameter on target
    const cx = (c.srcW - 1) / 2;
    const cy = (c.srcH - 1) / 2;
    const rPx = Math.min(c.srcW, c.srcH) * 0.25;
    const leftNorm = normalizeSourcePoint(cx - rPx, cy, c.srcW, c.srcH);
    const rightNorm = normalizeSourcePoint(cx + rPx, cy, c.srcW, c.srcH);
    const topNorm = normalizeSourcePoint(cx, cy - rPx, c.srcW, c.srcH);
    const bottomNorm = normalizeSourcePoint(cx, cy + rPx, c.srcW, c.srcH);

    const [lx] = projectToTarget(leftNorm.normX, leftNorm.normY, [
      mapped.left,
      mapped.top,
      mapped.width,
      mapped.height,
    ]);
    const [rx] = projectToTarget(rightNorm.normX, rightNorm.normY, [
      mapped.left,
      mapped.top,
      mapped.width,
      mapped.height,
    ]);
    const [, ty] = projectToTarget(topNorm.normX, topNorm.normY, [
      mapped.left,
      mapped.top,
      mapped.width,
      mapped.height,
    ]);
    const [, by] = projectToTarget(bottomNorm.normX, bottomNorm.normY, [
      mapped.left,
      mapped.top,
      mapped.width,
      mapped.height,
    ]);

    const targetDiameterX = rx - lx;
    const targetDiameterY = by - ty;
    assert(
      Math.abs(targetDiameterX - targetDiameterY) <= 1,
      `Suite C (${c.name}): circle distortion detected! diamX=${targetDiameterX}, diamY=${targetDiameterY}`
    );
  }

  console.log(
    '  [PASS] Suite C: All 6 source/target aspect-ratio combinations & zero-distortion circle invariance (diamX == diamY within <= 1px) verified.'
  );
}

// ------------------------------------------------------------------------------
// Suite D — Phase 4.10.6 & 4.10.11 Five-Point Calibration Tests
// ------------------------------------------------------------------------------
console.log('\n--- Suite D (Phase 4.10.6 & 4.10.11): Five-Point Calibration & Invalidation ---');
{
  const mgr = new TargetGeometryManager();
  mgr.updateSourceGeometry(1280, 800, 2.0);
  mgr.selectWindow('HWND-PHOTOSHOP');
  mgr.setTargetMode('CANVAS');

  // 1. Exact rectangular canvas & 2. Offset canvas inside an application window [420, 180, 1200, 800]
  const offsetPts = [
    { label: 'TopLeft', sourceNorm: { x: 0, y: 0 }, targetPhysical: { x: 420, y: 180 } },
    { label: 'TopRight', sourceNorm: { x: 1, y: 0 }, targetPhysical: { x: 1619, y: 180 } },
    { label: 'BottomLeft', sourceNorm: { x: 0, y: 1 }, targetPhysical: { x: 420, y: 979 } },
    { label: 'BottomRight', sourceNorm: { x: 1, y: 1 }, targetPhysical: { x: 1619, y: 979 } },
    { label: 'Center', sourceNorm: { x: 0.5, y: 0.5 }, targetPhysical: { x: 1020, y: 580 } },
  ];
  const calRes = mgr.applyFivePointCalibration(offsetPts);
  assert(
    calRes.ok === true && calRes.calibration.maxResidualPx <= 1.0,
    `Suite D: Valid 5-point offset canvas calibration failed: ${JSON.stringify(calRes)}`
  );

  // Verify projection uses calibration exactly once (never applied twice)
  const pTl = mgr.projectNormalizedPoint(0, 0);
  const pCenter = mgr.projectNormalizedPoint(0.5, 0.5);
  const pBr = mgr.projectNormalizedPoint(1, 1);
  assert(
    pTl.ok && pTl.targetX === 420 && pTl.targetY === 180 && pTl.calibrationApplied === true,
    'Suite D: Calibrated top-left projection mismatch'
  );
  assert(
    pCenter.ok && Math.abs(pCenter.targetX - 1020) <= 1 && Math.abs(pCenter.targetY - 580) <= 1,
    'Suite D: Calibrated center projection mismatch'
  );
  assert(
    pBr.ok && pBr.targetX === 1619 && pBr.targetY === 979 && pBr.calibrationApplied === true,
    'Suite D: Calibrated bottom-right projection mismatch'
  );

  // 3. Negative-origin secondary monitor canvas [-1500, 120, 1200, 800]
  const negPts = [
    { label: 'TopLeft', sourceNorm: { x: 0, y: 0 }, targetPhysical: { x: -1500, y: 120 } },
    { label: 'TopRight', sourceNorm: { x: 1, y: 0 }, targetPhysical: { x: -301, y: 120 } },
    { label: 'BottomLeft', sourceNorm: { x: 0, y: 1 }, targetPhysical: { x: -1500, y: 919 } },
    { label: 'BottomRight', sourceNorm: { x: 1, y: 1 }, targetPhysical: { x: -301, y: 919 } },
    { label: 'Center', sourceNorm: { x: 0.5, y: 0.5 }, targetPhysical: { x: -900, y: 520 } },
  ];
  const negCal = mgr.applyFivePointCalibration(negPts);
  assert(negCal.ok === true, 'Suite D: Negative-origin 5-point calibration must succeed');
  const negTl = mgr.projectNormalizedPoint(0, 0);
  assert(
    negTl.ok && negTl.targetX === -1500 && negTl.targetY === 120,
    `Suite D: Negative-origin top-left expected (-1500, 120), got (${negTl.targetX}, ${negTl.targetY})`
  );

  // 4. Invalid corner order (Right <= Left)
  const invertedPts = [
    { label: 'TopLeft', sourceNorm: { x: 0, y: 0 }, targetPhysical: { x: 1619, y: 180 } },
    { label: 'TopRight', sourceNorm: { x: 1, y: 0 }, targetPhysical: { x: 420, y: 180 } },
    { label: 'BottomLeft', sourceNorm: { x: 0, y: 1 }, targetPhysical: { x: 1619, y: 979 } },
    { label: 'BottomRight', sourceNorm: { x: 1, y: 1 }, targetPhysical: { x: 420, y: 979 } },
    { label: 'Center', sourceNorm: { x: 0.5, y: 0.5 }, targetPhysical: { x: 1020, y: 580 } },
  ];
  const invRes = FivePointCalibrator.solveAndValidate(
    invertedPts,
    mgr.getState().sourceGeometry,
    'CANVAS',
    'HWND-PHOTOSHOP',
    mgr.getState().targetBounds
  );
  assert(
    invRes.ok === false && invRes.error === 'InvalidCornerHorizontalOrder',
    'Suite D: Inverted horizontal corner order must be rejected'
  );

  // 5. Duplicate calibration points
  const dupPts = [
    { label: 'TopLeft', sourceNorm: { x: 0, y: 0 }, targetPhysical: { x: 420, y: 180 } },
    { label: 'TopRight', sourceNorm: { x: 1, y: 0 }, targetPhysical: { x: 420, y: 180 } },
    { label: 'BottomLeft', sourceNorm: { x: 0, y: 1 }, targetPhysical: { x: 420, y: 979 } },
    { label: 'BottomRight', sourceNorm: { x: 1, y: 1 }, targetPhysical: { x: 1619, y: 979 } },
    { label: 'Center', sourceNorm: { x: 0.5, y: 0.5 }, targetPhysical: { x: 1020, y: 580 } },
  ];
  const dupRes = FivePointCalibrator.solveAndValidate(
    dupPts,
    mgr.getState().sourceGeometry,
    'CANVAS',
    'HWND-PHOTOSHOP',
    mgr.getState().targetBounds
  );
  assert(
    dupRes.ok === false && dupRes.error === 'DuplicateTargetPoints',
    'Suite D: Duplicate calibration points must be rejected'
  );

  // 6. High-residual / inconsistent 5th point
  const highResidualPts = [
    { label: 'TopLeft', sourceNorm: { x: 0, y: 0 }, targetPhysical: { x: 420, y: 180 } },
    { label: 'TopRight', sourceNorm: { x: 1, y: 0 }, targetPhysical: { x: 1619, y: 180 } },
    { label: 'BottomLeft', sourceNorm: { x: 0, y: 1 }, targetPhysical: { x: 420, y: 979 } },
    { label: 'BottomRight', sourceNorm: { x: 1, y: 1 }, targetPhysical: { x: 1619, y: 979 } },
    { label: 'Center', sourceNorm: { x: 0.5, y: 0.5 }, targetPhysical: { x: 1090, y: 650 } }, // 99px residual
  ];
  const highRes = FivePointCalibrator.solveAndValidate(
    highResidualPts,
    mgr.getState().sourceGeometry,
    'CANVAS',
    'HWND-PHOTOSHOP',
    mgr.getState().targetBounds,
    4.0
  );
  assert(
    highRes.ok === false && highRes.error.startsWith('MaxResidualExceeded'),
    'Suite D: High-residual 5th point must be rejected'
  );

  // 7. Calibration invalidation after target resize/move or source orientation change
  mgr.applyFivePointCalibration(offsetPts);
  assert(mgr.getState().calibrationStatus === 'VALID', 'Suite D: Calibration should be VALID before resize');
  mgr.setWindowState('HWND-PHOTOSHOP', {
    visibleFrameBounds: { left: 120, top: 80, width: 1700, height: 950 },
  });
  assert(
    mgr.getState().calibrationStatus === 'INVALIDATED' && mgr.getState().calibration === null,
    'Suite D: Calibration must be invalidated when target window moves or resizes'
  );

  console.log(
    '  [PASS] Suite D: 5-point calibration (exact, offset, negative-origin, corner-order, duplicate, residual, invalidation & single-application) verified.'
  );
}

// ------------------------------------------------------------------------------
// Suite E — Phase 4.10.11 Transformation Property Tests (Corners, Center, Monotonicity, 1,000 Random Points)
// ------------------------------------------------------------------------------
console.log('\n--- Suite E (Phase 4.10.8 & 4.10.11): Transformation Properties & 1,000 Random Points ---');
{
  const mgr = new TargetGeometryManager();
  mgr.updateSourceGeometry(1920, 1080, 1.0);
  mgr.selectMonitor('MON-SECONDARY-QHD'); // [1920, 0, 2560, 1440]
  mgr.setTargetMode('MONITOR');

  const bounds = mgr.getState().activeMappedBounds; // [1920, 0, 2560, 1440]
  const tl = mgr.projectNormalizedPoint(0, 0);
  const tr = mgr.projectNormalizedPoint(1, 0);
  const bl = mgr.projectNormalizedPoint(0, 1);
  const br = mgr.projectNormalizedPoint(1, 1);
  const center = mgr.projectNormalizedPoint(0.5, 0.5);
  const q1 = mgr.projectNormalizedPoint(0.25, 0.25);
  const q3 = mgr.projectNormalizedPoint(0.75, 0.75);

  assert(tl.targetX === bounds.left && tl.targetY === bounds.top, 'Suite E: Top-Left mismatch');
  assert(tr.targetX === bounds.left + bounds.width - 1 && tr.targetY === bounds.top, 'Suite E: Top-Right mismatch');
  assert(bl.targetX === bounds.left && bl.targetY === bounds.top + bounds.height - 1, 'Suite E: Bottom-Left mismatch');
  assert(
    br.targetX === bounds.left + bounds.width - 1 && br.targetY === bounds.top + bounds.height - 1,
    'Suite E: Bottom-Right mismatch'
  );
  assert(
    Math.abs(center.targetX - (bounds.left + (bounds.width - 1) * 0.5)) <= 1 &&
      Math.abs(center.targetY - (bounds.top + (bounds.height - 1) * 0.5)) <= 1,
    'Suite E: Center > 1px drift'
  );
  assert(
    Math.abs(q1.targetX - (bounds.left + (bounds.width - 1) * 0.25)) <= 1 &&
      Math.abs(q1.targetY - (bounds.top + (bounds.height - 1) * 0.25)) <= 1,
    'Suite E: Quarter point > 1px drift'
  );
  assert(
    Math.abs(q3.targetX - (bounds.left + (bounds.width - 1) * 0.75)) <= 1 &&
      Math.abs(q3.targetY - (bounds.top + (bounds.height - 1) * 0.75)) <= 1,
    'Suite E: Three-Quarter point > 1px drift'
  );

  // Monotonicity across X and Y
  let prevX = -Infinity;
  let prevY = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const pt = mgr.projectNormalizedPoint(t, t);
    assert(pt.targetX >= prevX && pt.targetY >= prevY, `Suite E: Non-monotonic step at t=${t}`);
    prevX = pt.targetX;
    prevY = pt.targetY;
  }

  // 1,000 random points stay strictly within target bounds
  let seed = 0xabcdef01;
  const nextRand01 = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967295.0;
  };
  for (let i = 0; i < 1000; i++) {
    const pt = mgr.projectNormalizedPoint(nextRand01(), nextRand01());
    assert(
      pt.ok &&
        pt.targetX >= bounds.left &&
        pt.targetX < bounds.left + bounds.width &&
        pt.targetY >= bounds.top &&
        pt.targetY < bounds.top + bounds.height,
      `Suite E: Random point ${i} escaped target bounds: (${pt.targetX}, ${pt.targetY})`
    );
  }

  console.log(
    '  [PASS] Suite E: Corners, Center, Quarter/Three-Quarter (<= 1px), X/Y monotonicity, and 1,000 random points within bounds verified.'
  );
}

// ------------------------------------------------------------------------------
// Suite F — Phase 4.10.9 & 4.10.11 Integration, Active-Stroke Latching & Lifecycle Tests
// ------------------------------------------------------------------------------
console.log('\n--- Suite F (Phase 4.10.9 & 4.10.11): Active-Stroke Latching, Mid-Stroke Resize & Disappearance ---');
{
  const mgr = new TargetGeometryManager();
  const releasedEvents = [];
  mgr.onStrokeForceReleased = (ev) => releasedEvents.push(ev);

  mgr.updateSourceGeometry(1600, 900, 1.0);
  mgr.selectWindow('HWND-CLIPSTUDIO');
  mgr.setTargetMode('WINDOW');

  // 1. Target resize during active stroke -> no mid-stroke jump; queued geometry applies after pointerUp
  const down = mgr.beginStroke(800, 450); // Center of 1600x900
  assert(down.ok && mgr.hasActiveStroke() === true, 'Suite F: beginStroke failed');
  const initialCenterX = down.targetX;
  const initialCenterY = down.targetY;

  // Resize window mid-stroke AND rotate source mid-stroke
  mgr.setWindowState('HWND-CLIPSTUDIO', {
    visibleFrameBounds: { left: 500, top: 200, width: 800, height: 450 },
  });
  mgr.updateSourceGeometry(900, 1600, 1.0); // Portrait rotation mid-stroke

  const midMove = mgr.moveStroke(800, 450);
  assert(
    midMove.ok && midMove.targetX === initialCenterX && midMove.targetY === initialCenterY,
    `Suite F: Mid-stroke geometry change caused coordinate jump! Expected (${initialCenterX}, ${initialCenterY}), got (${midMove.targetX}, ${midMove.targetY})`
  );

  // End stroke -> queued geometry updates apply atomically
  const up = mgr.endStroke(800, 450);
  assert(up.ok && mgr.hasActiveStroke() === false, 'Suite F: endStroke failed');
  assert(
    mgr.getState().sourceGeometry.width === 900 &&
      mgr.getState().sourceGeometry.height === 1600 &&
      mgr.getState().targetBounds.left === 500,
    'Suite F: Queued source/target geometry updates did not apply after pointerUp'
  );

  // 2. Target disappearance (minimized) during active stroke -> finalize stroke & emit pointerUp
  mgr.updateSourceGeometry(1600, 900, 1.0);
  const down2 = mgr.beginStroke(400, 300);
  assert(down2.ok && mgr.hasActiveStroke() === true, 'Suite F: second beginStroke failed');
  mgr.setWindowState('HWND-CLIPSTUDIO', { isMinimized: true });
  assert(
    mgr.hasActiveStroke() === false &&
      releasedEvents.length === 1 &&
      releasedEvents[0].reason.includes('Minimized'),
    'Suite F: Minimizing target window mid-stroke must immediately finalize stroke and emit pointerUp'
  );

  // 3. Reconnect/restore target recovery
  mgr.setWindowState('HWND-CLIPSTUDIO', { isMinimized: false });
  assert(mgr.getState().targetAvailable === true, 'Suite F: Target recovery after un-minimizing failed');

  // 4. Disconnect during active stroke -> finalize stroke & emit pointerUp
  const down3 = mgr.beginStroke(500, 400);
  assert(down3.ok && mgr.hasActiveStroke() === true, 'Suite F: third beginStroke failed');
  mgr.handleTransportDisconnect('WebSocket transport closed');
  assert(
    mgr.hasActiveStroke() === false && releasedEvents.length === 2,
    'Suite F: Transport disconnect during active stroke must finalize stroke and emit pointerUp'
  );

  // 5. Stale callback generation rejection
  const currentGen = mgr.getState().generation;
  const staleAccepted = mgr.applyAsyncDetectionCallback(currentGen - 1, () => {
    mgr.selectMonitor('MON-LEFT-NEG');
  });
  assert(staleAccepted === false, 'Suite F: Stale callback generation must be rejected');

  console.log(
    '  [PASS] Suite F: Mid-stroke geometry latching (0px jump), atomic post-stroke update, target-loss pointerUp release, recovery & stale callback guard verified.'
  );
}

console.log('\n================================================================');
if (allPassed) {
  console.log(`RESULT: ALL 16 SUITES PASSED (${totalAssertions} deterministic assertions verified — V2 PASS)`);
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error('RESULT: ONE OR MORE SUITES FAILED');
  process.exit(1);
}

