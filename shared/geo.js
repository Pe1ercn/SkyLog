/** Geodesic helpers shared by the map, the store and unit tests. */

export const EARTH_RADIUS_NM = 3440.065;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const toRad = (deg) => deg * DEG;
export const toDeg = (rad) => rad * RAD;

export function normalizeLon(lon) {
  let value = ((lon + 180) % 360 + 360) % 360 - 180;
  if (value === -180) value = 180;
  return value;
}

export function asPoint(point) {
  if (!point) return null;
  if (Array.isArray(point)) {
    const [lat, lon] = point;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }
  if (typeof point === 'object') {
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }
  return null;
}

export function haversineNm(a, b) {
  const p1 = asPoint(a);
  const p2 = asPoint(b);
  if (!p1 || !p2) return 0;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function initialBearing(a, b) {
  const p1 = asPoint(a);
  const p2 = asPoint(b);
  if (!p1 || !p2) return 0;
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Interpolate along the great circle between two points.
 * Returns points including both ends, with longitudes normalized to [-180, 180].
 */
export function greatCirclePoints(a, b, stepNm = 40) {
  const p1 = asPoint(a);
  const p2 = asPoint(b);
  if (!p1 || !p2) return [];
  const distance = haversineNm(p1, p2);
  if (distance < 0.5) return [{ ...p1 }, { ...p2 }];
  const segments = Math.max(2, Math.min(720, Math.ceil(distance / Math.max(10, stepNm))));
  const lat1 = toRad(p1.lat);
  const lon1 = toRad(p1.lon);
  const lat2 = toRad(p2.lat);
  const lon2 = toRad(p2.lon);
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );
  if (d < 1e-9) return [{ ...p1 }, { ...p2 }];
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD;
    const lon = Math.atan2(y, x) * RAD;
    points.push({ lat, lon });
  }
  return points;
}

/** Midpoint of the shortest great-circle path. */
export function greatCircleMidpoint(a, b) {
  const points = greatCirclePoints(a, b, 25);
  return points.length ? points[Math.floor(points.length / 2)] : asPoint(a);
}

/**
 * Build the map polyline. mode = "waypoints" connects every planned fix,
 * mode = "direct" draws one great-circle arc between the airports.
 */
export function routePolyline(waypoints, mode = 'waypoints', stepNm = 35) {
  const points = (Array.isArray(waypoints) ? waypoints : []).map(asPoint).filter(Boolean);
  if (points.length < 2) return [];
  if (mode === 'direct') {
    return greatCirclePoints(points[0], points[points.length - 1], stepNm).map((p) => [
      p.lat,
      p.lon,
    ]);
  }
  const output = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const leg = greatCirclePoints(points[i], points[i + 1], stepNm);
    for (const point of leg) {
      const previous = output[output.length - 1];
      if (previous && Math.abs(previous[0] - point.lat) < 1e-7 && Math.abs(previous[1] - point.lon) < 1e-7) {
        continue;
      }
      output.push([point.lat, point.lon]);
    }
  }
  return output;
}

/**
 * Split a polyline at the antimeridian so Leaflet never draws a line across
 * the whole world. Each returned part is a contiguous [lat, lon] array.
 */
export function splitAtDateline(points) {
  const input = (Array.isArray(points) ? points : [])
    .map(asPoint)
    .filter(Boolean)
    .map((point) => [point.lat, point.lon]);
  if (input.length < 2) return input.length ? [input] : [];
  const parts = [];
  let current = [input[0]];
  for (let i = 1; i < input.length; i += 1) {
    const previous = input[i - 1];
    const next = input[i];
    const delta = next[1] - previous[1];
    if (Math.abs(delta) <= 180) {
      current.push(next);
      continue;
    }
    const adjustedNext = delta < 0 ? next[1] + 360 : next[1] - 360;
    const boundary = delta < 0 ? 180 : -180;
    const denominator = adjustedNext - previous[1];
    const t = denominator === 0 ? 0.5 : (boundary - previous[1]) / denominator;
    const crossLat = previous[0] + (next[0] - previous[0]) * Math.max(0, Math.min(1, t));
    current.push([crossLat, boundary]);
    parts.push(current);
    current = [[crossLat, -boundary], next];
  }
  parts.push(current);
  return parts.filter((part) => part.length > 1);
}

/** Compute the map center and zoom for a set of points. */
export function fitView(points, paddingFactor = 0.2) {
  const valid = (Array.isArray(points) ? points : []).map(asPoint).filter(Boolean);
  if (!valid.length) return { center: { lat: 25, lon: 5 }, zoom: 2 };
  if (valid.length === 1) return { center: valid[0], zoom: 8 };
  const lats = valid.map((p) => p.lat);
  const lons = valid.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const lonSpan = maxLon - minLon;
  if (lonSpan > 180) {
    return { center: { lat: (minLat + maxLat) / 2, lon: 180 }, zoom: 2 };
  }
  const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  const span = Math.max((maxLat - minLat) * 1.15, lonSpan * 1.15, 0.6);
  const zoom = Math.max(2, Math.min(9, Math.log2(360 / span) - 0.8));
  return { center, zoom: Math.round(zoom * 10) / 10 };
}

/** Local wall-clock date (YYYY-MM-DD) for a UTC timestamp at a UTC offset. */
export function localDateISO(timestamp, offsetHours = 0) {
  if (!timestamp) return '';
  const shifted = new Date(timestamp + (Number(offsetHours) || 0) * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Local wall-clock time (HH:mm) for a UTC timestamp at a UTC offset. */
export function localTimeHM(timestamp, offsetHours = 0) {
  if (!timestamp) return '';
  const shifted = new Date(timestamp + (Number(offsetHours) || 0) * 3600 * 1000);
  return shifted.toISOString().slice(11, 16);
}

export function localDateTimeParts(timestamp, offsetHours = 0) {
  if (!timestamp) return null;
  const shifted = new Date(timestamp + (Number(offsetHours) || 0) * 3600 * 1000);
  return {
    iso: shifted.toISOString(),
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}
