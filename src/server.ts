import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Simulator } from './simulator';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

function buildMeta(req: any, wsPath: string, geomType: string, fields: any[]) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  return {
    currentVersion: 10.9,
    name: 'WC Radio Simulator',
    capabilities: 'Streaming',
    type: 'StreamServer',
    geometryType: geomType,
    minScale: 0, maxScale: 0,
    spatialReference: { wkid: 4326 },
    trackIdField: 'TRACKID',
    fields,
    streamUrls: [{ type: 'websocket', url: `${wsUrl}${wsPath}` }],
  };
}

const RADIO_FIELDS = [
  { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'Object ID', nullable: false },
  { name: 'TRACKID', type: 'esriFieldTypeString', alias: 'Radio ID', nullable: false, length: 16 },
  { name: 'TIMESTAMP', type: 'esriFieldTypeDouble', alias: 'Timestamp', nullable: false },
  { name: 'type', type: 'esriFieldTypeString', alias: 'Radio Type', nullable: true, length: 16 },
  { name: 'signalStrength', type: 'esriFieldTypeDouble', alias: 'Signal Strength', nullable: true },
  { name: 'interference', type: 'esriFieldTypeDouble', alias: 'Interference', nullable: true },
  { name: 'battery', type: 'esriFieldTypeDouble', alias: 'Battery Level', nullable: true },
  { name: 'unit', type: 'esriFieldTypeString', alias: 'Unit', nullable: true, length: 32 },
  { name: 'role', type: 'esriFieldTypeString', alias: 'Role', nullable: true, length: 32 },
];

const COVERAGE_FIELDS = [
  { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'Object ID', nullable: false },
  { name: 'TRACKID', type: 'esriFieldTypeString', alias: 'Radio ID', nullable: false, length: 16 },
  { name: 'TIMESTAMP', type: 'esriFieldTypeDouble', alias: 'Timestamp', nullable: false },
  { name: 'type', type: 'esriFieldTypeString', alias: 'Radio Type', nullable: true, length: 16 },
  { name: 'coverageAreaKm2', type: 'esriFieldTypeDouble', alias: 'Coverage Area (km²)', nullable: true },
  { name: 'beamWidth', type: 'esriFieldTypeDouble', alias: 'Beam Width (°)', nullable: true },
];

app.get('/arcgis/rest/services/radios/StreamServer', (req, res) => {
  res.json(buildMeta(req, '/ws/radios', 'esriGeometryPoint', RADIO_FIELDS));
});

app.get('/arcgis/rest/services/coverage/StreamServer', (req, res) => {
  res.json(buildMeta(req, '/ws/coverage', 'esriGeometryPolygon', COVERAGE_FIELDS));
});

// ── Server ──────────────────────────────────────────────────────────────────
const server = http.createServer(app);

function createWs(path: string, name: string): WebSocketServer {
  const wss = new WebSocketServer({ server, path, perMessageDeflate: false });
  wss.on('connection', (ws) => {
    console.log(`${name} WS connected (total: ${wss.clients.size})`);
    ws.on('message', (msg) => {
      try {
        const obj = JSON.parse(msg.toString());
        if (obj.format && obj.spatialReference) {
          obj.error = null;
          ws.send(JSON.stringify(obj));
        }
      } catch { /* */ }
    });
  });
  return wss;
}

const rws = createWs('/ws/radios', 'Radio');
const cws = createWs('/ws/coverage', 'Coverage');

function bcast(wss: WebSocketServer, json: string) {
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(json);
}

const sim = new Simulator();
sim.onTick((features, coverages) => {
  for (const f of features) bcast(rws, JSON.stringify(f));
  for (const c of coverages) bcast(cws, JSON.stringify(c));
});

server.listen(PORT, () => {
  console.log(`🚀 WC Simulator @ http://localhost:${PORT}`);
  console.log(`   Radio: ws://localhost:${PORT}/ws/radios`);
  console.log(`   Coverage: ws://localhost:${PORT}/ws/coverage`);
  sim.start();
});
