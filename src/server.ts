import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Simulator } from './simulator';
import { ARCGIS_STREAM_FORMAT } from './types';

const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Express ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve a REST-like metadata endpoint so ArcGIS StreamLayer can discover
app.get('/arcgis/rest/services/radios/StreamServer', (_req, res) => {
  const baseUrl = `${_req.protocol}://${_req.get('host')}`;
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  res.json({
    currentVersion: 10.9,
    name: 'Radio Coverage Simulator',
    serviceDescription: 'Simulated radio positions and coverage for Ukraine war study',
    capabilities: 'Streaming',
    type: 'StreamServer',
    streamingCapabilities: {
      supportsTrackId: true,
      supportsOrderBy: false,
      supportsFilter: true,
    },
    minScale: 0,
    maxScale: 0,
    spatialReference: { wkid: 4326 },
    timeInfo: {
      timeExtent: [0, 9999999999999],
      timeReference: { timeZone: 'UTC' },
      trackIdField: 'TRACKID',
      startTimeField: 'TIMESTAMP',
    },
    fields: [
      { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'Object ID', nullable: false },
      { name: 'TRACKID', type: 'esriFieldTypeString', alias: 'Radio ID', nullable: false, length: 16 },
      { name: 'TIMESTAMP', type: 'esriFieldTypeDouble', alias: 'Timestamp', nullable: false },
      { name: 'type', type: 'esriFieldTypeString', alias: 'Radio Type', nullable: true, length: 16 },
      { name: 'signalStrength', type: 'esriFieldTypeDouble', alias: 'Signal Strength', nullable: true },
      { name: 'interference', type: 'esriFieldTypeDouble', alias: 'Interference', nullable: true },
      { name: 'battery', type: 'esriFieldTypeDouble', alias: 'Battery Level', nullable: true },
      { name: 'unit', type: 'esriFieldTypeString', alias: 'Unit', nullable: true, length: 32 },
      { name: 'role', type: 'esriFieldTypeString', alias: 'Role', nullable: true, length: 32 },
    ],
    streamUrls: [{ type: 'websocket', url: `${wsUrl}/ws/radios` }],
  });
});

// Coverage stream metadata — polygon features
app.get('/arcgis/rest/services/coverage/StreamServer', (_req, res) => {
  const baseUrl = `${_req.protocol}://${_req.get('host')}`;
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  res.json({
    currentVersion: 10.9,
    name: 'Radio Coverage Areas',
    serviceDescription: 'Polygon coverage zones for each radio',
    capabilities: 'Streaming',
    type: 'StreamServer',
    streamingCapabilities: { supportsTrackId: true },
    minScale: 0,
    maxScale: 0,
    spatialReference: { wkid: 4326 },
    timeInfo: {
      timeExtent: [0, 9999999999999],
      timeReference: { timeZone: 'UTC' },
      trackIdField: 'TRACKID',
      startTimeField: 'TIMESTAMP',
    },
    fields: [
      { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'Object ID', nullable: false },
      { name: 'TRACKID', type: 'esriFieldTypeString', alias: 'Radio ID', nullable: false, length: 16 },
      { name: 'TIMESTAMP', type: 'esriFieldTypeDouble', alias: 'Timestamp', nullable: false },
      { name: 'type', type: 'esriFieldTypeString', alias: 'Radio Type', nullable: true, length: 16 },
      { name: 'coverageAreaKm2', type: 'esriFieldTypeDouble', alias: 'Coverage Area (km²)', nullable: true },
      { name: 'beamWidth', type: 'esriFieldTypeDouble', alias: 'Beam Width (°)', nullable: true },
    ],
    streamUrls: [{ type: 'websocket', url: `${wsUrl}/ws/coverage` }],
  });
});

// ── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ── WebSockets ──────────────────────────────────────────────────────────────
const wssRadios = new WebSocketServer({ server, path: '/ws/radios' });
const wssCoverage = new WebSocketServer({ server, path: '/ws/coverage' });

wssRadios.on('connection', (ws) => {
  console.log(`Radio WS client connected (total: ${wssRadios.clients.size})`);
  ws.on('message', (msg) => {
    // Echo handshake — required by ArcGIS StreamLayer SDK
    try {
      const obj = JSON.parse(msg.toString());
      if (obj.format || obj.spatialReference) {
        obj.error = null;
        ws.send(JSON.stringify(obj));
        console.log('Handshake echoed for radio WS');
      }
    } catch { /* ignore non-handshake messages */ }
  });
});

wssCoverage.on('connection', (ws) => {
  console.log(`Coverage WS client connected (total: ${wssCoverage.clients.size})`);
  ws.on('message', (msg) => {
    try {
      const obj = JSON.parse(msg.toString());
      if (obj.format || obj.spatialReference) {
        obj.error = null;
        ws.send(JSON.stringify(obj));
        console.log('Handshake echoed for coverage WS');
      }
    } catch { /* ignore */ }
  });
});

// ── Broadcast helpers ──────────────────────────────────────────────────────
function broadcastRadios(featureJson: string) {
  for (const client of wssRadios.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(featureJson);
  }
}
function broadcastCoverage(featureJson: string) {
  for (const client of wssCoverage.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(featureJson);
  }
}

// ── Start Simulator ────────────────────────────────────────────────────────
const sim = new Simulator();
sim.onTick((features, coverages) => {
  for (const f of features) broadcastRadios(JSON.stringify(f));
  for (const c of coverages) broadcastCoverage(JSON.stringify(c));
});

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 WC Simulator running at http://localhost:${PORT}`);
  console.log(`   Radio WS: ws://localhost:${PORT}/ws/radios`);
  console.log(`   Coverage WS: ws://localhost:${PORT}/ws/coverage`);
  sim.start();
});
