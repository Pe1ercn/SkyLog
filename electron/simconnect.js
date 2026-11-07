import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const simconnect = require('node-simconnect');
const {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
} = simconnect;

const DEFINITION_ID = 1;
const REQUEST_ID = 1;
const SAMPLE_INTERVAL_MS = 250;

function simulatorLabel(applicationName, protocolName) {
  if (protocolName === 'SunRise' || protocolName === 'KittyHawk') return 'Microsoft Flight Simulator';
  return applicationName || 'Microsoft Flight Simulator';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A local MSFS 2020/2024 telemetry source that speaks the SimConnect protocol
 * directly. Unlike the old in-game HTML panel it does not need a Community
 * package, a toolbar icon or a running web panel.
 */
export class SimConnectBridge {
  constructor(options = {}) {
    this.onSample = options.onSample || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.log = options.logger || (() => {});
    this.appName = options.appName || 'SkyLog';
    this.running = false;
    this.handle = null;
    this.timer = null;
    this.lastSampleAt = 0;
    this.lastEmitAt = 0;
    this.protocolName = '';
    this.status = {
      family: 'msfs',
      transport: 'simconnect',
      state: 'idle',
      connected: false,
      message: '',
      protocol: '',
      lastSampleAt: 0,
      attempts: 0,
    };
  }

  setStatus(patch = {}) {
    this.status = { ...this.status, ...patch };
    this.onStatus({ ...this.status });
  }

  async start() {
    if (this.running) return this.status;
    if (process.platform !== 'win32') {
      this.setStatus({ state: 'unsupported', connected: false, message: 'SimConnect 仅支持 Windows 上的 Microsoft Flight Simulator。' });
      return this.status;
    }
    this.running = true;
    this.setStatus({ state: 'connecting', connected: false, message: '正在连接 Microsoft Flight Simulator…' });
    this.connectLoop();
    return this.status;
  }

  async connectLoop() {
    while (this.running && !this.handle) {
      this.setStatus({ state: 'connecting', connected: false, message: '正在连接 Microsoft Flight Simulator…', attempts: this.status.attempts + 1 });
      for (const [name, protocol] of [
        ['SunRise', Protocol.SunRise],
        ['KittyHawk', Protocol.KittyHawk],
        ['FSX_SP2', Protocol.FSX_SP2],
      ]) {
        if (!this.running) return;
        try {
          const { recvOpen, handle } = await Promise.race([
            open(`${this.appName} ${name}`, protocol),
            new Promise((_, reject) => setTimeout(() => reject(new Error('connect-timeout')), 6000)),
          ]);
          if (!this.running) {
            try { handle?.close?.(); } catch { /* ignore */ }
            return;
          }
          this.handle = handle;
          this.protocolName = name;
          this.lastSampleAt = 0;
          this.attach(handle, recvOpen, name);
          this.setStatus({
            state: 'connected',
            connected: true,
            message: `SimConnect 已连接 · ${simulatorLabel(recvOpen?.applicationName, name)}`,
            protocol: name,
            lastSampleAt: 0,
          });
          this.log(`[simconnect] connected via ${name} to ${recvOpen?.applicationName || 'MSFS'}`);
          return;
        } catch (error) {
          this.log(`[simconnect] ${name} failed: ${error?.code || ''} ${error?.message || error}`);
          this.setStatus({
            state: 'error',
            connected: false,
            message: error?.code === 'EPERM'
              ? 'SimConnect 管道被拒绝访问；请让 SkyLog 与模拟飞行运行在同一用户会话。'
              : (error?.message === 'connect-timeout' ? '连接超时，继续重试…' : (error?.message || '连接失败')),
            protocol: name,
          });
        }
      }
      if (!this.running) return;
      await delay(4500);
    }
  }

  attach(handle, recvOpen, protocolName) {
    handle.addToDataDefinition(DEFINITION_ID, 'PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'PLANE ALTITUDE', 'feet', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'AIRSPEED INDICATED', 'knots', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'PLANE HEADING DEGREES TRUE', 'degrees', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'VERTICAL SPEED', 'feet per minute', SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_ID, 'SIM ON GROUND', 'bool', SimConnectDataType.INT32);
    handle.addToDataDefinition(DEFINITION_ID, 'GROUND VELOCITY', 'knots', SimConnectDataType.FLOAT64);
    handle.requestDataOnSimObject(
      REQUEST_ID,
      DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SIM_FRAME,
    );

    handle.on('simObjectData', (message) => {
      if (message?.requestID !== REQUEST_ID) return;
      try {
        const sample = {
          source: 'msfs-simconnect',
          lat: message.data.readFloat64(),
          lon: message.data.readFloat64(),
          altitudeFt: message.data.readFloat64(),
          speedKt: message.data.readFloat64(),
          headingDeg: message.data.readFloat64(),
          verticalSpeedFpm: message.data.readFloat64(),
          onGround: message.data.readInt32() === 1,
          groundSpeedKt: message.data.readFloat64(),
          timestamp: Date.now(),
        };
        const now = Date.now();
        this.lastSampleAt = now;
        if (now - this.lastEmitAt < SAMPLE_INTERVAL_MS) return;
        this.lastEmitAt = now;
        this.status.lastSampleAt = now;
        this.onSample(sample);
        this.setStatus({
          state: 'connected',
          connected: true,
          message: `SimConnect 已连接 · ${simulatorLabel(recvOpen?.applicationName, protocolName)}`,
          protocol: protocolName,
          lastSampleAt: now,
        });
      } catch (error) {
        this.log(`[simconnect] bad sample: ${error?.message || error}`);
      }
    });

    handle.on('exception', (error) => {
      this.log(`[simconnect] exception: ${JSON.stringify(error)}`);
    });
    handle.on('quit', () => {
      this.log('[simconnect] simulator quit');
      this.handle = null;
      this.setStatus({ state: 'disconnected', connected: false, message: '模拟飞行已退出，等待重新连接…' });
      this.connectLoop();
    });
    handle.on('close', () => {
      this.log('[simconnect] connection closed');
      this.handle = null;
      if (this.running) {
        this.setStatus({ state: 'disconnected', connected: false, message: '连接已断开，正在重连…' });
        this.connectLoop();
      }
    });
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try { this.handle?.close?.(); } catch { /* ignore */ }
    this.handle = null;
    this.setStatus({ state: 'stopped', connected: false, message: 'SimConnect 已停止' });
  }

  diagnostics() {
    return { ...this.status, running: this.running };
  }
}
