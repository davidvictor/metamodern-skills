import { studioSource } from './studio-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const root = new URL(`file://${studioSource}/`);
const source = readFileSync(new URL('src/studio/profile-frame.ts', root), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`);

test('declared device corners match the renderer at fractional, small and large zoom', () => {
  for (const scale of [0.1, 0.25, 0.625, 1, 2, 4]) {
    assert.equal(model.scaledFrameRadius({ kind: 'phone', frameRadius: 66 }, 410, 864, scale), 66 * scale);
    assert.equal(model.scaledFrameRadius({ kind: 'tablet', frameRadius: 24 }, 834, 1112, scale), 24 * scale);
  }
});

test('tablets get their own defaults and a flat renderer can explicitly opt out', () => {
  assert.equal(model.scaledFrameRadius({ kind: 'phone' }, 390, 844, 1), 44);
  assert.equal(model.scaledFrameRadius({ kind: 'tablet' }, 834, 1112, 1), 28);
  assert.equal(model.scaledFrameRadius({ kind: 'desktop' }, 1280, 800, 1), 8);
  assert.equal(model.scaledFrameRadius({ kind: 'tablet', frameRadius: 0 }, 834, 1112, 1), 0);
  assert.equal(model.scaledFrameRadius({ kind: 'phone', frameRadius: 900 }, 100, 80, 1), 40);
});

test('a failing diagnostics handler reports none and never blocks the ready reply', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  // frame-client imports its siblings; strip each and point the imports at the stripped copies.
  const dir = mkdtempSync(join(tmpdir(), 'studio-frame-'));
  for (const name of ['frame-client', 'protocol', 'frame-sync', 'frame-gestures', 'appearance']) {
    const code = stripTypeScriptTypes(readFileSync(new URL(`src/studio/${name}.ts`, root), 'utf8'), { mode: 'strip' }).replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"');
    writeFileSync(join(dir, `${name}.mjs`), code);
  }
  const { readDiagnostics } = await import(pathToFileURL(join(dir, 'frame-client.mjs')).href);
  const inputs = { scenario: 's' };
  assert.equal(await readDiagnostics({}, inputs), undefined);
  assert.equal(await readDiagnostics({ diagnostics: () => { throw new Error('measure failed'); } }, inputs), undefined);
  assert.equal(await readDiagnostics({ diagnostics: async () => { throw new Error('measure failed'); } }, inputs), undefined);
  assert.deepEqual(await readDiagnostics({ diagnostics: async (i) => [{ id: i.scenario }] }, inputs), [{ id: 's' }]);
  assert.match(readFileSync(new URL('src/studio/frame-client.ts', root), 'utf8'), /diagnostics: await readDiagnostics\(handlers, m\.inputs\)/, 'the ready reply reads diagnostics through the fail-soft path');
});

test('preview frames carry the adapter frame isolation, and nothing when it is undeclared', () => {
  const live = readFileSync(new URL('src/studio/live-preview.tsx', root), 'utf8');
  const preview = readFileSync(new URL('src/components/studio/preview.tsx', root), 'utf8');
  const types = readFileSync(new URL('src/studio/types.ts', root), 'utf8');
  assert.match(types, /frameIsolation\?: \{ credentialless\?: boolean; sandbox\?: string \}/);
  // The only live iframe in the shell, so every view's preview gets the same isolation. The kit's static
  // output frame is the one other iframe: fully sandboxed (no scripts, forms or same-origin access).
  const srcDir = new URL('src/', root);
  const iframes = readdirSync(srcDir, { recursive: true }).filter((f) => /\.tsx?$/.test(f)).filter((f) => readFileSync(new URL(f, srcDir), 'utf8').match(/<iframe|createElement\(\s*["'`]iframe["'`]/));
  assert.deepEqual(iframes.sort(), ['kit/preview-frame.tsx', 'studio/live-preview.tsx']);
  const kit = readFileSync(new URL('src/kit/preview-frame.tsx', root), 'utf8');
  assert.equal((kit.match(/<iframe\b/g) ?? []).length, 1);
  assert.match(kit.slice(kit.indexOf('<iframe'), kit.indexOf('/>', kit.indexOf('<iframe'))), /sandbox=""/);
  // A module's live preview gets the same isolation as every view's.
  assert.equal((kit.match(/<LivePreview\b/g) ?? []).length, 1);
  assert.match(kit, /isolation=\{adapter\.frameIsolation\}/);
  const frame = live.slice(live.indexOf('<iframe'), live.indexOf('/>', live.indexOf('<iframe')));
  // undefined drops the attribute, and credentialless is spread only when declared true.
  assert.match(frame, /sandbox=\{isolation\?\.sandbox\}/);
  assert.match(frame, /\{\.\.\.\(isolation\?\.credentialless === true \? \{ credentialless: true \} : \{\}\)\}/);
  assert.equal((preview.match(/<LivePreview\b/g) ?? []).length, 1);
  assert.match(preview, /isolation=\{adapter\.frameIsolation\}/);
  assert.doesNotMatch(readFileSync(new URL('src/adapters/example.ts', root), 'utf8'), /frameIsolation/, 'the example keeps acceptance identical');
});
