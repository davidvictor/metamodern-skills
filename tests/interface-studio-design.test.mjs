import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const skill = new URL('../metamodern-interface-studio/', import.meta.url);
const shell = new URL('./assets/studio-shell/', skill);
const read = (path) => readFileSync(new URL(path, shell), 'utf8');

/** Execute the pure design model without adding a runtime dependency to the source-only starter. */
async function loadPureTypeScript(path) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-design-'));
  const source = read(path);
  const transformed = stripTypeScriptTypes(source, { mode: 'strip', sourceMap: false });
  const file = join(dir, 'design.mjs');
  writeFileSync(file, transformed);
  return import(`${pathToFileURL(file).href}?${Date.now()}`);
}

const designModel = () => loadPureTypeScript('src/studio/design.ts');

const baseAdapter = {
  axes: {
    themes: [
      { id: 'light', label: 'Light', appearance: 'light' },
      { id: 'dark', label: 'Dark', appearance: 'dark' },
    ],
  },
  tokens: {
    columns: ['light', 'dark'],
    tokens: [{ name: '--space', family: 'spacing', values: { light: '10px', dark: '12px' } }],
  },
  design: {
    parameters: [
      {
        id: 'density',
        label: 'Density',
        kind: 'scale',
        default: 1,
        defaultsByTheme: { dark: 1.2 },
        apply: { scale: ['--space'] },
      },
      {
        id: 'graphic',
        label: 'Graphic',
        kind: 'enum',
        default: 'bars',
        themes: ['light'],
        choices: [{ id: 'bars', label: 'Bars' }, { id: 'rings', label: 'Rings' }],
        apply: { input: 'graphic-kind' },
      },
      {
        id: 'clock',
        label: 'Clock',
        kind: 'range',
        default: 480,
        min: 0,
        max: 1439,
        step: 1,
        apply: { input: 'clock-minutes' },
      },
    ],
  },
};

test('Design model honors theme defaults and sends only input-backed parameters to frames', async () => {
  const { designDraft, frameDesignValues, parameterDefault, valuesForTheme } = await designModel();
  assert.equal(parameterDefault(baseAdapter, baseAdapter.design.parameters[0], 'dark'), 1.2);

  const draft = designDraft(baseAdapter, { density: 2 }, 'dark');
  assert.equal(draft.tokens['--space'], '20px', 'dark uses its own 1.2 baseline');

  assert.deepEqual(frameDesignValues(baseAdapter, { graphic: 'rings', clock: 600 }, 'light'), {
    'graphic-kind': 'rings',
    'clock-minutes': 600,
  });
  assert.deepEqual(frameDesignValues(baseAdapter, { graphic: 'rings' }, 'dark'), {
    'clock-minutes': 480,
  }, 'theme-scoped graphics are not sent into another theme');
  assert.deepEqual(valuesForTheme(baseAdapter, { density: 2, graphic: 'bars' }, { light: { graphic: 'rings' } }, 'light'), { density: 2, graphic: 'rings' });
});

test('range inputs and diagnostics are carried by the stable shell contracts', () => {
  const types = read('src/studio/types.ts');
  assert.match(types, /control: "select" \| "presets" \| "range"/);
  assert.match(types, /format\?: "time"/);
  assert.match(types, /export type FrameDiagnostic/);
  assert.match(read('src/store.tsx'), /i\.control === "range"/, 'a declared range must remain choosable when it has no categorical options');
  assert.match(read('src/store.tsx'), /input\.presets \?\? \[\]\)\.map\(\(p\) => \(\{ id: String\(p\.value\), label: p\.label \}\)\)/, 'range comparisons use declared preset values rather than an empty categorical list');

  const protocol = read('src/studio/protocol.ts');
  assert.match(protocol, /design\?: Record<string, string \| number>/);
  assert.match(protocol, /diagnostics\?: FrameDiagnostic\[\]/);
  assert.match(read('src/studio/frame-client.ts'), /diagnostics\?:\s*\(\s*inputs: MountInputs\s*\)/);
  assert.match(read('src/studio/live-preview.tsx'), /diagnostics: current\?\.ready\?\.diagnostics/);
  assert.match(read('src/components/studio/preview.tsx'), /draft === NO_DRAFT \? \{\} : frameDesignValues/, 'as-built and Present previews must not receive input-backed design experiments');
});

test('decimal 24-hour range values use the declared time-hours formatter', async () => {
  const { formatClock } = await loadPureTypeScript('src/studio/format.ts');
  assert.equal(formatClock(18.08, 'time-hours'), '6:05 PM');
  assert.equal(formatClock(1085, 'time'), '6:05 PM');
});

test('scenario input validation normalizes declared ranges and rejects unsupported values', async () => {
  const { normalizeScenarioInput } = await loadPureTypeScript('src/studio/input.ts');
  const range = { id: 'clock', label: 'Clock', control: 'range', min: 0, max: 24, step: 1 / 12 };
  assert.equal(normalizeScenarioInput(range, undefined, '18.08'), 18.0833333333);
  assert.equal(normalizeScenarioInput(range, undefined, 25), undefined);
  const select = { id: 'mode', label: 'Mode', control: 'select', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  assert.equal(normalizeScenarioInput(select, { supports: { mode: ['a'] } }, 'a'), 'a');
  assert.equal(normalizeScenarioInput(select, { supports: { mode: ['a'] } }, 'b'), undefined);
});
