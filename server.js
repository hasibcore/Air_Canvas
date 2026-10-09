import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

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

// WebSocket Room Relay for Instant QR Code & Multi-Device Pairing
const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on('connection', (ws, req) => {
  let pin = '1234';
  let role = 'client';

  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    pin = parsedUrl.searchParams.get('pin') || '1234';
    role = parsedUrl.searchParams.get('role') || 'client';
  } catch { }

  if (!rooms.has(pin)) {
    rooms.set(pin, new Set());
  }
  const room = rooms.get(pin);
  room.add(ws);

  console.log(`[WebSocket] Client joined Room PIN: ${pin} (${role}). Total in room: ${room.size}`);

  // Send welcome confirmation with peer count
  try {
    ws.send(JSON.stringify({
      type: 'room_joined',
      pin,
      role,
      peerCount: room.size,
      timestamp: Date.now()
    }));
  } catch { }

  // Notify existing peers
  for (const peer of room) {
    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
      try {
        peer.send(JSON.stringify({
          type: 'peer_connected',
          role,
          peerCount: room.size,
          timestamp: Date.now()
        }));
      } catch { }
    }
  }

  // Relay messages between peers in the same PIN room
  ws.on('message', (data, isBinary) => {
    for (const peer of room) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        try {
          peer.send(data, { binary: isBinary });
        } catch { }
      }
    }
  });

  ws.on('close', () => {
    room.delete(ws);
    console.log(`[WebSocket] Client left Room PIN: ${pin}. Remaining: ${room.size}`);
    if (room.size === 0) {
      rooms.delete(pin);
    } else {
      for (const peer of room) {
        if (peer.readyState === WebSocket.OPEN) {
          try {
            peer.send(JSON.stringify({
              type: 'peer_disconnected',
              peerCount: room.size,
              timestamp: Date.now()
            }));
          } catch { }
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
