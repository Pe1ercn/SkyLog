import { icon } from '../lib/icons.js';
import {
  airportCodePrimary,
  airportCodes,
  airportDisplayName,
  dateCN,
  esc,
  formatDistance,
  formatDuration,
  hourGreeting,
  monthDayCN,
  relativeDay,
  statusClass,
  statusText,
  weekdayCN,
} from '../lib/format.js';
import { sessionColor } from '../lib/palette.js';

export class HomePage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.counterFrame = null;
  }

  mount() {
    this.update();
  }

  show() {
    this.update();
  }

  update() {
    if (!this.app.library) return;
    this.root.innerHTML = this.html();
    this.bind();
    this.animateCounters();
  }

  html() {
    const app = this.app;
    const stats = app.stats();
    const hero = app.latestFlight();
    const sessions = app
      .sessionsSorted()
      .filter((session) => app.flightsForSession(session.id).length > 0)
      .slice(0, 3);
    return `
      <div class="home-page">
        <header class="page-head home-head">
          <div>
            <p class="eyebrow">FLIGHT JOURNAL · ${esc(new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }))}</p>
            <h1>${esc(hourGreeting())}，欢迎回来</h1>
            <p class="page-sub">把每一次起飞，都留在地图上。${stats.flights ? ` 已经记录了 ${stats.flights} 段航程。` : ''}</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-secondary" type="button" data-action="open-map">${icon('map', 17)}<span>打开地图</span></button>
            <button class="btn btn-secondary" type="button" data-action="create-simbrief">${icon('sparkles', 17)}<span>创建计划</span></button>
            <button class="btn btn-primary" type="button" data-action="import">${icon('plus', 17)}<span>导入 SimBrief</span></button>
          </div>
        </header>

        ${hero ? this.heroHtml(hero) : this.emptyHeroHtml()}

        <section class="stat-grid" aria-label="飞行统计">
          ${this.statCard('航段', stats.flights, 'route', '段', '已保存的飞行计划')}
          ${this.statCard('游戏会话', stats.sessions, 'layers', '次', '同一次游戏可包含多段')}
          ${this.statCard('已飞航段', stats.flown, 'checkCircle', '段', stats.planned ? `${stats.planned} 段仍在计划中` : '全部完成')}
          ${this.distanceStatCard(stats.totalDistanceNm, stats.totalMinutes)}
        </section>

        <div class="home-columns">
          <section class="panel recent-panel">
            <div class="panel-head">
              <div>
                <h2>最近游戏</h2>
                <p>按时间排列的模拟飞行会话</p>
              </div>
              <button class="text-btn" type="button" data-route="log">全部日志 ${icon('arrowRight', 15)}</button>
            </div>
            ${
              sessions.length
                ? `<div class="session-mini-list">${sessions.map((session) => this.sessionMini(session)).join('')}</div>`
                : `<div class="mini-empty">${icon('book', 22)}<span>导入第一份计划后，游戏会话会出现在这里。</span></div>`
            }
            ${sessions.length ? this.recentInsight(stats) : ''}
          </section>

          <aside class="panel quick-panel">
            <div class="panel-head">
              <div>
                <h2>快速开始</h2>
                <p>三步记录一段航程</p>
              </div>
            </div>
            <ol class="quick-steps">
              <li>
                <span class="quick-index">01</span>
                <div><strong>读取 SimBrief</strong><p>输入 Pilot ID，自动读取最新 OFP。</p></div>
              </li>
              <li>
                <span class="quick-index">02</span>
                <div><strong>选择游戏会话</strong><p>同一次游戏的多段起降，放进同一个会话。</p></div>
              </li>
              <li>
                <span class="quick-index">03</span>
                <div><strong>在地图上回看</strong><p>航路、机场与每个航点，都留在日志里。</p></div>
              </li>
            </ol>
            <div class="local-note">
              ${icon('shield', 16)}
              <span>所有日志只保存在这台电脑，不会上传。</span>
            </div>
          </aside>
        </div>
      </div>`;
  }

  statCard(label, value, iconName, unit, hint) {
    return `<article class="stat-card">
      <span class="stat-icon">${icon(iconName, 18)}</span>
      <div class="stat-copy">
        <span class="stat-label">${esc(label)}</span>
        <strong><span class="stat-value" data-count="${Number(value) || 0}">0</span><em>${esc(unit)}</em></strong>
        <span class="stat-hint">${esc(hint)}</span>
      </div>
    </article>`;
  }

  distanceStatCard(distanceNm, minutes) {
    const metric = this.app.settings.distanceUnit === 'km';
    const value = metric ? distanceNm * 1.852 : distanceNm;
    const unit = metric ? 'km' : 'nm';
    return `<article class="stat-card stat-card-wide">
      <span class="stat-icon">${icon('globe', 18)}</span>
      <div class="stat-copy">
        <span class="stat-label">总航程</span>
        <strong><span class="stat-value" data-count="${Math.round(value)}">0</span><em>${unit}</em></strong>
        <span class="stat-hint">计划飞行 ${esc(formatDuration(minutes, 'compact'))}</span>
      </div>
    </article>`;
  }

  heroHtml(flight) {
    const origin = flight.origin;
    const destination = flight.destination;
    const departureDate = flight.scheduledDate || '';
    const relative = relativeDay(flight.scheduledOut, origin?.timezoneHours || 0);
    return `<section class="hero-card">
      <div class="hero-glow"></div>
      <div class="hero-main">
        <div class="hero-topline">
          <span class="status-chip ${statusClass(flight.status)}"><i></i>${statusText(flight.status)}</span>
          <span class="hero-flightno">${esc(flight.flightNumber || flight.callsign || '未命名')}</span>
          <span class="hero-aircraft">${esc(flight.aircraft?.name || flight.aircraft?.icao || '')}${flight.registration && flight.registration !== (flight.flightNumber || flight.callsign) ? ` · ${esc(flight.registration)}` : ''}</span>
        </div>
        <div class="hero-route">
          <div class="hero-airport">
            <span class="airport-code">${esc(airportCodePrimary(origin))}</span>
            <span class="airport-iata">${esc(origin?.iata || '—')}</span>
            <span class="airport-name">${esc(airportDisplayName(origin?.name, '起飞机场'))}</span>
          </div>
          <div class="hero-path" aria-hidden="true">
            <span class="hero-line"></span>
            <span class="hero-plane">${icon('plane', 18)}</span>
          </div>
          <div class="hero-airport is-arrival">
            <span class="airport-code">${esc(airportCodePrimary(destination))}</span>
            <span class="airport-iata">${esc(destination?.iata || '—')}</span>
            <span class="airport-name">${esc(airportDisplayName(destination?.name, '到达机场'))}</span>
          </div>
        </div>
        <div class="hero-meta">
          <span>${icon('calendar', 15)} ${esc(relative ? `${relative} · ` : '')}${esc(monthDayCN(departureDate))} ${esc(weekdayCN(departureDate))}</span>
          <span>${icon('clock', 15)} ${esc(formatDuration(flight.blockMinutes, 'compact'))}</span>
          <span>${icon('route', 15)} ${esc(formatDistance(flight.distanceNm, this.app.settings.distanceUnit))}</span>
          <span>${icon('layers', 15)} ${esc(flight.waypointCount || 0)} 个航点</span>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-action="open-flight" data-id="${esc(flight.id)}">${icon('file', 16)}<span>查看详情</span></button>
          <button class="btn btn-secondary" type="button" data-action="open-map" data-id="${esc(flight.id)}">${icon('map', 16)}<span>在地图打开</span></button>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <svg class="hero-svg" viewBox="0 0 420 250" fill="none">
          <defs>
            <linearGradient id="heroTrail" x1="40" y1="210" x2="370" y2="55" gradientUnits="userSpaceOnUse">
              <stop stop-color="#8fbcff" stop-opacity="0"/>
              <stop offset=".35" stop-color="#5c95ff" stop-opacity=".65"/>
              <stop offset="1" stop-color="#2f6df6"/>
            </linearGradient>
          </defs>
          <path class="hero-grid" d="M20 60H400M20 120H400M20 180H400M90 20V230M180 20V230M270 20V230M360 20V230" stroke="#2f6df6" stroke-opacity=".08"/>
          <path class="hero-trail" d="M45 212C105 205 132 94 228 95c64 0 88-40 148-52" stroke="url(#heroTrail)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="7 8"/>
          <circle cx="45" cy="212" r="7" fill="#fff" stroke="#2f6df6" stroke-width="3"/>
          <circle cx="376" cy="43" r="7" fill="#2f6df6" stroke="#fff" stroke-width="3"/>
          <circle cx="228" cy="95" r="3.5" fill="#fff" stroke="#2f6df6" stroke-width="2"/>
          <circle cx="158" cy="115" r="3" fill="#fff" stroke="#8fb8ff" stroke-width="2"/>
        </svg>
        <div class="hero-visual-label">
          <span>${esc(origin?.iata || '—')} <i></i> ${esc(destination?.iata || '—')}</span>
          <em>${esc(departureDate ? dateCN(departureDate) : '计划日期待定')}</em>
        </div>
      </div>
    </section>`;
  }

  emptyHeroHtml() {
    return `<section class="hero-card hero-empty">
      <div class="hero-empty-copy">
        <span class="hero-kicker">${icon('sparkles', 16)} 第一段航程</span>
        <h2>从一份 SimBrief 计划开始</h2>
        <p>输入你的 SimBrief Pilot ID，SkyLog 会自动读取最新飞行计划，把起降机场、巡航高度、航路和每一个航点画到世界地图上。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-action="import">${icon('plus', 16)}<span>导入第一份计划</span></button>
          <button class="btn btn-secondary" type="button" data-action="open-map">${icon('globe', 16)}<span>先看看地图</span></button>
        </div>
      </div>
      <div class="hero-empty-art" aria-hidden="true">
        <svg viewBox="0 0 300 220" fill="none">
          <circle cx="150" cy="110" r="88" stroke="#2f6df6" stroke-opacity=".12"/>
          <circle cx="150" cy="110" r="62" stroke="#2f6df6" stroke-opacity=".18" stroke-dasharray="3 7"/>
          <path d="M54 164c36-18 60-70 98-70 33 0 50 26 92 12" stroke="#2f6df6" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 7"/>
          <circle cx="54" cy="164" r="5" fill="#fff" stroke="#2f6df6" stroke-width="2.5"/>
          <circle cx="244" cy="106" r="5" fill="#2f6df6" stroke="#fff" stroke-width="2.5"/>
          <g transform="translate(196 28) rotate(18)"><path d="M0 20 58-8 31 20 46 24 22 27Z" fill="#2f6df6"/></g>
        </svg>
        <span>YOUR FIRST FLIGHT</span>
      </div>
    </section>`;
  }

  sessionMini(session) {
    const summary = this.app.sessionSummary(session.id);
    const color = sessionColor(session.colorIndex);
    const dateLabel = summary.flights[0]?.scheduledDate
      ? `${monthDayCN(summary.flights[0].scheduledDate)}`
      : '日期待定';
    return `<button class="session-mini" type="button" data-action="open-log" data-session="${esc(session.id)}">
      <span class="session-color" style="--session-color:${color}"></span>
      <span class="session-mini-main">
        <strong>${esc(session.name)}</strong>
        <span>${esc(dateLabel)} · ${summary.flights.length} 段 · ${esc(formatDistance(summary.distanceNm, this.app.settings.distanceUnit))}</span>
      </span>
      <span class="session-mini-side">
        <em>${summary.flown}/${summary.flights.length} 已飞</em>
        ${icon('chevronRight', 17)}
      </span>
    </button>`;
  }

  recentInsight(stats) {
    const planned = this.app.flights
      .filter((flight) => flight.status === 'planned')
      .sort((a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0))[0];
    const percent = stats.flights ? Math.round((stats.flown / stats.flights) * 100) : 0;
    return `<div class="recent-insight">
      <div class="recent-insight-top">
        <span>${icon(planned ? 'plane' : 'checkCircle', 15)} ${planned ? '下一段计划' : '全部航段已完成'}</span>
        <em>${stats.flown} / ${stats.flights} 已飞</em>
      </div>
      <div class="recent-progress"><i style="width:${percent}%"></i></div>
      ${planned
        ? `<div class="recent-next">
            <strong>${esc(planned.flightNumber || planned.callsign)}</strong>
            <span>${esc(planned.origin?.iata || planned.origin?.icao)} → ${esc(planned.destination?.iata || planned.destination?.icao)}</span>
            <em>${esc(monthDayCN(planned.scheduledDate))}</em>
          </div>`
        : `<p class="recent-done">每一段航程都已经落到日志里。</p>`}
    </div>`;
  }

  bind() {
    this.root.querySelectorAll('[data-action="import"]').forEach((button) => {
      button.addEventListener('click', () => this.app.openImport());
    });
    this.root.querySelectorAll('[data-action="open-map"]').forEach((button) => {
      button.addEventListener('click', () => this.app.goMap(button.dataset.id || undefined));
    });
    this.root.querySelectorAll('[data-action="open-flight"]').forEach((button) => {
      button.addEventListener('click', () => this.app.openFlightDetail(button.dataset.id));
    });
    this.root.querySelectorAll('[data-action="open-log"]').forEach((button) => {
      button.addEventListener('click', () => {
        this.app.state.logFocusSession = button.dataset.session || null;
        this.app.navigate('log');
      });
    });
  }

  animateCounters() {
    if (this.app.settings.animations === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.root.querySelectorAll('[data-count]').forEach((element) => {
        element.textContent = Number(element.dataset.count || 0).toLocaleString('zh-CN');
      });
      return;
    }
    this.root.querySelectorAll('[data-count]').forEach((element) => {
      const target = Number(element.dataset.count || 0);
      const start = performance.now();
      const duration = 800;
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        element.textContent = Math.round(target * eased).toLocaleString('zh-CN');
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
}
