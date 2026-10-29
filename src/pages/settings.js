import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import {
  airportDisplayName,
  dateTimeAt,
  esc,
  formatDistance,
  formatDuration,
  utcDateTime,
} from '../lib/format.js';
import {
  confirmDialog,
  errorMessage,
  toast,
} from '../ui/components.js';

export class SettingsPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.testResult = null;
    this.testError = '';
    this.testing = false;
    this.savingPilot = false;
  }

  mount() {
    this.root.innerHTML = this.html();
    this.bind();
  }

  show() {
    this.mount();
  }

  update() {
    this.mount();
  }

  html() {
    const settings = this.app.settings;
    const info = this.app.appInfo || {};
    return `<div class="settings-page">
      <header class="page-head">
        <div>
          <p class="eyebrow">PREFERENCES</p>
          <h1>设置</h1>
          <p class="page-sub">SimBrief 连接、显示单位与本地数据管理。</p>
        </div>
        <div class="head-actions">
          <span class="settings-saved">${icon('checkCircle', 15)} 自动保存</span>
        </div>
      </header>

      <div class="settings-grid">
        <section class="panel settings-card settings-simbrief">
          <div class="settings-card-head">
            <span class="settings-icon">${icon('link', 20)}</span>
            <div>
              <h2>SimBrief 连接</h2>
              <p>用 Pilot ID 读取你账号里最新的 OFP。</p>
            </div>
          </div>
          <div class="field-row">
            <label class="field-label" for="pilot-id-input">SimBrief Pilot ID</label>
            <div class="inline-field">
              <input id="pilot-id-input" class="field-input" name="pilotId" inputmode="numeric" autocomplete="off" placeholder="例如 123456" value="${esc(settings.pilotId || '')}" />
              <button class="btn btn-primary" type="button" data-action="save-pilot">保存</button>
            </div>
            <p class="field-help">在 SimBrief 的 Account Settings 页面可以找到 Pilot ID。只保存数字编号，不会保存密码。</p>
            <p class="field-error" id="pilot-error" hidden></p>
          </div>
          <div class="settings-test-row">
            <button class="btn btn-secondary" type="button" data-action="test-pilot">
              ${icon('refresh', 16)}<span>测试连接并读取</span>
            </button>
            <span class="settings-note">读取最新计划不会写入日志。</span>
          </div>
          <div id="simbrief-test">${this.testHtml()}</div>
        </section>

        <section class="panel settings-card">
          <div class="settings-card-head">
            <span class="settings-icon">${icon('sliders', 20)}</span>
            <div>
              <h2>显示偏好</h2>
              <p>单位、时间与地图标签。</p>
            </div>
          </div>
          ${this.segment('重量单位', 'weightUnit', settings.weightUnit, [
            ['kg', '千克 kg'],
            ['lb', '磅 lb'],
          ])}
          ${this.segment('距离单位', 'distanceUnit', settings.distanceUnit, [
            ['nm', '海里 nm'],
            ['km', '公里 km'],
          ])}
          ${this.segment('高度单位', 'altitudeUnit', settings.altitudeUnit, [
            ['ft', '英尺 ft'],
            ['m', '米 m'],
          ])}
          ${this.segment('时间显示', 'timeMode', settings.timeMode, [
            ['local', '当地时间'],
            ['utc', 'UTC'],
          ])}
          ${this.segment('地图标签', 'labelMode', settings.labelMode, [
            ['both', '代码 + 全称'],
            ['codes', '仅三 / 四字码'],
            ['name', '仅全称'],
          ])}
          ${this.segment('默认航线', 'routeMode', settings.routeMode, [
            ['waypoints', '航点连线'],
            ['direct', '起降直连'],
          ])}
          <div class="toggle-list">
            ${this.toggle('显示航点', '地图上标出每个航路点', 'showWaypoints', settings.showWaypoints)}
            ${this.toggle('显示备降场', '在主航线旁显示备降机场', 'showAlternates', settings.showAlternates)}
            ${this.toggle('显示全部航班', '在地图上叠加所有已存航段', 'showAllFlights', settings.showAllFlights)}
            ${this.toggle('界面动画', '路线绘制、面板与数字过渡', 'animations', settings.animations)}
          </div>
        </section>

        <section class="panel settings-card settings-data">
          <div class="settings-card-head">
            <span class="settings-icon">${icon('database', 20)}</span>
            <div>
              <h2>本地数据</h2>
              <p>日志、计划详情和原始 OFP 都存在本机。</p>
            </div>
          </div>
          <div class="data-path">
            <span>${icon('folder', 15)} 数据文件夹</span>
            <code title="${esc(info.dataPath || '')}">${esc(info.dataPath || '读取中…')}</code>
            <button class="text-btn" type="button" data-action="open-folder">打开 ${icon('external', 13)}</button>
          </div>
          <div class="data-actions">
            <button class="btn btn-secondary" type="button" data-action="export-backup">${icon('download', 16)}<span>导出备份</span></button>
            <button class="btn btn-secondary" type="button" data-action="import-backup">${icon('upload', 16)}<span>导入备份</span></button>
            <button class="btn btn-secondary" type="button" data-action="export-csv">${icon('file', 16)}<span>导出 CSV</span></button>
          </div>
          <p class="field-help">备份包含已存航段的完整计划详情与备注，不包含原始 SimBrief JSON。原始数据可在航段详情中单独导出。</p>
          <div class="danger-row">
            <div>
              <strong>清空全部飞行记录</strong>
              <p>删除所有游戏会话、航段与计划文件，保留设置。</p>
            </div>
            <button class="btn btn-danger-soft" type="button" data-action="clear-logs">清空日志</button>
          </div>
        </section>

        <section class="panel settings-card settings-about">
          <div class="settings-card-head">
            <span class="settings-icon">${icon('info', 20)}</span>
            <div>
              <h2>关于 SkyLog</h2>
              <p>一个安静、本地的 SimBrief 飞行日志。</p>
            </div>
          </div>
          <div class="about-brand">
            <span class="about-logo">${icon('plane', 30)}</span>
            <div><strong>SkyLog 航迹</strong><span>版本 ${esc(info.version || '1.0.0')} · Electron ${esc(info.electron || '—')}</span></div>
          </div>
          <p class="about-copy">SkyLog 通过 SimBrief 提供的公开接口读取飞行计划。飞行计划内容归 SimBrief / Navigraph 所有。地图轮廓与国界来自 Natural Earth 的 1:50m 公共领域数据，不依赖在线瓦片服务。</p>
          <div class="about-links">
            <button class="text-btn" type="button" data-link="https://www.simbrief.com">SimBrief ${icon('external', 13)}</button>
            <button class="text-btn" type="button" data-link="https://www.navigraph.com">Navigraph ${icon('external', 13)}</button>
            <button class="text-btn" type="button" data-link="https://www.naturalearthdata.com/">Natural Earth ${icon('external', 13)}</button>
          </div>
          <p class="about-fineprint">SkyLog 不是 SimBrief 或 Navigraph 的官方产品。请遵守 SimBrief 的使用条款，不要高频批量读取计划。</p>
        </section>
      </div>
    </div>`;
  }

  segment(label, key, value, options) {
    return `<div class="setting-row">
      <span class="setting-label">${esc(label)}</span>
      <div class="segmented" role="group" aria-label="${esc(label)}">
        ${options
          .map(
            ([optionValue, optionLabel]) =>
              `<button type="button" class="${value === optionValue ? 'is-active' : ''}" data-setting="${key}" data-value="${optionValue}">${esc(optionLabel)}</button>`,
          )
          .join('')}
      </div>
    </div>`;
  }

  toggle(label, description, key, value) {
    return `<div class="toggle-row">
      <div><strong>${esc(label)}</strong><span>${esc(description)}</span></div>
      <button class="switch ${value ? 'is-on' : ''}" type="button" role="switch" aria-checked="${value ? 'true' : 'false'}" data-toggle="${key}" aria-label="${esc(label)}"><span></span></button>
    </div>`;
  }

  testHtml() {
    if (this.testing) {
      return `<div class="test-result is-loading">${icon('loading', 18)}<span>正在连接 SimBrief…</span></div>`;
    }
    if (this.testError) {
      return `<div class="test-result is-error">${icon('alert', 18)}<span>${esc(this.testError)}</span></div>`;
    }
    if (!this.testResult) {
      return '<div class="test-result is-idle">' + icon('wifi', 17) + '<span>还没有测试连接。</span></div>';
    }
    const { plan, meta } = this.testResult;
    return `<div class="test-result is-success">
      <span class="test-check">${icon('checkCircle', 18)}</span>
      <div>
        <strong>连接成功 · ${esc(plan.origin?.iata || plan.origin?.icao)} → ${esc(plan.destination?.iata || plan.destination?.icao)}</strong>
        <span>${esc(plan.flightNumber || plan.callsign)} · ${esc(plan.aircraft?.name || plan.aircraft?.icao)} · ${esc(formatDistance(plan.route?.distanceNm, this.app.settings.distanceUnit))} · 生成于 ${esc(utcDateTime(meta?.generatedAt))}Z</span>
      </div>
      <button class="text-btn" type="button" data-action="import-test">导入 ${icon('arrowRight', 14)}</button>
    </div>`;
  }

  bind() {
    const savePilot = async () => {
      const input = this.root.querySelector('#pilot-id-input');
      const error = this.root.querySelector('#pilot-error');
      const value = input.value.trim();
      if (value && !/^[A-Za-z0-9_-]+$/.test(value)) {
        error.textContent = 'Pilot ID 只允许数字、字母、下划线和连字符。';
        error.hidden = false;
        input.focus();
        return;
      }
      error.hidden = true;
      this.savingPilot = true;
      try {
        const result = await api.updateSettings({ pilotId: value });
        this.app.library = result.library;
        this.app.refresh();
        toast(value ? 'Pilot ID 已保存' : 'Pilot ID 已清除', { type: 'success' });
      } catch (err) {
        error.textContent = errorMessage(err);
        error.hidden = false;
      } finally {
        this.savingPilot = false;
      }
    };
    this.root.querySelector('[data-action="save-pilot"]')?.addEventListener('click', savePilot);
    this.root.querySelector('#pilot-id-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        savePilot();
      }
    });

    this.root.querySelector('[data-action="test-pilot"]')?.addEventListener('click', () => this.testConnection());
    this.root.querySelector('[data-action="import-test"]')?.addEventListener('click', () => {
      const pilotId = this.testResult?.meta?.pilotId || this.app.settings.pilotId;
      this.app.openImport({ query: pilotId || '' });
    });

    this.root.querySelectorAll('[data-setting]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.classList.contains('is-active')) return;
        await this.app.updateSettings({ [button.dataset.setting]: button.dataset.value });
      });
    });
    this.root.querySelectorAll('[data-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        const key = button.dataset.toggle;
        await this.app.updateSettings({ [key]: !this.app.settings[key] });
      });
    });

    this.root.querySelector('[data-action="open-folder"]')?.addEventListener('click', async () => {
      try {
        const result = await api.openDataFolder();
        if (!result.opened) toast('无法打开数据文件夹', { type: 'error' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });
    this.root.querySelector('[data-action="export-backup"]')?.addEventListener('click', async () => {
      try {
        const result = await api.exportBackup();
        if (!result.canceled) toast(`已导出 ${result.flights} 个航段`, { type: 'success', title: '备份完成' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });
    this.root.querySelector('[data-action="import-backup"]')?.addEventListener('click', async () => {
      try {
        const result = await api.importBackup();
        if (result.canceled) return;
        this.app.library = result.library;
        this.app.pickInitialFlight();
        this.app.refresh();
        toast(`已导入 ${result.imported} 个航段`, { type: 'success', title: '备份已恢复' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });
    this.root.querySelector('[data-action="export-csv"]')?.addEventListener('click', async () => {
      try {
        const result = await api.exportCsv();
        if (!result.canceled) toast('CSV 已导出', { type: 'success' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });
    this.root.querySelector('[data-action="clear-logs"]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '清空全部飞行记录',
        message: '确定删除所有游戏会话与航段吗？',
        detail: '计划详情、原始 SimBrief 数据与备注都会删除。设置会保留，操作无法撤销。',
        confirmText: '永久删除',
        danger: true,
      });
      if (!ok) return;
      try {
        const result = await api.clearFlights();
        this.app.library = result.library;
        this.app.state.activeFlightId = null;
        this.app.refresh();
        toast('飞行记录已清空', { type: 'success' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });

    this.root.querySelectorAll('[data-link]').forEach((button) => {
      button.addEventListener('click', () => this.app.openExternal(button.dataset.link));
    });
  }

  async testConnection() {
    const input = this.root.querySelector('#pilot-id-input');
    const query = input.value.trim() || this.app.settings.pilotId;
    const error = this.root.querySelector('#pilot-error');
    if (!query) {
      error.textContent = '请先填写 Pilot ID。';
      error.hidden = false;
      input.focus();
      return;
    }
    this.testing = true;
    this.testError = '';
    this.testResult = null;
    const target = this.root.querySelector('#simbrief-test');
    if (target) target.innerHTML = this.testHtml();
    try {
      const result = await api.fetchPlan(query);
      this.testResult = result;
      this.testing = false;
      if (target) target.innerHTML = this.testHtml();
      this.bindTestResult();
      toast('SimBrief 连接成功', { type: 'success' });
    } catch (err) {
      this.testing = false;
      this.testError = errorMessage(err);
      if (target) target.innerHTML = this.testHtml();
    }
  }

  bindTestResult() {
    this.root.querySelector('[data-action="import-test"]')?.addEventListener('click', () => {
      this.app.openImport();
    });
  }
}
