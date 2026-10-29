import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import {
  airportCodePrimary,
  airportCodes,
  airportDisplayName,
  esc,
  formatAltitude,
  formatCoords,
  formatDistance,
  zoneLabel,
  monthDayCN,
  weatherCategoryClass,
  weatherCategoryText,
} from '../lib/format.js';
import { openModal, errorMessage, toast, loadingBlock } from './components.js';

export function openAirportDetail(app, payload = {}) {
  const state = {
    airport: payload.airport || null,
    flightId: payload.flightId || '',
    plan: payload.plan || null,
    loading: !payload.airport,
    error: '',
  };
  let handle;
  handle = openModal({
    title: '机场详情',
    className: 'airport-modal',
    body: '<div class="airport-modal-body"></div>',
    onMount: ({ modal }) => {
      const body = modal.querySelector('.airport-modal-body');
      const render = () => {
        if (state.loading) {
          body.innerHTML = loadingBlock('正在读取机场信息…');
          return;
        }
        if (state.error) {
          body.innerHTML = `<div class="airport-error">${icon('alert', 26)}<h3>无法读取机场</h3><p>${esc(state.error)}</p></div>`;
          return;
        }
        body.innerHTML = airportHtml(state, app);
        bind(body);
      };
      const load = async () => {
        if (state.plan && !state.airport) {
          state.airport = findAirport(state.plan, payload.icao);
        }
        if (!state.airport && state.flightId) {
          try {
            const result = await api.getFlightPlan(state.flightId);
            state.plan = result.plan;
            state.airport = findAirport(result.plan, payload.icao);
          } catch (error) {
            state.error = errorMessage(error);
          }
        }
        state.loading = false;
        if (!state.airport && !state.error) state.error = '没有找到这个机场。';
        render();
      };
      const bind = (container) => {
        container.querySelector('[data-airport-action="flight"]')?.addEventListener('click', () => {
          if (state.flightId) {
            handle.close();
            app.openFlightDetail(state.flightId);
          }
        });
        container.querySelector('[data-airport-action="map"]')?.addEventListener('click', () => {
          handle.close();
          if (state.flightId) app.goMap(state.flightId);
        });
        container.querySelectorAll('[data-airport-link]').forEach((button) => {
          button.addEventListener('click', () => app.openExternal(button.dataset.airportLink));
        });
        container.querySelector('[data-airport-action="copy-coords"]')?.addEventListener('click', async () => {
          try {
            await api.copyText(formatCoords(state.airport.lat, state.airport.lon));
            toast('坐标已复制', { type: 'success', duration: 1800 });
          } catch {
            toast('复制失败', { type: 'error' });
          }
        });
      };
      load();
    },
  });
  return handle;
}

function findAirport(plan, icao) {
  const code = String(icao || '').toUpperCase();
  const all = [
    plan?.origin,
    plan?.destination,
    ...(plan?.alternates || []),
    ...(plan?.enrouteAlternates || []),
    plan?.takeoffAlternate,
  ].filter(Boolean);
  return all.find((airport) => airport.icao === code || airport.iata === code) || null;
}

function airportHtml(state, app) {
  const airport = state.airport;
  const plan = state.plan;
  const isOrigin = plan?.origin?.icao === airport.icao;
  const isDestination = plan?.destination?.icao === airport.icao;
  const role = isOrigin ? '起飞机场' : isDestination ? '到达机场' : '备降 / 相关机场';
  const flight = plan ? `${plan.origin?.iata || plan.origin?.icao} → ${plan.destination?.iata || plan.destination?.icao}` : '';
  const mapsUrl =
    airport.lat != null && airport.lon != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${airport.lat},${airport.lon}`)}`
      : '';
  return `<div class="airport-detail">
    <header class="airport-detail-head">
      <div class="airport-detail-codes">
        <span>${esc(airportCodePrimary(airport))}</span>
        <em>${esc(airport.iata || '—')}</em>
      </div>
      <div>
        <span class="airport-role">${esc(role)}</span>
        <h2>${esc(airportDisplayName(airport.name, '机场'))}</h2>
        <p>${esc(airportCodes(airport))}${flight ? ` · ${esc(flight)}` : ''}</p>
      </div>
    </header>

    <div class="airport-facts">
      <div><span>海拔</span><strong>${esc(formatAltitude(airport.elevationFt, app.settings.altitudeUnit))}</strong></div>
      <div><span>计划跑道</span><strong>${esc(airport.runway || '—')}</strong></div>
      <div><span>时区</span><strong>${esc(zoneLabel(airport.timezoneHours, 'local'))}</strong></div>
      <div><span>过渡高度</span><strong>${esc(formatAltitude(airport.transitionAltitudeFt, app.settings.altitudeUnit))}</strong></div>
    </div>

    <div class="airport-coordinate-row">
      <div><span>坐标</span><strong>${esc(formatCoords(airport.lat, airport.lon))}</strong></div>
      <button class="text-btn" type="button" data-airport-action="copy-coords">${icon('copy', 13)} 复制</button>
    </div>

    <div class="airport-weather">
      <div class="weather-head">
        <span class="weather-badge ${weatherCategoryClass(airport.metarCategory)}">${esc(airport.metarCategory || '—')}</span>
        <strong>${esc(weatherCategoryText(airport.metarCategory))}</strong>
      </div>
      <div class="weather-block"><span>METAR</span><pre>${esc(airport.metar || '暂无')}</pre></div>
      <div class="weather-block"><span>TAF</span><pre>${esc(airport.taf || '暂无')}</pre></div>
    </div>

    <div class="airport-actions">
      ${state.flightId ? `<button class="btn btn-primary btn-small" type="button" data-airport-action="map">${icon('map', 15)} 在地图上查看</button>` : ''}
      ${state.flightId ? `<button class="btn btn-secondary btn-small" type="button" data-airport-action="flight">${icon('file', 15)} 查看航段</button>` : ''}
      ${mapsUrl ? `<button class="btn btn-secondary btn-small" type="button" data-airport-link="${esc(mapsUrl)}">${icon('external', 15)} Google Maps</button>` : ''}
      <button class="btn btn-secondary btn-small" type="button" data-airport-link="https://skyvector.com/airport/${esc(airport.icao || airport.iata)}">${icon('external', 15)} SkyVector</button>
    </div>
    ${plan?.alternates?.length && !isOrigin && !isDestination ? `<p class="airport-note">${icon('info', 14)} 这是 ${esc(plan.origin?.icao)} → ${esc(plan.destination?.icao)} 的备降机场，计划距离 ${esc(formatDistance(airport.distanceNm, app.settings.distanceUnit))}。</p>` : ''}
  </div>`;
}
