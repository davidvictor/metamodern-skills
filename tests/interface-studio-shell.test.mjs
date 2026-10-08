import { studioSource } from './studio-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = studioSource;
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
  for (const required of ['README.md', 'package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'src/adapter.ts', 'src/studio/types.ts', 'src/studio/protocol.ts', 'src/studio/frame-client.ts', 'src/studio/live-preview.tsx', 'example/index.html', 'example/main.ts', 'src/studio/virtual-list.tsx', 'src/adapters/synthetic.ts', 'scripts/acceptance.mjs', 'studio.config.ts', 'src/studio/config.ts', 'UPDATING.md', 'src/studio/layouts.ts', 'src/studio/frame-sync.ts', 'src/studio/design.ts', 'src/studio/properties.ts', 'src/studio/scenarios.ts', 'src/components/studio/properties.tsx']) {
    assert.ok(rel.includes(required), `${required} is missing`);
  }
});

test('the whole package names no client', () => {
  const pkg = fileURLToPath(new URL('../metamodern-interface-studio/', import.meta.url));
  const forbidden = /(autostak|caelo)/i;
  for (const file of files(pkg).filter((f) => !f.includes('node_modules') && !f.includes('/dist/') && /\.(md|mjs|ts|tsx|json|css|html)$/.test(f) && !f.endsWith('package-lock.json'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, `${relative(pkg, file)} names a client`);
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

test('frame sync stays framework free and never reports private fields', () => {
  const sync = read('src/studio/frame-sync.ts');
  assert.doesNotMatch(sync, /from "(react|@\/)/, 'frame sync must stay framework free');
  assert.match(sync, /el\.type === "password" \|\| el\.type === "file"/);
  assert.match(sync, /closest\("\[data-studio-private\]"\)/);
  assert.match(sync, /e\.isTrusted/);
  const layouts = read('src/studio/layouts.ts');
  assert.doesNotMatch(layouts, /from "(react|@\/)/, 'the layout model is shared with the dev server and stays pure');
  assert.match(read('vite.config.ts'), /Only this Studio can save its layouts/);
});

test('modified is a state set by real changes, not a click count', () => {
  const client = read('src/studio/frame-client.ts');
  assert.match(client, /MutationObserver/);
  assert.match(client, /e\.isTrusted/);
  assert.doesNotMatch(read('src/components/studio/chrome.tsx'), /Modified · \{/);
});

test('acceptance script covers every shell criterion', () => {
  const script = read('scripts/acceptance.mjs');
  for (let i = 1; i <= 60; i++) assert.match(script, new RegExp(`"AC-${String(i).padStart(2, '0')}"`), `AC-${i} is not checked`);
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
  // Named "Frame width" in Inspect, and after its frame in the Responsive view.
  assert.match(handles, /aria-label=\{`\$\{s\.label \?\? "Frame"\} width`\}/);
  assert.match(handles, /aria-label=\{`\$\{s\.label \?\? "Frame"\} height`\}/);
  assert.match(read('src/studio/types.ts'), /export type Resizable/);
  assert.match(read('src/components/studio/chrome.tsx'), /function SizeMenu/);
  assert.match(read('src/adapters/example.ts'), /resizable:/);
});

test('property values and code cross the frame boundary only as announced capabilities', () => {
  const client = read('src/studio/frame-client.ts');
  assert.match(client, /handlers\.update \? \(\["live-values"\] as const\)/);
  assert.match(client, /handlers\.code \? \(\["code"\] as const\)/);
  // A Studio change never marks the runtime modified: the values branch disarms before it updates.
  assert.match(client, /m\.type === "values"\) \{[\s\S]{0,600}?armedAt = 0[\s\S]{0,200}?await update\(current\)/, 'a Studio change never marks the runtime modified');
  const host = read('src/studio/live-preview.tsx');
  assert.match(host, /includes\("live-values"\)/);
  assert.match(host, /type: "code-request"/);
  // Pending value requests are forgotten on the reply as well as on an error, so the set never grows with each edit.
  assert.match(host, /m\.type === "reply"\) \{[\s\S]{0,200}?valueRequests\.current\.delete\(m\.requestId\)/, 'a reply clears its value request');
  assert.match(host, /if \(valueRequests\.current\.delete\(m\.requestId\) && rt === onScreen\) setRemount/, 'an error clears its value request and remounts only the runtime on screen');
  // A failed staged runtime does not freeze later edits: new values stage another runtime, the same values never loop.
  assert.match(host, /if \(newest\?\.phase === "error" && newest\.key === runtimeKey\) \{\s*if \(JSON\.stringify\(newest\.inputs\.values\) !== valuesKey\) setRemount\(\(n\) => n \+ 1\)\s*return\s*\}/, 'a failed runtime lets the next edit remount');
  assert.match(host, /language: String\(m\.language\), text: String\(m\.text\)/, 'code answers are coerced to strings');
});

test('every key the Studio writes to or reads from its links is reserved against property IDs', () => {
  const store = read('src/store.tsx');
  const keys = new Set([...store.matchAll(/\bq\.(?:get|set)\("([^"]+)"/g)].map((m) => m[1]));
  // The link's first keys are set by the URLSearchParams constructor.
  const ctor = /new URLSearchParams\(\{([^}]*)\}\)/.exec(store);
  assert.ok(ctor, 'the link writer starts from a URLSearchParams object');
  for (const m of ctor[1].matchAll(/(\w+):/g)) keys.add(m[1]);
  assert.ok(keys.has('edited') && keys.has('view') && keys.has('size'), `found ${[...keys].join(', ')}`);
  // An open workspace module's link is written by the store through moduleHash in the workspace link module, scanned below.
  assert.match(store, /moduleHash\(\{ module: state\.module, section: state\.section, item: state\.item \}\)/);
  assert.doesNotMatch(store, /new URLSearchParams\([^)]*\?\s*\{/, 'no link is written from a conditional object literal the scan cannot read');
  // Workspace places (module=, section=, item=) are read and written by the workspace link module, which the core shell loads.
  const link = read('src/studio/workspace/link.ts');
  const linkKeys = [...link.matchAll(/\bq\.(?:get|set)\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(linkKeys.includes('module') && linkKeys.includes('section') && linkKeys.includes('item'), `found ${linkKeys.join(', ')} in link.ts`);
  for (const key of linkKeys) keys.add(key);
  const input = read('src/studio/input.ts');
  const reserved = JSON.parse(/RESERVED_LINK_KEYS: readonly string\[\] = (\[[^\]]*\])/.exec(input)[1]);
  const optional = JSON.parse(/DIRECTION_LINK_KEYS = (\[[^\]]*\])/.exec(read('src/studio/directions.ts'))[1]);
  for (const key of keys) assert.ok(reserved.includes(key) || optional.includes(key), `link key "${key}" has no reserved namespace`);
  assert.match(read('src/studio/design-ui/react.tsx'), /adapter\.axes\.inputs\.filter[\s\S]{0,140}DIRECTION_LINK_KEYS[\s\S]{0,160}reserved\.length[\s\S]{0,40}throw new Error/, 'opt-in lifecycle rejects collisions without reserving new keys for legacy consumers');
  // Property values reach the link only through linkEdits, which leaves out readonly and reserved-key properties.
  assert.match(store, /linkEdits\(A\.axes\.inputs/);
  assert.match(store, /i\.placement === "dock" && !isProperty\(i\) && !RESERVED_LINK_KEYS\.includes\(i\.id\) && state\.values\[i\.id\] !== undefined\) q\.set/, 'the dock writer never writes a property or a reserved key');
  assert.match(store, /i\.placement === "dock" && !isProperty\(i\) && !RESERVED_LINK_KEYS\.includes\(i\.id\)\)\.flatMap/, 'the dock reader never reads a reserved key');
});

test('properties stay out of scenario inputs and the dock, reach Compare only with named values, and edit without a remount', () => {
  const store = read('src/store.tsx');
  assert.match(store, /export const choosableFor = [\s\S]{0,120}?i\.readonly \|\| isProperty\(i\)\s*\? false/, 'choosableFor never offers a property');
  assert.match(store, /export const compareAxes = [\s\S]{0,200}?\.\.\.\[\.\.\.choosableFor\(sc\), \.\.\.\(hasProperties \? propertiesFor\(A\.axes\.inputs, sc\) : \[\]\)\]\.filter\(comparable\)/, 'Compare offers a property only where the Studio can show properties, and only through comparable: never text or readonly');
  const views = read('src/components/studio/views.tsx');
  assert.match(views, /propertyIds\.has\(axis\) \? \{ values: s\.values, props: \{ \.\.\.s\.edits, \[axis\]: axisValue\(value\) \} \}/, 'a property axis reaches each side as its own property value, not as an input value');
  assert.doesNotMatch(views.slice(views.indexOf('export function CompareStage'), views.indexOf('export function CompareStage') + 12000), /setProp\(/, 'Compare never writes a side into the Inspect edits');
  assert.match(store, /i\.placement !== "dock" && !isProperty\(i\) \? \[\[i\.id, i\.default\]\]/, 'a property has no viewer value by default');
  const chrome = read('src/components/studio/chrome.tsx');
  assert.match(chrome, /choosableFor\(sc\)\.some\(\(i\) => i\.placement !== "dock" && !isProperty\(i\)\)/);
  assert.match(chrome, /\.filter\(\(i\) => i\.placement !== "dock" && !isProperty\(i\)\)/);
  assert.match(chrome, /choosableFor\(s\.scenarioObj\)\.filter\(\(i\) => i\.placement === "dock" && !isProperty\(i\)\)/);
  const preview = read('src/components/studio/preview.tsx');
  assert.match(preview, /const mountKey = JSON\.stringify\(\[scenario, theme, profile, fixed,/, 'property values stay out of the mount key');
  assert.match(preview, /values: resolved,/, 'a mount still carries the edits');
  assert.match(read('src/adapters/synthetic.ts'), /inputs: exampleAdapter\.axes\.inputs\.filter\(\(i\) => i\.section !== "properties"\)/);
});

test('Properties load lazily, edit only the scenario of the update, and keep stored edits a link does not carry', () => {
  const store = read('src/store.tsx');
  assert.match(store, /setProp: \(id, v\) =>\s*set\(\(s\) => \{[\s\S]{0,200}?A\.scenarios\.find\(\(x\) => x\.id === s\.scenario\)[\s\S]{0,120}?propertiesFor\(A\.axes\.inputs, sc\)\.find\(\(i\) => i\.id === id && !i\.readonly\)\s*if \(!input\) return \{\}/, 'setProp reads the scenario inside the update and ignores IDs that are not its properties');
  assert.match(store, /writeJSON\(PROPS_KEY, storedEdits\(state\.props, state\.propsHold\)\)/, 'a link does not overwrite stored edits until the person edits that scenario');
  const chrome = read('src/components/studio/chrome.tsx');
  assert.match(chrome, /React\.lazy\(\(\) => import\("\.\/properties"\)\)/);
  assert.doesNotMatch(chrome, /from "\.\/properties"/, 'the Properties chunk is never imported eagerly');
  assert.doesNotMatch(chrome, /<StatusNow \/>\} \{/, 'no text node beside the status when nothing is edited');
});

test('saved states share the layouts guards and stay pure', () => {
  assert.doesNotMatch(read('src/studio/scenarios.ts'), /from "(react|@\/)/, 'the saved-state model is shared with the dev server and stays pure');
  const vite = read('vite.config.ts');
  assert.match(vite, /Only this Studio can save its layouts/);
  assert.match(vite, /Only this Studio can save its scenarios/);
  assert.match(vite, /route: "\/__studio\/scenarios"/);
  const store = read('src/store.tsx');
  assert.match(store, /const usable = usableSaved\(generated, list, A\.axes\.inputs\)\s*A\.scenarios = withSaved\(generated, usable\)/, 'saved states join the catalog only through usableSaved');
  assert.equal((store.match(/withSaved\(/g) ?? []).length, 1, 'joinSaved is the only way into the catalog');
  assert.match(store, /joinSaved\(bundledScenarios\?\.scenarios\)/, 'the bundled file is checked');
  assert.match(store, /savedStates: joinSaved\(data\.scenarios\)/, 'the dev-server file is checked');
  assert.match(store, /setSavedStates: \(list\) => set\(\{ savedStates: joinSaved\(list\) \}\)/, 'every change is checked');
  assert.match(store, /const generated = A\.scenarios\.filter\(\(x\) => !x\.savedFrom\)/, 'a re-run of the store never counts a saved state as generated');
  assert.match(vite, /enforce: "post"/);
  assert.match(vite, /hotUpdate\(\{ file: changed, modules \}\) \{\s*if \(path\.resolve\(changed\) !== file\) return\s*for \(const m of modules\) this\.environment\.moduleGraph\.invalidateModule\(m\)\s*return \[\]/, 'creating, changing or deleting a saved file never reloads the Studio; the next load reads it fresh');
  assert.doesNotMatch(vite, /handleHotUpdate/);
  const props = read('src/components/studio/properties.tsx');
  assert.match(props, /const generated = adapter\.scenarios\.filter\(\(x\) => !x\.savedFrom\)[\s\S]*validateScenarios\(file, generated\.map\(\(x\) => x\.id\)\)/, 'the client refuses generated IDs before it posts');
  assert.doesNotMatch(read('src/studio/properties.ts'), /^import \{[^}]*\} from "\.\/scenarios"/m, 'the catalog model takes only types from scenarios.ts, so the validator stays in the lazy chunk');
});

test('saved files carry a revision: a stale save gets 409 with the current file and writes nothing', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-saved-file-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Loaded as the dev server loads it, without a TypeScript toolchain.
  const module = join(dir, 'saved-file.mjs');
  writeFileSync(module, stripTypeScriptTypes(read('scripts/saved-file.ts'), { mode: 'strip', sourceMap: false }));
  const { savedFileMiddleware, EMPTY_REVISION } = await import(pathToFileURL(module).href);
  const file = join(dir, 'layouts.json');
  const middleware = savedFileMiddleware({ file, schema: 'studio-layouts/1', list: 'layouts', maxBytes: 1024, validate: (d) => (d && Array.isArray(d.layouts) ? [] : ['no layouts']), forbidden: 'Only this Studio can save its layouts', tooBig: 'Too big' });
  // Mounted as vite.config.ts mounts it: the connect mount strips the route from req.url.
  const server = createServer((req, res) => middleware(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async () => {
    const res = await fetch(`${base}/__studio/layouts`);
    return { status: res.status, revision: res.headers.get('x-studio-revision'), unreadable: res.headers.get('x-studio-unreadable'), body: await res.json() };
  };
  const post = async (data, headers = {}) => {
    const res = await fetch(`${base}/__studio/layouts`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(data) });
    return { status: res.status, revision: res.headers.get('x-studio-revision'), body: await res.json() };
  };
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  const one = { schema: 'studio-layouts/1', layouts: [{ id: 'one' }] };
  const two = { schema: 'studio-layouts/1', layouts: [{ id: 'two' }] };

  const missing = await get();
  assert.equal(missing.revision, EMPTY_REVISION, 'a missing file has the fixed empty revision');
  assert.equal(EMPTY_REVISION, 'empty');
  assert.deepEqual(missing.body, { schema: 'studio-layouts/1', layouts: [] });
  assert.equal(missing.unreadable, null, 'a missing file is an empty list, not an unreadable one');
  const first = await post(one, { 'x-studio-expected-revision': missing.revision });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { ok: true });
  assert.equal(first.revision, sha(readFileSync(file)), 'the revision is a SHA-256 of the file as stored');
  const loaded = await get();
  assert.equal(loaded.revision, first.revision, 'GET answers the same revision for the same bytes');
  assert.deepEqual(loaded.body, one);
  assert.equal(loaded.unreadable, null);
  // Someone else saves; the page still holds the revision it loaded.
  const elsewhere = await post(two);
  assert.equal(elsewhere.status, 200, 'a save without the header is unconditional, as before revisions');
  assert.notEqual(elsewhere.revision, first.revision);
  const stale = await post({ schema: 'studio-layouts/1', layouts: [{ id: 'mine' }] }, { 'x-studio-expected-revision': loaded.revision });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body.ok, false);
  assert.deepEqual(stale.body.error, { code: 'conflict', reason: 'layouts.json changed since you loaded it', recoverable: true });
  assert.deepEqual(stale.body.current, { data: two, revision: elsewhere.revision });
  assert.equal(stale.revision, elsewhere.revision);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), two, 'a conflict writes nothing');
  // A save naming the current revision writes; an invalid file is refused before the revision is compared.
  assert.equal((await post({ schema: 'studio-layouts/1', layouts: [] }, { 'x-studio-expected-revision': stale.body.current.revision })).status, 200);
  assert.equal((await post({ schema: 'studio-layouts/1' }, { 'x-studio-expected-revision': 'anything' })).status, 422);
  assert.equal((await post(two, { origin: 'https://elsewhere.example' })).status, 403);
  // An unreadable file still has a revision of its bytes and answers the empty file.
  writeFileSync(file, 'not json');
  const broken = await get();
  assert.equal(broken.revision, sha('not json'));
  assert.deepEqual(broken.body, { schema: 'studio-layouts/1', layouts: [] });
  assert.equal(broken.unreadable, '1', 'GET says the file is unreadable, so a Studio refuses to save over it');
  const unreadable = await post(one, { 'x-studio-expected-revision': first.revision });
  assert.equal(unreadable.status, 409);
  assert.deepEqual(unreadable.body.current, { data: null, revision: broken.revision }, 'an unreadable file is never presented as an empty list');
  assert.equal(readFileSync(file, 'utf8'), 'not json');
  // The 0.11 guards still answer as before.
  const raw = async (body, contentType) => (await fetch(`${base}/__studio/layouts`, { method: 'POST', headers: { 'content-type': contentType, origin: base }, body })).status;
  assert.equal(await raw('{}', 'text/plain'), 415);
  assert.equal(await raw('{not json', 'application/json'), 400);
  assert.equal(readFileSync(file, 'utf8'), 'not json');
  // Writes go through a uniquely named temporary file, none of which is left behind.
  assert.match(read('scripts/saved-file.ts'), /const tmp = `\$\{o\.file\}\.\$\{process\.pid\}\.\$\{randomUUID\(\)\}\.tmp`/);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  // The dev server mounts this one middleware for both saved files, and the clients send the revision they read.
  const vite = read('vite.config.ts');
  assert.match(vite, /server\.middlewares\.use\(o\.route, savedFileMiddleware\(\{ \.\.\.o, file \}\)\)/);
  assert.match(read('src/components/studio/responsive.tsx'), /"x-studio-expected-revision": revision/);
  assert.match(read('src/components/studio/properties.tsx'), /const revision = read\.headers\.get\("x-studio-revision"\)[\s\S]*"x-studio-expected-revision": revision/);
  const store = read('src/store.tsx');
  assert.match(store, /set\(\{ saved: \(data as LayoutsFile\)\.layouts, layoutsRevision, layoutsLoad: "ready" \}\)/, 'the page keeps the revision of the layouts it loaded');
  assert.match(store, /x-studio-unreadable"\) === "1" \|\| validateLayouts\(data\)\.length\) return set\(\{ layoutsRevision, layoutsLoad: "unreadable" \}\)/, 'an unreadable layouts.json is never taken as an empty list to save over');
  assert.match(store, /layoutsLoad: "loading",/, 'the page starts without a revision and says so');
  const responsive = read('src/components/studio/responsive.tsx');
  assert.match(responsive, /if \(blocked\) throw new Error\(blocked\)/, 'no layouts save before layouts.json has been read');
  assert.match(responsive, /loading: "Loading layouts…"/);
  assert.equal((responsive.match(/disabled=\{!!why/g) ?? []).length, 5, 'Save, Save as, Rename, Duplicate and Delete wait for the revision');
  assert.match(read('src/components/studio/properties.tsx'), /read\.headers\.get\("x-studio-unreadable"\) === "1" \|\| !Array\.isArray\(current\)\) throw/, 'a scenarios save never replaces an unreadable file');
});

test('final fix wave: ordered value updates, file-preserving saves, a lazy-chunk boundary and a fresh runtime per Present step', () => {
  const client = read('src/studio/frame-client.ts');
  // Only the newest values message may affect the runtime: updates chain, a superseded one is skipped or ignored.
  assert.match(client, /const seq = \+\+valuesSeq/);
  assert.match(client, /updating\.then\(async \(\) => \{\s*if \(seq !== valuesSeq/);
  assert.match(client, /if \(seq === valuesSeq\) throw err/);
  assert.match(client, /if \(newest\) post\(\{ type: "navigated"/);
  assert.match(client, /await updating\s*\n\s*if \(!handlers\.code/);
  const props = read('src/components/studio/properties.tsx');
  // Every write starts from the file on disk, and changes only the entries the action concerns.
  assert.match(props, /const persist = async \(change: \(raw: SavedScenario\[\]\) => SavedScenario\[\]\) => \{\s*const read = await fetch\("__studio\/scenarios"\)/);
  assert.doesNotMatch(props, /persist\(s\.savedStates/);
  assert.doesNotMatch(props, /own\?\.values/, 'Save builds values from the state as it shows, not by merging the stored ones');
  const chrome = read('src/components/studio/chrome.tsx');
  assert.match(chrome, /Properties could not load\. Reload the Studio\./);
  assert.match(chrome, /<PartBoundary part=\{p\.part\}>\s*<React\.Suspense/);
  assert.match(read('src/components/studio/views.tsx'), /<ScenarioPreview\s*\n\s*\/\/[^\n]*\n\s*key=\{`\$\{i\}:\$\{stepKey\}`\}/);
});

test('acceptance script covers the workspace criteria', () => {
  const script = read('scripts/acceptance.mjs');
  for (let i = 1; i <= 9; i++) assert.match(script, new RegExp(`"WS-0${i}"`), `WS-0${i} is not checked`);
  assert.match(script, /"WS-06b"/, 'WS-06b is not checked');
  assert.match(script, /"WS-05b"/, 'WS-05b is not checked');
  assert.match(script, /STUDIO_CHUNK_BASELINE_GZ = \d+/);
  assert.match(script, /workspace: "workspace"/);
});

test('acceptance script covers the library criteria', () => {
  const script = read('scripts/acceptance.mjs');
  for (let i = 1; i <= 10; i++) assert.match(script, new RegExp(`"LB-${String(i).padStart(2, '0')}"`), `LB-${i} is not checked`);
  assert.match(script, /library: "library"/);
  assert.match(script, /e\.tagName === "IFRAME"\) return null/, 'the focus walk skips preview frames');
});

test('0.12.1 touch and focus floors: stacked controls keep their own targets and focus is drawn whole', () => {
  const script = read('scripts/acceptance.mjs');
  for (const id of ['AC-65', 'AC-66']) assert.match(script, new RegExp(`check\\("${id}"`), `${id} is not checked`);
  // AC-65 measures where a finger lands with elementFromPoint; AC-66 compares rendered pixels, focused and unfocused.
  assert.match(script, /document\.elementFromPoint\(x, y\)/);
  assert.match(script, /a stop passes when the pixels changed by 3:1 or more cover at least its perimeter/);
  const css = read('src/studio.css');
  assert.match(css, /\[role="tabpanel"\], \[aria-label="Studio"\] button, \[data-slot="breadcrumb"\] :is\(button, a\[href\]\)\):focus-visible \{ outline-offset: -2px;/, 'the breadcrumb and tab panels draw focus inside');
  const panel = read('src/components/studio/rail-panel.tsx');
  assert.equal(panel.match(/pointer-coarse:min-h-11/g)?.length, 3, 'Gallery areas, the flag switch and Autoplay are 44 px rows');
  assert.match(panel, /<Label className="flex items-center justify-between font-normal pointer-coarse:min-h-11">\s*Autoplay/);
  const responsive = read('src/components/studio/responsive.tsx');
  assert.match(responsive, /focus-visible:ring-ring pointer-coarse:h-11">/, 'frame rows are 44 px apart on coarse pointers');
  assert.match(responsive, /<span className="flex shrink-0 items-center pointer-coarse:h-11">\s*<Switch id=\{`sync-/);
  assert.match(read('src/components/studio/design.tsx'), /relative h-5 pointer-coarse:mt-4 pointer-coarse:h-11/);
  const doc = readFileSync(new URL('../metamodern-interface-studio/references/shell.md', import.meta.url), 'utf8');
  for (const id of ['AC-65', 'AC-66']) assert.match(doc, new RegExp(`^\\| ${id} \\|`, 'm'), `shell.md has no ${id} row`);
  assert.match(doc, /equivalent/);
  assert.match(read('UPDATING.md'), /^## 0\.12\.1$/m);
});

test('0.12.1 a focused slider outlines its thumb and AC-66 walks the Design sliders', () => {
  assert.match(read('src/studio.css'), /\[data-slot="slider-thumb"\]:has\(input:focus-visible\) \{ outline: 2px solid var\(--ring\); outline-offset: 2px; \}/);
  const script = read('scripts/acceptance.mjs');
  assert.match(script, /const range = !!a\?\.matches\('input\[type="range"\]'\)/);
  assert.match(script, /hash: "view=design&scenario=tasks\.list" \}\)\n\s*await d\.addStyleTag/);
  assert.match(script, /no Design slider was reached/);
});

test('0.12.1 kit: the SaveBar message wraps above its actions and a DataTable keeps its announcement inside the page', () => {
  assert.match(read('src/kit/save.tsx'), /role="status" aria-live="polite" className="grid min-w-0 flex-1 basis-64 gap-1 text-sm"/);
  assert.match(read('src/kit/data.tsx'), /<div className="relative grid gap-2">/);
  const script = read('scripts/acceptance.mjs');
  assert.match(script, /check\("WS-10"/);
  assert.match(script, /width: 390, height: 520, touch: true, hash: "module=site&section=general"/);
});

test('0.12.2 Present anchor label and Compare headers: AA text, whole on the stage, a forced-colors highlight', () => {
  const css = read('src/studio.css');
  assert.match(css, /\.dark \{[^}]*--anchor-foreground: oklch\(0\.18 0 0\);/, 'the dark anchor label is dark text on the lifted anchor');
  assert.match(css, /@media \(forced-colors: active\) \{\s*\.anchor-ring \{ box-shadow: none; animation: none; outline: 2px solid Highlight;/);
  const bits = read('src/components/studio/bits.tsx');
  assert.match(bits, /const placement = ring\.top - GAP - LABEL >= EDGE \? "above" : bottom \+ GAP \+ LABEL <= H - EDGE \? "below" : "inside"/);
  assert.match(bits, /className="anchor-label pointer-events-none absolute truncate/);
  assert.match(bits, /maxWidth: Math\.max\(0, W - EDGE - \(end \? right : left\)\)/, 'the label is no wider than the room on the side it grows toward');
  assert.match(bits, /<span className="sr-only">Highlighted: <\/span>\s*\{anchor\.label\}/, 'the full name stays in the label text');
  const views = read('src/components/studio/views.tsx');
  assert.match(views, /<figcaption className="@container flex justify-center self-stretch">/, 'a side header takes its preview\'s width');
  assert.match(views, /<span className="@max-\[7rem\]:sr-only">\{text\}<\/span>/, 'a narrow header shows the status as its dot, with its word as its name');
  assert.match(views, /className="m-0 flex min-w-15 flex-col items-center gap-2"/, 'a header always fits Reset');
  assert.match(views, /<b className="min-w-0 truncate font-medium" title=\{label\}>/);
  const script = read('scripts/acceptance.mjs');
  for (const id of ['AC-67', 'AC-68']) assert.match(script, new RegExp(`check\\("${id}"`), `${id} is not checked`);
  assert.match(script, /emulateMedia\(\{ forcedColors: "active" \}\)/);
  assert.match(script, /A deliberately long anchor name/);
  assert.match(script, /Compare \$\{count\}: not available/);
  assert.match(script, /the split stage was not found/);
  assert.match(script, /Compare Profile 3-up/);
  assert.match(script, /contents \$\{x\.spill\} px outside the header/);
  assert.match(script, /brand: "#fde68a" \}\)\n/);
  assert.match(script, /const STUDIO_CHUNK_BASELINE = "0\.14\.0"/);
  const doc = readFileSync(new URL('../metamodern-interface-studio/references/shell.md', import.meta.url), 'utf8');
  for (const id of ['AC-67', 'AC-68']) assert.match(doc, new RegExp(`^\\| ${id} \\|`, 'm'), `shell.md has no ${id} row`);
  assert.match(doc, /AC-01 to AC-69/);
  assert.match(read('UPDATING.md'), /^## 0\.12\.2$/m);
});
