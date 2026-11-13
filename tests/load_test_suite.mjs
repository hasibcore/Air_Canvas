import { execSync, spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VU_LEVELS = [100, 500, 1000, 2500, 5000];

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

function getProcessRssMb(pid) {
  try {
    const kb = Number.parseInt(execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' }).trim(), 10);
    return Number.isFinite(kb) ? Math.round((kb / 1024) * 10) / 10 : 0;
  } catch {
    return 0;
  }
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
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for server.js'));
      setTimeout(probe, 100);
    };
    probe();
  });
}

function summarizeLatencies(samples) {
  if (samples.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = Float64Array.from(samples).sort();
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return {
    avg: Number((sum / sorted.length).toFixed(2)),
    p50: Number(pick(0.5).toFixed(2)),
    p95: Number(pick(0.95).toFixed(2)),
    p99: Number(pick(0.99).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function httpGetOnce(agent, port, reqPath) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method: 'GET',
        agent,
        timeout: 10000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            ok: res.statusCode === 200,
            ms: performance.now() - t0,
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', () => {
      resolve({ ok: false, ms: performance.now() - t0 });
    });
    req.end();
  });
}

async function runHttpWave(port, serverPid, vus, reqsPerVu = 3) {
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: Math.min(vus, 1024),
    maxFreeSockets: 256,
  });
  const latencies = [];
  let errors = 0;
  const start = performance.now();

  const workers = Array.from({ length: vus }, (_, i) => (async () => {
    const targetPath = i % 3 === 0 ? '/api/network-info' : '/health';
    for (let r = 0; r < reqsPerVu; r++) {
      const res = await httpGetOnce(agent, port, targetPath);
      if (res.ok) latencies.push(res.ms);
      else errors++;
    }
  })());

  await Promise.all(workers);
  const elapsedSec = Math.max(0.001, (performance.now() - start) / 1000);
  const rssMb = getProcessRssMb(serverPid);
  agent.destroy();

  const totalReqs = vus * reqsPerVu;
  const stats = summarizeLatencies(latencies);
  return {
    vus,
    totalReqs,
    rps: Math.round(latencies.length / elapsedSec),
    errorRatePct: Number(((errors / totalReqs) * 100).toFixed(3)),
    errors,
    rssMb,
    ...stats,
  };
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false, handshakeTimeout: 10000 });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch {}
      reject(new Error('ws_open_timeout'));
    }, 10000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function make13ByteFrame(seq) {
  const buf = Buffer.allocUnsafe(13);
  buf.writeUInt8(1, 0); // pointerMove
  buf.writeUInt16LE(32768, 1);
  buf.writeUInt16LE(32768, 3);
  buf.writeUInt16LE(512, 5);
  buf.writeUInt8(0, 7);
  buf.writeUInt32LE(seq >>> 0, 8);
  buf.writeUInt8(1, 12);
  return buf;
}

async function runWsWave(port, serverPid, vus, framesPerPair = 4) {
  const roomCount = Math.max(1, Math.floor(vus / 2));
  const pairs = [];
  let connectErrors = 0;

  // Connect rooms in controlled batches of 200 rooms (400 sockets) so TCP accept backlog doesn't drop SYN packets
  const batchSize = 200;
  for (let startIdx = 0; startIdx < roomCount; startIdx += batchSize) {
    const endIdx = Math.min(roomCount, startIdx + batchSize);
    const batchPromises = [];
    for (let idx = startIdx; idx < endIdx; idx++) {
      const pin = String(100000 + idx);
      batchPromises.push(
        Promise.all([
          openWs(`ws://127.0.0.1:${port}/ws?pin=${pin}&role=server`),
          openWs(`ws://127.0.0.1:${port}/ws?pin=${pin}&role=client`),
        ])
          .then(([hostWs, clientWs]) => {
            pairs.push({ hostWs, clientWs });
          })
          .catch(() => {
            connectErrors++;
          })
      );
    }
    await Promise.all(batchPromises);
  }

  const peakRssMb = getProcessRssMb(serverPid);
  const latencies = [];
  let frameErrors = 0;
  const start = performance.now();

  await Promise.all(
    pairs.map(({ hostWs, clientWs }, idx) => new Promise((resolve) => {
      let received = 0;
      const sendTimes = new Map();
      const timeout = setTimeout(() => {
        frameErrors += Math.max(0, framesPerPair - received);
        resolve();
      }, 10000);

      hostWs.on('message', (data, isBinary) => {
        if (!isBinary || data.length !== 13) return;
        const seq = data.readUInt32LE(8);
        const sentAt = sendTimes.get(seq);
        if (sentAt !== undefined) {
          latencies.push(performance.now() - sentAt);
          received++;
          if (received >= framesPerPair) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      for (let f = 0; f < framesPerPair; f++) {
        const seq = idx * 100 + f + 1;
        sendTimes.set(seq, performance.now());
        clientWs.send(make13ByteFrame(seq));
      }
    }))
  );

  const elapsedSec = Math.max(0.001, (performance.now() - start) / 1000);
  const totalExpected = roomCount * framesPerPair;
  const totalErrors = connectErrors * framesPerPair + frameErrors;

  await Promise.all(
    pairs.flatMap(({ hostWs, clientWs }) => [
      new Promise((r) => {
        if (hostWs.readyState === WebSocket.CLOSED) return r();
        hostWs.once('close', r);
        hostWs.close();
      }),
      new Promise((r) => {
        if (clientWs.readyState === WebSocket.CLOSED) return r();
        clientWs.once('close', r);
        clientWs.close();
      }),
    ])
  );

  // Brief settle for server room cleanup before next wave
  await new Promise((r) => setTimeout(r, 150));

  const stats = summarizeLatencies(latencies);
  return {
    vus: roomCount * 2,
    rooms: roomCount,
    deliveredFrames: latencies.length,
    framesPerSec: Math.round(latencies.length / elapsedSec),
    errorRatePct: Number(((totalErrors / Math.max(1, totalExpected)) * 100).toFixed(3)),
    rssMb: peakRssMb,
    ...stats,
  };
}

async function main() {
  const port = await getFreePort();
  const loopMonitor = monitorEventLoopDelay({ resolution: 10 });
  loopMonitor.enable();

  const proc = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      MAX_ROOMS: '10000',
      MAX_PEERS_PER_ROOM: '32',
      VERBOSE_WS_LOGS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServerReady(port, proc);
    const baseRss = getProcessRssMb(proc.pid);
    console.log(`=== AIR CANVAS PROGRESSIVE LOAD TEST (PID=${proc.pid}, Baseline RSS=${baseRss} MB) ===\n`);

    console.log('--- Part A: HTTP Concurrency Waves (/health & /api/network-info, Keep-Alive Pool) ---');
    const httpResults = [];
    for (const vus of VU_LEVELS) {
      const r = await runHttpWave(port, proc.pid, vus, 3);
      httpResults.push(r);
      console.log(
        `  VUs=${String(r.vus).padStart(4)} | Reqs=${String(r.totalReqs).padStart(5)} | RPS=${String(r.rps).padStart(6)} | avg=${r.avg}ms p95=${r.p95}ms p99=${r.p99}ms | err=${r.errorRatePct}% | RSS=${r.rssMb}MB`
      );
    }

    console.log('\n--- Part B: Live WebSocket Dual-Device Pair Relay Waves (13B Binary Frames) ---');
    const wsResults = [];
    for (const vus of VU_LEVELS) {
      const r = await runWsWave(port, proc.pid, vus, 4);
      wsResults.push(r);
      console.log(
        `  VUs=${String(r.vus).padStart(4)} (${String(r.rooms).padStart(4)} rooms) | Frames=${String(r.deliveredFrames).padStart(5)} | ${String(r.framesPerSec).padStart(6)} fps | avg=${r.avg}ms p95=${r.p95}ms p99=${r.p99}ms | err=${r.errorRatePct}% | RSS=${r.rssMb}MB`
      );
    }

    loopMonitor.disable();
    console.log(`\nDriver Event-Loop Delay P99: ${(loopMonitor.percentile(99) / 1e6).toFixed(2)} ms`);
    console.log(JSON.stringify({ httpResults, wsResults }, null, 2));

    const anyHttpErr = httpResults.some((r) => r.errorRatePct > 1.0);
    const anyWsErr = wsResults.some((r) => r.errorRatePct > 1.0);
    if (anyHttpErr || anyWsErr) {
      process.exitCode = 1;
    }
  } finally {
    proc.kill('SIGTERM');
    await new Promise((resolve) => proc.once('exit', resolve));
  }
}

await main();
