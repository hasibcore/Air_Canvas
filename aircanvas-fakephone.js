#!/usr/bin/env node
'use strict';
/*
 * Air Canvas "fake phone" — draws a rabbit, a tiger and a line of text through the
 * 13-byte pointer protocol, and can hunt for server crashes with safe, seeded stress tests.
 *
 * Zero dependencies. Needs Node 18+ (Node 22+ has a built-in WebSocket client; older Node can use `npm i ws`).
 *
 * Frame layout (little-endian, 13 bytes):
 *   [0] event 0=down 1=move 2=up 3=hover   [1-2] x uint16 (round(norm*65535))   [3-4] y uint16
 *   [5-6] pressure uint16 (round(p*1024))    [7] tool 0=pen 1=eraser 2=laser
 *   [8-11] timestamp uint32 (ms, low 32 bits)   [12] protocol version = 1
 *
 * SAFETY: draw/storm modes move the REAL pointer on the PC if your server injects pen input.
 * Open an empty Paint canvas first. Press Ctrl+C to abort (a pointer-Up is sent before closing).
 * Stress mode sends only frames that are INVALID (and verifies that no byte window looks like a valid frame).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const __dirname = path.dirname(__filename);
 
// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'help';
function opt(name, def) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const has = (n) => argv.includes('--' + n);
const num = (name, def) => { const v = opt(name, def); const n = Number(v); if (Number.isNaN(n) || v === true) die(`--${name} must be a number`); return n; };
function die(msg) { console.error('error: ' + msg); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
 
// ------------------------------------------------------------------ protocol
const EV = { down: 0, move: 1, up: 2, hover: 3 };
function clamp01(v) { if (!(v === v)) throw new Error('NaN coordinate'); return v < 0 ? 0 : v > 1 ? 1 : v; }
function encodeFrame(type, nx, ny, p, tool, ts) {
  const b = Buffer.alloc(13);
  b[0] = type;
  b.writeUInt16LE(Math.round(clamp01(nx) * 65535), 1);
  b.writeUInt16LE(Math.round(clamp01(ny) * 65535), 3);
  b.writeUInt16LE(Math.round(clamp01(p) * 1024), 5);
  b[7] = tool;
  b.writeUInt32LE(ts >>> 0, 8);
  b[12] = 1;
  return b;
}
function validHeader(b, i) { return b[i] <= 3 && b[i + 7] <= 2 && b[i + 12] === 1; }
function decodeFrame(b, i = 0) {
  if (b.length - i < 13 || !validHeader(b, i)) return null;
  return { type: b[i], x: b.readUInt16LE(i + 1), y: b.readUInt16LE(i + 3), p: b.readUInt16LE(i + 5), tool: b[i + 7], ts: b.readUInt32LE(i + 8) };
}
 
// ------------------------------------------------------------------ SplitMix64 (same as the campaign prompt, Appendix A)
const M64 = (1n << 64n) - 1n;
class SplitMix64 {
  constructor(seed) { this.s = BigInt.asUintN(64, BigInt(seed)); }
  next() {
    this.s = (this.s + 0x9E3779B97F4A7C15n) & M64;
    let z = this.s;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M64;
    return z ^ (z >> 31n);
  }
  double() { return Number(this.next() >> 11n) * 2 ** -53; }
  below(n) { return Math.floor(this.double() * n); }
  byte() { return this.below(256); }
  bytes(n) { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = this.byte(); return b; }
}
 
// ------------------------------------------------------------------ drawing (design space 1600 x 900, y down)
const DW = 1600, DH = 900;
const rad = (d) => (d * Math.PI) / 180;
function arc(cx, cy, rx, ry, a0, a1, rot = 0, n) {
  const steps = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6));
  const cr = Math.cos(rad(rot)), sr = Math.sin(rad(rot)), pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / steps), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}
const ellipse = (cx, cy, rx, ry, rot = 0, start = 0) => arc(cx, cy, rx, ry, start, start + 360, rot);
function bez(p0, p1, p2, p3, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
const mir = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]);
const join = (...parts) => parts.flat().filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9);
 
// keep only the parts of a polyline that lie OUTSIDE an ellipse (hides lines that would be behind the head)
function clipOut(pts, cx, cy, rx, ry) {
  const inside = ([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.985;
  const runs = []; let cur = [];
  for (const pt of pts) { if (inside(pt)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(pt); }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
function rabbit() {
  const cx = 400, S = [];
  S.push(ellipse(cx, 340, 125, 105)); // head
  const head = [cx, 340, 125, 105];
  S.push(...clipOut(arc(342, 135, 40, 118, 90, 450, -10, 120), ...head), ...clipOut(arc(458, 135, 40, 118, 90, 450, 10, 120), ...head)); // ears (hidden behind the head)
  S.push(ellipse(344, 140, 20, 85, -10), ellipse(456, 140, 20, 85, 10)); // inner ears
  S.push(ellipse(360, 318, 11, 13), ellipse(440, 318, 11, 13)); // eyes
  S.push(ellipse(362, 320, 4, 5), ellipse(438, 320, 4, 5)); // pupils
  S.push([[388, 350], [412, 350], [400, 366], [388, 350]]); // nose
  S.push([[400, 366], [400, 378]]);
  const m = bez([400, 378], [395, 392], [382, 392], [372, 382]);
  S.push(m, mir(m, cx)); // mouth
  for (const w of [[[355, 362], [262, 344]], [[355, 370], [258, 372]], [[356, 378], [266, 402]]]) S.push(w, mir(w, cx)); // whiskers
  S.push(arc(cx, 525, 150, 115, -35, 215)); // body
  S.push([[277, 459], [322, 415]], [[523, 459], [478, 415]]); // shoulders
  S.push(ellipse(345, 608, 32, 17), ellipse(455, 608, 32, 17)); // paws
  S.push(ellipse(560, 540, 30, 30), arc(560, 540, 16, 16, 200, 340)); // tail
  return S;
}
function tiger() {
  const cx = 1200, S = [], head = [cx, 330, 175, 140];
  S.push(ellipse(cx, 330, 175, 140)); // head
  const ear = clipOut(arc(1085, 225, 48, 46, 150, 390, 0, 90), ...head), earIn = clipOut(arc(1085, 228, 26, 24, 150, 390, 0, 60), ...head);
  for (const e of [...ear, ...earIn]) S.push(e, mir(e, cx));
  // forehead: bold "king" stripes
  S.push([[1200, 192], [1200, 268]], [[1166, 197], [1176, 255]], [[1234, 197], [1224, 255]], [[1132, 208], [1148, 244]], [[1268, 208], [1252, 244]]);
  // cheek stripes (wedges pointing to the nose)
  for (const c of [[[1030, 285], [1098, 308]], [[1028, 330], [1100, 340]], [[1038, 378], [1106, 374]], [[1062, 420], [1118, 400]]]) S.push(c, mir(c, cx));
  const eye = join(bez([1130, 318], [1148, 292], [1178, 292], [1190, 312]), bez([1190, 312], [1172, 334], [1148, 334], [1130, 318]));
  S.push(eye, mir(eye, cx), ellipse(1160, 314, 7, 9), ellipse(1240, 314, 7, 9)); // eyes
  S.push([[1180, 362], [1220, 362], [1200, 386], [1180, 362]]); // nose
  S.push([[1200, 386], [1200, 408]]);
  const m = bez([1200, 408], [1196, 428], [1172, 432], [1156, 420]);
  S.push(m, mir(m, cx)); // mouth
  for (const w of [[[1150, 404], [1030, 380]], [[1150, 414], [1022, 416]], [[1152, 424], [1034, 452]]]) S.push(w, mir(w, cx)); // whiskers
  const side = bez([1062, 440], [1000, 500], [990, 560], [1000, 615]);
  S.push(side, mir(side, cx), bez([1000, 615], [1100, 640], [1300, 640], [1400, 615])); // shoulders and chest
  for (const c of [[[1004, 505], [1066, 520]], [[998, 548], [1070, 560]], [[1000, 590], [1064, 598]]]) S.push(c, mir(c, cx)); // body stripes
  S.push(ellipse(1120, 636, 48, 18), ellipse(1280, 636, 48, 18)); // paws
  const tail = bez([1392, 560], [1480, 560], [1520, 470], [1470, 410]); // tail with stripes
  S.push(tail);
  for (const t of [0.25, 0.5, 0.75]) { const u = 1 - t, x = u*u*u*1392 + 3*u*u*t*1480 + 3*u*t*t*1520 + t*t*t*1470, y = u*u*u*560 + 3*u*u*t*560 + 3*u*t*t*470 + t*t*t*410; S.push([[x - 18, y + 4], [x + 6, y - 10]]); }
  return S;
}
// single-stroke font: cap height = 1, baseline y = 1, y down. Only these glyphs exist.
const GLYPHS = {
  W: { w: 1.3, s: [[[0, 0], [0.3, 1], [0.65, 0.25], [1.0, 1], [1.3, 0]]] },
  A: { w: 1.0, s: [[[0, 1], [0.5, 0], [1, 1]], [[0.2, 0.64], [0.8, 0.64]]] },
  N: { w: 0.9, s: [[[0, 1], [0, 0], [0.9, 1], [0.9, 0]]] },
  F: { w: 0.75, s: [[[0.75, 0], [0, 0], [0, 1]], [[0, 0.48], [0.6, 0.48]]] },
  U: { w: 0.9, s: [join([[0, 0]], arc(0.45, 0.62, 0.45, 0.38, 180, 0), [[0.9, 0]])] },
  K: { w: 0.9, s: [[[0, 0], [0, 1]], [[0.85, 0], [0, 0.58], [0.9, 1]]] },
  c: { w: 0.68, s: [arc(0.36, 0.66, 0.34, 0.34, 320, 40)] },
  y: { w: 0.7, s: [[[0, 0.32], [0.36, 1.0]], [[0.7, 0.32], [0.4, 1.0], [0.22, 1.28], [0.04, 1.32]]] },
  o: { w: 0.76, s: [ellipse(0.38, 0.66, 0.37, 0.34, 0, 270)] },
  u: { w: 0.66, s: [join([[0, 0.32]], arc(0.33, 0.76, 0.33, 0.24, 180, 0), [[0.66, 0.32]]), [[0.66, 0.55], [0.66, 1.0]]] },
  ' ': { w: 0.55, s: [] },
};
function textStrokes(text, box) {
  const gap = 0.18, chars = [...text].filter((c) => { if (!GLYPHS[c]) { console.error(`warning: no glyph for "${c}", skipped`); return false; } return true; });
  let total = 0; chars.forEach((c, i) => { total += GLYPHS[c].w + (i < chars.length - 1 ? gap : 0); });
  const cap = Math.min(box.w / total, box.h / 1.32);
  const x0 = box.x + (box.w - total * cap) / 2, y0 = box.y + (box.h - 1.32 * cap) / 2;
  const S = []; let x = x0;
  for (const c of chars) {
    for (const st of GLYPHS[c].s) S.push(st.map(([gx, gy]) => [x + gx * cap, y0 + gy * cap]));
    x += (GLYPHS[c].w + gap) * cap;
  }
  return S;
}
function buildScene(which, text) {
  let S = [];
  if (which === 'all' || which === 'rabbit') S = S.concat(rabbit());
  if (which === 'all' || which === 'tiger') S = S.concat(tiger());
  if (which === 'all' || which === 'text') S = S.concat(textStrokes(text, { x: 100, y: 665, w: 1400, h: 220 }));
  return S;
}
function resample(pts, step) {
  const out = [pts[0]]; let need = step;
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; let d = Math.hypot(x1 - x0, y1 - y0);
    while (d >= need) { const t = need / d; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; out.push([x0, y0]); d = Math.hypot(x1 - x0, y1 - y0); need = step; }
    need -= d;
  }
  const last = pts[pts.length - 1], l = out[out.length - 1];
  if (Math.hypot(last[0] - l[0], last[1] - l[1]) > 1e-6) out.push(last);
  return out;
}
// map design space to normalized 0..1 so that shapes keep their proportions on a target of aspect A = width/height
function fitter(A) {
  const k = Math.min((0.94 * A) / DW, 0.94 / DH);
  const ox = (1 - (DW * k) / A) / 2, oy = (1 - DH * k) / 2;
  return ([x, y]) => [(x * k) / A + ox, y * k + oy];
}
function parseAspect(v) {
  if (typeof v === 'number') return v;
  const m = String(v).match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(v); if (n > 0) return n; die('--aspect must look like 16:9, 1366x768 or 1.78');
}
function buildFrames(strokes, o) {
  const fit = fitter(o.aspect), frames = [], dt = 1000 / o.rate; let t = 0, prev = null;
  for (const raw of strokes) {
    const pts = resample(raw, o.step).map(fit);
    if (pts.length < 2) continue;
    if (o.hover && prev) { // hover travel from the previous stroke end to this start: tests "no line on hover" in the server
      const d = Math.hypot(pts[0][0] - prev[0], pts[0][1] - prev[1]), n = Math.max(4, Math.min(40, Math.round(d / 0.02)));
      for (let i = 1; i <= n; i++) { frames.push({ t, type: EV.hover, nx: prev[0] + ((pts[0][0] - prev[0]) * i) / n, ny: prev[1] + ((pts[0][1] - prev[1]) * i) / n, p: 0 }); t += dt; }
    }
    pts.forEach(([nx, ny], i) => {
      const last = i === pts.length - 1, first = i === 0;
      frames.push({ t, type: first ? EV.down : last ? EV.up : EV.move, nx, ny, p: last ? 0 : 0.25 + 0.65 * Math.sin((Math.PI * i) / (pts.length - 1)) });
      t += dt;
    });
    prev = pts[pts.length - 1]; t += o.gap;
  }
  return frames;
}
 
// ------------------------------------------------------------------ transports
function tryWS() { if (globalThis.WebSocket) return globalThis.WebSocket; try { return require('ws'); } catch { die('WebSocket needs Node 22+ or `npm i ws`'); } }
function connect(o, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    if (o.transport === 'tcp') {
      const s = net.createConnection({ host: o.host, port: o.port }); s.setNoDelay(true);
      const to = setTimeout(() => { s.destroy(); reject(new Error('connect timeout')); }, timeoutMs);
      const tr = { kind: 'tcp', closed: false, raw: s,
        async send(bufs) { const b = Buffer.concat(bufs); if (!s.write(b)) await new Promise((r) => { const f = () => r(); s.once('drain', f); s.once('close', f); }); },
        sendRaw(b) { return this.send([b]); }, close() { s.end(); }, reset() { s.resetAndDestroy ? s.resetAndDestroy() : s.destroy(); }, destroy() { s.destroy(); } };
      s.on('close', () => { tr.closed = true; }); s.on('error', () => {});
      s.once('connect', () => { clearTimeout(to); resolve(tr); });
      s.once('error', (e) => { clearTimeout(to); reject(e); });
    } else {
      const WS = tryWS(), ws = new WS(`ws://${o.host}:${o.port}${o.path}`); ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('connect timeout')); }, timeoutMs);
      const tr = { kind: 'ws', closed: false, raw: ws,
        async send(bufs) { for (const b of bufs) { ws.send(b); while (ws.bufferedAmount > 1e6 && !tr.closed) await sleep(1); } },
        sendRaw(b) { return this.send([b]); }, sendText(s) { ws.send(s); }, close() { try { ws.close(); } catch {} }, reset() { try { ws.close(); } catch {} }, destroy() { try { ws.close(); } catch {} } };
      ws.onopen = () => {
        clearTimeout(to);
        if (o.auth) {
          try {
            ws.send(JSON.stringify({ type: 'hello', v: 1, deviceId: 'aircanvas-fakephone', name: 'FakePhone', platform: 'node', appVersion: '2.0.3' }));
          } catch {}
        }
        resolve(tr);
      };
      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : (event.toString ? event.toString() : '');
          const data = JSON.parse(raw);
          if (data.type === 'challenge') {
            ws.send(JSON.stringify({ type: 'pair', pin: o.pin || '123456' }));
          }
        } catch {}
      };
      ws.onerror = (e) => { clearTimeout(to); reject(new Error('websocket error')); };
      ws.onclose = () => { tr.closed = true; };
    }
  });
}
 
// ------------------------------------------------------------------ draw
async function play(frames, tr, o) {
  const t0 = process.hrtime.bigint(), now = () => Number(process.hrtime.bigint() - t0) / 1e6;
  const base = o.ts === 'rel' ? 0 : Date.now();
  let i = 0, pressed = false, last = null, aborted = false;
  const onSig = () => { aborted = true; }; process.once('SIGINT', onSig);
  const mk = (f) => encodeFrame(f.type, f.nx, f.ny, f.p, 0, base + Math.round(f.t));
  while (i < frames.length && !aborted && !tr.closed) {
    const wait = frames[i].t - now();
    if (wait > 1.5) { await sleep(wait - 1); continue; }
    const batch = [];
    while (i < frames.length && frames[i].t <= now() + 0.25 && batch.length < 64) {
      const f = frames[i++]; batch.push(mk(f)); last = f;
      if (f.type === EV.down) pressed = true; else if (f.type === EV.up) pressed = false;
    }
    if (!batch.length) { await sleep(0); continue; }
    await tr.send(batch);
  }
  if (pressed && last && !tr.closed) await tr.send([encodeFrame(EV.up, last.nx, last.ny, 0, 0, base + Math.round(now()))]); // never leave the pen down
  process.removeListener('SIGINT', onSig);
  return { sent: i, total: frames.length, aborted, seconds: now() / 1000 };
}
function readOpts() {
  return { host: String(opt('host', '127.0.0.1')), port: num('port', 9090), transport: String(opt('transport', 'tcp')), path: String(opt('path', '/')),
    rate: num('rate', 120), step: num('step', 4), gap: num('gap', 80), aspect: parseAspect(opt('aspect', '16:9')), hover: has('hover'),
    ts: String(opt('ts', 'epoch')), what: String(opt('only', 'all')), text: String(opt('text', 'WANNA FUcK you')), auth: has('auth'), pin: String(opt('pin', '123456')) };
}
async function cmdDraw() {
  const o = readOpts(); if (!['tcp', 'ws'].includes(o.transport)) die('--transport must be tcp or ws');
  const strokes = buildScene(o.what, o.text), frames = buildFrames(strokes, o);
  console.log(`scene: ${strokes.length} strokes, ${frames.length} frames, about ${(frames[frames.length - 1].t / 1000).toFixed(1)} s at ${o.rate} Hz, aspect ${o.aspect.toFixed(3)}`);
  if (has('dry-run')) return console.log('dry run: nothing sent');
  const wait = num('countdown', 5);
  console.log(`\nTarget: ${o.transport}://${o.host}:${o.port}. This will move the REAL pointer on the PC.\nOpen an empty Paint canvas and click on it. Starting in ${wait} s — Ctrl+C aborts.`);
  await sleep(wait * 1000);
  const tr = await connect(o).catch((e) => die(`cannot connect: ${e.message}`));
  const r = await play(frames, tr, o); tr.close(); await sleep(100);
  console.log(`done: ${r.sent}/${r.total} frames in ${r.seconds.toFixed(1)} s${r.aborted ? ' (aborted; pen released)' : ''}${tr.closed ? '' : ''}`);
}
function cmdDump() {
  const o = readOpts(), strokes = buildScene(o.what, o.text), frames = buildFrames(strokes, o);
  const out = String(opt('out', 'frames.bin')), base = o.ts === 'rel' ? 0 : 1700000000000;
  fs.writeFileSync(out, Buffer.concat(frames.map((f) => encodeFrame(f.type, f.nx, f.ny, f.p, 0, base + Math.round(f.t)))));
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DW} ${DH}" width="${DW / 2}" height="${DH / 2}"><rect width="100%" height="100%" fill="#fff"/>`,
    ...strokes.map((s) => `<polyline fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${s.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`), '</svg>'].join('\n');
  fs.writeFileSync(out.replace(/\.bin$/, '') + '.svg', svg);
  console.log(`wrote ${out} (${frames.length} frames, ${frames.length * 13} bytes) and ${out.replace(/\.bin$/, '')}.svg`);
}
 
// ------------------------------------------------------------------ stress (safe: invalid input only) and storm (hover only)
function sanitize(tail, buf) { // no 13-byte window anywhere may look like a valid frame
  const tmp = Buffer.concat([tail, buf]); let fixed = 0;
  for (let i = 0; i + 13 <= tmp.length; i++) if (validHeader(tmp, i)) { const j = i + 12 - tail.length; if (j < 0) continue; buf[j] = 0xff; tmp[i + 12] = 0xff; fixed++; }
  return fixed;
}
class SafeWriter {
  constructor(tr, perMessage) { this.tr = tr; this.tail = Buffer.alloc(0); this.perMessage = perMessage; this.bytes = 0; }
  async write(buf) {
    sanitize(this.perMessage ? Buffer.alloc(0) : this.tail, buf);
    if (!this.perMessage) this.tail = Buffer.concat([this.tail, buf]).subarray(-12);
    this.bytes += buf.length; await this.tr.send([buf]);
  }
}
function badFrame(rng) {
  const b = rng.bytes(13); b[0] = rng.below(4); b[7] = rng.below(3); b[12] = 1; // start valid, then break exactly one header field
  const k = rng.below(3);
  if (k === 0) b[0] = 4 + rng.below(252); else if (k === 1) b[7] = 3 + rng.below(253); else b[12] = [0, 2, 3, 255, 128][rng.below(5)];
  return b;
}
const TCP_KINDS = ['garbage', 'badHeader', 'truncated', 'bigPayload', 'slowDrip', 'churn', 'halfOpen'];
const WS_KINDS = ['garbage', 'badHeader', 'truncated', 'bigPayload', 'churn', 'halfOpen', 'wsBadBinary', 'wsText'];
async function runCase(kind, rng, o) {
  const ws = o.transport === 'ws';
  if (kind === 'churn') {
    const n = 20 + rng.below(80); let reset = 0;
    for (let i = 0; i < n; i++) {
      const tr = await connect(o, 2000); const w = new SafeWriter(tr, ws);
      if (rng.below(2)) await w.write(rng.bytes(1 + rng.below(40)));
      if (rng.below(2)) { tr.reset(); reset++; } else tr.close();
    }
    return `${n} connections (${reset} reset)`;
  }
  if (kind === 'halfOpen') {
    const n = 20 + rng.below(60), trs = [];
    for (let i = 0; i < n; i++) trs.push(await connect(o, 2000).catch(() => null));
    const mid = await liveness(o, true); await sleep(500);
    trs.forEach((t) => t && t.destroy());
    return `${trs.filter(Boolean).length}/${n} idle connections held; probe during hold: ${mid.ok ? 'ok' : 'FAILED'}`;
  }
  const tr = await connect(o, 2000), w = new SafeWriter(tr, ws); let desc = '';
  try {
    if (kind === 'garbage') { const b = rng.bytes(1 + rng.below(4096)); await w.write(b); desc = `${b.length} random bytes`; }
    else if (kind === 'badHeader') { const n = 1 + rng.below(200), parts = []; for (let i = 0; i < n; i++) parts.push(badFrame(rng)); const b = Buffer.concat(parts); await w.write(b); desc = `${n} frames with one broken header field`; }
    else if (kind === 'truncated') { const f = badFrame(rng), k = 1 + rng.below(12); await w.write(f.subarray(0, k)); desc = `${k}-byte fragment, then close`; }
    else if (kind === 'bigPayload') { const sz = [65536, 1 << 20, 4 << 20][rng.below(3)]; if (ws && sz > (1 << 20)) { await w.write(rng.bytes(1 << 20)); desc = '1 MiB message'; } else { const b = rng.bytes(sz); await w.write(b); desc = `${sz} bytes in one write`; } }
    else if (kind === 'slowDrip') { const b = rng.bytes(24 + rng.below(40)); for (let i = 0; i < b.length; i++) { await w.write(b.subarray(i, i + 1)); await sleep(15); } desc = `${b.length} bytes, one at a time`; }
    else if (kind === 'wsBadBinary') { const len = [0, 1, 12, 14, 26, 1301][rng.below(6)]; await w.write(rng.bytes(len)); desc = `binary message of ${len} bytes`; }
    else if (kind === 'wsText') {
      const T = ['not json', '{', 'null', '[]', '{"type":null}', '{"type":"zzz-unknown"}', '{"__proto__":{"polluted":1}}', '"' + 'x'.repeat(70000) + '"', '['.repeat(5000), '{"a":'.repeat(2000)];
      const t = T[rng.below(T.length)]; tr.sendText(t); desc = `text message (${t.length} chars)`;
    }
    await sleep(30);
  } finally { rng.below(2) ? tr.close() : tr.reset(); }
  return desc;
}
async function liveness(o, quick) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tr = await connect(o, 2000); await sleep(quick ? 60 : 250); const early = tr.closed; tr.close();
      if (!early) return { ok: true };
      return { ok: false, why: 'a fresh idle connection was closed by the server within 250 ms' };
    } catch (e) { if (attempt === 1) return { ok: false, why: `cannot connect: ${e.message}` }; await sleep(500); }
  }
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
async function stress(o, quiet) {
  const rng = new SplitMix64(o.seed), kinds = o.transport === 'ws' ? WS_KINDS : TCP_KINDS, t0 = Date.now(), counts = {}, failures = [];
  let n = 0, stopFlag = false; const onSig = () => { stopFlag = true; }; process.once('SIGINT', onSig);
  while (!stopFlag && n < o.maxCases && (o.forever || Date.now() - t0 < o.duration * 1000)) {
    n++; const cs = rng.next(), crng = new SplitMix64(cs), kind = kinds[crng.below(kinds.length)]; counts[kind] = (counts[kind] || 0) + 1;
    let desc = '', problem = null;
    try { desc = await runCase(kind, crng, o); } catch (e) { desc = 'client error: ' + e.message; }
    if (o.pid && !pidAlive(o.pid)) problem = `server process ${o.pid} is no longer running (crash?)`;
    if (!problem) { const lv = await liveness(o); if (!lv.ok) problem = lv.why; }
    if (problem) { failures.push({ n, kind, seed: '0x' + cs.toString(16), desc, problem }); console.log(`\n#${n} FAIL kind=${kind} seed=0x${cs.toString(16)} (${desc})\n     -> ${problem}\n     reproduce: node ${path.basename(__filename)} stress --seed ${o.seed} --max-cases ${n} --host ${o.host} --port ${o.port} --transport ${o.transport}`); if (!o.keepGoing) break; }
    else if (!quiet && (o.verbose || n % 25 === 0)) console.log(`#${n} ok  kind=${kind} seed=0x${cs.toString(16)}  ${desc}`);
  }
  process.removeListener('SIGINT', onSig);
  const secs = (Date.now() - t0) / 1000;
  return { cases: n, seconds: secs, counts, failures };
}
async function cmdStress() {
  const o = { ...readOpts(), seed: opt('seed', '12345'), duration: num('duration', 60), maxCases: num('max-cases', Infinity), forever: has('forever'), keepGoing: has('keep-going'), verbose: has('verbose'), pid: opt('pid', null) ? num('pid', 0) : null };
  console.log(`stress ${o.transport}://${o.host}:${o.port} seed=${o.seed}${o.forever ? ' forever (Ctrl+C to stop)' : ` for ${o.duration}s`}${o.pid ? ` watching pid ${o.pid}` : ''}`);
  console.log('Only INVALID input is sent (and checked so that no byte window looks like a valid frame). Raw TCP has no reply, so also use --pid or watch the server.');
  const r = await stress(o);
  console.log(`\n${r.cases} cases in ${r.seconds.toFixed(1)} s; by kind: ${JSON.stringify(r.counts)}\n${r.failures.length ? `RESULT: ${r.failures.length} problem(s) — the first one is reproducible with the seed above` : 'RESULT: no crash, hang, or refused connection detected (this is not proof that none exists)'}`);
  process.exit(r.failures.length ? 1 : 0);
}
async function cmdStorm() {
  if (!has('i-understand-this-moves-my-pointer')) die('storm sends valid HOVER frames at random positions: the pointer will fly around the screen.\nadd --i-understand-this-moves-my-pointer to continue');
  const o = { ...readOpts(), seed: opt('seed', '777'), duration: num('duration', 10) }; o.rate = num('rate', 2000);
  const rng = new SplitMix64(o.seed), tr = await connect(o).catch((e) => die(`cannot connect: ${e.message}`)), t0 = Date.now(); let sent = 0;
  console.log(`storm: hover frames at about ${o.rate}/s for ${o.duration}s`);
  while (Date.now() - t0 < o.duration * 1000 && !tr.closed) {
    const batch = []; for (let i = 0; i < Math.max(1, Math.round(o.rate / 100)); i++) batch.push(encodeFrame(EV.hover, rng.double(), rng.double(), 0, 0, Date.now())); await tr.send(batch); sent += batch.length; await sleep(10);
  }
  tr.close(); console.log(`sent ${sent} frames (${(sent / ((Date.now() - t0) / 1000)).toFixed(0)}/s); connection ${tr.closed ? 'was closed by the server' : 'stayed open'}`);
}
 
// ------------------------------------------------------------------ mock servers (for --selftest; also usable standalone)
function startMockTcp(kind) {
  const stats = { valid: 0, invalid: 0, frames: [], conns: 0, bytes: 0 };
  const srv = net.createServer((s) => {
    stats.conns++; let buf = Buffer.alloc(0); s.on('error', () => {});
    s.on('data', (d) => {
      stats.bytes += d.length; buf = Buffer.concat([buf, d]);
      while (buf.length >= 13) {
        const f = decodeFrame(buf, 0);
        if (f) { stats.valid++; if (stats.frames.length < 2e6) stats.frames.push(Buffer.from(buf.subarray(0, 13))); buf = buf.subarray(13); }
        else { if (kind === 'fragile') throw new Error('mock server: bad frame header'); stats.invalid++; buf = buf.subarray(1); }
      }
    });
  });
  return { srv, stats };
}
function startMockWs() { // minimal RFC 6455 server: binary + text + close
  const stats = { valid: 0, invalid: 0, frames: [], conns: 0, text: 0 };
  const srv = net.createServer((s) => {
    stats.conns++; let buf = Buffer.alloc(0), up = false; s.on('error', () => {});
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!up) {
        const end = buf.indexOf('\r\n\r\n'); if (end < 0) return;
        const key = /Sec-WebSocket-Key: (.+)\r\n/i.exec(buf.subarray(0, end).toString())[1].trim();
        const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`); up = true; buf = buf.subarray(end + 4);
      }
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 0x7f, off = 2; const masked = (buf[1] & 0x80) !== 0, op = buf[0] & 0x0f;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + (masked ? 4 : 0) + len) return;
        const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
        const p = Buffer.from(buf.subarray(off, off + len)); if (mask) for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
        buf = buf.subarray(off + len);
        if (op === 2) { const f = p.length === 13 ? decodeFrame(p, 0) : null; if (f) { stats.valid++; stats.frames.push(p); } else stats.invalid++; }
        else if (op === 1) stats.text++;
        else if (op === 8) { s.end(Buffer.from([0x88, 0x00])); return; }
      }
    });
  });
  return { srv, stats };
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
async function cmdMock() {
  const kind = String(opt('mock-server', 'good')), m = kind === 'ws' ? startMockWs() : startMockTcp(kind);
  m.srv.listen(num('port', 9090), '127.0.0.1', () => console.log(`LISTENING ${m.srv.address().port} ${kind}`));
  process.on('SIGINT', () => { console.log(JSON.stringify({ valid: m.stats.valid, invalid: m.stats.invalid, conns: m.stats.conns })); process.exit(0); });
}
 
// ------------------------------------------------------------------ self-test of this tool (loopback only)
async function selftest() {
  let pass = 0, fail = 0; const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
  // 1. shared vectors from the project prompts
  const V = [[[0, .5, .5, .5, 0, 1000], '00 00 80 00 80 00 02 00 E8 03 00 00 01'], [[1, 0, 1, 1, 1, 0xFFFFFFFF], '01 00 00 FF FF 00 04 01 FF FF FF FF 01'],
    [[2, 1, 0, 0, 2, 0x12345678], '02 FF FF 00 00 00 00 02 78 56 34 12 01'], [[3, .25, .75, 0, 0, 0], '03 00 40 FF BF 00 00 00 00 00 00 00 01'], [[0, -.5, 1.5, 2, 0, 5], '00 00 00 FF FF 00 04 00 05 00 00 00 01']];
  check('encoder matches the 5 shared frame vectors', V.every(([a, hex]) => encodeFrame(...a).toString('hex').toUpperCase().match(/../g).join(' ') === hex));
  const r = new SplitMix64(42), first = [r.next(), r.next(), r.next()].map((v) => '0x' + v.toString(16).padStart(16, '0'));
  check('SplitMix64 seed 42 matches the campaign-prompt vectors', first.join() === '0xbdd732262feb6e95,0x28efe333b266f103,0x47526757130f9f52');
  // 2. scene shape
  const o = { rate: 1000, step: 4, gap: 5, aspect: 16 / 9, hover: false }, strokes = buildScene('all', 'WANNA FUcK you'), frames = buildFrames(strokes, o);
  let depth = 0, bad = 0, minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const f of frames) { if (f.type === EV.down) { if (depth) bad++; depth = 1; } else if (f.type === EV.up) { if (!depth) bad++; depth = 0; } else if (f.type === EV.move && !depth) bad++; minX = Math.min(minX, f.nx); maxX = Math.max(maxX, f.nx); minY = Math.min(minY, f.ny); maxY = Math.max(maxY, f.ny); }
  check('every stroke is Down..Move*..Up, no stray Move, nothing left pressed', bad === 0 && depth === 0, `(${strokes.length} strokes, ${frames.length} frames)`);
  check('drawing stays inside the pad with a margin', minX > 0.02 && maxX < 0.98 && minY > 0.02 && maxY < 0.98, `x ${minX.toFixed(3)}..${maxX.toFixed(3)}, y ${minY.toFixed(3)}..${maxY.toFixed(3)}`);
  // 3. replay over loopback TCP and WebSocket, compare byte for byte
  for (const kind of ['tcp', 'ws']) {
    const m = kind === 'ws' ? startMockWs() : startMockTcp('good'), port = await listen(m.srv), oo = { host: '127.0.0.1', port, transport: kind, path: '/', rate: 4000, ts: 'rel' };
    const fr = buildFrames(strokes, { ...o, rate: 4000, gap: 1 }); const tr = await connect(oo); await play(fr, tr, oo); await sleep(300); tr.close(); await sleep(100);
    const expect = fr.map((f) => encodeFrame(f.type, f.nx, f.ny, f.p, 0, Math.round(f.t)));
    check(`${kind}: server received every frame, in order, byte-identical`, m.stats.valid === expect.length && m.stats.frames.every((b, i) => b.equals(expect[i])), `(${m.stats.valid}/${expect.length}, invalid=${m.stats.invalid})`);
    // 4. stress against the robust mock: it must survive, and receive ZERO valid frames (proves the safety filter)
    const before = m.stats.valid, res = await stress({ ...oo, seed: '99', duration: 2.5, maxCases: 60, forever: false, keepGoing: false, verbose: false, pid: null }, true);
    check(`${kind}: stress finds no problem on a robust server`, res.failures.length === 0, `(${res.cases} cases)`);
    check(`${kind}: stress sent no valid-looking frame (safe for a real server)`, m.stats.valid === before, `(valid before=${before}, after=${m.stats.valid}, invalid seen=${m.stats.invalid})`);
    m.srv.close();
  }
  // 5. a deliberately fragile server must be detected
  const child = spawn(process.execPath, [__filename, '--mock-server', 'fragile', '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((res, rej) => { child.stdout.on('data', (d) => { const m = /LISTENING (\d+)/.exec(String(d)); if (m) res(Number(m[1])); }); setTimeout(() => rej(new Error('mock did not start')), 4000); });
  child.on('exit', () => {});
  const res = await stress({ host: '127.0.0.1', port, transport: 'tcp', path: '/', seed: '5', duration: 20, maxCases: 200, forever: false, keepGoing: false, verbose: false, pid: child.pid }, true);
  check('a fragile server that dies on a bad frame is detected', res.failures.length === 1, res.failures[0] ? `(case #${res.failures[0].n} ${res.failures[0].kind}: ${res.failures[0].problem})` : '');
  try { child.kill(); } catch {}
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
 
// ------------------------------------------------------------------ main
function help() {
  console.log(`Air Canvas fake phone
 
  node aircanvas-fakephone.js selftest                      check this tool on loopback (safe, no real PC needed)
  node aircanvas-fakephone.js draw   [options]              draw rabbit + tiger + text on the PC (moves the REAL pointer)
  node aircanvas-fakephone.js dump   [--out frames.bin]     write the frames and an SVG preview, send nothing
  node aircanvas-fakephone.js stress [options]              crash hunt with INVALID input only (seeded, reproducible)
  node aircanvas-fakephone.js storm  --i-understand-this-moves-my-pointer   valid HOVER frames at high rate
 
common options: --host 127.0.0.1  --port 9090  --transport tcp|ws  --path /
draw:   --only all|rabbit|tiger|text  --text "WANNA FUcK you"  --rate 120  --step 4  --aspect 16:9 (or 1366x768)
        --hover  --countdown 5  --dry-run  --ts epoch|rel
stress: --seed 12345  --duration 60  --max-cases N  --forever  --keep-going  --pid <server pid>  --verbose
text supports only the letters: W A N F U K c y o u and space`);
}
(async () => {
  try {
    if (argv.includes('--mock-server')) return await cmdMock();
    if (mode === 'selftest') return await selftest();
    if (mode === 'draw') return await cmdDraw();
    if (mode === 'dump') return cmdDump();
    if (mode === 'stress') return await cmdStress();
    if (mode === 'storm') return await cmdStorm();
    help();
  } catch (e) { console.error('fatal: ' + (e && e.stack || e)); process.exit(1); }
})();
