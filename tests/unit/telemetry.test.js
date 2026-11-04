import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFlightPhase,
  normalizeTelemetry,
} from '../../electron/telemetry.js';

test('normalizes a valid telemetry sample', () => {
  const sample = normalizeTelemetry({
    source: 'xplane',
    lat: 40.6413,
    lon: -73.7781,
    altitudeFt: 12000,
    speedKt: 245,
    headingDeg: 361,
    verticalSpeedFpm: 1200,
    onGround: false,
  });
  assert.equal(sample.lat, 40.6413);
  assert.equal(sample.headingDeg, 1);
  assert.equal(sample.speedKt, 245);
  assert.equal(sample.phase, 'climb');
});

test('rejects invalid coordinates', () => {
  assert.equal(normalizeTelemetry({ lat: 100, lon: 0 }), null);
  assert.equal(normalizeTelemetry({ lat: 0, lon: 200 }), null);
  assert.equal(normalizeTelemetry(null), null);
});

test('derives taxi, takeoff, cruise and landing states', () => {
  assert.equal(deriveFlightPhase({ onGround: true, speedKt: 10, altitudeFt: 0 }), 'taxi');
  assert.equal(deriveFlightPhase({ onGround: true, speedKt: 100, altitudeFt: 0 }), 'takeoff');
  assert.equal(deriveFlightPhase({ onGround: false, speedKt: 450, altitudeFt: 35000, verticalSpeedFpm: 0 }), 'cruise');
  assert.equal(deriveFlightPhase({ onGround: false, speedKt: 130, altitudeFt: 1200, verticalSpeedFpm: -700 }), 'landing');
});
