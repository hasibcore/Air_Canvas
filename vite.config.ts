import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { WebSocketServer, WebSocket } from 'ws';

function websocketRelay(): Plugin {
  const rooms = new Map<string, Set<WebSocket>>();

  return {
    name: 'aircanvas-websocket-relay',
    configureServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        if (url.startsWith('/ws') || url.startsWith('/aircanvas')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      wss.on('connection', (ws: WebSocket, req) => {
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
        const room = rooms.get(pin)!;
        room.add(ws);

        console.log(`[WebSocket Relay] Device joined Room PIN: ${pin} (${role}). Total: ${room.size}`);

        try {
          ws.send(JSON.stringify({
            type: 'room_joined',
            pin,
            role,
            peerCount: room.size,
            timestamp: Date.now(),
          }));
        } catch { }

        // Notify peers in this PIN room
        for (const peer of room) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            try {
              peer.send(JSON.stringify({
                type: 'peer_connected',
                role,
                peerCount: room.size,
                timestamp: Date.now(),
              }));
            } catch { }
          }
        }

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
          console.log(`[WebSocket Relay] Device left Room PIN: ${pin}. Remaining: ${room.size}`);
          if (room.size === 0) {
            rooms.delete(pin);
          } else {
            for (const peer of room) {
              if (peer.readyState === WebSocket.OPEN) {
                try {
                  peer.send(JSON.stringify({
                    type: 'peer_disconnected',
                    peerCount: room.size,
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
  },
});
