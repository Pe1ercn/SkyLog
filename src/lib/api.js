export class ApiError extends Error {
  constructor(message, code = 'api-error', details = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

const bridge = typeof window !== 'undefined' ? window.skylog : null;

export const hasBridge = Boolean(bridge);

async function call(method, ...args) {
  if (!bridge || typeof bridge[method] !== 'function') {
    throw new ApiError('SkyLog 桌面桥接未加载，请通过 SkyLog 应用打开。', 'no-bridge');
  }
  let result;
  try {
    result = await bridge[method](...args);
  } catch (error) {
    throw new ApiError(error?.message || '主进程通信失败', 'ipc-error');
  }
  if (!result || result.ok === false) {
    const payload = result?.error || {};
    throw new ApiError(payload.message || '操作失败', payload.code || 'unknown', payload.details || {});
  }
  return result;
}

export const api = {
  getLibrary: () => call('getLibrary'),
  fetchPlan: (query) => call('fetchPlan', query),
  importPlan: (payload) => call('importPlan', payload),
  updateFlight: (id, patch) => call('updateFlight', id, patch),
  deleteFlight: (id) => call('deleteFlight', id),
  createSession: (name) => call('createSession', name),
  updateSession: (id, patch) => call('updateSession', id, patch),
  deleteSession: (id, deleteFlights) => call('deleteSession', id, deleteFlights),
  moveFlights: (ids, targetSessionId) => call('moveFlights', ids, targetSessionId),
  mergeSessions: (sessionIds, targetSessionId) => call('mergeSessions', sessionIds, targetSessionId),
  updateSettings: (patch) => call('updateSettings', patch),
  clearFlights: () => call('clearFlights'),
  getFlightPlan: (id) => call('getFlightPlan', id),
  getRawPlan: (id) => call('getRawPlan', id),
  exportRawPlan: (id) => call('exportRawPlan', id),
  exportBackup: () => call('exportBackup'),
  exportCsv: () => call('exportCsv'),
  importBackup: () => call('importBackup'),
  openDataFolder: () => call('openDataFolder'),
  openExternal: (url) => call('openExternal', url),
  copyText: (text) => call('copyText', text),
  getAppInfo: () => call('getAppInfo'),
};
