import { api, hasBridge } from './lib/api.js';
import { icon, brandMark } from './lib/icons.js';
import {
  confirmDialog,
  errorMessage,
  toast,
} from './ui/components.js';
import { HomePage } from './pages/home.js';
import { MapPage } from './pages/map.js';
import { LogPage } from './pages/log.js';
import { SettingsPage } from './pages/settings.js';
import { openImportModal } from './ui/import-modal.js';
import { openFlightDetail } from './ui/flight-detail.js';
import { openAirportDetail } from './ui/airport-detail.js';
import { esc, formatDuration } from './lib/format.js';

const ROUTES = ['home', 'map', 'log', 'settings'];
const PAGE_META = {
  home: { title: '概览', subtitle: '把每一次起飞，都留在地图上。' },
  map: { title: '飞行地图', subtitle: '航路、机场与航点' },
  log: { title: '飞行日志', subtitle: '一次游戏，一段旅程' },
  settings: { title: '设置', subtitle: '让 SkyLog 更像你的日志' },
};

export class App {
  constructor(root) {
    this.root = root;
    this.library = null;
    this.appInfo = null;
    this.currentRoute = null;
    this.pages = new Map();
    this.state = {
      activeFlightId: null,
      collapsedSessions: new Set(),
      logQuery: '',
      logStatus: 'all',
      logSort: 'newest',
    };
    this.shellReady = false;
  }

  async init() {
    this.renderShell();
    if (!hasBridge) {
      this.renderBridgeError();
      return;
    }
    try {
      const [libraryResult, appInfo] = await Promise.all([
        api.getLibrary(),
        api.getAppInfo().catch(() => null),
      ]);
      this.library = libraryResult.library;
      this.appInfo = appInfo;
      this.syncPlatformClass();
      this.syncSettingsClasses();
      this.pickInitialFlight();
      this.syncSidebar();
      this.showLoading(false);
      const initialRoute = this.routeFromHash();
      if (!location.hash) history.replaceState(null, '', '#/home');
      this.showRoute(initialRoute);
      window.addEventListener('hashchange', () => this.showRoute(this.routeFromHash()));
      this.bindGlobalEvents();
      this.bindShortcuts();
    } catch (error) {
      this.renderFatal(error);
    }
  }

  syncPlatformClass() {
    document.body.classList.add('is-electron');
    if (this.appInfo?.platform) document.body.classList.add(`platform-${this.appInfo.platform}`);
  }

  syncSettingsClasses() {
    document.body.classList.toggle('no-animations', this.library?.settings?.animations === false);
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="titlebar">
          <div class="titlebar-brand">
            ${brandMark(25)}
            <span class="titlebar-name">SkyLog</span>
            <span class="titlebar-cn">航迹</span>
          </div>
          <div class="titlebar-drag" aria-hidden="true"></div>
          <div class="titlebar-meta">
            <span class="titlebar-dot"></span>
            <span>本地飞行日志</span>
          </div>
        </header>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-top">
            <nav class="nav-list" aria-label="主导航">
              <button class="nav-item" type="button" data-route="home">${icon('home', 19)}<span>概览</span></button>
              <button class="nav-item" type="button" data-route="map">${icon('map', 19)}<span>飞行地图</span></button>
              <button class="nav-item" type="button" data-route="log">${icon('book', 19)}<span>飞行日志</span><span class="nav-count" id="nav-count"></span></button>
              <button class="nav-item" type="button" data-route="settings">${icon('settings', 19)}<span>设置</span></button>
            </nav>
            <div class="sidebar-section">
              <div class="sidebar-label">快速操作</div>
              <button class="sidebar-action" type="button" data-action="quick-import">
                <span class="sidebar-action-icon">${icon('plus', 16)}</span>
                <span>导入 SimBrief</span>
                <kbd>Ctrl I</kbd>
              </button>
            </div>
          </div>
          <div class="sidebar-bottom">
            <div id="pilot-card"></div>
            <div class="sidebar-version" id="sidebar-version">SkyLog</div>
          </div>
        </aside>
        <main class="main" id="main">
          <div class="page-host" id="page-host">
            <div class="splash" id="splash">
              <div class="splash-mark">${brandMark(58)}</div>
              <h1>SkyLog 航迹</h1>
              <p>正在打开你的飞行日志…</p>
              <span class="splash-line"></span>
            </div>
          </div>
        </main>
      </div>`;
    this.sidebarEl = this.root.querySelector('#sidebar');
    this.hostEl = this.root.querySelector('#page-host');
    this.shellReady = true;
  }

  bindGlobalEvents() {
    document.addEventListener('click', (event) => {
      const routeButton = event.target.closest('[data-route]');
      if (routeButton && this.root.contains(routeButton)) {
        event.preventDefault();
        this.navigate(routeButton.dataset.route);
        return;
      }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton && this.root.contains(actionButton)) {
        if (actionButton.dataset.action === 'quick-import') {
          this.openImport();
        }
      }
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  bindShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (document.body.classList.contains('modal-open')) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        this.openImport();
      }
      if ((event.ctrlKey || event.metaKey) && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        this.navigate(ROUTES[Number(event.key) - 1]);
      }
    });
  }

  routeFromHash() {
    const value = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.includes(value) ? value : 'home';
  }

  navigate(route) {
    const target = ROUTES.includes(route) ? route : 'home';
    if (this.currentRoute === target) {
      this.pages.get(target)?.show?.();
      return;
    }
    if (location.hash !== `#/${target}`) {
      location.hash = `#/${target}`;
    } else {
      this.showRoute(target);
    }
  }

  showRoute(route) {
    if (!this.library) return;
    const target = ROUTES.includes(route) ? route : 'home';
    this.currentRoute = target;
    this.syncSidebar();
    this.pages.forEach((page, key) => {
      page.root.classList.toggle('is-active', key === target);
    });
    if (!this.pages.has(target)) {
      this.createPage(target);
    }
    const page = this.pages.get(target);
    page.root.classList.add('is-active');
    page.show?.();
    document.title = `SkyLog 航迹 · ${PAGE_META[target].title}`;
  }

  createPage(route) {
    const root = document.createElement('section');
    root.className = 'page';
    root.dataset.page = route;
    root.innerHTML = '';
    this.hostEl.appendChild(root);
    let page;
    if (route === 'home') page = new HomePage(this, root);
    else if (route === 'map') page = new MapPage(this, root);
    else if (route === 'log') page = new LogPage(this, root);
    else page = new SettingsPage(this, root);
    this.pages.set(route, page);
    page.mount();
  }

  showLoading(visible) {
    const splash = this.root.querySelector('#splash');
    if (!splash) return;
    if (!visible) {
      splash.classList.add('is-leaving');
      setTimeout(() => splash.remove(), 260);
    }
  }

  renderBridgeError() {
    this.hostEl.innerHTML = `<div class="fatal-state">
      <div class="fatal-icon">${icon('alert', 30)}</div>
      <h1>请通过 SkyLog 桌面应用打开</h1>
      <p>当前页面没有检测到 Electron 桥接。请双击桌面上的 SkyLog 图标，或运行安装包后重新打开。</p>
    </div>`;
  }

  renderFatal(error) {
    this.hostEl.innerHTML = `<div class="fatal-state">
      <div class="fatal-icon">${icon('xCircle', 30)}</div>
      <h1>SkyLog 启动失败</h1>
      <p>${esc(error?.message || '无法读取本地飞行日志')}</p>
      <button class="btn btn-primary" type="button" data-action="reload-app">重试</button>
    </div>`;
    this.hostEl.querySelector('[data-action="reload-app"]')?.addEventListener('click', () => location.reload());
  }

  pickInitialFlight() {
    if (!this.library?.flights?.length) return;
    if (this.findFlight(this.state.activeFlightId)) return;
    const latest = [...this.library.flights].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    )[0];
    this.state.activeFlightId = latest?.id || null;
  }

  syncSidebar() {
    if (!this.sidebarEl) return;
    for (const item of this.sidebarEl.querySelectorAll('[data-route]')) {
      item.classList.toggle('is-active', item.dataset.route === this.currentRoute);
      item.setAttribute('aria-current', item.dataset.route === this.currentRoute ? 'page' : 'false');
    }
    const count = this.sidebarEl.querySelector('#nav-count');
    if (count) {
      const total = this.library?.flights?.length || 0;
      count.textContent = total ? String(total) : '';
    }
    this.renderPilotCard();
    const version = this.sidebarEl.querySelector('#sidebar-version');
    if (version) version.textContent = `SkyLog ${this.appInfo?.version || ''} · 本地数据`;
  }

  renderPilotCard() {
    const target = this.sidebarEl?.querySelector('#pilot-card');
    if (!target) return;
    const pilotId = this.library?.settings?.pilotId;
    target.innerHTML = pilotId
      ? `<button class="pilot-card" type="button" data-route="settings">
          <span class="pilot-avatar">${icon('plane', 17)}</span>
          <span class="pilot-copy"><em>SIMBRIEF PILOT</em><strong>ID ${esc(pilotId)}</strong></span>
          <span class="pilot-status is-on"></span>
        </button>`
      : `<button class="pilot-card is-empty" type="button" data-route="settings">
          <span class="pilot-avatar">${icon('link', 17)}</span>
          <span class="pilot-copy"><em>SIMBRIEF</em><strong>设置 Pilot ID</strong></span>
          <span class="pilot-status"></span>
        </button>`;
  }

  get settings() {
    return this.library?.settings || {};
  }

  get flights() {
    return this.library?.flights || [];
  }

  get sessions() {
    return this.library?.sessions || [];
  }

  findFlight(id) {
    return this.flights.find((flight) => flight.id === id) || null;
  }

  findSession(id) {
    return this.sessions.find((session) => session.id === id) || null;
  }

  flightsForSession(sessionId) {
    return this.flights
      .filter((flight) => flight.sessionId === sessionId)
      .sort((a, b) => (a.scheduledOut || 0) - (b.scheduledOut || 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  sessionsSorted() {
    return [...this.sessions].sort((a, b) => {
      const aTime = Math.max(
        new Date(a.createdAt || 0).getTime(),
        ...this.flightsForSession(a.id).map((flight) => flight.scheduledOut || 0),
      );
      const bTime = Math.max(
        new Date(b.createdAt || 0).getTime(),
        ...this.flightsForSession(b.id).map((flight) => flight.scheduledOut || 0),
      );
      return bTime - aTime;
    });
  }

  activeFlight() {
    return this.findFlight(this.state.activeFlightId) || this.latestFlight();
  }

  latestFlight() {
    return [...this.flights].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    )[0] || null;
  }

  stats() {
    const flights = this.flights;
    const flown = flights.filter((flight) => flight.status === 'flown');
    const totalDistanceNm = flights.reduce((sum, flight) => sum + (flight.distanceNm || 0), 0);
    const totalMinutes = flights.reduce((sum, flight) => sum + (flight.blockMinutes || 0), 0);
    const flownMinutes = flown.reduce(
      (sum, flight) => sum + (flight.actual?.blockMinutes ?? flight.blockMinutes ?? 0),
      0,
    );
    return {
      flights: flights.length,
      sessions: this.sessions.length,
      flown: flown.length,
      planned: flights.length - flown.length,
      totalDistanceNm,
      totalMinutes,
      flownMinutes,
    };
  }

  sessionSummary(sessionId) {
    const flights = this.flightsForSession(sessionId);
    const flown = flights.filter((flight) => flight.status === 'flown').length;
    return {
      flights,
      flown,
      distanceNm: flights.reduce((sum, flight) => sum + (flight.distanceNm || 0), 0),
      minutes: flights.reduce((sum, flight) => sum + (flight.blockMinutes || 0), 0),
      route: flights.length
        ? `${flights[0].origin?.iata || flights[0].origin?.icao || '----'} → ${
            flights.at(-1).destination?.iata || flights.at(-1).destination?.icao || '----'
          }`
        : '',
    };
  }

  setActiveFlight(id, options = {}) {
    if (!this.findFlight(id)) return;
    this.state.activeFlightId = id;
    this.refresh({ map: true });
    if (options.openMap) this.navigate('map');
  }

  goMap(flightId) {
    if (flightId && this.findFlight(flightId)) {
      this.state.activeFlightId = flightId;
    }
    this.navigate('map');
    setTimeout(() => this.pages.get('map')?.fitActive?.(), 80);
  }

  refresh(options = {}) {
    this.pickInitialFlight();
    this.syncSidebar();
    this.syncSettingsClasses();
    const current = this.pages.get(this.currentRoute);
    current?.update?.();
    if (options.map !== false && this.currentRoute !== 'map') {
      this.pages.get('map')?.update?.({ silent: true });
    }
  }

  async updateSettings(patch) {
    try {
      const result = await api.updateSettings(patch);
      this.library = result.library;
      this.syncSettingsClasses();
      this.refresh();
      return true;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      this.refresh();
      return false;
    }
  }

  async afterLibraryChange(library, options = {}) {
    if (library) this.library = library;
    this.pickInitialFlight();
    this.refresh({ map: true });
    if (options.reload) {
      try {
        const result = await api.getLibrary();
        this.library = result.library;
        this.pickInitialFlight();
        this.refresh();
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    }
  }

  openImport(options = {}) {
    if (!this.library) return;
    openImportModal(this, {
      initialSessionId: options.sessionId || '',
      query: options.query || '',
      onImported: (result) => {
        this.library = result.library;
        this.state.activeFlightId = result.flight.id;
        this.syncSidebar();
        this.refresh();
        this.navigate('map');
        setTimeout(() => this.pages.get('map')?.fitActive?.(), 120);
        toast(
          `${result.flight.callsign || result.flight.flightNumber} 已加入${
            result.session?.name || '飞行日志'
          }`,
          { type: 'success', title: '计划已导入' },
        );
      },
    });
  }

  openFlightDetail(flightId, options = {}) {
    if (!this.findFlight(flightId)) return;
    openFlightDetail(this, flightId, options);
  }

  openAirportDetail(payload) {
    openAirportDetail(this, payload);
  }

  async openExternal(url) {
    if (!url) return;
    try {
      await api.openExternal(url);
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async markFlown(flight, flown = true) {
    try {
      const result = await api.updateFlight(flight.id, { status: flown ? 'flown' : 'planned' });
      this.library = result.library;
      this.refresh();
      toast(flown ? '已标记为已飞' : '已改回计划中', {
        type: 'success',
        duration: 2000,
      });
      return result.flight;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      return null;
    }
  }

  async deleteFlight(flight) {
    const ok = await confirmDialog({
      title: '删除航段',
      message: `确定删除 ${flight.callsign || flight.flightNumber} · ${flight.origin?.iata || flight.origin?.icao} → ${flight.destination?.iata || flight.destination?.icao}？`,
      detail: '这会同时删除本地保存的计划详情与原始 SimBrief 数据，无法撤销。',
      confirmText: '删除航段',
      danger: true,
    });
    if (!ok) return false;
    try {
      const result = await api.deleteFlight(flight.id);
      this.library = result.library;
      if (this.state.activeFlightId === flight.id) this.state.activeFlightId = null;
      this.pickInitialFlight();
      this.refresh();
      toast('航段已删除', { type: 'success' });
      return true;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      return false;
    }
  }

  sessionDurationLabel(sessionId) {
    return formatDuration(this.sessionSummary(sessionId).minutes, 'compact');
  }
}

export function createApp(root) {
  const app = new App(root);
  app.init();
  return app;
}
