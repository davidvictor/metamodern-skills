import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { studioSource } from './studio-source.mjs';

const read = (path) => readFileSync(`${studioSource}/${path}`, 'utf8');

// A task-owned history stack models the existing push-current-URL / replace-new-selection contract.
function browser(initialHash) {
  const entries = [`https://studio.example/review${initialHash}`];
  let index = 0;
  const writes = [];
  const location = {
    get href() { return entries[index]; },
    get hash() { return new URL(entries[index]).hash; },
  };
  const history = {
    replaceState(state, title, url) {
      writes.push({ state, title, url });
      entries[index] = new URL(url, location.href).href;
    },
    pushState(_state, _title, url) {
      entries.splice(index + 1);
      entries.push(new URL(url, location.href).href);
      index++;
    },
    back() { if (index) index--; },
    forward() { if (index + 1 < entries.length) index++; },
  };
  const source = stripTypeScriptTypes(read('src/studio/history.ts'), { mode: 'strip' });
  const replace = runInNewContext(`${source.replace('export function', 'function')}\nreplaceStudioHash`, { location, history });
  return { location, history, writes, entries, replace };
}

test('100 repeated identical serialized selections never consume replacement writes', () => {
  for (const hash of ['#library=button&theme=light', '#module=tools&section=settings', '#view=inspect&scenario=example&theme=dark&profile=desktop']) {
    const b = browser(hash);
    for (let rerender = 0; rerender < 100; rerender++) b.replace(hash);
    assert.equal(b.writes.length, 0, hash);
    const changed = `${hash}&direction=direction.example&revision=2`;
    b.replace(changed);
    for (let rerender = 0; rerender < 100; rerender++) b.replace(changed);
    assert.equal(b.writes.length, 1, 'a real direction/revision change is written once');
    assert.equal(b.location.hash, changed);
    assert.equal(b.entries.length, 1);
  }
});

test('current URL equality is checked again after navigation, with no stale desired-hash cache', () => {
  const b = browser('#library=button&theme=light');
  b.replace('#library=dialog&theme=light');
  b.history.pushState(null, '', '#library=counter&theme=light');
  b.replace('#library=dialog&theme=light');
  assert.equal(b.writes.length, 2);
  assert.equal(b.location.hash, '#library=dialog&theme=light');
});

test('same-URL Library push entries survive, preserving Back and Forward through changed selections', () => {
  const b = browser('#library=button&theme=light');
  for (const component of ['dialog', 'counter']) {
    b.history.pushState(null, '', b.location.href);
    b.replace(b.location.hash); // A repeated effect must not erase the intentional entry.
    b.replace(`#library=${component}&theme=light`);
  }
  assert.equal(b.entries.length, 3);
  assert.equal(b.writes.length, 2);
  b.history.back();
  assert.equal(b.location.hash, '#library=dialog&theme=light');
  b.replace(b.location.hash);
  b.history.back();
  assert.equal(b.location.hash, '#library=button&theme=light');
  b.history.forward();
  assert.equal(b.location.hash, '#library=dialog&theme=light');
  b.history.forward();
  assert.equal(b.location.hash, '#library=counter&theme=light');
  assert.equal(b.writes.length, 2);
});

test('all store serialization branches use the guard while Library push behavior stays explicit', () => {
  const store = read('src/store.tsx');
  assert.equal((store.match(/replaceStudioHash\(`#\$\{q\}`\)/g) ?? []).length, 3);
  assert.doesNotMatch(store, /history\.replaceState/);
  assert.match(read('src/studio/library/library-nav.tsx'), /history\.pushState\(null, "", location\.href\)/);
});
