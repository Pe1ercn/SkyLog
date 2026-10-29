import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePilotQuery,
  buildApiUrl,
  fetchSimbriefPlan,
  SimbriefError,
} from '../../electron/simbrief.js';
import { makeRawPlan } from '../fixtures/simbrief-fixture.js';

test('parses numeric pilot IDs and explicit query values', () => {
  assert.deepEqual(parsePilotQuery(' 123456 '), {
    kind: 'userid',
    value: '123456',
    label: 'Pilot ID 123456',
  });
  assert.equal(parsePilotQuery('userid=987654').value, '987654');
  assert.equal(parsePilotQuery('static_id=abc_123').kind, 'static_id');
  assert.equal(parsePilotQuery('username=sky.pilot').kind, 'username');
});

test('parses SimBrief URLs and rejects other hosts', () => {
  assert.equal(
    parsePilotQuery('https://www.simbrief.com/api/xml.fetcher.php?userid=123456&json=1').value,
    '123456',
  );
  assert.equal(
    parsePilotQuery('https://simbrief.com/system/dispatch.php?static_id=abc-123').kind,
    'static_id',
  );
  assert.throws(
    () => parsePilotQuery('https://example.com/?userid=1'),
    (error) => error instanceof SimbriefError && error.code === 'invalid-host',
  );
  assert.throws(
    () => parsePilotQuery('not a pilot id'),
    (error) => error instanceof SimbriefError && error.code === 'invalid-query',
  );
});

test('builds the official JSON API URL', () => {
  const url = new URL(buildApiUrl({ kind: 'userid', value: '123456' }));
  assert.equal(url.origin, 'https://www.simbrief.com');
  assert.equal(url.pathname, '/api/xml.fetcher.php');
  assert.equal(url.searchParams.get('userid'), '123456');
  assert.equal(url.searchParams.get('json'), '1');
});

test('downloads and reports metadata for a valid plan', async () => {
  const raw = makeRawPlan();
  let requested = '';
  const result = await fetchSimbriefPlan('123456', {
    fetchImpl: async (url) => {
      requested = String(url);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(raw),
      };
    },
  });
  assert.match(requested, /userid=123456/);
  assert.equal(result.meta.pilotId, '123456');
  assert.equal(result.meta.requestId, 'req-20261024-0001');
  assert.equal(result.meta.origin, 'CYUL');
  assert.equal(result.meta.destination, 'KLAX');
  assert.equal(result.meta.units, 'kgs');
  assert.equal(result.raw.general.flight_number, '123');
});

test('maps SimBrief API errors to friendly errors', async () => {
  await assert.rejects(
    () =>
      fetchSimbriefPlan('999999', {
        fetchImpl: async () => ({
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              fetch: {
                userid: '999999',
                status: 'Error: No flight plan on file for the specified user',
              },
            }),
        }),
      }),
    (error) =>
      error instanceof SimbriefError &&
      error.code === 'simbrief-rejected' &&
      /没有飞行计划/.test(error.message),
  );
});

test('rejects invalid JSON and network timeouts', async () => {
  await assert.rejects(
    () =>
      fetchSimbriefPlan('1', {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => '<html>oops</html>',
        }),
      }),
    (error) => error instanceof SimbriefError && error.code === 'invalid-response',
  );

  await assert.rejects(
    () =>
      fetchSimbriefPlan('1', {
        fetchImpl: async () => {
          const error = new Error('timed out');
          error.name = 'TimeoutError';
          throw error;
        },
      }),
    (error) => error instanceof SimbriefError && error.code === 'network-timeout',
  );

  await assert.rejects(
    () =>
      fetchSimbriefPlan('1', {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => {
            const error = new Error('The operation was aborted due to timeout');
            error.name = 'TimeoutError';
            throw error;
          },
        }),
      }),
    (error) =>
      error instanceof SimbriefError &&
      error.code === 'network-timeout' &&
      /超时/.test(error.message),
  );
});
