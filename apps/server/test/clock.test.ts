import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeClock, RealClock } from '../src/clock.ts';

test('FakeClock: time moves only through advance(); timers fire in (time, arm-order) order; clearTimeout cancels', () => {
  const c = new FakeClock(100);
  const fired: string[] = [];
  assert.equal(c.now(), 100);
  const a = c.setTimeout(() => fired.push('a@' + c.now()), 50);
  c.setTimeout(() => fired.push('b@' + c.now()), 20);
  c.setTimeout(() => fired.push('c@' + c.now()), 50);
  const d = c.setTimeout(() => fired.push('d'), 10);
  c.clearTimeout(d);
  assert.equal(c.pending, 3);
  c.advance(19);
  assert.deepEqual(fired, []);
  assert.equal(c.now(), 119);
  c.advance(1);
  assert.deepEqual(fired, ['b@120']);
  c.advance(1000);
  assert.deepEqual(fired, ['b@120', 'a@150', 'c@150'], 'same-time timers fire in arm order; now() is the due time while firing');
  assert.equal(c.now(), 1120);
  assert.equal(c.pending, 0);
  c.clearTimeout(a); // already fired: no-op
});

test('FakeClock: a timer armed inside a callback fires within the same advance if due', () => {
  const c = new FakeClock();
  const fired: number[] = [];
  c.setTimeout(() => {
    fired.push(c.now());
    c.setTimeout(() => fired.push(c.now()), 5);
  }, 10);
  c.advance(20);
  assert.deepEqual(fired, [10, 15]);
});

test('RealClock: wraps Node timers and Date.now (the only place they are allowed)', async () => {
  const c = new RealClock();
  const before = c.now();
  assert.ok(Math.abs(before - Date.now()) < 50);
  const h = c.setTimeout(() => assert.fail('cancelled timer must not fire'), 5);
  c.clearTimeout(h);
  await new Promise<void>((resolve) => c.setTimeout(resolve, 10));
  assert.ok(c.now() >= before + 9);
});
