const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('skylog', {
  fetchPlan: (query) => invoke('simbrief:fetch', query),
  importPlan: (payload) => invoke('simbrief:import', payload),
  getLibrary: () => invoke('library:get'),
  updateFlight: (id, patch) => invoke('library:updateFlight', { id, patch }),
  deleteFlight: (id) => invoke('library:deleteFlight', { id }),
  createSession: (name) => invoke('library:createSession', { name }),
  updateSession: (id, patch) => invoke('library:updateSession', { id, patch }),
  deleteSession: (id, deleteFlights) => invoke('library:deleteSession', { id, deleteFlights }),
  moveFlights: (ids, targetSessionId) =>
    invoke('library:moveFlights', { ids, targetSessionId }),
  mergeSessions: (sessionIds, targetSessionId) =>
    invoke('library:mergeSessions', { sessionIds, targetSessionId }),
  updateSettings: (patch) => invoke('library:updateSettings', { patch }),
  clearFlights: () => invoke('library:clearFlights'),
  getFlightPlan: (id) => invoke('plan:get', { id }),
  getRawPlan: (id) => invoke('plan:raw', { id }),
  exportRawPlan: (id) => invoke('plan:exportRaw', { id }),
  exportBackup: () => invoke('data:exportBackup'),
  exportCsv: () => invoke('data:exportCsv'),
  importBackup: () => invoke('data:importBackup'),
  openDataFolder: () => invoke('data:openFolder'),
  openExternal: (url) => invoke('app:openExternal', { url }),
  copyText: (text) => invoke('app:copyText', { text }),
  getAppInfo: () => invoke('app:info'),
  detectGames: () => invoke('games:detect'),
  scanAllGames: () => invoke('games:scanAll'),
  pickGame: () => invoke('games:pick'),
  launchGame: (game) => invoke('games:launch', { game }),
  importBackground: () => invoke('app:importBackground'),
  getCommunityFolders: () => invoke('community:detect'),
  chooseCommunityFolder: (family) => invoke('community:choose', { family }),
  setCommunityFolder: (family, folder) => invoke('community:set', { family, folder }),
  startTelemetry: (payload) => invoke('telemetry:start', payload),
  stopTelemetry: () => invoke('telemetry:stop'),
  saveTelemetry: (payload) => invoke('telemetry:save', payload),
  getTelemetryDiagnostics: () => invoke('telemetry:diagnostics'),
  onTelemetryStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('telemetry:status', listener);
    return () => ipcRenderer.removeListener('telemetry:status', listener);
  },
  startDownload: (payload) => invoke('downloads:start', payload),
  listDownloads: () => invoke('downloads:list'),
  cancelDownload: (id) => invoke('downloads:cancel', { id }),
  chooseDownloadFolder: () => invoke('downloads:chooseFolder'),
  openDownloadFolder: (folder) => invoke('downloads:openFolder', { folder }),
  installDownload: (payload) => invoke('downloads:install', payload),
  onTelemetry: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('telemetry:update', listener);
    return () => ipcRenderer.removeListener('telemetry:update', listener);
  },
  onDownloadUpdate: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('downloads:update', listener);
    return () => ipcRenderer.removeListener('downloads:update', listener);
  },
});
