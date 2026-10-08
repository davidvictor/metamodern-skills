import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
const script = new URL('../metamodern-interface-studio/scripts/update-studio.mjs', import.meta.url).pathname;
const run = (dir, args) => spawnSync(process.execPath, [script, dir, ...args, '--json'], { encoding: 'utf8' });
test('host creation, legacy Vite interpretation, preservation, and mismatch refuse writes', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-host-contract-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const host of ['vite', 'next']) {
    const dir = join(root, host);
    assert.equal(run(dir, ['--create', '--host', host]).status, 0);
    const lockPath = join(dir, 'studio-shell.lock.json');
    const lock = JSON.parse(readFileSync(lockPath));
    assert.equal(lock.host, host); assert.equal(lock.schema, 'studio-shell-lock/2');
    assert.ok(lock.composition.common['src/App.tsx']); assert.ok(lock.composition.overlay['package.json']);
    const product = join(dir, 'src/design-runtime/index.ts'); writeFileSync(product, '// owned compiler map\n');
    const directions = join(dir, 'directions.json'); writeFileSync(directions, '{\"product-owned\":true}\n');
    const bytes = readFileSync(lockPath, 'utf8');
    const mismatch = run(dir, ['--apply', '--host', host === 'vite' ? 'next' : 'vite', '--skip-checks']);
    assert.notEqual(mismatch.status, 0); assert.match(mismatch.stderr, /explicit migration/); assert.equal(readFileSync(lockPath, 'utf8'), bytes);
    const result = run(dir, ['--apply', '--skip-checks']); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).host, host);
    assert.equal(readFileSync(product, 'utf8'), '// owned compiler map\n');
    assert.equal(readFileSync(directions, 'utf8'), '{\"product-owned\":true}\n');
    if (host === 'vite') {
      delete lock.host; delete lock.composition; lock.schema = 'studio-shell-lock/1'; writeFileSync(lockPath, JSON.stringify(lock));
      const legacy = run(dir, ['--apply', '--skip-checks']); assert.equal(legacy.status, 0, legacy.stderr); assert.equal(JSON.parse(readFileSync(lockPath)).host, 'vite');
    }
  }
});
async function pure(name) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-host-pure-'));
  const file = join(dir, `${name}.mjs`);
  const source = readFileSync(new URL(`../metamodern-interface-studio/assets/studio-shell/${name === 'compiler' ? 'src/studio/design-runtime.ts' : 'scripts/saved-file.ts'}`, import.meta.url), 'utf8');
  writeFileSync(file, stripTypeScriptTypes(source, { mode: 'strip' }));
  return { module: await import(pathToFileURL(file).href), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test('compiler seam is opt-in, resolves explicit map, rejects mismatched authority and executable output', async t => {
  const loaded = await pure('compiler'); t.after(loaded.cleanup);
  const { compileDesign } = loaded.module;
  const descriptor = { schema: 'studio-design-compiler/1', id: 'synthetic', version: '1', sourceLockId: 'fixture-source', inputSchema: 'fixture/1', outputSchema: 'studio-compiled-design/1' };
  const result = { schema: 'studio-compiled-design/1', compiler: { id: 'synthetic', version: '1' }, sourceLockId: 'fixture-source', fingerprint: 'fixture-fingerprint', tokens: { '--fixture': 'blue' }, css: '', stylesheets: [] };
  const input = { direction: { color: 'blue' }, theme: 'light', sourceLockId: 'fixture-source' };
  assert.deepEqual(await compileDesign(descriptor, { synthetic: async () => ({ compile: () => result }) }, input), result);
  await assert.rejects(compileDesign(descriptor, {}, input), /No product compiler/);
  for (const id of ['constructor', 'toString', '__proto__']) await assert.rejects(compileDesign({ ...descriptor, id }, {}, input), /No product compiler registered/);
  await assert.rejects(compileDesign(descriptor, { synthetic: 42 }, input), /No product compiler registered/);
  let called = false;
  await assert.rejects(compileDesign(descriptor, Object.create({ synthetic: async () => { called = true; return { compile: () => result }; } }), input), /No product compiler registered/);
  assert.equal(called, false);
  const cyclic = {}; cyclic.self = cyclic; await assert.rejects(compileDesign(descriptor, {}, { ...input, direction: cyclic }), /JSON data/);
  await assert.rejects(compileDesign(descriptor, {}, { ...input, sourceLockId: 'wrong' }), /source lock/);
  await assert.rejects(compileDesign(descriptor, { synthetic: async () => ({ compile: () => ({ ...result, fingerprint: '', helper: () => {} }) }) }, input), /JSON data/);
});
test('Fetch save transport retains revision, schema, size, origin and unreadable-file protections', async t => {
  const loaded = await pure('saved'); t.after(loaded.cleanup);
  const root = mkdtempSync(join(tmpdir(), 'studio-fetch-save-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ["constructor", "toString", "__proto__", "prototype", "unknown"]) assert.equal(loaded.module.isSavedFileName(name), false);
  assert.equal(loaded.module.isSavedFileName("layouts"), true);
  assert.equal(loaded.module.isSavedFileName("scenarios"), true);
  const file = join(root, 'scenarios.json');
  const options = { file, schema: 'fixture/1', list: 'scenarios', maxBytes: 128, validate: v => v?.schema === 'fixture/1' && Array.isArray(v.scenarios) ? [] : ['invalid'], forbidden: 'origin denied', tooBig: 'too big' };
  const call = (method, body, headers = {}) => loaded.module.savedFileRequest(options, new Request('http://localhost:1234/__studio/scenarios', { method, ...(body === undefined ? {} : { body }), headers: { origin: 'http://localhost:1234', 'content-type': 'application/json', ...headers } }));
  const empty = await call('GET'); assert.equal(empty.headers.get('x-studio-revision'), 'empty');
  const body = JSON.stringify({ schema: 'fixture/1', scenarios: [] });
  const saved = await call('POST', body, { 'x-studio-expected-revision': 'empty' }); assert.equal(saved.status, 200);
  const bytes = readFileSync(file, 'utf8');
  assert.equal((await call('POST', body, { 'x-studio-expected-revision': 'empty' })).status, 409);
  assert.equal((await call('POST', body, { origin: 'http://attacker.test' })).status, 403);
  assert.equal((await call('POST', body, { origin: 'https://localhost:1234' })).status, 403);
  const normalized = await loaded.module.savedFileRequest(options, new Request('http://localhost:1234/__studio/scenarios', { method: 'POST', body, headers: { host: '127.0.0.1:1234', origin: 'http://127.0.0.1:1234', 'content-type': 'application/json' } }));
  assert.equal(normalized.status, 200, 'Next normalized URL retains incoming HTTP authority');
  assert.equal((await call('POST', '{}')).status, 422);
  assert.equal((await call('POST', 'x'.repeat(129))).status, 413);
  assert.equal((await call('POST', body, { 'content-type': 'text/plain' })).status, 415);
  assert.equal(readFileSync(file, 'utf8'), bytes);
  writeFileSync(file, 'merge conflict'); const broken = await call('GET'); assert.equal(broken.headers.get('x-studio-unreadable'), '1');
});

test('Next live saved-file bootstrap resolves new scenario/layout IDs before common store initialization; review builds use snapshots', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-next-bootstrap-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = readFileSync(new URL('../metamodern-interface-studio/assets/studio-hosts/next/src/studio-host.ts', import.meta.url), 'utf8');
  writeFileSync(join(dir, 'runtime.mjs'), 'export const bundled = {workspace:true,library:true,scenarios:{scenarios:[]},layouts:{layouts:[]}}');
  writeFileSync(join(dir, 'host.mjs'), stripTypeScriptTypes(source, { mode: 'strip' }).replace('../.studio-generated/runtime', './runtime.mjs'));
  const { host, initializeHost } = await import(pathToFileURL(join(dir, 'host.mjs')).href);
  const fetchBefore = globalThis.fetch; t.after(() => { globalThis.fetch = fetchBefore; });
  const live = { scenarios: { schema: 'studio-scenarios/1', scenarios: [{ id: 'saved.new', values: { done: true } }] }, layouts: { schema: 'studio-layouts/1', layouts: [{ id: 'layout.new', frames: [{ w: 390, h: 844 }] }] }, directions: { schema: 'studio-directions/1', revisions: [], events: [] } };
  const calls = [];
  globalThis.fetch = async url => { calls.push(url); return Response.json(live[url.split('/').at(-1)]); };
  host.canSave = true; await initializeHost();
  assert.deepEqual(host.directions, live.directions); assert.deepEqual(host.scenarios, live.scenarios); assert.deepEqual(host.layouts, live.layouts); assert.equal(calls.length, 3);
  host.canSave = false; await initializeHost(); assert.equal(calls.length, 3, 'review builds never fetch a development service');
});

test('live saved-layout read restores only the untouched initial requested selection', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-layout-recovery-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = readFileSync(new URL('../metamodern-interface-studio/assets/studio-shell/src/studio/layouts.ts', import.meta.url), 'utf8');
  const file = join(dir, 'layouts.mjs'); writeFileSync(file, stripTypeScriptTypes(source, { mode: 'strip' }));
  const { linkedLayoutRecovery } = await import(pathToFileURL(file).href);
  const initial = { layout: 'default', frames: [] }, saved = { id: 'saved-layout', name: 'Saved', frames: [] };
  assert.equal(linkedLayoutRecovery('saved-layout', initial, initial, [saved]).layout, saved);
  assert.deepEqual(linkedLayoutRecovery('saved-layout', initial, { ...initial, layout: 'user-chosen' }, [saved]), { layout: undefined, missing: false });
  assert.deepEqual(linkedLayoutRecovery('saved-layout', initial, { ...initial, frames: ['edited'] }, [saved]), { layout: undefined, missing: false });
  assert.deepEqual(linkedLayoutRecovery('deleted-layout', initial, initial, [saved]), { layout: undefined, missing: true });
  assert.deepEqual(linkedLayoutRecovery(null, initial, initial, [saved]), { layout: undefined, missing: false });
});
