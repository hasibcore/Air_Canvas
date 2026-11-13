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
  isAlive: boolean;
  msgCountWindow: number;
  windowStartMs: number;
  badBinaryStreak: number;
}

const MAX_ROOMS = 2000;
const MAX_PEERS_PER_ROOM = 32;
const MAX_MESSAGES_PER_SEC = 600;

function sanitizePin(rawPin: string | null): string {
  const cleaned = String(rawPin || '1234').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < 4 || cleaned.length > 16) return '1234';
  return cleaned;
}

function sanitizeLogText(value: unknown, maxLen = 64): string {
  return String(value || '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function websocketRelay(): Plugin {
  const rooms = new Map<string, Set<WebSocket>>();
  const peerMeta = new Map<WebSocket, PeerMeta>();
  const roomSyncState = new Map<
    string,
    { screenSync?: string; softwareSync?: string; workingAreaDetected?: string }
  >();

  return {
    name: 'aircanvas-websocket-relay',
    configureServer(server) {
      server.middlewares.use('/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: 'ok',
            rooms: rooms.size,
            connections: peerMeta.size,
            timestamp: Date.now(),
          })
        );
      });
      server.middlewares.use('/_health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: 'ok',
            rooms: rooms.size,
            connections: peerMeta.size,
            timestamp: Date.now(),
          })
        );
      });
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
      server.middlewares.use('/downloads/', (req, res, next) => {
        const assetName = (req.url || '').split('?')[0].replace(/^\/+/, '');
        const allowedAssets = [
          'AirCanvas-release.apk',
          'AirCanvas.exe',
          'AirCanvasServer.exe',
          'AirCanvas-Windows-x64.zip',
        ];
        if (allowedAssets.includes(assetName)) {
          res.statusCode = 302;
          res.setHeader(
            'Location',
            `https://github.com/hasibcore/Air_Canvas/releases/latest/download/${assetName}`
          );
          res.end();
          return;
        }
        next();
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
            spawnSync('git', ['config', '--global', '--add', 'safe.directory', '*'], { shell: false, timeout: 5000 });
            spawnSync('git', ['init'], { shell: false, timeout: 5000 });
            spawnSync('git', ['config', 'user.name', 'hasibcore'], { shell: false, timeout: 5000 });
            spawnSync('git', ['config', 'user.email', 'hasibulhasancore@gmail.com'], { shell: false, timeout: 5000 });
            spawnSync('git', ['checkout', '-B', 'main'], { shell: false, timeout: 5000 });
            spawnSync('git', ['add', '-A'], { shell: false, timeout: 10000 });
            spawnSync(
              'git',
              [
                'commit',
                '-m',
                'Release AirCanvas v2.1.3 — Hardened Dual-Device Relay, Stroke Precision & Security Fixes',
              ],
              { shell: false, timeout: 10000 }
            );
            spawnSync('git', ['tag', '-f', '-a', 'v2.1.3', '-m', 'Air Canvas v2.1.3 Release'], {
              shell: false,
              timeout: 10000,
            });
            const pushMain = spawnSync('git', ['push', remoteUrl, 'HEAD:refs/heads/main', '--force'], {
              shell: false,
              timeout: 25000,
              encoding: 'utf8',
            });
            const pushTag = spawnSync('git', ['push', remoteUrl, 'refs/tags/v2.1.3:refs/tags/v2.1.3', '--force'], {
              shell: false,
              timeout: 25000,
              encoding: 'utf8',
            });

            if (pushMain.status === 0 && pushTag.status === 0) {
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: true,
                  message: `Successfully pushed main and tag v2.1.3 to https://github.com/${cleanRepo}! GitHub Actions is now building v2.1.3 AirCanvas.exe, AirCanvasServer.exe, and AirCanvas-release.apk.`,
                  output: (pushMain.stdout || '') + '\n' + (pushTag.stdout || ''),
                })
              );
            } else {
              const safeErr = ((pushMain.stderr || '') + '\n' + (pushTag.stderr || ''))
                .split(token)
                .join('***')
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

      const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });

      wss.on('error', (err) => {
        console.error('[WebSocket Relay Server Error]:', err.message);
      });

      const heartbeatInterval = setInterval(() => {
        for (const ws of wss.clients) {
          const meta = peerMeta.get(ws);
          if (meta && !meta.isAlive) {
            try { ws.terminate(); } catch {}
            continue;
          }
          if (meta) meta.isAlive = false;
          try { ws.ping(); } catch {}
        }
      }, 15000);
      heartbeatInterval.unref?.();

      server.httpServer.on('close', () => {
        clearInterval(heartbeatInterval);
      });

      server.httpServer.on('upgrade', (req, socket, head) => {
        socket.on('error', () => {});
        const url = req.url || '';
        const secProtocol = String(req.headers['sec-websocket-protocol'] || '');
        if (secProtocol.includes('vite-hmr')) return;
        if (url.startsWith('/ws') || url.startsWith('/aircanvas')) {
          try {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req);
            });
          } catch {
            try {
              socket.destroy();
            } catch {}
          }
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
          const rawHost = String(req.headers.host || 'localhost').replace(/[^a-zA-Z0-9.:_-]/g, '') || 'localhost';
          const parsedUrl = new URL(req.url || '/', `http://${rawHost}`);
          pin = sanitizePin(parsedUrl.searchParams.get('pin'));
          const rawRole = parsedUrl.searchParams.get('role') || 'client';
          role = rawRole === 'server' || rawRole === 'studio' ? rawRole : 'client';
          deviceName = sanitizeLogText(
            parsedUrl.searchParams.get('name') || (role === 'server' ? 'AirCanvas-PC-Host' : 'Mobile Tablet'),
            64
          ) || 'AirCanvas Device';
          localIp = sanitizeLogText(parsedUrl.searchParams.get('ip') || '192.168.1.100', 45) || '192.168.1.100';
          const parsedPort = parseInt(parsedUrl.searchParams.get('port') || '9090', 10);
          port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 9090;
          transportType = sanitizeLogText(parsedUrl.searchParams.get('transport') || 'wifi', 16) || 'wifi';
        } catch { }

        if (!rooms.has(pin) && rooms.size >= MAX_ROOMS) {
          try { ws.close(1013, 'Maximum relay rooms reached'); } catch {}
          return;
        }
        if (!rooms.has(pin)) {
          rooms.set(pin, new Set());
        }
        const room = rooms.get(pin)!;
        if (room.size >= MAX_PEERS_PER_ROOM) {
          try { ws.close(1013, 'Room is full'); } catch {}
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
          if (cached?.workingAreaDetected) {
            ws.send(cached.workingAreaDetected);
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
                ip: localIp,
                port,
                transportType,
                peerCount: room.size,
                timestamp: Date.now(),
              }));
              ws.send(JSON.stringify({
                type: 'peer_connected',
                role: existingMeta?.role || 'server',
                pin,
                deviceName: existingMeta?.deviceName || 'AirCanvas-PC-Host',
                ip: existingMeta?.localIp || '192.168.1.100',
                port: existingMeta?.port || 9090,
                transportType: existingMeta?.transportType || transportType,
                peerCount: room.size,
                timestamp: Date.now(),
              }));
            } catch { }
          }
        }

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
              return;
            }
          }

          if (isBinary) {
            const byteLen = Buffer.isBuffer(data) ? data.length : (data as ArrayBuffer).byteLength;
            if (byteLen === 0 || byteLen % 13 !== 0) {
              if (meta) {
                meta.badBinaryStreak++;
                if (meta.badBinaryStreak >= 16) {
                  try { ws.close(1002, 'Invalid binary frame length'); } catch {}
                }
              }
              return;
            }
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
            for (let offset = 0; offset < buf.length; offset += 13) {
              const evType = buf[offset + 0];
              const toolId = buf[offset + 7];
              const ver = buf[offset + 12];
              if (ver !== 1 || evType > 3 || toolId > 2) {
                if (meta) {
                  meta.badBinaryStreak++;
                  if (meta.badBinaryStreak >= 16) {
                    try { ws.close(1002, 'Invalid binary frame header'); } catch {}
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
                const activeRoom = rooms.get(pin) || room;
                ws.send(JSON.stringify({
                  type: 'pong',
                  timestamp: parsed.timestamp,
                  peerCount: activeRoom.size,
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
              if (parsed.type === 'workingAreaDetected') {
                const state = roomSyncState.get(pin) || {};
                state.workingAreaDetected = rawStr;
                roomSyncState.set(pin, state);
              }
              if (parsed.type === 'register_host' && meta) {
                meta.role = 'server';
                meta.deviceName = sanitizeLogText(parsed.name || meta.deviceName, 64) || meta.deviceName;
                meta.localIp = sanitizeLogText(parsed.ip || meta.localIp, 45) || meta.localIp;
                const pPort = Number(parsed.port);
                if (Number.isInteger(pPort) && pPort >= 1 && pPort <= 65535) {
                  meta.port = pPort;
                }
                if (parsed.pin) {
                  const nextPin = sanitizePin(String(parsed.pin));
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
                        try { ws.close(1013, 'Maximum relay rooms reached'); } catch {}
                        return;
                      }
                      rooms.set(nextPin, new Set());
                    }
                    const nextRoom = rooms.get(nextPin)!;
                    if (nextRoom.size >= MAX_PEERS_PER_ROOM) {
                      try { ws.close(1013, 'Room is full'); } catch {}
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
              if (parsed.type === 'discovery_ping') {
                // Scope discovery strictly to active host peers in the caller's PIN room (no phantom fallback)
                const scopedRoom = rooms.get(pin) || room;
                const hostsFound: Array<{ ip: string; name: string; port: number; pin: string; model: string; platform: string }> = [];
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
                    ws.send(JSON.stringify({
                      type: 'discovery_empty',
                      pin,
                      hostsFound: 0,
                      timestamp: Date.now(),
                    }));
                  }
                } else {
                  for (const h of hostsFound) {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({
                        type: 'discovery_pong',
                        ...h,
                      }));
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
              if (isBinary && peer.bufferedAmount > 262144) {
                const firstByte = Buffer.isBuffer(data) ? data[0] : new Uint8Array(data as ArrayBuffer)[0];
                if (firstByte === 1 || firstByte === 3) {
                  continue;
                }
              }
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
            roomSyncState.delete(pin);
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

        ws.on('error', (err) => {
          console.error('[WebSocket Relay Error]:', err.message);
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
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
