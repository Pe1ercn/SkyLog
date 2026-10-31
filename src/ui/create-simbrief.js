import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { t } from '../lib/i18n.js';
import {
  buildSimBriefPrefillUrl,
  composeSummary,
  validateCreateFields,
} from '../lib/simbrief-create.js';
import { openModal, toast } from './components.js';

function localDefaults(app) {
  const latest = app.latestFlight();
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`;
  return {
    origin: latest?.origin?.icao || '',
    destination: latest?.destination?.icao || '',
    aircraft: latest?.aircraft?.icao || '',
    airline: '',
    flightNumber: '',
    date,
    time,
    route: '',
    alternate: '',
    callsign: '',
    passengers: '',
  };
}

function fieldLabel(key, zh, en) {
  return `<label class="create-label" for="create-${key}">${t(zh, en)}</label>`;
}

function fieldInput(key, value, options = {}) {
  return `<input class="field-input create-input" id="create-${key}" data-create-field="${key}" value="${esc(value)}" ${options.attrs || ''} maxlength="${options.maxlength || 64}" autocomplete="off" />`;
}

export function openCreateSimbrief(app, options = {}) {
  const state = {
    fields: localDefaults(app),
    errors: {},
    opened: false,
    busy: false,
  };
  let handle;

  const render = (shell) => {
    const errors = Object.entries(state.errors);
    shell.innerHTML = `
      <div class="create-shell">
        <div class="create-intro">
          <span class="create-badge">${icon('sparkles', 15)} ${t('创建飞行计划', 'CREATE A FLIGHT')}</span>
          <p>${t('先在 SkyLog 里整理好航线，再交给 SimBrief 生成 OFP。生成后可以直接导入日志。', 'Prepare the flight in SkyLog, then generate the OFP in SimBrief and import it into your log.')}</p>
        </div>
        <div class="create-grid">
          <div class="create-field">${fieldLabel('origin', '起飞机场', 'Origin')}${fieldInput('origin', state.fields.origin, { attrs: 'placeholder="CYUL" inputmode="text"', maxlength: 4 })}<small class="create-error">${esc(state.errors.origin || '')}</small></div>
          <div class="create-field">${fieldLabel('destination', '到达机场', 'Destination')}${fieldInput('destination', state.fields.destination, { attrs: 'placeholder="KLAX"', maxlength: 4 })}<small class="create-error">${esc(state.errors.destination || '')}</small></div>
          <div class="create-field">${fieldLabel('aircraft', '机型', 'Aircraft')}${fieldInput('aircraft', state.fields.aircraft, { attrs: 'placeholder="B738"', maxlength: 4 })}<small class="create-error">${esc(state.errors.aircraft || '')}</small></div>
          <div class="create-field">${fieldLabel('airline', '航司代码', 'Airline')}${fieldInput('airline', state.fields.airline, { attrs: 'placeholder="ACA"', maxlength: 3 })}<small class="create-error">${esc(state.errors.airline || '')}</small></div>
          <div class="create-field">${fieldLabel('flightNumber', '航班号', 'Flight number')}${fieldInput('flightNumber', state.fields.flightNumber, { attrs: 'placeholder="123"', maxlength: 8 })}<small class="create-error">${esc(state.errors.flightNumber || '')}</small></div>
          <div class="create-field">${fieldLabel('callsign', '呼号', 'Callsign')}${fieldInput('callsign', state.fields.callsign, { attrs: 'placeholder="ACA123"', maxlength: 12 })}<small class="create-error">${esc(state.errors.callsign || '')}</small></div>
          <div class="create-field">${fieldLabel('date', '日期', 'Date')}${fieldInput('date', state.fields.date, { attrs: 'type="date"', maxlength: 10 })}<small class="create-error">${esc(state.errors.date || '')}</small></div>
          <div class="create-field">${fieldLabel('time', '起飞时间', 'Departure time')}${fieldInput('time', state.fields.time, { attrs: 'type="time"', maxlength: 5 })}<small class="create-error">${esc(state.errors.time || '')}</small></div>
          <div class="create-field is-wide">${fieldLabel('route', '航路（可选）', 'Route (optional)')}${fieldInput('route', state.fields.route, { attrs: 'placeholder="DCT KESKA DCT SAVEX Q806 KANUR"', maxlength: 1200 })}<small class="create-error">${esc(state.errors.route || '')}</small></div>
          <div class="create-field">${fieldLabel('alternate', '备降场（可选）', 'Alternate (optional)')}${fieldInput('alternate', state.fields.alternate, { attrs: 'placeholder="KLAX"', maxlength: 4 })}<small class="create-error">${esc(state.errors.alternate || '')}</small></div>
          <div class="create-field">${fieldLabel('passengers', '旅客（可选）', 'Passengers (optional)')}${fieldInput('passengers', state.fields.passengers, { attrs: 'placeholder="166" inputmode="numeric"', maxlength: 3 })}<small class="create-error">${esc(state.errors.passengers || '')}</small></div>
        </div>
        ${errors.length ? `<div class="create-error-box">${icon('alert', 15)}<span>${t('请先修正标红的字段。', 'Fix the highlighted fields first.')}</span></div>` : ''}
        <div class="create-note">
          ${icon('info', 15)}
          <span>${t('SimBrief 会打开新建航班页面；登录并生成 OFP 后，回到 SkyLog 导入最新计划。SkyLog 不会保存你的 SimBrief 密码。', 'SimBrief opens its new-flight page. Sign in, generate the OFP, then return to SkyLog and import the latest plan. SkyLog never stores your SimBrief password.')}</span>
        </div>
        <div class="create-actions">
          <button class="btn btn-secondary" type="button" data-create-action="copy">${icon('copy', 15)}<span>${t('复制摘要', 'Copy brief')}</span></button>
          <button class="btn btn-primary" type="button" data-create-action="open">${icon('external', 15)}<span>${t('打开 SimBrief', 'Open SimBrief')}</span></button>
          ${state.opened ? `<button class="btn btn-secondary" type="button" data-create-action="import">${icon('download', 15)}<span>${t('导入最新 OFP', 'Import latest OFP')}</span></button>` : ''}
        </div>
        ${state.opened ? `<div class="create-ready">${icon('checkCircle', 16)} ${t('已打开 SimBrief。生成计划后，点「导入最新 OFP」继续。', 'SimBrief opened. After generating the plan, choose Import latest OFP.')}</div>` : ''}
        ${options.returnToImport ? `<div class="create-ready is-muted">${t('生成后也可以手动回到「导入 SimBrief」并读取你的 Pilot ID。', 'You can also return to Import SimBrief and read your Pilot ID.')}</div>` : ''}
      </div>`;
  };

  const validateAndOpen = async (shell) => {
    const result = validateCreateFields(state.fields);
    state.errors = result.errors;
    render(shell);
    if (!result.valid) return;
    try {
      state.busy = true;
      const url = buildSimBriefPrefillUrl(state.fields);
      await api.openExternal(url);
      state.opened = true;
      state.busy = false;
      render(shell);
    } catch (error) {
      state.busy = false;
      toast(error.message || t('无法打开 SimBrief', 'Could not open SimBrief'), { type: 'error' });
    }
  };

  handle = openModal({
    title: t('创建 SimBrief 计划', 'Create a SimBrief plan'),
    subtitle: t('整理航线，交给 SimBrief 生成 OFP。', 'Prepare the route, then generate the OFP in SimBrief.'),
    className: 'create-modal',
    body: '<div class="create-host"></div>',
    onMount: ({ modal }) => {
      const shell = modal.querySelector('.create-host');
      render(shell);
      shell.addEventListener('input', (event) => {
        const field = event.target.closest('[data-create-field]');
        if (!field) return;
        state.fields[field.dataset.createField] = field.value;
      });
      shell.addEventListener('click', (event) => {
        const action = event.target.closest('[data-create-action]')?.dataset.createAction;
        if (!action) return;
        if (action === 'open') validateAndOpen(shell);
        else if (action === 'copy') {
          api.copyText(composeSummary(state.fields)).then(() => toast(t('摘要已复制', 'Brief copied'), { type: 'success' })).catch(() => {});
        } else if (action === 'import') {
          const pilotId = app.settings.pilotId || '';
          handle.close();
          if (!pilotId) {
            toast(t('请先在设置中填写 Pilot ID，再导入最新计划。', 'Add your Pilot ID in Settings before importing the latest plan.'), { type: 'error' });
            return;
          }
          app.openImport({ query: pilotId });
        }
      });
    },
  });
  return handle;
}
