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
  // Another frame (src, scenario, theme or profile) starts afresh: a failure does not outlive the frame that reported it.
  assert.match(frame, /const frame = live \? JSON\.stringify\(\[live\.src, live\.scenario, live\.theme, live\.profile\]\) : ""/);
  assert.match(frame, /if \(shown !== frame\) \{\s*setShown\(frame\)\s*setStatus\(null\)/);
  const css = read('src/studio.css');
  assert.match(css, /\[data-kit\] :focus-visible \{ outline: 2px solid var\(--ring\)/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /\[data-kit\], \[data-kit\] \* \{ animation: none !important; transition: none !important; \}/);
});

test('WM-11 workspace files import only the kit, the workspace API, React and their own files', async () => {
  const { workspaceImportProblem, createWorkspaceBoundary, workspaceBoundary } = await import(new URL('scripts/workspace-boundary.mjs', shell).href);
  const cwd = '/studio';
  const file = '/studio/src/workspace/env/page.tsx';
  for (const ok of ['react', 'react/jsx-runtime', '@studio/kit', '@studio/workspace', './fields', '../index', '../shared/table', '@/workspace/env/fields', '@/workspace']) {
    assert.equal(workspaceImportProblem(file, ok, cwd), null, ok);
  }
  for (const bad of ['@/components/ui/button', '@/store', '../../studio/types', '../../components/ui/button', 'lucide-react', 'react-dom', '@studio/kit/field', 'node:fs', '@/workspace/../store', '@/workspace/../components/ui/button', '@/workspace/env/../../lib/utils']) {
    assert.match(workspaceImportProblem(file, bad, cwd), /is outside the workspace boundary/, bad);
  }
  assert.match(workspaceImportProblem(file, '@/store', cwd), /under src\/workspace\//);
  const example = '/studio/example/workspace/site.tsx';
  assert.equal(workspaceImportProblem(example, './mock-host.mjs', cwd), null);
  assert.match(workspaceImportProblem(example, '@/workspace', cwd), /under example\/workspace\//);
  assert.match(workspaceImportProblem(example, '../main', cwd), /outside the workspace boundary/);

  // The lint rule checks every import form, and reports a dynamic import whose target it cannot read.
  const lint = (node) => {
    const reports = [];
    const visitors = createWorkspaceBoundary(cwd).rules.imports.create({ filename: file, cwd: '/elsewhere', report: (r) => reports.push(r.message) });
    visitors[node.type](node);
    return reports;
  };
  const literal = (value) => ({ type: 'Literal', value });
  assert.deepEqual(lint({ type: 'ImportDeclaration', source: literal('@studio/kit') }), []);
  assert.match(lint({ type: 'ImportDeclaration', source: literal('@/store') })[0], /@\/store is outside the workspace boundary/);
  assert.match(lint({ type: 'ExportAllDeclaration', source: literal('@/store') })[0], /outside the workspace boundary/);
  assert.match(lint({ type: 'ExportNamedDeclaration', source: literal('@/workspace/../store') })[0], /outside the workspace boundary/);
  assert.deepEqual(lint({ type: 'ExportNamedDeclaration', source: null }), []);
  assert.match(lint({ type: 'ImportExpression', source: literal('../../store') })[0], /outside the workspace boundary/);
  assert.deepEqual(lint({ type: 'ImportExpression', source: { type: 'TemplateLiteral', expressions: [], quasis: [{ value: { cooked: './fields' } }] } }), []);
  assert.match(lint({ type: 'ImportExpression', source: { type: 'TemplateLiteral', expressions: [{ type: 'Identifier', name: 'x' }], quasis: [{ value: { cooked: '../' } }, { value: { cooked: '' } }] } })[0], /import\(\) whose target is not a string literal/);
  assert.match(lint({ type: 'ImportExpression', source: { type: 'Identifier', name: 'target' } })[0], /import\(\) whose target is not a string literal/);

  // import.meta.glob patterns, alone or in a list, negated or under a base, stay inside the boundary.
  const globCall = (...args) => ({ type: 'CallExpression', callee: { type: 'MemberExpression', computed: false, object: { type: 'MetaProperty', meta: { name: 'import' }, property: { name: 'meta' } }, property: { type: 'Identifier', name: 'glob' } }, arguments: args });
  const list = (...values) => ({ type: 'ArrayExpression', elements: values.map(literal) });
  assert.deepEqual(lint(globCall(literal('./**/*.tsx'))), []);
  assert.deepEqual(lint(globCall(list('./**/*.tsx', '!./**/*.test.tsx'))), []);
  assert.deepEqual(lint(globCall(literal('/src/workspace/**/*.ts'))), []);
  assert.match(lint(globCall(literal('../../studio/*.ts')))[0], /\.\.\/\.\.\/studio\/\*\.ts is outside the workspace boundary/);
  assert.match(lint(globCall(list('./*.tsx', '!../../store.tsx')))[0], /\.\.\/\.\.\/store\.tsx is outside the workspace boundary/);
  assert.match(lint(globCall(literal('/src/store.tsx')))[0], /outside the workspace boundary/);
  assert.match(lint(globCall(literal('./*.ts'), { type: 'ObjectExpression', properties: [{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'base' }, value: literal('../../studio') }] }))[0], /outside the workspace boundary/);
  assert.match(lint(globCall({ type: 'Identifier', name: 'pattern' }))[0], /not a string literal/);
  assert.deepEqual(lint({ type: 'CallExpression', callee: { type: 'Identifier', name: 'glob' }, arguments: [literal('../../store')] }), []);

  // Type-only imports: type T = import("...").T, in either typescript-eslint shape.
  assert.match(lint({ type: 'TSImportType', argument: { type: 'TSLiteralType', literal: literal('../../studio/types') } })[0], /outside the workspace boundary/);
  assert.match(lint({ type: 'TSImportType', source: literal('@/store') })[0], /outside the workspace boundary/);
  assert.deepEqual(lint({ type: 'TSImportType', argument: { type: 'TSLiteralType', literal: literal('./fields') } }), []);

  // The shared plugin checks against the Studio that holds it, not the directory ESLint runs in.
  const studioRoot = fileURLToPath(shell);
  const reports = [];
  workspaceBoundary.rules.imports.create({ filename: join(studioRoot, 'src/workspace/page.tsx'), cwd: '/', report: (r) => reports.push(r.message) }).ImportDeclaration({ type: 'ImportDeclaration', source: literal('./fields') });
  assert.deepEqual(reports, []);
});

test('WM-13 the build reads the module IDs a workspace file defines, or says why it cannot', async () => {
  const { definedModules } = await loadPure('src/studio/workspace/declaration.ts');
  const key = (name) => ({ type: 'Property', computed: false, key: { type: 'Identifier', name }, value: { type: 'ObjectExpression', properties: [] } });
  const define = (arg) => ({ type: 'CallExpression', callee: { type: 'Identifier', name: 'defineWorkspace' }, arguments: arg ? [arg] : [] });
  const object = (...properties) => ({ type: 'ObjectExpression', properties });
  const program = (...calls) => ({ type: 'Program', body: calls.map((expression) => ({ type: 'ExportDefaultDeclaration', declaration: expression })) });
  const cases = [
    ['empty seed', program(define(object())), []],
    ['plain keys', program(define(object(key('site'), key('audit')))), ['site', 'audit']],
    ['string-literal keys', program(define(object({ type: 'Property', computed: false, key: { type: 'Literal', value: 'site-tools' } }))), ['site-tools']],
    ['spread', program(define(object({ type: 'SpreadElement', argument: { type: 'Identifier', name: 'more' } }))), /without spreads or computed keys/],
    ['computed key', program(define(object({ type: 'Property', computed: true, key: { type: 'Identifier', name: 'id' } }))), /without spreads or computed keys/],
    ['numeric key', program(define(object({ type: 'Property', computed: false, key: { type: 'Literal', value: 1 } }))), /without spreads or computed keys/],
    ['non-object argument', program(define({ type: 'Identifier', name: 'modules' })), /takes an object literal/],
    ['no argument', program(define(null)), /takes an object literal/],
    ['no call', { type: 'Program', body: [] }, /does not call defineWorkspace/],
    ['two calls', program(define(object(key('site'))), define(object(key('audit')))), /called more than once/],
  ];
  for (const [name, ast, expected] of cases) {
    const got = definedModules(ast);
    if (Array.isArray(expected)) assert.deepEqual(got, expected, name);
    else assert.match(got, expected, name);
  }
});

test('WM-12 the product seed is empty and the workspace API is the published surface', () => {
  assert.equal(read('src/workspace/index.ts').match(/^(?!\s*\*|\/\*).+$/gm).join('\n'), 'import { defineWorkspace } from "@studio/workspace"\nexport default defineWorkspace({})');
  const api = read('src/studio/workspace/api.ts');
  for (const name of ['defineWorkspace', 'useModule', 'useOperation', 'useDirtyGuard', 'useModuleState']) assert.match(api, new RegExp(`export function ${name}\\b`));
  const eslint = read('eslint.config.js');
  assert.match(eslint, /'studio\/imports': 'error'/);
  assert.match(eslint, /'src\/workspace\/\*\*\/\*\.\{ts,tsx,js,jsx,mjs\}'/);
  const vite = read('vite.config.ts');
  assert.match(vite, /@studio\\\/workspace/);
  assert.match(vite, /which the adapter does not declare in workspace\.modules/);
});

test('WM-13b the example host reads, writes with compare-and-set, and refuses what the contract refuses', async (t) => {
  const { createMockHost } = await import(new URL('example/workspace/mock-host.mjs', shell).href);
  const handle = createMockHost();
  const server = createServer((req, res) => handle(req, res, decodeURIComponent(new URL(req.url, 'http://x').pathname.slice('/__studio/ops/'.length))));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (name, body, headers = {}) => {
    const res = await fetch(`${base}/__studio/ops/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-studio-operation-kind': name.endsWith('.write') ? 'write' : 'read', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const first = await call('site.read', { input: null });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.data.settings.siteName, 'Example Tasks');
  assert.ok(Array.isArray(first.body.data.history));
  const wrote = await call('site.write', { input: { siteName: 'Renamed' }, expectedRevision: first.body.revision });
  assert.equal(wrote.body.ok, true);
  assert.notEqual(wrote.body.revision, first.body.revision);
  const stale = await call('site.write', { input: { siteName: 'Late' }, expectedRevision: first.body.revision });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body.error.code, 'conflict');
  assert.equal(stale.body.error.recoverable, true);
  assert.equal(stale.body.current.data.settings.siteName, 'Renamed');
  assert.equal(stale.body.current.revision, wrote.body.revision);
  assert.equal((await call('site.read', { input: null })).body.data.settings.siteName, 'Renamed', 'a conflict changes nothing');
  assert.equal((await call('site.write', { input: { siteName: '' } })).body.error.code, 'invalid');
  assert.equal((await call('site.write', { input: { colour: 'red' } })).status, 422);
  assert.equal((await call('site.write', { input: { region: 'us' } }, { 'x-studio-operation-kind': 'read' })).status, 400);
  assert.equal((await call('site.read', { input: null }, { origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await call('nothing.here', { input: null })).body.error.code, 'unknown-operation');
});

test('WM-13c the dev server middleware applies the endpoint guard, keeps empty writes and caps history', async (t) => {
  const { createMockMiddleware, operationName } = await import(new URL('example/workspace/mock-host.mjs', shell).href);
  const middleware = createMockMiddleware();
  // Mounted as vite.config.ts mounts it: the connect mount strips /__studio/ops from req.url.
  const server = createServer((req, res) => {
    req.url = req.url.slice('/__studio/ops'.length) || '/';
    middleware(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (name, body, headers = {}) => {
    const res = await fetch(`${base}/__studio/ops/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-studio-operation-kind': name.endsWith('.write') ? 'write' : 'read', ...headers }, body });
    return { status: res.status, body: await res.json() };
  };
  const get = await fetch(`${base}/__studio/ops/site.read`);
  assert.equal(get.status, 405);
  assert.equal((await get.json()).error.code, 'method');
  const text = await post('site.read', '{}', { 'content-type': 'text/plain' });
  assert.equal(text.status, 415);
  assert.equal(text.body.error.code, 'content-type');
  const big = await post('site.read', JSON.stringify({ input: 'a'.repeat(70 * 1024) }));
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, 'too-large');
  const nothing = await post('site.read', 'null');
  assert.equal(nothing.status, 400);
  assert.equal(nothing.body.ok, false);
  const malformed = await post('%E0%A4%A', '{}');
  assert.equal(malformed.status, 404);
  assert.equal(malformed.body.error.code, 'unknown-operation');
  assert.equal(operationName('/site.read?x=1'), 'site.read');
  assert.equal((await post('site.read', '{}')).body.ok, true, 'the mounted name reaches the host');
  const before = (await post('site.read', '{}')).body;
  const empty = await post('site.write', JSON.stringify({ input: {}, expectedRevision: before.revision }));
  assert.equal(empty.body.ok, true);
  assert.equal(empty.body.revision, before.revision, 'an empty write changes nothing');
  for (let i = 0; i < 30; i++) assert.equal((await post('site.write', JSON.stringify({ input: { siteName: `Name ${i}`, region: i % 2 ? 'us' : 'eu' } }))).body.ok, true);
  assert.equal((await post('site.read', '{}')).body.data.history.length, 50);
});

test('WM-14 the core shell reaches the workspace only through lazy slots', () => {
  const slots = read('src/studio/workspace/slots.tsx');
  assert.match(slots, /import\("\.\/workspace-nav"\)/);
  assert.match(slots, /import\("\.\/workspace-page"\)/);
  // A build whose adapter declares no workspace drops both imports, so it has exactly the chunks it had before workspaces.
  assert.match(slots, /!__STUDIO_WORKSPACE__ \? never\(\) : import\("\.\/workspace-nav"\)/);
  assert.match(slots, /!__STUDIO_WORKSPACE__ \? never\(\) : import\("\.\/workspace-page"\)/);
  assert.match(slots, /hasWorkspace = __STUDIO_WORKSPACE__ && !!adapter\.workspace/);
  assert.match(read('vite.config.ts'), /__STUDIO_WORKSPACE__: JSON\.stringify\(!loaded \|\| "error" in loaded \|\| !!loaded\.adapter\.workspace\)/);
  for (const file of ['src/App.tsx', 'src/store.tsx', 'src/components/studio/rail-panel.tsx', 'src/components/studio/chrome.tsx', 'src/components/studio/command.tsx']) {
    const text = read(file);
    assert.doesNotMatch(text, /from "@\/studio\/workspace\/(workspace-nav|workspace-page|api|declaration|operations|stores)"/, `${file} imports workspace code eagerly`);
    assert.doesNotMatch(text, /from "@\/kit/, `${file} imports the kit eagerly`);
  }
  assert.match(read('src/store.tsx'), /from "@\/studio\/workspace\/link"/);
  assert.match(read('src/store.tsx'), /export const leaveGuard/);
  assert.match(read('src/studio/workspace/workspace-page.tsx'), /from "@\/workspace"/);
});

test('WM-15 the workspace reference documents the contract and SKILL.md routes to it only for workspace tools', () => {
  const doc = readFileSync(new URL('references/workspace.md', skill), 'utf8');
  for (const term of ['studio-kit/1', '@studio/workspace', 'defineWorkspace', 'expectedRevision', 'x-studio-operation-kind', '"current"', 'undeclared', 'kind-mismatch', 'cross-origin', 'No operations host answered', '--accept-kit', 'WS-01', 'import.meta.glob', 'useModuleState']) assert.ok(doc.includes(term), `workspace.md lacks ${term}`);
  assert.doesNotMatch(doc, /[\u2013\u2014]/);
  const skillDoc = readFileSync(new URL('SKILL.md', skill), 'utf8');
  assert.equal(skillDoc.match(/references\/workspace\.md/g)?.length, 1);
  assert.match(skillDoc, /workspace tools/);
  assert.match(read('UPDATING.md'), /^## 0\.12\.0$/m);
  assert.match(readFileSync(new URL('references/updating.md', skill), 'utf8'), /--accept-kit/);
  assert.match(readFileSync(new URL('references/frame-protocol.md', skill), 'utf8'), /## Product output in workspace modules/);
  const shellDoc = readFileSync(new URL('references/shell.md', skill), 'utf8');
  assert.match(shellDoc, /WS-01 to WS-09/);
  for (const id of ['WS-01', 'WS-02', 'WS-03', 'WS-04', 'WS-05', 'WS-05b', 'WS-06', 'WS-06b', 'WS-07', 'WS-08', 'WS-09', 'AC-61', 'AC-62', 'AC-63', 'AC-64']) assert.match(shellDoc, new RegExp(`^\\| ${id} \\|`, 'm'), `shell.md has no ${id} row`);
  assert.match(shellDoc, /x-studio-expected-revision/);
  assert.match(read('README.md'), /src\/workspace\//);
});

test('WM-17 a missing host stops a module only on a read before the host answered it, never under unsaved changes', () => {
  const api = read('src/studio/workspace/api.ts');
  // Only a read, before the host has answered the module and with nothing unsaved, makes it unavailable; a write never does.
  assert.match(api, /if \(kind === "read" && !answered\.get\(\)\[moduleId\] && !guards\.active\(\)\) hostStatus\.set\(\{ down: result\.error\.reason \}\)/);
  assert.equal((api.match(/hostStatus\.set\(/g) ?? []).length, 1, 'no other path marks the host down');
  assert.match(api, /result\.ok \|\| !SHELL_CODES\.has\(result\.error\.code\)/, 'only an answer from the host starts a module');
  const page = read('src/studio/workspace/workspace-page.tsx');
  // The page is never swapped out while it has unsaved changes.
  assert.match(page, /const unsaved = React\.useSyncExternalStore\(guards\.subscribe, guards\.active\)/);
  assert.match(page, /const down = m && !started\[m\.id\] && !unsaved \? host\.down : null/);
});
