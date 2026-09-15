/**
 * Static guards (Stage B plan §10): dependency direction, no simulator/hot-seat
 * imports, Math.random absent, wall-clock and timers confined to clock.ts,
 * crypto randomness confined to session.ts, engine still dependency-free.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const src = resolve(here, '..', 'src');
const repo = resolve(here, '..', '..', '..');

function sources(): { name: string; text: string }[] {
  return readdirSync(src)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f, text: readFileSync(join(src, f), 'utf8') }));
}

const IMPORT_RE = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;

test('guards: server imports only ./, node:*, @colyseus/core|ws-transport; never simulator, hotseat or the engine path directly', () => {
  for (const { name, text } of sources()) {
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1]!;
      const ok = spec.startsWith('./') || spec.startsWith('node:') || spec === '@colyseus/core' || spec === '@colyseus/ws-transport' || (name === 'engine.ts' && spec === '@fortune-district/engine');
      assert.ok(ok, `${name} imports ${spec}`);
      assert.ok(!/simulator|hotseat|packages\/engine/.test(spec), `${name} must not import ${spec}`);
    }
    if (name !== 'engine.ts') assert.ok(!text.includes('@fortune-district/engine'), `${name} bypasses engine.ts`);
  }
});

test('guards: no Math.random anywhere in apps/server/src', () => {
  for (const { name, text } of sources()) assert.ok(!text.includes('Math.random'), `${name} uses Math.random`);
});

test('guards: Date.now / setTimeout / setInterval / performance.now only in clock.ts', () => {
  for (const { name, text } of sources()) {
    if (name === 'clock.ts') continue;
    for (const needle of ['Date.now', 'new Date', 'setTimeout(', 'setInterval(', 'performance.now']) {
      // Type references to the Clock interface method are fine; direct global calls are not.
      const direct = new RegExp(`(^|[^.\\w])${needle.replace('(', '\\(').replace('.', '\\.')}`, 'm');
      assert.ok(!direct.test(text), `${name} touches the wall clock via ${needle}`);
    }
  }
});

test('guards: node:crypto randomness only in session.ts', () => {
  for (const { name, text } of sources()) {
    if (name === 'session.ts') continue;
    assert.ok(!/randomBytes|randomInt|randomUUID|node:crypto/.test(text), `${name} uses crypto randomness`);
  }
});

test('guards: MatchSession has no Colyseus import; the engine package still has zero runtime dependencies', () => {
  const ms = readFileSync(join(src, 'match-session.ts'), 'utf8');
  assert.ok(!ms.includes('colyseus'), 'match-session.ts must not import Colyseus');
  const enginePkg = JSON.parse(readFileSync(join(repo, 'packages', 'engine', 'package.json'), 'utf8')) as { dependencies?: unknown };
  assert.equal(enginePkg.dependencies, undefined);
  const serverPkg = JSON.parse(readFileSync(join(repo, 'apps', 'server', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  assert.deepEqual(Object.keys(serverPkg.dependencies).sort(), ['@colyseus/core', '@colyseus/schema', '@colyseus/ws-transport']);
});
