const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function normalizeIcao(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function normalizeFlightNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 8);
}

export function simbriefDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  return `${match[3]}${MONTHS[Number(match[2]) - 1] || 'JAN'}${match[1].slice(2)}`;
}

export function validateCreateFields(input) {
  const fields = {
    origin: normalizeIcao(input.origin),
    destination: normalizeIcao(input.destination),
    aircraft: normalizeIcao(input.aircraft),
    airline: String(input.airline || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    flightNumber: normalizeFlightNumber(input.flightNumber),
    date: String(input.date || '').trim(),
    time: String(input.time || '').trim(),
    route: String(input.route || '').trim().toUpperCase().slice(0, 1200),
    alternate: normalizeIcao(input.alternate),
    callsign: String(input.callsign || '').trim().toUpperCase().slice(0, 12),
    passengers: String(input.passengers || '').trim(),
  };
  const errors = {};
  if (fields.origin.length !== 4) errors.origin = 'Enter a 4-letter ICAO origin.';
  if (fields.destination.length !== 4) errors.destination = 'Enter a 4-letter ICAO destination.';
  if (fields.aircraft.length < 2 || fields.aircraft.length > 4) errors.aircraft = 'Enter an ICAO aircraft type.';
  if (fields.origin && fields.destination && fields.origin === fields.destination) {
    errors.destination = 'Origin and destination must be different.';
  }
  if (fields.time && !/^\d{2}:\d{2}$/.test(fields.time)) errors.time = 'Use HH:MM.';
  if (fields.passengers && !/^\d{1,3}$/.test(fields.passengers)) errors.passengers = 'Enter a passenger count.';
  return { fields, errors, valid: Object.keys(errors).length === 0 };
}

export function buildSimBriefPrefillUrl(input) {
  const { fields } = validateCreateFields(input);
  const params = new URLSearchParams();
  params.set('orig', fields.origin);
  params.set('dest', fields.destination);
  params.set('type', fields.aircraft);
  if (fields.airline) params.set('airline', fields.airline);
  if (fields.flightNumber) params.set('fltnum', fields.flightNumber);
  if (fields.date) params.set('date', simbriefDate(fields.date));
  if (fields.time) {
    const [hour, minute] = fields.time.split(':');
    params.set('deph', hour);
    params.set('depm', minute);
  }
  if (fields.route) params.set('route', fields.route);
  if (fields.alternate) params.set('altn', fields.alternate);
  if (fields.callsign) params.set('callsign', fields.callsign);
  if (fields.passengers) params.set('pax', fields.passengers);
  return `https://dispatch.simbrief.com/options/custom?${params.toString()}`;
}

export function composeSummary(input) {
  const { fields } = validateCreateFields(input);
  const legs = `${fields.origin} → ${fields.destination}`;
  const when = [fields.date, fields.time].filter(Boolean).join(' ');
  return [
    `SkyLog SimBrief draft`,
    `Route: ${legs}`,
    `Aircraft: ${fields.aircraft}${fields.airline || fields.flightNumber ? ` · ${fields.airline}${fields.flightNumber}` : ''}`,
    when ? `Departure: ${when}` : '',
    fields.route ? `Route: ${fields.route}` : '',
    fields.alternate ? `Alternate: ${fields.alternate}` : '',
  ].filter(Boolean).join('\n');
}
