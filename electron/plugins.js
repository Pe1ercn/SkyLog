import fs from 'node:fs';
import path from 'node:path';
import { resolveCommunityFolder } from './community.js';

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else copyFile(from, to);
  }
}

export function installTelemetryPlugin(options = {}) {
  const {
    family,
    games = [],
    customFolder = '',
    projectRoot,
    platform = process.platform,
    appPath = '',
  } = options;
  const communityFolder = resolveCommunityFolder(family, games, customFolder, platform);
  if (!communityFolder) {
    return {
      installed: false,
      needsCommunity: true,
      family,
      message: family === 'xplane'
        ? '未找到 X-Plane 的 Resources/plugins 文件夹。'
        : '未找到 Microsoft Flight Simulator 的 Community 文件夹。',
    };
  }
  if (family === 'xplane') {
    const flyWithLua = path.join(communityFolder, 'FlyWithLua', 'Scripts');
    const source = path.join(projectRoot, 'plugins', 'xplane', 'SkyLogTelemetry.lua');
    const lua = fs.readFileSync(source, 'utf8')
      .replaceAll('__SKYLOG_APP__', String(appPath || '').replaceAll('\\', '\\\\'));
    if (!fs.existsSync(flyWithLua)) {
      const fallback = path.join(communityFolder, 'SkyLogTelemetry');
      fs.mkdirSync(fallback, { recursive: true });
      fs.writeFileSync(path.join(fallback, 'SkyLogTelemetry.lua'), lua, 'utf8');
      copyFile(path.join(projectRoot, 'plugins', 'xplane', 'README.txt'), path.join(fallback, 'README.txt'));
      return {
        installed: false,
        needsFlyWithLua: true,
        family,
        communityFolder,
        fallback,
        message: 'X-Plane 需要先安装 FlyWithLua，脚本已复制到 SkyLogTelemetry 文件夹。',
      };
    }
    fs.writeFileSync(path.join(flyWithLua, 'SkyLogTelemetry.lua'), lua, 'utf8');
    return {
      installed: true,
      family,
      path: path.join(flyWithLua, 'SkyLogTelemetry.lua'),
      telemetryFile: path.join(flyWithLua, 'SkyLogTelemetry.json'),
      communityFolder,
    };
  }
  if (family === 'msfs') {
    const source = path.join(projectRoot, 'plugins', 'msfs', 'skylog-telemetry');
    const target = path.join(communityFolder, 'skylog-telemetry');
    copyDirectory(source, target);
    return {
      installed: true,
      family,
      path: target,
      communityFolder,
      telemetryFile: '',
      note: 'SkyLog 通过 SimConnect 读取飞行数据；MSFS 会自动唤起 SkyLog。',
    };
  }
  return { installed: false, family, message: '不支持的游戏系列。' };
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * MSFS supports a per-user exe.xml that launches external clients when the
 * simulator starts. This is what lets SimConnect record from the very first
 * frame without asking the user to open a panel.
 */
export function configureMsfsExeXml(options = {}) {
  const {
    appPath = '',
    appDataPath = process.env.APPDATA || '',
    localAppDataPath = process.env.LOCALAPPDATA || '',
  } = options;
  if (!appPath || !appDataPath) return { installed: false, message: '缺少应用路径。' };
  const candidates = [
    path.join(appDataPath, 'Microsoft Flight Simulator 2024'),
    path.join(appDataPath, 'Microsoft Flight Simulator'),
    path.join(localAppDataPath, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache'),
    path.join(localAppDataPath, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache'),
  ].filter((folder) => fs.existsSync(folder));
  if (!candidates.length) {
    const steamFolder = path.join(appDataPath, 'Microsoft Flight Simulator 2024');
    try { fs.mkdirSync(steamFolder, { recursive: true }); } catch { /* ignore */ }
    if (fs.existsSync(steamFolder)) candidates.push(steamFolder);
  }
  const addon = `  <Launch.Addon>
    <Name>SkyLog</Name>
    <Disabled>False</Disabled>
    <Path>${xmlEscape(appPath)}</Path>
    <CommandLine></CommandLine>
  </Launch.Addon>`;
  const written = [];
  for (const folder of candidates) {
    const file = path.join(folder, 'exe.xml');
    try {
      const existed = fs.existsSync(file);
      const current = existed ? fs.readFileSync(file, 'utf8') : `<?xml version="1.0" encoding="Windows-1252"?>
<SimBase.Document Type="Launch" version="1,0">
  <Descr>Launch</Descr>
  <Filename>exe.xml</Filename>
  <Disabled>False</Disabled>
</SimBase.Document>`;
      if (current.includes('<Name>SkyLog</Name>')) {
        written.push({ file, already: true });
        continue;
      }
      if (existed) {
        try { fs.copyFileSync(file, `${file}.skylog.bak`); } catch { /* best effort */ }
      }
      const updated = current.includes('</SimBase.Document>')
        ? current.replace('</SimBase.Document>', `${addon}\n</SimBase.Document>`)
        : `${current}\n${addon}\n`;
      fs.writeFileSync(file, updated, 'utf8');
      written.push({ file, already: false });
    } catch (error) {
      written.push({ file, error: error.message });
    }
  }
  return {
    installed: written.some((item) => !item.error),
    files: written,
    candidates: candidates.length,
  };
}

export async function installAllBundledPlugins(options = {}) {
  const results = [];
  for (const family of ['msfs', 'xplane']) {
    try {
      results.push(installTelemetryPlugin({
        ...options,
        family,
        customFolder: options.customFolders?.[family] || options.customFolder || '',
      }));
    } catch (error) {
      results.push({ family, installed: false, message: error?.message || String(error) });
    }
  }
  if (options.platform !== 'darwin' && options.games?.some((game) => game.family === 'msfs')) {
    results.push({ family: 'msfs-launch', ...configureMsfsExeXml(options) });
  }
  return results;
}
