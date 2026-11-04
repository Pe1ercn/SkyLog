import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  msfsCommunityCandidates,
  xplanePluginFolder,
} from '../../electron/community.js';

test('derives an X-Plane Windows plugin folder from the game executable', () => {
  const folder = xplanePluginFolder({
    path: 'D:\\Games\\X-Plane 12\\X-Plane.exe',
    kind: 'exe',
  });
  assert.equal(folder, path.join('D:\\Games\\X-Plane 12', 'Resources', 'plugins'));
});

test('derives a macOS X-Plane plugins folder inside the app bundle', () => {
  const folder = xplanePluginFolder({
    path: '/Applications/X-Plane 12/X-Plane.app',
    kind: 'mac-app',
  });
  assert.equal(
    folder,
    path.join('/Applications/X-Plane 12/X-Plane.app', 'Contents', 'Resources', 'plugins'),
  );
});

test('Microsoft Flight Simulator community candidates include sibling Community folders', () => {
  const candidates = msfsCommunityCandidates({
    path: 'D:\\SteamLibrary\\steamapps\\common\\MSFS2024\\FlightSimulator2024.exe',
    kind: 'exe',
  });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.endsWith('Community')));
});
