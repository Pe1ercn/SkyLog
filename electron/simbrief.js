import { PlanError } from '../shared/plan.js';

const API_URL = 'https://www.simbrief.com/api/xml.fetcher.php';
const DEFAULT_TIMEOUT_MS = 60000;

export class SimbriefError extends Error {
  constructor(message, code = 'simbrief-error', details = {}) {
    super(message);
    this.name = 'SimbriefError';
    this.code = code;
    this.details = details;
  }
}

function cleanValue(value) {
  return String(value || '').trim();
}

/**
 * Accept a numeric Pilot ID, a SimBrief share/OFP URL, or an explicit
 * "userid=123456" / "static_id=abc" style query.
 */
export function parsePilotQuery(input) {
  const raw = cleanValue(input);
  if (!raw) {
    throw new SimbriefError('请输入 SimBrief Pilot ID', 'empty-query');
  }
  if (/^\d{1,10}$/.test(raw)) {
    return { kind: 'userid', value: raw, label: `Pilot ID ${raw}` };
  }
  if (/^userid=\d{1,10}$/i.test(raw)) {
    const value = raw.split('=')[1];
    return { kind: 'userid', value, label: `Pilot ID ${value}` };
  }
  if (/^static_id=[A-Za-z0-9_-]{1,80}$/i.test(raw)) {
    const value = raw.split('=')[1];
    return { kind: 'static_id', value, label: `计划 ${value}` };
  }
  if (/^username=[A-Za-z0-9_.-]{1,60}$/i.test(raw)) {
    const value = raw.split('=')[1];
    return { kind: 'username', value, label: `用户名 ${value}` };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SimbriefError(
      '请输入数字 Pilot ID，或粘贴 SimBrief 的飞行计划链接',
      'invalid-query',
    );
  }
  if (!/^(www\.)?simbrief\.com$/i.test(url.hostname)) {
    throw new SimbriefError('只支持 simbrief.com 的链接', 'invalid-host');
  }
  const userid = url.searchParams.get('userid');
  if (userid && /^\d{1,10}$/.test(userid)) {
    return { kind: 'userid', value: userid, label: `Pilot ID ${userid}` };
  }
  const staticId = url.searchParams.get('static_id');
  if (staticId && /^[A-Za-z0-9_-]{1,80}$/.test(staticId)) {
    return { kind: 'static_id', value: staticId, label: `计划 ${staticId}` };
  }
  const username = url.searchParams.get('username');
  if (username && /^[A-Za-z0-9_.-]{1,60}$/.test(username)) {
    return { kind: 'username', value: username, label: `用户名 ${username}` };
  }
  throw new SimbriefError(
    '链接里没有找到 userid、static_id 或 username 参数',
    'missing-query-param',
  );
}

export function buildApiUrl(parsed) {
  const url = new URL(API_URL);
  url.searchParams.set(parsed.kind, parsed.value);
  url.searchParams.set('json', '1');
  return url.toString();
}

function friendlySimbriefMessage(status) {
  const detail = cleanValue(status).replace(/^error:\s*/i, '');
  if (/unknown userid/i.test(detail)) {
    return '找不到这个 SimBrief Pilot ID，请到 SimBrief 账号设置里核对。';
  }
  if (/no flight plan on file/i.test(detail)) {
    return '这个账号目前没有飞行计划。请先在 SimBrief 生成一份 OFP，再回来读取。';
  }
  if (/invalid static id/i.test(detail)) {
    return '这个 SimBrief 计划编号无效或已经过期。';
  }
  if (/unknown username/i.test(detail)) {
    return '找不到这个 SimBrief 用户名。';
  }
  return detail || 'SimBrief 返回了未知错误';
}

/**
 * Download the latest OFP for a Pilot ID (or a specific shared plan).
 * Returns the raw JSON plus a small metadata object; normalization happens
 * in the caller so preview and import share exactly the same code path.
 */
export async function fetchSimbriefPlan(input, options = {}) {
  const parsed = options.parsed || parsePilotQuery(input);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new SimbriefError('当前环境不支持网络请求', 'fetch-unavailable');
  }
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const url = buildApiUrl(parsed);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SkyLog/1.0 (SimBrief OFP reader)',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new SimbriefError('连接 SimBrief 超时，请检查网络后重试。', 'network-timeout');
    }
    throw new SimbriefError(
      '无法连接 SimBrief，请检查网络或稍后再试。',
      'network-error',
      { detail: error?.message || '' },
    );
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new SimbriefError(
        '读取 SimBrief 计划超时。计划较大时可能需要更久，请重试。',
        'network-timeout',
      );
    }
    throw new SimbriefError('读取 SimBrief 返回内容失败，请检查网络后重试。', 'network-error', {
      detail: error?.message || '',
    });
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new SimbriefError(
      'SimBrief 返回的内容不是有效的 JSON，可能是网络问题或服务暂时不可用。',
      'invalid-response',
      { status: response.status, snippet: text.slice(0, 300) },
    );
  }

  const status = String(payload?.fetch?.status || '');
  if (!response.ok || !/^success/i.test(status)) {
    const message = friendlySimbriefMessage(status || `HTTP ${response.status}`);
    throw new SimbriefError(message, 'simbrief-rejected', {
      status: response.status,
      simbriefStatus: status,
    });
  }
  if (!payload?.origin || !payload?.destination) {
    throw new SimbriefError('SimBrief 返回的计划缺少机场信息，无法使用。', 'invalid-plan');
  }

  const meta = {
    source: parsed.kind,
    pilotId: String(
      (typeof payload?.params?.user_id === 'string' || typeof payload?.params?.user_id === 'number'
        ? payload.params.user_id
        : '') ||
        (typeof payload?.fetch?.userid === 'string' ? payload.fetch.userid : '') ||
        (parsed.kind === 'userid' ? parsed.value : ''),
    ),
    staticId: String(
      (typeof payload?.params?.static_id === 'string' ? payload.params.static_id : '') ||
        (typeof payload?.fetch?.static_id === 'string' ? payload.fetch.static_id : '') ||
        (parsed.kind === 'static_id' ? parsed.value : ''),
    ),
    username: parsed.kind === 'username' ? parsed.value : '',
    requestId: String(payload?.params?.request_id || ''),
    generatedAt: Number(payload?.params?.time_generated || 0) * 1000 || null,
    airac: String(payload?.params?.airac || ''),
    units: String(payload?.params?.units || ''),
    ofpLayout: String(payload?.params?.ofp_layout || ''),
    rawBytes: Buffer.byteLength(text, 'utf8'),
    fetchedAt: Date.now(),
    origin: String(payload?.origin?.icao_code || ''),
    destination: String(payload?.destination?.icao_code || ''),
    callsign: String(payload?.atc?.callsign || payload?.general?.flight_number || ''),
  };
  return { raw: payload, meta, parsed };
}

/** Convert any error into the IPC-safe shape used by the renderer. */
export function toErrorPayload(error) {
  if (error instanceof SimbriefError) {
    return { code: error.code, message: error.message, details: error.details || {} };
  }
  if (error instanceof PlanError) {
    return { code: error.code || 'invalid-plan', message: error.message, details: {} };
  }
  return {
    code: error?.code || 'unknown',
    message: error?.message || '发生未知错误',
    details: error?.details || {},
  };
}
