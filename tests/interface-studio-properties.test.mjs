import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const shell = new URL('../metamodern-interface-studio/assets/studio-shell/', import.meta.url);

/** Load pure shell modules that import each other: strip types, point relative imports at the stripped copies. */
async function loadPure(names) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-properties-'));
  for (const name of names) {
    const source = readFileSync(new URL(`src/studio/${name}.ts`, shell), 'utf8');
    const js = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"');
    writeFileSync(join(dir, `${name}.mjs`), js);
  }
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await import(pathToFileURL(join(dir, `${name}.mjs`)).href)])));
}

const { input } = await loadPure(['input']);
const { normalizeScenarioInput, RESERVED_LINK_KEYS } = input;

const card = { id: 'card', label: 'Card', area: 'c', surface: 'Task card', description: '', fixture: { id: 'f', version: '1', provenance: 'p' }, source: 's', clock: 'c', designed: { done: false } };
const list = { ...card, id: 'list', surface: 'Task list', designed: undefined };
const props = (extra) => ({ section: 'properties', surfaces: ['Task card'], ...extra });
const inputs = [
  { id: 'density', label: 'Density', control: 'presets', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], placement: 'dock' },
  props({ id: 'note', label: 'Note', control: 'text', multiline: true }),
  props({ id: 'title', label: 'Title', control: 'text', curated: true, shareable: true, maxLength: 10 }),
  props({ id: 'done', label: 'Done', control: 'switch', curated: true }),
  props({ id: 'who', label: 'Who', control: 'choice', options: [{ id: 'sam', label: 'Sam' }, { id: 'kim', label: 'Kim' }] }),
  props({ id: 'hours', label: 'Hours', control: 'number', min: 0, max: 40, presets: [{ value: 1, label: '1 h' }] }),
  props({ id: 'points', label: 'Points', control: 'number' }),
  props({ id: 'onOpen', label: 'On open', control: 'text', readonly: true }),
];
const byId = (id) => inputs.find((i) => i.id === id);

test('switches, text, numbers and choices normalize; booleans stay booleans; readonly takes nothing', () => {
  const done = byId('done');
  assert.equal(normalizeScenarioInput(done, card, true), true);
  assert.equal(normalizeScenarioInput(done, card, 'false'), false);
  assert.equal(normalizeScenarioInput(done, card, 'yes'), undefined);
  assert.equal(normalizeScenarioInput(done, card, 1), undefined);
  const title = byId('title');
  assert.equal(normalizeScenarioInput(title, card, 'Short'), 'Short');
  assert.equal(normalizeScenarioInput(title, card, 'Much too long'), undefined, 'maxLength');
  assert.equal(normalizeScenarioInput(title, card, 'two\nlines'), undefined, 'single line');
  assert.equal(normalizeScenarioInput(byId('note'), card, 'two\nlines'), 'two\nlines');
  assert.equal(normalizeScenarioInput(title, card, 5), undefined);
  const hours = byId('hours');
  assert.equal(normalizeScenarioInput(hours, card, '3.5'), 3.5);
  assert.equal(normalizeScenarioInput(hours, card, 41), undefined);
  assert.equal(normalizeScenarioInput(hours, card, ''), undefined);
  assert.equal(normalizeScenarioInput(byId('points'), card, -1e6), -1e6, 'a number without bounds takes any finite value');
  assert.equal(normalizeScenarioInput(byId('who'), card, 'kim'), 'kim');
  assert.equal(normalizeScenarioInput(byId('who'), card, 'ana'), undefined);
  assert.equal(normalizeScenarioInput(byId('who'), { ...card, supports: { who: ['sam'] } }, 'kim'), undefined);
  assert.equal(normalizeScenarioInput(byId('onOpen'), card, 'x'), undefined);
});

test('a range still snaps to its last in-range step when the range is not a whole number of steps (0.10.2)', () => {
  const range = { id: 'r', label: 'R', control: 'range', min: 0, max: 10, step: 4 };
  assert.equal(normalizeScenarioInput(range, card, 10), 8);
  assert.equal(normalizeScenarioInput(range, card, '9'), 8);
  assert.equal(normalizeScenarioInput(range, card, 5), 4);
  assert.equal(normalizeScenarioInput(range, card, 11), undefined);
  assert.equal(normalizeScenarioInput({ ...range, max: undefined }, card, 4), undefined, 'a range needs both bounds');
});

test('a property whose ID is a reserved link key is rejected with a clear error', (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  for (const key of ['view', 'scenario', 'theme', 'profile', 'size', 'tab', 'design', 'layout', 'frames', 'height', 'arrange', 'vp', 'sync', 'edited']) {
    assert.ok(RESERVED_LINK_KEYS.includes(key), key);
  }
  const size = props({ id: 'size', label: 'Size', control: 'number' });
  assert.equal(normalizeScenarioInput(size, card, 3), undefined);
  assert.equal(normalizeScenarioInput(size, card, 4), undefined);
  assert.equal(errors.length, 1, 'reported once per input');
  assert.match(errors[0], /"size".*reserved link key/);
  // Scenario inputs outside Properties keep their 0.10.2 behavior.
  assert.equal(normalizeScenarioInput({ id: 'theme', label: 'T', control: 'select', options: [{ id: 'x', label: 'X' }] }, card, 'x'), 'x');
  assert.equal(list.surface, 'Task list');
});
