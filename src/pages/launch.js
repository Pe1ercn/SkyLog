import { icon } from '../lib/icons.js';
import { esc, formatDistance, formatDuration, statusClass, statusText } from '../lib/format.js';
import { getLanguage, t } from '../lib/i18n.js';

const FAMILIES = [
  { id: 'msfs', name: 'Microsoft Flight Simulator', short: 'MSFS', variants: '2020 / 2024', mark: 'MSFS' },
  { id: 'xplane', name: 'X-Plane', short: 'X-Plane', variants: '11 / 12', mark: 'XP' },
];

function flightCode(flight) {
  return flight?.callsign || flight?.flightNumber || '—';
}

function airportCode(airport) {
  return airport?.iata || airport?.icao || '—';
}

function dateLabel(flight) {
  const raw = flight?.actualIn || flight?.actualOut || flight?.scheduledIn || flight?.scheduledOut || flight?.createdAt;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(getLanguage() === 'en' ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: '2-digit',
  }).toUpperCase();
}

function yearLabel(flight) {
  const raw = flight?.actualIn || flight?.actualOut || flight?.scheduledOut || flight?.createdAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getFullYear() : '—';
}

export class LaunchPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.selectedFamily = null;
    this.bound = false;
    this.familyPinned = false;
  }

  mount() {
    this.update();
  }

  show() {
    this.update();
  }

  familyGames(family) {
    return (this.app.games || []).filter((game) => game.family === family);
  }

  activeGame() {
    const family = this.selectedFamily;
    const selected = this.app.selectedGame;
    if (selected?.family === family && this.familyGames(family).some((game) => game.target === selected.target)) {
      return selected;
    }
    return this.familyGames(family)[0] || null;
  }

  recentFlights() {
    return [...(this.app.library?.flights || [])]
      .sort((a, b) => new Date(b.actualIn || b.scheduledIn || b.createdAt || 0) - new Date(a.actualIn || a.scheduledIn || a.createdAt || 0))
      .slice(0, 8);
  }

  gameSubtitle(game) {
    if (!game) return t('等待游戏检测', 'Waiting for game detection');
    if (game.source === 'steam') return t('Steam 库', 'Steam library');
    if (game.kind === 'appx') return t('Microsoft Store', 'Microsoft Store');
    if (game.source === 'registry') return t('安装记录', 'Registry');
    return t('本机安装', 'Local install');
  }

  update() {
    if (!this.app.library) return;
    const games = this.app.games || [];
    if (!this.selectedFamily) {
      this.selectedFamily = this.app.selectedGame?.family || games[0]?.family || 'msfs';
    }
    if (!this.familyPinned && games.length && !this.familyGames(this.selectedFamily).length) {
      this.selectedFamily = this.app.selectedGame?.family || games[0]?.family || this.selectedFamily;
    }
    this.root.innerHTML = this.html();
    this.bind();
  }

  html() {
    const family = this.selectedFamily || 'msfs';
    const active = this.activeGame();
    const games = this.familyGames(family);
    const flights = this.recentFlights();
    const allFlights = this.app.library?.flights || [];
    const totalMinutes = allFlights.reduce((sum, item) => sum + (Number(item.blockMinutes) || 0), 0);
    const totalDistance = allFlights.reduce((sum, item) => sum + (Number(item.distanceNm) || 0), 0);
    const live = this.app.liveTelemetry;
    const telemetry = this.app.telemetryStatus?.[family] || {};
    const nextFlight = this.app.activeFlight() || flights.find((item) => item.status !== 'flown') || null;
    const familyOptions = FAMILIES.map((item) => {
      const count = this.familyGames(item.id).length;
      return `<button class="home-sim-tab ${family === item.id ? 'is-active' : ''}" type="button" data-home-family="${item.id}">
        <span class="home-sim-mark">${item.mark}</span>
        <span><b>${item.short}</b><small>${item.variants} · ${count || '—'}</small></span>
      </button>`;
    }).join('');

    return `<div class="cockpit-home">
      <header class="home-hero">
        <div>
          <div class="home-eyebrow">${icon('home', 12)} HOME / FLIGHT DECK</div>
          <h1>${t('从地面开始，', 'From the ground,')}<span>${t('继续你的航迹。', 'keep your track going.')}</span></h1>
          <p>${t('准备好下一次起飞，或从历史航迹里找回一段天空。', 'Prepare the next departure, or revisit a piece of sky from your archive.')}</p>
        </div>
        <div class="home-hero-stats">
          <div><small>THIS WEEK</small><strong>${String(allFlights.length ? Math.min(9, allFlights.length) : 0).padStart(2, '0')}<em>${t('航段', 'sorties')}</em></strong></div>
          <div><small>AIRBORNE</small><strong>${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}<em>h</em></strong></div>
        </div>
      </header>

      <div class="home-layout">
        <section class="home-launch-card">
          <div class="home-card-head">
            <span>SIMULATOR / LAUNCH</span>
            <span class="home-link-status ${telemetry.connected ? 'is-on' : ''}"><i></i>${telemetry.connected ? 'SIMCONNECT' : 'STANDBY'}</span>
          </div>

          <div class="home-sim-tabs">${familyOptions}</div>

          ${active ? `
            <div class="home-game-title">${esc(active.title)}</div>
            <div class="home-game-sub"><i></i>${esc(this.gameSubtitle(active))} <span>·</span> ${t('已检测', 'detected')}</div>

            <div class="launch-radar">
              <div class="launch-radar-rings"></div>
              <div class="launch-radar-sweep"></div>
              <div class="launch-radar-label">SIMCONNECT / READY</div>
              <div class="launch-radar-meta"><b>${family === 'msfs' ? 'MSFS 2024' : 'X-PLANE 12'}</b><span>${telemetry.connected ? t('实时数据已连接', 'LIVE DATA LINK') : t('等待模拟器', 'WAITING FOR SIM')}</span></div>
              <div class="launch-plane">${icon('navigation', 44)}</div>
              <div class="launch-radar-bottom">
                <span>${live.active ? t('正在记录本段航程', 'RECORDING THIS FLIGHT') : t('准备起飞', 'READY FOR DEPARTURE')}</span>
                <small>${active.source === 'steam' ? 'STEAM / ' : ''}${esc(active.path ? 'LOCAL' : 'SIM')}</small>
              </div>
            </div>

            <div class="home-metrics">
              <div><small>DATA LINK</small><strong class="${telemetry.connected ? 'is-good' : ''}"><i></i>${telemetry.connected ? t('已连接', 'CONNECTED') : t('待连接', 'WAITING')}</strong></div>
              <div><small>FLIGHT PLAN</small><strong>${nextFlight ? '1 ACTIVE' : '—'}</strong></div>
              <div><small>HISTORY</small><strong>${allFlights.length} <em>legs</em></strong></div>
            </div>

            ${nextFlight ? `<div class="home-next">
              <div class="home-next-head"><span>UP NEXT / ${t('待飞航段', 'NEXT SECTOR')}</span><b>${esc(statusText(nextFlight.status))}</b></div>
              <div class="home-next-route"><code>${esc(airportCode(nextFlight.origin))}</code><span></span><code>${esc(airportCode(nextFlight.destination))}</code></div>
              <div class="home-next-meta">${esc(flightCode(nextFlight))} <span>·</span> ${esc(nextFlight.aircraft?.name || nextFlight.aircraft?.icao || '—')} <span>·</span> ${esc(formatDuration(nextFlight.blockMinutes, 'compact'))}</div>
            </div>` : ''}

            <div class="home-preflight">
              <div class="home-preflight-head"><span>PRE-FLIGHT CHECK</span><b>${telemetry.connected ? 'READY' : 'STANDBY'}</b></div>
              <div class="home-preflight-row"><i>✓</i><span>${t('SimBrief 计划', 'SimBrief plan')}</span><em>${nextFlight ? esc(flightCode(nextFlight)) : t('未导入', 'not imported')}</em><strong>${nextFlight ? 'SYNCED' : '—'}</strong></div>
              <div class="home-preflight-row"><i>✓</i><span>${t('自动安装遥测', 'Telemetry components')}</span><em>${this.app.settings.autoInstallBridges === false ? t('已关闭', 'disabled') : t('启动时检查', 'checked at launch')}</em><strong>${this.app.settings.autoInstallBridges === false ? 'OFF' : 'ON'}</strong></div>
              <div class="home-preflight-row"><i>${telemetry.connected ? '✓' : '·'}</i><span>${t('SimConnect / UDP', 'SimConnect / UDP')}</span><em>${telemetry.connected ? t('已连接', 'connected') : t('等待游戏', 'waiting for sim')}</em><strong>${telemetry.connected ? 'LIVE' : 'WAIT'}</strong></div>
            </div>

            <div class="home-launch-actions">
              <button class="home-launch-btn" type="button" data-home-action="launch">
                <span class="home-play">${icon('play', 18)}</span>
                <span><b>${t('启动模拟飞行', 'Launch simulator')}</b><small>LAUNCH ${esc(active.title).toUpperCase()}</small></span>
                <span class="home-launch-arrow">↗</span>
              </button>
              <div class="home-quick-actions">
                <button type="button" data-home-action="import">${icon('download', 13)} ${t('导入 SimBrief', 'Import SimBrief')}</button>
                <button type="button" data-home-action="create">${icon('plus', 13)} ${t('新建计划', 'New plan')}</button>
              </div>
            </div>
          ` : `<div class="home-game-empty">
            <span class="home-empty-icon">${icon('gamepad', 28)}</span>
            <h2>${t('尚未检测到模拟器', 'No simulator detected')}</h2>
            <p>${t('扫描游戏本体后，即可从首页启动并自动连接飞行数据。', 'Scan for your simulator to launch it and connect live flight data from Home.')}</p>
            <div class="home-empty-actions">
              <button class="btn btn-primary" type="button" data-home-action="scan">${icon('scan', 14)} ${t('全盘搜索', 'Scan drives')}</button>
              <button class="btn btn-secondary" type="button" data-home-action="pick">${icon('folder', 14)} ${t('手动选择', 'Choose manually')}</button>
            </div>
          </div>`}
        </section>

        <section class="home-history-card">
          <div class="home-history-head">
            <div>
              <div class="home-eyebrow">${icon('archive', 12)} FLIGHT ARCHIVE</div>
              <h2>${t('历史航迹', 'Flight history')}</h2>
              <p>${t('最近完成的航段，按落地时间排序', 'Recent completed sectors, newest first')}</p>
            </div>
            <button class="home-text-link" type="button" data-home-action="log">${t('查看全部', 'View all')} <span>↗</span></button>
          </div>

          <div class="home-totals">
            <div><small>${t('航段', 'SECTORS')} <em>ALL TIME</em></small><strong>${allFlights.length}<span>${t('段', 'legs')}</span></strong></div>
            <div><small>${t('飞行时间', 'BLOCK TIME')} <em>LOGGED</em></small><strong>${Math.floor(totalMinutes / 60)}<span>h</span> ${String(totalMinutes % 60).padStart(2, '0')}<span>m</span></strong></div>
            <div><small>${t('累计航程', 'DISTANCE')} <em>NM</em></small><strong>${Math.round(totalDistance).toLocaleString('en-US')}<span>nm</span></strong></div>
          </div>

          <div class="home-list-head"><span>DATE</span><span>FLIGHT / AIRCRAFT</span><span>ROUTE</span><span>BLOCK</span><span>DIST</span><span>STATUS</span><span></span></div>
          <div class="home-flight-list">
            ${flights.length ? flights.map((flight) => {
              const status = flight.status === 'flown' ? '已完成' : statusText(flight.status);
              return `<button class="home-flight-row" type="button" data-flight-id="${esc(flight.id)}">
                <span class="home-flight-date">${esc(dateLabel(flight))}<small>${yearLabel(flight)}</small></span>
                <span class="home-flight-ident"><b>${esc(flightCode(flight))}</b><small>${esc(flight.aircraft?.name || flight.aircraft?.icao || '—')}</small></span>
                <span class="home-flight-route"><code>${esc(airportCode(flight.origin))}</code><i></i><em></em><i></i><code>${esc(airportCode(flight.destination))}</code></span>
                <span class="home-flight-block">${esc(formatDuration(flight.blockMinutes, 'compact'))}</span>
                <span class="home-flight-dist">${esc(formatDistance(flight.distanceNm, 'nm'))}</span>
                <span class="home-flight-status ${statusClass(flight.status)}"><i></i>${esc(status)}</span>
                <span class="home-flight-arrow">›</span>
              </button>`;
            }).join('') : `<div class="home-empty-history">
              <span>${icon('archive', 22)}</span>
              <strong>${t('还没有历史航段', 'No flight history yet')}</strong>
              <p>${t('导入第一份 SimBrief 计划，开始留下航迹。', 'Import your first SimBrief plan to start a track.')}</p>
              <button class="btn btn-secondary" type="button" data-home-action="import">${icon('plus', 14)} ${t('导入计划', 'Import a plan')}</button>
            </div>`}
          </div>

          <div class="home-history-foot"><span><i></i> ${t('数据保存在本机，不与云端同步', 'Stored locally, never synced to the cloud')}</span><b>${allFlights.length} SECTORS · SKYLOG 1.3.0</b></div>
        </section>
      </div>
    </div>`;
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener('click', async (event) => {
      const familyButton = event.target.closest('[data-home-family]');
      if (familyButton) {
        this.familyPinned = true;
        this.selectedFamily = familyButton.dataset.homeFamily;
        this.update();
        return;
      }
      const flightButton = event.target.closest('[data-flight-id]');
      if (flightButton) {
        this.app.openFlightDetail(flightButton.dataset.flightId);
        return;
      }
      const action = event.target.closest('[data-home-action]')?.dataset.homeAction;
      if (!action) return;
      if (action === 'launch') await this.app.launchGame(this.activeGame());
      else if (action === 'import') this.app.openImport();
      else if (action === 'create') this.app.openCreate();
      else if (action === 'log') this.app.navigate('log');
      else if (action === 'scan') await this.app.scanAllGames({ force: true });
      else if (action === 'pick') await this.app.pickGame();
    });
  }
}
