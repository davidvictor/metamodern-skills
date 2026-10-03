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

const { input, properties, scenarios } = await loadPure(['input', 'saved', 'properties', 'scenarios']);
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

test('a property with a reserved link key gets no row and is named once in the console', (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const reserved = [...inputs, props({ id: 'vp', label: 'Viewport', control: 'switch' })];
  assert.deepEqual(properties.propertiesFor(reserved, card).map((i) => i.id), ['title', 'done', 'note', 'who', 'hours', 'points', 'onOpen']);
  properties.propertiesFor(reserved, card);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"vp".*reserved link key/);
});

test('stored local text passes the same normalization as a link: stale, corrupt or readonly values are dropped', () => {
  const stored = { note: 'two\nlines ok', onOpen: 'stored', title: 'Kept?' };
  const out = properties.editsFromLink(inputs, card, () => null, stored, true);
  assert.deepEqual(out.edits, { note: 'two\nlines ok' }, 'readonly onOpen is not restored; shareable title only comes from the link');
  assert.equal(out.missing, false);
  const corrupt = properties.editsFromLink(inputs, card, () => null, { note: { not: 'text' } }, true);
  assert.deepEqual(corrupt, { edits: {}, missing: true }, 'corrupt storage is dropped, so the note says the sender had edits this browser does not hold');
  const tooLong = properties.editsFromLink([props({ id: 'memo', label: 'Memo', control: 'text', maxLength: 3 })], card, () => null, { memo: 'longer' }, true);
  assert.deepEqual(tooLong, { edits: {}, missing: true });
});

test('linkEdits round-trips through a URL to editsFromLink, keeping false and decimals', () => {
  const edits = { done: false, hours: 2.5, points: -0.25, who: 'kim', title: 'Hi there' };
  const { params, local } = properties.linkEdits(inputs, card, edits);
  assert.equal(local, false);
  const link = new URLSearchParams(new URLSearchParams(params).toString());
  const back = properties.editsFromLink(inputs, card, (id) => link.get(id), {}, false);
  assert.deepEqual(back, { edits, missing: false });
  assert.strictEqual(back.edits.done, false, 'false reads back as a boolean, not the string "false"');
});

test('linkEdits writes only values that still normalize, so a stale stored edit never reaches a link', () => {
  assert.deepEqual(properties.linkEdits(inputs, card, { done: 'maybe', hours: 99, who: 'ana', onOpen: 'x', title: 'ok' }), { params: [['title', 'ok']], local: false });
});

test('keptEdits keeps only a scenario\'s own properties at values that normalize', () => {
  assert.deepEqual(properties.keptEdits(inputs, card, { done: 'true', hours: 3, density: 'b', onOpen: 'x', who: { id: 'kim' }, gone: 1 }), { done: true, hours: 3 });
  assert.deepEqual(properties.keptEdits(inputs, list, { done: true }), {}, 'a surface the property does not apply to');
  assert.deepEqual(properties.keptEdits(inputs, card, null), {});
  assert.deepEqual(properties.keptEdits(inputs, card, ['done']), {});
});

test('a link shows its own state but keeps this browser\'s stored edits for that scenario until the person edits there', () => {
  const { storedEdits } = properties;
  const props = { card: { done: true }, list: { done: false } };
  // No link: everything is written as it is.
  assert.deepEqual(storedEdits(props, null), props);
  // The link set the card's edits; the stored note is written back unchanged, not the link's state.
  assert.deepEqual(storedEdits(props, { scenario: 'card', stored: { note: 'Private note', done: false } }), { card: { note: 'Private note', done: false }, list: { done: false } });
  // Nothing was stored for the linked scenario: the link's edits are not written either.
  assert.deepEqual(storedEdits(props, { scenario: 'card' }), { list: { done: false } });
  assert.deepEqual(storedEdits(props, { scenario: 'card', stored: {} }), { list: { done: false } });
  // The input is not changed.
  assert.deepEqual(props, { card: { done: true }, list: { done: false } });
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

test('a hand-edited scenarios.json adds only usable saved states, with only their base\'s own property values', () => {
  const child = { ...card, id: 'card.done', parent: 'card', state: 'Done', designed: { done: true } };
  const scoped = { id: 'mode', label: 'Mode', control: 'switch', surfaces: ['Task card'] };
  const all = [...inputs, scoped];
  const usable = properties.usableSaved([card, child, list], [
    { id: 'saved.ok', label: 'Ok', base: 'card', values: { done: true, mode: true, hours: 'x', note: 'Hi' } },
    { id: 'card.other', label: 'No prefix', base: 'card', values: {} },
    { id: 'saved.nolabel', base: 'card', values: {} },
    { id: 'saved.blank', label: '  ', base: 'card', values: {} },
    { id: 'saved.numlabel', label: 4, base: 'card', values: {} },
    { id: 'saved.ok', label: 'Repeat', base: 'card', values: {} },
    { id: 'saved.gone', label: 'Gone', base: 'missing', values: {} },
    { id: 'saved.chain', label: 'Chain', base: 'saved.ok', values: {} },
    { id: 'saved.bad', label: 'Bad values', base: 'card', values: [] },
    null,
  ], all);
  assert.deepEqual(usable.map((x) => x.id), ['saved.ok']);
  assert.deepEqual(usable[0].values, { done: true, note: 'Hi' }, 'a non-property input stays off and a stale value is dropped');
  const catalog = properties.withSaved([card, child, list], usable);
  assert.equal(catalog.find((x) => x.id === 'saved.ok').designed.mode, undefined);
  assert.deepEqual(properties.usableSaved([card], undefined, all), []);
  assert.deepEqual(properties.usableSaved([card], { not: 'a list' }, all), []);
});

test('usableSaved applies the same per-entry limits as studio-scenarios/1, so a skipped entry never blocks a save', () => {
  const ok = { id: 'saved.ok', label: 'Ok', base: 'card', values: { done: true } };
  const keep = (entry) => properties.usableSaved([card], [entry], inputs).map((x) => x.id);
  assert.deepEqual(keep(ok), ['saved.ok']);
  assert.deepEqual(keep({ ...ok, id: 'saved.Bad ID' }), [], 'the ID pattern');
  assert.deepEqual(keep({ ...ok, id: `saved.${'a'.repeat(65)}` }), [], 'the ID length');
  assert.deepEqual(keep({ ...ok, id: 'saved.-x' }), [], 'the ID starts with a letter or digit');
  assert.deepEqual(properties.usableSaved([card, { ...card, id: 'saved.ok' }], [ok], inputs), [], 'a generated ID is never taken over');
  assert.deepEqual(keep({ ...ok, label: 'x'.repeat(81) }), [], 'a label over 80 characters');
  assert.deepEqual(keep({ ...ok, label: 'x'.repeat(80) }), ['saved.ok']);
  const [long] = properties.usableSaved([card], [{ ...ok, description: 'd'.repeat(401) }], inputs);
  assert.equal(long.description, undefined, 'a description over 400 characters is dropped, the state kept');
  assert.equal(properties.usableSaved([card], [{ ...ok, description: 'Why' }], inputs)[0].description, 'Why');
  const [text] = properties.usableSaved([card], [{ ...ok, values: { note: 'n'.repeat(4001), done: true } }], inputs);
  assert.deepEqual(text.values, { done: true }, 'text over 4,000 characters is dropped');
  const usable = properties.usableSaved([card], [ok, { ...ok, id: 'saved.bad', label: '' }, { ...ok, id: 'saved.two', description: 'd'.repeat(500), values: { note: 'n'.repeat(4001) } }], inputs);
  assert.deepEqual(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: usable }, ['card']), [], 'what is kept always saves');
});

test('a saved-state ID never ends in a hyphen', () => {
  const id = scenarios.savedId(`${'a'.repeat(47)} b`, []);
  assert.equal(id, `saved.${'a'.repeat(47)}`);
  assert.doesNotMatch(scenarios.savedId(`${'x'.repeat(47)}!!!!yz`, []), /-$/);
  assert.equal(scenarios.savedId('!!!', []), 'saved.state');
  assert.deepEqual(scenarios.validateScenarios({ schema: 'studio-scenarios/1', scenarios: [{ id: scenarios.savedId(`${'a'.repeat(47)} b`, []), label: 'A', base: 'card', values: {} }] }), []);
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
