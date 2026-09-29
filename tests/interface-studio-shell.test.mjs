import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../metamodern-interface-studio/assets/studio-shell/', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});
const all = files(root);
const read = (path) => readFileSync(join(root, path), 'utf8');

test('shell starter ships source only', () => {
  const rel = all.map((file) => relative(root, file).split('\\').join('/'));
  for (const excluded of ['node_modules/', 'dist/', '.git/']) {
    assert.ok(!rel.some((file) => file.startsWith(excluded)), `${excluded} must not be packaged`);
  }
  for (const required of ['README.md', 'package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'src/adapter.ts', 'src/studio/types.ts', 'src/studio/protocol.ts', 'src/studio/frame-client.ts', 'src/studio/live-preview.tsx', 'example/index.html', 'example/main.ts', 'src/studio/virtual-list.tsx', 'src/adapters/synthetic.ts', 'scripts/acceptance.mjs']) {
    assert.ok(rel.includes(required), `${required} is missing`);
  }
});

test('shell starter stays product-neutral and portable', () => {
  const forbidden = /(autostak|caelo|@kit\/ui|\/Users\/|file:\/\/)/i;
  for (const file of all) {
    if (file.endsWith('package-lock.json')) continue;
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, forbidden, `${relative(root, file)} contains client or machine-specific material`);
  }
  const lock = read('package-lock.json');
  for (const [, host] of lock.matchAll(/"resolved": "https:\/\/([^/]+)/g)) assert.equal(host, 'registry.npmjs.org');
});

test('the adapter is the only product seam in the shell', () => {
  const importers = all
    .filter((file) => /\.(ts|tsx)$/.test(file) && file.includes('/src/'))
    .filter((file) => /from "@\/adapters\//.test(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file));
  // The stress adapters extend the example; nothing else in the shell may import an adapter.
  assert.deepEqual(importers, ['src/adapter.ts', 'src/adapters/synthetic.ts']);
  assert.match(read('src/adapter.ts'), /export const adapter = /);
});

test('frame protocol is versioned and validates origin and source on both sides', () => {
  assert.match(read('src/studio/protocol.ts'), /export const PROTOCOL = "studio-preview\/1"/);
  const client = read('src/studio/frame-client.ts');
  assert.match(client, /e\.source !== window\.parent/);
  assert.match(client, /allowed\.includes\(e\.origin\)/);
  assert.doesNotMatch(client, /from "(react|@\/)/, 'the frame client must stay framework free');
  const host = read('src/studio/live-preview.tsx');
  assert.match(host, /e\.source !== el\.contentWindow/);
  assert.match(host, /e\.origin !== expectedOrigin/);
});

test('modified is a state set by real changes, not a click count', () => {
  const client = read('src/studio/frame-client.ts');
  assert.match(client, /MutationObserver/);
  assert.match(client, /e\.isTrusted/);
  assert.doesNotMatch(read('src/components/studio/chrome.tsx'), /Modified · \{/);
});

test('acceptance script covers every shell criterion', () => {
  const script = read('scripts/acceptance.mjs');
  for (let i = 1; i <= 16; i++) assert.match(script, new RegExp(`"AC-${String(i).padStart(2, '0')}"`), `AC-${i} is not checked`);
  assert.match(read('package.json'), /"acceptance": "node scripts\/acceptance\.mjs"/);
  assert.doesNotMatch(read('package.json'), /"playwright"/, 'Playwright stays optional');
});

test('large lists are windowed with one tab stop', () => {
  const list = read('src/studio/virtual-list.tsx');
  assert.match(list, /tabIndex=\{i === safeActive \? 0 : -1\}/);
  for (const file of ['src/components/studio/rail-panel.tsx', 'src/components/studio/views.tsx']) assert.match(read(file), /<VirtualList/);
});

test('starter documents local edits and the shell reference exists', () => {
  assert.match(read('README.md'), /Local edits to generated components/);
  assert.match(read('src/components/ui/select.tsx'), /alignItemWithTrigger = false/);
  const refs = fileURLToPath(new URL('../metamodern-interface-studio/references/', import.meta.url));
  for (const name of ['shell.md', 'frame-protocol.md']) assert.ok(existsSync(join(refs, name)), `${name} is missing`);
});

test('the frame can be resized in place and the Size menu lists every profile', () => {
  const handles = read('src/components/studio/resize-handles.tsx');
  assert.match(handles, /aria-label="Frame width"/);
  assert.match(handles, /aria-label="Frame height"/);
  assert.match(read('src/studio/types.ts'), /export type Resizable/);
  assert.match(read('src/components/studio/chrome.tsx'), /function SizeMenu/);
  assert.match(read('src/adapters/example.ts'), /resizable:/);
});
