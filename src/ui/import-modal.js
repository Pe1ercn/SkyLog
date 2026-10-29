import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import {
  airportCodePrimary,
  airportDisplayName,
  dateAt,
  dateCN,
  esc,
  formatAltitude,
  formatDistance,
  formatDuration,
  monthDayCN,
  timeAt,
  utcDateTime,
  zoneLabel,
} from '../lib/format.js';
import { openModal, errorMessage, toast } from './components.js';

export function openImportModal(app, options = {}) {
  const state = {
    query: options.query || app.settings.pilotId || '',
    preview: null,
    loading: false,
    importing: false,
    error: '',
    duplicate: null,
    mode: 'new',
    sessionId: options.initialSessionId || '',
    allowDuplicate: false,
  };
  if (options.initialSessionId && app.findSession(options.initialSessionId)) {
    state.mode = 'existing';
  } else {
    const latestSession = app
      .sessionsSorted()
      .find((session) => {
        const flights = app.flightsForSession(session.id);
        if (!flights.length) return false;
        const latest = flights[flights.length - 1];
        return latest.createdAt && Date.now() - new Date(latest.createdAt).getTime() < 12 * 3600 * 1000;
      });
    if (latestSession) {
      state.mode = 'existing';
      state.sessionId = latestSession.id;
    }
  }

  let handle;
  handle = openModal({
    className: 'import-modal',
    body: '<div class="import-shell"></div>',
    onMount: ({ modal }) => {
      const shell = modal.querySelector('.import-shell');
      const render = () => {
        if (state.loading) renderLoading(shell);
        else if (state.error) renderError(shell, state.error);
        else if (state.preview) renderPreview(shell);
        else renderForm(shell);
      };
      const setError = (message) => {
        state.loading = false;
        state.error = message;
        render();
      };
      const runFetch = async () => {
        const input = shell.querySelector('#simbrief-query');
        if (input) state.query = input.value;
        const query = state.query.trim();
        if (!query) {
          setError('请输入 SimBrief Pilot ID，或粘贴计划链接。');
          shell.querySelector('input')?.focus();
          return;
        }
        state.query = query;
        state.loading = true;
        state.error = '';
        state.duplicate = null;
        render();
        try {
          const result = await api.fetchPlan(query);
          if (!document.body.contains(shell)) return;
          state.preview = result;
          state.loading = false;
          state.error = '';
          render();
        } catch (error) {
          if (!document.body.contains(shell)) return;
          setError(errorMessage(error));
        }
      };
      const runImport = async (allowDuplicate = false) => {
        if (!state.preview || state.importing) return;
        if (state.mode === 'existing' && !state.sessionId) {
          toast('请选择要加入的游戏会话', { type: 'error' });
          return;
        }
        state.importing = true;
        state.duplicate = null;
        render();
        try {
          const result = await api.importPlan({
            token: state.preview.token,
            sessionMode: state.mode,
            sessionId: state.mode === 'existing' ? state.sessionId : '',
            allowDuplicate,
          });
          let library = result.library;
          const pilotId = state.preview.meta?.pilotId;
          if (
            pilotId &&
            app.settings.pilotId !== pilotId &&
            (!app.settings.pilotId || app.settings.pilotId === pilotId)
          ) {
            try {
              const settingsResult = await api.updateSettings({ pilotId });
              library = settingsResult.library;
            } catch {
              // The imported flight is more important than remembering the ID.
            }
          }
          state.importing = false;
          handle.close();
          options.onImported?.({ ...result, library });
        } catch (error) {
          state.importing = false;
          if (error.code === 'duplicate-plan') {
            state.duplicate = error.details || {};
            render();
          } else {
            toast(errorMessage(error), { type: 'error' });
            render();
          }
        }
      };

      shell.addEventListener('click', (event) => {
        const action = event.target.closest('[data-import-action]')?.dataset.importAction;
        if (!action) return;
        if (action === 'fetch') runFetch();
        else if (action === 'back') {
          state.preview = null;
          state.error = '';
          state.duplicate = null;
          render();
        } else if (action === 'import') runImport(false);
        else if (action === 'force-import') runImport(true);
        else if (action === 'retry') runFetch();
        else if (action === 'recent') {
          const input = shell.querySelector('#simbrief-query');
          if (input) {
            input.value = app.settings.pilotId;
            state.query = app.settings.pilotId;
            input.focus();
          }
        }
      });
      shell.addEventListener('change', (event) => {
        if (event.target.name === 'session-mode') {
          state.mode = event.target.value;
          if (state.mode === 'existing' && !state.sessionId) {
            state.sessionId = app.sessionsSorted()[0]?.id || '';
          }
          render();
        } else if (event.target.name === 'session-id') {
          state.sessionId = event.target.value;
        }
      });
      shell.addEventListener('input', (event) => {
        if (event.target.id === 'simbrief-query') state.query = event.target.value;
      });
      shell.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.target.id === 'simbrief-query' || event.target.id === 'simbrief-plan-id')) {
          event.preventDefault();
          runFetch();
        }
      });

      render();

      function renderLoading(target) {
        target.innerHTML = `<div class="import-loading">
          <div class="import-loading-art">
            <span class="loading-route"></span>
            <span class="loading-plane">${icon('plane', 24)}</span>
          </div>
          <h2>正在读取 SimBrief</h2>
          <p>连接 simbrief.com，获取最新一份 OFP…</p>
          <span class="loading-bar"><i></i></span>
        </div>`;
      }

      function renderError(target, message) {
        target.innerHTML = `<div class="import-error">
          <span class="import-error-icon">${icon('alert', 26)}</span>
          <h2>读取失败</h2>
          <p>${esc(message)}</p>
          <div class="import-error-actions">
            <button class="btn btn-secondary" type="button" data-import-action="back">返回修改</button>
            <button class="btn btn-primary" type="button" data-import-action="retry">${icon('refresh', 16)} 再试一次</button>
          </div>
          <p class="import-hint">请确认 Pilot ID 正确，并先在 SimBrief 生成一份飞行计划。</p>
        </div>`;
      }

      function renderForm(target) {
        const hasPilot = Boolean(app.settings.pilotId);
        target.innerHTML = `<div class="import-form">
          <header class="import-head">
            <span class="import-mark">${icon('plane', 24)}</span>
            <div>
              <p class="eyebrow">IMPORT FROM SIMBRIEF</p>
              <h2>读取一份飞行计划</h2>
              <p>输入 Pilot ID，或粘贴 SimBrief 计划链接。SkyLog 会读取最新一份 OFP。</p>
            </div>
          </header>
          <label class="field-label" for="simbrief-query">SimBrief Pilot ID / 计划链接</label>
          <div class="import-input-row">
            <span class="import-input-icon">${icon('link', 18)}</span>
            <input id="simbrief-query" class="field-input" type="text" autocomplete="off" spellcheck="false" placeholder="例如 123456" value="${esc(state.query)}" autofocus />
            <button class="btn btn-primary" type="button" data-import-action="fetch">${icon('refresh', 16)} 读取计划</button>
          </div>
          ${hasPilot ? `<button class="recent-pilot" type="button" data-import-action="recent">${icon('clock', 14)} 使用上次的 ID <strong>${esc(app.settings.pilotId)}</strong></button>` : ''}
          <div class="import-features">
            <span>${icon('check', 15)} 航班号与呼号</span>
            <span>${icon('check', 15)} 起降机场</span>
            <span>${icon('check', 15)} 航路与航点</span>
            <span>${icon('check', 15)} 机型与巡航高度</span>
          </div>
          <p class="import-hint">SkyLog 只调用 SimBrief 的公开读取接口，不保存你的 SimBrief 密码。读取频率请保持克制。</p>
        </div>`;
      }

      function renderPreview(target) {
        const { plan, meta } = state.preview;
        const settings = app.settings;
        const departure = timeAt(plan.times?.scheduledOut, plan.origin?.timezoneHours || 0, settings.timeMode);
        const arrival = timeAt(plan.times?.scheduledIn, plan.destination?.timezoneHours || 0, settings.timeMode);
        const departureDate = plan.times?.scheduledOut
          ? dateAt(plan.times.scheduledOut, plan.origin?.timezoneHours || 0, settings.timeMode)
          : '';
        const arrivalDate = plan.times?.scheduledIn
          ? dateAt(plan.times.scheduledIn, plan.destination?.timezoneHours || 0, settings.timeMode)
          : '';
        const date = departureDate ? dateCN(departureDate) : '日期待定';
        const arrivalPrefix = arrivalDate && arrivalDate !== departureDate ? `${monthDayCN(arrivalDate)} ` : '';
        const sessions = app.sessionsSorted();
        const existingOptions = sessions
          .map((session) => {
            const count = app.flightsForSession(session.id).length;
            return `<option value="${esc(session.id)}" ${state.sessionId === session.id ? 'selected' : ''}>${esc(session.name)} · ${count} 段</option>`;
          })
          .join('');
        const warnings = plan.warnings || [];
        target.innerHTML = `<div class="import-preview">
          <header class="preview-head">
            <div>
              <p class="eyebrow">PLAN READY · ${esc(meta?.source === 'static_id' ? 'SHARED OFP' : 'SIMBRIEF OFP')}</p>
              <h2>计划已读取</h2>
            </div>
            <button class="text-btn" type="button" data-import-action="back">${icon('arrowLeft', 14)} 换一份</button>
          </header>
          <div class="preview-hero">
            <div class="preview-route">
              <div>
                <span class="preview-code">${esc(airportCodePrimary(plan.origin))}</span>
                <span class="preview-iata">${esc(plan.origin?.iata || '—')}</span>
              </div>
              <span class="preview-route-line">${icon('plane', 17)}</span>
              <div class="is-arrival">
                <span class="preview-code">${esc(airportCodePrimary(plan.destination))}</span>
                <span class="preview-iata">${esc(plan.destination?.iata || '—')}</span>
              </div>
            </div>
            <p class="preview-names">${esc(airportDisplayName(plan.origin?.name, ''))} ${icon('arrowRight', 12)} ${esc(airportDisplayName(plan.destination?.name, ''))}</p>
            <div class="preview-meta">
              <span>${esc(plan.flightNumber || plan.callsign || '—')}</span>
              <i></i>
              <span>${esc(plan.aircraft?.name || plan.aircraft?.icao || '—')}</span>
              <i></i>
              <span>${esc(date)} · ${esc(departure)} → ${esc(arrivalPrefix)}${esc(arrival)}</span>
            </div>
          </div>
          <div class="preview-stats">
            <div><span>航路距离</span><strong>${esc(formatDistance(plan.route?.distanceNm, settings.distanceUnit))}</strong></div>
            <div><span>巡航高度</span><strong>${esc(formatAltitude(plan.cruise?.initialAltitudeFt, settings.altitudeUnit, { flightLevel: true }))}</strong></div>
            <div><span>计划时间</span><strong>${esc(formatDuration(plan.times?.blockSec ? plan.times.blockSec / 60 : null, 'compact'))}</strong></div>
            <div><span>航点</span><strong>${plan.navlog?.count || 0}</strong></div>
          </div>
          <div class="preview-route-text">
            <span>${icon('route', 14)} 航路</span>
            <p>${esc(plan.route?.text || '直飞')}</p>
          </div>
          ${warnings.length ? `<div class="preview-warning">${icon('alert', 15)}<div>${warnings.map((warning) => `<span>${esc(warning)}</span>`).join('')}</div></div>` : ''}

          <section class="preview-session">
            <div class="preview-section-head">
              <h3>这次飞行属于哪次游戏？</h3>
              <span>同一次游戏产生的多个起降，可以选择同一个会话。</span>
            </div>
            <div class="session-choice-grid">
              <label class="session-choice ${state.mode === 'new' ? 'is-selected' : ''}">
                <input type="radio" name="session-mode" value="new" ${state.mode === 'new' ? 'checked' : ''} />
                <span class="session-choice-icon">${icon('plus', 18)}</span>
                <span><strong>新的游戏会话</strong><em>从这一段开始新的一次游戏</em></span>
                <span class="session-radio"></span>
              </label>
              <label class="session-choice ${state.mode === 'existing' ? 'is-selected' : ''} ${sessions.length ? '' : 'is-disabled'}">
                <input type="radio" name="session-mode" value="existing" ${state.mode === 'existing' ? 'checked' : ''} ${sessions.length ? '' : 'disabled'} />
                <span class="session-choice-icon">${icon('layers', 18)}</span>
                <span><strong>加入现有游戏</strong><em>${sessions.length ? '与之前某个航段属于同一次游戏' : '还没有可加入的游戏会话'}</em></span>
                <span class="session-radio"></span>
              </label>
            </div>
            ${state.mode === 'existing' && sessions.length
              ? `<label class="session-select-row"><span>选择游戏会话</span><select class="field-input" name="session-id">${existingOptions}</select></label>`
              : ''}
            <p class="preview-session-hint">${icon('info', 14)} 导入后仍可以在飞行日志里移动航段或合并游戏。</p>
          </section>

          ${state.duplicate ? `<div class="duplicate-warning">
            ${icon('alert', 16)}
            <div><strong>这份计划已经导入过</strong><span>如果要记录同一份计划的另一个架次，可以仍然导入。</span></div>
            <button class="btn btn-secondary btn-small" type="button" data-import-action="force-import">仍然导入</button>
          </div>` : ''}

          <footer class="preview-actions">
            <span class="preview-source">${icon('link', 14)} ${esc(meta?.pilotId ? `Pilot ID ${meta.pilotId}` : 'SimBrief')} · ${esc(utcDateTime(plan.generatedAt) || '')}Z</span>
            <div>
              <button class="btn btn-ghost" type="button" data-import-action="back">取消</button>
              <button class="btn btn-primary btn-wide" type="button" data-import-action="import" ${state.importing ? 'disabled' : ''}>
                ${state.importing ? icon('loading', 16) + ' 正在导入…' : icon('download', 16) + ' 导入到日志'}
              </button>
            </div>
          </footer>
        </div>`;
      }
    },
  });
  return handle;
}
