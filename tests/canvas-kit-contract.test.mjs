import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  kitComponentNames,
  validateKitFolder,
  validateKitGlobal,
  validateKitManifest,
  validateTokens,
  writeKitManifest,
} from '../metamodern-work-on-canvases/scripts/kit-contract.mjs';

const manifest = () => ({
  schema: 'canvas-kit/1',
  namespace: 'Kit',
  version: '2026.10.20',
  source: { repo: 'owner/app', commit: 'a'.repeat(40), dirty: false },
  inputs: ['packages/ui/**', 'tooling/canvas-kit/**'],
  builtAt: '2026-10-20T12:00:00.000Z',
  react: '19.3.0',
});
const fixtureTokens = () => fs.readFile('metamodern-work-on-canvases/assets/fixture-kit/src/tokens.json', 'utf8').then(JSON.parse);

test('KC-01 kit.json (canvas-kit/1)', () => {
  assert.deepEqual(validateKitManifest(manifest()), []);
  const live = manifest();
  live.source = { repo: 'owner/app', commit: 'b'.repeat(40), dirty: true, branch: 'claude/lab-buttons' };
  assert.deepEqual(validateKitManifest(live), []);
  const bad = { ...manifest(), schema: 'canvas-kit/2', namespace: 'my-kit', source: { repo: 'app', commit: 'abc', dirty: true }, inputs: [], builtAt: 'yesterday', react: '18.3.1' };
  const issues = validateKitManifest(bad).join('\n');
  for (const expected of ['schema must be canvas-kit/1', 'namespace must be', 'source.repo must be owner/name', 'source.commit must be 40', 'a live build (dirty) names its branch', 'inputs must list', 'builtAt must be', 'react must be a 19.x']) {
    assert.ok(issues.includes(expected), expected);
  }
});

test('KC-02 tokens.json (canvas-tokens/1): resolved values only', async () => {
  const tokens = await fixtureTokens();
  assert.deepEqual(validateTokens(tokens), []);
  tokens.themes.light.accent.value = 'var(--brand)';
  tokens.themes.dark.border = { value: 'color-mix(in oklch, red, blue)' };
  tokens.themes.sepia = {};
  delete tokens.motion;
  tokens.space.push({ value: '4px' });
  const issues = validateTokens(tokens).join('\n');
  for (const expected of ['themes.light.accent: value must be resolved', 'themes.dark.border: value must be resolved', 'unknown theme sepia', 'motion must be an array', 'space[2]: name must be']) {
    assert.ok(issues.includes(expected), expected);
  }
});

test('KC-03 the kit global: version, mount, Root, Scene, scenes and sample', () => {
  const component = () => null;
  const kit = {
    version: '1', mount: () => () => {}, Root: component, Scene: { $$typeof: Symbol.for('react.memo') }, sample: {},
    scenes: [{ id: 'home', title: 'Home', area: 'home', states: [{ id: 'filled', label: 'Filled' }], viewports: ['desktop', 'phone'] }],
    Button: component, helper: 1,
  };
  assert.deepEqual(validateKitGlobal(kit, 'Kit'), []);
  assert.deepEqual(kitComponentNames(kit), ['Root', 'Scene', 'Button']);
  const issues = validateKitGlobal({ version: '', scenes: [{ id: 'a', title: '', area: 'x', states: [], viewports: ['tablet'] }, { id: 'a' }] }, 'Kit').join('\n');
  for (const expected of ['version must be', 'mount must be a function', 'Root must be a component', 'Scene must be a component', 'sample must be defined', 'scenes[0].title', 'scenes[0].states', 'scenes[0].viewports', 'scenes[1].id a is a duplicate']) {
    assert.ok(issues.includes(expected), expected);
  }
  assert.deepEqual(validateKitGlobal(undefined, 'Kit'), ['window.Kit: is not defined']);
});

test('KC-04 a kit folder: required files, and kit.json written last', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-kit-'));
  try {
    assert.match((await validateKitFolder(dir)).join('\n'), /legacy kit/);
    await fs.mkdir(path.join(dir, 'components'));
    for (const file of ['components/bundle.js', 'components/bundle.css', 'components/index.d.ts']) await fs.writeFile(path.join(dir, file), '');
    await fs.writeFile(path.join(dir, 'tokens.json'), JSON.stringify(await fixtureTokens()));
    await writeKitManifest(dir, manifest());
    assert.deepEqual(await validateKitFolder(dir), []);
    const later = new Date(Date.now() + 5000);
    await fs.utimes(path.join(dir, 'components', 'bundle.js'), later, later);
    assert.match((await validateKitFolder(dir)).join('\n'), /components\/bundle\.js: written after kit\.json/);
    await assert.rejects(writeKitManifest(dir, { ...manifest(), react: '18' }), /react must be a 19\.x/);
    assert.deepEqual((await fs.readdir(dir)).filter((f) => f.startsWith('.kit.json')), [], 'no temporary file left');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
