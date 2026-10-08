import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { studioSource } from './studio-source.mjs';
const read = p => readFileSync(join(studioSource, p), 'utf8');
const code = stripTypeScriptTypes(read('src/studio/appearance.ts'), { mode: 'strip' });
const appearance = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('only declared live input parameters qualify and unrelated design inputs stay in the mount key', () => {
  const ids = appearance.liveAppearanceIds({ design: { parameters: [
    { apply: { input: 'iconStyle', live: true } }, { apply: { input: 'density' } }, { apply: { live: true } }, { apply: { input: 'iconStyle', live: true } },
  ] } });
  assert.deepEqual(ids, ['iconStyle']);
  const enumAdapter = { design: { parameters: [{ id: 'iconStyle', label: 'Icon style', kind: 'enum', choices: [{ id: 'stroke-rounded' }] }] } };
  assert.deepEqual(appearance.staleDesignEnums(enumAdapter, { iconStyle: 'paid-unavailable' }), ['Icon style']);
  assert.deepEqual(appearance.staleDesignEnums(enumAdapter, { iconStyle: 'stroke-rounded' }), []);
  assert.deepEqual(appearance.withoutAppearance({ iconStyle: 'stroke-rounded', density: 'compact' }, ids), { density: 'compact' });
  assert.notEqual(appearance.appearanceKey({ values: { iconStyle: 'stroke-rounded' } }, ids), appearance.appearanceKey({ values: { iconStyle: 'test-only-square' } }, ids));
  for (const value of [null, [], { style: {} }, { style: NaN }, { style: Infinity }, JSON.parse('{"__proto__":"bad"}')]) assert.equal(appearance.validInputRecord(value), false);
  assert.equal(appearance.validInputRecord({ style: 'stroke-rounded', n: 1, enabled: true }), true);
  assert.equal(appearance.validInputRecord({ enabled: true }, true), false);
});

test('frame appearance opt-in preserves runtime state, rejects invalid styles and retains last valid fingerprint', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-appearance-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['frame-client', 'protocol', 'frame-sync', 'frame-gestures', 'appearance', 'design-runtime']) {
    writeFileSync(join(dir, `${name}.mjs`), stripTypeScriptTypes(read(`src/studio/${name}.ts`), { mode: 'strip' }).replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"'));
  }
  // Use a DOM-free import and drive the actual trusted message handler with minimal browser seams.
  const { connectStudioFrame } = await import(pathToFileURL(join(dir, 'frame-client.mjs')).href);
  const posts = [], events = new Map();
  const previous = Object.fromEntries(['window', 'document', 'location', 'MutationObserver', 'requestAnimationFrame', 'ResizeObserver'].map(k => [k, globalThis[k]]));
  let client; t.after(() => { client?.disconnect(); for (const [k, v] of Object.entries(previous)) if (v === undefined) delete globalThis[k]; else globalThis[k] = v; });
  const parent = { postMessage: message => posts.push(message) };
  globalThis.location = { origin: 'http://studio.test', pathname: '/fixture' };
  globalThis.window = { name: 'fixture-1', parent, addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {} };
  globalThis.document = { referrer: 'http://studio.test/', documentElement: { style: { setProperty() {}, removeProperty() {} } }, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = fn => { fn(); return 1; };
  let hold, release, holdCss, releaseCss; let rejectCss = false; let mounts = 0; const state = { draft: 'unsaved', overlay: true, navigation: '/details', style: 'stroke-rounded' };
  const inputs = { scenario: 'fixture', theme: 'light', profile: 'desktop', values: { iconStyle: 'stroke-rounded' }, design: {}, commands: [], tokens: {} };
  client = connectStudioFrame({
    applyCss: async () => { if (holdCss) await holdCss; if (rejectCss) { rejectCss = false; throw Error("Rejected CSS"); } }, mount: () => { mounts++; return { appearance: 'light', location: state.navigation }; }, settle: async () => {},
    update: () => {}, code: current => ({ language: 'json', text: JSON.stringify(current) }),
    updateAppearance: async next => { if (hold) await hold; const style = next.design?.iconStyle ?? next.values.iconStyle; if (!['stroke-rounded', 'test-only-square'].includes(style)) throw Error('Unsupported icon style'); state.style = style; },
  }, { sync: false, gestures: false });
  assert.ok(posts.find(p => p.type === 'hello').capabilities.includes('live-appearance'));
  assert.ok(posts.find(p => p.type === 'hello').capabilities.includes('live-values'));
  const send = async body => { await events.get('message')({ source: parent, origin: 'http://studio.test', data: { protocol: 'studio-preview/1', instance: 'fixture-1', ...body } }); };
  await send({ type: 'mount', requestId: 'mount', inputs });
  await send({ type: 'values', requestId: 'appearance', channel: 'appearance', appearanceIds: ['iconStyle'], values: { iconStyle: 'test-only-square' }, design: {} });
  const fp = posts.find(p => p.requestId === 'appearance' && p.type === 'reply').fingerprint;
  assert.ok(fp); assert.equal(mounts, 1); assert.deepEqual(state, { draft: 'unsaved', overlay: true, navigation: '/details', style: 'test-only-square' });
  await send({ type: 'values', requestId: 'bad', channel: 'appearance', appearanceIds: ['iconStyle'], values: { iconStyle: 'paid-unavailable' }, design: {} });
  assert.match(posts.find(p => p.requestId === 'bad').reason, /Unsupported/); assert.equal(state.style, 'test-only-square'); assert.equal(mounts, 1);
  await send({ type: 'values', requestId: 'invalid', channel: 'appearance', appearanceIds: ['iconStyle'], values: { iconStyle: {} } });
  assert.match(posts.find(p => p.requestId === 'invalid').reason, /Invalid/);
  await send({ type: 'values', requestId: 'ordinary', values: { iconStyle: 'paid-unavailable', title: 'changed' }, appearanceIds: ['iconStyle'] });
  await send({ type: 'code-request', requestId: 'accepted-state' });
  assert.equal(JSON.parse(posts.find(p => p.requestId === 'accepted-state').text).values.iconStyle, 'test-only-square');
  hold = new Promise(resolve => { release = resolve; });
  const slow = send({ type: 'values', requestId: 'slow', channel: 'appearance', appearanceIds: ['iconStyle'], values: { iconStyle: 'stroke-rounded' }, design: {} });
  await Promise.resolve(); await Promise.resolve();
  await send({ type: 'draft-overrides', requestId: 'new-draft', tokens: { '--latest-draft': 'yes' }, css: '', stylesheets: [] });
  release(); await slow; hold = undefined;
  await send({ type: 'code-request', requestId: 'after-race' });
  assert.equal(JSON.parse(posts.find(p => p.requestId === 'after-race').text).tokens['--latest-draft'], 'yes');
  assert.equal(state.style, 'stroke-rounded');
  assert.equal(mounts, 1);
  for (const rollback of [false, true]) {
    holdCss = new Promise(resolve => { releaseCss = resolve; }); rejectCss = rollback;
    const pendingDraft = send({ type: 'draft-overrides', requestId: `draft-first-${rollback}`, tokens: { '--draft-first': 'yes' }, css: '', stylesheets: [] });
    await Promise.resolve(); await Promise.resolve();
    await send({ type: 'values', requestId: `appearance-last-${rollback}`, channel: 'appearance', appearanceIds: ['iconStyle'], values: { iconStyle: rollback ? 'stroke-rounded' : 'test-only-square' }, design: {} });
    releaseCss(); await pendingDraft; holdCss = undefined;
    await send({ type: 'code-request', requestId: `after-draft-${rollback}` });
    assert.equal(JSON.parse(posts.find(p => p.requestId === `after-draft-${rollback}`).text).values.iconStyle, rollback ? 'stroke-rounded' : 'test-only-square');
  }
});

test('all executable shell icons pass through the semantic Free map and both hosts exclude the previous provider', () => {
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const p of walk(join(studioSource, 'src')).filter(p => /\.(tsx?|jsx?)$/.test(p))) assert.doesNotMatch(readFileSync(p, 'utf8'), /["']lucide-react["']/);
  const map = JSON.parse(read('src/icon-map.json'));
  assert.equal(map.style, 'stroke-rounded');
  assert.ok(Object.keys(map.icons).length > 80);
  const components = read('src/icons.tsx');
  assert.doesNotMatch(components, /import \*.*core-free-icons/);
  for (const [semantic, glyph] of Object.entries(map.icons)) assert.ok(components.includes(`mapped("${semantic}", Glyph${glyph})`));
  for (const host of ['vite', 'next']) {
    const pkg = JSON.parse(readFileSync(new URL(`../metamodern-interface-studio/assets/studio-hosts/${host}/package.json`, import.meta.url)));
    assert.ok(pkg.dependencies['@hugeicons/react']); assert.ok(pkg.dependencies['@hugeicons/core-free-icons']); assert.equal(pkg.dependencies['lucide-react'], undefined);
  }
});
