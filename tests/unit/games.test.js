import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyGamePath,
  parseSteamLibraries,
  scanAllGames,
  STEAM_APP_IDS,
} from '../../electron/games.js';

test('classifies X-Plane and MSFS executables', () => {
  const xplane = classifyGamePath('D:\\Games\\X-Plane 12\\X-Plane.exe', 'win32');
  assert.equal(xplane.id, 'xplane-12');
  assert.equal(xplane.title, 'X-Plane 12');
  assert.equal(xplane.kind, 'exe');

  const xplane11 = classifyGamePath('C:\\SteamLibrary\\steamapps\\common\\X-Plane 11\\X-Plane.exe', 'win32');
  assert.equal(xplane11.id, 'xplane-11');

  const msfs2024 = classifyGamePath('C:\\Games\\Microsoft Flight Simulator 2024\\FlightSimulator2024.exe', 'win32');
  assert.equal(msfs2024.id, 'msfs-2024');
  assert.equal(msfs2024.title, 'Microsoft Flight Simulator 2024');

  const msfs2020 = classifyGamePath('D:\\SteamLibrary\\steamapps\\common\\MicrosoftFlightSimulator\\FlightSimulator.exe', 'win32');
  assert.equal(msfs2020.id, 'msfs-2020');
});

test('classifies macOS X-Plane app bundles', () => {
  const game = classifyGamePath('/Applications/X-Plane 12/X-Plane.app', 'darwin');
  assert.equal(game.kind, 'mac-app');
  assert.equal(game.id, 'xplane-12');
});

test('parses Steam library paths from libraryfolders.vdf', () => {
  const vdf = `"libraryfolders"\n{\n  "0"\n  {\n    "path" "C:\\\\Program Files (x86)\\\\Steam"\n  }\n  "1"\n  {\n    "path" "D:\\\\SteamLibrary"\n  }\n}`;
  const libraries = parseSteamLibraries(vdf);
  assert.deepEqual(libraries, [
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
  ]);
});

test('rejects unrelated executables', () => {
  assert.equal(classifyGamePath('C:\\Windows\\notepad.exe', 'win32'), null);
});

test('marks Steam-managed installs and knows their Steam app IDs', () => {
  const steam = classifyGamePath(
    'C:\\SteamLibrary\\steamapps\\common\\X-Plane 12\\X-Plane.exe',
    'win32',
  );
  assert.equal(steam.source, 'steam');
  assert.equal(STEAM_APP_IDS['xplane-12'], '2014780');
  assert.equal(STEAM_APP_IDS['msfs-2020'], '1250410');
});

test('full scan finds games in arbitrary folders', async () => {
  const artifacts = path.join(process.cwd(), 'test-artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifacts, 'game-scan-'));
  try {
    const xplaneDir = path.join(root, 'Games', 'X-Plane 12');
    const msfsDir = path.join(root, 'Sim', 'Flight Simulator 2024');
    fs.mkdirSync(xplaneDir, { recursive: true });
    fs.mkdirSync(msfsDir, { recursive: true });
    fs.writeFileSync(path.join(xplaneDir, 'X-Plane.exe'), '');
    fs.writeFileSync(path.join(msfsDir, 'FlightSimulator2024.exe'), '');
    const result = await scanAllGames({
      platform: 'win32',
      roots: [root],
      maxDepth: 4,
      timeBudgetMs: 5000,
      maxDirs: 1000,
    });
    const ids = result.games.map((game) => game.id).sort();
    assert.deepEqual(ids, ['msfs-2024', 'xplane-12']);
    assert.ok(result.scannedDirs > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
