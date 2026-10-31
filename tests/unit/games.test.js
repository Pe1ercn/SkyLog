import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGamePath,
  parseSteamLibraries,
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
