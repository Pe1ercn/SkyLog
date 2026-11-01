import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_CODES, getTheme, themeBackgroundUri } from '../../src/lib/themes.js';

test('all airline theme codes are unique 16-character alphanumeric strings', () => {
  const codes = Object.values(THEME_CODES);
  assert.equal(codes.length, 7);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[A-Z0-9]{16}$/);
});

test('themes expose distinct airline palettes and menu icon sets', () => {
  assert.equal(THEMES.length, 8);
  assert.equal(getTheme('airchina').id, 'default');
  assert.equal(getTheme('airchina', ['airchina']).primary, '#c8102e');
  assert.equal(getTheme('xiamen', ['xiamen']).navIcons.map, 'globe');
  assert.notEqual(THEMES.find((theme) => theme.id === 'csair').primary, THEMES.find((theme) => theme.id === 'ceair').primary);
});

test('theme backdrop is a self-contained SVG data URI', () => {
  const uri = themeBackgroundUri(THEMES.find((theme) => theme.id === 'hainan'));
  assert.ok(uri.startsWith('data:image/svg+xml'));
  assert.ok(decodeURIComponent(uri).includes('HAINAN'));
});
