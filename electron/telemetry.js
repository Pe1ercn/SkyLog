import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const TELEMETRY_PORT = 42831;

export function deriveFlightPhase(sample) {
  if (!sample) return 'unknown';
  const speed = Number(sample.speedKt) || 0;
  const altitude = Number(sample.altitudeFt) || 0;
  const vs = Number(sample.verticalSpeedFpm) || 0;
  if (sample.onGround) {
    if (speed < 25) return 'taxi';
    return 'takeoff';
  }
  if (altitude < 3000 && vs < -250 && speed < 180) return 'landing';
  if (vs > 350) return 'climb';
  if (vs < -350) return 'descent';
  return 'cruise';
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTelemetry(input) {
  if (!input || typeof input !== 'object') return null;
  const lat = number(input.lat ?? input.latitude, NaN);
  const lon = number(input.lon ?? input.longitude, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  const sample = {
    source: String(input.source || 'unknown').slice(0, 20),
    lat,
    lon,
    altitudeFt: number(input.altitudeFt ?? input.altitude, 0),
    speedKt: Math.max(0, number(input.speedKt ?? input.speed, 0)),
    headingDeg: ((number(input.headingDeg ?? input.heading, 0) % 360) + 360) % 360,
    verticalSpeedFpm: number(input.verticalSpeedFpm ?? input.verticalSpeed, 0),
    onGround: Boolean(input.onGround ?? input.ground),
    timestamp: number(input.timestamp, Date.now()),
    simTime: number(input.simTime, 0),
  };
  sample.phase = deriveFlightPhase(sample);
  return sample;
}

export class TelemetryBridge {
  constructor(options = {}) {
    this.onSample = options.onSample || (() => {});
    this.onSession = options.onSession || (() => {});
    this.server = null;
    this.port = options.port || TELEMETRY_PORT;
    this.lastSample = null;
    this.fileWatcher = null;
    this.watchTimer = null;
    this.log = options.logger || (() => {});
  }

  async start() {
    if (this.server) return { ok: true, port: this.port };
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on('error', (error) => {
        this.log(`[telemetry] server error: ${error.message}`);
        this.server = null;
        resolve({ ok: false, error: error.message });
      });
      server.listen(this.port, '127.0.0.1', () => {
        this.server = server;
        this.log(`[telemetry] listening on 127.0.0.1:${this.port}`);
        resolve({ ok: true, port: this.port });
      });
    });
  }

  async stop() {
    this.stopFileWatch();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(() => resolve()));
  }

  handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/health')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, port: this.port, lastSample: this.lastSample?.timestamp || null }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 256 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid-json' }));
        return;
      }
      if (req.url?.startsWith('/session')) {
        this.onSession({
          action: String(payload.action || ''),
          flightId: String(payload.flightId || ''),
          source: String(payload.source || ''),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const sample = normalizeTelemetry(payload);
      if (!sample) {
        res.writeHead(422, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid-sample' }));
        return;
      }
      this.lastSample = sample;
      this.onSample(sample);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, phase: sample.phase }));
    });
  }

  ingest(sample) {
    const normalized = normalizeTelemetry(sample);
    if (!normalized) return null;
    this.lastSample = normalized;
    this.onSample(normalized);
    return normalized;
  }

  watchFile(filePath, source = 'xplane') {
    this.stopFileWatch();
    if (!filePath) return;
    let lastMtime = 0;
    this.watchTimer = setInterval(() => {
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.mtimeMs <= lastMtime) return;
        lastMtime = stat.mtimeMs;
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        parsed.source = parsed.source || source;
        this.ingest(parsed);
      } catch {
        // The plugin may not have written its first sample yet.
      }
    }, 350);
    this.fileWatcher = filePath;
  }

  stopFileWatch() {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    this.fileWatcher = null;
  }
}
