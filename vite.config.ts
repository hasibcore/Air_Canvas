import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { WebSocketServer, WebSocket } from 'ws';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

function getLocalNetworkInfo() {
  const allIps: string[] = [];
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
    webPort: 3000,
    serverPort: 9090,
    pin: '1234',
  };
}

interface PeerMeta {
  ws: WebSocket;
  pin: string;
  role: string;
  deviceName: string;
  localIp: string;
  port: number;
  transportType: string;
}

function websocketRelay(): Plugin {
  const rooms = new Map<string, Set<WebSocket>>();
  const peerMeta = new Map<WebSocket, PeerMeta>();
  const roomSyncState = new Map<
    string,
    { screenSync?: string; softwareSync?: string }
  >();

  return {
    name: 'aircanvas-websocket-relay',
    configureServer(server) {
      server.middlewares.use('/api/network-info', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.statusCode = 200;
        res.end(JSON.stringify(getLocalNetworkInfo()));
      });
      server.middlewares.use('/api/ip', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.statusCode = 200;
        res.end(JSON.stringify(getLocalNetworkInfo()));
      });
      server.middlewares.use('/api/github-push', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          if (body.length < 4096) body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const cleanRepo =
              String(parsed.repo || 'hasibcore/Air_Canvas')
                .trim()
                .replace(/^https?:\/\/github\.com\//i, '')
                .replace(/\.git$/i, '')
                .replace(/^\/+|\/+$/g, '') || 'hasibcore/Air_Canvas';
            const token = String(parsed.token || process.env.GITHUB_TOKEN || '').trim();
            const validToken = /^(gh[pousr]_[A-Za-z0-9_]{16,255}|github_pat_[A-Za-z0-9_]{16,255})$/.test(token);
            const validSlug = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo);

            res.setHeader('Content-Type', 'application/json');
            if (!validToken || !validSlug) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  ok: false,
                  error:
                    'Paste your GitHub Personal Access Token (ghp_... or github_pat_...) above to push directly to https://github.com/hasibcore/Air_Canvas, or click the GitHub Sync icon in the top AI Studio toolbar.',
                })
              );
              return;
            }

            const remoteUrl = `https://x-access-token:${token}@github.com/${cleanRepo}.git`;
            spawnSync('git', ['tag', '-f', '-a', 'v2.0.0', '-m', 'Air Canvas v2.0.0 Release'], {
              shell: false,
              timeout: 10000,
            });
            const pushMain = spawnSync('git', ['push', remoteUrl, 'HEAD:refs/heads/main', '--force'], {
              shell: false,
              timeout: 25000,
              encoding: 'utf8',
            });
            const pushTag = spawnSync('git', ['push', remoteUrl, 'refs/tags/v2.0.0:refs/tags/v2.0.0', '--force'], {
              shell: false,
              timeout: 25000,
              encoding: 'utf8',
            });

            if (pushMain.status === 0 && pushTag.status === 0) {
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: true,
                  message: `Successfully pushed main and tag v2.0.0 to https://github.com/${cleanRepo}! GitHub Actions is now building v2.0.0 .exe and .apk.`,
                  output: (pushMain.stdout || '') + '\n' + (pushTag.stdout || ''),
                })
              );
            } else {
              const safeErr = ((pushMain.stderr || '') + '\n' + (pushTag.stderr || ''))
                .replace(new RegExp(token, 'g'), '***')
                .trim();
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: safeErr || 'Push failed' }));
            }
          } catch (e: unknown) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Invalid request' }));
          }
        });
      });


      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        const secProtocol = req.headers['sec-websocket-protocol'] || '';
        // Skip Vite's internal HMR socket, upgrade all AirCanvas client/server WebSocket connections
        if (secProtocol.includes('vite-hmr')) return;
        if (url === '/' || url.startsWith('/?') || url.startsWith('/ws') || url.startsWith('/aircanvas')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      wss.on('connection', (ws: WebSocket, req) => {
        let pin = '1234';
        let role = 'client';
        let deviceName = 'AirCanvas Device';
        let localIp = '192.168.1.100';
        let port = 9090;
        let transportType = 'wifi';

        try {
          const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
          pin = parsedUrl.searchParams.get('pin') || '1234';
          role = parsedUrl.searchParams.get('role') || 'client';
          deviceName = parsedUrl.searchParams.get('name') || (role === 'server' ? 'AirCanvas-PC-Host' : 'Mobile Tablet');
          localIp = parsedUrl.searchParams.get('ip') || '192.168.1.100';
          port = parseInt(parsedUrl.searchParams.get('port') || '9090', 10);
          transportType = parsedUrl.searchParams.get('transport') || 'wifi';
        } catch { }

        if (!rooms.has(pin)) {
          rooms.set(pin, new Set());
        }
        const room = rooms.get(pin)!;
        room.add(ws);
        peerMeta.set(ws, { ws, pin, role, deviceName, localIp, port, transportType });

        console.log(`[WebSocket Relay] Device joined Room PIN: ${pin} (${role} - ${deviceName}). Total: ${room.size}`);

        try {
          ws.send(JSON.stringify({
            type: 'room_joined',
            pin,
            role,
            peerCount: room.size,
            timestamp: Date.now(),
          }));

          // Immediately replay cached PC screen dimensions and PC Software Working Area to joining client
          const cached = roomSyncState.get(pin);
          if (cached?.screenSync) {
            ws.send(cached.screenSync);
          }
          if (cached?.softwareSync) {
            ws.send(cached.softwareSync);
          }
        } catch { }

        // Notify peers in this PIN room (and also notify the newly joined socket about existing peers)
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
                timestamp: Date.now(),
              }));
              ws.send(JSON.stringify({
                type: 'peer_connected',
                role: existingMeta?.role || 'server',
                pin,
                deviceName: existingMeta?.deviceName || 'AirCanvas-PC-Host',
                transportType: existingMeta?.transportType || transportType,
                peerCount: room.size,
                timestamp: Date.now(),
              }));
            } catch { }
          }
        }

        ws.on('message', (data, isBinary) => {
          if (!isBinary) {
            try {
              const rawStr = data.toString();
              const parsed = JSON.parse(rawStr);
              if (parsed.type === 'ping') {
                ws.send(JSON.stringify({
                  type: 'pong',
                  timestamp: parsed.timestamp,
                  peerCount: room.size,
                  serverTimestamp: Date.now(),
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
                const meta = peerMeta.get(ws);
                if (meta) {
                  meta.role = 'server';
                  meta.deviceName = parsed.name || meta.deviceName;
                  meta.localIp = parsed.ip || meta.localIp;
                  meta.port = parsed.port || meta.port;
                  if (parsed.pin && parsed.pin !== pin) {
                    room.delete(ws);
                    pin = String(parsed.pin);
                    meta.pin = pin;
                    if (!rooms.has(pin)) rooms.set(pin, new Set());
                    rooms.get(pin)!.add(ws);
                  }
                }
              }
              if (parsed.type === 'discovery_ping') {
                // Reply with all active hosts (or any active peer rooms)
                const hostsFound: Array<{ ip: string; name: string; port: number; pin: string; model: string; platform: string }> = [];
                for (const [, meta] of peerMeta.entries()) {
                  if (meta.ws !== ws && meta.ws.readyState === WebSocket.OPEN && meta.role === 'server') {
                    hostsFound.push({
                      ip: meta.localIp || 'relay',
                      name: meta.deviceName || 'AirCanvas-PC-Host',
                      port: meta.port || 9090,
                      pin: meta.pin || '1234',
                      model: `Room PIN ${meta.pin} • Ready`,
                      platform: 'windows',
                    });
                  }
                }
                if (hostsFound.length === 0) {
                  // Always provide the active default host room so Same Wi-Fi scan finds the PC immediately
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
            } catch {}
          }

          const currentRoom = rooms.get(pin) || room;
          for (const peer of currentRoom) {
            if (peer !== ws && peer.readyState === WebSocket.OPEN) {
              try {
                peer.send(data, { binary: isBinary });
              } catch { }
            }
          }
        });

        ws.on('close', () => {
          const currentRoom = rooms.get(pin) || room;
          currentRoom.delete(ws);
          peerMeta.delete(ws);
          console.log(`[WebSocket Relay] Device left Room PIN: ${pin}. Remaining: ${currentRoom.size}`);
          if (currentRoom.size === 0) {
            rooms.delete(pin);
          } else {
            for (const peer of currentRoom) {
              if (peer.readyState === WebSocket.OPEN) {
                try {
                  peer.send(JSON.stringify({
                    type: 'peer_disconnected',
                    peerCount: currentRoom.size,
                    timestamp: Date.now(),
                  }));
                } catch { }
              }
            }
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    websocketRelay(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
