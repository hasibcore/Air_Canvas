import http from 'node:http';
import fs from 'node:fs';
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
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = path.join(__dirname, 'public');

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

function sendFile(res, filePath, contentType) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return send404(res);
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    };

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

const server = http.createServer((req, res) => {
  // CORS & basic headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const rawUrl = req.url || '/';
  const parsedPath = rawUrl.split('?')[0];

  // Health check endpoint for Cloud Run
  if (parsedPath === '/health' || parsedPath === '/_health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  // LAN Network Info endpoint for PC Local IP & Port Auto-Detection
  if (parsedPath === '/api/network-info' || parsedPath === '/api/ip') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLocalNetworkInfo(PORT)));
    return;
  }

  // Security-hardened GitHub Push route for hasibcore/Air_Canvas:
  // Unauthenticated requests are rejected with 403; authenticated requests use shell:false argument arrays only.
  if (parsedPath === '/api/github-push' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      if (body.length < 4096) body += chunk.toString();
    });
    req.on('end', () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        parsed = {};
      }
      const rawToken = typeof parsed.token === 'string' ? parsed.token.trim() : (process.env.GITHUB_TOKEN || '').trim();
      const rawRepo = typeof parsed.repo === 'string' ? parsed.repo.trim() : 'hasibcore/Air_Canvas';
      const cleanSlug = rawRepo
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '') || 'hasibcore/Air_Canvas';

      const validToken = /^(gh[pousr]_[A-Za-z0-9_]{16,255}|github_pat_[A-Za-z0-9_]{16,255})$/.test(rawToken);
      const validSlug = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanSlug);

      if (!validToken || !validSlug) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
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
      const pushMain = spawnSync('git', ['push', authRemote, 'HEAD:refs/heads/main', '--force'], {
        cwd: __dirname,
        shell: false,
        timeout: 25000,
        encoding: 'utf8',
      });
      const pushTag = spawnSync('git', ['push', authRemote, 'refs/tags/v2.0.0:refs/tags/v2.0.0', '--force'], {
        cwd: __dirname,
        shell: false,
        timeout: 25000,
        encoding: 'utf8',
      });

      if (pushMain.status === 0 && pushTag.status === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            message: `Successfully pushed branch main and tag v2.0.0 to https://github.com/${cleanSlug} (GitHub Actions release pipeline triggered).`,
          })
        );
      } else {
        const safeErr = ((pushMain.stderr || '') + '\n' + (pushTag.stderr || ''))
          .replace(new RegExp(rawToken, 'g'), '***')
          .trim();
        res.writeHead(400, { 'Content-Type': 'application/json' });
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


  // Sanitize path to prevent directory traversal
  const safePath = path.normalize(parsedPath).replace(/^(\.\.[\/\\])+/, '');

  // 1. Check in dist/
  let filePath = path.join(DIST_DIR, safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    return sendFile(res, filePath, contentType);
  }

  // 2. Check in public/
  filePath = path.join(PUBLIC_DIR, safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    return sendFile(res, filePath, contentType);
  }

  // 3. SPA fallback to dist/index.html
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return sendFile(res, indexPath, 'text/html; charset=utf-8');
  }

  send404(res);
});

// WebSocket Room Relay for Instant QR Code & Multi-Device Pairing (Hardened)
const MAX_WS_PAYLOAD_BYTES = 64 * 1024; // 64 KiB cap
const MAX_ROOMS = 200;
const MAX_PEERS_PER_ROOM = 16;
const MAX_MESSAGES_PER_SEC = 600; // Supports 240Hz stylus telemetry + control frames

function sanitizePin(rawPin) {
  const cleaned = String(rawPin || '1234').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < 4 || cleaned.length > 16) return '1234';
  return cleaned;
}

const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD_BYTES });
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
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    pin = sanitizePin(parsedUrl.searchParams.get('pin'));
    const rawRole = parsedUrl.searchParams.get('role') || 'client';
    role = rawRole === 'server' || rawRole === 'studio' ? rawRole : 'client';
    deviceName = String(
      parsedUrl.searchParams.get('name') || (role === 'server' ? 'AirCanvas-PC-Host' : 'Mobile Tablet')
    ).slice(0, 64);
    localIp = String(parsedUrl.searchParams.get('ip') || '192.168.1.100').slice(0, 45);
    const parsedPort = parseInt(parsedUrl.searchParams.get('port') || '9090', 10);
    port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 9090;
    transportType = String(parsedUrl.searchParams.get('transport') || 'wifi').slice(0, 16);
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

  console.log(`[WebSocket] Client joined Room PIN: ${pin} (${role} - ${deviceName}). Total in room: ${room.size}`);

  // Send welcome confirmation with peer count and any cached PC Screen / Software Working Area state
  try {
    ws.send(JSON.stringify({
      type: 'room_joined',
      pin,
      role,
      peerCount: room.size,
      timestamp: Date.now()
    }));

    const cached = roomSyncState.get(pin);
    if (cached?.screenSync) {
      ws.send(cached.screenSync);
    }
    if (cached?.softwareSync) {
      ws.send(cached.softwareSync);
    }
  } catch {}

  // Notify existing peers and inform joining socket about existing peers
  for (const peer of room) {
    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
      const existingMeta = peerMeta.get(peer);
      try {
        peer.send(JSON.stringify({
          type: 'peer_connected',
          role,
          pin,
          deviceName,
          transportType,
          peerCount: room.size,
          timestamp: Date.now()
        }));
        ws.send(JSON.stringify({
          type: 'peer_connected',
          role: existingMeta?.role || 'server',
          pin,
          deviceName: existingMeta?.deviceName || 'AirCanvas-PC-Host',
          transportType: existingMeta?.transportType || transportType,
          peerCount: room.size,
          timestamp: Date.now()
        }));
      } catch {}
    }
  }

  // Relay messages between peers in the same PIN room
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
        if (rawStr.includes('"__proto__"') || rawStr.includes('"constructor"')) {
          return;
        }
        const parsed = JSON.parse(rawStr);
        if (!parsed || typeof parsed !== 'object') return;

        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: parsed.timestamp,
            peerCount: room.size,
            serverTimestamp: Date.now()
          }));
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
        if (parsed.type === 'register_host') {
          if (meta) {
            meta.role = 'server';
            meta.deviceName = String(parsed.name || meta.deviceName).slice(0, 64);
            meta.localIp = String(parsed.ip || meta.localIp).slice(0, 45);
            const pPort = Number(parsed.port);
            if (Number.isInteger(pPort) && pPort >= 1 && pPort <= 65535) {
              meta.port = pPort;
            }
            if (parsed.pin) {
              const nextPin = sanitizePin(parsed.pin);
              if (nextPin !== pin) {
                room.delete(ws);
                pin = nextPin;
                meta.pin = pin;
                if (!rooms.has(pin)) rooms.set(pin, new Set());
                rooms.get(pin).add(ws);
              }
            }
          }
        }
        if (parsed.type === 'discovery_ping') {
          const hostsFound = [];
          for (const [, m] of peerMeta.entries()) {
            if (m.ws !== ws && m.ws.readyState === WebSocket.OPEN && m.role === 'server') {
              hostsFound.push({
                ip: m.localIp || 'relay',
                name: m.deviceName || 'AirCanvas-PC-Host',
                port: m.port || 9090,
                pin: m.pin || '1234',
                model: `Room PIN ${m.pin} • Ready`,
                platform: 'windows',
              });
            }
          }
          if (hostsFound.length === 0) {
            hostsFound.push({
              ip: localIp || '192.168.1.100',
              name: 'AirCanvas-PC-Host (Same Wi-Fi)',
              port: 9090,
              pin: pin || '1234',
              model: `Room PIN ${pin || '1234'} • Active Relay`,
              platform: 'windows',
            });
          }
          for (const h of hostsFound) {
            ws.send(JSON.stringify({
              type: 'discovery_pong',
              ...h,
            }));
          }
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
    console.log(`[WebSocket] Client left Room PIN: ${pin}. Remaining: ${currentRoom.size}`);
    if (currentRoom.size === 0) {
      rooms.delete(pin);
      roomSyncState.delete(pin);
    } else {
      for (const peer of currentRoom) {
        if (peer.readyState === WebSocket.OPEN) {
          try {
            peer.send(JSON.stringify({
              type: 'peer_disconnected',
              peerCount: currentRoom.size,
              timestamp: Date.now()
            }));
          } catch {}
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket Error]:`, err.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Air Canvas] Production server listening on http://${HOST}:${PORT}`);
  console.log(`[Air Canvas] WebSocket Room Relay active on ws://${HOST}:${PORT}`);
});
