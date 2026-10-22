import test from 'node:test';
import assert from 'node:assert/strict';
import { accentHL, accentAgreement } from '../../src/song/analyze.mjs';

test('accentHL follows Tokyo-type accent rules', () => {
  const ap = (n, accent) => ({ moras: Array.from({ length: n }, () => ({})), accent });
  assert.deepEqual(accentHL([ap(3, 1)]), [1, 0, 0]); // 頭高: HLL
  assert.deepEqual(accentHL([ap(4, 0)]), [0, 1, 1, 1]); // 平板: LHHH
  assert.deepEqual(accentHL([ap(4, 2)]), [0, 1, 0, 0]); // 中高: LHLL
  assert.deepEqual(accentHL([ap(2, 1), ap(3, 0)]), [1, 0, 0, 1, 1]); // phrases restart
});

test('accentAgreement counts melody moves that follow accent moves', () => {
  const hl = [0, 1, 1, 0]; // L H H L
  assert.deepEqual(accentAgreement(hl, [60, 64, 64, 60]), { agree: 2, total: 2, marks: '○·○' });
  assert.deepEqual(accentAgreement(hl, [64, 60, 60, 64]), { agree: 0, total: 2, marks: '×·×' });
  assert.deepEqual(accentAgreement([1, 1], [60, 62]), { agree: 0, total: 0, marks: '·' });
});
