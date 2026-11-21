import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { openModal } from './components.js';

export function openClosePrompt(app, options = {}) {
  let selected = options.action === 'quit' ? 'quit' : 'tray';
  let handled = false;
  const modal = openModal({
    title: '关闭 SkyLog',
    subtitle: '选择这次要直接退出，还是收进系统托盘继续在后台待命。',
    className: 'close-modal',
    dismissible: false,
    body: `<div class="close-choice" role="radiogroup" aria-label="关闭方式">
      <button class="close-option ${selected === 'quit' ? 'is-selected' : ''}" type="button" data-close-action="quit">
        <span class="close-option-icon">${icon('power', 19)}</span>
        <span><strong>直接退出</strong><small>关闭窗口并结束 SkyLog 进程</small></span>
        <i></i>
      </button>
      <button class="close-option ${selected === 'tray' ? 'is-selected' : ''}" type="button" data-close-action="tray">
        <span class="close-option-icon">${icon('tray', 19)}</span>
        <span><strong>收进系统托盘</strong><small>保持后台运行，可从托盘重新打开</small></span>
        <i></i>
      </button>
    </div>
    <label class="close-save"><input type="checkbox" id="close-save-choice" /> <span>保存我的选择，以后不再询问</span></label>
    <div class="close-actions">
      <button class="btn btn-secondary" type="button" data-close-action="cancel">取消</button>
      <button class="btn btn-primary" type="button" data-close-action="confirm">确认</button>
    </div>`,
    onMount: ({ modal: node, close }) => {
      const sync = () => {
        node.querySelectorAll('[data-close-action="quit"], [data-close-action="tray"]').forEach((button) => {
          button.classList.toggle('is-selected', button.dataset.closeAction === selected);
        });
      };
      node.addEventListener('click', (event) => {
        const target = event.target.closest('[data-close-action]');
        if (!target) return;
        const action = target.dataset.closeAction;
        if (action === 'quit' || action === 'tray') {
          selected = action;
          sync();
          return;
        }
        if (action === 'cancel') {
          handled = true;
          api.respondClose({ action: 'cancel' }).catch(() => {});
          close();
          return;
        }
        if (action === 'confirm') {
          handled = true;
          const save = Boolean(node.querySelector('#close-save-choice')?.checked);
          api.respondClose({ action: selected, save }).catch(() => {});
          close();
        }
      });
    },
    onClose: () => {
      if (!handled) api.respondClose({ action: 'cancel' }).catch(() => {});
    },
  });
  return modal;
}
