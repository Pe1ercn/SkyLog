import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRrefPacket, decodeRrefMessage } from '../../electron/xplane-udp.js';

test('buildRrefPacket encodes an X-Plane RREF request', () => {
  const packet = buildRrefPacket(5, 7, 'sim/flightmodel/position/latitude');
  assert.equal(packet.length, 413);
  assert.equal(packet.subarray(0, 5).toString('ascii'), 'RREF\0');
  assert.equal(packet.readInt32LE(5), 5);
  assert.equal(packet.readInt32LE(9), 7);
  assert.equal(packet.subarray(13, 13 + 34).toString('ascii').replace(/\0+$/, ''), 'sim/flightmodel/position/latitude');
});

test('decodeRrefMessage reads index and float value', () => {
  const packet = Buffer.alloc(13);
  packet.write('RREF,', 0, 5, 'ascii');
  packet.writeInt32LE(3, 5);
  packet.writeFloatLE(121.5, 9);
  assert.deepEqual(decodeRrefMessage(packet), { index: 3, value: 121.5 });
});

test('decodeRrefMessage rejects non-RREF packets', () => {
  assert.equal(decodeRrefMessage(Buffer.from('DATA')), null);
  const other = Buffer.alloc(13);
  other.write('DATA,', 0, 5, 'ascii');
  assert.equal(decodeRrefMessage(other), null);
});
