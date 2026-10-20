// Board builder tests (no browser): board shells, layout, determinism, heights, what a build may touch, and the
// render check's theme variants.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  GENERATED_MARK, boardShell, buildCanvas, fittedHeight, isGenerated, layoutCanvas, writeHeights,
} from '../metamodern-work-on-canvases/scripts/board-builder.mjs';
import { validateCanvas } from '../metamodern-work-on-canvases/scripts/canvas-format.mjs';
import { readControls, renderCheck, themeVariants, variantName } from '../metamodern-work-on-canvases/scripts/render-check.mjs';
import { buildShowcase } from '../metamodern-work-on-canvases/assets/fixture-builder/showcase.mjs';
import { fixtureProject } from './canvas-fixture.mjs';


async function tree(dir) {
  const out = {};
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath ?? entry.path, entry.name);
    out[path.relative(dir, file)] = await fs.readFile(file, 'utf8');
  }
  return out;
}

test('BB-01 a board shell carries the facts, labels, controls and head loads', () => {
  const html = boardShell({
    title: 'Buttons <in> "quotes"', kind: 'component', page: 'buttons', row: 'live', set: 'buttons-states', source: 'src/button.tsx',
    width: 1200, height: 480, namespace: 'Fixture', themes: ['light', 'dark'], contrast: true, where: 'Buttons', summary: 'Every state',
    tags: ['Live'], body: '<x-import component-from-global-scope="Fixture.Button">Save</x-import>', foot: [['Source', '<code>src/button.tsx</code>']],
  });
  assert.ok(isGenerated(html));
  assert.ok(html.includes(`<meta name="generator" content="${GENERATED_MARK}">`));
  const head = html.slice(0, html.indexOf('</head>'));
  const order = ['./support.js', 'skin.css', 'ds/fixture/components/bundle.css', 'ds/fixture/components/bundle.js'].map((s) => head.indexOf(s));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'support.js, the skin, then the kit');
  assert.ok(order.every((i) => i > 0));
  assert.match(html, /<title>Buttons &lt;in&gt; &quot;quotes&quot;<\/title>/);
  for (const fact of ['data-kind="component"', 'data-page="buttons"', 'data-row="live"', 'data-set="buttons-states"', 'data-source="src/button.tsx"', 'data-kit="pinned"', 'data-theme="{{theme}}"', 'data-contrast="{{contrast}}"']) assert.ok(html.includes(fact), fact);
  for (const label of ['board', 'board-head', 'board-stage', 'board-foot']) assert.ok(html.includes(`data-canvas-id="${label}"`), label);
  assert.match(html, /<x-import component-from-global-scope="Fixture.Root" theme="\{\{theme\}\}" contrast="\{\{contrast\}\}">/);
  const controls = readControls(html);
  assert.deepEqual(controls.theme.options, ['light', 'dark']);
  assert.deepEqual(controls.contrast.options, ['standard', 'high']);
  assert.deepEqual(controls.$preview, { width: 1200, height: 480 });
  assert.match(html, /style="width: 1200px; height: 480px;"/);
  assert.throws(() => boardShell({ title: 'x', kind: 'page', width: 0, height: 10 }), /width/);
});

test('BB-02 layout places headers, row banners, set cards and wrapping lines, with ws facts', () => {
  const b = (file, w = 3000) => ({ file, title: file, w, h: 400, shell: { kind: 'screen' } });
  const { canvas, boards } = layoutCanvas({
    title: 'Layout',
    ws: { group: 'app' },
    layout: { maxRowWidth: 7000 },
    pages: [{
      id: 'home', name: 'Home',
      rows: [
        { id: 'live', name: 'Live', boards: [b('A.dc.html'), b('B.dc.html'), b('C.dc.html')] },
        { id: 'deciding', name: 'Deciding', sets: [{ set: { id: 'one', title: 'One', status: 'ready', waits_on: [] }, boards: [b('D.dc.html', 800)] }] },
        { id: 'later', name: 'Later', sets: [] },
      ],
    }],
  });
  assert.deepEqual(validateCanvas(canvas), []);
  const at = Object.fromEntries(boards.map((x) => [x.file, x]));
  assert.deepEqual(Object.keys(at), ['P_home.dc.html', 'R_home_live.dc.html', 'A.dc.html', 'B.dc.html', 'C.dc.html', 'R_home_deciding.dc.html', 'S_one.dc.html', 'D.dc.html', 'R_home_later.dc.html']);
  assert.equal(at['A.dc.html'].x, 0);
  assert.equal(at['B.dc.html'].x, 3080);
  assert.equal(at['C.dc.html'].x, 0, 'C wraps to a new line');
  assert.ok(at['C.dc.html'].y > at['A.dc.html'].y);
  assert.equal(at['D.dc.html'].x, 680, 'set boards sit to the right of the set card');
  assert.equal(at['D.dc.html'].y, at['S_one.dc.html'].y);
  assert.deepEqual(canvas.boards['A.dc.html'].ws, { row: 'live' });
  assert.deepEqual(canvas.boards['D.dc.html'].ws, { row: 'deciding', set: 'one' });
  assert.deepEqual(canvas.boards['S_one.dc.html'].ws, { set: 'one', row: 'deciding' });
  assert.equal(canvas.boards['P_home.dc.html'].page, 'home');
  assert.deepEqual(canvas.ws, { group: 'app' });
  assert.throws(() => layoutCanvas({ title: 'x', pages: [{ id: 'p', name: 'P', boards: [b('A.dc.html'), b('A.dc.html')] }] }), /placed twice/);
});

test('BB-03 heights: the cache fits board heights, and writes are sorted and merged', async () => {
  assert.equal(fittedHeight(400, undefined), 400);
  assert.equal(fittedHeight(400, 311), 320);
  assert.equal(fittedHeight(400, 312), 320);
  assert.equal(fittedHeight(400, 313), 330);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-heights-'));
  try {
    assert.equal(await writeHeights(dir, { 'b.dc.html': 200, 'a.dc.html': 100.4 }), true);
    assert.equal(await writeHeights(dir, { 'a.dc.html': 100 }), false, 'the same heights write nothing');
    assert.equal(await fs.readFile(path.join(dir, 'tools', 'heights.json'), 'utf8'), '{\n  "a.dc.html": 100,\n  "b.dc.html": 200\n}\n');
    const { canvas } = layoutCanvas({ title: 'H', pages: [{ id: 'p', name: 'P', boards: [{ file: 'a.dc.html', title: 'A', w: 100, h: 500, shell: { kind: 'x' } }, { file: 'b.dc.html', title: 'B', w: 100, h: 500, fit: false, shell: { kind: 'x' } }] }] }, { heights: { 'a.dc.html': 100, 'b.dc.html': 200 } });
    assert.equal(canvas.boards['a.dc.html'].h, 110);
    assert.equal(canvas.boards['b.dc.html'].h, 500, 'fit: false keeps its height');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('BB-04 the showcase build is deterministic: byte-identical in two folders, and a rerun writes nothing', async () => {
  const [a, b] = await Promise.all([fixtureProject(), fixtureProject()]);
  try {
    const first = await buildShowcase(a);
    await buildShowcase(b);
    assert.ok(first.written.length > 25);
    const ta = await tree(path.join(a, 'canvases', 'showcase'));
    const tb = await tree(path.join(b, 'canvases', 'showcase'));
    assert.deepEqual(Object.keys(ta).sort(), Object.keys(tb).sort());
    for (const file of Object.keys(ta)) assert.equal(ta[file], tb[file], file);
    const stat = await fs.stat(path.join(a, 'canvases', 'showcase', 'project', 'canvas.json'));
    const again = await buildShowcase(a);
    assert.deepEqual(again.written, []);
    assert.deepEqual(again.removed, []);
    assert.equal((await fs.stat(path.join(a, 'canvases', 'showcase', 'project', 'canvas.json'))).mtimeMs, stat.mtimeMs, 'canvas.json is not rewritten');
    const canvas = JSON.parse(ta[path.join('project', 'canvas.json')]);
    assert.deepEqual(validateCanvas(canvas), []);
    assert.deepEqual(canvas.pages.map((p) => p.id), ['foundations', 'buttons', 'tasks']);
    const rows = Object.values(canvas.boards).filter((x) => x.page === 'tasks' && x.ws?.row).map((x) => x.ws.row);
    for (const row of ['live', 'deciding', 'building', 'next', 'later']) assert.ok(rows.includes(row), row);
    assert.deepEqual(canvas.boards['D_due_badges.dc.html'].ws, { row: 'deciding', set: 'tasks-due-dates' });
    assert.deepEqual(canvas.boards['B_done_check.dc.html'].ws, { row: 'building', set: 'tasks-done' });
    assert.deepEqual(canvas.boards['N_bulk_move.dc.html'].ws, { row: 'next', set: 'tasks-bulk' });
    assert.deepEqual(canvas.boards['L_history.dc.html'].ws, { row: 'later', set: 'tasks-history' });
    assert.ok(ta[path.join('project', 'F_colour.dc.html')].includes('#2457c5'), 'Foundations colours come from the kit tokens');
  } finally {
    await Promise.all([a, b].map((d) => fs.rm(d, { recursive: true, force: true })));
  }
});

test('BB-05 a build touches only its own files: stale generated boards go, hand boards stay and are never overwritten', async () => {
  const root = await fixtureProject();
  try {
    const dir = path.join(root, 'canvases', 'showcase');
    await buildShowcase(root);
    const hand = path.join(dir, 'project', 'Notes.dc.html');
    await fs.writeFile(hand, '<!doctype html><title>Notes</title>');
    await fs.writeFile(path.join(dir, 'project', 'canvas.json'), JSON.stringify({ ...JSON.parse(await fs.readFile(path.join(dir, 'project', 'canvas.json'), 'utf8')), notes: { kept: true } }));
    // A set leaves the review: its generated boards are removed on the next build.
    const review = JSON.parse(await fs.readFile(path.join(root, 'review.json'), 'utf8'));
    review.sets = review.sets.filter((s) => s.id !== 'tasks-bulk');
    await fs.writeFile(path.join(root, 'review.json'), JSON.stringify(review));
    const result = await buildShowcase(root);
    assert.deepEqual(result.removed, ['N_bulk_move.dc.html', 'S_tasks-bulk.dc.html']);
    assert.equal(await fs.readFile(hand, 'utf8'), '<!doctype html><title>Notes</title>', 'the hand board is untouched');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'project', 'canvas.json'), 'utf8')).notes, { kept: true }, 'unknown canvas.json fields are kept');
    // A hand file in the way of a generated board stops the build.
    await fs.writeFile(path.join(dir, 'project', 'F_colour.dc.html'), '<!doctype html><title>Mine</title>');
    await assert.rejects(buildShowcase(root), /F_colour.dc.html exists and was not generated by the builder/);
    assert.equal(await fs.readFile(path.join(dir, 'project', 'F_colour.dc.html'), 'utf8'), '<!doctype html><title>Mine</title>');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('BB-06 a frozen canvas is never rebuilt', async () => {
  const root = await fixtureProject();
  try {
    const dir = path.join(root, 'canvases', 'frozen');
    const spec = (title) => ({ title, pages: [{ id: 'p', name: 'P', boards: [{ file: 'A.dc.html', title: 'A', w: 100, h: 100, shell: { kind: 'x' } }] }] });
    await buildCanvas({ canvasDir: dir, spec: { ...spec('Open'), ws: { group: 'exploring', frozen: true } } });
    await assert.rejects(buildCanvas({ canvasDir: dir, spec: spec('Open') }), /frozen/);
    await buildCanvas({ canvasDir: dir, spec: spec('Decided: the old one'), force: true });
    await assert.rejects(buildCanvas({ canvasDir: dir, spec: spec('Open') }), /frozen/, 'a Decided: title freezes it too');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RC-00 theme variants come from the board controls or a canvas declaration', () => {
  const themed = { theme: { editor: 'enum', options: ['light', 'dark'], default: 'light' } };
  assert.deepEqual(themeVariants({}), [{}]);
  assert.deepEqual(themeVariants(themed), [{ theme: 'light' }, { theme: 'dark' }]);
  assert.deepEqual(themeVariants({ ...themed, contrast: { editor: 'enum', options: ['standard', 'high'], default: 'standard' } }), [
    { theme: 'light' }, { theme: 'dark' }, { theme: 'light', contrast: 'high' }, { theme: 'dark', contrast: 'high' },
  ]);
  assert.deepEqual(themeVariants({ theme: { editor: 'enum', options: ['light', 'dark', 'light-contrast', 'sepia'], default: 'light' } }), [{ theme: 'light' }, { theme: 'dark' }, { theme: 'light-contrast' }]);
  assert.deepEqual(themeVariants({ theme: { editor: 'enum', options: ['paper', 'ink'], default: 'paper' } }), [{ theme: 'paper' }]);
  assert.deepEqual(themeVariants(themed, [{ theme: 'dark', density: 'compact' }, { theme: 'dark' }, { mode: 'x' }]), [{ theme: 'dark' }, {}], 'declared variants keep only the board\'s own controls');
  assert.equal(variantName({ theme: 'dark', contrast: 'high' }), 'dark-high');
  assert.equal(variantName({ theme: 'dark', density: 'high' }), 'dark-density-high', 'other props carry their name');
  assert.equal(variantName({}), 'default');
  assert.deepEqual(readControls(`<script type="text/x-dc" data-dc-script data-props='{"a":{"editor":"text","default":"it&#39;s"}}'></script>`), { a: { editor: 'text', default: "it's" } });
  assert.deepEqual(readControls('<p>no logic</p>'), {});
});

test('RC-00b the render check refuses bad input before opening a browser', async () => {
  const root = await fixtureProject();
  try {
    await buildShowcase(root);
    await assert.rejects(renderCheck({ projectRoot: root, jobs: Number.NaN }), /jobs must be a positive whole number/);
    await assert.rejects(renderCheck({ projectRoot: root, jobs: 0 }), /jobs must be a positive whole number/);
    await assert.rejects(renderCheck({ projectRoot: root, canvases: ['showcase'], boards: ['Nope'] }), /No board Nope.dc.html on showcase/);
    await assert.rejects(renderCheck({ projectRoot: root, canvases: ['missing'] }), /No canvas missing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
