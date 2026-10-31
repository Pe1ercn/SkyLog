import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimBriefPrefillUrl,
  composeSummary,
  simbriefDate,
  validateCreateFields,
} from '../../src/lib/simbrief-create.js';

const base = {
  origin: 'cyul',
  destination: 'klax',
  aircraft: 'b738',
  airline: 'aca',
  flightNumber: '123',
  date: '2026-10-31',
  time: '16:30',
  route: 'DCT KESKA',
  alternate: 'kla',
  callsign: 'aca123',
};

test('normalizes and validates a SimBrief draft', () => {
  const result = validateCreateFields(base);
  assert.equal(result.valid, true);
  assert.equal(result.fields.origin, 'CYUL');
  assert.equal(result.fields.destination, 'KLAX');
  assert.equal(result.fields.aircraft, 'B738');
  assert.equal(result.fields.airline, 'ACA');
});

test('rejects missing or equal airports', () => {
  assert.equal(validateCreateFields({ ...base, origin: '' }).valid, false);
  assert.equal(
    validateCreateFields({ ...base, destination: 'CYUL' }).errors.destination,
    'Origin and destination must be different.',
  );
});

test('builds the official dispatch prefill URL names', () => {
  const url = buildSimBriefPrefillUrl(base);
  const params = new URL(url).searchParams;
  assert.equal(params.get('orig'), 'CYUL');
  assert.equal(params.get('dest'), 'KLAX');
  assert.equal(params.get('type'), 'B738');
  assert.equal(params.get('airline'), 'ACA');
  assert.equal(params.get('fltnum'), '123');
  assert.equal(params.get('date'), '31OCT26');
  assert.equal(params.get('deph'), '16');
  assert.equal(params.get('depm'), '30');
});

test('formats the SimBrief date and summary', () => {
  assert.equal(simbriefDate('2026-10-31'), '31OCT26');
  assert.match(composeSummary(base), /CYUL → KLAX/);
  assert.match(composeSummary(base), /B738/);
});
