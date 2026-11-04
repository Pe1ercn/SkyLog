import { api, hasBridge } from './lib/api.js';
import { icon, brandMark } from './lib/icons.js';
import {
  confirmDialog,
  errorMessage,
  toast,
} from './ui/components.js';
import { HomePage } from './pages/home.js';
import { LaunchPage } from './pages/launch.js';
import { MapPage } from './pages/map.js';
import { LogPage } from './pages/log.js';
import { DownloadsPage } from './pages/downloads.js';
import { SettingsPage } from './pages/settings.js';
import { ToolboxPage } from './pages/toolbox.js';
import { openImportModal } from './ui/import-modal.js';
import { openCreateSimbrief } from './ui/create-simbrief.js';
import { openFlightDetail } from './ui/flight-detail.js';
import { openAirportDetail } from './ui/airport-detail.js';
import { openAppreciation } from './ui/appreciation.js';
import { openFlightTrackingPrompt } from './ui/flight-tracking.js';
import { esc, formatDuration } from './lib/format.js';
import {
  applyTranslations,
  getLanguage,
  setLanguage,
  startTranslationObserver,
  t,
} from './lib/i18n.js';
import {
  getTheme,
  navIconFor,
  themeBackgroundUri,
} from './lib/themes.js';

const ROUTES = ['home', 'details', 'map', 'log', 'downloads', 'toolbox', 'settings'];
const NAV_ITEMS = [
  { route: 'home', label: '首页', titleEn: 'Home', icon: 'home' },
  { route: 'details', label: '详情', titleEn: 'Details', icon: 'file' },
  { route: 'map', label: '飞行地图', titleEn: 'World Map', icon: 'map' },
  { route: 'log', label: '飞行日志', titleEn: 'Flight Log', icon: 'book', count: true },
  { route: 'downloads', label: '下载', titleEn: 'Downloads', icon: 'download' },
  { route: 'toolbox', label: '工具箱', titleEn: 'Toolbox', icon: 'toolbox' },
  { route: 'settings', label: '设置', titleEn: 'Settings', icon: 'settings' },
];
const PAGE_META = {
  home: { title: '首页', subtitle: '选择模拟器，准备起飞。', titleEn: 'Home' },
  details: { title: '详情', subtitle: '把每一次起飞，都留在地图上。', titleEn: 'Details' },
  map: { title: '飞行地图', subtitle: '航路、机场与航点', titleEn: 'World Map' },
  log: { title: '飞行日志', subtitle: '一次游戏，一段旅程', titleEn: 'Flight Log' },
  downloads: { title: '下载', subtitle: '机模、插件与社区安装', titleEn: 'Downloads' },
  toolbox: { title: '工具箱', subtitle: '主题、背景与个性设置', titleEn: 'Toolbox' },
  settings: { title: '设置', subtitle: '让 SkyLog 更像你的日志', titleEn: 'Settings' },
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
    this.games = [];
    this.gamesDetecting = false;
    this.gamesPromise = null;
    this.gamesScanning = false;
    this.gamesScanPromise = null;
    this.gamesScanInfo = null;
    this.gamesScanStarted = false;
    this.routeTimer = null;
    this.theme = getTheme('default');
    this.shellReady = false;
    this.downloads = new Map();
    this.communityFolders = {};
    this.liveTelemetry = {
      active: false,
      flightId: null,
      samples: [],
      lastSample: null,
      source: '',
      saved: false,
    };
    this.telemetryUnsubscribe = null;
    this.downloadUnsubscribe = null;
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
      setLanguage(this.library.settings?.language || 'zh');
      startTranslationObserver();
      this.syncPlatformClass();
      this.syncSettingsClasses();
      this.applyTheme();
      this.pickInitialFlight();
      this.syncSidebar();
      this.showLoading(false);
      const initialRoute = this.routeFromHash();
      if (!location.hash) history.replaceState(null, '', '#/home');
      this.showRoute(initialRoute);
      this.detectGames();
      this.bindBridgeEvents();
      this.detectCommunityFolders();
      window.addEventListener('hashchange', () => this.showRoute(this.routeFromHash()));
      this.bindGlobalEvents();
      this.bindShortcuts();
      if (!this.settings.appreciationSeen) {
        setTimeout(() => openAppreciation(this, { firstRun: true }), 900);
      }
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
      <div class="theme-backdrop" id="theme-backdrop" aria-hidden="true"></div>
      <div class="app-shell">
        <header class="titlebar">
          <div class="titlebar-brand">
            ${brandMark(25)}
            <span class="titlebar-name">SkyLog</span>
            <span class="titlebar-cn">航迹</span>
          </div>
          <div class="titlebar-drag" aria-hidden="true"></div>
          <button class="titlebar-support" type="button" data-action="appreciation">${icon('heart', 13)}<span>我已赞赏</span></button>
          <div class="titlebar-meta">
            <span class="titlebar-dot"></span>
            <span>本地飞行日志</span>
          </div>
        </header>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-top">
            <nav class="nav-list" id="nav-list" aria-label="主导航"></nav>
            <div class="sidebar-section">
              <div class="sidebar-label">快速操作</div>
              <button class="sidebar-action" type="button" data-action="quick-import">
                <span class="sidebar-action-icon">${icon('plus', 16)}</span>
                <span>导入 SimBrief</span>
                <kbd>Ctrl I</kbd>
              </button>
              <div id="game-card"></div>
              <button class="sidebar-action" type="button" data-action="create-simbrief">
                <span class="sidebar-action-icon">${icon('sparkles', 16)}</span>
                <span>创建计划</span>
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
      </div>
      <button class="download-fab" id="download-fab" type="button" data-action="downloads-fab" hidden aria-label="下载任务">
        <span class="download-fab-ring"></span>
        <span class="download-fab-icon">${icon('download', 21)}</span>
        <span class="download-fab-count">0</span>
      </button>`;
    this.sidebarEl = this.root.querySelector('#sidebar');
    this.navEl = this.root.querySelector('#nav-list');
    this.themeBackdropEl = this.root.querySelector('#theme-backdrop');
    this.hostEl = this.root.querySelector('#page-host');
    this.downloadFabEl = this.root.querySelector('#download-fab');
    this.shellReady = true;
    this.renderNavigation();
  }

  renderNavigation() {
    if (!this.navEl) return;
    const theme = this.theme || getTheme('default');
    this.navEl.innerHTML = NAV_ITEMS.map((item) => {
      const iconName = navIconFor(theme, item.route) || item.icon;
      const label = getLanguage() === 'en' ? item.titleEn : item.label;
      const count = item.count ? '<span class="nav-count" id="nav-count"></span>' : '';
      return `<button class="nav-item" type="button" data-route="${item.route}">${icon(iconName, 19)}<span>${label}</span>${count}</button>`;
    }).join('');
    this.syncNavActive();
  }

  syncNavActive() {
    if (!this.navEl) return;
    for (const item of this.navEl.querySelectorAll('[data-route]')) {
      item.classList.toggle('is-active', item.dataset.route === this.currentRoute);
      item.setAttribute('aria-current', item.dataset.route === this.currentRoute ? 'page' : 'false');
    }
  }

  applyTheme() {
    const settings = this.library?.settings || {};
    const theme = getTheme(settings.theme || 'default', settings.themeUnlocks || ['default']);
    this.theme = theme;
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--primary-deep', theme.deep);
    root.style.setProperty('--primary-soft', theme.soft);
    root.style.setProperty('--primary-soft-2', theme.soft2);
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-bg-image', `url("${settings.backgroundImage || themeBackgroundUri(theme)}")`);
    root.style.setProperty('--theme-bg-opacity', String(
      Number.isFinite(Number(settings.backgroundOpacity)) ? Number(settings.backgroundOpacity) : 0.18,
    ));
    document.body.dataset.theme = theme.id;
    document.documentElement.dataset.theme = theme.id;
    this.renderNavigation();
  }

  bindGlobalEvents() {
    document.addEventListener('click', (event) => {
      const routeButton = event.target.closest('[data-route]');
      if (routeButton && this.root.contains(routeButton)) {
        event.preventDefault();
        this.navigate(routeButton.dataset.route, {
          origin: { x: event.clientX, y: event.clientY },
        });
        return;
      }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton && this.root.contains(actionButton)) {
        if (actionButton.dataset.action === 'quick-import') {
          this.openImport();
        } else if (actionButton.dataset.action === 'launch-game') {
          this.launchGame();
        } else if (actionButton.dataset.action === 'detect-game' || actionButton.dataset.action === 'scan-games') {
          this.scanAllGames({ force: true });
        } else if (actionButton.dataset.action === 'create-simbrief') {
          this.openCreate();
        } else if (actionButton.dataset.action === 'appreciation') {
          openAppreciation(this);
        } else if (actionButton.dataset.action === 'downloads-fab') {
          this.navigate('downloads');
        }
      }
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  bindBridgeEvents() {
    if (window.skylog?.onTelemetry) {
      this.telemetryUnsubscribe = window.skylog.onTelemetry((sample) => this.handleTelemetry(sample));
    }
    if (window.skylog?.onDownloadUpdate) {
      this.downloadUnsubscribe = window.skylog.onDownloadUpdate((task) => this.handleDownloadUpdate(task));
    }
    api.listDownloads?.().then((result) => {
      for (const task of result.tasks || []) this.downloads.set(task.id, task);
      this.renderDownloadFab();
    }).catch(() => {});
  }

  renderDownloadFab() {
    const fab = this.downloadFabEl;
    if (!fab) return;
    const tasks = [...this.downloads.values()];
    const active = tasks.filter((task) => task.status === 'connecting' || task.status === 'downloading');
    if (!active.length) {
      fab.hidden = true;
      return;
    }
    fab.hidden = false;
    const task = active[active.length - 1];
    const progress = Number(task.progress) || 0;
    fab.style.setProperty('--download-progress', `${Math.round(progress * 100)}%`);
    fab.querySelector('.download-fab-count').textContent = String(active.length);
    fab.title = `${task.filename || task.url} · ${Math.round(progress * 100)}%`;
  }

  handleDownloadUpdate(task) {
    if (!task?.id) return;
    this.downloads.set(task.id, task);
    this.renderDownloadFab();
    if (this.currentRoute === 'downloads') this.pages.get('downloads')?.updateTask?.(task);
  }

  async startDownload(payload = {}) {
    const targetDir = payload.targetDir
      || this.settings.downloadPath
      || this.appInfo?.downloadPath
      || '';
    const result = await api.startDownload({ ...payload, targetDir });
    if (result.task) {
      this.downloads.set(result.task.id, result.task);
      this.renderDownloadFab();
    }
    return result;
  }

  async chooseDownloadFolder() {
    const result = await api.chooseDownloadFolder();
    if (!result.canceled) {
      if (result.library) this.library = result.library;
      this.refresh({ map: false });
    }
    return result;
  }

  async openDownloadFolder(folder = '') {
    try {
      const result = await api.openDownloadFolder(folder);
      if (!result.opened) toast('无法打开下载文件夹', { type: 'error' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async cancelDownload(id) {
    try {
      await api.cancelDownload(id);
      const task = this.downloads.get(id);
      if (task) {
        task.status = 'cancelled';
        this.renderDownloadFab();
      }
      this.pages.get('downloads')?.update?.();
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async installDownloaded(task, family = '') {
    if (!task?.targetPath) return null;
    try {
      let result = await api.installDownload({
        filePath: task.targetPath,
        family: family || task.family || this.selectedGame?.family || 'msfs',
      });
      if (result.needsCommunity) {
        const chosen = await this.chooseCommunityFolder(result.family || family || 'msfs');
        if (chosen.canceled) return null;
        result = await api.installDownload({
          filePath: task.targetPath,
          family: result.family || family || 'msfs',
        });
      }
      if (result.installed) toast('已安装到社区文件夹', { type: 'success', title: '安装完成' });
      else if (result.mode === 'installer') toast('已打开安装程序', { type: 'info', title: '安装程序已启动' });
      else if (result.message) toast(result.message, { type: 'info' });
      return result;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      return null;
    }
  }

  async detectCommunityFolders() {
    try {
      const result = await api.getCommunityFolders();
      this.communityFolders = { ...(result || {}), platform: result?.platform };
      this.pages.get('downloads')?.update?.();
    } catch {
      // Detection is best-effort until a folder is selected.
    }
  }

  async chooseCommunityFolder(family = 'msfs') {
    const result = await api.chooseCommunityFolder(family);
    if (!result.canceled) {
      if (result.library) this.library = result.library;
      this.communityFolders = {
        ...this.communityFolders,
        [family]: result.path,
      };
      this.refresh({ map: false });
    }
    return result;
  }

  async installTelemetry(family = '') {
    const selectedFamily = family || this.selectedGame?.family || 'msfs';
    try {
      let result = await api.startTelemetry({
        family: selectedFamily,
        game: this.selectedGame,
      });
      if (result.needsCommunity) {
        const chosen = await this.chooseCommunityFolder(selectedFamily);
        if (chosen.canceled) return null;
        result = await api.startTelemetry({
          family: selectedFamily,
          game: this.selectedGame,
        });
      }
      const message = result.needsFlyWithLua
        ? result.message
        : result.installed
          ? 'SkyLog 遥测插件已安装到游戏社区文件夹'
          : result.message || '遥测插件未安装';
      toast(message, { type: result.installed ? 'success' : 'info', title: 'Flight data bridge' });
      return result;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      return null;
    }
  }

  handleTelemetry(sample) {
    if (!this.liveTelemetry.active) return;
    this.liveTelemetry.samples.push(sample);
    if (this.liveTelemetry.samples.length > 6000) this.liveTelemetry.samples.shift();
    this.liveTelemetry.lastSample = sample;
    this.liveTelemetry.source = sample.source;
    this.pages.get('map')?.updateLiveTelemetry?.(sample);
  }

  async startTracking(flight, options = {}) {
    if (!flight) return { ok: false, message: 'No flight selected.' };
    const family = this.selectedGame?.family
      || this.games.find((game) => game.family)?.family
      || '';
    if (!family) {
      toast('请先选择 X-Plane 或 MSFS 游戏', { type: 'error' });
      return { ok: false, message: '请先选择游戏。' };
    }
    try {
      let result = await api.startTelemetry({
        flightId: flight.id,
        family,
        game: this.selectedGame,
      });
      if (result.needsCommunity) {
        options.onNeedsCommunity?.();
        const chosen = await this.chooseCommunityFolder(family);
        if (chosen.canceled) return { ok: false, message: '需要选择社区文件夹。' };
        result = await api.startTelemetry({ flightId: flight.id, family, game: this.selectedGame });
      }
      if (result.needsFlyWithLua) {
        toast(result.message, { type: 'info', title: '需要 FlyWithLua' });
        return { ok: false, message: result.message };
      }
      if (!result.installed && !result.telemetryFile) {
        return { ok: false, message: result.message || '遥测插件未准备好。' };
      }
      this.liveTelemetry = {
        active: true,
        flightId: flight.id,
        samples: [],
        lastSample: null,
        source: family,
        saved: false,
      };
      this.navigate('map');
      setTimeout(() => {
        this.pages.get('map')?.fitActive?.();
        this.pages.get('map')?.renderLiveTelemetry?.();
      }, 160);
      toast(
        family === 'msfs'
          ? '进入游戏后打开 SkyLog Telemetry 面板，飞行数据会自动回传'
          : '进入 X-Plane 后遥测脚本会自动写入数据',
        { type: 'info', title: '等待飞行数据' },
      );
      return { ok: true, ...result };
    } catch (error) {
      toast(errorMessage(error), { type: 'error', title: '飞行数据' });
      return { ok: false, message: error.message };
    }
  }

  async stopTracking() {
    if (!this.liveTelemetry.active) return;
    const flightId = this.liveTelemetry.flightId;
    const samples = this.liveTelemetry.samples;
    try {
      await api.stopTelemetry();
      if (flightId && samples.length) await api.saveTelemetry({ flightId, samples });
      this.liveTelemetry.active = false;
      this.liveTelemetry.saved = true;
      this.refresh({ map: false });
      toast(`飞行数据已保存 · ${samples.length} 个采样点`, { type: 'success', title: '飞行结束' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
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
      if ((event.ctrlKey || event.metaKey) && ['1', '2', '3', '4', '5', '6', '7'].includes(event.key)) {
        event.preventDefault();
        this.navigate(ROUTES[Number(event.key) - 1]);
      }
    });
  }

  routeFromHash() {
    const value = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.includes(value) ? value : 'home';
  }

  canAnimateRoute() {
    return this.library?.settings?.animations !== false &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  playRouteRipple(origin) {
    if (!origin || !this.canAnimateRoute()) return;
    const x = Number(origin.x) || window.innerWidth / 2;
    const y = Number(origin.y) || window.innerHeight / 2;
    const size = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ) * 2.25;
    const ripple = document.createElement('span');
    ripple.className = 'route-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.background = `radial-gradient(circle, ${this.theme?.primary || '#2f6df6'} 0%, ${this.theme?.deep || '#2458d6'} 70%, transparent 72%)`;
    const trail = document.createElement('span');
    trail.className = 'route-trail';
    document.body.appendChild(trail);
    document.body.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.classList.add('is-open');
      trail.classList.add('is-open');
    });
    setTimeout(() => {
      ripple.remove();
      trail.remove();
    }, 760);
  }

  navigate(route, options = {}) {
    const target = ROUTES.includes(route) ? route : 'home';
    if (this.currentRoute === target) {
      this.pages.get(target)?.show?.();
      return;
    }
    const go = () => {
      if (location.hash !== `#/${target}`) {
        location.hash = `#/${target}`;
      } else {
        this.showRoute(target);
      }
    };
    if (options.origin && this.canAnimateRoute()) {
      clearTimeout(this.routeTimer);
      this.playRouteRipple(options.origin);
      this.routeTimer = setTimeout(go, 420);
    } else {
      go();
    }
  }

  showRoute(route) {
    if (!this.library) return;
    const target = ROUTES.includes(route) ? route : 'home';
    this.currentRoute = target;
    document.body.dataset.route = target;
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
    this.updateDocumentTitle();
    applyTranslations();
  }

  updateDocumentTitle() {
    const target = this.currentRoute || this.routeFromHash();
    const meta = PAGE_META[target] || PAGE_META.home;
    document.title = getLanguage() === 'en'
      ? `SkyLog · ${meta.titleEn}`
      : `SkyLog 航迹 · ${meta.title}`;
  }

  createPage(route) {
    const root = document.createElement('section');
    root.className = 'page';
    root.dataset.page = route;
    root.innerHTML = '';
    this.hostEl.appendChild(root);
    let page;
    if (route === 'home') page = new LaunchPage(this, root);
    else if (route === 'details') page = new HomePage(this, root);
    else if (route === 'map') page = new MapPage(this, root);
    else if (route === 'log') page = new LogPage(this, root);
    else if (route === 'downloads') page = new DownloadsPage(this, root);
    else if (route === 'toolbox') page = new ToolboxPage(this, root);
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
    this.syncNavActive();
    const count = this.sidebarEl.querySelector('#nav-count');
    if (count) {
      const total = this.library?.flights?.length || 0;
      count.textContent = total ? String(total) : '';
    }
    this.renderPilotCard();
    this.renderGameCard();
    const version = this.sidebarEl.querySelector('#sidebar-version');
    if (version) version.textContent = `SkyLog ${this.appInfo?.version || ''} · 本地数据`;
  }

  get selectedGame() {
    return this.settings?.game || this.games[0] || null;
  }

  renderGameCard() {
    const target = this.sidebarEl?.querySelector('#game-card');
    if (!target) return;
    const game = this.selectedGame;
    if (this.gamesScanning) {
      target.innerHTML = `<button class="sidebar-action is-game is-scanning" type="button" data-action="scan-games">
        <span class="sidebar-action-icon">${icon('loading', 16)}</span>
        <span class="sidebar-game-copy"><em>${t('正在全盘搜索…', 'Scanning drives…')}</em><small>${t('首次启动扫描游戏本体', 'First-launch drive scan')}</small></span>
      </button>`;
    } else if (game) {
      target.innerHTML = `<button class="sidebar-action is-game" type="button" data-action="launch-game">
        <span class="sidebar-action-icon">${icon('play', 15)}</span>
        <span class="sidebar-game-copy"><em>${esc(game.title)}</em><small>${t('启动游戏', 'Launch game')}</small></span>
        <span class="sidebar-game-status"></span>
      </button>`;
    } else {
      target.innerHTML = `<button class="sidebar-action is-game is-empty" type="button" data-action="scan-games">
        <span class="sidebar-action-icon">${icon('gamepad', 16)}</span>
        <span class="sidebar-game-copy"><em>${this.gamesDetecting ? t('正在检测游戏…', 'Detecting games…') : t('搜索游戏本体', 'Find a game')}</em><small>X-Plane / MSFS</small></span>
      </button>`;
    }
  }

  async detectGames(options = {}) {
    if (this.gamesDetecting && this.gamesPromise) return this.gamesPromise;
    if (this.games.length && !options.force) {
      this.pages.get('settings')?.renderGames?.();
      this.pages.get('home')?.update?.();
      return this.games;
    }
    this.gamesDetecting = true;
    this.renderGameCard();
    this.gamesPromise = api
      .detectGames()
      .then((result) => {
        this.games = Array.isArray(result.games) ? result.games : [];
        this.pages.get('home')?.update?.();
        return this.games;
      })
      .catch((error) => {
        toast(errorMessage(error), { type: 'error' });
        return this.games;
      })
      .finally(() => {
        this.gamesDetecting = false;
        this.renderGameCard();
        this.pages.get('settings')?.renderGames?.();
        this.pages.get('home')?.update?.();
        if (!this.settings.gameScanDone && !this.gamesScanStarted) {
          this.scanAllGames({ automatic: true });
        }
      });
    return this.gamesPromise;
  }

  async scanAllGames(options = {}) {
    if (this.gamesScanning && this.gamesScanPromise) return this.gamesScanPromise;
    this.gamesScanStarted = true;
    this.gamesScanning = true;
    this.renderGameCard();
    this.pages.get('home')?.update?.();
    this.pages.get('settings')?.renderGames?.();
    this.gamesScanPromise = api
      .scanAllGames()
      .then((result) => {
        this.games = Array.isArray(result.games) ? result.games : this.games;
        this.gamesScanInfo = {
          scannedDirs: result.scannedDirs,
          timedOut: Boolean(result.timedOut),
          durationMs: result.durationMs,
        };
        if (result.library) this.library = result.library;
        this.pages.get('home')?.update?.();
        this.pages.get('settings')?.renderGames?.();
        if (!result.timedOut) {
          toast(
            this.games.length
              ? `全盘搜索完成，发现 ${this.games.length} 个游戏`
              : '全盘搜索完成，暂未发现 X-Plane / MSFS',
            { type: 'success', title: '游戏搜索' },
          );
        } else {
          toast('全盘搜索已达到时间上限，可稍后重新搜索。', { type: 'info', title: '搜索完成' });
        }
        return this.games;
      })
      .catch((error) => {
        toast(errorMessage(error), { type: 'error', title: '搜索失败' });
        return this.games;
      })
      .finally(() => {
        this.gamesScanning = false;
        this.renderGameCard();
        this.pages.get('home')?.update?.();
        this.pages.get('settings')?.renderGames?.();
      });
    return this.gamesScanPromise;
  }

  async launchGame(game = null) {
    const target = game || this.selectedGame;
    if (!target) {
      this.navigate('settings');
      return false;
    }
    try {
      await api.launchGame(target);
      toast(`正在启动 ${target.title}`, { type: 'success', title: '游戏启动' });
      return true;
    } catch (error) {
      toast(errorMessage(error), { type: 'error', title: '启动失败' });
      return false;
    }
  }

  async pickGame() {
    try {
      const result = await api.pickGame();
      if (result.canceled || !result.game) return false;
      const saved = await this.updateSettings({ game: result.game });
      if (saved) toast('游戏位置已保存', { type: 'success' });
      return saved;
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
      return false;
    }
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
    this.applyTheme();
    this.syncSidebar();
    this.syncSettingsClasses();
    const current = this.pages.get(this.currentRoute);
    current?.update?.();
    if (options.map !== false && this.currentRoute !== 'map') {
      this.pages.get('map')?.update?.({ silent: true });
    }
    this.updateDocumentTitle();
    applyTranslations();
  }

  async updateSettings(patch) {
    try {
      const result = await api.updateSettings(patch);
      this.library = result.library;
      if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
        setLanguage(this.library.settings?.language || 'zh');
      }
      this.applyTheme();
      this.syncSettingsClasses();
      this.refresh();
      this.updateDocumentTitle();
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
        setTimeout(() => openFlightTrackingPrompt(this, result.flight), 350);
      },
    });
  }

  openCreate() {
    if (!this.library) return;
    openCreateSimbrief(this);
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
