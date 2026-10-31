import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export class GameError extends Error {
  constructor(message, code = 'game-error', details = {}) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.details = details;
  }
}

export const GAME_IDS = {
  MSFS2024: 'msfs-2024',
  MSFS2020: 'msfs-2020',
  XPLANE12: 'xplane-12',
  XPLANE11: 'xplane-11',
  CUSTOM: 'custom',
};

function normalizePath(value) {
  return path.normalize(String(value || '')).replace(/[\\/]+$/, '');
}

function cleanGame(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = String(value.kind || '');
  if (!['exe', 'appx', 'mac-app'].includes(kind)) return null;
  const title = String(value.title || '').trim().slice(0, 120);
  const id = String(value.id || GAME_IDS.CUSTOM).trim().slice(0, 60) || GAME_IDS.CUSTOM;
  const target = String(value.target || '').trim().slice(0, 1024);
  const filePath = String(value.path || '').trim().slice(0, 1024);
  if (!title || (!target && !filePath)) return null;
  return {
    id,
    title,
    family: String(value.family || '').trim().slice(0, 40),
    kind,
    target: target || filePath,
    path: filePath || target,
    source: String(value.source || 'manual').trim().slice(0, 40),
    version: String(value.version || '').trim().slice(0, 40),
  };
}

/**
 * Classify a filesystem path without touching the filesystem.
 * Kept pure so the detector can be tested on any platform.
 */
export function classifyGamePath(filePath, platform = process.platform) {
  const raw = String(filePath || '').trim();
  if (!raw) return null;
  const clean = normalizePath(raw);
  const base = path.basename(clean).toLowerCase();
  const parent = path.basename(path.dirname(clean));
  const haystack = `${parent} ${base}`.toLowerCase();

  if (platform === 'darwin' || /\.app$/i.test(base)) {
    if (haystack.includes('x-plane')) {
      const twelve = /12/.test(haystack);
      return {
        id: twelve ? GAME_IDS.XPLANE12 : GAME_IDS.XPLANE11,
        title: twelve ? 'X-Plane 12' : 'X-Plane 11',
        family: 'xplane',
        kind: 'mac-app',
        target: clean,
        path: clean,
        source: 'scan',
      };
    }
    if (haystack.includes('flight simulator')) {
      return {
        id: GAME_IDS.MSFS2020,
        title: 'Microsoft Flight Simulator',
        family: 'msfs',
        kind: 'mac-app',
        target: clean,
        path: clean,
        source: 'scan',
      };
    }
    return null;
  }

  if (base === 'x-plane.exe' || base === 'x-plane') {
    const twelve = haystack.includes('x-plane 12') || haystack.includes('xplane12');
    return {
      id: twelve ? GAME_IDS.XPLANE12 : GAME_IDS.XPLANE11,
      title: twelve ? 'X-Plane 12' : 'X-Plane 11',
      family: 'xplane',
      kind: 'exe',
      target: clean,
      path: clean,
      source: 'scan',
    };
  }

  if (base === 'flightsimulator2024.exe') {
    return {
      id: GAME_IDS.MSFS2024,
      title: 'Microsoft Flight Simulator 2024',
      family: 'msfs',
      kind: 'exe',
      target: clean,
      path: clean,
      source: 'scan',
    };
  }

  if (base === 'flightsimulator.exe') {
    return {
      id: GAME_IDS.MSFS2020,
      title: 'Microsoft Flight Simulator',
      family: 'msfs',
      kind: 'exe',
      target: clean,
      path: clean,
      source: 'scan',
    };
  }

  return null;
}

/** Parse the "path" values from Steam's libraryfolders.vdf. */
export function parseSteamLibraries(text) {
  const found = [];
  for (const match of String(text || '').matchAll(/"path"\s+"([^"]+)"/gi)) {
    const value = match[1].replace(/\\\\/g, '\\').replace(/\//g, path.sep);
    if (value) found.push(normalizePath(value));
  }
  return [...new Set(found)];
}

async function readText(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function run(command, args) {
  try {
    const { stdout } = await execFile(command, args, {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return String(stdout || '');
  } catch {
    return '';
  }
}

async function windowsSteamRoots() {
  const roots = [];
  for (const [key, value] of [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ]) {
    const output = await run('reg.exe', ['query', key, '/v', value]);
    const match = output.match(/REG_SZ\s+(.+)\s*$/m);
    if (match?.[1]) roots.push(normalizePath(match[1].trim()));
  }
  roots.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  return roots;
}

async function macSteamRoots() {
  return [
    path.join(os.homedir(), 'Library/Application Support/Steam'),
    '/Applications/Steam.app/Contents/MacOS/Steam',
  ];
}

async function steamLibraries(platform) {
  const roots = platform === 'darwin' ? await macSteamRoots() : await windowsSteamRoots();
  const libraries = new Set();
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    libraries.add(normalizePath(root));
    const vdf = await readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
    for (const library of parseSteamLibraries(vdf)) libraries.add(library);
  }
  return [...libraries];
}

async function appxGames() {
  if (process.platform !== 'win32') return [];
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Get-AppxPackage | Where-Object { $_.Name -eq 'Microsoft.FlightSimulator' -or $_.Name -eq 'Microsoft.Limitless' } |",
    'Select-Object Name,PackageFamilyName,InstallLocation,Version | ConvertTo-Json -Compress',
  ].join(' ');
  const output = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  if (!output.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const games = [];
  for (const item of list) {
    const name = String(item.Name || '');
    const family = String(item.PackageFamilyName || '');
    const install = String(item.InstallLocation || '');
    if (!family) continue;
    const is2024 = /Limitless/i.test(name);
    const title = is2024 ? 'Microsoft Flight Simulator 2024' : 'Microsoft Flight Simulator';
    const executable2024 = path.join(install, 'FlightSimulator2024.exe');
    const executable2020 = path.join(install, 'FlightSimulator.exe');
    const executable = is2024 ? executable2024 : executable2020;
    games.push({
      id: is2024 ? GAME_IDS.MSFS2024 : GAME_IDS.MSFS2020,
      title,
      family: 'msfs',
      kind: 'appx',
      target: `shell:AppsFolder\\${family}!App`,
      path: executable,
      source: 'microsoft-store',
      version: String(item.Version || ''),
    });
  }
  return games;
}

function fixedRoots(platform) {
  if (platform === 'darwin') {
    return [
      '/Applications',
      path.join(os.homedir(), 'Applications'),
      '/Users/Shared',
    ];
  }
  if (platform !== 'win32') return [];
  const roots = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) roots.push(root);
    } catch {
      // Ignore disconnected drives.
    }
  }
  roots.push('C:\\Program Files', 'C:\\Program Files (x86)');
  return [...new Set(roots)];
}

async function scanTopLevel(platform) {
  const candidates = new Set();
  const roots = fixedRoots(platform);
  for (const root of roots) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (!/x-plane|flight\s*simulator|microsoft.*flight/i.test(name)) continue;
      const dir = path.join(root, name);
      if (platform === 'darwin') {
        candidates.add(path.join(dir, 'X-Plane.app'));
        candidates.add(path.join(dir, 'X-Plane.exe'));
      } else {
        candidates.add(path.join(dir, 'X-Plane.exe'));
        candidates.add(path.join(dir, 'FlightSimulator.exe'));
        candidates.add(path.join(dir, 'FlightSimulator2024.exe'));
      }
    }
  }
  return candidates;
}

async function scanSteam(platform) {
  const candidates = new Set();
  for (const root of await steamLibraries(platform)) {
    const common = path.join(root, 'steamapps', 'common');
    let entries = [];
    try {
      entries = await fs.promises.readdir(common, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/x-plane|flight\s*simulator|microsoft.*flight/i.test(entry.name)) continue;
      const dir = path.join(common, entry.name);
      if (platform === 'darwin') {
        candidates.add(path.join(dir, 'X-Plane.app'));
      } else {
        candidates.add(path.join(dir, 'X-Plane.exe'));
        candidates.add(path.join(dir, 'FlightSimulator.exe'));
        candidates.add(path.join(dir, 'FlightSimulator2024.exe'));
      }
    }
  }
  return candidates;
}

function dedupeGames(games) {
  const seen = new Set();
  const result = [];
  const sorted = [...games].sort((a, b) => {
    const order = { [GAME_IDS.MSFS2024]: 0, [GAME_IDS.MSFS2020]: 1, [GAME_IDS.XPLANE12]: 2, [GAME_IDS.XPLANE11]: 3 };
    return (order[a.id] ?? 9) - (order[b.id] ?? 9);
  });
  for (const game of sorted) {
    const clean = cleanGame(game);
    if (!clean) continue;
    const key = `${clean.id}|${clean.target.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

/**
 * Find known flight simulators. The default uses the real filesystem and
 * platform probes; tests can inject a platform and skip probes by passing
 * `probe: false`.
 */
export async function detectGames(options = {}) {
  const platform = options.platform || process.platform;
  const games = [];
  if (options.probe !== false && platform === 'win32') {
    games.push(...(await appxGames()));
  }

  const candidates = new Set();
  const roots = fixedRoots(platform);
  for (const root of roots) {
    for (const name of ['X-Plane 12', 'X-Plane 11', 'Microsoft Flight Simulator 2024', 'Microsoft Flight Simulator', 'MicrosoftFlightSimulator2024', 'MicrosoftFlightSimulator']) {
      if (platform === 'darwin' && name.includes('X-Plane')) {
        candidates.add(path.join(root, name, 'X-Plane.app'));
        continue;
      }
      candidates.add(path.join(root, name, name.includes('X-Plane') ? 'X-Plane.exe' : name.includes('2024') ? 'FlightSimulator2024.exe' : 'FlightSimulator.exe'));
    }
  }
  for (const candidate of await scanTopLevel(platform)) candidates.add(candidate);
  for (const candidate of await scanSteam(platform)) candidates.add(candidate);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
    } catch {
      continue;
    }
    const game = classifyGamePath(candidate, platform);
    if (game) games.push({ ...game, source: candidate.toLowerCase().includes('steamapps') ? 'steam' : 'scan' });
  }

  if (platform === 'win32') {
    const registry = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='SilentlyContinue'; Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -match 'X-Plane|Flight Simulator' -and $_.InstallLocation } | Select-Object DisplayName,InstallLocation | ConvertTo-Json -Compress",
    ]);
    if (registry.trim()) {
      try {
        const parsed = JSON.parse(registry);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          const location = String(item.InstallLocation || '').trim();
          if (!location) continue;
          const name = String(item.DisplayName || '');
          const fileName = /X-Plane/i.test(name) ? 'X-Plane.exe' : /2024/i.test(name) ? 'FlightSimulator2024.exe' : 'FlightSimulator.exe';
          const candidate = path.join(location, fileName);
          if (fs.existsSync(candidate)) {
            const game = classifyGamePath(candidate, platform);
            if (game) games.push({ ...game, source: 'registry' });
          }
        }
      } catch {
        // Ignore malformed registry output.
      }
    }
  }

  return dedupeGames(games);
}

export function gameDisplaySubtitle(game) {
  if (!game) return '';
  if (game.kind === 'appx') return 'Microsoft Store';
  if (game.source === 'steam') return 'Steam';
  if (game.source === 'registry') return 'Registry';
  return game.path ? path.dirname(game.path) : '';
}

export function launchGame(game) {
  const clean = cleanGame(game);
  if (!clean) throw new GameError('Invalid game selection.', 'invalid-game');
  if (clean.kind === 'exe') {
    if (!clean.target || !fs.existsSync(clean.target)) {
      throw new GameError('Game executable was not found.', 'game-missing');
    }
    const child = spawn(clean.target, [], {
      cwd: path.dirname(clean.target),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { launched: true, kind: 'exe', title: clean.title };
  }
  if (clean.kind === 'mac-app') {
    if (!fs.existsSync(clean.target)) throw new GameError('Game app was not found.', 'game-missing');
    const child = spawn('open', ['-a', clean.target], { detached: true, stdio: 'ignore' });
    child.unref();
    return { launched: true, kind: 'mac-app', title: clean.title };
  }
  if (clean.kind === 'appx') {
    if (!clean.target.startsWith('shell:AppsFolder\\')) {
      throw new GameError('Invalid Microsoft Store app target.', 'invalid-game');
    }
    const child = spawn('explorer.exe', [clean.target], { detached: true, stdio: 'ignore' });
    child.unref();
    return { launched: true, kind: 'appx', title: clean.title };
  }
  throw new GameError('Unsupported game type.', 'unsupported-game');
}
