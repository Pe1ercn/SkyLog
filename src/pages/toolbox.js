import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { getLanguage, t } from '../lib/i18n.js';
import {
  THEMES,
  getTheme,
  themeBackgroundUri,
} from '../lib/themes.js';
import { errorMessage, toast } from '../ui/components.js';

export class ToolboxPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.bound = false;
    this.importing = false;
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

  html() {
    const settings = this.app.settings;
    const lang = getLanguage();
    const current = getTheme(settings.theme, settings.themeUnlocks || []);
    const unlocks = new Set(['default', ...(settings.themeUnlocks || [])]);
    const customImage = settings.backgroundImage || '';
    const currentBg = customImage || themeBackgroundUri(current);
    const opacity = Math.round((Number(settings.backgroundOpacity) || 0) * 100);

    return `<div class="toolbox-page">
      <header class="page-head">
        <div>
          <p class="eyebrow">TOOLBOX · PERSONALISE</p>
          <h1>${t('工具箱', 'Toolbox')}</h1>
          <p class="page-sub">${t('用航空主题、背景图和界面细节，把 SkyLog 变成你的驾驶舱。', 'Make SkyLog your own cockpit with airline themes, backgrounds and interface details.')}</p>
        </div>
        <span class="settings-saved">${icon('checkCircle', 15)} ${t('自动保存', 'Autosaved')}</span>
      </header>

      <div class="toolbox-layout">
        <section class="panel toolbox-themes">
          <div class="settings-card-head">
            <span class="settings-icon">${icon('palette', 20)}</span>
            <div>
              <h2>${t('航司背景 UI', 'Airline UI themes')}</h2>
              <p>${t('输入 16 位兑换码解锁；主题会改变应用主色、菜单图标和非地图背景。', 'Unlock with a 16-character code. Themes change accent colours, menu icons and the non-map backdrop.')}</p>
            </div>
          </div>
          <div class="theme-grid">
            ${THEMES.map((theme) => this.themeCard(theme, unlocks, current.id)).join('')}
          </div>
        </section>

        <aside class="toolbox-side">
          <section class="panel toolbox-background">
            <div class="settings-card-head">
              <span class="settings-icon">${icon('image', 20)}</span>
              <div>
                <h2>${t('背景图', 'Background')}</h2>
                <p>${t('地图页面会保持干净；其余界面使用这张背景。', 'The map stays clear; the rest of the app uses this backdrop.')}</p>
              </div>
            </div>
            <div class="background-preview" style="background-image:url(&quot;${esc(currentBg)}&quot;)">
              <span>${customImage ? t('自定义图片', 'Custom image') : (lang === 'en' ? current.nameEn : current.nameZh)}</span>
              <em>${opacity}% ${t('不透明度', 'opacity')}</em>
            </div>
            <div class="background-actions">
              <button class="btn btn-secondary" type="button" data-toolbox-action="import-bg" ${this.importing ? 'disabled' : ''}>
                ${icon(this.importing ? 'loading' : 'upload', 15)}<span>${this.importing ? t('正在读取…', 'Reading…') : t('导入背景图', 'Import image')}</span>
              </button>
              ${customImage ? `<button class="btn btn-ghost" type="button" data-toolbox-action="clear-bg">${t('恢复主题背景', 'Use theme backdrop')}</button>` : ''}
            </div>
            <div class="setting-row">
              <span class="setting-label">${t('背景不透明度', 'Background opacity')}</span>
              <div class="range-field">
                <input id="toolbox-bg-opacity" type="range" min="0" max="100" step="1" value="${opacity}" aria-label="${t('背景不透明度', 'Background opacity')}" />
                <span id="toolbox-bg-opacity-value">${opacity}%</span>
              </div>
            </div>
            <p class="field-help">${t('支持 PNG、JPG、WEBP、GIF，最大 8 MB。图片只保存在本机。', 'PNG, JPG, WEBP and GIF up to 8 MB. Images stay on this computer.')}</p>
          </section>

          <section class="panel toolbox-download">
            <div class="settings-card-head">
              <span class="settings-icon">${icon('download', 20)}</span>
              <div>
                <h2>${t('URL 下载', 'URL download')}</h2>
                <p>${t('粘贴下载地址，自动识别文件名并多线程下载到保存路径。', 'Paste a URL; SkyLog detects the filename and downloads with multiple connections.')}</p>
              </div>
            </div>
            <div class="field-row">
              <label class="field-label" for="toolbox-download-url">${t('下载地址', 'Download URL')}</label>
              <input id="toolbox-download-url" class="field-input" type="url" placeholder="https://…" autocomplete="off" />
            </div>
            <div class="data-path toolbox-download-path">
              <span>${icon('folder', 15)} ${t('保存到', 'Save to')}</span>
              <code title="${esc(settings.downloadPath || this.app.appInfo?.downloadPath || '')}">${esc(settings.downloadPath || this.app.appInfo?.downloadPath || t('未选择', 'Not selected'))}</code>
              <button class="text-btn" type="button" data-toolbox-action="choose-download">${t('更改', 'Change')} ${icon('external', 13)}</button>
            </div>
            <button class="btn btn-primary btn-wide" type="button" data-toolbox-action="start-download">${icon('download', 15)} ${t('开始多线程下载', 'Start multi-thread download')}</button>
          </section>

          <section class="panel toolbox-about">
            <div class="settings-card-head">
              <span class="settings-icon">${icon('shield', 20)}</span>
              <div>
                <h2>${t('关于主题', 'About themes')}</h2>
                <p>${t('主题是对航空公司公开配色的原创演绎，不代表任何航空公司。', 'Themes are original interpretations of public airline colours and do not represent any airline.')}</p>
              </div>
            </div>
            <p class="about-fineprint">${t('本应用无任何商业行为，如有侵权请联系删改。', 'This application has no commercial purpose. If anything infringes, please contact us for removal.')}</p>
          </section>
        </aside>
      </div>
    </div>`;
  }

  themeCard(theme, unlocks, activeId) {
    const unlocked = unlocks.has(theme.id);
    const active = activeId === theme.id;
    const lang = getLanguage();
    const name = lang === 'en' ? theme.nameEn : theme.nameZh;
    const airline = lang === 'en' ? theme.airlineEn : theme.airlineZh;
    return `<article class="theme-card ${active ? 'is-active' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'}" style="--theme-swatch:${theme.primary};--theme-swatch-soft:${theme.soft}">
      <div class="theme-card-visual">
        <span class="theme-code-mark">${theme.logo}</span>
        <span class="theme-status">${active ? t('使用中', 'Active') : unlocked ? t('已解锁', 'Unlocked') : icon('lock', 13)}</span>
      </div>
      <div class="theme-card-copy">
        <h3>${esc(name)}</h3>
        <p>${esc(theme.nameEn === theme.nameZh ? theme.nameZh : (lang === 'en' ? theme.nameZh : theme.nameEn))}</p>
        <small>${esc(airline)}</small>
      </div>
      ${active
        ? `<button class="btn btn-primary btn-small" type="button" disabled>${icon('checkCircle', 14)} ${t('已应用', 'Applied')}</button>`
        : unlocked
          ? `<button class="btn btn-secondary btn-small" type="button" data-toolbox-action="apply" data-theme-id="${theme.id}">${t('应用主题', 'Apply theme')}</button>`
          : `<div class="theme-unlock">
              <input id="theme-code-${theme.id}" class="field-input" maxlength="16" autocomplete="off" spellcheck="false" placeholder="${t('16 位兑换码', '16-character code')}" aria-label="${esc(name)} ${t('兑换码', 'code')}" />
              <button class="btn btn-primary btn-small" type="button" data-toolbox-action="unlock" data-theme-id="${theme.id}">${t('解锁', 'Unlock')}</button>
            </div>`}
    </article>`;
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-toolbox-action]')?.dataset.toolboxAction;
      if (!action) return;
      if (action === 'apply') {
        const themeId = event.target.closest('[data-theme-id]')?.dataset.themeId;
        if (themeId) await this.app.updateSettings({ theme: themeId });
      } else if (action === 'unlock') {
        const button = event.target.closest('[data-theme-id]');
        const theme = THEMES.find((item) => item.id === button?.dataset.themeId);
        const input = this.root.querySelector(`#theme-code-${theme?.id}`);
        if (!theme || !input) return;
        const entered = input.value.trim().toUpperCase();
        if (entered !== theme.code) {
          input.classList.add('is-invalid');
          input.focus();
          toast(t('兑换码不正确。', 'That code is not correct.'), { type: 'error' });
          return;
        }
        input.classList.remove('is-invalid');
        const unlocks = [...new Set([...(this.app.settings.themeUnlocks || ['default']), theme.id])];
        const saved = await this.app.updateSettings({ themeUnlocks: unlocks, theme: theme.id });
        if (saved) toast(t(`${theme.nameZh} 主题已解锁`, `${theme.nameEn} theme unlocked`), { type: 'success', title: t('主题已解锁', 'Theme unlocked') });
      } else if (action === 'import-bg') {
        this.importing = true;
        this.update();
        try {
          const result = await api.importBackground();
          if (!result.canceled && result.dataUrl) {
            await this.app.updateSettings({ backgroundImage: result.dataUrl });
            toast(t('背景图已导入', 'Background imported'), { type: 'success' });
          }
        } catch (error) {
          toast(errorMessage(error), { type: 'error' });
        } finally {
          this.importing = false;
          this.update();
        }
      } else if (action === 'clear-bg') {
        await this.app.updateSettings({ backgroundImage: '' });
        toast(t('已恢复主题背景', 'Theme backdrop restored'), { type: 'success' });
      } else if (action === 'choose-download') {
        const result = await this.app.chooseDownloadFolder();
        if (!result.canceled) this.update();
      } else if (action === 'start-download') {
        const input = this.root.querySelector('#toolbox-download-url');
        const url = String(input?.value || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          toast(t('请输入有效的 http(s) 下载地址', 'Enter a valid http(s) download URL'), { type: 'error' });
          input?.focus();
          return;
        }
        try {
          await this.app.startDownload({ url });
          toast(t('已加入下载队列', 'Added to the download queue'), { type: 'success' });
        } catch (error) {
          toast(errorMessage(error), { type: 'error' });
        }
      }
    });

    this.root.addEventListener('input', (event) => {
      if (event.target.id !== 'toolbox-bg-opacity') return;
      const value = Number(event.target.value);
      const label = this.root.querySelector('#toolbox-bg-opacity-value');
      if (label) label.textContent = `${value}%`;
      document.documentElement.style.setProperty('--theme-bg-opacity', String(value / 100));
    });
    this.root.addEventListener('change', async (event) => {
      if (event.target.id !== 'toolbox-bg-opacity') return;
      await this.app.updateSettings({ backgroundOpacity: Number(event.target.value) / 100 });
    });
  }
}
