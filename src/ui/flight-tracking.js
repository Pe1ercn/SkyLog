import { icon } from '../lib/icons.js';
import { openModal, toast } from './components.js';

export function openFlightTrackingPrompt(app, flight) {
  let step = 'flown';
  let handle;

  const render = (host) => {
    if (step === 'flown') {
      host.innerHTML = `<div class="tracking-prompt">
        <span class="tracking-prompt-icon">${icon('checkCircle', 25)}</span>
        <h3>这段航程已经飞了吗？</h3>
        <p>导入的是 <strong>${flight.callsign || flight.flightNumber || '这段航班'}</strong>。如果已经完成，我可以直接把它标记为已飞；如果还没飞，我可以准备读取游戏内飞行数据。</p>
        <div class="tracking-prompt-actions">
          <button class="btn btn-secondary" type="button" data-tracking-action="flown">${icon('check', 15)} 已飞</button>
          <button class="btn btn-primary" type="button" data-tracking-action="not-flown">${icon('play', 15)} 还没飞</button>
        </div>
      </div>`;
    } else if (step === 'ask') {
      host.innerHTML = `<div class="tracking-prompt">
        <span class="tracking-prompt-icon">${icon('gauge', 25)}</span>
        <h3>是否读取飞行数据？</h3>
        <p>SkyLog 可以安装一个小型遥测插件到游戏社区文件夹，读取速度、高度、航向和飞行轨迹，并在飞行结束后生成地图轨迹和速度 / 高度 / 航向图表。</p>
        <div class="tracking-note">${icon('info', 15)} 第一次使用会安装插件；如果找不到社区文件夹，会请你手动选择。</div>
        <div class="tracking-prompt-actions">
          <button class="btn btn-secondary" type="button" data-tracking-action="later">稍后</button>
          <button class="btn btn-primary" type="button" data-tracking-action="start">${icon('gauge', 15)} 开始读取</button>
        </div>
      </div>`;
    } else if (step === 'installing') {
      host.innerHTML = `<div class="tracking-prompt">
        <span class="tracking-prompt-icon is-loading">${icon('loading', 25)}</span>
        <h3>正在准备飞行数据…</h3>
        <p>正在检查游戏社区文件夹并安装 SkyLog 遥测插件。</p>
      </div>`;
    } else if (step === 'error') {
      host.innerHTML = `<div class="tracking-prompt">
        <span class="tracking-prompt-icon is-error">${icon('alert', 25)}</span>
        <h3>暂时无法启动读取</h3>
        <p>${host.dataset.error || '请检查游戏路径与社区文件夹后重试。'}</p>
        <div class="tracking-prompt-actions"><button class="btn btn-secondary" type="button" data-tracking-action="later">关闭</button></div>
      </div>`;
    }
  };

  handle = openModal({
    title: '航程状态',
    subtitle: '把 SimBrief 计划和真实飞行连接起来。',
    className: 'tracking-modal',
    body: '<div class="tracking-host"></div>',
    onMount: ({ modal }) => {
      const host = modal.querySelector('.tracking-host');
      render(host);
      host.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-tracking-action]')?.dataset.trackingAction;
        if (!action) return;
        if (action === 'flown') {
          await app.markFlown(flight, true);
          handle.close();
        } else if (action === 'not-flown') {
          step = 'ask';
          render(host);
        } else if (action === 'later') {
          handle.close();
        } else if (action === 'start') {
          step = 'installing';
          render(host);
          const result = await app.startTracking(flight, {
            onNeedsCommunity: () => {
              step = 'error';
              host.dataset.error = '需要先选择游戏的社区文件夹。请在下载页面或设置中选择后再试。';
              render(host);
            },
          });
          if (result?.ok !== false) handle.close();
          else {
            step = 'error';
            host.dataset.error = result?.message || '请检查游戏路径与社区文件夹后重试。';
            render(host);
          }
        }
      });
    },
  });
}
