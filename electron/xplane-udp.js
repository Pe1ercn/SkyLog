import dgram from 'node:dgram';

const DATAREFS = {
  lat: 'sim/flightmodel/position/latitude',
  lon: 'sim/flightmodel/position/longitude',
  elevation: 'sim/flightmodel/position/elevation',
  speed: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  heading: 'sim/flightmodel/position/psi',
  verticalSpeed: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
  onGround: 'sim/flightmodel/failures/onground_any',
  groundSpeed: 'sim/flightmodel/position/groundspeed',
};

const RREF_HEADER = Buffer.from('RREF\0', 'ascii');
const RREF_PACKET_SIZE = 5 + 4 + 4 + 400;

export function buildRrefPacket(frequency, index, dataref) {
  const packet = Buffer.alloc(RREF_PACKET_SIZE);
  RREF_HEADER.copy(packet, 0);
  packet.writeInt32LE(frequency, 5);
  packet.writeInt32LE(index, 9);
  packet.write(String(dataref).slice(0, 399), 13, 399, 'ascii');
  packet[412] = 0;
  return packet;
}

export function decodeRrefMessage(message) {
  if (!Buffer.isBuffer(message) || message.length < 13) return null;
  if (message.subarray(0, 5).toString('ascii') !== 'RREF,') return null;
  return {
    index: message.readInt32LE(5),
    value: message.readFloatLE(9),
  };
}

/**
 * X-Plane 11/12 can stream datarefs over its built-in UDP RREF protocol. This
 * avoids making FlyWithLua a hard dependency. The user only needs to keep
 * X-Plane's UDP data output enabled on the default port (49000).
 */
export class XPlaneUdpBridge {
  constructor(options = {}) {
    this.onSample = options.onSample || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.log = options.logger || (() => {});
    this.port = Number(options.port) || 49000;
    this.host = options.host || '127.0.0.1';
    this.socket = null;
    this.sendTimer = null;
    this.watchTimer = null;
    this.values = new Map();
    this.indexToKey = new Map();
    this.running = false;
    this.lastPacketAt = 0;
    this.lastSampleAt = 0;
    this.status = {
      family: 'xplane',
      transport: 'udp-rref',
      state: 'idle',
      connected: false,
      message: '',
      port: this.port,
      lastSampleAt: 0,
    };
    Object.keys(DATAREFS).forEach((key, index) => this.indexToKey.set(index, key));
  }

  setStatus(patch = {}) {
    this.status = { ...this.status, ...patch };
    this.onStatus({ ...this.status });
  }

  start() {
    if (this.running) return this.status;
    this.running = true;
    this.setStatus({ state: 'connecting', connected: false, message: `正在监听 X-Plane UDP ${this.port}…` });
    const socket = dgram.createSocket('udp4');
    this.socket = socket;
    socket.on('message', (message) => this.parseMessage(message));
    socket.on('error', (error) => {
      this.log(`[xplane-udp] ${error.message}`);
      this.setStatus({ state: 'error', connected: false, message: `X-Plane UDP 错误：${error.message}` });
    });
    socket.bind(0, '127.0.0.1', () => {
      this.log(`[xplane-udp] local socket bound; requesting RREF from ${this.host}:${this.port}`);
      this.sendRequests();
      this.sendTimer = setInterval(() => this.sendRequests(), 1000);
      this.watchTimer = setInterval(() => {
        if (this.lastPacketAt && Date.now() - this.lastPacketAt > 5000) {
          this.setStatus({
            state: 'waiting',
            connected: false,
            message: '未收到 X-Plane UDP 数据；请在 X-Plane 设置 → 网络启用 UDP 数据输出（端口 49000）。',
          });
        }
      }, 5000);
    });
    return this.status;
  }

  sendRequests() {
    if (!this.socket) return;
    for (const [index, key] of this.indexToKey.entries()) {
      const packet = buildRrefPacket(5, index, DATAREFS[key]);
      this.socket.send(packet, this.port, this.host, (error) => {
        if (error) this.log(`[xplane-udp] send ${key}: ${error.message}`);
      });
    }
  }

  parseMessage(message) {
    const decoded = decodeRrefMessage(message);
    if (!decoded) return;
    const { index, value } = decoded;
    const key = this.indexToKey.get(index);
    if (!key) return;
    this.values.set(key, value);
    this.lastPacketAt = Date.now();
    if (!this.status.connected) {
      this.setStatus({ state: 'connected', connected: true, message: 'X-Plane UDP 已连接' });
    }
    const now = Date.now();
    if (now - this.lastSampleAt < 250) return;
    const lat = this.values.get('lat');
    const lon = this.values.get('lon');
    const ready = ['lat', 'lon', 'elevation', 'speed', 'heading', 'verticalSpeed', 'onGround']
      .every((key) => this.values.has(key));
    if (!ready || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.lastSampleAt = now;
    this.status.lastSampleAt = now;
    this.onSample({
      source: 'xplane-udp',
      lat,
      lon,
      altitudeFt: (this.values.get('elevation') || 0) * 3.28084,
      speedKt: this.values.get('speed') || 0,
      headingDeg: this.values.get('heading') || 0,
      verticalSpeedFpm: this.values.get('verticalSpeed') || 0,
      onGround: (this.values.get('onGround') || 0) > 0.5,
      groundSpeedKt: this.values.get('groundSpeed') || 0,
      timestamp: now,
    });
  }

  stop() {
    this.running = false;
    if (this.sendTimer) clearInterval(this.sendTimer);
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.sendTimer = null;
    this.watchTimer = null;
    try { this.socket?.close(); } catch { /* ignore */ }
    this.socket = null;
    this.setStatus({ state: 'stopped', connected: false, message: 'X-Plane UDP 已停止' });
  }

  diagnostics() {
    return { ...this.status, running: this.running };
  }
}
