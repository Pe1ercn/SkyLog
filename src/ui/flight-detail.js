import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import {
  airportCodePrimary,
  airportCodes,
  airportDisplayName,
  compass,
  dateAt,
  dateCN,
  dateTimeAt,
  esc,
  formatAltitude,
  formatClockDuration,
  formatCoords,
  formatDistance,
  formatDuration,
  formatNumber,
  formatWeight,
  isoDateTime,
  monthDayCN,
  statusClass,
  statusText,
  timeAt,
  utcDateTime,
  utcTime,
  weatherCategoryClass,
  weatherCategoryText,
  zoneLabel,
} from '../lib/format.js';
import { sessionColor } from '../lib/palette.js';
import {
  copyToClipboard,
  errorMessage,
  openModal,
  showActionMenu,
  toast,
} from './components.js';

const TABS = [
  ['overview', '概览', 'home'],
  ['route', '航路', 'route'],
  ['airports', '机场', 'pin'],
  ['performance', '性能', 'gauge'],
  ['log', '日志', 'book'],
];

export function openFlightDetail(app, flightId, options = {}) {
  const initialFlight = app.findFlight(flightId);
  if (!initialFlight) return;
  const state = {
    flight: initialFlight,
    plan: null,
    loading: true,
    error: '',
    tab: TABS.some(([key]) => key === options.tab) ? options.tab : 'overview',
    saving: false,
  };

  let modalHandle;
  modalHandle = openModal({
    bare: true,
    className: 'detail-modal',
    body: '<div class="detail-mount"></div>',
    onMount: ({ modal }) => {
      const mount = modal.querySelector('.detail-mount');
      const render = () => {
        if (state.loading) {
          mount.innerHTML = detailLoadingHtml(state.flight, modalHandle);
        } else if (state.error) {
          mount.innerHTML = detailErrorHtml(state.error);
        } else {
          mount.innerHTML = detailHtml(state, app, modalHandle);
          bindDetail(mount);
        }
      };
      modal.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-detail-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.detailAction;
        if (action === 'close') modalHandle.close();
        else if (action === 'tab') {
          state.tab = actionEl.dataset.tab;
          render();
          mount.querySelector('.detail-content')?.scrollTo({ top: 0 });
        } else if (action === 'map') {
          modalHandle.close();
          app.goMap(state.flight.id);
        } else if (action === 'mark') {
          markFlight(state.flight.status !== 'flown');
        } else if (action === 'delete') {
          deleteFlight();
        } else if (action === 'more') {
          openMoreMenu(actionEl);
        } else if (action === 'airport') {
          const airport = findAirport(actionEl.dataset.icao);
          if (airport) {
            app.openAirportDetail({ flightId: state.flight.id, icao: airport.icao, airport, plan: state.plan });
          }
        } else if (action === 'copy-route') {
          copyToClipboard(state.plan?.route?.text || '');
        } else if (action === 'export-raw') {
          exportRaw();
        } else if (action === 'save-log') {
          saveLog(mount);
        } else if (action === 'open-link') {
          app.openExternal(actionEl.dataset.url);
        }
      });
      modal.addEventListener('submit', (event) => {
        if (event.target.matches('[data-log-form]')) {
          event.preventDefault();
          saveLog(mount);
        }
      });

      function bindDetail(container) {
        container.querySelectorAll('[data-log-status]').forEach((button) => {
          button.addEventListener('click', () => {
            const value = button.dataset.logStatus === 'flown' ? 'flown' : 'planned';
            container.querySelectorAll('[data-log-status]').forEach((item) => {
              item.classList.toggle('is-active', item.dataset.logStatus === value);
            });
            const hidden = container.querySelector('[data-log-form] input[name="status"]');
            if (hidden) hidden.value = value;
          });
        });
        container.querySelectorAll('[data-detail-link]').forEach((button) => {
          button.addEventListener('click', () => app.openExternal(button.dataset.detailLink));
        });
      }

      function findAirport(icao) {
        const code = String(icao || '').toUpperCase();
        const all = [
          state.plan?.origin,
          state.plan?.destination,
          ...(state.plan?.alternates || []),
          ...(state.plan?.enrouteAlternates || []),
          state.plan?.takeoffAlternate,
        ].filter(Boolean);
        return all.find((airport) => airport.icao === code || airport.iata === code) || null;
      }

      async function load() {
        state.loading = true;
        state.error = '';
        render();
        try {
          const result = await api.getFlightPlan(flightId);
          state.flight = result.flight;
          state.plan = result.plan;
          state.loading = false;
          render();
        } catch (error) {
          state.loading = false;
          state.error = errorMessage(error);
          render();
        }
      }

      async function markFlight(flown) {
        const updated = await app.markFlown(state.flight, flown);
        if (updated) {
          state.flight = { ...state.flight, ...updated };
          render();
        }
      }

      async function deleteFlight() {
        const deleted = await app.deleteFlight(state.flight);
        if (deleted) modalHandle.close();
      }

      async function saveLog(container) {
        const form = container.querySelector('[data-log-form]');
        if (!form || state.saving) return;
        state.saving = true;
        const submit = form.querySelector('[data-action="save-log"]');
        if (submit) submit.disabled = true;
        const data = new FormData(form);
        try {
          const result = await api.updateFlight(state.flight.id, {
            status: data.get('status') === 'flown' ? 'flown' : 'planned',
            actualDate: data.get('actualDate') || '',
            actualBlockMinutes: data.get('actualBlockMinutes') || null,
            notes: data.get('notes') || '',
            sessionId: data.get('sessionId') || state.flight.sessionId,
          });
          app.library = result.library;
          state.flight = result.flight;
          app.refresh();
          state.saving = false;
          render();
          toast('飞行日志已保存', { type: 'success' });
        } catch (error) {
          state.saving = false;
          if (submit) submit.disabled = false;
          toast(errorMessage(error), { type: 'error' });
        }
      }

      async function exportRaw() {
        try {
          const result = await api.exportRawPlan(state.flight.id);
          if (!result.canceled) toast('原始 SimBrief JSON 已导出', { type: 'success' });
        } catch (error) {
          toast(errorMessage(error), { type: 'error' });
        }
      }

      function openMoreMenu(anchor) {
        showActionMenu(anchor, [
          {
            label: '复制航路',
            icon: 'copy',
            onClick: () => copyToClipboard(state.plan?.route?.text || ''),
          },
          {
            label: '导出原始 JSON',
            icon: 'download',
            onClick: exportRaw,
          },
          {
            label: '在 SimBrief 打开',
            icon: 'external',
            onClick: () => app.openExternal('https://www.simbrief.com/system/dispatch.php'),
          },
          '-',
          {
            label: '删除这个航段',
            icon: 'trash',
            danger: true,
            onClick: deleteFlight,
          },
        ]);
      }

      load();
    },
  });
  return modalHandle;
}

function detailLoadingHtml(flight, handle) {
  return `<div class="detail-page">
    <header class="detail-topbar">
      <button class="detail-back" type="button" data-detail-action="close">${icon('arrowLeft', 17)}<span>返回</span></button>
      <span class="detail-breadcrumb">飞行日志 / 读取计划…</span>
      <span class="detail-topbar-spacer"></span>
    </header>
    <div class="detail-loading">
      <div class="detail-loading-route">
        <span>${esc(airportCodePrimary(flight.origin))}</span>
        <i></i>
        ${icon('plane', 18)}
        <i></i>
        <span>${esc(airportCodePrimary(flight.destination))}</span>
      </div>
      <span class="loading-orbit">${icon('loading', 26)}</span>
      <h2>正在读取计划详情</h2>
      <p>${esc(flight.callsign || flight.flightNumber)} · ${esc(flight.origin?.iata || '')} → ${esc(flight.destination?.iata || '')}</p>
    </div>
  </div>`;
}

function detailErrorHtml(message) {
  return `<div class="detail-page">
    <header class="detail-topbar">
      <button class="detail-back" type="button" data-detail-action="close">${icon('arrowLeft', 17)}<span>返回</span></button>
      <span class="detail-breadcrumb">飞行日志 / 读取失败</span>
      <span class="detail-topbar-spacer"></span>
    </header>
    <div class="detail-loading">
      <span class="detail-error-icon">${icon('alert', 30)}</span>
      <h2>无法读取计划详情</h2>
      <p>${esc(message)}</p>
      <button class="btn btn-primary" type="button" data-detail-action="close">关闭</button>
    </div>
  </div>`;
}

function detailHtml(state, app, handle) {
  const { flight, plan } = state;
  const settings = app.settings;
  const session = app.findSession(flight.sessionId);
  const color = sessionColor(flight.colorIndex);
  const dateLabel = flight.scheduledDate ? dateCN(flight.scheduledDate) : '日期待定';
  return `<div class="detail-page" style="--detail-color:${color}">
    <header class="detail-topbar">
      <button class="detail-back" type="button" data-detail-action="close">${icon('arrowLeft', 17)}<span>返回</span></button>
      <span class="detail-breadcrumb">${esc(session?.name || '飞行日志')} <i>/</i> ${esc(plan.flightNumber || plan.callsign)}</span>
      <div class="detail-topbar-actions">
        <span class="status-chip ${statusClass(flight.status)}"><i></i>${statusText(flight.status)}</span>
        <button class="btn btn-secondary btn-small" type="button" data-detail-action="mark">${icon(flight.status === 'flown' ? 'refresh' : 'checkCircle', 15)} ${flight.status === 'flown' ? '改回计划' : '标记已飞'}</button>
        <button class="icon-btn" type="button" data-detail-action="more" aria-label="更多操作">${icon('more', 19)}</button>
      </div>
    </header>

    <div class="detail-hero">
      <div class="detail-route-block">
        <div class="detail-route-codes">
          <button class="detail-airport-code" type="button" data-detail-action="airport" data-icao="${esc(plan.origin?.icao)}" title="查看机场详情">
            <span>${esc(airportCodePrimary(plan.origin))}</span><em>${esc(plan.origin?.iata || '—')}</em>
          </button>
          <span class="detail-route-arrow"><i></i>${icon('plane', 20)}</span>
          <button class="detail-airport-code is-arrival" type="button" data-detail-action="airport" data-icao="${esc(plan.destination?.icao)}" title="查看机场详情">
            <span>${esc(airportCodePrimary(plan.destination))}</span><em>${esc(plan.destination?.iata || '—')}</em>
          </button>
        </div>
        <div class="detail-airport-names">
          <span>${esc(airportDisplayName(plan.origin?.name, '起飞机场'))}</span>
          ${icon('arrowRight', 13)}
          <span>${esc(airportDisplayName(plan.destination?.name, '到达机场'))}</span>
        </div>
        <div class="detail-hero-meta">
          <span>${esc(plan.flightNumber || plan.callsign || '—')}</span><i></i>
          <span>${esc(plan.aircraft?.name || plan.aircraft?.icao || '—')}</span>
          ${plan.registration && plan.registration !== plan.flightNumber ? `<i></i><span>${esc(plan.registration)}</span>` : ''}
          <i></i><span>${esc(dateLabel)}</span>
        </div>
      </div>
      <div class="detail-hero-side">
        <div class="detail-hero-stat"><span>计划时间</span><strong>${esc(formatDuration(plan.times?.blockSec ? plan.times.blockSec / 60 : flight.blockMinutes, 'compact'))}</strong></div>
        <div class="detail-hero-stat"><span>航路距离</span><strong>${esc(formatDistance(plan.route?.distanceNm, settings.distanceUnit))}</strong></div>
        <div class="detail-hero-stat"><span>巡航高度</span><strong>${esc(formatAltitude(plan.cruise?.initialAltitudeFt, settings.altitudeUnit, { flightLevel: true }))}</strong></div>
      </div>
    </div>

    <nav class="detail-tabs" aria-label="计划详情">
      ${TABS.map(
        ([key, label, iconName]) =>
          `<button class="${state.tab === key ? 'is-active' : ''}" type="button" data-detail-action="tab" data-tab="${key}">${icon(iconName, 16)}<span>${label}</span></button>`,
      ).join('')}
    </nav>

    <div class="detail-content">
      ${state.tab === 'overview' ? overviewHtml(state, app) : ''}
      ${state.tab === 'route' ? routeHtml(state, app) : ''}
      ${state.tab === 'airports' ? airportsHtml(state, app) : ''}
      ${state.tab === 'performance' ? performanceHtml(state, app) : ''}
      ${state.tab === 'log' ? logHtml(state, app) : ''}
    </div>
  </div>`;
}

function section(title, body, iconName = '') {
  return `<section class="detail-card">
    <header class="detail-card-head">${iconName ? icon(iconName, 17) : ''}<h3>${esc(title)}</h3></header>
    <div class="detail-card-body">${body}</div>
  </section>`;
}

function kv(label, value, className = '') {
  return `<div class="kv-row ${className}"><span>${esc(label)}</span><strong>${value ?? '—'}</strong></div>`;
}

function overviewHtml(state, app) {
  const { plan, flight } = state;
  const settings = app.settings;
  const weightUnit = plan.units?.weight || 'kg';
  const w = (value) => formatWeight(value, weightUnit, settings.weightUnit);
  const origin = plan.origin;
  const destination = plan.destination;
  const departureTime = plan.times?.scheduledOut;
  const arrivalTime = plan.times?.scheduledIn;
  const routeText = plan.route?.text || '';
  const utcLine = (timestamp, timezone) => {
    if (settings.timeMode === 'utc') {
      return `${monthDayCN(dateAt(timestamp, 0, 'utc'))} · UTC · ${utcTime(timestamp)}Z`;
    }
    const utcDate = dateAt(timestamp, 0, 'utc');
    const localDate = dateAt(timestamp, timezone || 0, 'local');
    const datePrefix = utcDate === localDate ? '' : `${monthDayCN(utcDate)} `;
    return `${monthDayCN(localDate)} · ${zoneLabel(timezone, 'local')} · ${datePrefix}${utcTime(timestamp)}Z`;
  };
  return `<div class="detail-overview">
    <div class="detail-time-strip">
      <div class="time-point">
        <span class="time-point-label">${icon('takeoff', 16)} 起飞 · ${esc(origin?.iata || origin?.icao)}</span>
        <strong>${esc(timeAt(departureTime, origin?.timezoneHours || 0, settings.timeMode))}</strong>
        <span>${esc(utcLine(departureTime, origin?.timezoneHours || 0))}</span>
      </div>
      <div class="time-line">
        <span></span>
        <em>${esc(formatDuration(plan.times?.enrouteSec ? plan.times.enrouteSec / 60 : flight.enrouteMinutes, 'compact'))} 空中</em>
      </div>
      <div class="time-point is-arrival">
        <span class="time-point-label">${icon('landing', 16)} 到达 · ${esc(destination?.iata || destination?.icao)}</span>
        <strong>${esc(timeAt(arrivalTime, destination?.timezoneHours || 0, settings.timeMode))}</strong>
        <span>${esc(utcLine(arrivalTime, destination?.timezoneHours || 0))}</span>
      </div>
    </div>

    <div class="detail-columns">
      ${section(
        '航班信息',
        `<div class="kv-grid">
          ${kv('航班号', esc(plan.flightNumber || '—'))}
          ${kv('呼号', esc(plan.callsign || '—'))}
          ${kv('机型', esc(plan.aircraft?.name || plan.aircraft?.icao || '—'))}
          ${kv('注册号', esc(plan.registration || '—'))}
          ${kv('运行成本指数', esc(plan.cruise?.costIndex || '—'))}
          ${kv('SELCAL', esc(plan.aircraft?.selcal || '—'))}
          ${kv('计划生成', `${esc(utcDateTime(plan.generatedAt) || '—')}Z`)}
          ${kv('AIRAC', esc(plan.airac || '—'))}
        </div>`,
        'plane',
      )}
      ${section(
        '航路',
        `<div class="route-string" data-route-copy>${esc(routeText || '直飞')}</div>
        <div class="route-inline-actions">
          <button class="text-btn" type="button" data-detail-action="copy-route">${icon('copy', 14)} 复制航路</button>
          ${plan.links?.skyvector ? `<button class="text-btn" type="button" data-detail-link="${esc(plan.links.skyvector)}">SkyVector ${icon('external', 13)}</button>` : ''}
        </div>
        <div class="kv-grid is-compact">
          ${kv('航路距离', esc(formatDistance(plan.route?.distanceNm, settings.distanceUnit)))}
          ${kv('大圆距离', esc(formatDistance(plan.route?.gcDistanceNm, settings.distanceUnit)))}
          ${kv('SID', esc(plan.route?.sid || '—'))}
          ${kv('STAR', esc(plan.route?.star || '—'))}
        </div>
        ${plan.cruise?.stepClimbs?.length ? `<div class="step-list"><span>阶梯巡航</span>${plan.cruise.stepClimbs.map((step) => `<em>${esc(step.fix)} · FL${esc(String(step.fl))}</em>`).join('')}</div>` : ''}`,
        'route',
      )}
    </div>

    <div class="detail-columns">
      ${section(
        '燃油',
        `<div class="kv-grid">
          ${kv('停机坪', w(plan.fuel?.planRamp))}
          ${kv('起飞油量', w(plan.fuel?.planTakeoff))}
          ${kv('航段耗油', w(plan.fuel?.enrouteBurn))}
          ${kv('到达剩余', w(plan.fuel?.planLanding))}
          ${kv('备降油量', w(plan.fuel?.alternateBurn))}
          ${kv('储备油量', w(plan.fuel?.reserve))}
        </div>`,
        'fuel',
      )}
      ${section(
        '重量与载重',
        `<div class="kv-grid">
          ${kv('旅客', plan.weights?.paxCount != null ? `${esc(plan.weights.paxCount)} 人` : '—')}
          ${kv('业载', w(plan.weights?.payload))}
          ${kv('零燃油重量', w(plan.weights?.zfw))}
          ${kv('起飞重量', w(plan.weights?.tow))}
          ${kv('落地重量', w(plan.weights?.ldw))}
          ${kv('货物', w(plan.weights?.cargo))}
        </div>`,
        'gauge',
      )}
    </div>

    <div class="detail-columns">
      ${section('起飞机场天气', weatherHtml(origin), 'cloud')}
      ${section('到达机场天气', weatherHtml(destination), 'cloud')}
    </div>

    ${section(
      '机组与计划链接',
      `<div class="crew-line">
        ${plan.crew?.captain ? `<span><em>机长</em>${esc(plan.crew.captain)}</span>` : ''}
        ${plan.crew?.firstOfficer ? `<span><em>副驾驶</em>${esc(plan.crew.firstOfficer)}</span>` : ''}
        ${plan.crew?.dispatcher ? `<span><em>签派</em>${esc(plan.crew.dispatcher)}</span>` : ''}
        ${plan.crew?.purser ? `<span><em>乘务长</em>${esc(plan.crew.purser)}</span>` : ''}
      </div>
      <div class="detail-link-row">
        ${plan.links?.ofpPdf ? `<button class="btn btn-secondary btn-small" type="button" data-detail-link="${esc(plan.links.ofpPdf)}">${icon('file', 15)} OFP PDF</button>` : ''}
        ${plan.links?.msfsPln ? `<button class="btn btn-secondary btn-small" type="button" data-detail-link="${esc(plan.links.msfsPln)}">${icon('download', 15)} MSFS .pln</button>` : ''}
        ${plan.links?.routeImage ? `<button class="btn btn-secondary btn-small" type="button" data-detail-link="${esc(plan.links.routeImage)}">${icon('map', 15)} 航路图</button>` : ''}
        <button class="btn btn-secondary btn-small" type="button" data-detail-action="export-raw">${icon('download', 15)} 原始 JSON</button>
      </div>`,
      'link',
    )}

    ${plan.atc?.flightplanText ? `<details class="atc-plan"><summary>${icon('file', 15)} ATC 飞行计划文本 <span>展开</span></summary><pre>${esc(plan.atc.flightplanText)}</pre></details>` : ''}
  </div>`;
}

function weatherHtml(airport) {
  if (!airport) return '<p class="muted">没有天气信息</p>';
  return `<div class="weather-card">
    <div class="weather-head">
      <span class="weather-badge ${weatherCategoryClass(airport.metarCategory)}">${esc(airport.metarCategory || '—')}</span>
      <strong>${esc(weatherCategoryText(airport.metarCategory))}</strong>
      <span>${esc(airportCodes(airport))}</span>
    </div>
    <div class="weather-block"><span>METAR</span><pre>${esc(airport.metar || '暂无')}</pre></div>
    <div class="weather-block"><span>TAF</span><pre>${esc(airport.taf || '暂无')}</pre></div>
  </div>`;
}

function routeHtml(state, app) {
  const { plan } = state;
  const settings = app.settings;
  const weightUnit = plan.units?.weight || 'kg';
  const fixes = plan.navlog?.fixes || [];
  return `<div class="route-tab">
    <div class="route-table-meta">
      <div><span>航路</span><strong>${esc(plan.route?.text || '直飞')}</strong></div>
      <div class="route-table-actions">
        <span>${esc(formatDistance(plan.route?.distanceNm, settings.distanceUnit))} · ${fixes.length} 个航点</span>
        <button class="text-btn" type="button" data-detail-action="copy-route">${icon('copy', 14)} 复制</button>
      </div>
    </div>
    <div class="navlog-wrap">
      <table class="navlog-table">
        <thead><tr>
          <th>#</th><th>航点</th><th>航路</th><th>阶段</th><th>高度</th><th>距离</th><th>累计时间</th><th>剩余油量</th><th>风</th><th>FIR</th>
        </tr></thead>
        <tbody>${fixes
          .map((fix, index) => `<tr>
            <td class="num">${String(index + 1).padStart(2, '0')}</td>
            <td><strong>${esc(fix.ident)}</strong>${fix.name && fix.name !== fix.ident ? `<em>${esc(airportDisplayName(fix.name, ''))}</em>` : ''}</td>
            <td>${esc(fix.airway || '—')}</td>
            <td><span class="stage-badge stage-${esc((fix.stage || '').toLowerCase())}">${esc(fix.stage || '—')}</span></td>
            <td>${esc(formatAltitude(fix.altitudeFt, settings.altitudeUnit, { flightLevel: false }))}</td>
            <td>${fix.distanceNm != null ? `${formatNumber(fix.distanceNm)} nm` : '—'}</td>
            <td>${fix.timeTotalSec != null ? formatClockDuration(fix.timeTotalSec / 60) : '—'}</td>
            <td>${formatWeight(fix.fuelOnBoard, weightUnit, settings.weightUnit)}</td>
            <td>${fix.windDir != null ? `${String(Math.round(fix.windDir)).padStart(3, '0')}° / ${String(Math.round(fix.windSpd || 0)).padStart(2, '0')}` : '—'}</td>
            <td>${esc(fix.fir || '—')}</td>
          </tr>`)
          .join('')}</tbody>
      </table>
      ${!fixes.length ? '<p class="muted table-empty">这份计划没有航路点明细。</p>' : ''}
    </div>
    ${plan.atc?.flightplanText ? `<details class="atc-plan"><summary>${icon('file', 15)} ATC 飞行计划文本 <span>展开</span></summary><pre>${esc(plan.atc.flightplanText)}</pre></details>` : ''}
  </div>`;
}

function airportsHtml(state, app) {
  const { plan } = state;
  const airports = [
    { airport: plan.origin, role: '起飞机场' },
    { airport: plan.destination, role: '到达机场' },
    ...(plan.alternates || []).map((airport) => ({ airport, role: '备降机场' })),
    ...(plan.enrouteAlternates || []).map((airport) => ({ airport, role: '航路备降' })),
    ...(plan.takeoffAlternate ? [{ airport: plan.takeoffAlternate, role: '起飞备降' }] : []),
  ].filter((item) => item.airport);
  return `<div class="airports-tab">
    ${airports
      .map(
        ({ airport, role }) => `<article class="airport-card">
          <header>
            <div class="airport-card-codes"><span>${esc(airportCodePrimary(airport))}</span><em>${esc(airport.iata || '—')}</em></div>
            <span class="airport-role">${esc(role)}</span>
            <button class="text-btn" type="button" data-detail-action="airport" data-icao="${esc(airport.icao)}">机场详情 ${icon('arrowRight', 13)}</button>
          </header>
          <h3>${esc(airportDisplayName(airport.name, '—'))}</h3>
          <div class="airport-info-grid">
            <div><span>海拔</span><strong>${esc(formatAltitude(airport.elevationFt, app.settings.altitudeUnit))}</strong></div>
            <div><span>计划跑道</span><strong>${esc(airport.runway || '—')}</strong></div>
            <div><span>时区</span><strong>${esc(zoneLabel(airport.timezoneHours, 'local'))}</strong></div>
            <div><span>坐标</span><strong>${esc(formatCoords(airport.lat, airport.lon))}</strong></div>
          </div>
          ${weatherHtml(airport)}
        </article>`,
      )
      .join('')}
  </div>`;
}

function performanceHtml(state, app) {
  const { plan } = state;
  const settings = app.settings;
  const weightUnit = plan.units?.weight || 'kg';
  const tlr = plan.tlr;
  if (!tlr?.takeoff && !tlr?.landing) {
    return `<div class="detail-empty">${icon('gauge', 30)}<h3>这份计划没有性能数据</h3><p>SimBrief 生成计划时未包含起飞/着陆性能计算。</p></div>`;
  }
  const takeoff = tlr.takeoff;
  const landing = tlr.landing;
  const impacts = plan.impacts || [];
  return `<div class="performance-tab">
    <div class="detail-columns">
      ${section(
        '起飞性能',
        takeoff
          ? `${performanceTable([
              ['机场 / 跑道', `${takeoff.airport || '—'} / ${takeoff.row?.identifier || takeoff.runway || '—'}`],
              ['计划起飞重量', formatWeight(takeoff.weight, weightUnit, settings.weightUnit)],
              ['形态 / 推力', `${takeoff.row?.flap || '—'} / ${takeoff.row?.thrust || '—'}`],
              ['FLEX 温度', takeoff.row?.flexTempC != null ? `${takeoff.row.flexTempC} °C` : '—'],
              ['V1 / VR / V2', `${takeoff.row?.v1 ?? '—'} / ${takeoff.row?.vr ?? '—'} / ${takeoff.row?.v2 ?? '—'} kt`],
              ['加速停止距离', takeoff.row?.distanceRejectFt != null ? `${formatNumber(takeoff.row.distanceRejectFt)} ft` : '—'],
              ['风 / 温度', `${takeoff.windDirection ?? '—'}° / ${takeoff.windSpeed ?? '—'} kt · ${takeoff.temperatureC ?? '—'} °C`],
            ])}`
          : '<p class="muted">没有起飞性能数据</p>',
        'takeoff',
      )}
      ${section(
        '着陆性能',
        landing
          ? `${performanceTable([
              ['机场 / 跑道', `${landing.airport || '—'} / ${landing.row?.identifier || landing.runway || '—'}`],
              ['计划着陆重量', formatWeight(landing.weight, weightUnit, settings.weightUnit)],
              ['形态', landing.flap || landing.distanceDry?.flap || '—'],
              ['VREF', landing.distanceDry?.vref != null ? `${landing.distanceDry.vref} kt` : '—'],
              ['干跑道距离', landing.distanceDry?.actualFt != null ? `${formatNumber(landing.distanceDry.actualFt)} ft` : '—'],
              ['湿跑道距离', landing.distanceWet?.actualFt != null ? `${formatNumber(landing.distanceWet.actualFt)} ft` : '—'],
              ['风 / 温度', `${landing.windDirection ?? '—'}° / ${landing.windSpeed ?? '—'} kt · ${landing.temperatureC ?? '—'} °C`],
            ])}`
          : '<p class="muted">没有着陆性能数据</p>',
        'landing',
      )}
    </div>
    ${section(
      '高度与成本指数影响',
      impacts.length
        ? `<div class="impact-table-wrap"><table class="impact-table">
            <thead><tr><th>情景</th><th>巡航高度</th><th>航长时间</th><th>时间差</th><th>航段耗油</th><th>油量差</th></tr></thead>
            <tbody>${impacts
              .map(
                (item) => `<tr>
                  <td>${esc(item.label)}</td>
                  <td>${item.initialFl != null ? `FL${esc(item.initialFl)}` : '—'}</td>
                  <td>${item.timeEnrouteSec != null ? formatDuration(item.timeEnrouteSec / 60, 'compact') : '—'}</td>
                  <td class="${Number(item.timeDifferenceSec) > 0 ? 'is-worse' : 'is-better'}">${signedDuration(item.timeDifferenceSec)}</td>
                  <td>${formatWeight(item.enrouteBurn, weightUnit, settings.weightUnit)}</td>
                  <td class="${Number(item.burnDifference) > 0 ? 'is-worse' : 'is-better'}">${signedWeight(item.burnDifference, weightUnit, settings.weightUnit)}</td>
                </tr>`,
              )
              .join('')}</tbody>
          </table></div>`
        : '<p class="muted">没有影响分析数据</p>',
      'gauge',
    )}
    ${section(
      '重量限制',
      `<div class="kv-grid">
        ${kv('最大零燃油重量', formatWeight(plan.weights?.maxZfw, weightUnit, settings.weightUnit))}
        ${kv('最大起飞重量', formatWeight(plan.weights?.maxTow, weightUnit, settings.weightUnit))}
        ${kv('最大落地重量', formatWeight(plan.weights?.maxLdw, weightUnit, settings.weightUnit))}
        ${kv('计划零燃油重量', formatWeight(plan.weights?.zfw, weightUnit, settings.weightUnit))}
      </div>`,
      'shield',
    )}
  </div>`;
}

function performanceTable(rows) {
  return `<div class="performance-table">${rows.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
}

function signedDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0m';
  return `${value > 0 ? '+' : '−'}${formatDuration(Math.abs(value) / 60, 'compact')}`;
}

function signedWeight(value, sourceUnit, displayUnit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const text = formatWeight(Math.abs(number), sourceUnit, displayUnit);
  return `${number >= 0 ? '+' : '−'}${text}`;
}

function logHtml(state, app) {
  const { flight, plan } = state;
  const session = app.findSession(flight.sessionId);
  const sessions = app.sessionsSorted();
  const actual = flight.actual || {};
  return `<div class="log-tab">
    <div class="log-form-grid">
      <section class="detail-card">
        <header class="detail-card-head">${icon('book', 17)}<h3>飞行日志</h3></header>
        <div class="detail-card-body">
          <form class="log-form" data-log-form>
            <label class="field-label">状态</label>
            <div class="segmented">
              <button type="button" class="${flight.status !== 'flown' ? 'is-active' : ''}" data-log-status="planned">计划中</button>
              <button type="button" class="${flight.status === 'flown' ? 'is-active' : ''}" data-log-status="flown">已飞</button>
            </div>
            <input type="hidden" name="status" value="${flight.status === 'flown' ? 'flown' : 'planned'}" />
            <div class="field-grid">
              <label><span class="field-label">实际日期</span><input class="field-input" type="date" name="actualDate" value="${esc(actual.date || flight.scheduledDate || '')}" /></label>
              <label><span class="field-label">实际轮挡（分钟）</span><input class="field-input" type="number" min="0" max="10080" step="1" name="actualBlockMinutes" value="${actual.blockMinutes ?? flight.blockMinutes ?? ''}" /></label>
            </div>
            <label><span class="field-label">所属游戏会话</span>
              <select class="field-input" name="sessionId">${sessions
                .map((item) => `<option value="${esc(item.id)}" ${item.id === flight.sessionId ? 'selected' : ''}>${esc(item.name)} · ${app.flightsForSession(item.id).length} 段</option>`)
                .join('')}</select>
            </label>
            <label><span class="field-label">备注</span><textarea class="field-input field-textarea" name="notes" maxlength="5000" rows="5" placeholder="今天的天气、进近、落地感受…">${esc(actual.notes || '')}</textarea></label>
            <div class="log-form-actions">
              <button class="btn btn-primary" type="submit" data-action="save-log" ${state.saving ? 'disabled' : ''}>${state.saving ? icon('loading', 15) + ' 保存中…' : '保存日志'}</button>
              <button class="btn btn-ghost" type="button" data-detail-action="close">取消</button>
            </div>
          </form>
        </div>
      </section>
      <aside class="detail-card">
        <header class="detail-card-head">${icon('info', 17)}<h3>记录信息</h3></header>
        <div class="detail-card-body">
          <div class="kv-grid">
            ${kv('当前游戏', esc(session?.name || '—'))}
            ${kv('创建时间', esc(isoDateTime(flight.createdAt) || '—'))}
            ${kv('最后更新', esc(isoDateTime(flight.updatedAt) || '—'))}
            ${kv('计划状态', statusText(flight.status))}
          </div>
          <div class="log-note">${icon('shield', 15)} 备注只保存在本机。把这一次飞行的感受写下来，下次回看时会更有意思。</div>
          <button class="btn btn-danger-soft btn-block" type="button" data-detail-action="delete">${icon('trash', 15)} 删除这个航段</button>
        </div>
      </aside>
    </div>
  </div>`;
}
