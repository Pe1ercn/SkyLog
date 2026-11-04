import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { openModal, toast } from './components.js';
import appreciationImage from '../assets/appreciation.jpg';

const QQ_GROUP = '967512206';

export function openAppreciation(app, options = {}) {
  const firstRun = Boolean(options.firstRun);
  let showGroup = !firstRun;
  let handle;

  let currentHandle;
  currentHandle = openModal({
    title: firstRun ? '感谢你使用 SkyLog 航迹' : 'SkyLog 支持与交流',
    subtitle: firstRun ? '如果它帮到了你，欢迎请作者喝杯咖啡。' : '感谢每一位支持 SkyLog 的飞行爱好者。',
    className: 'appreciation-modal',
    body: '<div class="appreciation-host"></div>',
    onMount: ({ modal }) => {
      const host = modal.querySelector('.appreciation-host');
      const render = () => {
        host.innerHTML = `
          <div class="appreciation-card">
            <div class="appreciation-copy">
              <span class="appreciation-kicker">${icon('heart', 15)} THANK YOU</span>
              <h3>${showGroup ? '欢迎加入 SkyLog 交流群' : '如果 SkyLog 帮到了你，欢迎赞赏支持'}</h3>
              <p>${showGroup
                ? '更多插件、模型、主题和飞行数据玩法会在群里更新。'
                : 'SkyLog 会继续免费维护。你的支持会用于测试机型、下载插件和改善飞行体验。'}</p>
              ${showGroup
                ? `<div class="appreciation-group"><small>QQ 群号</small><strong>${QQ_GROUP}</strong><span>+QQ群获取更多</span></div>
                   <button class="btn btn-secondary btn-block" type="button" data-appreciation-action="copy-group">${icon('copy', 15)} 复制群号</button>`
                : `<div class="appreciation-image-wrap"><img src="${appreciationImage}" alt="SkyLog 赞赏码" /></div>
                   <p class="appreciation-fineprint">赞赏完全自愿，不影响任何功能。</p>
                   <button class="btn btn-primary btn-block" type="button" data-appreciation-action="supported">${icon('heart', 15)} 我已赞赏</button>`}
            </div>
            ${showGroup ? `<div class="appreciation-group-art">${icon('users', 30)}</div>` : ''}
          </div>`;
      };
      render();
      host.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-appreciation-action]')?.dataset.appreciationAction;
        if (!action) return;
        if (action === 'copy-group') {
          try {
            await api.copyText(QQ_GROUP);
            toast('群号已复制', { type: 'success' });
          } catch {
            toast('复制失败，请手动记下群号', { type: 'error' });
          }
        } else if (action === 'supported') {
          showGroup = true;
          render();
          try {
            await app.updateSettings({ appreciationSeen: true });
          } catch {
            // The acknowledgement is still visible for this session.
          }
        }
      });
    },
  });
  handle = currentHandle;
  return handle;
}
