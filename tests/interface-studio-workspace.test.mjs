import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const skill = new URL('../metamodern-interface-studio/', import.meta.url);
const shell = new URL('./assets/studio-shell/', skill);
const read = (path) => readFileSync(new URL(path, shell), 'utf8');

/** Load a pure shell module (it may import types only) without a TypeScript toolchain. */
async function loadPure(path) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-workspace-'));
  const file = join(dir, `${basename(path).replace(/\.tsx?$/, '')}.mjs`);
  writeFileSync(file, stripTypeScriptTypes(read(path), { mode: 'strip', sourceMap: false }));
  return import(`${pathToFileURL(file).href}?${Date.now()}`);
}

const decl = {
  operations: './__studio/ops',
  modules: [
    { id: 'site', label: 'Site', icon: 'settings', sections: [{ id: 'general', label: 'General' }, { id: 'secrets', label: 'Secrets' }], uses: [{ name: 'site.read', kind: 'read' }, { name: 'site.write', kind: 'write' }] },
    { id: 'audit', label: 'Audit', icon: 'activity', uses: [{ name: 'audit.list', kind: 'read' }] },
    { id: 'billing', label: 'Billing', icon: 'table', uses: [], unavailable: 'Billing tools arrive with the billing host.' },
  ],
};

function transport(reply) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    return { status: reply.status, text: async () => (typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)) };
  };
  return { calls, fetch };
}
const LOCATION = 'http://127.0.0.1:4000/';
const USES = decl.modules[0].uses;

test('WM-01 modules resolve in declaration order with the first reason each cannot open', async () => {
  const { resolveModules, NO_OPERATIONS, noComponent } = await loadPure('src/studio/workspace/declaration.ts');
  assert.deepEqual(resolveModules(undefined, null), []);
  const before = resolveModules(decl, null);
  assert.deepEqual(before.map((m) => m.id), ['site', 'audit', 'billing']);
  assert.equal(before[0].unavailable, undefined, 'component availability is unknown until the module file loads');
  assert.equal(before[1].unavailable, undefined);
  assert.deepEqual(before[0].sections.map((s) => s.id), ['general', 'secrets']);
  assert.deepEqual(before[1].sections, []);
  const loaded = resolveModules(decl, ['site']);
  assert.equal(loaded[0].unavailable, undefined);
  assert.equal(loaded[1].unavailable, noComponent('audit'));
  assert.match(loaded[1].unavailable, /No component for the "audit" module in src\/workspace\/index\.ts/);
  assert.equal(loaded[2].unavailable, 'Billing tools arrive with the billing host.', 'a declared reason wins');
  const hostless = resolveModules({ ...decl, operations: undefined }, ['site', 'audit']);
  assert.equal(hostless[0].unavailable, NO_OPERATIONS);
  assert.equal(hostless[1].unavailable, NO_OPERATIONS);
  assert.equal(hostless[2].unavailable, 'Billing tools arrive with the billing host.');
});

test('WM-02 a module file and the adapter must agree, and the declaration must be well formed', async () => {
  const { undeclaredDefinitions, workspaceProblems } = await loadPure('src/studio/workspace/declaration.ts');
  assert.deepEqual(undeclaredDefinitions(decl, ['site', 'audit']), []);
  assert.deepEqual(undeclaredDefinitions(decl, ['site', 'orphan']), ['orphan']);
  assert.deepEqual(undeclaredDefinitions(undefined, ['site']), ['site']);
  assert.deepEqual(workspaceProblems(undefined), []);
  assert.deepEqual(workspaceProblems(decl), []);
  const bad = workspaceProblems({
    modules: [
      { id: 'Site', label: 'Site', icon: 'settings', uses: [] },
      { id: 'audit', label: 'Audit', icon: 'activity', sections: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A again' }], uses: [{ name: 'Audit List', kind: 'read' }, { name: 'audit.list', kind: 'read' }, { name: 'audit.list', kind: 'write' }] },
      { id: 'audit', label: 'Twice', icon: 'activity', uses: [] },
    ],
  });
  assert.ok(bad.some((p) => /Module ID "Site"/.test(p)));
  assert.ok(bad.some((p) => /Section ID "audit\/a" is declared twice/.test(p)));
  assert.ok(bad.some((p) => /Operation "Audit List"/.test(p)));
  assert.ok(bad.some((p) => /Operation "audit.list" is listed twice in "audit"/.test(p)));
  assert.ok(bad.some((p) => /Module ID "audit" is declared twice/.test(p)));
});

test('WM-03 links name a module and a section; a missing section falls back, an unknown module is reported', async () => {
  const { parseModuleLink } = await loadPure('src/studio/workspace/link.ts');
  assert.deepEqual(parseModuleLink('#view=inspect', decl), { module: null, section: null });
  assert.deepEqual(parseModuleLink('#module=site&section=secrets', decl), { module: 'site', section: 'secrets' });
  assert.deepEqual(parseModuleLink('#module=site&section=nope', decl), { module: 'site', section: 'general' });
  assert.deepEqual(parseModuleLink('#module=audit', decl), { module: 'audit', section: null });
  assert.deepEqual(parseModuleLink('#module=ghost', decl), { module: null, section: null, unknown: 'ghost' });
  assert.deepEqual(parseModuleLink('#module=site', undefined), { module: null, section: null, unknown: 'site' });
});

test('WM-04 undeclared names, kind mismatches, cross-origin and missing hosts are refused without a request', async () => {
  const { createOperationClient, REFUSED } = await loadPure('src/studio/workspace/operations.ts');
  const t = transport({ status: 200, body: { ok: true, data: null } });
  const client = (base) => createOperationClient({ base, uses: USES, location: LOCATION, fetch: t.fetch });
  const refused = [
    await client('./__studio/ops')('audit.list', 'read'),
    await client('./__studio/ops')('site.write', 'read'),
    await client('./__studio/ops')('site.read', 'write'),
    await client('https://elsewhere.example/ops')('site.read', 'read'),
    await client('//elsewhere.example/ops')('site.read', 'read'),
    await client('javascript:alert(1)')('site.read', 'read'),
    await client(undefined)('site.read', 'read'),
  ];
  assert.deepEqual(refused.map((r) => r.error.code), [REFUSED.undeclared, REFUSED.kind, REFUSED.kind, REFUSED.origin, REFUSED.origin, REFUSED.origin, REFUSED.noHost]);
  assert.ok(refused.every((r) => r.ok === false && r.error.recoverable === false && /not sent|nothing was sent/.test(r.error.reason)));
  assert.equal(t.calls.length, 0, 'no refusal sends a request');
  // Only http(s) addresses on this origin are callable, and a base may not carry a query or fragment.
  const notCallable = [
    await client('data:text/plain,ops')('site.read', 'read'),
    await client('file:///ops')('site.read', 'read'),
    await createOperationClient({ base: './__studio/ops', uses: USES, location: 'file:///studio/index.html', fetch: t.fetch })('site.read', 'read'),
    await client('./__studio/ops?x=1')('site.read', 'read'),
    await client('./__studio/ops#x')('site.read', 'read'),
  ];
  assert.deepEqual(notCallable.map((r) => r.error.code), Array(5).fill(REFUSED.origin));
  // A declared name the declaration rules reject is refused at runtime too, so it cannot climb the path.
  const odd = createOperationClient({ base: './__studio/ops', uses: [{ name: '..', kind: 'read' }, { name: 'Site Read', kind: 'read' }], location: LOCATION, fetch: t.fetch });
  assert.equal((await odd('..', 'read')).error.code, REFUSED.undeclared);
  assert.equal((await odd('Site Read', 'read')).error.code, REFUSED.undeclared);
  // Input that is not JSON is refused before a request, never reported as a missing host.
  const circular = {};
  circular.self = circular;
  const bad = [
    await client('./__studio/ops')('site.write', 'write', circular),
    await client('./__studio/ops')('site.write', 'write', { n: 1n }),
  ];
  assert.deepEqual(bad.map((r) => r.error), Array(2).fill({ code: REFUSED.input, reason: 'site.write input is not JSON, so it was not sent.', recoverable: false }));
  assert.equal(REFUSED.input, 'bad-input');
  assert.equal(t.calls.length, 0, 'still no request');
});

test('WM-04b the runtime operation-name pattern matches the declaration rule', () => {
  const ops = /const OPERATION_NAME = (\/.+\/)\n/.exec(read('src/studio/workspace/operations.ts'));
  const decl = /export const OPERATION = (\/.+\/)\n/.exec(read('src/studio/workspace/declaration.ts'));
  assert.ok(ops && decl);
  assert.equal(ops[1], decl[1]);
});

test('WM-05 a declared operation is one same-origin JSON POST to {operations}/{name}', async () => {
  const { createOperationClient } = await loadPure('src/studio/workspace/operations.ts');
  const t = transport({ status: 200, body: { ok: true, data: { n: 1 }, revision: '7' } });
  const call = createOperationClient({ base: './__studio/ops/', uses: USES, location: LOCATION, fetch: t.fetch });
  assert.deepEqual(await call('site.read', 'read'), { ok: true, data: { n: 1 }, revision: '7' });
  await call('site.write', 'write', { siteName: 'A' }, { expectedRevision: '7' });
  await call('site.write', 'write', { siteName: 'B' });
  assert.equal(t.calls[0].url, 'http://127.0.0.1:4000/__studio/ops/site.read');
  assert.deepEqual(t.calls[0].init, { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-operation-kind': 'read' }, credentials: 'same-origin', body: '{"input":null}' });
  assert.equal(t.calls[1].init.headers['x-studio-operation-kind'], 'write');
  assert.deepEqual(JSON.parse(t.calls[1].init.body), { input: { siteName: 'A' }, expectedRevision: '7' });
  assert.deepEqual(JSON.parse(t.calls[2].init.body), { input: { siteName: 'B' } });
});

test('WM-06 results use one envelope; anything else is a host problem, never data', async () => {
  const { createOperationClient, parseEnvelope, HOST_UNAVAILABLE, BAD_ENVELOPE } = await loadPure('src/studio/workspace/operations.ts');
  assert.deepEqual(parseEnvelope('{"ok":true,"data":[1]}'), { ok: true, data: [1] });
  assert.deepEqual(parseEnvelope('{"ok":false,"error":{"code":"invalid","reason":"Too long","recoverable":false}}'), { ok: false, error: { code: 'invalid', reason: 'Too long', recoverable: false } });
  assert.deepEqual(parseEnvelope('{"ok":false,"error":{"code":"conflict","reason":"Changed","recoverable":true},"current":{"data":{"a":2},"revision":"9"}}'), { ok: false, error: { code: 'conflict', reason: 'Changed', recoverable: true }, current: { data: { a: 2 }, revision: '9' } });
  assert.equal(parseEnvelope('<!doctype html><title>Studio</title>'), null);
  assert.equal(parseEnvelope('{"rows":[]}').error.code, BAD_ENVELOPE);
  assert.equal(parseEnvelope('[]').error.code, BAD_ENVELOPE);
  const html = createOperationClient({ base: './__studio/ops', uses: USES, location: LOCATION, fetch: transport({ status: 200, body: '<!doctype html>' }).fetch });
  const down = await html('site.read', 'read');
  assert.equal(down.error.code, HOST_UNAVAILABLE);
  assert.equal(down.error.recoverable, true);
  assert.match(down.error.reason, /^No operations host answered at \.\/__studio\/ops\./);
  const offline = createOperationClient({ base: './__studio/ops', uses: USES, location: LOCATION, fetch: transport(new TypeError('fetch failed')).fetch });
  assert.equal((await offline('site.read', 'read')).error.code, HOST_UNAVAILABLE);
});

test('WM-07 stores notify their subscribers and the guard registry asks until released', async () => {
  const { createStore, createGuardRegistry } = await loadPure('src/studio/workspace/stores.ts');
  const store = createStore({ down: null });
  let seen = 0;
  const off = store.subscribe(() => seen++);
  store.set({ down: 'No host' });
  assert.deepEqual(store.get(), { down: 'No host' });
  off();
  store.set({ down: null });
  assert.equal(seen, 1);
  const guards = createGuardRegistry();
  let changes = 0;
  guards.subscribe(() => changes++);
  assert.equal(guards.active(), null);
  const removeA = guards.add('A is unsaved');
  const removeB = guards.add('B is unsaved');
  assert.equal(guards.active(), 'A is unsaved');
  removeA();
  assert.equal(guards.active(), 'B is unsaved');
  guards.release();
  assert.equal(guards.active(), null, 'leaving releases every current guard');
  removeB();
  removeB();
  const removeC = guards.add('C is unsaved');
  assert.equal(guards.active(), 'C is unsaved', 'a component that becomes dirty again asks again');
  removeC();
  assert.equal(changes, 7, 'add, add, remove, release, remove, add, remove; a repeated removal is silent');
});

test('WM-08 the workspace model files stay pure', () => {
  for (const path of ['src/studio/workspace/declaration.ts', 'src/studio/workspace/link.ts', 'src/studio/workspace/operations.ts', 'src/studio/workspace/stores.ts']) {
    assert.doesNotMatch(read(path), /^import (?!type )/m, `${path} may import types only`);
  }
  const types = read('src/studio/types.ts');
  assert.match(types, /workspace\?: WorkspaceDeclaration/);
  assert.match(types, /operations\?: string/);
});

test('WM-09 tables filter on every column, sort stably both ways and toggle direction', async () => {
  const { filterRows, sortRows, nextSort } = await loadPure('src/kit/table-model.ts');
  const columns = [{ id: 'name', value: (r) => r.name }, { id: 'size', value: (r) => r.size }];
  const rows = [{ name: 'beta', size: 10 }, { name: 'Alpha', size: 2 }, { name: 'gamma', size: 2 }, { name: 'item 10', size: 1 }, { name: 'item 9', size: 1 }];
  assert.deepEqual(filterRows(rows, columns, '  ').map((r) => r.name), rows.map((r) => r.name));
  assert.deepEqual(filterRows(rows, columns, 'ALP').map((r) => r.name), ['Alpha']);
  assert.deepEqual(filterRows(rows, columns, '10').map((r) => r.name), ['beta', 'item 10']);
  assert.deepEqual(sortRows(rows, columns, null), rows);
  assert.deepEqual(sortRows(rows, columns, { column: 'name', direction: 'asc' }).map((r) => r.name), ['Alpha', 'beta', 'gamma', 'item 9', 'item 10']);
  assert.deepEqual(sortRows(rows, columns, { column: 'size', direction: 'desc' }).map((r) => r.name), ['beta', 'Alpha', 'gamma', 'item 10', 'item 9']);
  assert.deepEqual(sortRows(rows, columns, { column: 'missing', direction: 'asc' }), rows);
  assert.deepEqual(nextSort(null, 'name'), { column: 'name', direction: 'asc' });
  assert.deepEqual(nextSort({ column: 'name', direction: 'asc' }, 'name'), { column: 'name', direction: 'desc' });
  assert.deepEqual(nextSort({ column: 'name', direction: 'desc' }, 'size'), { column: 'size', direction: 'asc' });
});

test('WM-10 the kit is one versioned barrel with the floors built in', () => {
  const index = read('src/kit/index.ts');
  assert.match(index, /export const KIT_VERSION = "studio-kit\/1"/);
  for (const name of ['ModulePage', 'Section', 'Toolbar', 'Button', 'Field', 'PropertyList', 'DataTable', 'StatusTile', 'StatusBadge', 'SaveBar', 'ConfirmDialog', 'EmptyState', 'PreviewFrame', 'Icon', 'tokens']) {
    assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is not exported from @studio/kit`);
  }
  assert.doesNotMatch(read('src/kit/table-model.ts'), /^import (?!type )/m, 'the table model stays pure');
  assert.match(read('src/kit/layout.tsx'), /pointer-coarse:min-h-11 pointer-coarse:min-w-11/);
  assert.match(read('src/kit/layout.tsx'), /pointer-coarse:text-base!/);
  assert.match(read('src/kit/data.tsx'), /<VirtualList/);
  assert.match(read('src/kit/preview-frame.tsx'), /sandbox=""/);
  const frame = read('src/kit/preview-frame.tsx');
  // Values reach a live frame through its inputs; only scenario, theme, profile and Retry mount a new runtime.
  assert.match(frame, /mountKey=\{JSON\.stringify\(\[live\.scenario, live\.theme, live\.profile, retry\]\)\}/);
  assert.doesNotMatch(frame, /mountKey=\{[^}]*values/);
  // The frame's status drives the boundary as in every preview: loading, appearance, and a failure with Retry.
  assert.match(frame, /onStatus=\{setStatus\}/);
  assert.match(frame, /loading=\{!!live && \(!status \|\| status\.status === "loading"\)\}/);
  assert.match(frame, /appearance=\{status\?\.appearance \?\? props\.appearance\}/);
  assert.match(frame, /empty=\{failed\}/);
  // Retry clears the failure so the frame mounts again, and bumps the key so it is a fresh runtime.
  assert.match(frame, /const retryFrame = \(\) => \{\s*setStatus\(null\)\s*setRetry\(\(n\) => n \+ 1\)/);
  assert.match(frame, /label: "Retry", onClick: retryFrame/);
  const css = read('src/studio.css');
  assert.match(css, /\[data-kit\] :focus-visible \{ outline: 2px solid var\(--ring\)/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /\[data-kit\], \[data-kit\] \* \{ animation: none !important; transition: none !important; \}/);
});
