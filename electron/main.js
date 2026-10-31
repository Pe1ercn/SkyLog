import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  session,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LibraryStore, StoreError, libraryToCsv } from './store.js';
import { normalizePlan, PlanError } from '../shared/plan.js';
import {
  fetchSimbriefPlan,
  parsePilotQuery,
  SimbriefError,
  toErrorPayload,
} from './simbrief.js';
import {
  GameError,
  classifyGamePath,
  detectGames,
  gameDisplaySubtitle,
  launchGame,
} from './games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const dataDirArg = process.argv.find((arg) => arg.startsWith('--data-dir='));
if (dataDirArg) {
  app.setPath('userData', path.resolve(dataDirArg.slice('--data-dir='.length)));
} else if (process.env.SKYLOG_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.SKYLOG_USER_DATA));
}

let mainWindow = null;
let store = null;
let logger = () => {};
let previewCache = new Map();
let previewTimer = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function createLogger(dir) {
  const logsDir = path.join(dir, 'logs');
  ensureDir(logsDir);
  const logFile = path.join(logsDir, 'main.log');
  return (message) => {
    try {
      const stat = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
      if (stat && stat.size > 2 * 1024 * 1024) {
        fs.renameSync(logFile, path.join(logsDir, `main-${Date.now()}.log`));
      }
      fs.appendFileSync(
        logFile,
        `${new Date().toISOString()} ${String(message).replace(/\r?\n/g, ' ')}\n`,
        'utf8',
      );
    } catch {
      // Logging must never break the app.
    }
  };
}

function sendSafeError(channel, error) {
  const payload = toErrorPayload(error);
  logger(`[ipc] ${channel} failed: ${payload.code} ${payload.message}`);
  return { ok: false, error: payload };
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...args);
      return { ok: true, ...(result || {}) };
    } catch (error) {
      return sendSafeError(channel, error);
    }
  });
}

function sanitizeFileName(value, fallback = 'SkyLog') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

function prunePreviewCache() {
  const now = Date.now();
  for (const [token, entry] of previewCache) {
    if (now - entry.createdAt > 15 * 60 * 1000) previewCache.delete(token);
  }
  while (previewCache.size > 5) {
    const oldest = [...previewCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (!oldest) break;
    previewCache.delete(oldest[0]);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#f7f9fd',
    title: 'SkyLog 航迹',
    icon: path.join(projectRoot, 'build', 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: isWindows ? 'hidden' : 'hiddenInset',
    ...(isWindows
      ? {
          titleBarOverlay: {
            color: '#f8fafd',
            symbolColor: '#334155',
            height: 46,
          },
        }
      : {
          trafficLightPosition: { x: 18, y: 17 },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      !app.isPackaged &&
      input.type === 'keyDown' &&
      input.key === 'F12'
    ) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env.SKYLOG_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexPath = path.join(projectRoot, 'dist', 'index.html');
    if (!fs.existsSync(indexPath)) {
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          '<body style="font-family:Segoe UI,Microsoft YaHei UI;padding:40px;color:#334155"><h2>SkyLog 尚未构建</h2><p>请先运行 npm run build。</p></body>',
        )}`,
      );
    } else {
      mainWindow.loadFile(indexPath);
    }
  }
}

function initIpc() {
  handle('simbrief:fetch', async (_event, input) => {
    const parsed = parsePilotQuery(input);
    const { raw, meta } = await fetchSimbriefPlan(parsed.value, { parsed });
    let plan;
    try {
      plan = normalizePlan(raw);
    } catch (error) {
      if (error instanceof PlanError) {
        throw new SimbriefError(error.message, error.code);
      }
      throw error;
    }
    prunePreviewCache();
    const token = crypto.randomUUID();
    previewCache.set(token, {
      raw,
      plan,
      meta,
      createdAt: Date.now(),
    });
    if (!previewTimer) {
      previewTimer = setInterval(prunePreviewCache, 60 * 1000);
      previewTimer.unref?.();
    }
    return { token, plan, meta };
  });

  handle('simbrief:import', async (_event, payload = {}) => {
    const entry = previewCache.get(payload.token);
    if (!entry) {
      throw new SimbriefError('计划预览已过期，请重新读取 SimBrief。', 'preview-expired');
    }
    const result = store.importPlan(entry.raw, {
      sessionMode: payload.sessionMode === 'existing' ? 'existing' : 'new',
      sessionId: payload.sessionId || '',
      allowDuplicate: Boolean(payload.allowDuplicate),
    });
    previewCache.delete(payload.token);
    logger(
      `[import] ${result.flight.callsign} ${result.flight.origin?.icao}->${result.flight.destination?.icao}`,
    );
    return {
      library: result.library,
      flight: result.flight,
      session: result.session,
    };
  });

  handle('library:get', async () => ({ library: store.getLibrary() }));

  handle('library:updateFlight', async (_event, { id, patch } = {}) => {
    return store.updateFlight(id, patch || {});
  });

  handle('library:deleteFlight', async (_event, { id } = {}) => {
    return store.deleteFlight(id);
  });

  handle('library:createSession', async (_event, { name } = {}) => {
    return store.createSession(name || '');
  });

  handle('library:updateSession', async (_event, { id, patch } = {}) => {
    return store.updateSession(id, patch || {});
  });

  handle('library:deleteSession', async (_event, { id, deleteFlights } = {}) => {
    return store.deleteSession(id, { deleteFlights: Boolean(deleteFlights) });
  });

  handle('library:moveFlights', async (_event, { ids, targetSessionId } = {}) => {
    return store.moveFlights(ids, targetSessionId);
  });

  handle('library:mergeSessions', async (_event, { sessionIds, targetSessionId } = {}) => {
    return store.mergeSessions(sessionIds, targetSessionId);
  });

  handle('library:updateSettings', async (_event, { patch } = {}) => {
    return store.updateSettings(patch || {});
  });

  handle('library:clearFlights', async () => {
    const result = store.clearFlights();
    return { library: result.library };
  });

  handle('plan:get', async (_event, { id } = {}) => {
    return store.getFlightPlan(id);
  });

  handle('plan:raw', async (_event, { id } = {}) => {
    const raw = store.getRawPlan(id);
    if (!raw) throw new StoreError('没有保存这份计划的原始数据', 'raw-missing');
    return { raw };
  });

  handle('plan:exportRaw', async (_event, { id } = {}) => {
    const raw = store.getRawPlan(id);
    if (!raw) throw new StoreError('没有保存这份计划的原始数据', 'raw-missing');
    const flight = store.findFlight(id);
    const defaultName = sanitizeFileName(
      `SkyLog-${flight?.callsign || 'plan'}-${flight?.origin?.icao || ''}-${flight?.destination?.icao || ''}.json`,
      'SkyLog-plan.json',
    );
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出原始 SimBrief JSON',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(raw, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('data:exportBackup', async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 SkyLog 日志备份',
      defaultPath: path.join(app.getPath('documents'), `SkyLog-Backup-${stamp}.json`),
      filters: [{ name: 'SkyLog 备份', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const data = store.exportBackupData(app.getVersion());
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath, flights: data.flights.length };
  });

  handle('data:exportCsv', async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出飞行日志 CSV',
      defaultPath: path.join(app.getPath('documents'), `SkyLog-Flights-${stamp}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, libraryToCsv(store.getLibrary()), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handle('data:importBackup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入 SkyLog 日志备份',
      properties: ['openFile'],
      filters: [{ name: 'SkyLog 备份', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    } catch {
      throw new StoreError('备份文件不是有效的 JSON', 'invalid-backup');
    }
    const imported = store.importBackupData(parsed);
    return { canceled: false, imported: imported.imported, library: imported.library };
  });

  handle('data:openFolder', async () => {
    const error = await shell.openPath(store.userDataPath);
    return { opened: !error, error };
  });

  handle('app:openExternal', async (_event, { url } = {}) => {
    let parsed;
    try {
      parsed = new URL(String(url || ''));
    } catch {
      throw new StoreError('链接格式无效', 'invalid-url');
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new StoreError('只允许打开网页链接', 'invalid-protocol');
    }
    await shell.openExternal(parsed.toString());
    return { opened: true };
  });

  handle('app:copyText', async (_event, { text } = {}) => {
    clipboard.writeText(String(text ?? ''));
    return { copied: true };
  });

  handle('games:detect', async () => {
    const games = await detectGames();
    return {
      games: games.map((game) => ({ ...game, subtitle: gameDisplaySubtitle(game) })),
      platform: process.platform,
    };
  });

  handle('games:pick', async () => {
    const properties = process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'];
    const filters = process.platform === 'win32'
      ? [{ name: '游戏可执行文件 / Game executable', extensions: ['exe'] }]
      : [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择游戏 / Select game',
      properties,
      filters,
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const selected = result.filePaths[0];
    const known = classifyGamePath(selected, process.platform);
    const kind = process.platform === 'darwin' || /\.app$/i.test(selected) ? 'mac-app' : 'exe';
    const game = known || {
      id: 'custom',
      title: path.basename(selected).replace(/\.(exe|app)$/i, ''),
      family: 'custom',
      kind,
      target: selected,
      path: selected,
      source: 'manual',
    };
    return {
      canceled: false,
      game: { ...game, subtitle: gameDisplaySubtitle(game) },
    };
  });

  handle('games:launch', async (_event, { game } = {}) => {
    const selected = game || store.getLibrary().settings?.game;
    if (!selected) throw new GameError('没有选择游戏 / No game selected.', 'game-not-selected');
    return launchGame(selected);
  });

  handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    dataPath: store.userDataPath,
  }));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  ensureDir(userDataPath);
  logger = createLogger(userDataPath);
  logger(`[app] starting SkyLog ${app.getVersion()} on ${process.platform}`);
  store = new LibraryStore(userDataPath, { logger });
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'SkyLog',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  initIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logger(`[uncaught] ${error?.stack || error}`);
});
process.on('unhandledRejection', (error) => {
  logger(`[unhandled] ${error?.stack || error}`);
});
