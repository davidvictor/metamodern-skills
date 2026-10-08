import { studioSource } from './studio-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const skill = new URL('../metamodern-interface-studio/', import.meta.url);
const shell = new URL(`file://${studioSource}/`);
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
  assert.match(read('src/store.tsx'), /input\?\.control === "range" \|\| input\?\.control === "number"\) return axisValues\(input\)/, 'range comparisons use declared preset values rather than an empty categorical list');
  assert.match(read('src/studio/properties.ts'), /i\.control === "range" \|\| i\.control === "number"\) return \(i\.presets \?\? \[\]\)\.map\(\(p\) => \(\{ id: String\(p\.value\), label: p\.label \}\)\)/, 'axisValues offers a range its presets');

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

test('a link keeps shared values that differ from any theme default and scoped values against the active theme', async () => {
  const { encodeDesign } = await designModel();
  assert.equal(encodeDesign(baseAdapter, { density: 1.2 }, 'dark'), 'density:1.2', 'a shared value as built in dark still changes light, so it travels');
  assert.equal(encodeDesign(baseAdapter, { density: 1 }, 'dark'), 'density:1', 'a shared value as built in light still changes dark');
  assert.equal(encodeDesign(baseAdapter, { density: 1.2 }, 'light'), 'density:1.2');
  assert.equal(encodeDesign(baseAdapter, { density: 0.9 }), 'density:0.9');
  assert.equal(encodeDesign(baseAdapter, {}, 'dark'), '', 'no value, no change');
  assert.equal(encodeDesign(baseAdapter, { graphic: 'bars' }, 'light'), '', 'a scoped value at its theme default stays out');
  assert.equal(encodeDesign(baseAdapter, { graphic: 'rings' }, 'light'), 'graphic:rings');
  const flat = { ...baseAdapter, design: { parameters: [{ ...baseAdapter.design.parameters[0], defaultsByTheme: undefined }] } };
  assert.equal(encodeDesign(flat, { density: 1 }, 'dark'), '', 'a shared value equal to every theme default stays out');
  const store = read('src/store.tsx');
  assert.match(store, /encodeDesign\(A, valuesForTheme\([^)]*state\.theme\), state\.theme\)/, 'the link encodes the viewed theme');
  assert.match(store, /theme\.id\), theme\.id\)\)/, 'hasDraft and Reset all follow the same rule in every theme');
  assert.match(store, /!d\.changes\.length\) return NO_DRAFT/, 'the view draft counts only changes in the theme it renders');
  assert.doesNotMatch(store, /decodeDesign\(A, encodeDesign\(/, 'saved values are not filtered against a theme-less default on reload');
});

test('a link made in dark round-trips a shared value into light', async () => {
  const { encodeDesign, decodeDesign, designDraft, valuesForTheme } = await designModel();
  const link = encodeDesign(baseAdapter, valuesForTheme(baseAdapter, { density: 1.2 }, {}, 'dark'), 'dark');
  const decoded = decodeDesign(baseAdapter, link);
  assert.deepEqual(decoded, { density: 1.2 });
  assert.equal(designDraft(baseAdapter, decoded, 'dark').changes.length, 0, 'dark shows its as-built value');
  assert.equal(designDraft(baseAdapter, decoded, 'light').tokens['--space'], '12px', 'light applies 1.2 instead of falling back to 1');
  const back = encodeDesign(baseAdapter, valuesForTheme(baseAdapter, { density: 1 }, {}, 'dark'), 'dark');
  assert.equal(designDraft(baseAdapter, decodeDesign(baseAdapter, back), 'dark').tokens['--space'], '10px', 'a dark value at the plain default survives too');
});

test('a partial values change keeps the shared and themed values it does not name', async () => {
  const { mergeDesignValues } = await designModel();
  const merged = mergeDesignValues(baseAdapter, { density: 1.1, clock: 600 }, { light: { graphic: 'rings' } }, 'light', { density: 0.9 });
  assert.deepEqual(merged.values, { density: 0.9, clock: 600 });
  assert.deepEqual(merged.valuesByTheme, { light: { graphic: 'rings' } });
  const themed = mergeDesignValues(baseAdapter, { density: 1.1 }, { light: { graphic: 'rings' }, dark: {} }, 'light', { graphic: 'bars' });
  assert.deepEqual(themed.values, { density: 1.1 });
  assert.deepEqual(themed.valuesByTheme, { light: { graphic: 'bars' }, dark: {} });
  assert.match(read('src/store.tsx'), /mergeDesignValues\(A, s\.design\.values, s\.design\.valuesByTheme, s\.theme, patch\.values\)/);
});

test('the type specimen reads the active theme default for typefaces and change detection', () => {
  const design = read('src/components/studio/design.tsx');
  assert.doesNotMatch(design, /\?\? p\.default\)/, 'no font fallback ignores defaultsByTheme');
  assert.match(design, /String\(values\[p\.id\] \?\? parameterDefault\(adapter, p, s\.theme\)\)/);
  assert.match(design, /!isDefault\(p, values\[p\.id\], parameterDefault\(adapter, p, theme\)\)/, 'typeChanged compares with the theme default');
  assert.match(design, /!typeChanged\(values, s\.theme\)/);
});

test('a snapped range value never passes the declared maximum', async () => {
  const { normalizeScenarioInput } = await loadPureTypeScript('src/studio/input.ts');
  const uneven = { id: 'n', label: 'N', control: 'range', min: 0, max: 10, step: 4 };
  assert.equal(normalizeScenarioInput(uneven, undefined, 10), 8, 'rounding up to 12 takes the last step inside the range');
  assert.equal(normalizeScenarioInput(uneven, undefined, 9), 8);
  assert.equal(normalizeScenarioInput(uneven, undefined, 5), 4);
  assert.equal(normalizeScenarioInput({ ...uneven, step: 3 }, undefined, 10), 9);
  assert.equal(normalizeScenarioInput({ id: 'h', label: 'H', control: 'range', min: 0, max: 24, step: 1 / 12 }, undefined, 24), 24, 'an exact maximum on a decimal grid stays');
  assert.equal(normalizeScenarioInput({ id: 'o', label: 'O', control: 'range', min: 1, max: 10, step: 4 }, undefined, 10), 9);
});

test('a generic font family stays unquoted in tokens and CSS', async () => {
  const { designDraft, fontFamilyValue } = await designModel();
  const adapter = {
    ...baseAdapter,
    tokens: { columns: ['light'], tokens: [{ name: '--font-sans', family: 'typography', values: { light: 'Inter, sans-serif' } }] },
    design: {
      parameters: [{ id: 'face', label: 'Face', kind: 'font', default: 'Inter', apply: { set: ['--font-sans'], css: 'body { font-family: $value; }' } }],
    },
  };
  const generic = designDraft(adapter, { face: 'system-ui' }, 'light');
  assert.equal(generic.tokens['--font-sans'], 'system-ui, Inter, sans-serif');
  assert.match(generic.css, /font-family: system-ui;/);
  const named = designDraft(adapter, { face: 'Georgia' }, 'light');
  assert.equal(named.tokens['--font-sans'], '"Georgia", Inter, sans-serif');
  assert.match(named.css, /font-family: "Georgia";/);
  assert.equal(fontFamilyValue('UI-Monospace'), 'UI-Monospace');
  assert.equal(fontFamilyValue('serif'), 'serif');
  assert.equal(fontFamilyValue('Times New Roman'), '"Times New Roman"');
});

test('a generic font family requests no web font stylesheet', async () => {
  const { designDraft, fontStylesheet } = await designModel();
  assert.equal(fontStylesheet('serif'), null);
  assert.equal(fontStylesheet(' Monospace '), null);
  assert.equal(fontStylesheet('ui-rounded'), null);
  assert.match(fontStylesheet('Space Grotesk'), /family=Space\+Grotesk&display=swap$/);
  const adapter = {
    ...baseAdapter,
    tokens: { columns: ['light'], tokens: [{ name: '--font-sans', family: 'typography', values: { light: 'Inter, sans-serif' } }] },
    design: { parameters: [{ id: 'face', label: 'Face', kind: 'font', default: 'Inter', apply: { set: ['--font-sans'] } }] },
  };
  assert.deepEqual(designDraft(adapter, { face: 'serif' }, 'light').stylesheets, []);
});

test('Design-only appearance inputs include defaults and never require an axes/component property', async () => {
  const { designDraft } = await designModel();
  const adapter = { axes: { themes: [{ id: 'light' }], inputs: [] }, design: { parameters: [
    { id: 'style', label: 'Icon style', kind: 'enum', default: 'stroke-rounded', choices: [{ id: 'stroke-rounded' }, { id: 'test-only-square' }], apply: { input: 'iconStyle', live: true } },
  ] } };
  assert.deepEqual(designDraft(adapter, {}, 'light').inputs, { iconStyle: 'stroke-rounded' });
  assert.deepEqual(designDraft(adapter, { style: 'test-only-square' }, 'light').inputs, { iconStyle: 'test-only-square' });
  assert.deepEqual(adapter.axes.inputs, []);
});
