import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { net } from 'electron';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = net.request({
        method: options.method || 'GET',
        url,
        redirect: 'follow',
      });
      req.setHeader('user-agent', 'SkyLog/1.2.0 (+https://github.com/Pe1ercn/SkyLog)');
      req.setHeader('accept', '*/*');
      for (const [key, value] of Object.entries(options.headers || {})) {
        req.setHeader(key, value);
      }
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('response', (res) => finish(resolve, res));
    req.on('error', (error) => finish(reject, error));
    req.on('abort', () => finish(reject, new Error('Download cancelled')));
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        try { req.abort(); } catch { /* already ended */ }
        finish(reject, new Error('Download cancelled'));
      }, { once: true });
    }
    req.end();
  });
}

function decodeFilename(value) {
  return String(value || '')
    .replace(/^["']|["']$/g, '')
    .replace(/^UTF-8''/i, '');
}

function filenameFromHeaders(res, url) {
  const disposition = res.headers['content-disposition'];
  if (disposition) {
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8) return decodeURIComponent(decodeFilename(utf8[1]));
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    if (plain) return path.basename(decodeFilename(plain[1]));
  }
  let name = '';
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    name = path.basename(pathname);
  } catch {
    name = '';
  }
  if (!name || name === '/') name = `download-${Date.now()}`;
  if (!path.extname(name)) {
    const contentType = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const extension = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/zip': '.zip',
      'application/x-7z-compressed': '.7z',
      'application/json': '.json',
      'application/octet-stream': '.bin',
      'text/plain': '.txt',
    }[contentType];
    if (extension) name += extension;
  }
  return name;
}

function safeFilename(name) {
  return String(name || 'download.bin')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 180) || 'download.bin';
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${index})${ext}`);
    index += 1;
  }
  return candidate;
}

function speedOf(task) {
  const now = Date.now();
  const elapsed = Math.max(1, now - task.startedAt);
  return task.receivedBytes / (elapsed / 1000);
}

export class DownloadManager {
  constructor(options = {}) {
    this.onUpdate = options.onUpdate || (() => {});
    this.tasks = new Map();
    this.log = options.logger || (() => {});
  }

  list() {
    return [...this.tasks.values()].map((task) => this.snapshot(task));
  }

  snapshot(task) {
    return {
      id: task.id,
      url: task.url,
      filename: task.filename,
      targetPath: task.targetPath,
      targetDir: task.targetDir,
      status: task.status,
      totalBytes: task.totalBytes,
      receivedBytes: task.receivedBytes,
      progress: task.totalBytes ? Math.min(1, task.receivedBytes / task.totalBytes) : 0,      speedBps: task.status === 'downloading' ? speedOf(task) : 0,
      etaSeconds: task.status === 'downloading' && speedOf(task) > 0 && task.totalBytes
        ? Math.max(0, Math.round((task.totalBytes - task.receivedBytes) / speedOf(task)))
        : null,
      connections: task.connections,
      family: task.family || '',
      error: task.error || '',
      createdAt: task.createdAt,
      finishedAt: task.finishedAt || null,
    };
  }

  emit(task) {
    this.onUpdate(this.snapshot(task));
  }

  async start(input = {}) {
    const url = String(input.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are supported.');
    const targetDir = path.resolve(String(input.targetDir || '').trim());
    if (!targetDir) throw new Error('Please choose a download folder.');
    await fsp.mkdir(targetDir, { recursive: true });
    const controller = new AbortController();
    const task = {
      id: crypto.randomUUID(),
      url,
      targetDir,
      targetPath: '',
      filename: '',
      status: 'connecting',
      totalBytes: 0,
      receivedBytes: 0,
      connections: Math.max(1, Math.min(8, Number(input.connections) || 4)),
      family: String(input.family || ''),
      controller,
      startedAt: Date.now(),
      createdAt: new Date().toISOString(),
      error: '',
      finishedAt: null,
    };
    this.tasks.set(task.id, task);
    this.emit(task);
    try {
      let head;
      try {
        head = await request(url, { method: 'HEAD', signal: controller.signal });
      } catch {
        head = null;
      }
      const total = Number(head?.headers?.['content-length']) || 0;
      const ranges = /bytes/i.test(head?.headers?.['accept-ranges'] || '') && total > 8 * 1024 * 1024;
      task.filename = safeFilename(input.filename || filenameFromHeaders(head || { headers: {} }, url));
      task.targetPath = uniquePath(targetDir, task.filename);
      task.totalBytes = total;
      task.status = 'downloading';
      task.startedAt = Date.now();
      this.emit(task);
      if (ranges && task.connections > 1) {
        await this.downloadRanges(task, ranges);
      } else {
        await this.downloadSingle(task);
      }
      task.status = 'completed';
      task.finishedAt = new Date().toISOString();
      if (task.receivedBytes > task.totalBytes) task.totalBytes = task.receivedBytes;
      task.receivedBytes = task.totalBytes || task.receivedBytes;
      this.emit(task);      return this.snapshot(task);
    } catch (error) {
      task.error = error?.message || 'Download failed';
      task.status = controller.signal.aborted ? 'cancelled' : 'failed';
      task.finishedAt = new Date().toISOString();
      this.emit(task);
      throw error;
    }
  }

  async downloadSingle(task) {
    const response = await request(task.url, { signal: task.controller.signal });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume();
      throw new Error(`Download server returned ${response.statusCode}`);
    }
    if (!task.totalBytes) task.totalBytes = Number(response.headers['content-length']) || 0;
    const timer = setInterval(() => this.emit(task), 300);
    try {
      response.on('data', (chunk) => {
        task.receivedBytes += chunk.length;
      });
      await pipeline(response, fs.createWriteStream(task.targetPath));
    } finally {
      clearInterval(timer);
    }
  }

  async downloadRanges(task, supportsRanges) {
    if (!supportsRanges || !task.totalBytes) {
      await this.downloadSingle(task);
      return;
    }
    const count = task.connections;
    const chunk = Math.ceil(task.totalBytes / count);
    const parts = [];
    const timer = setInterval(() => this.emit(task), 300);
    try {
      const jobs = [];
      for (let i = 0; i < count; i += 1) {
        const start = i * chunk;
        const end = Math.min(task.totalBytes - 1, (i + 1) * chunk - 1);
        if (start > end) continue;
        const partPath = `${task.targetPath}.part${i}`;
        parts.push(partPath);
        jobs.push(this.downloadRange(task, start, end, partPath));
      }
      await Promise.all(jobs);
      const out = fs.createWriteStream(task.targetPath);
      for (const part of parts) {
        await new Promise((resolve, reject) => {
          const input = fs.createReadStream(part);
          input.on('error', reject);
          input.on('end', resolve);
          input.pipe(out, { end: false });
        });
        await fsp.rm(part, { force: true });
      }
      out.end();
      await new Promise((resolve) => out.on('close', resolve));
    } finally {
      clearInterval(timer);
    }
  }

  async downloadRange(task, start, end, partPath) {
    const response = await request(task.url, {
      headers: { range: `bytes=${start}-${end}` },
      signal: task.controller.signal,
    });
    if (response.statusCode !== 206) {
      response.resume();
      throw new Error('Server does not support range downloads.');
    }
    response.on('data', (chunk) => {
      task.receivedBytes += chunk.length;
    });
    await pipeline(response, fs.createWriteStream(partPath));
  }

  cancel(id) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.controller.abort();
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
    this.emit(task);
    return true;
  }
}
