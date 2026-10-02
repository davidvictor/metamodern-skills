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

const { input, properties, scenarios } = await loadPure(['input', 'properties', 'scenarios']);
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

test('properties apply to their surfaces, curated first, in declaration order', () => {
  assert.deepEqual(properties.propertiesFor(inputs, card).map((i) => i.id), ['title', 'done', 'note', 'who', 'hours', 'points', 'onOpen']);
  assert.deepEqual(properties.propertiesFor(inputs, list), []);
  assert.equal(properties.appliesTo(byId('density'), list), true, 'an input without surfaces applies everywhere');
  assert.equal(properties.isProperty(byId('density')), false);
});

test('links carry every value except text that is not shareable, which leaves edited=local', () => {
  const { params, local } = properties.linkEdits(inputs, card, { title: 'Hi', done: true, note: 'secret', hours: 2, who: 'kim' });
  assert.deepEqual(params, [['title', 'Hi'], ['done', 'true'], ['who', 'kim'], ['hours', '2']]);
  assert.equal(local, true);
  assert.deepEqual(properties.linkEdits(inputs, card, { done: false }), { params: [['done', 'false']], local: false });
  assert.deepEqual(properties.linkEdits(inputs, list, { done: true }), { params: [], local: false }, 'nothing travels for a surface without properties');
});

test('a link sets the linked scenario: values that travel from the link, local text only with edited=local', () => {
  const link = new URLSearchParams('title=Hi&done=true&hours=99&who=kim&note=leaked');
  const get = (id) => link.get(id);
  const sender = properties.editsFromLink(inputs, card, get, { note: 'mine', done: false }, true);
  assert.deepEqual(sender.edits, { title: 'Hi', done: true, note: 'mine', who: 'kim' }, 'hours=99 is out of bounds; note never comes from a link');
  assert.equal(sender.missing, false);
  const recipient = properties.editsFromLink(inputs, card, get, {}, true);
  assert.deepEqual(recipient.edits, { title: 'Hi', done: true, who: 'kim' });
  assert.equal(recipient.missing, true, 'the sender had local edits this browser does not hold');
  const plain = properties.editsFromLink(inputs, card, () => null, { note: 'mine', done: true }, false);
  assert.deepEqual(plain, { edits: {}, missing: false }, 'a link without property values shows the designed state');
});

test('a property with a reserved link key never travels in links, in either direction', (t) => {
  t.mock.method(console, 'error', () => {});
  const reserved = [...inputs, props({ id: 'view', label: 'View', control: 'switch' }), props({ id: 'theme', label: 'Theme', control: 'text' })];
  const out = properties.linkEdits(reserved, card, { done: true, view: true, theme: 'dark' });
  assert.deepEqual(out, { params: [['done', 'true']], local: false }, 'neither the link key nor the edited=local marker comes from a reserved property');
  const link = new URLSearchParams('done=true&view=true');
  const back = properties.editsFromLink(reserved, card, (id) => link.get(id), { theme: 'dark' }, true);
  assert.deepEqual(back.edits, { done: true });
  assert.equal(back.missing, true);
});

test('Compare offers switches, selects, choices and numbers with presets; never text', () => {
  const eligible = inputs.filter(properties.comparable).map((i) => i.id);
  assert.deepEqual(eligible, ['density', 'done', 'who', 'hours']);
  assert.deepEqual(properties.axisValues(byId('done')), [{ id: 'false', label: 'Off' }, { id: 'true', label: 'On' }]);
  assert.deepEqual(properties.axisValues(byId('hours')), [{ id: '1', label: '1 h' }]);
  assert.deepEqual(properties.axisValues(byId('who')), [{ id: 'sam', label: 'Sam' }, { id: 'kim', label: 'Kim' }]);
});

test('saved states join the catalog after their surface, nested under the base, rendering the base', () => {
  const child = { ...card, id: 'card.done', parent: 'card', state: 'Done', designed: { done: true } };
  const other = { ...list, id: 'other' };
  const catalog = properties.withSaved([card, child, other], [
    { id: 'saved.big', label: 'Big', base: 'card.done', values: { hours: 4 } },
    { id: 'saved.gone', label: 'Gone', base: 'missing', values: {} },
    { id: 'card', label: 'Clash', base: 'card', values: {} },
  ]);
  assert.deepEqual(catalog.map((x) => x.id), ['card', 'card.done', 'saved.big', 'other']);
  const saved = catalog[2];
  assert.equal(saved.savedFrom, 'card.done');
  assert.equal(saved.parent, 'card');
  assert.deepEqual(saved.designed, { done: true, hours: 4 });
  assert.equal(saved.captures, undefined, 'a capture proves only the state it recorded');
});

test('studio-scenarios/1 accepts saved states and refuses what it should', () => {
  const ok = { schema: 'studio-scenarios/1', scenarios: [{ id: 'saved.big', label: 'Big', base: 'card', values: { done: true, hours: 4, title: 'Hi' } }] };
  assert.deepEqual(scenarios.validateScenarios(ok), []);
  assert.match(scenarios.validateScenarios({ ...ok, schema: 'x' })[0], /schema/);
  assert.match(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [{ ...ok.scenarios[0], id: 'card' }] }).join(), /saved\./);
  assert.match(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [{ ...ok.scenarios[0], id: 'saved.card' }] }, ['saved.card']).join(), /cannot be overwritten/);
  assert.match(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [ok.scenarios[0], ok.scenarios[0]] }).join(), /repeated/);
  assert.match(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [{ ...ok.scenarios[0], values: { fn: {} } }] }).join(), /values\.fn/);
  assert.match(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [{ ...ok.scenarios[0], base: 'saved.big' }] }).join(), /base/);
  assert.equal(scenarios.savedId('Big card!', ['saved.big-card']), 'saved.big-card-2');
});
