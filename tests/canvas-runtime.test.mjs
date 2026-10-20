// Board runtime tests in headless Chromium: every fixture board, the fixture kit (canvas-kit/1, React 19),
// a legacy kit (React 18.3.1 from the runtime) and the board side of the viewer messages.
// Needs the tooling: node metamodern-work-on-canvases/scripts/tooling.mjs install --browser
// Without it these tests are skipped, unless CANVAS_BROWSER_TESTS=required (CI), when they fail.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { chromium, toolingInstalled } from '../metamodern-work-on-canvases/scripts/tooling.mjs';

const PACKAGE = path.resolve('metamodern-work-on-canvases');
const required = process.env.CANVAS_BROWSER_TESTS === 'required';
const available = toolingInstalled();
const skip = !available && !required ? 'canvas tooling is not installed (node metamodern-work-on-canvases/scripts/tooling.mjs install --browser)' : false;

let root;
let server;
let browser;
let context;

before(async () => {
  if (skip) return;
  assert.ok(available, 'CANVAS_BROWSER_TESTS=required but the canvas tooling is not installed');
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  const { startBoardServer } = await import('../metamodern-work-on-canvases/scripts/lib/board-server.mjs');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-runtime-'));
  await fs.cp(path.join(PACKAGE, 'assets', 'fixture-project'), root, { recursive: true });
  await fs.writeFile(
    path.join(root, 'canvases', 'fixture', 'project', 'broken.dc.html'),
    (await fs.readFile(path.join(root, 'canvases', 'fixture', 'project', 'plain.dc.html'), 'utf8')).replace(
      '<h1>{{title}}</h1>',
      '<h1>{{title}}</h1><x-import component-from-global-scope="Fixture.Missing"></x-import>',
    ),
  );
  await buildFixtureKit(path.join(root, 'kit', 'current'));
  const config = JSON.parse(await fs.readFile(path.join(root, 'canvas.config.json'), 'utf8'));
  server = await startBoardServer({
    projectRoot: root,
    config,
    canvases: { fixture: path.join(root, 'canvases', 'fixture', 'project'), legacy: path.join(root, 'canvases', 'legacy', 'project') },
  });
  browser = await chromium().launch();
  context = await browser.newContext({ reducedMotion: 'no-preference' });
});

after(async () => {
  await browser?.close();
  await server?.close();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

async function open(board, query = '') {
  const { openBoard } = await import('../metamodern-work-on-canvases/scripts/lib/check-board.mjs');
  return openBoard(context, `${server.origin}/${board}.dc.html${query}`, { viewport: { width: 1280, height: 900 } });
}

async function harness(board) {
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.goto(`${server.origin}/_harness?w=1200&h=900&board=${encodeURIComponent(`/${board}.dc.html`)}`);
  await page.waitForFunction(() => window.__messages.some((m) => m.type === 'canvas:ready'));
  const frame = page.frames().find((f) => f !== page.mainFrame());
  return { page, frame, problems };
}

const BOARDS = [
  ['fixture/project/basics', ['Outside any component: 4 tasks for Field notes.', 'Save changes', '4 tasks', 'Draft the outline', '#3', 'Rae Okafor', 'Stand-up']],
  ['fixture/project/logic', ['Step 1 of 3', 'constructed, mounted']],
  ['fixture/project/imports', ['Ready', 'Waiting', 'One', 'Two', 'Three', 'Last']],
  ['fixture/project/plain', ['Plain markup', 'Mode all, rows 3']],
  ['fixture/project/Pill', ['Open']],
  ['fixture/project/scenes', ['This week', '3 tasks open', 'Team', 'Ana Silva']],
  ['fixture/project/motion', ['Members and roles.', 'Rename team']],
  ['legacy/project/legacy', ['Shared notes', 'React 18.3.1', 'Notes', 'Drafts']],
];

for (const [board, texts] of BOARDS) {
  test(`RT-01 ${board} renders with no errors, failed requests or empty mounts`, { skip }, async () => {
    const { page, problems, state } = await open(board);
    await page.close();
    assert.deepEqual(problems, []);
    for (const text of texts) assert.ok(state.text.includes(text), `${board} shows "${text}"\n${state.text}`);
  });
}

test('RT-02 contract kits keep React inside: no page React, the global has the contract shape', { skip }, async () => {
  const { validateKitGlobal } = await import('../metamodern-work-on-canvases/scripts/kit-contract.mjs');
  const { page } = await open('fixture/project/scenes');
  const shape = await page.evaluate(() => {
    const k = window.Fixture;
    const kind = (v) => (typeof v === 'function' ? 'function' : v && typeof v === 'object' && typeof v.$$typeof === 'symbol' ? 'element-type' : typeof v);
    return {
      pageReact: typeof window.React, pageReactDOM: typeof window.ReactDOM,
      version: k.version, mount: kind(k.mount), Root: kind(k.Root), Scene: kind(k.Scene), hasSample: 'sample' in k, scenes: k.scenes,
      sceneRoots: [...document.querySelectorAll('[data-kit-component="Scene"]')].map((n) => n.getAttribute('data-scene')),
      deep: !!document.querySelector('[data-canvas-import="Fixture.Scenes.Settings"] [data-kit-component="Tabs"]'),
    };
  });
  await page.close();
  assert.equal(shape.pageReact, 'undefined');
  assert.equal(shape.pageReactDOM, 'undefined');
  const fn = () => null;
  const rebuilt = { version: shape.version, mount: shape.mount === 'function' ? fn : undefined, Root: fn, Scene: fn, scenes: shape.scenes };
  if (shape.hasSample) rebuilt.sample = {};
  assert.deepEqual(validateKitGlobal(rebuilt, 'Fixture'), []);
  assert.deepEqual(shape.sceneRoots, ['overview', 'settings']);
  assert.ok(shape.deep, 'a two-level dotted name from the second kit script mounts');
});

test('RT-03 legacy kits get React 18.3.1 from the runtime before their script runs', { skip }, async () => {
  const { page } = await open('legacy/project/legacy');
  assert.equal(await page.evaluate(() => window.React.version), '18.3.1');
  await page.click('[data-test="legacy-count"]');
  await page.waitForFunction(() => document.querySelector('[data-test="legacy-count"]').textContent === 'Counted 1');
  assert.equal(await page.locator('svg circle[stroke-width="2"]').count(), 1, 'SVG attributes keep their names through React');
  await page.close();
});

test('RT-04 x-import props, values, lists, branches and handlers', { skip }, async () => {
  const { page } = await open('fixture/project/basics');
  const facts = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      disabled: q('[data-kit-component="Button"][disabled]')?.textContent,
      placed: [...document.querySelectorAll('[data-kit-component="Badge"]')].find((b) => b.parentElement.style.width === '96px')?.textContent,
      ariaLabel: q('[aria-label="Add a task"]')?.tagName,
      dataTest: q('[data-test="primary-action"]')?.tagName,
      rects: document.querySelectorAll('[data-canvas-id="outside-svg"] rect').length,
      circles: document.querySelectorAll('[data-canvas-id="outside-svg"] circle').length,
      rectNs: q('[data-canvas-id="outside-svg"] rect')?.namespaceURI,
      fillOpacity: q('[data-canvas-id="outside-svg"] rect')?.getAttribute('fill-opacity'),
      checks: document.querySelectorAll('[data-kit-component="Icons.Check"]').length,
      images: [...document.querySelectorAll('img')].map((i) => i.complete && i.naturalWidth > 0),
      cells: [...document.querySelectorAll('[data-test="owners"] td')].map((td) => td.textContent),
      groups: [...document.querySelectorAll('[data-test="group"]')].map((g) => g.textContent),
    };
  });
  assert.equal(facts.disabled, 'Archived');
  assert.equal(facts.placed, 'Placed');
  assert.equal(facts.ariaLabel, 'BUTTON');
  assert.equal(facts.dataTest, 'BUTTON');
  assert.equal(facts.rects, 4);
  assert.equal(facts.circles, 0, '{{ false }} hides the branch');
  assert.equal(facts.rectNs, 'http://www.w3.org/2000/svg');
  assert.equal(facts.fillOpacity, '0.9');
  assert.equal(facts.checks, 1, 'only the done task shows a check');
  assert.deepEqual(facts.images, [true, true, true, true]);
  assert.deepEqual(facts.cells, ['Rae Okafor', 'Lead', 'Jun Park', 'Research']);
  assert.deepEqual(facts.groups, ['MorningStand-upReviews', 'AfternoonInterviews']);

  await page.click('[data-test="outside-button"]');
  await page.waitForFunction(() => document.querySelector('[data-test="outside-button"]').textContent === 'Pressed 1 times');
  await page.click('[aria-label="Add a task"]');
  await page.waitForFunction(() => document.querySelector('[aria-label="Add a task"]').textContent.includes('Add 2'));
  await page.fill('[data-kit-component="Input"] input', 'Call the printer');
  await page.waitForFunction(() => document.querySelector('[data-test="typed"]').textContent === 'Typed: Call the printer');
  assert.equal(await page.inputValue('[data-kit-component="Input"] input'), 'Call the printer', 'the field keeps its text across renders');
  await page.close();
});

test('RT-05 board logic: constructor, state, lifecycle and setState callbacks', { skip }, async () => {
  const { page, frame, problems } = await harness('fixture/project/logic');
  await frame.waitForFunction(() => document.querySelector('[data-test="lifecycle"]')?.textContent === 'constructed, mounted');
  await frame.click('[data-test="advance"]');
  await frame.waitForFunction(() => document.querySelector('h1').textContent === 'Step 2 of 3');
  await frame.click('[data-test="restart"]');
  await frame.waitForFunction(() => document.querySelector('h1').textContent === 'Step 1 of 3' && document.querySelector('[data-test="lifecycle"]').textContent.endsWith('restarted'));
  await page.evaluate(() => window.send({ type: 'canvas:set-props', values: { speed: 'fast' } }));
  await frame.waitForFunction(() => document.querySelector('[data-test="lifecycle"]').textContent.endsWith('speed fast'));
  assert.equal(await frame.textContent('[data-test="speed"]'), 'Speed fast');
  assert.deepEqual(problems, []);
  await page.close();
});

test('RT-06 dc-import: attributes are coerced by the imported board\'s controls, inside and outside components', { skip }, async () => {
  const { page } = await open('fixture/project/imports');
  const pills = await page.evaluate(() =>
    [...document.querySelectorAll('[data-canvas-id="pill"]')].map((p) => ({
      text: p.textContent.trim(), size: p.dataset.size, double: p.dataset.double, quiet: p.classList.contains('is-quiet'), tone: p.dataset.tone,
      inside: !!p.closest('[data-kit-component="Card"]'),
    })),
  );
  await page.close();
  assert.deepEqual(pills[0], { text: 'Ready', size: '28', double: '56', quiet: true, tone: 'green', inside: false });
  assert.deepEqual(pills[1], { text: 'Waiting', size: '24', double: '48', quiet: false, tone: 'blue', inside: false });
  assert.deepEqual(pills.slice(2).map((p) => [p.text, p.size, p.inside]), [['One', '20', true], ['Two', '20', true], ['Three', '20', true], ['Last', '24', true]]);
});

test('RT-07 viewer messages: canvas:ready, canvas:set-props and canvas:props-changed', { skip }, async () => {
  const { page, frame, problems } = await harness('fixture/project/basics');
  const ready = await page.evaluate(() => window.__messages.find((m) => m.type === 'canvas:ready'));
  assert.equal(ready.board, 'basics');
  assert.equal(ready.props.theme.editor, 'enum');
  assert.deepEqual(ready.props.$preview, { width: 1200, height: 900 });
  assert.equal(ready.values.theme, 'light');
  assert.equal(ready.values.limit, 4);
  assert.equal(ready.kit.mode, 'pinned');
  assert.match(ready.kit.ref, /^[0-9a-f]{40}$/);
  assert.equal(ready.kit.version, '0.0.1-fixture');
  await page.evaluate(() => window.send({ type: 'canvas:set-props', values: { theme: 'dark', limit: 2, heading: 'Next week' } }));
  await page.waitForFunction(() => window.__messages.some((m) => m.type === 'canvas:props-changed' && m.values.theme === 'dark'));
  await frame.waitForFunction(() => document.querySelector('[data-kit-component="Root"]')?.dataset.theme === 'dark' && document.querySelector('h1')?.textContent === 'Next week');
  assert.equal(await frame.locator('[data-kit-component="ListItem"]').count(), 2);
  const changed = await page.evaluate(() => window.__messages.filter((m) => m.type === 'canvas:props-changed').pop());
  assert.deepEqual([changed.values.theme, changed.values.limit, changed.values.heading], ['dark', 2, 'Next week']);
  assert.deepEqual(problems, []);
  await page.close();
});

test('RT-08 canvas:motion slows, pauses and replays Web Animations and sets --canvas-motion-rate', { skip }, async () => {
  const { page, frame } = await harness('fixture/project/motion');
  await frame.waitForFunction(() => document.getAnimations().length > 0);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas-motion-rate').trim() === '0.25');
  const rates = await frame.evaluate(() => document.getAnimations().map((a) => a.playbackRate));
  assert.ok(rates.length && rates.every((r) => r === 0.25), `rates ${rates}`);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0 }));
  await frame.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1, replay: true }));
  await frame.waitForFunction(() => {
    const dialog = document.querySelector('.fx-dialog');
    return dialog && dialog.getAnimations().some((a) => a.playState === 'running' && a.playbackRate === 1);
  });
  await page.close();
});

test('RT-09 initial props from the board link, and a missing component is reported, never silent', { skip }, async () => {
  const none = await open('fixture/project/plain', `?canvas-props=${encodeURIComponent('{"mode":"none"}')}`);
  assert.ok(none.state.text.includes('No rows.'));
  assert.deepEqual(none.problems, []);
  await none.page.close();
  const broken = await open('fixture/project/broken');
  await broken.page.close();
  assert.ok(broken.problems.some((p) => /console error: \[canvas\] Fixture\.Missing/.test(p)), broken.problems.join('\n'));
  assert.ok(broken.problems.some((p) => /empty mount: Fixture\.Missing/.test(p)), broken.problems.join('\n'));
});

test('RT-10 the board server refuses traversal and answers unexpanded values empty', { skip }, async () => {
  const get = (p) => new Promise((resolve) => http.get(`${server.origin}${p}`, (res) => { res.resume(); resolve(res.statusCode); }));
  assert.ok([400, 404].includes(await get('/fixture/project/%2e%2e/%2e%2e/canvas.config.json')), 'dot segments never reach a file');
  assert.equal(await get('/fixture/project/ds/fixture/..%2F..%2Fcanvas.config.json'), 400);
  assert.equal(await get('/fixture/project/%7B%7Btask.icon%7D%7D'), 204);
  assert.equal(await get('/fixture/project/ds/fixture/kit.json'), 200);
  assert.equal(await get('/legacy/project/ds/legacy/kit.json'), 200);
});
