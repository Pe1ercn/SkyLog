import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import {
  airportCodePrimary,
  airportDisplayName,
  dateAt,
  dateCN,
  dateTimeAt,
  esc,
  formatDistance,
  formatDuration,
  monthDayCN,
  statusClass,
  statusText,
  timeAt,
  zoneLabel,
} from '../lib/format.js';
import { sessionColor } from '../lib/palette.js';
import {
  confirmDialog,
  errorMessage,
  openModal,
  promptDialog,
  showActionMenu,
  toast,
} from '../ui/components.js';

export class LogPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.query = app.state.logQuery || '';
    this.status = app.state.logStatus || 'all';
    this.sort = app.settings.logSort || 'newest';
    this.listEl = null;
    this.toolbarEl = null;
  }

  mount() {
    this.root.innerHTML = this.shellHtml();
    this.listEl = this.root.querySelector('#log-list');
    this.toolbarEl = this.root.querySelector('#log-toolbar');
    this.bindShell();
    this.renderList();
  }

  show() {
    this.mount();
    const focusSession = this.app.state.logFocusSession;
    if (focusSession) {
      this.app.state.logFocusSession = null;
      requestAnimationFrame(() => {
        const target = this.root.querySelector(`[data-session-id="${CSS.escape(focusSession)}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.classList.add('is-highlighted');
        setTimeout(() => target?.classList.remove('is-highlighted'), 1800);
      });
    }
  }

  update() {
    this.sort = this.app.settings.logSort || this.sort;
    this.mount();
  }

  shellHtml() {
    const stats = this.app.stats();
    return `<div class="log-page">
      <header class="page-head">
        <div>
          <p class="eyebrow">FLIGHT LOG</p>
          <h1>飞行日志</h1>
          <p class="page-sub">一次游戏可以包含多个起降。选择加入同一个会话，就能把连续航段串成完整旅程。</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" data-action="new-session">${icon('layers', 17)}<span>新建游戏</span></button>
          <button class="btn btn-primary" type="button" data-action="import">${icon('plus', 17)}<span>导入 SimBrief</span></button>
        </div>
      </header>

      <section class="log-summary">
        <div><span>航段</span><strong>${stats.flights}</strong><em>段</em></div>
        <div><span>游戏会话</span><strong>${stats.sessions}</strong><em>次</em></div>
        <div><span>已飞</span><strong>${stats.flown}</strong><em>段</em></div>
        <div><span>总航程</span><strong>${esc(formatDistance(stats.totalDistanceNm, this.app.settings.distanceUnit).replace(/\s?(nm|km)$/, ''))}</strong><em>${this.app.settings.distanceUnit}</em></div>
        <div><span>计划时间</span><strong>${esc(formatDuration(stats.totalMinutes, 'compact'))}</strong><em></em></div>
      </section>

      <div class="log-toolbar" id="log-toolbar">
        <label class="search-box">
          ${icon('search', 17)}
          <input type="search" placeholder="搜索航班号、机场、机型或备注…" value="${esc(this.query)}" autocomplete="off" />
          ${this.query ? `<button class="search-clear" type="button" aria-label="清除搜索">${icon('x', 14)}</button>` : ''}
        </label>
        <div class="filter-chips" role="group" aria-label="按状态筛选">
          ${this.filterChip('all', '全部', stats.flights)}
          ${this.filterChip('planned', '计划中', stats.planned)}
          ${this.filterChip('flown', '已飞', stats.flown)}
        </div>
        <label class="select-inline">
          ${icon('sort', 15)}
          <select data-action="sort">
            <option value="newest" ${this.sort === 'newest' ? 'selected' : ''}>最新优先</option>
            <option value="oldest" ${this.sort === 'oldest' ? 'selected' : ''}>最早优先</option>
          </select>
        </label>
      </div>

      <div class="log-list" id="log-list"></div>
    </div>`;
  }

  filterChip(value, label, count) {
    return `<button class="filter-chip ${this.status === value ? 'is-active' : ''}" type="button" data-status="${value}">
      ${esc(label)}<em>${count}</em>
    </button>`;
  }

  bindShell() {
    this.root.querySelector('[data-action="import"]')?.addEventListener('click', () => this.app.openImport());
    this.root.querySelector('[data-action="new-session"]')?.addEventListener('click', () => this.createSession());
    this.toolbarEl?.querySelector('input[type="search"]')?.addEventListener('input', (event) => {
      this.query = event.target.value;
      this.app.state.logQuery = this.query;
      const clear = this.toolbarEl.querySelector('.search-clear');
      if (this.query && !clear) {
        const button = document.createElement('button');
        button.className = 'search-clear';
        button.type = 'button';
        button.setAttribute('aria-label', '清除搜索');
        button.innerHTML = icon('x', 14);
        button.addEventListener('click', () => {
          this.query = '';
          this.app.state.logQuery = '';
          const input = this.toolbarEl.querySelector('input[type="search"]');
          if (input) input.value = '';
          this.mount();
        });
        this.toolbarEl.querySelector('.search-box')?.appendChild(button);
      } else if (!this.query && clear) {
        clear.remove();
      }
      this.renderList();
    });
    this.toolbarEl?.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', () => {
        this.status = button.dataset.status;
        this.app.state.logStatus = this.status;
        this.toolbarEl.querySelectorAll('[data-status]').forEach((item) => {
          item.classList.toggle('is-active', item.dataset.status === this.status);
        });
        this.renderList();
      });
    });
    this.toolbarEl?.querySelector('[data-action="sort"]')?.addEventListener('change', (event) => {
      this.sort = event.target.value;
      this.app.updateSettings({ logSort: this.sort });
      this.renderList();
    });
    this.listEl?.addEventListener('click', (event) => this.handleListClick(event));
    this.listEl?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.leg-row');
      if (row && !event.target.closest('button')) {
        event.preventDefault();
        this.app.openFlightDetail(row.dataset.flightId);
      }
    });
  }

  visibleSessions() {
    const query = this.query.trim().toLowerCase();
    const sessions = [];
    for (const session of this.app.sessions) {
      const flights = this.app.flightsForSession(session.id);
      const matchingFlights = flights.filter((flight) => this.matches(flight, session, query));
      const sessionNameMatches = Boolean(query) && session.name.toLowerCase().includes(query);
      if (query && !matchingFlights.length && !sessionNameMatches) continue;
      if (this.status !== 'all' && !matchingFlights.some((flight) => flight.status === this.status)) continue;
      if (this.status !== 'all' && matchingFlights.length === 0) continue;
      if (this.status === 'all' && matchingFlights.length === 0 && flights.length > 0 && !sessionNameMatches) continue;
      sessions.push({ session, flights, matchingFlights, sessionNameMatches });
    }
    const value = (item) => {
      const timestamps = item.flights.map((flight) => flight.scheduledOut || 0);
      return timestamps.length ? Math.max(...timestamps) : new Date(item.session.createdAt || 0).getTime();
    };
    sessions.sort((a, b) => (this.sort === 'oldest' ? value(a) - value(b) : value(b) - value(a)));
    return sessions;
  }

  matches(flight, session, query) {
    if (this.status !== 'all' && flight.status !== this.status) return false;
    if (!query) return true;
    const haystack = [
      session.name,
      flight.flightNumber,
      flight.callsign,
      flight.registration,
      flight.aircraft?.name,
      flight.aircraft?.icao,
      flight.origin?.icao,
      flight.origin?.iata,
      flight.origin?.name,
      flight.destination?.icao,
      flight.destination?.iata,
      flight.destination?.name,
      flight.actual?.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  renderList() {
    if (!this.listEl) return;
    const sessions = this.visibleSessions();
    if (!this.app.flights.length) {
      this.listEl.innerHTML = `<div class="log-empty">
        ${icon('book', 34)}
        <h2>日志还是空的</h2>
        <p>导入一份 SimBrief 计划，选择它属于哪次游戏。之后每次起降都可以继续加进同一个会话。</p>
        <button class="btn btn-primary" type="button" data-action="import-empty">${icon('plus', 16)} 导入第一份计划</button>
      </div>`;
      this.listEl.querySelector('[data-action="import-empty"]')?.addEventListener('click', () => this.app.openImport());
      return;
    }
    if (!sessions.length) {
      this.listEl.innerHTML = `<div class="log-empty is-filtered">
        ${icon('search', 30)}
        <h2>没有匹配的航段</h2>
        <p>试试其它关键词，或切换状态筛选。</p>
        <button class="btn btn-secondary" type="button" data-action="clear-filter">清除筛选</button>
      </div>`;
      this.listEl.querySelector('[data-action="clear-filter"]')?.addEventListener('click', () => {
        this.query = '';
        this.status = 'all';
        this.app.state.logQuery = '';
        this.app.state.logStatus = 'all';
        this.mount();
      });
      return;
    }
    this.listEl.innerHTML = sessions
      .map(({ session, flights, matchingFlights, sessionNameMatches }, index) =>
        this.sessionHtml(session, flights, matchingFlights, sessionNameMatches, index),
      )
      .join('');
  }

  sessionHtml(session, allFlights, matchingFlights, sessionNameMatches, index) {
    const collapsed = this.app.state.collapsedSessions.has(session.id);
    const summary = this.app.sessionSummary(session.id);
    const flights = sessionNameMatches
      ? this.status === 'all'
        ? allFlights
        : allFlights.filter((flight) => flight.status === this.status)
      : matchingFlights;
    const color = sessionColor(session.colorIndex);
    const dates = allFlights.map((flight) => flight.scheduledDate).filter(Boolean).sort();
    const dateRange = dates.length
      ? dates[0] === dates.at(-1)
        ? monthDayCN(dates[0])
        : `${monthDayCN(dates[0])} – ${monthDayCN(dates.at(-1))}`
      : '日期待定';
    return `<article class="session-card" data-session-id="${esc(session.id)}" style="--session-color:${color};--i:${index}">
      <header class="session-head">
        <button class="session-title" type="button" data-action="toggle-session" aria-expanded="${!collapsed}">
          <span class="session-color-dot"></span>
          <span class="session-title-copy">
            <strong>${esc(session.name)}</strong>
            <em>${esc(dateRange)} · ${summary.flights.length} 段${summary.flown ? ` · ${summary.flown} 已飞` : ''}${session.note ? ` · ${esc(session.note)}` : ''}</em>
          </span>
          <span class="session-chevron">${icon('chevronDown', 16)}</span>
        </button>
        <div class="session-metrics">
          <span>${esc(formatDistance(summary.distanceNm, this.app.settings.distanceUnit))}</span>
          <em>${esc(formatDuration(summary.minutes, 'compact'))}</em>
        </div>
        <button class="icon-btn session-menu-btn" type="button" data-action="session-menu" aria-label="会话操作">${icon('more', 18)}</button>
      </header>
      <div class="session-body ${collapsed ? 'is-collapsed' : ''}">
        ${flights.length
          ? `<div class="leg-table-head">
              <span>航段</span><span>航班 / 机型</span><span>时间</span><span>距离 / 时长</span><span>状态</span><span></span>
            </div>
            <div class="leg-rows">${flights.map((flight, flightIndex) => this.legHtml(flight, flightIndex)).join('')}</div>`
          : `<div class="session-empty">
              ${icon('plus', 18)}<span>这次游戏还没有航段。</span>
              <button class="text-btn" type="button" data-action="import-session">导入一个航段 ${icon('arrowRight', 14)}</button>
            </div>`}
      </div>
    </article>`;
  }

  legHtml(flight, index) {
    const depDate = flight.scheduledOut
      ? dateAt(flight.scheduledOut, flight.origin?.timezoneHours || 0, this.app.settings.timeMode)
      : flight.scheduledDate || '';
    const arrDate = flight.scheduledIn
      ? dateAt(flight.scheduledIn, flight.destination?.timezoneHours || 0, this.app.settings.timeMode)
      : '';
    const departure = flight.scheduledOut
      ? `${monthDayCN(depDate)} ${timeAt(flight.scheduledOut, flight.origin?.timezoneHours || 0, this.app.settings.timeMode)}`
      : '时间待定';
    const arrival = flight.scheduledIn
      ? `${arrDate && arrDate !== depDate ? `${monthDayCN(arrDate)} ` : ''}${timeAt(flight.scheduledIn, flight.destination?.timezoneHours || 0, this.app.settings.timeMode)}`
      : '';
    return `<div class="leg-row" data-flight-id="${esc(flight.id)}" tabindex="0" role="button" aria-label="查看 ${esc(flight.callsign || flight.flightNumber)} 详情" style="--i:${index}">
      <div class="leg-route">
        <span class="leg-codes">${esc(airportCodePrimary(flight.origin))}<i>${icon('arrowRight', 13)}</i>${esc(airportCodePrimary(flight.destination))}</span>
        <span class="leg-names">${esc(airportDisplayName(flight.origin?.name, ''))} → ${esc(airportDisplayName(flight.destination?.name, ''))}</span>
      </div>
      <div class="leg-flight">
        <strong>${esc(flight.flightNumber || flight.callsign || '—')}</strong>
        <span>${esc(flight.aircraft?.name || flight.aircraft?.icao || '')}${flight.registration && flight.registration !== (flight.flightNumber || flight.callsign) ? ` · ${esc(flight.registration)}` : ''}</span>
      </div>
      <div class="leg-time">
        <span>${esc(departure)}${arrival ? ` → ${esc(arrival)}` : ''}</span>
        <em>${esc(zoneLabel(flight.origin?.timezoneHours, this.app.settings.timeMode))} → ${esc(zoneLabel(flight.destination?.timezoneHours, this.app.settings.timeMode))}</em>
      </div>
      <div class="leg-distance">
        <span>${esc(formatDistance(flight.distanceNm, this.app.settings.distanceUnit))}</span>
        <em>${esc(formatDuration(flight.blockMinutes, 'compact'))}</em>
      </div>
      <div class="leg-status">
        <span class="status-chip ${statusClass(flight.status)}"><i></i>${statusText(flight.status)}</span>
      </div>
      <button class="icon-btn leg-menu-btn" type="button" data-action="leg-menu" aria-label="航段操作">${icon('more', 17)}</button>
    </div>`;
  }

  handleListClick(event) {
    const sessionCard = event.target.closest('.session-card');
    if (!sessionCard) return;
    const session = this.app.findSession(sessionCard.dataset.sessionId);
    if (!session) return;

    const menuButton = event.target.closest('[data-action="leg-menu"]');
    if (menuButton) {
      event.stopPropagation();
      const row = menuButton.closest('.leg-row');
      const flight = this.app.findFlight(row?.dataset.flightId);
      if (flight) this.openLegMenu(menuButton, flight);
      return;
    }
    if (event.target.closest('[data-action="session-menu"]')) {
      event.stopPropagation();
      this.openSessionMenu(event.target.closest('[data-action="session-menu"]'), session);
      return;
    }
    if (event.target.closest('[data-action="toggle-session"]')) {
      if (this.app.state.collapsedSessions.has(session.id)) {
        this.app.state.collapsedSessions.delete(session.id);
      } else {
        this.app.state.collapsedSessions.add(session.id);
      }
      event.target.closest('.session-head')?.querySelector('.session-title')?.setAttribute(
        'aria-expanded',
        String(!this.app.state.collapsedSessions.has(session.id)),
      );
      sessionCard.querySelector('.session-body')?.classList.toggle('is-collapsed');
      return;
    }
    if (event.target.closest('[data-action="import-session"]')) {
      this.app.openImport({ sessionId: session.id });
      return;
    }
    const row = event.target.closest('.leg-row');
    if (row && !event.target.closest('button')) {
      this.app.openFlightDetail(row.dataset.flightId);
    }
  }

  openLegMenu(anchor, flight) {
    showActionMenu(anchor, [
      { label: '查看详情', icon: 'file', onClick: () => this.app.openFlightDetail(flight.id) },
      { label: '在地图上打开', icon: 'map', onClick: () => this.app.goMap(flight.id) },
      '-',
      {
        label: flight.status === 'flown' ? '改回计划中' : '标记为已飞',
        icon: flight.status === 'flown' ? 'refresh' : 'checkCircle',
        onClick: async () => {
          const updated = await this.app.markFlown(flight, flight.status !== 'flown');
          if (updated) this.update();
        },
      },
      { label: '移动到其他游戏…', icon: 'move', onClick: () => this.openMoveDialog(flight) },
      { label: '移出为新的游戏', icon: 'split', onClick: () => this.splitFlight(flight) },
      '-',
      { label: '删除航段', icon: 'trash', danger: true, onClick: async () => {
        if (await this.app.deleteFlight(flight)) this.update();
      } },
    ]);
  }

  openSessionMenu(anchor, session) {
    showActionMenu(anchor, [
      { label: '导入航段到本次游戏', icon: 'plus', onClick: () => this.app.openImport({ sessionId: session.id }) },
      { label: '重命名游戏', icon: 'edit', onClick: () => this.renameSession(session) },
      { label: '编辑游戏备注', icon: 'file', onClick: () => this.editSessionNote(session) },
      { label: '合并到其他游戏…', icon: 'merge', onClick: () => this.openMergeDialog(session) },
      '-',
      { label: '删除本次游戏', icon: 'trash', danger: true, onClick: () => this.openDeleteSessionDialog(session) },
    ]);
  }

  async createSession() {
    const name = await promptDialog({
      title: '新建游戏会话',
      label: '会话名称',
      value: `游戏 ${this.app.sessions.length + 1}`,
      placeholder: '例如：周末欧洲长航线',
      confirmText: '创建',
    });
    if (!name) return;
    try {
      const result = await api.createSession(name);
      this.app.library = result.library;
      this.app.refresh();
      toast('新的游戏会话已创建', { type: 'success' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async renameSession(session) {
    const name = await promptDialog({
      title: '重命名游戏会话',
      label: '会话名称',
      value: session.name,
      confirmText: '保存',
    });
    if (!name || name === session.name) return;
    try {
      const result = await api.updateSession(session.id, { name });
      this.app.library = result.library;
      this.app.refresh();
      toast('会话名称已更新', { type: 'success' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async editSessionNote(session) {
    const note = await promptDialog({
      title: '编辑游戏备注',
      label: '这次游戏的备注',
      value: session.note || '',
      placeholder: '例如：周末和朋友一起飞的两段航线…',
      confirmText: '保存',
      maxlength: 2000,
      multiline: true,
    });
    if (note === null) return;
    try {
      const result = await api.updateSession(session.id, { note });
      this.app.library = result.library;
      this.app.refresh();
      toast('游戏备注已保存', { type: 'success' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  async splitFlight(flight) {    try {
      const result = await api.moveFlights([flight.id], 'new');
      this.app.library = result.library;
      this.app.refresh();
      toast('已移出为新的游戏会话', { type: 'success' });
    } catch (error) {
      toast(errorMessage(error), { type: 'error' });
    }
  }

  openMoveDialog(flight) {
    const otherSessions = this.app.sessions.filter((session) => session.id !== flight.sessionId);
    if (!otherSessions.length) {
      this.splitFlight(flight);
      return;
    }
    const options = otherSessions
      .map((session) => `<option value="${esc(session.id)}">${esc(session.name)} · ${this.app.flightsForSession(session.id).length} 段</option>`)
      .join('');
    let handle;
    handle = openModal({
      title: '移动航段',
      subtitle: '把这一段放进同一次游戏，或单独成为新的游戏。',
      body: `<div class="form-stack">
        <label class="field-label">目标游戏会话</label>
        <select class="field-input" name="target">
          <option value="new">＋ 新的游戏会话</option>
          ${options}
        </select>
        <p class="field-help">移动后，如果原来的游戏没有任何航段，会自动移除。</p>
      </div>`,
      footer: `<button class="btn btn-ghost" type="button" data-action="cancel">取消</button>
        <button class="btn btn-primary" type="button" data-action="ok">移动</button>`,
      onMount: ({ modal }) => {
        modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => handle.close());
        modal.querySelector('[data-action="ok"]')?.addEventListener('click', async () => {
          const target = modal.querySelector('[name="target"]').value;
          try {
            const result = await api.moveFlights([flight.id], target);
            this.app.library = result.library;
            handle.close();
            this.app.refresh();
            toast('航段已移动', { type: 'success' });
          } catch (error) {
            toast(errorMessage(error), { type: 'error' });
          }
        });
      },
    });
  }

  openMergeDialog(session) {
    const others = this.app.sessions.filter((item) => item.id !== session.id);
    if (!others.length) {
      toast('至少需要两次游戏会话才能合并', { type: 'info' });
      return;
    }
    const options = others
      .map((item) => `<option value="${esc(item.id)}">${esc(item.name)} · ${this.app.flightsForSession(item.id).length} 段</option>`)
      .join('');
    let handle;
    handle = openModal({
      title: '合并游戏会话',
      subtitle: '把当前会话里的所有航段移动到另一个会话。',
      body: `<div class="form-stack">
        <label class="field-label">合并到</label>
        <select class="field-input" name="target">${options}</select>
        <p class="field-help">当前会话「${esc(session.name)}」会在合并后移除。</p>
      </div>`,
      footer: `<button class="btn btn-ghost" type="button" data-action="cancel">取消</button>
        <button class="btn btn-primary" type="button" data-action="ok">合并</button>`,
      onMount: ({ modal }) => {
        modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => handle.close());
        modal.querySelector('[data-action="ok"]')?.addEventListener('click', async () => {
          const target = modal.querySelector('[name="target"]').value;
          try {
            const result = await api.mergeSessions([session.id, target], target);
            this.app.library = result.library;
            handle.close();
            this.app.refresh();
            toast('游戏会话已合并', { type: 'success' });
          } catch (error) {
            toast(errorMessage(error), { type: 'error' });
          }
        });
      },
    });
  }

  openDeleteSessionDialog(session) {
    const count = this.app.flightsForSession(session.id).length;
    let handle;
    handle = openModal({
      title: '删除游戏会话',
      body: `<div class="confirm-body">
        <span class="confirm-icon is-danger">${icon('alert', 24)}</span>
        <div>
          <p class="confirm-message">要删除「${esc(session.name)}」吗？</p>
          <p class="confirm-detail">这次游戏中有 ${count} 个航段。可以只删除会话，把航段放进「未分组航段」；也可以连同航段一起删除。</p>
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" type="button" data-action="cancel">取消</button>
        <button class="btn btn-secondary" type="button" data-action="keep">仅删除游戏</button>
        <button class="btn btn-danger" type="button" data-action="all">全部删除</button>`,
      onMount: ({ modal }) => {
        const run = async (deleteFlights) => {
          try {
            const result = await api.deleteSession(session.id, deleteFlights);
            this.app.library = result.library;
            handle.close();
            this.app.refresh();
            toast(deleteFlights ? '游戏和航段已删除' : '游戏已删除，航段保留在未分组', {
              type: 'success',
            });
          } catch (error) {
            toast(errorMessage(error), { type: 'error' });
          }
        };
        modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => handle.close());
        modal.querySelector('[data-action="keep"]')?.addEventListener('click', () => run(false));
        modal.querySelector('[data-action="all"]')?.addEventListener('click', () => run(true));
      },
    });
  }
}
