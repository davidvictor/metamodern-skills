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
  const input = read('src/studio/input.ts');
  const reserved = JSON.parse(/RESERVED_LINK_KEYS: readonly string\[\] = (\[[^\]]*\])/.exec(input)[1]);
  for (const key of keys) assert.ok(reserved.includes(key), `link key "${key}" is not in RESERVED_LINK_KEYS`);
  // Property values reach the link only through linkEdits, which leaves out readonly and reserved-key properties.
  assert.match(store, /linkEdits\(A\.axes\.inputs/);
  assert.match(store, /i\.placement === "dock" && !isProperty\(i\) && state\.values\[i\.id\] !== undefined\) q\.set/, 'the dock writer never writes a property');
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
