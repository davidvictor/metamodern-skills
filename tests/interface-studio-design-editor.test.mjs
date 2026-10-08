import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const source = new URL('../metamodern-interface-studio/assets/studio-shell/src/studio/', import.meta.url);
async function load(t) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-controller-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['design-runtime', 'design-ui/types', 'design-ui/controller', 'design-ui/loader', 'design-ui/review']) {
    const code = stripTypeScriptTypes(readFileSync(new URL(`${name}.ts`, source), 'utf8'), { mode: 'strip' }).replace(/from "\.\/types"/g, 'from "./types.mjs"').replace(/from "\.\.\/design-runtime"/g, 'from "./design-runtime.mjs"');
    writeFileSync(join(dir, `${name.split('/').at(-1)}.mjs`), code);
  }
  return { ...await import(pathToFileURL(join(dir, 'controller.mjs')).href), ...await import(pathToFileURL(join(dir, 'loader.mjs')).href), ...await import(pathToFileURL(join(dir, 'review.mjs')).href) };
}
const descriptor = { schema: 'studio-design-compiler/1', id: 'fixture', version: '1', inputSchema: 'fixture/1', outputSchema: 'studio-compiled-design/1', sourceLockId: 'fixture-lock' };
const model = {
  initial: { size: 100, color: 'blue' },
  validate: v => typeof v.size === 'number' && v.size >= 0 && v.size <= 200 ? [] : [{ id: 'size', controlId: 'size', severity: 'error', message: 'Size invalid' }],
  edit: (v, edit) => { if (edit.target && edit.target.component !== 'fixture-card') throw new Error('Unsupported target'); return { ...v, [edit.controlId]: edit.value }; },
  reset: (v, request, bases) => request.basis === 'saved' ? bases.saved : request.basis === 'original' ? bases.original : { ...v, [request.controlId]: bases.original[request.controlId] },
  readout: (v, c) => ({ effective: v[c.controlId], inherited: 100, override: v[c.controlId] === 100 ? null : v[c.controlId], sourceScope: 'foundation', themeScope: c.scope, linked: true, reach: [], diagnostics: [] }),
};
const compiled = (input) => ({ schema: 'studio-compiled-design/1', compiler: { id: 'fixture', version: '1' }, sourceLockId: 'fixture-lock', fingerprint: JSON.stringify(input.direction), tokens: { '--fixture-size': `${input.direction.size}px` }, css: '', stylesheets: [] });
test('atomic gestures create one history entry; cancel and resets preserve immutable source/saved bases', async t => {
  const { createDesignController } = await load(t); const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light', 'dark'] }); await c.start();
  const initial = c.getSnapshot(); assert.equal(initial.status, 'ready'); assert.ok(Object.isFrozen(initial.values));
  c.beginGesture(); c.edit({ controlId: 'size', value: 110 }); c.edit({ controlId: 'size', value: 120 }); c.commitGesture(); await c.settled();
  assert.equal(c.getSnapshot().values.size, 120); c.undo(); await c.settled(); assert.equal(c.getSnapshot().values.size, 100); assert.equal(c.getSnapshot().canUndo, false);
  c.redo(); await c.settled(); assert.equal(c.getSnapshot().values.size, 120);
  c.beginGesture(); c.edit({ controlId: 'size', value: 130 }); c.cancelGesture(); await c.settled(); assert.equal(c.getSnapshot().values.size, 120);
  c.reset({ basis: 'saved' }); await c.settled(); assert.deepEqual(c.getSnapshot().values, initial.values); assert.deepEqual(initial.values, { size: 100, color: 'blue' });
});
test('invalid input and source/asset failures retain whole last-valid paired output and block save/export', async t => {
  const { createDesignController } = await load(t); const runtime = { model, compile: input => { if (input.direction.color === 'missing') throw new Error('Registered asset missing'); return compiled(input); } };
  const c = createDesignController({ compiler: descriptor, runtime, themes: ['light', 'dark'] }); await c.start(); const valid = c.getSnapshot().compiled;
  c.inputProblem('size', 'Off step', '95.5'); c.edit({ controlId: 'color', value: 'green' }); assert.ok(c.getSnapshot().inputProblems.size, 'unrelated edits must retain invalid field state'); assert.equal(c.getSnapshot().status, 'invalid'); assert.equal(c.getSnapshot().canSave, false); assert.deepEqual(c.getSnapshot().compiled, valid);
  c.edit({ controlId: 'size', value: 999 }); await c.settled(); assert.equal(c.getSnapshot().status, 'invalid'); assert.deepEqual(c.getSnapshot().compiled, valid);
  c.reset({ basis: 'original' }); await c.settled(); c.edit({ controlId: 'color', value: 'missing' }); await c.settled(); assert.equal(c.getSnapshot().status, 'error'); assert.equal(c.getSnapshot().canExport, false); assert.deepEqual(c.getSnapshot().compiled, valid);
  c.edit({ controlId: 'size', value: 10, target: { component: 'unknown' } }); assert.match(c.getSnapshot().problems[0].message, /Unsupported/);
});
test('async compilation publishes themes atomically and stale success cannot clear a newer invalid/error revision', async t => {
  const { createDesignController } = await load(t); const pending = [];
  const c = createDesignController({ compiler: descriptor, themes: ['light', 'dark'], runtime: { model, compile: input => input.direction.size === 100 ? compiled(input) : new Promise(resolve => pending.push(() => resolve(compiled(input)))) } }); await c.start(); const before = c.getSnapshot().compiled;
  c.edit({ controlId: 'size', value: 110 }); await Promise.resolve(); await Promise.resolve(); c.inputProblem('size', 'Invalid newest input', 'bad');
  for (const resolve of pending) resolve(); await c.settled(); assert.equal(c.getSnapshot().status, 'invalid'); assert.deepEqual(c.getSnapshot().compiled, before);
});
test('explicit editor loader rejects inherited/missing IDs and incompatible interface/slot versions', async t => {
  const { loadDesignEditor } = await load(t); const d = { schema: 'studio-design-editor/1', id: 'fixture', version: '1', controllerSchema: 'studio-design-controller/1', slots: ['foundation'], capabilities: ['edit'] };
  await assert.rejects(loadDesignEditor({ ...d, id: 'constructor' }, {}), /registered/);
  await assert.rejects(loadDesignEditor(d, { fixture: async () => ({ schema: d.schema, id: d.id, version: '2', Foundation: () => null }) }), /version/);
  await assert.rejects(loadDesignEditor(d, { fixture: async () => ({ schema: d.schema, id: d.id, version: d.version, capabilities: ["edit"] }) }), /Foundation/);
});

test('confirmed saved A keeps newer working B dirty and captured output immutable', async t => {
  const { createDesignController } = await load(t); const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light', 'dark'] }); await c.start();
  c.edit({ controlId: 'size', value: 110 }); await c.settled(); const a = c.captureSave(); c.edit({ controlId: 'size', value: 120 }); await c.settled();
  c.acknowledgeSaved('direction.saved', 1, a); assert.equal(c.getSnapshot().savedValues.size, 110); assert.equal(c.getSnapshot().values.size, 120); assert.equal(c.getSnapshot().dirty, true); assert.equal(c.preview('light', 'saved').output.fingerprint, JSON.stringify(a.values));
  assert.throws(() => c.acknowledgeSaved('direction.saved', 2, a), /stale/);
});
test('preview failure C rolls whole map back to applied A, never compiler-only B; capabilities prevent mutation/history', async t => {
  const { createDesignController } = await load(t); const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light', 'dark'] }); await c.start();
  c.registerPreview('one', 'light', 'working'); c.confirmPreview('one', c.preview('light').identity); const a = c.getSnapshot().compiled;
  c.edit({ controlId: 'size', value: 110 }); await c.settled(); c.edit({ controlId: 'size', value: 120 }); await c.settled(); const identity = c.preview('light').identity; c.reportPreviewFailure(identity, 'Frame rejected C'); assert.deepEqual(c.getSnapshot().compiled, a); assert.equal(c.getSnapshot().canExport, false);
  const readonly = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light'], capabilities: ['diagnostics'] }); await readonly.start(); readonly.edit({ controlId: 'size', value: 110 }); readonly.reset({ basis: 'original' }); readonly.undo(); assert.equal(readonly.getSnapshot().values.size, 100); assert.equal(readonly.getSnapshot().canUndo, false);
});
test('descriptor rejects executable data, unknown slots/capabilities and missing declared capability', async t => {
  const { loadDesignEditor } = await load(t); const d = { schema: 'studio-design-editor/1', id: 'fixture', version: '1', controllerSchema: 'studio-design-controller/1', slots: ['foundation'], capabilities: ['edit'] }; const good = { fixture: async () => ({ schema: d.schema, id: d.id, version: d.version, Foundation: () => null, capabilities: ['edit'] }) };
  await assert.rejects(loadDesignEditor({ ...d, capabilities: ['unknown'] }, good), /capabilities/); await assert.rejects(loadDesignEditor({ ...d, slots: ['rail'] }, good), /descriptor/); await assert.rejects(loadDesignEditor({ ...d, handler: () => {} }, good), /descriptor/); await assert.rejects(loadDesignEditor(d, { fixture: async () => ({ ...(await good.fixture()), capabilities: [] }) }), /capability/);
});

test('managed host updates preserve every product editor file; editor imports cannot cross into shell or remote modules', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-editor-owner-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const updater = new URL('../metamodern-interface-studio/scripts/update-studio.mjs', import.meta.url).pathname;
  const create = spawnSync(process.execPath, [updater, join(dir, 'consumer'), '--create', '--host', 'next', '--json'], { encoding: 'utf8' }); assert.equal(create.status, 0, create.stderr);
  const product = join(dir, 'consumer/src/design-ui/index.ts'); writeFileSync(product, '// Product owned editor map\n');
  const update = spawnSync(process.execPath, [updater, join(dir, 'consumer'), '--apply', '--skip-checks', '--json'], { encoding: 'utf8' }); assert.equal(update.status, 0, update.stderr); assert.equal(readFileSync(product, 'utf8'), '// Product owned editor map\n');
  const { designUiImportProblem } = await import(new URL('../metamodern-interface-studio/assets/studio-shell/scripts/design-ui-boundary.mjs', import.meta.url).href);
  for (const allowed of ['react', '@studio/kit', '@studio/design-ui', './local']) assert.equal(designUiImportProblem('/studio/src/design-ui/panel.tsx', allowed, '/studio'), null);
  for (const denied of ['@/store', '../studio/design', 'https://remote.test/editor', './own.css', undefined]) assert.match(designUiImportProblem('/studio/src/design-ui/panel.tsx', denied, '/studio'), /boundary|literal/);
});

test('cancelling an unrelated gesture restores pre-gesture invalid text instead of reporting save-ready', async t => {
  const { createDesignController } = await load(t); const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light'] }); await c.start(); c.inputProblem('other', 'Invalid other field', 'bad'); c.beginGesture(); c.edit({ controlId: 'size', value: 110 }); c.cancelGesture(); await c.settled(); assert.equal(c.getSnapshot().values.size, 100); assert.equal(c.getSnapshot().inputProblems.other.raw, 'bad'); assert.equal(c.getSnapshot().status, 'invalid'); assert.equal(c.getSnapshot().canSave, false);
});

test('data-changing notifications are pending and cannot capture B with older A compilation', async t => {
  const { createDesignController } = await load(t); const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light'] }); await c.start(); const observed=[]; const stop=c.subscribe(()=>{const s=c.getSnapshot(); if(s.values.size===110) { observed.push([s.status,s.canSave,s.draftRevision,s.compiledRevision]); if(s.compiledRevision!==s.draftRevision) assert.throws(()=>c.captureSave(),/ready/); }}); c.edit({controlId:'size',value:110}); await c.settled(); stop(); assert.ok(observed.some(x=>x[0]==='pending')); assert.ok(observed.every(x=>x[2]===x[3]||x[1]===false));
});

test('failed source A followed by repaired working B cannot seed saved A with B on retry or repeated start', async t => {
  const { createDesignController } = await load(t); let failed=true; const c=createDesignController({compiler:descriptor,themes:['light'],runtime:{model,compile:input=>{if(failed&&input.direction.size===100)throw new Error('Source asset unavailable');return compiled(input)}}}); await c.start(); assert.equal(c.getSnapshot().status,'error'); failed=false; c.edit({controlId:'size',value:110}); await c.settled(); c.retry(); await c.settled(); await c.start(); assert.equal(c.getSnapshot().savedValues.size,100); assert.equal(c.preview('light','saved').output,undefined); assert.equal(c.getSnapshot().compiled.light.fingerprint,JSON.stringify(c.getSnapshot().values)); c.reset({basis:'saved'}); await c.settled(); c.retry(); await c.settled(); assert.equal(c.preview('light','saved').output.fingerprint,JSON.stringify(c.getSnapshot().savedValues));
});

test('review context navigation is guarded and cannot change canonical values, compiled fingerprints or history', async t => {
  const { createDesignController, createDesignReviewContext } = await load(t);
  const c = createDesignController({ compiler: descriptor, runtime: { model, compile: compiled }, themes: ['light'] }); await c.start();
  const before = c.getSnapshot(); let selected = 'first';
  const scenarios = [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }, { id: 'later', label: 'Later', status: 'later' }];
  const review = createDesignReviewContext(selected, scenarios, id => { selected = id });
  review.selectScenario('unknown'); review.selectScenario('later'); review.selectScenario('first'); assert.equal(selected, 'first');
  review.selectScenario('second'); const next = createDesignReviewContext(selected, scenarios, id => { selected = id });
  assert.equal(next.scenarioId, 'second'); assert.deepEqual(next.scenarios.map(s => s.id), ['first', 'second']); assert.ok(Object.isFrozen(next.scenarios));
  assert.deepEqual(c.getSnapshot(), before); assert.equal(c.getSnapshot().canUndo, false); assert.equal(c.getSnapshot().compiled.light.fingerprint, before.compiled.light.fingerprint);
});
