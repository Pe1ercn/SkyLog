import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineNm,
  greatCirclePoints,
  greatCircleMidpoint,
  routePolyline,
  splitAtDateline,
  fitView,
  localDateISO,
  localTimeHM,
} from '../../shared/geo.js';

const YUL = { lat: 45.470464, lon: -73.740933 };
const LAX = { lat: 33.942497, lon: -118.40805 };

test('haversine distance matches the SimBrief great-circle distance', () => {
  const distance = haversineNm(YUL, LAX);
  assert.ok(distance > 2130 && distance < 2165, `unexpected distance ${distance}`);
});

test('great-circle interpolation keeps the endpoints and a sane midpoint', () => {
  const points = greatCirclePoints(YUL, LAX, 50);
  assert.ok(points.length > 10);
  assert.ok(Math.abs(points[0].lat - YUL.lat) < 1e-9);
  assert.ok(Math.abs(points[0].lon - YUL.lon) < 1e-9);
  assert.ok(Math.abs(points.at(-1).lat - LAX.lat) < 1e-9);
  assert.ok(Math.abs(points.at(-1).lon - LAX.lon) < 1e-9);
  const midpoint = greatCircleMidpoint(YUL, LAX);
  assert.ok(midpoint.lat > 40 && midpoint.lat < 46);
  assert.ok(midpoint.lon < -90 && midpoint.lon > -110);
});

test('direct and waypoint route modes produce plausible polylines', () => {
  const waypoints = [
    [45.470464, -73.740933],
    [45.614444, -74.146667],
    [44.66792, -85.55001],
    [34.79318, -115.46067],
    [33.942497, -118.40805],
  ];
  const direct = routePolyline(waypoints, 'direct', 40);
  const viaWaypoints = routePolyline(waypoints, 'waypoints', 40);
  assert.ok(direct.length > 20);
  assert.ok(viaWaypoints.length > direct.length);
  assert.equal(direct[0][0], waypoints[0][0]);
  assert.equal(direct.at(-1)[0], waypoints.at(-1)[0]);
});

test('antimeridian split avoids a world-spanning line', () => {
  const parts = splitAtDateline([
    [0, 170],
    [5, 179],
    [6, -179],
    [10, -170],
  ]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].at(-1)[1], 180);
  assert.equal(parts[1][0][1], -180);
});

test('fitView returns a world-ish view for dateline-crossing routes', () => {
  const view = fitView([
    [35, 170],
    [35, -170],
    [40, 175],
  ]);
  assert.equal(view.zoom, 2);
  assert.equal(view.center.lon, 180);
});

test('local time helpers respect airport UTC offsets', () => {
  const timestamp = 1792878300000;
  assert.equal(localDateISO(timestamp, -4), '2026-10-24');
  assert.equal(localTimeHM(timestamp, -4), '17:45');
  assert.equal(localTimeHM(timestamp, -7), '14:45');
});
