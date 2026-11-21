import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  session,
  Tray,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sevenZip from '7zip-bin';
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
  scanAllGames,
} from './games.js';
import { DownloadManager } from './downloads.js';
import { TelemetryBridge, TELEMETRY_PORT } from './telemetry.js';
import { detectCommunityFolders } from './community.js';
import { installTelemetryPlugin, installAllBundledPlugins } from './plugins.js';
import { SimConnectBridge } from './simconnect.js';
import { XPlaneUdpBridge } from './xplane-udp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const execFileAsync = promisify(execFile);

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
let telemetry = null;
let telemetrySession = null;
let simconnect = null;
let xplaneUdp = null;
let tray = null;
let isQuitting = false;
let closePromptOpen = false;
let downloads = null;

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

function hideMainWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
  if (process.platform === 'darwin') app.dock?.hide();
}

function showMainWindow() {
  if (process.platform === 'darwin') app.dock?.show();
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitForReal() {
  isQuitting = true;
  app.quit();
}

async function autoInstallBridges(options = {}) {
  if (!store) return [];
  const settings = store.getLibrary().settings || {};
  if (!options.force && settings.autoInstallBridges === false) return [];
  const known = settings.knownGames || [];
  try {
    const results = await installAllBundledPlugins({
      games: known,
      customFolder: '',
      customFolders: settings.communityFolders || {},
      projectRoot,
      platform: process.platform,
      appPath: app.isPackaged ? process.execPath : '',
      appDataPath: app.getPath('appData'),
      localAppDataPath: process.env.LOCALAPPDATA || '',
    });
    for (const result of results) {
      logger(`[components] ${result.family}: ${result.installed ? 'installed' : result.message || 'not installed'}`);
    }
    store.updateSettings({ bridgesInstalledAt: new Date().toISOString() });
    return results;
  } catch (error) {
    logger(`[components] auto install failed: ${error?.message || error}`);
    return [];
  }
}

function createTray() {  if (tray) return;
  try {
    const icon = nativeImage.createFromPath(path.join(projectRoot, 'build', 'icon.png')).resize({ width: 18, height: 18 });
    tray = new Tray(icon);
    tray.setToolTip('SkyLog 航迹');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开 SkyLog', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: quitForReal },
    ]));
    tray.on('click', showMainWindow);
  } catch (error) {
    logger(`[tray] unavailable: ${error?.message || error}`);
  }
}

function requestWindowClose() {
  const settings = store?.getLibrary().settings || {};
  const action = settings.closeAction === 'quit' ? 'quit' : settings.closeAction === 'tray' ? 'tray' : 'ask';
  if (settings.closePrompt === false && action !== 'ask') {
    if (action === 'quit') quitForReal();
    else hideMainWindow();
    return;
  }
  if (!mainWindow || closePromptOpen) return;
  closePromptOpen = true;
  sendEvent('window:close-request', {
    action,
    prompt: true,
    saved: settings.closePrompt === false,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#041019',
    title: 'SkyLog 航迹',
    icon: path.join(projectRoot, 'build', 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: isWindows ? 'hidden' : 'hiddenInset',
    ...(isWindows
      ? {
          titleBarOverlay: {
            color: '#05131d',
            symbolColor: '#b8d4df',
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

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    requestWindowClose();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closePromptOpen = false;
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

function sendEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function communitySettings() {
  return store?.getLibrary()?.settings?.communityFolders || {};
}

async function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (process.platform === 'win32') {
    // Keep the built-in expander for ordinary ZIPs. 7za is used for .7z.
    if (zipPath.toLowerCase().endsWith('.zip')) {
      const escapedZip = zipPath.replace(/'/g, "''");
      const escapedTarget = targetDir.replace(/'/g, "''");
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedTarget}' -Force`,
      ], { windowsHide: true, timeout: 180000 });
      return;
    }
  }
  let sevenPath = sevenZip.path7za;
  if (app.isPackaged && sevenPath.includes('app.asar')) {
    sevenPath = sevenPath.replace('app.asar', 'app.asar.unpacked');
  }
  await execFileAsync(sevenPath, ['x', zipPath, `-o${targetDir}`, '-y'], { timeout: 180000 });
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
    const quick = await detectGames();
    const known = store.getLibrary().settings?.knownGames || [];
    const merged = new Map();
    for (const game of [...known, ...quick]) {
      if (!game?.target) continue;
      const key = `${game.id}|${game.target.toLowerCase()}`;
      if (!merged.has(key)) merged.set(key, game);
    }
    return {
      games: [...merged.values()].map((game) => ({ ...game, subtitle: gameDisplaySubtitle(game) })),
      platform: process.platform,
    };
  });

  handle('games:scanAll', async () => {
    const quick = await detectGames();
    const full = await scanAllGames();
    const merged = new Map();
    for (const game of [...quick, ...full.games]) {
      if (!game?.target) continue;
      const key = `${game.id}|${game.target.toLowerCase()}`;
      if (!merged.has(key)) merged.set(key, game);
    }
    const games = [...merged.values()];
    store.updateSettings({ gameScanDone: true, knownGames: games });
    autoInstallBridges().catch((error) => logger(`[components] background install: ${error?.message || error}`));
    return {
      games: games.map((game) => ({ ...game, subtitle: gameDisplaySubtitle(game) })),
      platform: process.platform,
      scannedDirs: full.scannedDirs,
      timedOut: full.timedOut,
      durationMs: full.durationMs,
      library: store.getLibrary(),
    };
  });

  handle('app:importBackground', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择背景图 / Choose a background image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      throw new StoreError('无法读取背景图', 'invalid-background');
    }
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) {
      throw new StoreError('背景图不能超过 8 MB', 'invalid-background');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
        : ext === '.gif' ? 'image/gif'
          : 'image/jpeg';
    const data = fs.readFileSync(filePath);
    return {
      canceled: false,
      name: path.basename(filePath),
      dataUrl: `data:${mime};base64,${data.toString('base64')}`,
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

  handle('community:detect', async () => {
    const known = store.getLibrary().settings?.knownGames || [];
    const detected = await detectCommunityFolders(known, process.platform);
    return { ...detected, saved: communitySettings() };
  });

  handle('community:choose', async (_event, { family } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: family === 'xplane' ? '选择 X-Plane 插件文件夹 / Choose plugins folder' : '选择 MSFS Community 文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const chosen = path.resolve(result.filePaths[0]);
    const folders = { ...communitySettings(), [family || 'msfs']: chosen };
    store.updateSettings({ communityFolders: folders });
    return { canceled: false, path: chosen, library: store.getLibrary() };
  });

  handle('community:set', async (_event, { family, folder } = {}) => {
    const chosen = path.resolve(String(folder || ''));
    if (!fs.existsSync(chosen)) throw new StoreError('社区文件夹不存在', 'community-missing');
    const folders = { ...communitySettings(), [family || 'msfs']: chosen };
    store.updateSettings({ communityFolders: folders });
    return { path: chosen, library: store.getLibrary() };
  });

  handle('telemetry:start', async (_event, payload = {}) => {
    const known = store.getLibrary().settings?.knownGames || [];
    const game = payload.game
      || store.getLibrary().settings?.game
      || known.find((item) => item.family === payload.family)
      || known[0]
      || null;
    const family = payload.family || game?.family || '';
    if (!family) throw new GameError('请先选择游戏 / Choose a game first.', 'game-not-selected');
    if (!telemetry) {
      telemetry = new TelemetryBridge({
        onSample: (sample) => sendEvent('telemetry:update', sample),
        onSession: (event) => sendEvent('telemetry:session', event),
        logger,
      });
    }
    await telemetry.start();
    if (family === 'msfs') {
      if (process.platform !== 'win32') {
        throw new StoreError('MSFS SimConnect 仅支持 Windows', 'simconnect-unsupported');
      }
      if (!simconnect) {
        simconnect = new SimConnectBridge({
          logger,
          onSample: (sample) => telemetry?.ingest(sample),
          onStatus: (status) => sendEvent('telemetry:status', status),
        });
      }
      simconnect.start();
      telemetrySession = {
        flightId: String(payload.flightId || ''),
        family,
        game,
        transport: 'simconnect',
        startedAt: new Date().toISOString(),
      };
      return {
        installed: true,
        family,
        mode: 'simconnect',
        transport: 'simconnect',
        message: 'MSFS 通过 SimConnect 直接读取飞行数据，无需安装社区插件。',
        port: telemetry.port,
        bridgeUrl: `http://127.0.0.1:${telemetry.port}`,
        session: telemetrySession,
      };
    }
    let plugin = null;
    try {
      plugin = installTelemetryPlugin({
        family,
        games: known,
        customFolder: communitySettings()[family] || '',
        projectRoot,
        platform: process.platform,
      appPath: app.isPackaged ? process.execPath : '',
      });
      if (plugin.telemetryFile) telemetry.watchFile(plugin.telemetryFile, family);
    } catch (error) {
      logger(`[telemetry] optional X-Plane plugin install failed: ${error?.message || error}`);
    }
    if (family === 'xplane') {
      if (!xplaneUdp) {
        xplaneUdp = new XPlaneUdpBridge({
          logger,
          onSample: (sample) => telemetry?.ingest(sample),
          onStatus: (status) => sendEvent('telemetry:status', status),
        });
      }
      xplaneUdp.start();
      telemetrySession = {
        flightId: String(payload.flightId || ''),
        family,
        game,
        transport: 'udp-rref',
        startedAt: new Date().toISOString(),
      };
      return {
        installed: true,
        family,
        mode: 'udp-rref',
        transport: 'udp-rref',
        plugin,
        telemetryFile: plugin?.telemetryFile || '',
        message: 'X-Plane 通过 UDP RREF 读取飞行数据；若未启用 UDP，可同时在 X-Plane 中安装 FlyWithLua 脚本。',
        port: telemetry.port,
        bridgeUrl: `http://127.0.0.1:${telemetry.port}`,
        session: telemetrySession,
      };
    }
    const installed = plugin || {
      installed: false,
      family,
      message: '不支持的游戏系列。',
    };
    telemetrySession = {
      flightId: String(payload.flightId || ''),
      family,
      game,
      startedAt: new Date().toISOString(),
    };
    return {
      ...installed,
      port: telemetry.port,
      bridgeUrl: `http://127.0.0.1:${telemetry.port}`,
      session: telemetrySession,
    };
  });

  handle('telemetry:stop', async () => {
    telemetry?.stopFileWatch();
    simconnect?.stop();
    xplaneUdp?.stop();
    const session = telemetrySession;
    telemetrySession = null;
    return { stopped: true, session };
  });

  handle('components:install', async () => {
    const results = await autoInstallBridges({ force: true });
    return { results };
  });

  handle('telemetry:diagnostics', async () => {
    const settings = store.getLibrary().settings || {};
    const known = settings.knownGames || [];
    const msfsGame = (settings.game?.family === 'msfs' ? settings.game : null)
      || known.find((game) => game.family === 'msfs')
      || null;
    const xplaneGame = (settings.game?.family === 'xplane' ? settings.game : null)
      || known.find((game) => game.family === 'xplane')
      || null;
    const xplaneCommunity = communitySettings().xplane || '';
    const luaCandidates = [];
    if (xplaneCommunity) {
      luaCandidates.push(path.join(xplaneCommunity, 'FlyWithLua', 'Scripts', 'SkyLogTelemetry.lua'));
      luaCandidates.push(path.join(xplaneCommunity, 'SkyLogTelemetry', 'SkyLogTelemetry.lua'));
    }
    return {
      msfs: {
        ...(simconnect?.diagnostics() || { state: 'not-started', connected: false }),
        game: msfsGame ? { title: msfsGame.title, path: msfsGame.path } : null,
      },
      xplane: {
        ...(xplaneUdp?.diagnostics() || { state: 'not-started', connected: false }),
        game: xplaneGame ? { title: xplaneGame.title, path: xplaneGame.path } : null,
        pluginInstalled: luaCandidates.some((file) => fs.existsSync(file)),
        pluginFiles: luaCandidates,
        telemetryPort: telemetry?.port || TELEMETRY_PORT,
      },
      bridge: {
        listening: Boolean(telemetry?.server),
        port: telemetry?.port || TELEMETRY_PORT,
      },
    };
  });

  handle('telemetry:save', async (_event, { flightId, samples } = {}) => {
    const id = sanitizeFileName(String(flightId || ''), 'flight');
    const dir = path.join(store.userDataPath, 'telemetry');
    ensureDir(dir);
    const file = path.join(dir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify({ flightId: id, samples: Array.isArray(samples) ? samples : [] }), 'utf8');
    return { path: file, count: Array.isArray(samples) ? samples.length : 0 };
  });

  handle('downloads:start', async (_event, payload = {}) => {
    if (!downloads) throw new StoreError('下载服务尚未启动', 'downloads-unavailable');
    const settings = store.getLibrary().settings || {};
    const targetDir = payload.targetDir || settings.downloadPath || app.getPath('downloads');
    const task = await downloads.start({
      url: payload.url,
      filename: payload.filename,
      family: payload.family,
      targetDir,
      connections: payload.connections,
    });
    return { task, tasks: downloads.list() };
  });

  handle('downloads:list', async () => ({ tasks: downloads?.list() || [] }));

  handle('downloads:cancel', async (_event, { id } = {}) => ({ canceled: downloads?.cancel(id) || false }));

  handle('downloads:chooseFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择下载文件夹 / Choose download folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const chosen = path.resolve(result.filePaths[0]);
    store.updateSettings({ downloadPath: chosen });
    return { canceled: false, path: chosen, library: store.getLibrary() };
  });

  handle('downloads:openFolder', async (_event, { folder } = {}) => {
    const chosen = folder || store.getLibrary().settings?.downloadPath || app.getPath('downloads');
    const error = await shell.openPath(chosen);
    return { opened: !error, error };
  });

  handle('downloads:install', async (_event, { filePath, family } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) throw new StoreError('下载文件不存在', 'download-missing');
    const ext = path.extname(filePath).toLowerCase();
    if (['.exe', '.msi', '.dmg', '.pkg'].includes(ext)) {
      const error = await shell.openPath(filePath);
      return { mode: 'installer', opened: !error, error, filePath };
    }
    if (ext !== '.zip' && ext !== '.7z') {
      return { mode: 'file', opened: false, filePath, message: '该文件不是 ZIP / 7Z，已保留下载文件。' };
    }
    const target = communitySettings()[family || 'msfs'];
    if (!target) {
      return { mode: 'zip', needsCommunity: true, family, filePath };
    }
    await extractZip(filePath, target);
    return { mode: 'zip', installed: true, target, filePath };
  });

  handle('app:quit', async () => {
    setImmediate(quitForReal);
    return { quitting: true };
  });

  handle('window:request-close', async () => {
    if (mainWindow) mainWindow.close();
    return { requested: true };
  });

  handle('window:close-response', async (_event, payload = {}) => {
    const action = payload.action === 'tray' ? 'tray' : payload.action === 'quit' ? 'quit' : '';
    if (!action) {
      closePromptOpen = false;
      return { handled: false };
    }
    if (payload.save) {
      store.updateSettings({ closeAction: action, closePrompt: false });
    }
    closePromptOpen = false;
    if (action === 'quit') quitForReal();
    else {
      createTray();
      hideMainWindow();
    }
    return { handled: true, action, saved: Boolean(payload.save) };
  });

  handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    dataPath: store.userDataPath,
    telemetryPort: telemetry?.port || 42831,
    downloadPath: store.getLibrary().settings?.downloadPath || app.getPath('downloads'),
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
  downloads = new DownloadManager({
    logger,
    onUpdate: (task) => sendEvent('downloads:update', task),
  });
  telemetry = new TelemetryBridge({
    logger,
    onSample: (sample) => sendEvent('telemetry:update', sample),
    onSession: (event) => sendEvent('telemetry:session', event),
  });
  telemetry.start().then((result) => {
    if (!result.ok) logger(`[telemetry] bridge unavailable: ${result.error}`);
  });
  const sourceOptions = {
    logger,
    onSample: (sample) => telemetry?.ingest(sample),
    onStatus: (status) => sendEvent('telemetry:status', status),
  };
  const selectedFamily = store.getLibrary().settings?.game?.family;
  if (process.platform === 'win32' && selectedFamily === 'msfs') {
    simconnect = new SimConnectBridge(sourceOptions);
    simconnect.start().catch((error) => logger(`[simconnect] start failed: ${error?.message || error}`));
  }
  if (selectedFamily === 'xplane') {
    xplaneUdp = new XPlaneUdpBridge(sourceOptions);
    xplaneUdp.start();
  }
  autoInstallBridges().catch((error) => logger(`[components] background install: ${error?.message || error}`));
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
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

process.on('uncaughtException', (error) => {
  logger(`[uncaught] ${error?.stack || error}`);
});
process.on('unhandledRejection', (error) => {
  logger(`[unhandled] ${error?.stack || error}`);
});
