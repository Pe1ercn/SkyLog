const WEIGHT_FACTOR = 2.2046226218487757;
const KM_PER_NM = 1.852;
const METERS_PER_FOOT = 0.3048;
const numberFormat = new Intl.NumberFormat('zh-CN');

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatNumber(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(parsed);
}

const SMALL_WORDS = new Set([
  'de',
  'del',
  'la',
  'le',
  'du',
  'des',
  'of',
  'and',
  'the',
  'van',
  'von',
  'da',
  'di',
  'el',
  'al',
  'upon',
]);

const EXPANDED_WORDS = {
  INTL: 'International',
  RGNL: 'Regional',
  MUNI: 'Municipal',
  AFB: 'Air Force Base',
  NAS: 'Naval Air Station',
  ARPT: 'Airport',
  FLD: 'Field',
  AB: 'Air Base',
  RAF: 'RAF',
  JFK: 'JFK',
  LAX: 'LAX',
  USAF: 'USAF',
};

/** Turn SimBrief's ALL-CAPS airport names into readable title case. */
export function airportDisplayName(name, fallback = '') {
  const source = String(name || '').trim();
  if (!source) return fallback;
  return source
    .split(/\s+/)
    .map((word, index) => {
      const bare = word.replace(/[^A-Za-z0-9'’.-]/g, '').toUpperCase();
      if (EXPANDED_WORDS[bare]) return EXPANDED_WORDS[bare];
      if (index > 0 && SMALL_WORDS.has(bare.toLowerCase())) return bare.toLowerCase();
      return word
        .toLowerCase()
        .replace(/(^|[-'’])([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
    })
    .join(' ');
}

export function airportCodes(airport, separator = ' / ') {
  if (!airport) return '';
  const icao = String(airport.icao || '').toUpperCase();
  const iata = String(airport.iata || '').toUpperCase();
  if (icao && iata) return `${icao}${separator}${iata}`;
  return icao || iata || '----';
}

export function airportCodePrimary(airport) {
  return String(airport?.icao || airport?.iata || '----').toUpperCase();
}

export function airportSecondary(airport) {
  const icao = String(airport?.icao || '').toUpperCase();
  const iata = String(airport?.iata || '').toUpperCase();
  if (icao && iata) return `${icao} · ${iata}`;
  return icao || iata || '';
}

export function airportLabel(airport, mode = 'both') {
  if (!airport) return '----';
  const name = airportDisplayName(airport.name, airportCodePrimary(airport));
  if (mode === 'name') return name;
  if (mode === 'codes') return airportCodes(airport);
  return `${airportCodes(airport)} · ${name}`;
}

export function statusText(status) {
  return status === 'flown' ? '已飞' : '计划中';
}

export function statusClass(status) {
  return status === 'flown' ? 'is-flown' : 'is-planned';
}

export function weatherCategoryClass(category) {
  const value = String(category || '').toUpperCase();
  if (value === 'VFR') return 'wx-vfr';
  if (value === 'MVFR') return 'wx-mvfr';
  if (value === 'IFR') return 'wx-ifr';
  if (value === 'LIFR') return 'wx-lifr';
  return 'wx-unknown';
}

export function weatherCategoryText(category) {
  const value = String(category || '').toUpperCase();
  if (value === 'VFR') return 'VFR 目视';
  if (value === 'MVFR') return 'MVFR 边缘目视';
  if (value === 'IFR') return 'IFR 仪表';
  if (value === 'LIFR') return 'LIFR 低仪表';
  return '天气未知';
}

export function formatDuration(minutes, style = 'long') {
  const total = Math.max(0, Math.round(num(minutes)));
  if (!total) return style === 'compact' ? '—' : '—';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (style === 'compact') {
    if (!hours) return `${mins}m`;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (!hours) return `${mins} 分钟`;
  return mins ? `${hours} 小时 ${mins} 分` : `${hours} 小时`;
}

export function formatDurationFromSeconds(seconds, style = 'long') {
  const value = Number(seconds);
  return Number.isFinite(value) ? formatDuration(value / 60, style) : '—';
}

export function formatClockDuration(minutes) {
  const total = Math.max(0, Math.round(num(minutes)));
  const hours = Math.floor(total / 60);
  return `${hours}:${String(total % 60).padStart(2, '0')}`;
}

export function formatDistance(nm, unit = 'nm', digits = 0) {
  const value = Number(nm);
  if (!Number.isFinite(value)) return '—';
  if (unit === 'km') {
    return `${formatNumber(value * KM_PER_NM, digits)} km`;
  }
  return `${formatNumber(value, digits)} nm`;
}

export function formatAltitude(ft, unit = 'ft', options = {}) {
  const value = Number(ft);
  if (!Number.isFinite(value)) return '—';
  if (unit === 'm') {
    return `${formatNumber(value * METERS_PER_FOOT)} m`;
  }
  if (options.flightLevel && value >= 10000) {
    return `FL${Math.round(value / 100)}`;
  }
  return `${formatNumber(value)} ft`;
}

export function formatSpeed(knots, unit = 'kt') {
  const value = Number(knots);
  if (!Number.isFinite(value)) return '—';
  if (unit === 'kmh') return `${formatNumber(value * KM_PER_NM)} km/h`;
  return `${formatNumber(value)} kt`;
}

export function convertWeight(value, from = 'kg', to = 'kg') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (from === to) return parsed;
  if (from === 'kg' && to === 'lb') return parsed * WEIGHT_FACTOR;
  if (from === 'lb' && to === 'kg') return parsed / WEIGHT_FACTOR;
  return parsed;
}

export function formatWeight(value, from = 'kg', to = 'kg', digits = 0) {
  const converted = convertWeight(value, from, to);
  if (converted === null) return '—';
  return `${formatNumber(converted, digits)} ${to}`;
}

export function formatMach(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '—';
  return `M ${parsed < 1 ? parsed.toFixed(2).replace(/^0/, '') : parsed.toFixed(2)}`;
}

export function formatCostIndex(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function formatNumberOrDash(value, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatNumber(parsed, digits) : '—';
}

export function formatCoords(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '—';
  const latText = `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lonText = `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${latText}, ${lonText}`;
}

export function compass(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return '—';
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return directions[Math.round(((value % 360) + 360) % 360 / 45) % 8];
}

export function zoneLabel(offsetHours, mode = 'local') {
  if (mode === 'utc') return 'UTC';
  const offset = Number(offsetHours);
  if (!Number.isFinite(offset)) return '当地时间';
  if (offset === 0) return 'UTC';
  const sign = offset > 0 ? '+' : '−';
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute);
  const minutes = Math.round((absolute - hours) * 60);
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

export function shiftedDate(timestamp, offsetHours, mode = 'local') {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const offset = mode === 'utc' ? 0 : Number(offsetHours) || 0;
  return new Date(ms + offset * 3600 * 1000);
}

export function dateAt(timestamp, offsetHours, mode = 'local') {
  const date = shiftedDate(timestamp, offsetHours, mode);
  return date ? date.toISOString().slice(0, 10) : '';
}

export function timeAt(timestamp, offsetHours, mode = 'local') {
  const date = shiftedDate(timestamp, offsetHours, mode);
  return date ? date.toISOString().slice(11, 16) : '—';
}

export function dateTimeAt(timestamp, offsetHours, mode = 'local') {
  const date = shiftedDate(timestamp, offsetHours, mode);
  return date ? `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}` : '—';
}

export function utcTime(timestamp) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().slice(11, 16);
}

export function utcDateTime(timestamp) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

export function isoDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function zuluStamp(timestamp) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const date = new Date(ms);
  return `${date.toISOString().slice(8, 10)}${date.toISOString().slice(11, 16)}Z`;
}

export function dateCN(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '日期未定';
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

export function monthDayCN(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '日期未定';
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export function weekdayCN(isoDate) {
  const value = String(isoDate || '');
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getUTCDay()];
}

export function relativeDay(timestamp, offsetHours = 0) {
  const date = shiftedDate(timestamp, offsetHours, 'local');
  if (!date) return '';
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  return '';
}

export function hourGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function flightDate(flight, mode = 'local') {
  if (!flight?.scheduledOut) return flight?.actual?.date || '';
  return dateAt(
    flight.scheduledOut,
    flight.origin?.timezoneHours || 0,
    mode,
  );
}

export function flightDepartureTime(flight, mode = 'local') {
  return timeAt(flight?.scheduledOut, flight?.origin?.timezoneHours || 0, mode);
}

export function flightArrivalTime(flight, mode = 'local') {
  return timeAt(flight?.scheduledIn, flight?.destination?.timezoneHours || 0, mode);
}

export function flightDurationMinutes(flight) {
  return flight?.actual?.blockMinutes ?? flight?.blockMinutes ?? null;
}

export function statusDate(flight) {
  return flight?.actual?.date || flightDate(flight);
}

export function formatRelativeUpdated(timestamp) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)} 天前`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function truncate(text, length = 80) {
  const value = String(text || '');
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function escapeAttribute(value) {
  return esc(value).replace(/`/g, '&#96;');
}
