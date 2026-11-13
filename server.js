import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

function getLocalNetworkInfo(webPort) {
  const allIps = [];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        const familyV4 = typeof net.family === 'string' ? net.family === 'IPv4' : net.family === 4;
        if (familyV4 && !net.internal && net.address) {
          if (!allIps.includes(net.address)) {
            allIps.push(net.address);
          }
        }
      }
    }
  } catch {}
  const preferred =
    allIps.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) ||
    allIps[0] ||
    '192.168.1.105';
  if (!allIps.includes('127.0.0.1')) {
    allIps.push('127.0.0.1');
  }
  return {
    ip: preferred,
    allIps,
    webPort,
    serverPort: 9090,
    pin: '1234',
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, 'dist');
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip',
  '.cs': 'text/plain; charset=utf-8',
  '.bat': 'text/plain; charset=utf-8',
  '.manifest': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Bounded non-blocking static asset cache for high-concurrency HTTP serving
const STATIC_CACHE_MAX_BYTES = 1024 * 1024; // Cache files <= 1 MiB in RAM; stream larger downloads
const STATIC_CACHE_MAX_ENTRIES = 64;
const staticCache = new Map();

// Sliding-window IP rate limiter for sensitive endpoints (/api/github-push)
const pushRateWindowMs = 15 * 60 * 1000;
const pushRateMax = 15;
const pushAttempts = new Map();

function isPushRateLimited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = pushAttempts.get(key);
  if (!entry || now - entry.start > pushRateWindowMs) {
    pushAttempts.set(key, { count: 1, start: now });
    if (pushAttempts.size > 1000) {
      for (const [k, v] of pushAttempts.entries()) {
        if (now - v.start > pushRateWindowMs) pushAttempts.delete(k);
      }
    }
    return false;
  }
  entry.count++;
  return entry.count > pushRateMax;
}

function sanitizeLogText(value, maxLen = 64) {
  return String(value || '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function resolveContainedPath(rootDir, requestPath) {
  const rel = requestPath.replace(/^\/+/, '');
  const resolved = path.resolve(rootDir, rel);
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    return null;
  }
  return resolved;
}

async function tryServeStatic(res, filePath, contentType) {
  const cached = staticCache.get(filePath);
  if (cached) {
    res.writeHead(200, cached.headers);
    res.end(cached.buffer);
    return true;
  }

  let stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stats.isFile()) return false;

  const isImmutable = filePath.includes(`${path.sep}assets${path.sep}`);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  };

  if (stats.size <= STATIC_CACHE_MAX_BYTES) {
    try {
      const buffer = await fsp.readFile(filePath);
      if (staticCache.size >= STATIC_CACHE_MAX_ENTRIES) {
        const oldestKey = staticCache.keys().next().value;
        if (oldestKey) staticCache.delete(oldestKey);
      }
      staticCache.set(filePath, { buffer, headers });
      res.writeHead(200, headers);
      res.end(buffer);
      return true;
    } catch {
      return false;
    }
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    try {
      if (!res.headersSent) send404(res);
      else res.destroy();
    } catch {}
  });
  stream.pipe(res);
  return true;
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

function send400(res) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('400 Bad Request');
}

const server = http.createServer(async (req, res) => {
  // Security & CORS headers (iFrame-compatible for AI Studio preview: never set X-Frame-Options: DENY)
  const allowedCorsOrigin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedCorsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url || '/';
  const rawPathname = rawUrl.split('?')[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPathname);
  } catch {
    return send400(res);
  }
  if (decodedPath.includes('\0')) {
    return send400(res);
  }

  // Health check endpoint for Cloud Run & Load Probes
  if (decodedPath === '/health' || decodedPath === '/_health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        status: 'ok',
        rooms: rooms.size,
        connections: wss.clients.size,
        timestamp: Date.now(),
      })
    );
    return;
  }

  // LAN Network Info endpoint for PC Local IP & Port Auto-Detection
  if (decodedPath === '/api/network-info' || decodedPath === '/api/ip') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(getLocalNetworkInfo(PORT)));
    return;
  }

  // Direct binary download redirect for APK, EXE, and Windows Bundle ZIP
  if (decodedPath.startsWith('/downloads/')) {
    const assetName = decodedPath.slice('/downloads/'.length);
    const allowedAssets = [
      'AirCanvas-release.apk',
      'AirCanvas.exe',
      'AirCanvasServer.exe',
      'AirCanvas-Windows-x64.zip',
    ];
    if (allowedAssets.includes(assetName)) {
      const downloadsRoot = path.resolve(PUBLIC_DIR, 'downloads');
      const localDownloadPath = resolveContainedPath(downloadsRoot, assetName);
      if (localDownloadPath) {
        const ext = path.extname(localDownloadPath).toLowerCase();
        const served = await tryServeStatic(res, localDownloadPath, MIME_TYPES[ext] || 'application/octet-stream');
        if (served) return;
      }
      res.writeHead(302, {
        Location: `https://github.com/hasibcore/Air_Canvas/releases/latest/download/${assetName}`,
      });
      res.end();
      return;
    }
    return send404(res);
  }

  // Security-hardened GitHub Push route for hasibcore/Air_Canvas:
  // Unauthenticated requests are rejected with 403; authenticated requests use shell:false argument arrays only.
  if (decodedPath === '/api/github-push' && req.method === 'POST') {
    const clientIp = req.socket?.remoteAddress || 'unknown';
    if (isPushRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Too many push requests. Try again later.' }));
      return;
    }

    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      body += chunk.toString();
      if (body.length > 8192) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
      }
    });
    req.on('end', () => {
      if (aborted) return;
      let parsed = {};
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        parsed = {};
      }
      const rawToken = typeof parsed.token === 'string' ? parsed.token.trim() : (process.env.GITHUB_TOKEN || '').trim();
      const rawRepo = typeof parsed.repo === 'string' ? parsed.repo.trim() : 'hasibcore/Air_Canvas';
      const cleanSlug =
        rawRepo
          .replace(/^https?:\/\/github\.com\//i, '')
          .replace(/\.git$/i, '')
          .replace(/^\/+|\/+$/g, '') || 'hasibcore/Air_Canvas';

      const validToken = /^(gh[pousr]_[A-Za-z0-9_]{16,255}|github_pat_[A-Za-z0-9_]{16,255})$/.test(rawToken);
      const validSlug = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanSlug);

      if (!validToken || !validSlug) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            error:
              'GitHub Personal Access Token (ghp_... or github_pat_...) required to push to https://github.com/hasibcore/Air_Canvas.git.',
          })
        );
        return;
      }

      const authRemote = `https://x-access-token:${rawToken}@github.com/${cleanSlug}.git`;
      spawnSync('git', ['config', '--global', '--add', 'safe.directory', '*'], { cwd: __dirname, shell: false, timeout: 5000 });
      spawnSync('git', ['init'], { cwd: __dirname, shell: false, timeout: 5000 });
      spawnSync('git', ['config', 'user.name', 'hasibcore'], { cwd: __dirname, shell: false, timeout: 5000 });
      spawnSync('git', ['config', 'user.email', 'hasibulhasancore@gmail.com'], { cwd: __dirname, shell: false, timeout: 5000 });
      spawnSync('git', ['checkout', '-B', 'main'], { cwd: __dirname, shell: false, timeout: 5000 });
      spawnSync('git', ['add', '-A'], { cwd: __dirname, shell: false, timeout: 10000 });
      spawnSync(
        'git',
        [
          'commit',
          '-m',
          'Release AirCanvas v2.1.3 — Hardened Dual-Device Relay, Stroke Precision & Security Fixes',
        ],
        { cwd: __dirname, shell: false, timeout: 10000 }
      );
      spawnSync('git', ['tag', '-f', '-a', 'v2.1.3', '-m', 'Air Canvas v2.1.3 Release'], {
        cwd: __dirname,
        shell: false,
        timeout: 10000,
      });
      const pushMain = spawnSync('git', ['push', authRemote, 'HEAD:refs/heads/main', '--force'], {
        cwd: __dirname,
        shell: false,
        timeout: 25000,
        encoding: 'utf8',
      });
      const pushTag = spawnSync('git', ['push', authRemote, 'refs/tags/v2.1.3:refs/tags/v2.1.3', '--force'], {
        cwd: __dirname,
        shell: false,
        timeout: 25000,
        encoding: 'utf8',
      });

      if (pushMain.status === 0 && pushTag.status === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: true,
            message: `Successfully pushed branch main and tag v2.1.3 to https://github.com/${cleanSlug} (GitHub Actions release pipeline triggered for APK & EXE).`,
          })
        );
      } else {
        const safeErr = ((pushMain.stderr || '') + '\n' + (pushTag.stderr || ''))
          .split(rawToken)
          .join('***')
          .trim();
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            error: safeErr || 'Git push failed. Check repository permissions on hasibcore/Air_Canvas.',
          })
        );
      }
    });
    return;
  }

  // Canonical path containment check to prevent directory traversal
  const targetRel = decodedPath === '/' ? 'index.html' : decodedPath;

  // 1. Check in dist/
  const distFile = resolveContainedPath(DIST_DIR, targetRel);
  if (distFile) {
    const ext = path.extname(distFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    if (await tryServeStatic(res, distFile, contentType)) return;
  }

  // 2. Check in public/
  const publicFile = resolveContainedPath(PUBLIC_DIR, targetRel);
  if (publicFile) {
    const ext = path.extname(publicFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    if (await tryServeStatic(res, publicFile, contentType)) return;
  }

  // Reject missing traversal or API paths cleanly instead of masking with SPA fallback
  if (decodedPath.includes('..') || decodedPath.startsWith('/api/')) {
    return send404(res);
  }

  // 3. SPA fallback to dist/index.html
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (await tryServeStatic(res, indexPath, 'text/html; charset=utf-8')) return;

  send404(res);
});

server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 65000;

// WebSocket Room Relay for Instant QR Code & Multi-Device Pairing (Hardened & Horizontally Bounded)
const MAX_WS_PAYLOAD_BYTES = 64 * 1024; // 64 KiB cap
const MAX_ROOMS = Math.max(100, parseInt(process.env.MAX_ROOMS || '5000', 10));
const MAX_PEERS_PER_ROOM = Math.max(2, parseInt(process.env.MAX_PEERS_PER_ROOM || '32', 10));
const MAX_MESSAGES_PER_SEC = Math.max(60, parseInt(process.env.MAX_MESSAGES_PER_SEC || '600', 10));
const VERBOSE_WS_LOGS = process.env.VERBOSE_WS_LOGS === 'true';

function sanitizePin(rawPin) {
  const cleaned = String(rawPin || '1234').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < 4 || cleaned.length > 16) return '1234';
  return cleaned;
}

const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD_BYTES });
wss.on('error', (err) => {
  console.error('[WebSocket Server Error]:', err.message);
});

const rooms = new Map();
const peerMeta = new Map();
const roomSyncState = new Map();

// Heartbeat interval to evict half-open / dead sockets
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    const meta = peerMeta.get(ws);
    if (meta && meta.isAlive === false) {
      try {
        ws.terminate();
      } catch {}
      continue;
    }
    if (meta) {
      meta.isAlive = false;
    }
    try {
      ws.ping();
    } catch {}
  }
}, 15000);
heartbeatInterval.unref?.();

wss.on('connection', (ws, req) => {
  let pin = '1234';
  let role = 'client';
  let deviceName = 'AirCanvas Device';
  let localIp = '192.168.1.100';
  let port = 9090;
  let transportType = 'wifi';

  try {
    const rawHost = String(req.headers.host || 'localhost').replace(/[^a-zA-Z0-9.:_-]/g, '') || 'localhost';
    const parsedUrl = new URL(req.url || '/', `http://${rawHost}`);
    pin = sanitizePin(parsedUrl.searchParams.get('pin'));
    const rawRole = parsedUrl.searchParams.get('role') || 'client';
    role = rawRole === 'server' || rawRole === 'studio' ? rawRole : 'client';
    deviceName = sanitizeLogText(
      parsedUrl.searchParams.get('name') || (role === 'server' ? 'AirCanvas-PC-Host' : 'Mobile Tablet'),
      64
    ) || 'AirCanvas Device';
    localIp = sanitizeLogText(parsedUrl.searchParams.get('ip') || '192.168.1.100', 45);
    const parsedPort = parseInt(parsedUrl.searchParams.get('port') || '9090', 10);
    port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 9090;
    transportType = sanitizeLogText(parsedUrl.searchParams.get('transport') || 'wifi', 16) || 'wifi';
  } catch {}

  if (!rooms.has(pin) && rooms.size >= MAX_ROOMS) {
    try {
      ws.close(1013, 'Maximum relay rooms reached');
    } catch {}
    return;
  }

  if (!rooms.has(pin)) {
    rooms.set(pin, new Set());
  }
  const room = rooms.get(pin);
  if (room.size >= MAX_PEERS_PER_ROOM) {
    try {
      ws.close(1013, 'Room is full');
    } catch {}
    return;
  }

  room.add(ws);
  peerMeta.set(ws, {
    ws,
    pin,
    role,
    deviceName,
    localIp,
    port,
    transportType,
    isAlive: true,
    msgCountWindow: 0,
    windowStartMs: Date.now(),
    badBinaryStreak: 0,
  });

  ws.on('pong', () => {
    const meta = peerMeta.get(ws);
    if (meta) meta.isAlive = true;
  });

  if (VERBOSE_WS_LOGS) {
    console.log(`[WebSocket] Client joined Room PIN: ${pin} (${role} - ${deviceName}). Total in room: ${room.size}`);
  }

  // Send welcome confirmation with peer count and any cached PC Screen / Software Working Area state
  try {
    ws.send(
      JSON.stringify({
        type: 'room_joined',
        pin,
        role,
        peerCount: room.size,
        timestamp: Date.now(),
      })
    );

    const cached = roomSyncState.get(pin);
    if (cached?.screenSync) ws.send(cached.screenSync);
    if (cached?.softwareSync) ws.send(cached.softwareSync);
    if (cached?.workingAreaDetected) ws.send(cached.workingAreaDetected);
  } catch {}

  // Notify existing peers and inform joining socket about existing peers
  for (const peer of room) {
    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
      const existingMeta = peerMeta.get(peer);
      try {
        peer.send(
          JSON.stringify({
            type: 'peer_connected',
            role,
            pin,
            deviceName,
            ip: localIp,
            port,
            transportType,
            peerCount: room.size,
            timestamp: Date.now(),
          })
        );
        ws.send(
          JSON.stringify({
            type: 'peer_connected',
            role: existingMeta?.role || 'server',
            pin,
            deviceName: existingMeta?.deviceName || 'AirCanvas-PC-Host',
            ip: existingMeta?.localIp || '192.168.1.100',
            port: existingMeta?.port || 9090,
            transportType: existingMeta?.transportType || transportType,
            peerCount: room.size,
            timestamp: Date.now(),
          })
        );
      } catch {}
    }
  }

  // Relay messages strictly between peers in the SAME PIN room
  ws.on('message', (data, isBinary) => {
    const meta = peerMeta.get(ws);
    if (meta) {
      meta.isAlive = true;
      const now = Date.now();
      if (now - meta.windowStartMs >= 1000) {
        meta.windowStartMs = now;
        meta.msgCountWindow = 0;
      }
      meta.msgCountWindow++;
      if (meta.msgCountWindow > MAX_MESSAGES_PER_SEC) {
        return; // Drop excess frames under flood
      }
    }

    if (isBinary) {
      const byteLen = Buffer.isBuffer(data) ? data.length : data.byteLength;
      if (byteLen === 0 || byteLen % 13 !== 0) {
        if (meta) {
          meta.badBinaryStreak++;
          if (meta.badBinaryStreak >= 16) {
            try {
              ws.close(1002, 'Invalid binary frame length');
            } catch {}
          }
        }
        return;
      }
      // Validate version=1, eventType<=3, tool<=2 on each 13-byte frame
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      for (let offset = 0; offset < buf.length; offset += 13) {
        const evType = buf[offset + 0];
        const toolId = buf[offset + 7];
        const ver = buf[offset + 12];
        if (ver !== 1 || evType > 3 || toolId > 2) {
          if (meta) {
            meta.badBinaryStreak++;
            if (meta.badBinaryStreak >= 16) {
              try {
                ws.close(1002, 'Invalid binary frame header');
              } catch {}
            }
          }
          return;
        }
      }
      if (meta) meta.badBinaryStreak = 0;
    } else {
      try {
        const rawStr = data.toString();
        if (rawStr.includes('"__proto__"') || rawStr.includes('"constructor"') || rawStr.includes('"prototype"')) {
          return;
        }
        const parsed = JSON.parse(rawStr);
        if (!parsed || typeof parsed !== 'object') return;

        if (parsed.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            const activeRoom = rooms.get(pin) || room;
            ws.send(
              JSON.stringify({
                type: 'pong',
                timestamp: parsed.timestamp,
                peerCount: activeRoom.size,
                serverTimestamp: Date.now(),
              })
            );
          }
          return;
        }
        if (parsed.type === 'screen_sync') {
          const state = roomSyncState.get(pin) || {};
          state.screenSync = rawStr;
          roomSyncState.set(pin, state);
        }
        if (parsed.type === 'software_sync') {
          const state = roomSyncState.get(pin) || {};
          state.softwareSync = rawStr;
          roomSyncState.set(pin, state);
        }
        if (parsed.type === 'workingAreaDetected') {
          const state = roomSyncState.get(pin) || {};
          state.workingAreaDetected = rawStr;
          roomSyncState.set(pin, state);
        }
        if (parsed.type === 'register_host') {
          if (meta) {
            meta.role = 'server';
            meta.deviceName = sanitizeLogText(parsed.name || meta.deviceName, 64) || meta.deviceName;
            meta.localIp = sanitizeLogText(parsed.ip || meta.localIp, 45) || meta.localIp;
            const pPort = Number(parsed.port);
            if (Number.isInteger(pPort) && pPort >= 1 && pPort <= 65535) {
              meta.port = pPort;
            }
            if (parsed.pin) {
              const nextPin = sanitizePin(parsed.pin);
              if (nextPin !== pin) {
                const oldRoom = rooms.get(pin) || room;
                oldRoom.delete(ws);
                if (oldRoom.size === 0) {
                  rooms.delete(pin);
                  roomSyncState.delete(pin);
                } else {
                  for (const oldPeer of oldRoom) {
                    if (oldPeer.readyState === WebSocket.OPEN) {
                      try {
                        oldPeer.send(JSON.stringify({
                          type: 'peer_disconnected',
                          peerCount: oldRoom.size,
                          timestamp: Date.now(),
                        }));
                      } catch {}
                    }
                  }
                }
                if (!rooms.has(nextPin)) {
                  if (rooms.size >= MAX_ROOMS) {
                    try {
                      ws.close(1013, 'Maximum relay rooms reached');
                    } catch {}
                    return;
                  }
                  rooms.set(nextPin, new Set());
                }
                const nextRoom = rooms.get(nextPin);
                if (nextRoom.size >= MAX_PEERS_PER_ROOM) {
                  try {
                    ws.close(1013, 'Room is full');
                  } catch {}
                  return;
                }
                pin = nextPin;
                meta.pin = pin;
                nextRoom.add(ws);
                try {
                  ws.send(JSON.stringify({
                    type: 'room_joined',
                    pin,
                    role: meta.role,
                    peerCount: nextRoom.size,
                    timestamp: Date.now(),
                  }));
                  for (const peer of nextRoom) {
                    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                      const peerMetaInfo = peerMeta.get(peer);
                      peer.send(JSON.stringify({
                        type: 'peer_connected',
                        role: meta.role,
                        pin,
                        deviceName: meta.deviceName,
                        ip: meta.localIp,
                        port: meta.port,
                        transportType: meta.transportType,
                        peerCount: nextRoom.size,
                        timestamp: Date.now(),
                      }));
                      ws.send(JSON.stringify({
                        type: 'peer_connected',
                        role: peerMetaInfo?.role || 'client',
                        pin,
                        deviceName: peerMetaInfo?.deviceName || 'Peer',
                        ip: peerMetaInfo?.localIp || 'relay',
                        port: peerMetaInfo?.port || 9090,
                        transportType: peerMetaInfo?.transportType || 'wifi',
                        peerCount: nextRoom.size,
                        timestamp: Date.now(),
                      }));
                    }
                  }
                } catch {}
              }
            }
          }
        }
        if (parsed.type === 'discovery_ping') {
          // Security: O(1) PIN-scoped host discovery — never leak host IPs/PINs across rooms or fabricate phantom hosts
          const scopedRoom = rooms.get(pin) || room;
          const hostsFound = [];
          for (const peer of scopedRoom) {
            if (peer !== ws && peer.readyState === WebSocket.OPEN) {
              const m = peerMeta.get(peer);
              if (m && m.role === 'server') {
                hostsFound.push({
                  ip: m.localIp || 'relay',
                  name: m.deviceName || 'AirCanvas-PC-Host',
                  port: m.port || 9090,
                  pin,
                  model: `Room PIN ${pin} • Ready`,
                  platform: 'windows',
                });
              }
            }
          }
          if (hostsFound.length === 0) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'discovery_empty',
                  pin,
                  hostsFound: 0,
                  timestamp: Date.now(),
                })
              );
            }
          } else {
            for (const h of hostsFound) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'discovery_pong',
                    ...h,
                  })
                );
              }
            }
          }
          return;
        }
      } catch {
        return;
      }
    }

    const currentRoom = rooms.get(pin) || room;
    for (const peer of currentRoom) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        // Backpressure check: drop Move/Hover binary frames if peer buffer > 256 KiB, but never drop Down/Up
        if (isBinary && peer.bufferedAmount > 262144) {
          const firstByte = Buffer.isBuffer(data) ? data[0] : new Uint8Array(data)[0];
          if (firstByte === 1 || firstByte === 3) {
            continue;
          }
        }
        try {
          peer.send(data, { binary: isBinary });
        } catch {}
      }
    }
  });

  ws.on('close', () => {
    const currentRoom = rooms.get(pin) || room;
    currentRoom.delete(ws);
    peerMeta.delete(ws);
    if (VERBOSE_WS_LOGS) {
      console.log(`[WebSocket] Client left Room PIN: ${pin}. Remaining: ${currentRoom.size}`);
    }
    if (currentRoom.size === 0) {
      rooms.delete(pin);
      roomSyncState.delete(pin);
    } else {
      for (const peer of currentRoom) {
        if (peer.readyState === WebSocket.OPEN) {
          try {
            peer.send(
              JSON.stringify({
                type: 'peer_disconnected',
                peerCount: currentRoom.size,
                timestamp: Date.now(),
              })
            );
          } catch {}
        }
      }
    }
  });

  ws.on('error', (err) => {
    if (VERBOSE_WS_LOGS) {
      console.error('[WebSocket Error]:', err.message);
    }
  });
});

function shutdownGracefully(signal) {
  console.log(`[Air Canvas] Received ${signal}, shutting down relay...`);
  clearInterval(heartbeatInterval);
  for (const ws of wss.clients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {}
  }
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 3000).unref?.();
}

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`[Air Canvas] Production server listening on http://${HOST}:${PORT}`);
  console.log(`[Air Canvas] WebSocket Room Relay active on ws://${HOST}:${PORT}`);
});
