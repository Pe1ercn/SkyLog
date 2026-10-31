import test from 'node:test';
import assert from 'node:assert/strict';
import world from '../../src/assets/world-countries-50m.json' with { type: 'json' };
import sea from '../../src/assets/south-china-sea.json' with { type: 'json' };

test('Taiwan, Hong Kong and Macao are represented inside China', () => {
  const codes = new Set(
    (world.features || []).map((feature) => String(feature.properties?.ISO_A3 || '').toUpperCase()),
  );
  assert.equal(codes.has('CHN'), true);
  assert.equal(codes.has('TWN'), false);
  assert.equal(codes.has('HKG'), false);
  assert.equal(codes.has('MAC'), false);
  const china = world.features.find((feature) => feature.properties?.ISO_A3 === 'CHN');
  assert.equal(china.geometry.type, 'MultiPolygon');
  assert.ok(china.geometry.coordinates.length >= 18);
});

test('South China Sea overlay has a valid ten-segment line and island labels', () => {
  assert.ok(Array.isArray(sea.nineDash));
  assert.ok(sea.nineDash.length >= 9);
  for (const segment of sea.nineDash) {
    assert.ok(Array.isArray(segment) && segment.length >= 2);
    for (const [lon, lat] of segment) {
      assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
      assert.ok(lon >= 100 && lon <= 130, `unexpected longitude ${lon}`);
      assert.ok(lat >= 0 && lat <= 30, `unexpected latitude ${lat}`);
    }
  }
  assert.ok(sea.islands.some((island) => island.id === 'paracel'));
  assert.ok(sea.islands.some((island) => island.id === 'spratly'));
});
