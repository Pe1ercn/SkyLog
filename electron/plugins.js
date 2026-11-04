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
    if (!fs.existsSync(flyWithLua)) {
      // Keep the script available for manual installation.
      const fallback = path.join(communityFolder, 'SkyLogTelemetry');
      copyFile(source, path.join(fallback, 'SkyLogTelemetry.lua'));
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
    copyFile(source, path.join(flyWithLua, 'SkyLogTelemetry.lua'));
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
      note: '进入模拟飞行后，请从工具栏打开 SkyLog Telemetry 面板并保持开启。',
    };
  }
  return { installed: false, family, message: '不支持的游戏系列。' };
}
