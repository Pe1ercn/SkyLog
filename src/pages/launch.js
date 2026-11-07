import { icon } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { getLanguage, t } from '../lib/i18n.js';
import { AIRLINES, FACTS } from '../data/aviation.js';
import airchina from '../assets/aviation/airchina.svg';
import csair from '../assets/aviation/csair.svg';
import ceair from '../assets/aviation/ceair.svg';
import shenzhen from '../assets/aviation/shenzhen.svg';
import hainan from '../assets/aviation/hainan.svg';
import xiamen from '../assets/aviation/xiamen.svg';
import shanghai from '../assets/aviation/shanghai.svg';

const IMAGES = {
  airchina, csair, ceair, shenzhen, hainan, xiamen, shanghai,
};

const FAMILIES = [
  { id: 'xplane', name: 'X-Plane', variants: '11 / 12', mark: 'XP', tone: 'xplane' },
  { id: 'msfs', name: 'Microsoft Flight Simulator', variants: '2020 / 2024', mark: 'MSFS', tone: 'msfs' },
];

export class LaunchPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.selectedFamily = null;
    this.knowledgeTab = 'airlines';
    this.airlineIndex = 0;
    this.factIndex = 0;
    this.bound = false;
    this.familyPinned = false;
  }

  mount() {
    this.update();
  }

  show() {
    this.update();
  }

  update() {
    if (!this.app.library) return;
    const games = this.app.games || [];
    if (!this.selectedFamily) {
      this.selectedFamily = this.app.selectedGame?.family || games[0]?.family || 'xplane';
    } else if (!this.familyPinned && games.length && this.familyGames(this.selectedFamily).length === 0) {
      this.selectedFamily = this.app.selectedGame?.family || games[0]?.family || this.selectedFamily;
    }
    this.root.innerHTML = this.html();
    this.bind();
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

  gameSubtitle(game) {
    if (!game) return '';
    if (game.source === 'steam') return t('Steam 库', 'Steam library');
    if (game.kind === 'appx') return t('Microsoft Store', 'Microsoft Store');
    if (game.source === 'registry') return t('安装记录', 'Registry');
    return t('本机安装', 'Local install');
  }

  html() {
    const lang = getLanguage();
    const games = this.app.games || [];
    const active = this.activeGame();
    const scanning = this.app.gamesScanning;
    const xplaneCount = this.familyGames('xplane').length;
    const msfsCount = this.familyGames('msfs').length;
    const selectedFamilyCount = this.selectedFamily === 'xplane' ? xplaneCount : msfsCount;
    const familyOptions = FAMILIES.map((family) => {
      const count = family.id === 'xplane' ? xplaneCount : msfsCount;
      return `<button class="sim-family ${this.selectedFamily === family.id ? 'is-active' : ''} tone-${family.tone}" type="button" data-launch-action="family" data-family="${family.id}">
        <span class="sim-family-mark">${family.mark}</span>
        <span class="sim-family-copy"><strong>${family.name}</strong><small>${family.variants}</small></span>
        <span class="sim-family-count">${count}</span>
      </button>`;
    }).join('');

    const gameOptions = this.familyGames(this.selectedFamily)
      .map((game, index) => {
        const activeOption = active && game.target === active.target;
        return `<button class="launch-game-option ${activeOption ? 'is-active' : ''}" type="button" data-launch-action="select" data-game-index="${index}">
          <span class="launch-game-icon">${icon(this.selectedFamily === 'xplane' ? 'navigation' : 'plane', 16)}</span>
          <span class="launch-game-copy"><strong>${esc(game.title)}</strong><small>${esc(this.gameSubtitle(game))}${game.source === 'steam' ? ' · Steam' : ''}</small></span>
          <span class="launch-game-check">${activeOption ? icon('checkCircle', 16) : icon('chevronRight', 15)}</span>
        </button>`;
      })
      .join('');

    const launchButton = active
      ? `<button class="launch-primary" type="button" data-launch-action="launch" ${scanning ? 'disabled' : ''}>
          <span class="launch-primary-orb">${icon(scanning ? 'loading' : 'play', 24)}</span>
          <span class="launch-primary-copy">
            <small>${scanning ? t('正在全盘搜索…', 'Scanning drives…') : t('准备起飞', 'READY FOR DEPARTURE')}</small>
            <strong>${t('启动', 'Launch')} ${esc(active.title)}</strong>
            <em>${esc(this.gameSubtitle(active))}${active.source === 'steam' && this.app.appInfo?.platform === 'darwin' ? t(' · 通过 Steam 启动', ' · via Steam') : ''}</em>
          </span>
          <span class="launch-primary-arrow">${icon('arrowRight', 20)}</span>
        </button>`
      : `<div class="launch-empty">
          ${icon('gamepad', 28)}
          <strong>${t('还没有找到这个系列的游戏', 'No game found in this family yet')}</strong>
          <span>${t('首次启动会自动全盘搜索；也可以手动选择游戏本体。', 'The first launch scans your drives; you can also choose the game manually.')}</span>
          <div class="launch-empty-actions">
            <button class="btn btn-secondary" type="button" data-launch-action="scan">${icon('scan', 15)} ${t('全盘搜索', 'Scan drives')}</button>
            <button class="btn btn-secondary" type="button" data-launch-action="pick">${icon('folder', 15)} ${t('手动选择', 'Choose manually')}</button>
          </div>
        </div>`;

    return `<div class="launch-page">
      <header class="page-head launch-head">
        <div>
          <p class="eyebrow">FLIGHT DECK · ${esc(new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN', { month: 'long', day: 'numeric' }))}</p>
          <h1>${t('准备起飞', 'Ready for departure')}</h1>
          <p class="page-sub">${t('选择模拟器，启动游戏，再让 SkyLog 记录这一段航程。', 'Choose a simulator, launch it, and let SkyLog keep the flight.')}</p>
        </div>
        <div class="launch-head-status">
          <span class="launch-status-dot ${scanning ? 'is-scanning' : games.length ? 'is-ready' : ''}"></span>
          <span>${scanning ? t('全盘搜索中', 'Scanning drives') : games.length ? t(`${games.length} 个游戏就绪`, `${games.length} games ready`) : t('等待游戏', 'Waiting for a game')}</span>
        </div>
      </header>

      <div class="launch-layout">
        <section class="panel launch-panel">
          <div class="launch-panel-head">
            <div>
              <p class="eyebrow">SIMULATOR</p>
              <h2>${t('选择你的天空', 'Choose your sky')}</h2>
            </div>
            <button class="text-btn" type="button" data-launch-action="scan">${icon('scan', 14)} ${t('重新搜索', 'Rescan')}</button>
          </div>
          <div class="sim-family-grid">${familyOptions}</div>
          ${scanning ? `<div class="launch-scan-strip"><span class="launch-scan-pulse"></span><span>${t('首次启动正在全盘搜索游戏本体…', 'First-launch full drive scan in progress…')}</span></div>` : ''}
          <div class="launch-stage">
            <div class="launch-stage-copy">
              <span class="launch-stage-label">${t('当前选择', 'CURRENT SELECTION')}</span>
              <strong>${active ? esc(active.title) : t('未选择游戏', 'No game selected')}</strong>
              <small>${active ? esc(active.path || active.target) : t('检测后会在这里显示游戏本体位置', 'The detected game path will appear here')}</small>
            </div>
            <span class="launch-stage-badge">${active ? (active.source === 'steam' ? 'STEAM' : active.kind === 'appx' ? 'STORE' : 'LOCAL') : '—'}</span>
          </div>
          ${launchButton}
          <div class="launch-game-list">${gameOptions || `<div class="launch-list-empty">${t('这个系列暂时没有可用条目。', 'No entries in this family yet.')}</div>`}</div>
          <div class="launch-secondary-actions">
            <button class="btn btn-secondary" type="button" data-launch-action="scan">${icon('scan', 15)}<span>${t('全盘搜索', 'Scan drives')}</span></button>
            <button class="btn btn-secondary" type="button" data-launch-action="pick">${icon('folder', 15)}<span>${t('手动选择', 'Choose manually')}</span></button>
            ${selectedFamilyCount ? `<span class="launch-found-note">${t(`本系列已发现 ${selectedFamilyCount} 个`, `${selectedFamilyCount} found in this family`)}</span>` : ''}
          </div>
        </section>

        <aside class="panel knowledge-panel">
          <div class="knowledge-head">
            <div>
              <p class="eyebrow">AVIATION DESK</p>
              <h2>${t('航空小课堂', 'Aviation desk')}</h2>
            </div>
            <div class="knowledge-tabs">
              <button class="${this.knowledgeTab === 'airlines' ? 'is-active' : ''}" type="button" data-knowledge-action="tab" data-tab="airlines">${t('航司', 'Airlines')}</button>
              <button type="button" data-action="gallery">${t('飞机图库', 'Gallery')} ${icon('arrowRight', 12)}</button>
            </div>
          </div>
          ${this.airlineHtml()}
          ${this.factHtml()}
        </aside>
      </div>
    </div>`;
  }

  airlineHtml() {
    const lang = getLanguage();
    const item = AIRLINES[this.airlineIndex % AIRLINES.length];
    const name = lang === 'en' ? item.nameEn : item.name;
    const note = lang === 'en' ? item.noteEn : item.note;
    return `<div class="knowledge-feature">
      <div class="knowledge-image-wrap is-airline">
        <img src="${IMAGES[item.image]}" alt="${esc(name)}" />
        <span class="knowledge-image-code">${esc(item.code)}</span>
        <span class="knowledge-image-caption">${t('原创主题卡 · 非官方标识', 'Original theme card · not an official logo')}</span>
      </div>
      <div class="knowledge-feature-head">
        <div><span class="knowledge-kicker">${esc(item.alliance)} · ${esc(item.hub)}</span><h3>${esc(name)}</h3></div>
        <span class="knowledge-index">${String(this.airlineIndex + 1).padStart(2, '0')} / ${String(AIRLINES.length).padStart(2, '0')}</span>
      </div>
      <div class="knowledge-specs is-airline">
        <div class="is-wide"><span>${t('枢纽', 'Hub')}</span><strong>${esc(item.hub)}</strong></div>
        <div><span>${t('联盟', 'Alliance')}</span><strong>${esc(item.alliance)}</strong></div>
        <div class="is-wide"><span>${t('常见机队', 'Typical fleet')}</span><strong>${esc(item.fleet)}</strong></div>
      </div>
      <p class="knowledge-note">${esc(note)}</p>
      <div class="knowledge-cycle">
        <button class="text-btn" type="button" data-knowledge-action="airline-prev">${icon('arrowLeft', 14)} ${t('上一家', 'Previous')}</button>
        <div class="knowledge-dots">${AIRLINES.map((_, index) => `<i class="${index === this.airlineIndex ? 'is-active' : ''}"></i>`).join('')}</div>
        <button class="text-btn" type="button" data-knowledge-action="airline-next">${t('下一家', 'Next')} ${icon('arrowRight', 14)}</button>
      </div>
    </div>`;
  }

  factHtml() {
    const lang = getLanguage();
    const fact = FACTS[this.factIndex % FACTS.length];
    return `<div class="knowledge-fact">
      <span class="knowledge-fact-icon">${icon('sparkles', 16)}</span>
      <div><small>${t('飞行小知识', 'AVIATION NOTE')}</small><p>${esc(lang === 'en' ? fact.en : fact.zh)}</p></div>
      <button class="icon-btn" type="button" data-knowledge-action="fact-next" aria-label="${t('换一条', 'Next fact')}">${icon('refresh', 14)}</button>
    </div>`;
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener('click', async (event) => {
      const launchAction = event.target.closest('[data-launch-action]')?.dataset.launchAction;
      if (launchAction) {
        if (launchAction === 'family') {
          this.familyPinned = true;
          this.selectedFamily = event.target.closest('[data-family]')?.dataset.family || this.selectedFamily;
          this.update();
        } else if (launchAction === 'select') {
          const button = event.target.closest('[data-game-index]');
          const games = this.familyGames(this.selectedFamily);
          const game = games[Number(button?.dataset.gameIndex)];
          if (game) {
            this.familyPinned = true;
            await this.app.updateSettings({ game });
          }
        } else if (launchAction === 'launch') {
          await this.app.launchGame(this.activeGame());
        } else if (launchAction === 'scan') {
          await this.app.scanAllGames({ force: true });
        } else if (launchAction === 'pick') {
          await this.app.pickGame();
          this.update();
        }
        return;
      }
      const knowledgeAction = event.target.closest('[data-knowledge-action]')?.dataset.knowledgeAction;
      if (!knowledgeAction) return;
      if (knowledgeAction === 'tab') {
        this.knowledgeTab = event.target.closest('[data-tab]')?.dataset.tab || 'airlines';
      } else if (knowledgeAction === 'airline-prev') {
        this.airlineIndex = (this.airlineIndex - 1 + AIRLINES.length) % AIRLINES.length;
      } else if (knowledgeAction === 'airline-next') {
        this.airlineIndex = (this.airlineIndex + 1) % AIRLINES.length;
      } else if (knowledgeAction === 'fact-next') {
        this.factIndex = (this.factIndex + 1) % FACTS.length;
      }
      this.update();
    });
  }
}
