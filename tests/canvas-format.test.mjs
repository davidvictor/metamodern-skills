import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  boardKit,
  isFrozen,
  parseViewerLink,
  readCanvas,
  readConfig,
  readLiveKits,
  validateCanvas,
  validateConfig,
  validateLiveKits,
  viewerLink,
} from '../metamodern-work-on-canvases/scripts/canvas-format.mjs';

const PROJECT = path.resolve('metamodern-work-on-canvases/assets/fixture-project');
const canvas = () => ({
  v: 3,
  title: 'Fixture canvas',
  launch: { view: 'canvas', page: 'one' },
  pages: [{ id: 'one', name: 'One' }],
  boards: { 'a.dc.html': { x: 0, y: 0, w: 100, h: 80, title: 'A', page: 'one' } },
  order: ['a.dc.html'],
});

test('CF-01 the fixture canvases and config are valid', async () => {
  for (const id of ['fixture', 'legacy']) {
    const read = await readCanvas(path.join(PROJECT, 'canvases', id));
    assert.equal(read.v, 3);
  }
  const config = await readConfig(PROJECT);
  assert.equal(config.kit.namespace, 'Fixture');
});

test('CF-02 canvas.json keeps older fields and accepts the ws additions', () => {
  const c = canvas();
  c.createdOnFiles = { v: 1, at: '2026-10-17T00:00:00Z' };
  c.notes = { title: { x: 0, y: -300, text: 'Notes stay', kind: 'title1' } };
  c.designSystems = [];
  c.ws = { group: 'exploring', frozen: false };
  c.boards['a.dc.html'].ws = { set: 'table-header', row: 'deciding', kit: 'live:table-work' };
  c.boards['a.dc.html'].expand = 'fill';
  c.boards['a.dc.html'].is_interactive = true;
  assert.deepEqual(validateCanvas(c), []);
});

test('CF-03 canvas.json problems are named', () => {
  const c = canvas();
  c.v = 2;
  c.boards['a.dc.html'].w = 0;
  c.boards['a.dc.html'].page = 'missing';
  c.boards['../x.dc.html'] = { x: 0, y: 0, w: 1, h: 1 };
  c.boards['a.dc.html'].ws = { row: 'someday', kit: 'live:Bad Name' };
  c.order.push('ghost.dc.html');
  c.ws = { group: 'misc' };
  const issues = validateCanvas(c).join('\n');
  assert.match(validateCanvas({ ...canvas(), pages: [], boards: {}, order: [], launch: { view: 'canvas', page: 'gone' } }).join('\n'), /launch\.page gone is not a page/);
  for (const expected of ['v must be 3', '.w must be positive', '.page must name a page', 'must name a <board>.dc.html', '.row must be one of', '.kit must be', 'order names ghost.dc.html', 'ws.group must be one of']) {
    assert.match(issues, new RegExp(expected.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&')));
  }
});

test('CF-04 frozen canvases: ws.frozen, or a History: or Decided: title', () => {
  assert.equal(isFrozen({ title: 'History: the first chat', ws: { group: 'archive' } }), true);
  assert.equal(isFrozen({ title: 'Decided: inputs' }), true);
  assert.equal(isFrozen({ title: 'Inputs', ws: { group: 'decided', frozen: true } }), true);
  assert.equal(isFrozen({ title: 'Inputs history' }), false);
  assert.equal(isFrozen({ title: 'Inputs', ws: { group: 'exploring', frozen: false } }), false);
});

test('CF-05 a board uses the pinned kit unless its ws.kit or an override names a live kit', () => {
  const c = canvas();
  assert.equal(boardKit(c, 'a.dc.html'), 'pinned');
  c.boards['a.dc.html'].ws = { kit: 'live:table-work' };
  assert.equal(boardKit(c, 'a.dc.html'), 'live:table-work');
  assert.equal(boardKit(c, 'a.dc.html', 'pinned'), 'pinned');
  assert.equal(boardKit(c, 'a.dc.html', 'live:../x'), 'pinned');
});

test('CF-06 canvas.config.json (canvas-config/1)', () => {
  const good = {
    schema: 'canvas-config/1', name: 'Design', canvases: 'canvases', kit: { namespace: 'Kit', pinned: 'kit/current' },
    skin: 'skin/board.css', port: 5410, groups: ['foundations', 'lab', 'app', 'exploring', 'decided', 'archive'],
  };
  assert.deepEqual(validateConfig(good), []);
  const bad = { ...good, schema: 'canvas-config/2', kit: { namespace: 'my-kit', pinned: '../kit' }, skin: '/abs.css', port: 70000, groups: ['lab', 'other'] };
  const issues = validateConfig(bad).join('\n');
  for (const expected of ['schema must be canvas-config/1', 'kit.namespace must be', 'kit.pinned must be a relative path', 'skin must be a relative path', 'port must be', 'unknown group other']) {
    assert.ok(issues.includes(expected), expected);
  }
});

test('CF-07 live kits: a missing registry is empty; entries map names to absolute folders', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-live-'));
  try {
    assert.deepEqual(await readLiveKits(dir), {});
    await fs.mkdir(path.join(dir, '.canvas'));
    await fs.writeFile(path.join(dir, '.canvas', 'live.json'), JSON.stringify({ 'table-work': path.join(dir, 'kit') }));
    assert.deepEqual(Object.keys(await readLiveKits(dir)), ['table-work']);
    assert.match(validateLiveKits({ 'Bad Name': 'kit' }).join('\n'), /lowercase letters[\s\S]*absolute path/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('CF-08 viewer links follow the fixed scheme and read back', () => {
  assert.equal(viewerLink(), '/');
  assert.equal(viewerLink({ canvas: 'app' }), '/app/');
  assert.equal(viewerLink({ canvas: 'app', page: 'contracts' }), '/app/contracts/');
  assert.equal(viewerLink({ canvas: 'app', page: 'contracts', board: 'table-header.dc.html' }), '/app/contracts/table-header');
  assert.equal(viewerLink({ canvas: 'starter', board: 'Main.dc.html' }), '/starter/-/Main');
  assert.deepEqual(parseViewerLink('/'), {});
  assert.deepEqual(parseViewerLink('/app/'), { canvas: 'app' });
  assert.deepEqual(parseViewerLink('/app'), { canvas: 'app' });
  assert.deepEqual(parseViewerLink('/app/contracts/'), { canvas: 'app', page: 'contracts' });
  assert.deepEqual(parseViewerLink('/starter/-/Main'), { canvas: 'starter', page: null, board: 'Main.dc.html' });
  assert.equal(parseViewerLink('/a/b/c/d'), null);
  assert.equal(parseViewerLink('relative'), null);
});

test('CF-09 home and panel facts: ws.about, ws.icon, a board\'s ws.facts and the config\'s groupNames', () => {
  const good = { ...canvas(), ws: { group: 'lab', about: 'Buttons and toggles.', icon: 'icons/actions.svg' } };
  good.boards['a.dc.html'].ws = { facts: [{ label: 'Scene', text: 'button · rest' }, { label: 'Source', text: 'src/button.tsx', href: 'https://example.com/src/button.tsx' }, { label: 'Page', text: 'Frame', href: '/app/frame/' }] };
  assert.deepEqual(validateCanvas(good), []);
  for (const [ws, expected] of [
    [{ group: 'lab', about: ' ' }, 'ws.about must be a non-empty string'],
    [{ group: 'lab', icon: '../icon.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: '/icon.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: 'icon.png' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: 'support/icon.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: 'ds/kit/icon.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: 'C:icon.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
    [{ group: 'lab', icon: 'icons\\a.svg' }, 'ws.icon must be the path of an .svg file inside project/'],
  ]) assert.ok(validateCanvas({ ...canvas(), ws }).join('\n').includes(expected), JSON.stringify(ws));
  for (const [facts, expected] of [
    ['Scene', '.facts must be an array'],
    [[{ label: '', text: 'x' }], '.facts[0] must be {label, text, href?}'],
    [[{ label: 'Scene' }], '.facts[0] must be {label, text, href?}'],
    [[{ label: 'Source', text: 'x', href: 'javascript:alert(1)' }], '.facts[0].href must be an http(s) link or a path on the viewer'],
    [[{ label: 'Source', text: 'x', href: '//elsewhere.example/x' }], '.facts[0].href must be an http(s) link or a path on the viewer'],
    [[{ label: 'Source', text: 'x', href: '/\\elsewhere.example/x' }], '.facts[0].href must be an http(s) link or a path on the viewer'],
  ]) {
    const bad = canvas();
    bad.boards['a.dc.html'].ws = { facts };
    assert.ok(validateCanvas(bad).join('\n').includes(expected), JSON.stringify(facts));
  }
  const config = {
    schema: 'canvas-config/1', name: 'Design', canvases: 'canvases', kit: { namespace: 'Kit', pinned: 'kit/current' },
    skin: 'skin/board.css', port: 5410, groups: ['app', 'foundations', 'lab'],
  };
  assert.deepEqual(validateConfig({ ...config, groupNames: { lab: 'Components' } }), []);
  const issues = validateConfig({ ...config, groupNames: { lab: '', other: 'Other' } }).join('\n');
  assert.ok(issues.includes('groupNames.lab must be a non-empty string'));
  assert.ok(issues.includes('groupNames names unknown group other'));
  assert.ok(validateConfig({ ...config, groupNames: ['Components'] }).join('\n').includes('groupNames must be an object'));
});
