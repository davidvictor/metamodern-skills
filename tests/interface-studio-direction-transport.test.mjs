import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const source = readFileSync(new URL('../metamodern-interface-studio/assets/studio-shell/scripts/saved-file.ts', import.meta.url), 'utf8');
async function fixture(t, transport = 'fetch', actualSchema = false) {
  const root = mkdtempSync(join(tmpdir(), 'studio-direction-transport-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const injected = source.replace('readFileSync, renameSync,', 'readFileSync as actualRead, renameSync as actualRename,') + `
export let fault = null;
export function setFault(value) { fault = value; }
function readFileSync(...args) { if (fault === 'read') throw Object.assign(new Error('fixture permission denied'), {code:'EACCES'}); return actualRead(...args); }
function renameSync(...args) { if (fault === 'rename') throw new Error('fixture interrupted rename'); return actualRename(...args); }
`;
  writeFileSync(join(root, 'transport.mjs'), stripTypeScriptTypes(injected, { mode: 'strip' }));
  const module = await import(pathToFileURL(join(root, 'transport.mjs')).href);
  const file = join(root, 'directions.json');
  const empty = () => ({ schema: 'studio-directions/1', revisions: [], events: [] });
  const options = { file, route: '/__studio/directions', schema: 'studio-directions/1', list: 'revisions', empty, maxBytes: 1024, requireRevision: true,
    validate: v => v?.schema === 'studio-directions/1' && Array.isArray(v.revisions) && Array.isArray(v.events) ? [] : ['invalid journal'],
    validateTransition: (previous, next) => previous.revisions.every((r, i) => JSON.stringify(r) === JSON.stringify(next.revisions[i])) ? [] : ['immutable revision'], forbidden: 'origin denied', tooBig: 'too big' };
  if (actualSchema) {
    const shell = new URL('../metamodern-interface-studio/assets/studio-shell/src/studio/', import.meta.url);
    writeFileSync(join(root, 'design-runtime.mjs'), stripTypeScriptTypes(readFileSync(new URL('design-runtime.ts', shell), 'utf8'), { mode: 'strip' }));
    writeFileSync(join(root, 'directions.mjs'), stripTypeScriptTypes(readFileSync(new URL('directions.ts', shell), 'utf8'), { mode: 'strip' }).replace('"./design-runtime"', '"./design-runtime.mjs"'));
    const schema = await import(pathToFileURL(join(root, 'directions.mjs')).href);
    options.validate = schema.validateDirections; options.validateTransition = schema.validateDirectionTransition;
  }
  let base = 'http://localhost:1234';
  if (transport === 'node') {
    const server = createServer(module.savedFileMiddleware(options));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    t.after(() => new Promise(resolve => server.close(resolve)));
  }
  const call = (method, data, headers = {}) => {
    const init = { method, headers: { origin: base, 'content-type': 'application/json', ...headers }, ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) };
    return transport === 'node' ? fetch(`${base}/__studio/directions`, init) : module.savedFileRequest(options, new Request(`${base}/__studio/directions`, init));
  };
  return { root, file, empty, call, module, options, base };
}
for (const transport of ['fetch', 'node']) test(`${transport} direction journal requires CAS and rejects immutable replacement without changing stored bytes`, async t => {
  const f = await fixture(t, transport);
  const get = await f.call('GET'); assert.deepEqual(await get.json(), f.empty());
  assert.equal(get.headers.get('x-studio-revision'), 'empty');
  const one = { ...f.empty(), revisions: [{ id: 'fixture', revision: 1, payload: { value: 1 } }] };
  assert.equal((await f.call('POST', one)).status, 428);
  const saved = await f.call('POST', one, { 'x-studio-expected-revision': 'empty' }); assert.equal(saved.status, 200);
  const bytes = readFileSync(f.file, 'utf8'); const revision = saved.headers.get('x-studio-revision');
  assert.equal((await f.call('POST', one, { 'x-studio-expected-revision': 'empty' })).status, 409);
  assert.equal((await f.call('POST', { ...one, revisions: [] }, { 'x-studio-expected-revision': revision })).status, 422);
  assert.equal(readFileSync(f.file, 'utf8'), bytes);
  const two = { ...one, revisions: [...one.revisions, { id: 'fixture', revision: 2, payload: { value: 2 } }] };
  assert.equal((await f.call('POST', two, { 'x-studio-expected-revision': revision })).status, 200);
  assert.deepEqual(JSON.parse(readFileSync(f.file)), two);
  assert.deepEqual(readdirSync(f.root).filter(n => n.endsWith('.tmp')), []);
});
test('direction reads fail closed for malformed, invalid and filesystem errors', async t => {
  const f = await fixture(t);
  for (const bytes of ['torn {', JSON.stringify({ schema: 'wrong', revisions: [] })]) {
    writeFileSync(f.file, bytes);
    const read = await f.call('GET'); assert.equal(read.status, 500); assert.equal(read.headers.get('x-studio-unreadable'), '1');
    assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': read.headers.get('x-studio-revision') ?? 'empty' })).status, 500);
    assert.equal(readFileSync(f.file, 'utf8'), bytes);
  }
  rmSync(f.file); mkdirSync(f.file);
  assert.equal((await f.call('GET')).status, 500, 'EISDIR is not mistaken for missing data');
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': 'empty' })).status, 500);
  assert.deepEqual(readdirSync(f.file), []);
});
for (const transport of ['fetch', 'node']) test(`${transport} origin rejection precedes body budget; prototype routes remain denied`, async t => {
  const f = await fixture(t, transport);
  assert.equal((await f.call('POST', 'x'.repeat(1025), { origin: 'http://attacker.test', 'x-studio-expected-revision': 'empty' })).status, 403);
  assert.equal((await f.call('POST', 'x'.repeat(1025), { 'x-studio-expected-revision': 'empty' })).status, 413);
  assert.equal(f.module.isSavedFileName('directions'), true);
  for (const name of ['constructor', '__proto__', 'prototype', 'unknown']) assert.equal(f.module.isSavedFileName(name), false);
});

test('permission errors, interrupted uploads and failed final rename never overwrite a saved journal', async t => {
  const f = await fixture(t);
  const first = await f.call('POST', f.empty(), { 'x-studio-expected-revision': 'empty' });
  assert.equal(first.status, 200);
  const bytes = readFileSync(f.file, 'utf8'); const revision = first.headers.get('x-studio-revision');
  f.module.setFault('read');
  assert.equal((await f.call('GET')).status, 500);
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': revision })).status, 500);
  f.module.setFault('rename');
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': revision })).status, 500);
  assert.equal(readFileSync(f.file, 'utf8'), bytes);
  assert.deepEqual(readdirSync(f.root).filter(n => n.endsWith('.tmp')), []);
  f.module.setFault(null);
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); c.error(new Error('fixture interrupted upload')); } });
  await assert.rejects(f.module.savedFileRequest({ file: f.file, maxBytes: 1024, forbidden: 'origin denied' }, new Request('http://localhost:1234/__studio/directions', { method: 'POST', headers: { origin: 'http://localhost:1234' }, body, duplex: 'half' })), /interrupted upload/);
  assert.equal(readFileSync(f.file, 'utf8'), bytes);
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': revision })).status, 200, 'retry after the fault succeeds');
});

test('registered journal schema persists revisions/deletion history and refuses mutation with the correct CAS', async t => {
  const f = await fixture(t, 'node', true);
  const e = { schema: 'studio-direction/1', id: 'fixture', label: 'First', revision: 1, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', product: { id: 'fixture-product', revision: 'source-1' }, payloadSchema: 'fixture/1', payload: { value: 1 } };
  const one = { ...f.empty(), revisions: [e] };
  const first = await f.call('POST', one, { 'x-studio-expected-revision': 'empty' }); assert.equal(first.status, 200);
  const revision = first.headers.get('x-studio-revision'); const bytes = readFileSync(f.file, 'utf8');
  assert.equal((await f.call('POST', { ...one, revisions: [{ ...e, payload: { value: 999 } }] }, { 'x-studio-expected-revision': revision })).status, 422);
  assert.equal(readFileSync(f.file, 'utf8'), bytes);
  const event = { id: 'delete-fixture', directionId: 'fixture', revision: 1, kind: 'delete', at: '2026-10-07T01:00:00Z' };
  const deleted = { ...one, events: [event] };
  const second = await f.call('POST', deleted, { 'x-studio-expected-revision': revision }); assert.equal(second.status, 200);
  const secondRevision = second.headers.get('x-studio-revision');
  assert.equal((await f.call('POST', one, { 'x-studio-expected-revision': secondRevision })).status, 422);
  const restored = { ...deleted, events: [event, { ...event, id: 'restore-fixture', kind: 'restore', at: '2026-10-07T02:00:00Z' }] };
  assert.equal((await f.call('POST', restored, { 'x-studio-expected-revision': secondRevision })).status, 200);
  assert.deepEqual(await (await f.call('GET')).json(), restored);
  assert.equal((await fetch(`${f.base}/__studio/directions/unknown`)).status, 404);
  assert.equal((await fetch(`${f.base}/__studio/directions.constructor`)).status, 404);
});

for (const transport of ['fetch', 'node']) test(`${transport} strict validator exceptions cannot crash or overwrite the journal`, async t => {
  const f = await fixture(t, transport);
  const saved = await f.call('POST', f.empty(), { 'x-studio-expected-revision': 'empty' });
  const bytes = readFileSync(f.file, 'utf8'); const revision = saved.headers.get('x-studio-revision');
  const validate = f.options.validate;
  f.options.validate = () => { throw new RangeError('fixture validation depth'); };
  assert.equal((await f.call('GET')).status, 500);
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': revision })).status, 422);
  f.options.validate = validate;
  f.options.validateTransition = () => { throw new RangeError('fixture transition depth'); };
  assert.equal((await f.call('POST', f.empty(), { 'x-studio-expected-revision': revision })).status, 422);
  assert.equal(readFileSync(f.file, 'utf8'), bytes);
  assert.deepEqual(readdirSync(f.root).filter(n => n.endsWith('.tmp')), []);
});
test('bootstrap returns explicit unavailable data for malformed/invalid/deep journal files without changing bytes', async t => {
  const f = await fixture(t, 'fetch', true);
  assert.equal(f.module.savedFileSnapshot(f.options), undefined);
  const deep = '{"schema":"studio-directions/1","events":[],"revisions":[],"deep":' + '['.repeat(12000) + '0' + ']'.repeat(12000) + '}';
  for (const bytes of ['torn {', '{"schema":"wrong"}', deep]) {
    writeFileSync(f.file, bytes);
    const snapshot = f.module.savedFileSnapshot(f.options);
    assert.equal(snapshot.schema, 'studio-saved-file-unavailable/1'); assert.match(snapshot.error, /directions.json/);
    assert.equal(readFileSync(f.file, 'utf8'), bytes);
    assert.equal((await f.call('GET')).status, 500);
  }
  writeFileSync(f.file, JSON.stringify(f.empty()));
  assert.deepEqual(f.module.savedFileSnapshot(f.options), f.empty());
});
