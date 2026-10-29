import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, summarizePlan, PlanError } from '../../shared/plan.js';
import { makeRawPlan, makePrivatePlan } from '../fixtures/simbrief-fixture.js';

test('normalizes an airline SimBrief OFP into the stable plan shape', () => {
  const plan = normalizePlan(makeRawPlan());

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.airlineIcao, 'ACA');
  assert.equal(plan.flightNumber, 'ACA123');
  assert.equal(plan.callsign, 'ACA123');
  assert.equal(plan.registration, 'C-GXLR');
  assert.equal(plan.origin.icao, 'CYUL');
  assert.equal(plan.origin.iata, 'YUL');
  assert.equal(plan.origin.name, 'PIERRE ELLIOTT TRUDEAU INTL');
  assert.equal(plan.destination.icao, 'KLAX');
  assert.equal(plan.destination.runway, '24R');
  assert.equal(plan.aircraft.icao, 'A21N');
  assert.equal(plan.aircraft.name, 'A321-271NY');
  assert.equal(plan.cruise.initialAltitudeFt, 36000);
  assert.deepEqual(plan.cruise.stepClimbs, [
    { fix: 'CYUL', fl: 360, altitudeFt: 36000 },
    { fix: 'SAVEX', fl: 370, altitudeFt: 37000 },
  ]);
  assert.equal(plan.times.blockSec, 22500);
  assert.equal(plan.times.scheduledOut, 1792878300000);
  assert.equal(plan.units.weight, 'kg');
  assert.equal(plan.route.distanceNm, 2168);
  assert.equal(plan.navlog.count, 5);
  assert.equal(plan.routePoints.length, 6);
  assert.deepEqual(plan.routePoints[0], [45.47046, -73.74093]);
  assert.deepEqual(plan.routePoints.at(-1), [33.9425, -118.40805]);
  assert.equal(plan.waypoints[0].ident, 'CYUL');
  assert.equal(plan.waypoints.at(-1).ident, 'KLAX');
  assert.equal(plan.alternates.length, 1);
  assert.equal(plan.alternates[0].icao, 'KONT');
  assert.equal(plan.tlr.takeoff.row.v1, 150);
  assert.equal(plan.tlr.landing.distanceDry.actualFt, 3144);
  assert.equal(plan.impacts.length, 2);
  assert.equal(plan.notamCount, 1);
  assert.match(plan.links.ofpPdf, /CYULKLAX_PDF_1792876669\.pdf$/);
  assert.match(plan.links.msfsPln, /_MFS_1792876669\.pln$/);
  assert.match(plan.atc.flightplanText, /FPL-ACA123/);
  assert.deepEqual(plan.warnings, []);
  assert.ok(plan.links.skyvector.startsWith('http://skyvector.com'));
});

test('keeps registration as flight number for private/GA plans', () => {
  const plan = normalizePlan(makePrivatePlan());
  assert.equal(plan.airlineIcao, '');
  assert.equal(plan.flightNumber, 'C-GXLR');
  assert.equal(plan.callsign, 'CGXLR');
  assert.equal(plan.routePoints.length, 3);
  assert.equal(plan.navlog.count, 2);
});

test('honours pounds as the source weight unit', () => {
  const raw = makeRawPlan({ params: { units: 'lbs' } });
  const plan = normalizePlan(raw);
  assert.equal(plan.units.weight, 'lb');
  assert.equal(plan.units.raw, 'lbs');
  assert.equal(plan.fuel.planRamp, 14451);
});

test('adds a warning when the plan has no navlog', () => {
  const raw = makeRawPlan({ navlog: { fix: [] } });
  const plan = normalizePlan(raw);
  assert.equal(plan.navlog.count, 0);
  assert.equal(plan.routePoints.length, 2);
  assert.ok(plan.warnings.some((warning) => warning.includes('航路点')));
});

test('throws a useful error when airports are missing', () => {
  const raw = makeRawPlan({ destination: null });
  assert.throws(
    () => normalizePlan(raw),
    (error) => error instanceof PlanError && error.code === 'missing-airports',
  );
});

test('throws when SimBrief itself reports an error status', () => {
  const raw = makeRawPlan({
    fetch: { userid: '1', status: 'Error: No flight plan on file for the specified user' },
  });
  assert.throws(
    () => normalizePlan(raw),
    (error) => error instanceof PlanError && /No flight plan/.test(error.message),
  );
});

test('summary is compact and contains what the map and log need', () => {
  const plan = normalizePlan(makeRawPlan());
  const summary = summarizePlan(plan);
  assert.equal(summary.flightNumber, 'ACA123');
  assert.equal(summary.origin.icao, 'CYUL');
  assert.equal(summary.destination.icao, 'KLAX');
  assert.equal(summary.blockMinutes, 375);
  assert.equal(summary.cruiseAltitudeFt, 36000);
  assert.equal(summary.distanceNm, 2168);
  assert.equal(summary.routePoints.length, 6);
  assert.equal(summary.waypoints.length, 6);
  assert.ok(summary.routePoints.every((point) => point.length === 2));
});
