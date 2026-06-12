import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Simulator } from './simulator';

const PORT = parseInt(process.env.PORT || '3011', 10);

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);

// ── Single WebSocket — route internally by first message ──────────────────
const wss = new WebSocketServer({ server, perMessageDeflate: false });

type ClientType = 'radios' | 'coverage' | null;
const clients = new Map<WebSocket, ClientType>();

wss.on('connection', (ws) => {
  clients.set(ws, null);
  ws.on('message', (msg) => {
    try {
      const obj = JSON.parse(msg.toString());
      // First message determines channel
      if (clients.get(ws) === null) {
        if (obj.channel === 'radios' || obj.channel === 'coverage') {
          clients.set(ws, obj.channel);
          console.log(`${obj.channel} client connected (total: ${count(obj.channel)})`);
          return;
        }
      }
      // Handshake echo for ArcGIS compatibility (unused now but harmless)
      if (obj.format && obj.spatialReference) {
        obj.error = null;
        ws.send(JSON.stringify(obj));
      }
    } catch { /* */ }
  });
  ws.on('close', () => clients.delete(ws));
});

function count(type: ClientType): number {
  let n = 0;
  for (const t of clients.values()) if (t === type) n++;
  return n;
}

function broadcast(type: ClientType, json: string) {
  for (const [ws, t] of clients) {
    if (t === type && ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

// ── Start Simulator ────────────────────────────────────────────────────────
const sim = new Simulator();
sim.onTick((features, coverages) => {
  for (const f of features) broadcast('radios', JSON.stringify(f));
  for (const c of coverages) broadcast('coverage', JSON.stringify(c));
});

server.listen(PORT, () => {
  console.log(`🚀 WC Simulator @ http://localhost:${PORT}`);
  console.log(`   WS: ws://localhost:${PORT}  (send { channel:'radios'|'coverage' } first)`);
  sim.start();
});
