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
  pickGame: () => invoke('games:pick'),
  launchGame: (game) => invoke('games:launch', { game }),
});
