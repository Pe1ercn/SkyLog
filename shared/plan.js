/**
 * Normalize a SimBrief OFP JSON payload into SkyLog's stable plan shape.
 * Pure module: no Node or Electron APIs, so it can be unit-tested directly.
 */

const AIRPORT_FIELDS = [
  'icao_code', 'iata_code', 'name', 'pos_lat', 'pos_long', 'elevation',
  'timezone', 'plan_rwy', 'trans_alt', 'trans_level', 'metar', 'metar_time',
  'metar_category', 'taf', 'taf_time',
];

export class PlanError extends Error {
  constructor(message, code = 'invalid-plan') {
    super(message);
    this.name = 'PlanError';
    this.code = code;
  }
}

export function str(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = str(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bool(value) {
  if (value === true || value === 1) return true;
  const text = str(value).toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

export function list(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Object.keys(value).length > 0) return [value];
  return [];
}

function unixMs(value) {
  const seconds = num(value);
  if (seconds === null || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

function seconds(value) {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
}

function airportFrom(raw, extra = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const icao = str(raw.icao_code).toUpperCase();
  const iata = str(raw.iata_code).toUpperCase();
  const lat = num(raw.pos_lat);
  const lon = num(raw.pos_long);
  if (!icao && !iata) return null;
  return {
    icao,
    iata,
    name: str(raw.name) || icao || iata,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    elevationFt: num(raw.elevation),
    timezoneHours: num(raw.timezone),
    runway: str(raw.plan_rwy),
    transitionAltitudeFt: num(raw.trans_alt),
    transitionLevelFt: num(raw.trans_level),
    metar: str(raw.metar),
    metarTime: str(raw.metar_time),
    metarCategory: str(raw.metar_category).toUpperCase(),
    taf: str(raw.taf),
    tafTime: str(raw.taf_time),
    ...extra,
  };
}

function alternateFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return airportFrom(raw, {
    distanceNm: num(raw.distance),
    gcDistanceNm: num(raw.gc_distance),
    airDistanceNm: num(raw.air_distance),
    route: str(raw.route),
    cruiseAltitudeFt: num(raw.cruise_altitude),
    eteSec: seconds(raw.ete),
    burn: num(raw.burn),
  });
}

function parseStepClimbs(value) {
  const parts = str(value).split('/').filter(Boolean);
  const steps = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const fl = num(parts[i + 1]);
    if (fl !== null) steps.push({ fix: parts[i], fl, altitudeFt: fl * 100 });
  }
  return steps;
}

function normalizeFix(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ident = str(raw.ident).toUpperCase() || str(raw.name).toUpperCase();
  if (!ident) return null;
  const lat = num(raw.pos_lat);
  const lon = num(raw.pos_long);
  return {
    ident,
    name: str(raw.name) || ident,
    type: str(raw.type) || 'wpt',
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    stage: str(raw.stage),
    airway: str(raw.via_airway) || 'DCT',
    sidStar: bool(raw.is_sid_star),
    distanceNm: num(raw.distance),
    trackTrue: num(raw.track_true),
    altitudeFt: num(raw.altitude_feet),
    groundSpeedKt: num(raw.groundspeed),
    timeLegSec: seconds(raw.time_leg),
    timeTotalSec: seconds(raw.time_total),
    fuelLeg: num(raw.fuel_leg),
    fuelTotal: num(raw.fuel_totalused),
    fuelOnBoard: num(raw.fuel_plan_onboard),
    oatC: num(raw.oat),
    windDir: num(raw.wind_dir),
    windSpd: num(raw.wind_spd),
    fir: str(raw.fir),
    frequency: str(raw.frequency),
  };
}

function normalizeTlr(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const takeoff = raw.takeoff;
  const landing = raw.landing;
  const pickRunway = (section) => {
    const planned = str(section?.conditions?.planned_runway).toUpperCase();
    const runways = list(section?.runway);
    return (
      runways.find((item) => str(item?.identifier).toUpperCase() === planned) ||
      runways[0] ||
      null
    );
  };
  const takeoffRow = pickRunway(takeoff);
  const landingRow = pickRunway(landing);
  const takeoffConditions = takeoff?.conditions || {};
  const landingConditions = landing?.conditions || {};
  return {
    takeoff: takeoff
      ? {
          airport: str(takeoffConditions.airport_icao),
          runway: str(takeoffConditions.planned_runway),
          weight: num(takeoffConditions.planned_weight),
          windDirection: num(takeoffConditions.wind_direction),
          windSpeed: num(takeoffConditions.wind_speed),
          temperatureC: num(takeoffConditions.temperature),
          altimeter: num(takeoffConditions.altimeter),
          surface: str(takeoffConditions.surface_condition),
          row: takeoffRow
            ? {
                identifier: str(takeoffRow.identifier),
                lengthFt: num(takeoffRow.length),
                elevationFt: num(takeoffRow.elevation),
                flap: str(takeoffRow.flap_setting),
                thrust: str(takeoffRow.thrust_setting),
                flexTempC: num(takeoffRow.flex_temperature),
                v1: num(takeoffRow.speeds_v1),
                vr: num(takeoffRow.speeds_vr),
                v2: num(takeoffRow.speeds_v2),
                maxWeight: num(takeoffRow.max_weight),
                limitCode: str(takeoffRow.limit_code),
                distanceDecideFt: num(takeoffRow.distance_decide),
                distanceRejectFt: num(takeoffRow.distance_reject),
                headwindKt: num(takeoffRow.headwind_component),
                crosswindKt: num(takeoffRow.crosswind_component),
              }
            : null,
        }
      : null,
    landing: landing
      ? {
          airport: str(landingConditions.airport_icao),
          runway: str(landingConditions.planned_runway),
          weight: num(landingConditions.planned_weight),
          windDirection: num(landingConditions.wind_direction),
          windSpeed: num(landingConditions.wind_speed),
          temperatureC: num(landingConditions.temperature),
          altimeter: num(landingConditions.altimeter),
          surface: str(landingConditions.surface_condition),
          flap: str(landingConditions.flap_setting),
          row: landingRow
            ? {
                identifier: str(landingRow.identifier),
                lengthFt: num(landingRow.length),
                elevationFt: num(landingRow.elevation),
                headwindKt: num(landingRow.headwind_component),
                crosswindKt: num(landingRow.crosswind_component),
              }
            : null,
          distanceDry: landing.distance_dry
            ? {
                weight: num(landing.distance_dry.weight),
                flap: str(landing.distance_dry.flap_setting),
                brake: str(landing.distance_dry.brake_setting),
                reverser: str(landing.distance_dry.reverser_credit),
                vref: num(landing.distance_dry.speeds_vref),
                actualFt: num(landing.distance_dry.actual_distance),
                factoredFt: num(landing.distance_dry.factored_distance),
              }
            : null,
          distanceWet: landing.distance_wet
            ? {
                weight: num(landing.distance_wet.weight),
                flap: str(landing.distance_wet.flap_setting),
                brake: str(landing.distance_wet.brake_setting),
                reverser: str(landing.distance_wet.reverser_credit),
                vref: num(landing.distance_wet.speeds_vref),
                actualFt: num(landing.distance_wet.actual_distance),
                factoredFt: num(landing.distance_wet.factored_distance),
              }
            : null,
        }
      : null,
  };
}

const IMPACT_LABELS = {
  minus_6000ft: '巡航高度 −6,000 ft',
  minus_4000ft: '巡航高度 −4,000 ft',
  minus_2000ft: '巡航高度 −2,000 ft',
  plus_2000ft: '巡航高度 +2,000 ft',
  plus_4000ft: '巡航高度 +4,000 ft',
  plus_6000ft: '巡航高度 +6,000 ft',
  higher_ci: '更高的成本指数',
  lower_ci: '更低的成本指数',
  zfw_plus_1000: '零燃油重量 +1,000',
  zfw_minus_1000: '零燃油重量 −1,000',
};

function normalizeImpacts(raw) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(IMPACT_LABELS)
    .map(([key, label]) => {
      const item = raw[key];
      if (!item || typeof item !== 'object' || Object.keys(item).length === 0) return null;
      return {
        key,
        label,
        timeEnrouteSec: seconds(item.time_enroute),
        timeDifferenceSec: seconds(item.time_difference),
        enrouteBurn: num(item.enroute_burn),
        burnDifference: num(item.burn_difference),
        rampFuel: num(item.ramp_fuel),
        initialFl: num(item.initial_fl),
        initialTas: num(item.initial_tas),
        initialMach: num(item.initial_mach),
        costIndex: str(item.cost_index),
      };
    })
    .filter(Boolean);
}

function findFile(raw, matcher) {
  const directory = str(raw.files?.directory);
  const entries = list(raw.files?.file);
  const found = entries.find((item) => matcher(str(item?.name), str(item?.link)));
  if (!found || !directory) return '';
  return directory + str(found.link);
}

function dedupePoints(points) {
  const output = [];
  for (const point of points) {
    if (!point) continue;
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const previous = output[output.length - 1];
    if (previous && Math.abs(previous[0] - lat) < 1e-6 && Math.abs(previous[1] - lon) < 1e-6) continue;
    output.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
  }
  return output;
}

/**
 * @param {unknown} raw
 * @param {{fetchedAt?: number}} options
 * @returns {object}
 */
export function normalizePlan(raw, options = {}) {
  if (!raw || typeof raw !== 'object') throw new PlanError('SimBrief 返回的数据为空');
  const fetchInfo = raw.fetch || {};
  const status = str(fetchInfo.status);
  if (status && !/^success/i.test(status)) {
    const detail = status.replace(/^error:\s*/i, '');
    throw new PlanError(detail || 'SimBrief 无法提供这份计划', 'simbrief-error');
  }

  const general = raw.general || {};
  const atc = raw.atc || {};
  const params = raw.params || {};
  const rawAircraft = raw.aircraft || {};
  const origin = airportFrom(raw.origin);
  const destination = airportFrom(raw.destination);
  if (!origin || !destination) {
    throw new PlanError('计划缺少起飞机场或到达机场，无法导入', 'missing-airports');
  }
  if (origin.lat === null || origin.lon === null || destination.lat === null || destination.lon === null) {
    throw new PlanError('计划缺少机场坐标，无法在地图上显示', 'missing-coordinates');
  }

  const warnings = [];
  const fixes = list(raw.navlog?.fix).map(normalizeFix).filter(Boolean);
  if (fixes.length === 0) warnings.push('计划没有航路点数据，地图将使用起降机场直连');
  const missingCoords = fixes.filter((fix) => fix.lat === null || fix.lon === null).length;
  if (missingCoords > 0) warnings.push(`${missingCoords} 个航路点缺少坐标，已在地图连线中跳过`);
  if (!str(atc.flightplan_text)) warnings.push('计划未包含 ATC 飞行计划文本');

  const airlineIcao = str(general.icao_airline).toUpperCase();
  const flightNumberRaw = str(general.flight_number).toUpperCase();
  const registration = str(rawAircraft.reg).toUpperCase();
  const composedFlightNumber =
    airlineIcao && flightNumberRaw && !flightNumberRaw.startsWith(airlineIcao)
      ? `${airlineIcao}${flightNumberRaw}`
      : flightNumberRaw;
  const callsign =
    str(atc.callsign).toUpperCase() ||
    composedFlightNumber ||
    registration;
  const flightNumber = composedFlightNumber || registration || callsign;
  if (!callsign) warnings.push('计划没有呼号信息');

  const scheduledOut = unixMs(raw.times?.sched_out) ?? unixMs(raw.times?.est_out);
  const scheduledIn = unixMs(raw.times?.sched_in) ?? unixMs(raw.times?.est_in);
  const estimatedOut = unixMs(raw.times?.est_out);
  const estimatedIn = unixMs(raw.times?.est_in);
  const estimatedOff = unixMs(raw.times?.est_off);
  const estimatedOn = unixMs(raw.times?.est_on);
  const blockSec =
    seconds(raw.times?.sched_block) ??
    seconds(raw.times?.est_block) ??
    (scheduledOut && scheduledIn ? Math.round((scheduledIn - scheduledOut) / 1000) : null);
  const enrouteSec = seconds(raw.times?.est_time_enroute);
  if (!scheduledOut) warnings.push('计划没有预计撤轮挡时间');

  const unitsRaw = str(params.units).toLowerCase();
  const weightUnit = unitsRaw === 'lbs' || unitsRaw === 'lb' ? 'lb' : 'kg';

  const fixesWithPositions = fixes.filter((fix) => fix.lat !== null && fix.lon !== null);
  const routeNodes = [];
  const pushNode = (node) => {
    const previous = routeNodes[routeNodes.length - 1];
    if (
      previous &&
      Math.abs(previous.lat - node.lat) < 1e-6 &&
      Math.abs(previous.lon - node.lon) < 1e-6
    ) {
      return;
    }
    routeNodes.push(node);
  };
  pushNode({
    ident: origin.icao || origin.iata,
    type: 'apt',
    lat: origin.lat,
    lon: origin.lon,
  });
  for (const fix of fixesWithPositions) {
    pushNode({ ident: fix.ident, type: fix.type || 'wpt', lat: fix.lat, lon: fix.lon });
  }
  pushNode({
    ident: destination.icao || destination.iata,
    type: 'apt',
    lat: destination.lat,
    lon: destination.lon,
  });
  const routePoints = routeNodes.map((node) => [
    Number(node.lat.toFixed(5)),
    Number(node.lon.toFixed(5)),
  ]);
  const waypoints = routeNodes.map((node) => ({
    ident: node.ident,
    type: node.type,
    lat: Number(node.lat.toFixed(5)),
    lon: Number(node.lon.toFixed(5)),
  }));

  const alternateRaw = list(raw.alternate).map(alternateFrom).filter(Boolean);
  const enrouteAlternates = list(raw.enroute_altn).map(alternateFrom).filter(Boolean);
  const takeoffAlternate = raw.takeoff_altn ? alternateFrom(raw.takeoff_altn) : null;

  const stepClimbs = parseStepClimbs(general.stepclimb_string);
  const initialAltitudeFt = num(general.initial_altitude);
  if (initialAltitudeFt === null) warnings.push('计划没有巡航高度');

  const ofpDirectory = str(raw.files?.directory);
  const pdfLink = str(raw.files?.pdf?.link);
  const rawXml = str(params.xml_file);
  const msfsPln = findFile(raw, (name, link) =>
    /fs2020|msfs/i.test(name) || /_MFS_/i.test(link) || /\.pln$/i.test(link) && /mfs|fs2020/i.test(link),
  );

  const crew = raw.crew || {};
  const flightplanText = str(atc.flightplan_text);

  const plan = {
    schemaVersion: 1,
    fetchedAt: options.fetchedAt || Date.now(),
    generatedAt: unixMs(params.time_generated),
    pilotId: str(params.user_id) || str(fetchInfo.userid),
    staticId: str(params.static_id) || str(fetchInfo.static_id),
    requestId: str(params.request_id),
    airac: str(params.airac),
    ofpLayout: str(params.ofp_layout),
    units: { weight: weightUnit, raw: unitsRaw || 'kgs' },
    airlineIcao,
    flightNumber,
    flightNumberRaw,
    callsign,
    registration,
    origin,
    destination,
    alternates: alternateRaw,
    enrouteAlternates,
    takeoffAlternate,
    aircraft: {
      icao: str(rawAircraft.icao_code || rawAircraft.icaocode).toUpperCase(),
      iata: str(rawAircraft.iata_code || rawAircraft.iatacode).toUpperCase(),
      name: str(rawAircraft.name),
      registration,
      engines: str(rawAircraft.engines),
      selcal: str(rawAircraft.selcal),
      fin: str(rawAircraft.fin),
      category: str(rawAircraft.equip_category),
      maxPassengers: num(rawAircraft.max_passengers),
      equipment: str(rawAircraft.equip),
    },
    cruise: {
      initialAltitudeFt,
      stepClimbs,
      mach: num(general.cruise_mach),
      tas: num(general.cruise_tas),
      costIndex: str(general.costindex),
      cruiseProfile: str(general.cruise_profile),
      climbProfile: str(general.climb_profile),
      descentProfile: str(general.descent_profile),
      averageWindComponent: num(general.avg_wind_comp),
      averageWindDirection: num(general.avg_wind_dir),
      averageWindSpeed: num(general.avg_wind_spd),
      averageTropopauseFt: num(general.avg_tropopause),
      averageTemperatureDeviationC: num(general.avg_temp_dev),
      passengers: num(general.passengers),
      isEtops: bool(general.is_etops),
    },
    route: {
      text: str(general.route),
      ifps: str(general.route_ifps),
      navigraph: str(general.route_navigraph),
      distanceNm: num(general.route_distance),
      gcDistanceNm: num(general.gc_distance),
      airDistanceNm: num(general.air_distance),
      sid: str(general.sid_ident),
      sidTransition: str(general.sid_trans),
      star: str(general.star_ident),
      starTransition: str(general.star_trans),
      totalBurn: num(general.total_burn),
    },
    times: {
      scheduledOut,
      scheduledIn,
      scheduledOff: unixMs(raw.times?.sched_off),
      scheduledOn: unixMs(raw.times?.sched_on),
      estimatedOut,
      estimatedIn,
      estimatedOff,
      estimatedOn,
      blockSec,
      enrouteSec,
      scheduledBlockSec: seconds(raw.times?.sched_block),
      scheduledEnrouteSec: seconds(raw.times?.sched_time_enroute),
      taxiOutSec: seconds(raw.times?.taxi_out),
      taxiInSec: seconds(raw.times?.taxi_in),
      reserveSec: seconds(raw.times?.reserve_time),
      enduranceSec: seconds(raw.times?.endurance),
      originTimezoneHours: origin.timezoneHours,
      destinationTimezoneHours: destination.timezoneHours,
    },
    fuel: {
      taxi: num(raw.fuel?.taxi),
      enrouteBurn: num(raw.fuel?.enroute_burn),
      contingency: num(raw.fuel?.contingency),
      alternateBurn: num(raw.fuel?.alternate_burn),
      reserve: num(raw.fuel?.reserve),
      etops: num(raw.fuel?.etops),
      extra: num(raw.fuel?.extra),
      minTakeoff: num(raw.fuel?.min_takeoff),
      planTakeoff: num(raw.fuel?.plan_takeoff),
      planRamp: num(raw.fuel?.plan_ramp),
      planLanding: num(raw.fuel?.plan_landing),
      averageFuelFlow: num(raw.fuel?.avg_fuel_flow),
      maxTanks: num(raw.fuel?.max_tanks),
    },
    weights: {
      oew: num(raw.weights?.oew),
      paxCount: num(raw.weights?.pax_count),
      bagCount: num(raw.weights?.bag_count),
      cargo: num(raw.weights?.cargo),
      payload: num(raw.weights?.payload),
      zfw: num(raw.weights?.est_zfw),
      maxZfw: num(raw.weights?.max_zfw),
      tow: num(raw.weights?.est_tow),
      maxTow: num(raw.weights?.max_tow),
      ldw: num(raw.weights?.est_ldw),
      maxLdw: num(raw.weights?.max_ldw),
      ramp: num(raw.weights?.est_ramp),
    },
    navlog: {
      count: fixes.length,
      fixes,
    },
    routePoints,
    waypoints,
    atc: {
      callsign: str(atc.callsign),
      flightRules: str(atc.flight_rules),
      flightType: str(atc.flight_type),
      initialSpeed: str(atc.initial_spd),
      initialAltitude: str(atc.initial_alt),
      route: str(atc.route),
      routeIfps: str(atc.route_ifps),
      flightplanText,
      firOrigin: str(atc.fir_orig),
      firDestination: str(atc.fir_dest),
      firEnroute: list(atc.fir_enroute).map(str).filter(Boolean),
    },
    crew: {
      captain: str(crew.cpt),
      firstOfficer: str(crew.fo),
      dispatcher: str(crew.dx),
      purser: str(crew.pu),
      flightAttendants: list(crew.fa).map(str).filter(Boolean),
    },
    tlr: normalizeTlr(raw.tlr),
    impacts: normalizeImpacts(raw.impacts),
    notamCount: list(raw.notams?.notamdrec).length,
    links: {
      simbrief: 'https://www.simbrief.com/system/dispatch.php',
      ofpPdf: pdfLink ? (ofpDirectory || 'https://www.simbrief.com/ofp/flightplans/') + pdfLink : '',
      msfsPln: msfsPln,
      skyvector: str(raw.links?.skyvector),
      routeImage: str(raw.images?.directory) && list(raw.images?.map).length
        ? str(raw.images.directory) + str(list(raw.images.map)[0].link)
        : '',
      rawXml,
    },
    warnings,
  };

  return plan;
}

/** Compact record used by the library index and map. */
export function summarizePlan(plan) {
  const scheduledOut =
    plan.times?.scheduledOut || plan.times?.estimatedOut || plan.generatedAt || null;
  const scheduledIn = plan.times?.scheduledIn || plan.times?.estimatedIn || null;
  return {
    flightNumber: plan.flightNumber,
    callsign: plan.callsign,
    airlineIcao: plan.airlineIcao,
    registration: plan.registration,
    aircraft: {
      icao: plan.aircraft?.icao || '',
      name: plan.aircraft?.name || '',
      registration: plan.aircraft?.registration || '',
    },
    origin: {
      icao: plan.origin?.icao || '',
      iata: plan.origin?.iata || '',
      name: plan.origin?.name || '',
      lat: plan.origin?.lat ?? null,
      lon: plan.origin?.lon ?? null,
    },
    destination: {
      icao: plan.destination?.icao || '',
      iata: plan.destination?.iata || '',
      name: plan.destination?.name || '',
      lat: plan.destination?.lat ?? null,
      lon: plan.destination?.lon ?? null,
    },
    scheduledOut,
    scheduledIn,
    blockMinutes: plan.times?.blockSec ? Math.round(plan.times.blockSec / 60) : null,
    enrouteMinutes: plan.times?.enrouteSec ? Math.round(plan.times.enrouteSec / 60) : null,
    distanceNm: plan.route?.distanceNm ?? null,
    gcDistanceNm: plan.route?.gcDistanceNm ?? null,
    cruiseAltitudeFt: plan.cruise?.initialAltitudeFt ?? null,
    waypointCount: plan.navlog?.count ?? 0,
    routePoints: plan.routePoints || [],
    waypoints: plan.waypoints || [],
    alternates: (plan.alternates || []).map((airport) => ({
      icao: airport.icao,
      iata: airport.iata,
      name: airport.name,
      lat: airport.lat,
      lon: airport.lon,
      runway: airport.runway,
      distanceNm: airport.distanceNm,
    })),
    generatedAt: plan.generatedAt,
    notamCount: plan.notamCount || 0,
    warnings: plan.warnings || [],
  };
}
