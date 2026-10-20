// Review set tests (no browser): review.json validation, the status-to-row mapping, set commands, lock briefs,
// waits_on build groups, archive moves and exploration canvases. Renders are stood in for by a render report
// with real file hashes and small pictures; the render check's own tests cover rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildShowcase } from '../metamodern-work-on-canvases/assets/fixture-builder/showcase.mjs';
import { readCanvas, validateCanvas } from '../metamodern-work-on-canvases/scripts/canvas-format.mjs';
import { hashOf } from '../metamodern-work-on-canvases/scripts/render-check.mjs';
import {
  STATUSES, archiveSet, builtWith, createSet, lockSet, newSet, pngSize, readReview, setStatus, statusRow, validateReview,
} from '../metamodern-work-on-canvases/scripts/review-sets.mjs';
import { createExploration, decideExploration } from '../metamodern-work-on-canvases/scripts/explore.mjs';
import { main } from '../metamodern-work-on-canvases/scripts/canvas.mjs';
import { PACKAGE, PNG, fixtureProject } from './canvas-fixture.mjs';

/** Writes a render report for the given boards of a canvas, as the render check would (light and dark pictures). */
async function fakeRender(root, canvas, files, { ok = true } = {}) {
  const dir = path.join(root, '.canvas', 'render', canvas);
  await fs.mkdir(path.join(dir, 'screens'), { recursive: true });
  const index = await readCanvas(path.join(root, 'canvases', canvas));
  const results = [];
  for (const file of files) {
    const stem = file.replace(/\.dc\.html$/, '');
    const variants = [];
    for (const name of ['dark', 'light']) {
      await fs.writeFile(path.join(dir, 'screens', `${stem}.${name}.png`), PNG);
      variants.push({ name, props: { theme: name }, ok, ms: 10, problems: ok ? [] : ['console error: broken'], screenshot: `screens/${stem}.${name}.png`, natural: 100 });
    }
    const source = await fs.readFile(path.join(root, 'canvases', canvas, 'project', file), 'utf8');
    results.push({ file, page: index.boards[file].page, title: index.boards[file].title, w: 1200, h: 480, hash: hashOf(source), ok, ms: 20, variants });
  }
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify({ schema: 'canvas-render/1', canvas, boards: results.length, renders: results.length * 2, failed: ok ? 0 : results.length, seconds: 1, msPerBoard: 20, results }));
}

async function project() {
  const root = await fixtureProject('canvas-review-');
  await buildShowcase(root);
  return root;
}

test('RS-01 review.json: the fixture is valid and each kind of mistake is named', async () => {
  const review = JSON.parse(await fs.readFile(path.join(PACKAGE, 'assets', 'fixture-builder', 'review.json'), 'utf8'));
  assert.deepEqual(validateReview(review), []);
  const broken = (change) => { const r = structuredClone(review); change(r.sets); return validateReview(r).join('\n'); };
  assert.match(validateReview({ schema: 'x', sets: [] }).join(), /schema must be canvas-review\/1/);
  assert.match(broken((s) => { s[1].id = s[0].id; }), /duplicate set tasks-due-dates/);
  assert.match(broken((s) => { s[0].status = 'approved'; }), /status must be one of/);
  assert.match(broken((s) => { s[0].waits_on = ['nope']; }), /waits on nope, which is not a set/);
  assert.match(broken((s) => { s[0].waits_on = ['tasks-filter']; }), /sets wait on each other/);
  assert.match(broken((s) => { s[1].waits_on = []; }), /a waiting set must name what it waits on/);
  assert.match(broken((s) => { s[2].locked = null; }), /a building set needs its locked record/);
  assert.match(broken((s) => { s[2].locked.harness = 'other'; }), /locked.harness must be one of claude-code, codex/);
  assert.match(broken((s) => { s[2].locked.date = '19 Oct'; }), /locked.date must be YYYY-MM-DD/);
  assert.match(broken((s) => { s[0].boards = ['a.html']; }), /boards must be <board>.dc.html file names/);
  assert.match(broken((s) => { s[0].live.commit = 'main'; }), /live.commit must be a commit hash or null/);
  assert.deepEqual(Object.keys(newSet({ id: 'x', page: 'p' })), ['id', 'page', 'title', 'question', 'lead', 'status', 'waits_on', 'replaces', 'canvas', 'boards', 'locked', 'build', 'live']);
});

test('RS-02 status to row follows contract 5', () => {
  assert.deepEqual(Object.fromEntries(STATUSES.map((s) => [s, statusRow(s)])), {
    exploring: 'deciding', ready: 'deciding', waiting: 'deciding', locked: 'building', building: 'building',
    live: 'live', next: 'next', later: 'later', archived: 'archive',
  });
  assert.throws(() => statusRow('approved'), /Unknown review set status/);
});

test('RS-03 create and status: locking and archiving have their own commands; building needs a lock', async () => {
  let review = { schema: 'canvas-review/1', sets: [] };
  review = createSet(review, { id: 'a', page: 'home', title: 'A' });
  assert.equal(review.sets[0].status, 'exploring');
  assert.throws(() => createSet(review, { id: 'a', page: 'home' }), /already exists/);
  assert.throws(() => createSet(review, { id: 'b', page: 'home', status: 'locked' }), /cannot start as locked/);
  assert.throws(() => createSet(review, { id: 'b', page: 'home', waits_on: ['zz'] }), /waits on zz/);
  review = setStatus(review, 'a', 'ready');
  assert.throws(() => setStatus(review, 'a', 'locked'), /lock command/);
  assert.throws(() => setStatus(review, 'a', 'archived'), /archive command/);
  assert.throws(() => setStatus(review, 'a', 'building'), /not locked/);
  assert.throws(() => setStatus(review, 'a', 'waiting'), /must name what it waits on/);
  const locked = structuredClone(review);
  locked.sets[0].status = 'locked';
  locked.sets[0].locked = { date: '2026-10-20', words: 'Yes', harness: 'codex' };
  const building = setStatus(locked, 'a', 'building', { build: { issue: 7, pr: 'https://example.com/pulls/7', branch: 'claude/lock-a' } });
  assert.deepEqual(building.sets[0].build, { issue: 7, pr: 'https://example.com/pulls/7', branch: 'claude/lock-a' });
  const live = setStatus(building, 'a', 'live', { commit: 'abcdef1' });
  assert.equal(live.sets[0].live.commit, 'abcdef1');
});

test('RS-04 lock records the decision and writes the brief with the contract-5 sections and pictures', async () => {
  const root = await project();
  try {
    await fakeRender(root, 'showcase', ['D_due_badges.dc.html']);
    const result = await lockSet(root, 'tasks-due-dates', { words: 'Badges it is.', harness: 'claude-code', date: '2026-10-20', pieces: ['The task list composition'] });
    const set = (await readReview(root)).sets.find((s) => s.id === 'tasks-due-dates');
    assert.equal(set.status, 'locked');
    assert.deepEqual(set.locked, { date: '2026-10-20', words: 'Badges it is.', harness: 'claude-code' });
    assert.equal(result.buildNow, true);
    const brief = await fs.readFile(path.join(root, 'builds', 'tasks-due-dates.md'), 'utf8');
    const headings = [...brief.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(headings, ['What changes', 'Lead boards', 'Pieces', 'Waits on', 'Acceptance', 'Out of bounds']);
    assert.ok(brief.includes('“Badges it is.”'));
    assert.ok(brief.includes('`/showcase/tasks/D_due_badges`'), 'viewer link');
    assert.ok(brief.includes('![Due dates as badges, light](tasks-due-dates/D_due_badges.light.png)'));
    assert.deepEqual((await fs.readdir(path.join(root, 'builds', 'tasks-due-dates'))).sort(), ['D_due_badges.dark.png', 'D_due_badges.light.png']);
    assert.ok(brief.includes('- The task list composition'));
    assert.ok(brief.includes('Kit components on the lead boards: `Fixture.Badge`, `Fixture.Card`, `Fixture.List`, `Fixture.ListItem`\n'), 'the kit\'s Root only frames the board');
    assert.match(brief, /## Waits on\n\nNothing\./);
    assert.match(brief, /the Live boards match the lead boards above/);
    assert.match(brief, /No database, API or permission change/);
    await assert.rejects(lockSet(root, 'tasks-due-dates', { words: 'Again', harness: 'codex' }), /already locked/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-05 lock needs a passing render of every lead board at its current source', async () => {
  const root = await project();
  try {
    const args = { words: 'Go', harness: 'codex', date: '2026-10-20' };
    await assert.rejects(lockSet(root, 'tasks-due-dates', args), /D_due_badges.dc.html has no render/);
    await fakeRender(root, 'showcase', ['D_due_badges.dc.html'], { ok: false });
    await assert.rejects(lockSet(root, 'tasks-due-dates', args), /failed the render check/);
    await fakeRender(root, 'showcase', ['D_due_badges.dc.html']);
    const file = path.join(root, 'canvases', 'showcase', 'project', 'D_due_badges.dc.html');
    await fs.appendFile(file, '\n');
    await assert.rejects(lockSet(root, 'tasks-due-dates', args), /changed since its render/);
    await assert.rejects(lockSet(root, 'tasks-due-dates', { ...args, words: '' }), /the decision-maker's words/);
    await assert.rejects(lockSet(root, 'tasks-due-dates', { ...args, harness: 'other' }), /harness/);
    assert.equal((await readReview(root)).sets.find((s) => s.id === 'tasks-due-dates').status, 'ready', 'nothing was recorded');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-06 a set that waits on another is built with it', async () => {
  const root = await project();
  try {
    await fakeRender(root, 'showcase', ['D_due_badges.dc.html', 'D_filter_tabs.dc.html']);
    const first = await lockSet(root, 'tasks-filter', { words: 'Tabs, with the dates.', harness: 'codex', date: '2026-10-20' });
    assert.equal(first.buildNow, false);
    assert.deepEqual(first.waitsFor, ['tasks-due-dates']);
    assert.deepEqual(first.joins, [], 'its dependency is not locked yet');
    assert.match(await fs.readFile(first.brief, 'utf8'), /Due dates in the list \(`tasks-due-dates`\): not locked yet \(ready\); this build waits for it and is built with it\./);
    const second = await lockSet(root, 'tasks-due-dates', { words: 'Badges.', harness: 'codex', date: '2026-10-20' });
    assert.equal(second.buildNow, true);
    assert.deepEqual(second.builtWith, ['tasks-filter']);
    const third = await lockSet(root, 'tasks-bulk', { words: 'Move them together.', harness: 'codex', date: '2026-10-20' }).catch((e) => e);
    assert.match(String(third.message), /N_bulk_move.dc.html has no render/, 'a set with no render is not locked');
    assert.deepEqual(builtWith(await readReview(root), 'tasks-due-dates'), ['tasks-filter']);
    assert.match(await fs.readFile(second.brief, 'utf8'), /Built with this set, in the same pull request: Filtering by owner \(`tasks-filter`, builds\/tasks-filter.md\)\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-06b a set locked after its dependency joins that build', async () => {
  const root = await project();
  try {
    await fakeRender(root, 'showcase', ['D_due_badges.dc.html', 'D_filter_tabs.dc.html']);
    await lockSet(root, 'tasks-due-dates', { words: 'Badges.', harness: 'codex', date: '2026-10-20' });
    const later = await lockSet(root, 'tasks-filter', { words: 'Tabs.', harness: 'codex', date: '2026-10-20' });
    assert.equal(later.buildNow, false);
    assert.deepEqual(later.joins, ['tasks-due-dates']);
    assert.match(await fs.readFile(later.brief, 'utf8'), /built in the same pull request as `tasks-due-dates`\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-07 archive keeps boards as pictures and source on the archive canvas and moves the set to archived', async () => {
  const root = await project();
  try {
    await fakeRender(root, 'showcase', ['L_history.dc.html']);
    const before = await fs.readFile(path.join(root, 'canvases', 'showcase', 'project', 'L_history.dc.html'), 'utf8');
    const result = await archiveSet(root, 'tasks-history', { why: 'Set aside for the next milestone.', date: '2026-10-20' });
    assert.equal(result.entry.id, '2026-10-20-tasks-history');
    const dir = path.join(root, 'canvases', 'archive');
    const canvas = await readCanvas(dir);
    assert.deepEqual(validateCanvas(canvas), []);
    assert.equal(canvas.ws.group, 'archive');
    assert.deepEqual(canvas.pages.map((p) => p.id), ['start', 'tasks']);
    const board = 'X_2026-10-20-tasks-history_L_history.dc.html';
    assert.ok(canvas.boards[board], 'a picture board on the page it came from');
    assert.deepEqual(canvas.boards[board].ws, { set: 'tasks-history' });
    assert.match(await fs.readFile(path.join(dir, 'project', board), 'utf8'), /<img class="archive-picture" src="assets\/2026-10-20-tasks-history\/L_history.png"/);
    assert.deepEqual(pngSize(await fs.readFile(path.join(dir, 'project', 'assets', '2026-10-20-tasks-history', 'L_history.png'))), { w: 1, h: 1 });
    assert.equal(await fs.readFile(path.join(dir, 'source', '2026-10-20-tasks-history', 'L_history.dc.html'), 'utf8'), before, 'the source is kept');
    const record = JSON.parse(await fs.readFile(path.join(dir, 'tools', 'archive.json'), 'utf8'));
    assert.equal(record.entries[0].why, 'Set aside for the next milestone.');
    assert.equal((await readReview(root)).sets.find((s) => s.id === 'tasks-history').status, 'archived');
    assert.equal(await fs.readFile(path.join(root, 'canvases', 'showcase', 'project', 'L_history.dc.html'), 'utf8'), before, 'archive leaves the app canvas to its builder');
    const rebuilt = await buildShowcase(root);
    assert.deepEqual(rebuilt.removed, ['L_history.dc.html', 'S_tasks-history.dc.html'], 'the next build drops the archived set');
    await assert.rejects(archiveSet(root, 'tasks-history', {}), /already archived/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-08 an exploration canvas: four pages, the exploring group, copied boards, and frozen when decided', async () => {
  const root = await project();
  try {
    const result = await createExploration(root, {
      id: 'due-dates', title: 'Due dates', question: 'How does a task show when it is due?', set: 'tasks-due-dates',
      copies: ['fixture/imports', 'showcase/D_due_badges.dc.html'], date: '2026-10-20',
    });
    const dir = path.join(root, 'canvases', 'due-dates');
    const canvas = await readCanvas(dir);
    assert.deepEqual(canvas.pages.map((p) => p.name), ['Start here', 'Directions', 'Lead', 'Archive']);
    assert.deepEqual(canvas.ws, { group: 'exploring' });
    assert.equal(canvas.boards['imports.dc.html'].page, 'directions');
    assert.equal(canvas.boards['D_due_badges.dc.html'].page, 'directions');
    assert.equal(canvas.boards['imports.dc.html'].ws, undefined, 'copies use the pinned kit');
    assert.deepEqual(result.copied, ['D_due_badges.dc.html', 'Pill.dc.html', 'board.css', 'imports.dc.html']);
    const copy = await fs.readFile(path.join(dir, 'project', 'D_due_badges.dc.html'), 'utf8');
    assert.ok(!copy.includes('name="generator"'), 'a copy is the exploration\'s own board, not builder output');
    assert.ok(result.links.includes('/due-dates/directions/imports'));
    assert.equal((await readReview(root)).sets.find((s) => s.id === 'tasks-due-dates').canvas, 'due-dates');
    await assert.rejects(createExploration(root, { id: 'due-dates', title: 'x', question: 'y' }), /already exists/);
    await decideExploration(root, { id: 'due-dates', lead: 'Badges after the owner.', date: '2026-10-21' });
    const decided = await readCanvas(dir);
    assert.deepEqual(decided.ws, { group: 'decided', frozen: true });
    assert.match(await fs.readFile(path.join(dir, 'project', 'Start.dc.html'), 'utf8'), /Decided on 2026-10-21\./);
    assert.deepEqual(Object.keys(decided.boards), Object.keys(canvas.boards), 'deciding keeps every board');
    const { buildCanvas } = await import('../metamodern-work-on-canvases/scripts/board-builder.mjs');
    await assert.rejects(buildCanvas({ canvasDir: dir, spec: { title: 'x', pages: [{ id: 'p', name: 'P', boards: [] }] } }), /frozen/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-09 the command line runs the set commands', async () => {
  const root = await project();
  const logs = [];
  const log = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    assert.equal(await main(['review', 'create', 'tasks-sort', '--project', root, '--page', 'tasks', '--title', 'Sorting', '--board', 'D_sort']), 0);
    assert.equal(await main(['review', 'status', 'tasks-sort', 'next', '--project', root]), 0);
    assert.equal(await main(['review', 'list', '--project', root]), 0);
    assert.equal(await main(['review', 'validate', '--project', root]), 0);
    const set = (await readReview(root)).sets.find((s) => s.id === 'tasks-sort');
    assert.equal(set.status, 'next');
    assert.deepEqual(set.boards, ['D_sort.dc.html']);
    assert.ok(logs.some((l) => l.startsWith('tasks-sort\tnext\tnext\ttasks\tSorting')));
    await assert.rejects(main(['review', 'status', 'tasks-sort', 'locked', '--project', root]), /lock command/);
  } finally {
    console.log = log;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-10 ids and copies cannot reach outside their folders, and refusals leave nothing behind', async () => {
  const root = await project();
  try {
    await fakeRender(root, 'showcase', ['L_history.dc.html']);
    await assert.rejects(archiveSet(root, 'tasks-history', { archive: '../../elsewhere', date: '2026-10-20' }), /must be link-safe/);
    // A frozen archive canvas refuses the archive before anything is written.
    const archiveDir = path.join(root, 'canvases', 'archive');
    await fs.mkdir(path.join(archiveDir, 'project'), { recursive: true });
    await fs.writeFile(path.join(archiveDir, 'project', 'canvas.json'), JSON.stringify({ v: 3, title: 'Archive', launch: { view: 'canvas' }, pages: [], boards: {}, order: [], ws: { group: 'archive', frozen: true } }));
    await assert.rejects(archiveSet(root, 'tasks-history', { date: '2026-10-20' }), /frozen/);
    assert.deepEqual(await fs.readdir(archiveDir), ['project'], 'no pictures, source or record were written');
    assert.equal((await readReview(root)).sets.find((s) => s.id === 'tasks-history').status, 'later');
    // A board that imports a name outside its canvas: the import is skipped, never copied.
    const showcase = path.join(root, 'canvases', 'showcase', 'project');
    const sneaky = (await fs.readFile(path.join(showcase, 'D_due_badges.dc.html'), 'utf8')).replace('</x-dc>', '<dc-import name="../../tools/heights"></dc-import></x-dc>').replace(/<meta name="generator"[^>]*>\n/, '');
    await fs.writeFile(path.join(showcase, 'Sneaky.dc.html'), sneaky);
    const index = JSON.parse(await fs.readFile(path.join(showcase, 'canvas.json'), 'utf8'));
    index.boards['Sneaky.dc.html'] = { x: 0, y: 9000, w: 400, h: 300, title: 'Sneaky', page: 'tasks' };
    await fs.writeFile(path.join(showcase, 'canvas.json'), JSON.stringify(index));
    const made = await createExploration(root, { id: 'safe', title: 'Safe', question: 'Is it safe?', copies: ['showcase/Sneaky'], date: '2026-10-20' });
    assert.deepEqual(made.copied, ['Sneaky.dc.html']);
    await assert.rejects(createExploration(root, { id: 'bad', title: 'Bad', question: 'Bad?', copies: ['../showcase/Sneaky'] }), /must be <canvas id>\/<board>/);
    // A copy named like a template board stops before the canvas folder exists.
    await fs.writeFile(path.join(showcase, 'Start.dc.html'), '<!doctype html><title>Start</title>');
    index.boards['Start.dc.html'] = { x: 0, y: 9600, w: 400, h: 300, title: 'Start', page: 'tasks' };
    await fs.writeFile(path.join(showcase, 'canvas.json'), JSON.stringify(index));
    await assert.rejects(createExploration(root, { id: 'clash', title: 'Clash', question: 'Clash?', copies: ['showcase/Start'] }), /board of the exploration template/);
    await assert.rejects(fs.access(path.join(root, 'canvases', 'clash')));
    await assert.rejects(decideExploration(root, { id: '../showcase' }), /link-safe/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RS-11 exploration copies follow references in any quoting, and what stylesheets load', async () => {
  const root = await project();
  try {
    const showcase = path.join(root, 'canvases', 'showcase', 'project');
    await fs.mkdir(path.join(showcase, 'assets'), { recursive: true });
    for (const name of ['single.svg', 'bare.svg', 'inline.svg', 'from-css.svg']) await fs.writeFile(path.join(showcase, 'assets', name), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fs.writeFile(path.join(showcase, 'quoted.css'), ".x{background:url('assets/from-css.svg')}");
    const board = (await fs.readFile(path.join(showcase, 'D_due_badges.dc.html'), 'utf8'))
      .replace(/<meta name="generator"[^>]*>\n/, '')
      .replace('</head>', "<link rel='stylesheet' href='quoted.css'>\n</head>")
      .replace('</x-dc>', `<img src='assets/single.svg' alt=''><img src=assets/bare.svg alt=''><div style="background: url(assets/inline.svg)"></div><dc-import name='Pill'></dc-import></x-dc>`);
    await fs.writeFile(path.join(showcase, 'Quoted.dc.html'), board);
    await fs.copyFile(path.join(root, 'canvases', 'fixture', 'project', 'Pill.dc.html'), path.join(showcase, 'Pill.dc.html'));
    const index = JSON.parse(await fs.readFile(path.join(showcase, 'canvas.json'), 'utf8'));
    index.boards['Quoted.dc.html'] = { x: 0, y: 9000, w: 400, h: 300, title: 'Quoted', page: 'tasks' };
    await fs.writeFile(path.join(showcase, 'canvas.json'), JSON.stringify(index));
    const made = await createExploration(root, { id: 'quotes', title: 'Quotes', question: 'Does every reference come along?', copies: ['showcase/Quoted'], date: '2026-10-20' });
    assert.deepEqual(made.copied, ['Pill.dc.html', 'Quoted.dc.html', 'assets/bare.svg', 'assets/from-css.svg', 'assets/inline.svg', 'assets/single.svg', 'quoted.css']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
