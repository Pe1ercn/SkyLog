import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibraryStore, StoreError, libraryToCsv } from '../../electron/store.js';
import { makeRawPlan } from '../fixtures/simbrief-fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = path.resolve(here, '..', '.tmp');
let counter = 0;

function freshStore() {
  counter += 1;
  const dir = path.join(tmpRoot, `store-${process.pid}-${Date.now()}-${counter}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const store = new LibraryStore(dir);
  return { store, dir };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('imports a plan into a new auto-named game session', () => {
  const { store, dir } = freshStore();
  try {
    const result = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    assert.equal(result.library.flights.length, 1);
    assert.equal(result.library.sessions.length, 1);
    assert.equal(result.session.name, '2026年10月24日 · YUL → LAX');
    assert.equal(result.flight.callsign, 'ACA123');
    assert.equal(result.flight.origin.icao, 'CYUL');
    assert.equal(result.flight.sessionId, result.session.id);
    assert.equal(result.flight.status, 'planned');
    assert.equal(result.flight.blockMinutes, 375);
    assert.equal(result.flight.distanceNm, 2168);
    assert.ok(fs.existsSync(store.planFilePath(result.flight.id)));
    assert.ok(fs.existsSync(store.rawFilePath(result.flight.id)));

    const detail = store.getFlightPlan(result.flight.id);
    assert.equal(detail.plan.navlog.fixes.length, 5);
    assert.equal(detail.plan.atc.callsign, 'ACA123');
    assert.equal(store.getRawPlan(result.flight.id).general.flight_number, '123');
  } finally {
    cleanup(dir);
  }
});

test('detects duplicate SimBrief plans and can import one twice on request', () => {
  const { store, dir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    let duplicate;
    try {
      store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    } catch (error) {
      duplicate = error;
    }
    assert.ok(duplicate instanceof StoreError);
    assert.equal(duplicate.code, 'duplicate-plan');
    assert.equal(duplicate.details.existingFlightId, first.flight.id);

    store.importPlan(makeRawPlan(), {
      sessionMode: 'existing',
      sessionId: first.session.id,
      allowDuplicate: true,
    });
    assert.equal(store.getLibrary().flights.length, 2);
    assert.equal(
      store.getLibrary().flights.filter((flight) => flight.sessionId === first.session.id).length,
      2,
    );
  } finally {
    cleanup(dir);
  }
});

test('adds a second leg to the same game session and marks it flown', () => {
  const { store, dir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    const secondRaw = makeRawPlan({
      params: { request_id: 'req-second-leg', time_generated: '1792880000' },
    });
    const second = store.importPlan(secondRaw, {
      sessionMode: 'existing',
      sessionId: first.session.id,
    });
    assert.equal(store.getLibrary().sessions.length, 1);
    assert.equal(store.getLibrary().flights.length, 2);
    assert.equal(second.flight.sessionId, first.session.id);
    assert.equal(store.getLibrary().sessions[0].name, '2026年10月24日');

    store.updateFlight(second.flight.id, {
      status: 'flown',
      actualDate: '2026-10-25',
      actualBlockMinutes: 382,
      notes: 'A nice sunset approach.',
    });
    const flown = store.findFlight(second.flight.id);
    assert.equal(flown.status, 'flown');
    assert.equal(flown.actual.date, '2026-10-25');
    assert.equal(flown.actual.blockMinutes, 382);
    assert.equal(flown.actual.notes, 'A nice sunset approach.');

    const stats = store.stats();
    assert.equal(stats.flights, 2);
    assert.equal(stats.sessions, 1);
    assert.equal(stats.flown, 1);
    assert.equal(stats.planned, 1);
    assert.equal(stats.totalDistanceNm, 4336);
  } finally {
    cleanup(dir);
  }
});

test('moves a leg into its own session and merges sessions back together', () => {
  const { store, dir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    const second = store.importPlan(
      makeRawPlan({ params: { request_id: 'req-leg-2' } }),
      { sessionMode: 'existing', sessionId: first.session.id },
    );
    const moved = store.moveFlights([second.flight.id], 'new');
    assert.equal(store.getLibrary().sessions.length, 2);
    assert.notEqual(moved.targetSessionId, first.session.id);
    assert.equal(store.findFlight(second.flight.id).sessionId, moved.targetSessionId);

    const merged = store.mergeSessions(
      [first.session.id, moved.targetSessionId],
      first.session.id,
    );
    assert.equal(merged.targetSessionId, first.session.id);
    assert.equal(store.getLibrary().sessions.length, 1);
    assert.ok(
      store.getLibrary().flights.every((flight) => flight.sessionId === first.session.id),
    );
  } finally {
    cleanup(dir);
  }
});

test('deleting a session can keep its flights in an ungrouped session', () => {
  const { store, dir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    store.deleteSession(first.session.id, { deleteFlights: false });
    assert.equal(store.getLibrary().flights.length, 1);
    assert.equal(store.getLibrary().sessions.length, 1);
    assert.equal(store.getLibrary().sessions[0].name, '未分组航段');
    assert.equal(store.getLibrary().flights[0].sessionId, store.getLibrary().sessions[0].id);
  } finally {
    cleanup(dir);
  }
});

test('deleting a flight removes its files and stats update', () => {
  const { store, dir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    const planPath = store.planFilePath(first.flight.id);
    const rawPath = store.rawFilePath(first.flight.id);
    store.deleteFlight(first.flight.id);
    assert.equal(store.getLibrary().flights.length, 0);
    assert.equal(store.getLibrary().sessions.length, 0);
    assert.equal(fs.existsSync(planPath), false);
    assert.equal(fs.existsSync(rawPath), false);
    assert.equal(store.stats().flights, 0);
  } finally {
    cleanup(dir);
  }
});

test('exports and imports a JSON backup with grouping and actual log data', () => {
  const { store, dir } = freshStore();
  const { store: target, dir: targetDir } = freshStore();
  try {
    const first = store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    store.updateFlight(first.flight.id, {
      status: 'flown',
      actualDate: '2026-10-24',
      actualBlockMinutes: 390,
      notes: 'Backup note',
    });
    const backup = store.exportBackupData('1.0.0');
    assert.equal(backup.format, 'skylog-backup');
    assert.equal(backup.flights.length, 1);
    assert.ok(backup.flights[0].plan);

    const result = target.importBackupData(backup);
    assert.equal(result.imported, 1);
    assert.equal(target.getLibrary().flights.length, 1);
    assert.equal(target.getLibrary().sessions.length, 1);
    const imported = target.getLibrary().flights[0];
    assert.equal(imported.status, 'flown');
    assert.equal(imported.actual.blockMinutes, 390);
    assert.equal(imported.actual.notes, 'Backup note');
    assert.equal(imported.origin.icao, 'CYUL');
  } finally {
    cleanup(dir);
    cleanup(targetDir);
  }
});

test('exports a CSV with a BOM and Chinese headers', () => {
  const { store, dir } = freshStore();
  try {
    store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    const csv = libraryToCsv(store.getLibrary());
    assert.ok(csv.startsWith('\ufeff'));
    assert.match(csv, /游戏会话/);
    assert.match(csv, /ACA123/);
    assert.match(csv, /CYUL/);
    assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
  } finally {
    cleanup(dir);
  }
});

test('validates settings and persists them', () => {
  const { store, dir } = freshStore();
  try {
    const updated = store.updateSettings({ weightUnit: 'lb', labelMode: 'codes', animations: false });
    assert.equal(updated.settings.weightUnit, 'lb');
    assert.equal(updated.settings.labelMode, 'codes');
    assert.equal(updated.settings.animations, false);
    assert.throws(
      () => store.updateSettings({ weightUnit: 'stone' }),
      (error) => error instanceof StoreError && error.code === 'invalid-setting',
    );
    assert.throws(
      () => store.updateSettings({ pilotId: 'bad id!' }),
      (error) => error instanceof StoreError && error.code === 'invalid-pilot-id',
    );
  } finally {
    cleanup(dir);
  }
});

test('recovers from a corrupt library file', () => {
  const { store, dir } = freshStore();
  try {
    store.importPlan(makeRawPlan(), { sessionMode: 'new' });
    fs.writeFileSync(store.libraryPath, '{not valid json', 'utf8');
    const recovered = new LibraryStore(dir);
    assert.equal(recovered.getLibrary().version, 3);
    assert.ok(Array.isArray(recovered.getLibrary().flights));
    const corruptFiles = fs.readdirSync(dir).filter((name) => name.startsWith('library.corrupt-'));
    assert.equal(corruptFiles.length, 1);
  } finally {
    cleanup(dir);
  }
});
