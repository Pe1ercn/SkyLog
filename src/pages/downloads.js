import { icon } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { getLanguage, t } from '../lib/i18n.js';
import { MARKETPLACE } from '../data/marketplace.js';
import { errorMessage, toast } from '../ui/components.js';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatEta(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export class DownloadsPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.family = 'msfs';
    this.version = 'all';
    this.bound = false;
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
  }

  items() {
    return MARKETPLACE.filter((item) => item.family === this.family
      && (this.version === 'all' || item.version === this.version || item.version === 'both'));
  }

  html() {
    const lang = getLanguage();
    const tasks = [...this.app.downloads.values()].sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt || '') || 0);
    const defaultPath = this.app.settings.downloadPath || this.app.appInfo?.downloadPath || '';
    const community = this.app.communityFolders || {};
    const versions = this.family === 'msfs' ? ['all', '2020', '2024'] : ['all', '11', '12'];
    return `<div class="downloads-page">
      <header class="page-head">
        <div>
          <p class="eyebrow">HANGAR · DOWNLOADS</p>
          <h1>${t('下载与安装', 'Downloads & installs')}</h1>
          <p class="page-sub">${t('从 FlyByWire、FlightSim.to、飞行宝获取机模和插件，下载后按类型安装到社区或打开安装器。', 'Get aircraft and add-ons from FlyByWire, FlightSim.to and Feixingbao; install to Community or open the installer.')}</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" data-download-action="choose-folder">${icon('folder', 16)} ${t('下载位置', 'Download folder')}</button>
        </div>
      </header>

      <div class="download-path-bar">
        <span>${icon('download', 15)} ${t('默认下载位置', 'Default download path')}</span>
        <code title="${esc(defaultPath)}">${esc(defaultPath || t('尚未选择', 'Not selected'))}</code>
        <button class="text-btn" type="button" data-download-action="open-folder">${t('打开', 'Open')} ${icon('external', 13)}</button>
      </div>

      <div class="download-filters">
        <div class="segmented">
          <button type="button" class="${this.family === 'msfs' ? 'is-active' : ''}" data-download-family="msfs">MSFS</button>
          <button type="button" class="${this.family === 'xplane' ? 'is-active' : ''}" data-download-family="xplane">X-Plane</button>
        </div>
        <div class="segmented segmented-small">
          ${versions.map((value) => `<button type="button" class="${this.version === value ? 'is-active' : ''}" data-download-version="${value}">${value === 'all' ? t('全部', 'All') : value}</button>`).join('')}
        </div>
        <span class="download-source-note">${icon('info', 14)} ${t('FlightSim.to / 飞行宝需登录，按钮会打开来源页面。', 'FlightSim.to / Feixingbao require sign-in; the button opens the source page.')}</span>
      </div>

      <div class="download-grid">
        ${this.items().map((item) => this.itemCard(item, lang, community)).join('')}
      </div>

      <section class="panel download-tasks-panel">
        <div class="settings-card-head">
          <span class="settings-icon">${icon('download', 20)}</span>
          <div><h2>${t('下载任务', 'Download queue')}</h2><p>${t('所有任务都会显示在右下角的下载圆形按钮中。', 'Every task also appears in the floating download button.')}</p></div>
        </div>
        <div class="download-task-list">
          ${tasks.length ? tasks.map((task) => this.taskRow(task)).join('') : `<div class="download-empty">${icon('cloud', 24)}<span>${t('还没有下载任务', 'No downloads yet')}</span></div>`}
        </div>
      </section>
    </div>`;
  }

  itemCard(item, lang, community) {
    const name = lang === 'en' ? item.nameEn : item.name;
    const description = lang === 'en' ? item.descriptionEn : item.description;
    const installed = item.family === 'xplane' ? community.xplane : community.msfs;
    return `<article class="download-card">
      <div class="download-card-top">
        <span class="download-source">${esc(item.source)}</span>
        <span class="download-type">${esc(item.type)}</span>
      </div>
      <div class="download-card-main">
        <div class="download-card-icon ${item.family === 'xplane' ? 'is-xplane' : ''}">${icon(item.family === 'xplane' ? 'navigation' : 'plane', 24)}</div>
        <div><h3>${esc(name)}</h3><p>${esc(description)}</p></div>
      </div>
      <div class="download-card-meta">
        <span>${item.version === 'both'
          ? (item.family === 'xplane' ? 'X-Plane 11/12' : 'MSFS 2020/2024')
          : `${item.family === 'xplane' ? 'X-Plane ' : 'MSFS '}${esc(item.version)}`}</span>
        <span>${esc(item.size)}</span>
        ${installed ? `<span class="is-ok">${icon('checkCircle', 12)} ${t('社区已定位', 'Community found')}</span>` : ''}
      </div>
      <div class="download-card-actions">
        ${item.direct
          ? `<button class="btn btn-primary btn-small" type="button" data-download-action="start" data-id="${item.id}">${icon('download', 15)} ${t('下载', 'Download')}</button>`
          : item.install === 'plugin'
            ? `<button class="btn btn-primary btn-small" type="button" data-download-action="telemetry" data-family="${item.family}">${icon('plug', 15)} ${t('安装遥测插件', 'Install bridge')}</button>`
            : `<button class="btn btn-secondary btn-small" type="button" data-download-action="source" data-id="${item.id}">${icon('external', 15)} ${t('打开来源', 'Open source')}</button>`}
        ${item.sourcePage ? `<button class="btn btn-ghost btn-small" type="button" data-download-action="source" data-id="${item.id}">${t('来源页', 'Source page')} ${icon('external', 12)}</button>` : ''}
      </div>
    </article>`;
  }

  taskRow(task) {
    const percent = Math.round((task.progress || 0) * 100);
    const done = task.status === 'completed';
    const failed = task.status === 'failed' || task.status === 'cancelled';
    return `<div class="download-task ${done ? 'is-done' : ''} ${failed ? 'is-failed' : ''}">
      <div class="download-task-icon">${done ? icon('checkCircle', 18) : failed ? icon('xCircle', 18) : icon('loading', 18)}</div>
      <div class="download-task-copy">
        <strong>${esc(task.filename || task.url)}</strong>
        <span>${done ? t('下载完成', 'Complete') : failed ? (task.error || t('已取消', 'Cancelled')) : `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)} · ${formatBytes(task.speedBps || 0)}/s · ${formatEta(task.etaSeconds)}`}</span>
        <div class="download-progress"><i style="width:${done ? 100 : percent}%"></i></div>
      </div>
      <div class="download-task-actions">
        ${done ? `<button class="btn btn-secondary btn-small" type="button" data-download-action="install" data-id="${task.id}">${icon('folder', 14)} ${t('安装', 'Install')}</button>` : ''}
        ${task.status === 'downloading' ? `<button class="icon-btn" type="button" data-download-action="cancel" data-id="${task.id}" aria-label="${t('取消', 'Cancel')}">${icon('x', 15)}</button>` : ''}
      </div>
    </div>`;
  }

  updateTask(task) {
    if (!task?.id || !this.app.downloads.has(task.id)) return;
    this.app.downloads.set(task.id, task);
    const list = this.root.querySelector('.download-task-list');
    if (!list) return;
    const tasks = [...this.app.downloads.values()];
    list.innerHTML = tasks.length
      ? tasks.map((item) => this.taskRow(item)).join('')
      : `<div class="download-empty">${icon('cloud', 24)}<span>${t('还没有下载任务', 'No downloads yet')}</span></div>`;
  }

  bind() {
    if (this.bound) return;
    this.bound = true;    this.root.addEventListener('click', async (event) => {
      const family = event.target.closest('[data-download-family]')?.dataset.downloadFamily;
      if (family) { this.family = family; this.version = 'all'; this.update(); return; }
      const version = event.target.closest('[data-download-version]')?.dataset.downloadVersion;
      if (version) { this.version = version; this.update(); return; }
      const button = event.target.closest('[data-download-action]');
      if (!button) return;
      const action = button.dataset.downloadAction;
      const item = MARKETPLACE.find((entry) => entry.id === button.dataset.id);
      if (action === 'start' && item) {
        try {
          await this.app.startDownload({
            url: item.url,
            family: item.family,
            targetDir: this.app.settings.downloadPath || this.app.appInfo?.downloadPath,
          });
        } catch (error) { toast(errorMessage(error), { type: 'error' }); }
      } else if (action === 'source' && item) {
        this.app.openExternal(item.sourcePage || item.url);
      } else if (action === 'telemetry') {
        await this.app.installTelemetry(button.dataset.family || this.family);
      } else if (action === 'choose-folder') {
        try {
          const result = await this.app.chooseDownloadFolder();
          if (!result.canceled) this.update();
        } catch (error) { toast(errorMessage(error), { type: 'error' }); }
      } else if (action === 'open-folder') {
        await this.app.openDownloadFolder();
      } else if (action === 'cancel') {
        await this.app.cancelDownload(button.dataset.id);
      } else if (action === 'install') {
        const task = this.app.downloads.get(button.dataset.id);
        if (task) {
          const result = await this.app.installDownloaded(task, task.family);
          if (result) this.update();
        }
      }
    });
  }
}
