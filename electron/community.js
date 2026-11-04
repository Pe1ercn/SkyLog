import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function uniqueExisting(paths) {
  const seen = new Set();
  return paths.filter((item) => {
    if (!item) return false;
    const normalized = path.normalize(item);
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    try {
      return fs.existsSync(normalized) && fs.statSync(normalized).isDirectory();
    } catch {
      return false;
    }
  });
}

export function xplanePluginFolder(game) {
  if (!game?.path) return '';
  const target = game.path;
  if (game.kind === 'mac-app' || /\.app$/i.test(target)) {
    return path.join(target, 'Contents', 'Resources', 'plugins');
  }
  return path.join(path.dirname(target), 'Resources', 'plugins');
}

export function msfsCommunityCandidates(game) {
  if (!game?.path) return [];
  const candidates = [];
  let dir = game.path;
  try {
    if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    // Keep the path-based derivation for tests and moved installations.
    if (/\.[a-z0-9]+$/i.test(dir)) dir = path.dirname(dir);
  }
  for (let i = 0; i < 5; i += 1) {
    candidates.push(path.join(dir, 'Community'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates;
}

export async function detectCommunityFolders(games = [], platform = process.platform) {
  const xplane = [];
  const msfs = [];
  for (const game of games) {
    if (game?.family === 'xplane') xplane.push(xplanePluginFolder(game));
    if (game?.family === 'msfs') msfs.push(...msfsCommunityCandidates(game));
  }
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    msfs.push(
      path.join(local, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
      path.join(local, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
      path.join(roaming, 'Microsoft Flight Simulator', 'Packages', 'Community'),
    );
    xplane.push(
      'C:\\X-Plane 12\\Resources\\plugins',
      'C:\\X-Plane 11\\Resources\\plugins',
      'C:\\Program Files\\X-Plane 12\\Resources\\plugins',
    );
  } else if (platform === 'darwin') {
    msfs.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Flight Simulator', 'Packages', 'Community'),
    );
    xplane.push(
      '/Applications/X-Plane 12/X-Plane.app/Contents/Resources/plugins',
      '/Applications/X-Plane 11/X-Plane.app/Contents/Resources/plugins',
    );
  }
  return {
    xplane: uniqueExisting(xplane),
    msfs: uniqueExisting(msfs),
    platform,
  };
}

export function resolveCommunityFolder(family, games = [], custom = '', platform = process.platform) {
  if (custom) {
    try {
      if (fs.existsSync(custom) && fs.statSync(custom).isDirectory()) return path.normalize(custom);
    } catch {
      // Fall through to detection.
    }
  }
  const detected = [];
  for (const game of games) {
    if (family === 'xplane' && game?.family === 'xplane') detected.push(xplanePluginFolder(game));
    if (family === 'msfs' && game?.family === 'msfs') detected.push(...msfsCommunityCandidates(game));
  }
  return uniqueExisting(detected)[0] || '';
}
