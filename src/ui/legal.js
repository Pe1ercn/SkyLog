import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { USER_AGREEMENT, DISCLAIMER, LEGAL_VERSION } from '../data/legal.js';
import { openModal, toast } from './components.js';

function sectionHtml(section) {
  return `<section class="legal-section"><h3>${section.heading}</h3><p>${section.body}</p></section>`;
}

function documentHtml(doc, active) {
  return `<article class="legal-document ${active ? 'is-active' : ''}" data-legal-document="${doc === USER_AGREEMENT ? 'agreement' : 'disclaimer'}">
    <div class="legal-meta">
      <span>生效日期 / Effective</span><strong>${doc.effectiveDate}</strong>
      <span>版本 / Version</span><strong>${doc.version}</strong>
    </div>
    ${doc.sections.map(sectionHtml).join('')}
  </article>`;
}

export function openLegal(app, options = {}) {
  const firstRun = Boolean(options.firstRun);
  const active = options.tab === 'disclaimer' ? 'disclaimer' : 'agreement';
  let current = active;
  return openModal({
    title: firstRun ? '开始使用 SkyLog 前，请阅读并同意' : '协议与免责声明',
    subtitle: firstRun
      ? '本软件是面向飞行模拟的本地工具，不是真实飞行或导航设备。'
      : `当前版本 ${LEGAL_VERSION} · 可在设置中随时重新阅读`,
    className: 'legal-modal',
    dismissible: !firstRun,
    body: `<div class="legal-shell">
      <div class="legal-tabs">
        <button type="button" class="${active === 'agreement' ? 'is-active' : ''}" data-legal-tab="agreement">用户使用协议</button>
        <button type="button" class="${active === 'disclaimer' ? 'is-active' : ''}" data-legal-tab="disclaimer">免责声明</button>
      </div>
      <div class="legal-scroll" tabindex="0">
        ${documentHtml(USER_AGREEMENT, active === 'agreement')}
        ${documentHtml(DISCLAIMER, active === 'disclaimer')}
      </div>
      <div class="legal-foot">
        ${firstRun
          ? `<p class="legal-firstrun-note">继续即表示你已阅读、理解并同意上述协议与免责声明。若不同意，应用将退出。</p>
             <div class="legal-actions">
               <button class="btn btn-danger-soft" type="button" data-legal-action="decline">不同意并退出</button>
               <button class="btn btn-primary" type="button" data-legal-action="accept">${icon('check', 15)} 同意并开始使用</button>
             </div>`
          : `<p class="legal-firstrun-note">协议内容仅用于说明软件使用条款；如涉及具体法律问题，请咨询专业人士。</p>
             <div class="legal-actions"><button class="btn btn-secondary" type="button" data-legal-action="close">关闭</button></div>`}
      </div>
    </div>`,
    onMount: ({ modal, close }) => {
      const showTab = (tab) => {
        current = tab;
        modal.querySelectorAll('[data-legal-tab]').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.legalTab === tab);
        });
        modal.querySelectorAll('[data-legal-document]').forEach((article) => {
          article.classList.toggle('is-active', article.dataset.legalDocument === tab);
        });
        modal.querySelector('.legal-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
      };
      modal.querySelectorAll('[data-legal-tab]').forEach((button) => {
        button.addEventListener('click', () => showTab(button.dataset.legalTab));
      });
      modal.querySelector('.legal-shell')?.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-legal-action]')?.dataset.legalAction;
        if (!action) return;
        if (action === 'close') {
          close();
          return;
        }
        if (action === 'decline') {
          await api.quitApp();
          return;
        }
        if (action === 'accept') {
          try {
            await app.updateSettings({
              legalAccepted: true,
              legalVersion: LEGAL_VERSION,
              legalAcceptedAt: new Date().toISOString(),
            });
            close(true);
            toast('已同意用户使用协议与免责声明', { type: 'success' });
            if (!app.settings.appreciationSeen) {
              setTimeout(() => import('./appreciation.js').then(({ openAppreciation }) => openAppreciation(app, { firstRun: true })), 500);
            }
          } catch (error) {
            toast(error?.message || '保存协议同意状态失败', { type: 'error' });
          }
        }
      });
    },
  });
}
