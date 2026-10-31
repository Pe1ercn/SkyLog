import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { normalizePlan, summarizePlan, PlanError } from '../shared/plan.js';
import { haversineNm, localDateISO } from '../shared/geo.js';

export const LIBRARY_VERSION = 3;
export const PALETTE = [
  '#2f6df6',
  '#0ea5a4',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#10b981',
  '#6366f1',
  '#f97316',
  '#06b6d4',
  '#a855f7',
];

const DEFAULT_SETTINGS = {
  pilotId: '',
  language: 'zh',
  weightUnit: 'kg',
  distanceUnit: 'nm',
  altitudeUnit: 'ft',
  timeMode: 'local',
  labelMode: 'both',
  routeMode: 'waypoints',
  showWaypoints: true,
  showAlternates: false,
  showAllFlights: false,
  animations: true,
  logSort: 'newest',
  game: null,
};

const SETTING_VALUES = {
  language: ['zh', 'en'],
  weightUnit: ['kg', 'lb'],
  distanceUnit: ['nm', 'km'],
  altitudeUnit: ['ft', 'm'],
  timeMode: ['local', 'utc'],
  labelMode: ['both', 'codes', 'name'],
  routeMode: ['waypoints', 'direct'],
  logSort: ['newest', 'oldest'],
};

const MAX_NOTES = 5000;

export class StoreError extends Error {
  constructor(message, code = 'store-error', details = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.details = details;
  }
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function isoNow() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cleanText(value, max = MAX_NOTES) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max);
}

function formatChineseDate(dateISO) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || ''));
  if (!match) return '未定日期';
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function sessionNameForPlan(plan) {
  const timestamp =
    plan?.times?.scheduledOut || plan?.times?.estimatedOut || plan?.generatedAt || Date.now();
  const offset = safeNumber(plan?.origin?.timezoneHours, 0);
  const date = localDateISO(timestamp, offset);
  const from = plan?.origin?.iata || plan?.origin?.icao || '----';
  const to = plan?.destination?.iata || plan?.destination?.icao || '----';
  return `${formatChineseDate(date)} · ${from} → ${to}`;
}

function sessionNameForFlight(flight) {
  const date = flight?.scheduledDate || '';
  const from = flight?.origin?.iata || flight?.origin?.icao || '----';
  const to = flight?.destination?.iata || flight?.destination?.icao || '----';
  return `${formatChineseDate(date)} · ${from} → ${to}`;
}

function sessionNameForFlights(flights) {
  if (!flights.length) return '新的游戏会话';
  const sorted = [...flights].sort(
    (a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0) || (a.createdAt || '').localeCompare(b.createdAt || ''),
  );
  if (sorted.length === 1) return sessionNameForFlight(sorted[0]);
  const dates = [...new Set(sorted.map((flight) => flight.scheduledDate).filter(Boolean))].sort();
  let dateLabel = '日期待定';
  if (dates.length === 1) {
    dateLabel = formatChineseDate(dates[0]);
  } else if (dates.length > 1) {
    const first = dates[0].split('-').map(Number);
    const last = dates.at(-1).split('-').map(Number);
    if (first[0] === last[0] && first[1] === last[1]) {
      dateLabel = `${first[0]}年${first[1]}月${first[2]}日 – ${last[2]}日`;
    } else if (first[0] === last[0]) {
      dateLabel = `${first[0]}年${first[1]}月${first[2]}日 – ${last[1]}月${last[2]}日`;
    } else {
      dateLabel = `${formatChineseDate(dates[0])} – ${formatChineseDate(dates.at(-1))}`;
    }
  }
  return dateLabel;
}

function planKey(plan) {
  if (plan.requestId) return `req:${plan.requestId}`;
  if (plan.staticId) return `static:${plan.staticId}`;
  return [
    'plan',
    plan.pilotId || '',
    plan.generatedAt || '',
    plan.callsign || '',
    plan.origin?.icao || '',
    plan.destination?.icao || '',
  ].join(':');
}

function summaryRecord(plan) {
  const base = summarizePlan(plan);
  const scheduledOut = base.scheduledOut;
  const originOffset = safeNumber(plan.origin?.timezoneHours, 0);
  const distance =
    base.distanceNm ??
    (plan.origin?.lat != null && plan.destination?.lat != null
      ? Math.round(haversineNm(plan.origin, plan.destination))
      : null);
  return {
    ...base,
    origin: {
      ...base.origin,
      timezoneHours: originOffset,
      runway: plan.origin?.runway || '',
      elevationFt: plan.origin?.elevationFt ?? null,
    },
    destination: {
      ...base.destination,
      timezoneHours: safeNumber(plan.destination?.timezoneHours, 0),
      runway: plan.destination?.runway || '',
      elevationFt: plan.destination?.elevationFt ?? null,
    },
    distanceNm: distance,
    scheduledDate: scheduledOut ? localDateISO(scheduledOut, originOffset) : '',
    sessionId: '',
    colorIndex: 0,
    status: 'planned',
    createdAt: isoNow(),
    updatedAt: isoNow(),
    source: {
      type: 'simbrief',
      pilotId: plan.pilotId || '',
      staticId: plan.staticId || '',
      requestId: plan.requestId || '',
      units: plan.units?.weight || 'kg',
    },
    actual: {
      date: null,
      blockMinutes: null,
      departureTime: null,
      arrivalTime: null,
      notes: '',
    },
  };
}

function sanitizeSummary(summary) {
  if (!summary || typeof summary !== 'object' || !summary.id) return null;
  const actual = summary.actual && typeof summary.actual === 'object' ? summary.actual : {};
  return {
    ...summary,
    status: summary.status === 'flown' ? 'flown' : 'planned',
    colorIndex: Number.isInteger(summary.colorIndex) ? summary.colorIndex : 0,
    routePoints: Array.isArray(summary.routePoints) ? summary.routePoints : [],
    waypoints: Array.isArray(summary.waypoints) ? summary.waypoints : [],
    actual: {
      date: typeof actual.date === 'string' ? actual.date : null,
      blockMinutes: Number.isFinite(Number(actual.blockMinutes))
        ? Number(actual.blockMinutes)
        : null,
      departureTime: typeof actual.departureTime === 'string' ? actual.departureTime : null,
      arrivalTime: typeof actual.arrivalTime === 'string' ? actual.arrivalTime : null,
      notes: cleanText(actual.notes || ''),
    },
    sessionId: typeof summary.sessionId === 'string' ? summary.sessionId : '',
  };
}

export class LibraryStore {
  constructor(userDataPath, options = {}) {
    this.userDataPath = userDataPath;
    this.plansDir = path.join(userDataPath, 'plans');
    this.backupsDir = path.join(userDataPath, 'backups');
    this.libraryPath = path.join(userDataPath, 'library.json');
    this.log = options.logger || (() => {});
    this.library = this.load();
  }

  ensureDirs() {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.mkdirSync(this.plansDir, { recursive: true });
    fs.mkdirSync(this.backupsDir, { recursive: true });
  }

  defaultLibrary() {
    const now = isoNow();
    return {
      version: LIBRARY_VERSION,
      settings: { ...DEFAULT_SETTINGS },
      sessions: [],
      flights: [],
      meta: {
        app: 'SkyLog',
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  load() {
    this.ensureDirs();
    if (!fs.existsSync(this.libraryPath)) {
      const library = this.defaultLibrary();
      this.writeLibraryFile(library);
      return library;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.libraryPath, 'utf8'));
      return this.migrate(parsed);
    } catch (error) {
      this.log(`[store] library load failed: ${error.message}`);
      const corruptPath = path.join(
        this.userDataPath,
        `library.corrupt-${Date.now()}.json`,
      );
      try {
        fs.copyFileSync(this.libraryPath, corruptPath);
      } catch {
        // ignore copy failures
      }
      const backup = this.latestBackup();
      if (backup) {
        try {
          const parsed = JSON.parse(fs.readFileSync(backup, 'utf8'));
          this.log(`[store] restored library from ${path.basename(backup)}`);
          return this.migrate(parsed);
        } catch (backupError) {
          this.log(`[store] backup restore failed: ${backupError.message}`);
        }
      }
      const library = this.defaultLibrary();
      this.writeLibraryFile(library);
      return library;
    }
  }

  latestBackup() {
    try {
      const files = fs
        .readdirSync(this.backupsDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const fullPath = path.join(this.backupsDir, name);
          return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      return files[0]?.fullPath || null;
    } catch {
      return null;
    }
  }

  migrate(input) {
    const library = {
      ...this.defaultLibrary(),
      ...(input && typeof input === 'object' ? input : {}),
    };
    library.version = LIBRARY_VERSION;
    library.settings = { ...DEFAULT_SETTINGS, ...(input?.settings || {}) };
    library.sessions = Array.isArray(input?.sessions)
      ? input.sessions
          .filter((session) => session && typeof session === 'object' && session.id)
          .map((session, index) => ({
            id: String(session.id),
            name: cleanText(session.name, 120) || `游戏会话 ${index + 1}`,
            autoName: session.autoName !== false,
            note: cleanText(session.note || '', 2000),
            colorIndex: Number.isInteger(session.colorIndex)
              ? session.colorIndex % PALETTE.length
              : index % PALETTE.length,
            createdAt: session.createdAt || isoNow(),
            updatedAt: session.updatedAt || session.createdAt || isoNow(),
          }))
      : [];
    const sessionIds = new Set(library.sessions.map((session) => session.id));
    library.flights = Array.isArray(input?.flights)
      ? input.flights.map(sanitizeSummary).filter(Boolean)
      : [];
    for (const flight of library.flights) {
      if (!sessionIds.has(flight.sessionId)) {
        const session = {
          id: randomId('ses'),
          name: sessionNameForFlight(flight),
          autoName: true,
          note: '',
          colorIndex: library.sessions.length % PALETTE.length,
          createdAt: flight.createdAt || isoNow(),
          updatedAt: isoNow(),
        };
        library.sessions.push(session);
        sessionIds.add(session.id);
        flight.sessionId = session.id;
        flight.colorIndex = session.colorIndex;
      }
      const session = library.sessions.find((item) => item.id === flight.sessionId);
      if (session) flight.colorIndex = session.colorIndex;
    }
    for (const session of library.sessions) {
      if (!session.autoName) continue;
      const flights = library.flights.filter((flight) => flight.sessionId === session.id);
      if (flights.length) {
        const nextName = sessionNameForFlights(flights);
        if (nextName) session.name = nextName;
      }
    }
    library.meta = {
      ...library.meta,
      app: 'SkyLog',
      createdAt: input?.meta?.createdAt || library.meta?.createdAt || isoNow(),
      updatedAt: isoNow(),
    };
    return library;
  }

  writeLibraryFile(library) {
    this.ensureDirs();
    const tmp = `${this.libraryPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(library, null, 2), 'utf8');
    try {
      fs.renameSync(tmp, this.libraryPath);
    } catch (error) {
      try {
        fs.unlinkSync(this.libraryPath);
      } catch {
        // ignore
      }
      fs.renameSync(tmp, this.libraryPath);
    }
  }

  save({ backup = false } = {}) {
    if (backup) this.backup();
    this.library.meta.updatedAt = isoNow();
    this.writeLibraryFile(this.library);
    return this.library;
  }

  backup() {
    try {
      this.ensureDirs();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(this.backupsDir, `library-${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(this.library, null, 2), 'utf8');
      const files = fs
        .readdirSync(this.backupsDir)
        .filter((name) => name.startsWith('library-') && name.endsWith('.json'))
        .map((name) => ({ name, mtime: fs.statSync(path.join(this.backupsDir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const stale of files.slice(20)) {
        try {
          fs.unlinkSync(path.join(this.backupsDir, stale.name));
        } catch {
          // ignore
        }
      }
    } catch (error) {
      this.log(`[store] backup failed: ${error.message}`);
    }
  }

  planFilePath(flightId) {
    this.assertId(flightId, 'flt');
    return path.join(this.plansDir, `${flightId}.plan.json`);
  }

  rawFilePath(flightId) {
    this.assertId(flightId, 'flt');
    return path.join(this.plansDir, `${flightId}.raw.json.gz`);
  }

  assertId(id, prefix) {
    if (typeof id !== 'string' || !new RegExp(`^${prefix}_[a-z0-9_]+$`).test(id)) {
      throw new StoreError('无效的记录编号', 'invalid-id');
    }
  }

  findFlight(id) {
    return this.library.flights.find((flight) => flight.id === id) || null;
  }

  requireFlight(id) {
    this.assertId(id, 'flt');
    const flight = this.findFlight(id);
    if (!flight) throw new StoreError('找不到这个航段', 'flight-not-found');
    return flight;
  }

  findSession(id) {
    return this.library.sessions.find((session) => session.id === id) || null;
  }

  requireSession(id) {
    this.assertId(id, 'ses');
    const session = this.findSession(id);
    if (!session) throw new StoreError('找不到这次游戏会话', 'session-not-found');
    return session;
  }

  createSessionRecord(name, colorIndex, autoName = !name) {
    const now = isoNow();
    return {
      id: randomId('ses'),
      name: cleanText(name, 120) || '新的游戏会话',
      autoName: Boolean(autoName),
      note: '',
      colorIndex:
        Number.isInteger(colorIndex) ? colorIndex % PALETTE.length : this.library.sessions.length % PALETTE.length,
      createdAt: now,
      updatedAt: now,
    };
  }

  importPlan(raw, options = {}) {
    let plan;
    try {
      plan = normalizePlan(raw);
    } catch (error) {
      if (error instanceof PlanError) {
        throw new StoreError(error.message, error.code);
      }
      throw error;
    }

    const key = planKey(plan);
    const duplicate = this.library.flights.find((flight) => {
      const source = flight.source || {};
      const candidate = source.requestId
        ? `req:${source.requestId}`
        : source.staticId
          ? `static:${source.staticId}`
          : [
              'plan',
              source.pilotId || '',
              flight.generatedAt || '',
              flight.callsign || '',
              flight.origin?.icao || '',
              flight.destination?.icao || '',
            ].join(':');
      return candidate === key;
    });
    if (duplicate && !options.allowDuplicate) {
      throw new StoreError('这份 SimBrief 计划已经导入过了', 'duplicate-plan', {
        existingFlightId: duplicate.id,
        existingSessionId: duplicate.sessionId,
      });
    }

    let session;
    let createdSession = false;
    if (options.sessionMode === 'existing') {
      session = this.requireSession(options.sessionId);
      if (session.autoName && this.library.flights.every((flight) => flight.sessionId !== session.id)) {
        session.name = sessionNameForPlan(plan);
        session.autoName = true;
        session.updatedAt = isoNow();
      }
    } else {
      session = this.createSessionRecord(sessionNameForPlan(plan), undefined, true);
      this.library.sessions.push(session);
      createdSession = true;
    }

    const flightId = randomId('flt');
    const summary = summaryRecord(plan);
    const now = isoNow();
    summary.id = flightId;
    summary.sessionId = session.id;
    summary.colorIndex = session.colorIndex;
    summary.createdAt = now;
    summary.updatedAt = now;

    this.ensureDirs();
    this.backup();
    const planPath = path.join(this.plansDir, `${flightId}.plan.json`);
    const rawPath = path.join(this.plansDir, `${flightId}.raw.json.gz`);
    try {
      fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');
      fs.writeFileSync(rawPath, zlib.gzipSync(Buffer.from(JSON.stringify(raw), 'utf8'), { level: 6 }));
      this.library.flights.push(summary);
      this.refreshSessionName(session.id);
      this.save();
    } catch (error) {
      this.library.flights = this.library.flights.filter((flight) => flight.id !== flightId);
      if (createdSession) {
        this.library.sessions = this.library.sessions.filter((item) => item.id !== session.id);
      }
      for (const file of [planPath, rawPath]) {
        try {
          fs.unlinkSync(file);
        } catch {
          // ignore
        }
      }
      this.log(`[store] import failed: ${error.message}`);
      throw new StoreError('写入飞行记录失败，请检查磁盘空间', 'write-failed');
    }

    return { flight: summary, session, library: this.library };
  }

  getLibrary() {
    return this.library;
  }

  getFlightPlan(id) {
    const summary = this.requireFlight(id);
    const planPath = this.planFilePath(id);
    if (fs.existsSync(planPath)) {
      try {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
        return { flight: summary, plan };
      } catch (error) {
        this.log(`[store] plan file parse failed ${id}: ${error.message}`);
      }
    }
    const raw = this.getRawPlan(id);
    if (raw) {
      const plan = normalizePlan(raw);
      fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');
      return { flight: summary, plan };
    }
    throw new StoreError('航段详情文件缺失', 'plan-missing');
  }

  getRawPlan(id) {
    this.requireFlight(id);
    const rawPath = this.rawFilePath(id);
    if (!fs.existsSync(rawPath)) return null;
    try {
      return JSON.parse(zlib.gunzipSync(fs.readFileSync(rawPath)).toString('utf8'));
    } catch (error) {
      this.log(`[store] raw plan parse failed ${id}: ${error.message}`);
      return null;
    }
  }

  updateFlight(id, patch = {}) {
    const flight = this.requireFlight(id);
    const now = isoNow();

    if (Object.prototype.hasOwnProperty.call(patch, 'sessionId')) {
      const target = this.requireSession(patch.sessionId);
      if (target.id !== flight.sessionId) {
        const oldSessionId = flight.sessionId;
        flight.sessionId = target.id;
        flight.colorIndex = target.colorIndex;
        target.updatedAt = now;
        this.refreshSessionName(target.id);
        this.refreshSessionName(oldSessionId);
        this.removeSessionIfEmpty(oldSessionId);
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      flight.status = patch.status === 'flown' ? 'flown' : 'planned';
      if (flight.status === 'flown') {
        if (!flight.actual.date) {
          flight.actual.date = flight.scheduledDate || localDateISO(flight.scheduledOut, flight.origin?.timezoneHours || 0) || '';
        }
        if (flight.actual.blockMinutes == null) {
          flight.actual.blockMinutes = flight.blockMinutes ?? null;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'actualDate')) {
      const value = String(patch.actualDate || '').trim();
      flight.actual.date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'actualBlockMinutes')) {
      const value = Number(patch.actualBlockMinutes);
      flight.actual.blockMinutes =
        Number.isFinite(value) && value >= 0 && value <= 60 * 24 * 7 ? Math.round(value) : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
      flight.actual.notes = cleanText(patch.notes);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'departureTime')) {
      flight.actual.departureTime = cleanText(patch.departureTime, 20) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'arrivalTime')) {
      flight.actual.arrivalTime = cleanText(patch.arrivalTime, 20) || null;
    }

    flight.updatedAt = now;
    this.save();
    return { flight, library: this.library };
  }

  deleteFlight(id) {
    const flight = this.requireFlight(id);
    this.backup();
    this.library.flights = this.library.flights.filter((item) => item.id !== id);
    this.refreshSessionName(flight.sessionId);
    this.removeSessionIfEmpty(flight.sessionId);
    for (const file of [this.planFilePath(id), this.rawFilePath(id)]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    this.save();
    return { library: this.library };
  }

  createSession(name) {
    const session = this.createSessionRecord(cleanText(name, 120));
    this.library.sessions.push(session);
    this.save();
    return { session, library: this.library };
  }

  updateSession(id, patch = {}) {
    const session = this.requireSession(id);
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = cleanText(patch.name, 120).trim();
      if (!name) throw new StoreError('会话名称不能为空', 'invalid-name');
      session.name = name;
      session.autoName = false;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
      session.note = cleanText(patch.note, 2000);
    }
    session.updatedAt = isoNow();
    this.save();
    return { session, library: this.library };
  }

  deleteSession(id, options = {}) {
    const session = this.requireSession(id);
    const flights = this.library.flights.filter((flight) => flight.sessionId === id);
    if (flights.length > 0 && !options.deleteFlights) {
      const target = this.createSessionRecord('未分组航段');
      this.library.sessions.push(target);
      for (const flight of flights) {
        flight.sessionId = target.id;
        flight.colorIndex = target.colorIndex;
        flight.updatedAt = isoNow();
      }
    }
    if (options.deleteFlights) {
      this.backup();
      for (const flight of flights) {
        for (const file of [this.planFilePath(flight.id), this.rawFilePath(flight.id)]) {
          try {
            fs.unlinkSync(file);
          } catch {
            // ignore
          }
        }
      }
      this.library.flights = this.library.flights.filter((flight) => flight.sessionId !== id);
    }
    this.library.sessions = this.library.sessions.filter((item) => item.id !== id);
    this.save();
    return { library: this.library };
  }

  moveFlights(ids, targetSessionId) {
    const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
    if (!uniqueIds.length) throw new StoreError('没有选择航段', 'no-flights');
    const flights = uniqueIds.map((id) => this.requireFlight(id));
    let target;
    if (targetSessionId === 'new' || !targetSessionId) {
      target = this.createSessionRecord(sessionNameForFlight(flights[0]), undefined, true);
      this.library.sessions.push(target);
    } else {
      target = this.requireSession(targetSessionId);
    }
    const previousSessions = new Set(flights.map((flight) => flight.sessionId));
    for (const flight of flights) {
      flight.sessionId = target.id;
      flight.colorIndex = target.colorIndex;
      flight.updatedAt = isoNow();
    }
    for (const sessionId of previousSessions) this.removeSessionIfEmpty(sessionId);
    this.refreshSessionName(target.id);
    target.updatedAt = isoNow();
    this.save();
    return { targetSessionId: target.id, library: this.library };
  }

  mergeSessions(sessionIds, targetSessionId) {
    const sources = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean))];
    if (sources.length < 2 && targetSessionId !== 'new') {
      throw new StoreError('至少需要选择两次游戏会话', 'not-enough-sessions');
    }
    for (const id of sources) this.requireSession(id);
    let target;
    if (targetSessionId === 'new' || !targetSessionId) {
      const allFlights = this.library.flights
        .filter((flight) => sources.includes(flight.sessionId))
        .sort((a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0));
      target = this.createSessionRecord(allFlights[0] ? sessionNameForFlight(allFlights[0]) : '合并的游戏会话', undefined, true);
      this.library.sessions.push(target);
    } else {
      target = this.requireSession(targetSessionId);
      if (!sources.includes(target.id)) sources.push(target.id);
    }
    for (const flight of this.library.flights) {
      if (sources.includes(flight.sessionId) && flight.sessionId !== target.id) {
        flight.sessionId = target.id;
        flight.colorIndex = target.colorIndex;
        flight.updatedAt = isoNow();
      }
    }
    for (const id of sources) {
      if (id !== target.id) this.library.sessions = this.library.sessions.filter((item) => item.id !== id);
    }
    this.refreshSessionName(target.id);
    target.updatedAt = isoNow();
    this.save({ backup: true });
    return { targetSessionId: target.id, library: this.library };
  }

  removeSessionIfEmpty(sessionId) {
    if (!sessionId) return;
    const hasFlights = this.library.flights.some((flight) => flight.sessionId === sessionId);
    if (!hasFlights) {
      this.library.sessions = this.library.sessions.filter((session) => session.id !== sessionId);
    } else {
      this.refreshSessionName(sessionId);
    }
  }

  refreshSessionName(sessionId) {
    if (!sessionId) return;
    const session = this.findSession(sessionId);
    if (!session || !session.autoName) return;
    const flights = this.library.flights.filter((flight) => flight.sessionId === sessionId);
    if (!flights.length) return;
    const nextName = sessionNameForFlights(flights);
    if (nextName && nextName !== session.name) {
      session.name = nextName;
      session.updatedAt = isoNow();
    }
  }

  updateSettings(patch = {}) {
    const next = { ...this.library.settings };
    if (Object.prototype.hasOwnProperty.call(patch, 'pilotId')) {
      const value = String(patch.pilotId || '').replace(/\s+/g, '').slice(0, 64);
      if (value && !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new StoreError('Pilot ID 格式不正确', 'invalid-pilot-id');
      }
      next.pilotId = value;
    }
    for (const [key, allowed] of Object.entries(SETTING_VALUES)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        if (!allowed.includes(patch[key])) throw new StoreError(`设置值无效：${key}`, 'invalid-setting');
        next[key] = patch[key];
      }
    }
    for (const key of ['showWaypoints', 'showAlternates', 'showAllFlights', 'animations']) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        next[key] = Boolean(patch[key]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'game')) {
      if (patch.game === null) {
        next.game = null;
      } else if (patch.game && typeof patch.game === 'object') {
        const title = String(patch.game.title || '').trim().slice(0, 120);
        const kind = String(patch.game.kind || '');
        const target = String(patch.game.target || patch.game.path || '').trim().slice(0, 1024);
        if (!title || !target || !['exe', 'appx', 'mac-app'].includes(kind)) {
          throw new StoreError('游戏配置无效', 'invalid-game');
        }
        next.game = {
          id: String(patch.game.id || 'custom').trim().slice(0, 60) || 'custom',
          title,
          family: String(patch.game.family || '').trim().slice(0, 40),
          kind,
          target,
          path: String(patch.game.path || target).trim().slice(0, 1024),
          source: String(patch.game.source || 'manual').trim().slice(0, 40),
          version: String(patch.game.version || '').trim().slice(0, 40),
        };
      } else {
        throw new StoreError('游戏配置无效', 'invalid-game');
      }
    }
    this.library.settings = next;
    this.save();
    return { settings: next, library: this.library };
  }

  exportBackupData(appVersion = '') {
    const flights = [];
    for (const summary of this.library.flights) {
      let plan = null;
      try {
        plan = this.getFlightPlan(summary.id).plan;
      } catch {
        // Keep the log entry even if its detail file is gone.
      }
      flights.push({
        id: summary.id,
        sessionId: summary.sessionId,
        status: summary.status,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        actual: summary.actual,
        source: summary.source,
        plan,
      });
    }
    return {
      format: 'skylog-backup',
      version: 1,
      app: 'SkyLog',
      appVersion,
      exportedAt: isoNow(),
      settings: this.library.settings,
      sessions: this.library.sessions,
      flights,
    };
  }

  importBackupData(data) {
    if (!data || data.format !== 'skylog-backup') {
      throw new StoreError('这不是 SkyLog 的备份文件', 'invalid-backup');
    }
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const incomingFlights = Array.isArray(data.flights) ? data.flights : [];
    if (!incomingFlights.length) throw new StoreError('备份中没有航段', 'empty-backup');
    this.backup();
    const sessionMap = new Map();
    for (const session of sessions) {
      if (!session || typeof session !== 'object' || !session.id) continue;
      const created = this.createSessionRecord(
        cleanText(session.name, 120) || '导入的游戏会话',
        Number.isInteger(session.colorIndex) ? session.colorIndex : undefined,
      );
      created.autoName = session.autoName !== false;
      created.note = cleanText(session.note || '', 2000);
      created.createdAt = session.createdAt || created.createdAt;
      sessionMap.set(session.id, created);
      this.library.sessions.push(created);
    }
    let imported = 0;
    for (const item of incomingFlights) {
      if (!item || !item.plan) continue;
      let plan;
      try {
        plan = item.plan.schemaVersion ? item.plan : normalizePlan(item.plan);
      } catch {
        continue;
      }
      let session = sessionMap.get(item.sessionId);
      if (!session) {
        session = this.createSessionRecord(sessionNameForPlan(plan), undefined, true);
        this.library.sessions.push(session);
        sessionMap.set(item.sessionId || randomId('ses'), session);
      }
      const summary = summaryRecord(plan);
      summary.id = randomId('flt');
      summary.sessionId = session.id;
      summary.colorIndex = session.colorIndex;
      summary.status = item.status === 'flown' ? 'flown' : 'planned';
      summary.createdAt = item.createdAt || isoNow();
      summary.updatedAt = isoNow();
      summary.actual = {
        ...summary.actual,
        ...(item.actual || {}),
        notes: cleanText(item.actual?.notes || ''),
      };
      summary.source = { ...summary.source, ...(item.source || {}) };
      const planPath = path.join(this.plansDir, `${summary.id}.plan.json`);
      fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');
      this.library.flights.push(summary);
      imported += 1;
    }
    this.save({ backup: true });
    return { imported, library: this.library };
  }

  clearFlights() {
    this.backup();
    for (const flight of this.library.flights) {
      for (const file of [this.planFilePath(flight.id), this.rawFilePath(flight.id)]) {
        try {
          fs.unlinkSync(file);
        } catch {
          // ignore
        }
      }
    }
    this.library.flights = [];
    this.library.sessions = [];
    this.save();
    return { library: this.library };
  }

  stats() {
    const flights = this.library.flights;
    const flown = flights.filter((flight) => flight.status === 'flown');
    const totalDistance = flights.reduce((sum, flight) => sum + (flight.distanceNm || 0), 0);
    const totalMinutes = flights.reduce((sum, flight) => sum + (flight.blockMinutes || 0), 0);
    const flownMinutes = flown.reduce(
      (sum, flight) => sum + (flight.actual?.blockMinutes ?? flight.blockMinutes ?? 0),
      0,
    );
    return {
      flights: flights.length,
      sessions: this.library.sessions.length,
      flown: flown.length,
      planned: flights.length - flown.length,
      totalDistanceNm: totalDistance,
      totalMinutes,
      flownMinutes,
    };
  }
}

/** Build the export payload consumed by the Settings page CSV button. */
export function libraryToCsv(library) {
  const sessions = new Map(library.sessions.map((session) => [session.id, session]));
  const header = [
    '游戏会话',
    '状态',
    '航班号',
    '呼号',
    '机型',
    '注册号',
    '起飞 ICAO',
    '起飞 IATA',
    '起飞机场',
    '到达 ICAO',
    '到达 IATA',
    '到达机场',
    '计划起飞 UTC',
    '计划到达 UTC',
    '计划起飞 当地',
    '计划到达 当地',
    '巡航高度 ft',
    '航路距离 nm',
    '计划轮挡 分钟',
    '实际日期',
    '实际轮挡 分钟',
    '备注',
  ];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [...library.flights]
    .sort((a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0))
    .map((flight) => {
      const session = sessions.get(flight.sessionId);
      const utc = (timestamp) =>
        timestamp ? new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '';
      const local = (timestamp, offset) => {
        if (!timestamp) return '';
        return (
          new Date(timestamp + (Number(offset) || 0) * 3600000)
            .toISOString()
            .slice(0, 16)
            .replace('T', ' ') || ''
        );
      };
      return [
        session?.name || '',
        flight.status === 'flown' ? '已飞' : '计划',
        flight.flightNumber || '',
        flight.callsign || '',
        flight.aircraft?.name || flight.aircraft?.icao || '',
        flight.registration || '',
        flight.origin?.icao || '',
        flight.origin?.iata || '',
        flight.origin?.name || '',
        flight.destination?.icao || '',
        flight.destination?.iata || '',
        flight.destination?.name || '',
        utc(flight.scheduledOut),
        utc(flight.scheduledIn),
        local(flight.scheduledOut, flight.origin?.timezoneHours),
        local(flight.scheduledIn, flight.destination?.timezoneHours),
        flight.cruiseAltitudeFt ?? '',
        flight.distanceNm ?? '',
        flight.blockMinutes ?? '',
        flight.actual?.date || '',
        flight.actual?.blockMinutes ?? '',
        flight.actual?.notes || '',
      ]
        .map(escape)
        .join(',');
    });
  return `\ufeff${header.map(escape).join(',')}\r\n${rows.join('\r\n')}\r\n`;
}
