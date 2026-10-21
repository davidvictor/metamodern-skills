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
  await fs.writeFile(
    path.join(root, 'canvases', 'fixture', 'project', 'Loop.dc.html'),
    (await fs.readFile(path.join(root, 'canvases', 'fixture', 'project', 'plain.dc.html'), 'utf8')).replace(
      '<h1>{{title}}</h1>',
      '<h1>{{title}}</h1><svg width="8" height="8"><defs><circle id="dot" cx="4" cy="4" r="4"></circle></defs><use xlink:href="#dot" data-test="use"></use></svg><dc-import name="Loop" mode="none"></dc-import>',
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
  assert.equal(ready.kit.version, `${(await fs.readFile(path.join(PACKAGE, 'PACKAGE_VERSION'), 'utf8')).trim().split('@').pop()}-fixture`);
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

test('RT-12 canvas:motion scales the board clock: a frame-driven spring takes about 4 times as long at a quarter, freezes at 0 and resumes without a jump', { skip }, async () => {
  const { page, frame, problems } = await harness('fixture/project/motion');
  const spring = '[data-kit-component="Spring"] .fx-spring';
  await frame.waitForSelector(`${spring}[data-settled]`);
  const timed = async (rate) => {
    await frame.evaluate(() => { window.__t0 = Date.now(); });
    await page.evaluate((r) => window.send({ type: 'canvas:motion', rate: r, replay: true }), rate);
    const handle = await frame.waitForFunction((s) => {
      const el = document.querySelector(s);
      return el && el.dataset.settled ? { real: Date.now() - window.__t0, virtual: Number(el.dataset.settled) } : null;
    }, spring, { timeout: 15000 });
    return handle.jsonValue();
  };
  const normal = await timed(1);
  const quarter = await timed(0.25);
  const ratio = quarter.real / normal.real;
  assert.ok(ratio > 3 && ratio < 5.5, `quarter speed took ${quarter.real} ms against ${normal.real} ms (${ratio.toFixed(2)} times)`);
  assert.ok(Math.abs(quarter.virtual - normal.virtual) < normal.virtual * 0.25, `the spring's own clock agrees: ${quarter.virtual} and ${normal.virtual} ms`);

  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1, replay: true }));
  await frame.waitForFunction((s) => { const el = document.querySelector(s); return el && !el.dataset.settled && Number(el.dataset.x) > 20; }, spring);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0 }));
  const frozen = await frame.evaluate(async (s) => {
    const read = () => Number(document.querySelector(s).dataset.x);
    await new Promise((r) => requestAnimationFrame(() => r()));
    const at = read();
    for (let i = 0; i < 30; i += 1) await new Promise((r) => requestAnimationFrame(() => r()));
    return { at, after: read(), settled: !!document.querySelector(s).dataset.settled };
  }, spring);
  assert.equal(frozen.after, frozen.at, 'nothing moves while paused');
  assert.equal(frozen.settled, false);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1 }));
  const resumed = await frame.evaluate(async (s) => {
    for (let i = 0; i < 2; i += 1) await new Promise((r) => requestAnimationFrame(() => r()));
    return Number(document.querySelector(s).dataset.x);
  }, spring);
  // Two frames of motion move it a few pixels; a clock that jumped over the pause would land it near 160.
  assert.ok(Math.abs(resumed - frozen.at) < 40, `resumed from ${frozen.at} to ${resumed} px in two frames, no jump`);
  await frame.waitForSelector(`${spring}[data-settled]`);

  // Timers with a delay run in board time too; timers with none stay immediate.
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0.25);
  const timers = await frame.evaluate(() => new Promise((resolve) => {
    const t0 = Date.now();
    let immediate = null;
    setTimeout(() => { immediate = Date.now() - t0; }, 0);
    setTimeout(() => resolve({ delayed: Date.now() - t0, immediate }), 100);
  }));
  assert.ok(timers.delayed >= 300 && timers.delayed < 1000, `a 100 ms timer took ${timers.delayed} ms at a quarter`);
  assert.ok(timers.immediate !== null && timers.immediate < 100, 'a timer with no delay stays immediate');
  // A script animation whose startTime is set from performance.now() (motion libraries do this) starts at
  // its beginning even after the board clock fell behind, and stays paused on a paused board.
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0);
  const paused = await frame.evaluate(async () => {
    const a = document.body.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 1000 });
    a.startTime = performance.now();
    for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(() => r()));
    return { state: a.playState, time: Math.round(Number(a.currentTime)) };
  });
  assert.equal(paused.state, 'paused');
  assert.ok(paused.time < 50, `held near its start: ${paused.time} ms`);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0.25);
  const kept = await frame.evaluate(async () => {
    const a = document.body.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 1000 });
    const set = performance.now();
    a.startTime = set;
    for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(() => r()));
    const read = a.startTime;
    a.cancel();
    return read - set;
  });
  assert.equal(kept, 0, 'a startTime a script set reads back unchanged');
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 1);
  const started = await frame.evaluate(() => {
    const a = document.body.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 1000 });
    a.startTime = performance.now();
    const time = Number(a.currentTime);
    a.cancel();
    return Math.round(time);
  });
  assert.ok(Math.abs(started) < 50, `a fresh animation starts at its beginning: ${started} ms`);
  assert.deepEqual(problems, []);
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
  assert.equal(await get('/%E0%A4%A/project/x'), 400, 'a malformed escape is refused, and the server keeps running');
  assert.equal(await get('/fixture/project/%E0%A4%A.dc.html'), 400);
  assert.equal(await get('/__proto__/project/x.css'), 404);
  const rebound = await new Promise((resolve) => http.get(`${server.origin}/fixture/project/plain.dc.html`, { headers: { host: 'example.test' } }, (res) => { res.resume(); resolve(res.statusCode); }));
  assert.equal(rebound, 403, 'only this machine\'s host names are served');
  assert.equal(await get('/fixture/project/plain.dc.html'), 200);
});

test('RT-11 a board that imports itself still starts, says so, and keeps xlink attributes namespaced', { skip }, async () => {
  const { page, problems, state } = await open('fixture/project/Loop');
  const ns = await page.evaluate(() => document.querySelector('[data-test="use"]').getAttributeNodeNS('http://www.w3.org/1999/xlink', 'href')?.value);
  await page.close();
  assert.ok(state.ready, 'the board became ready');
  assert.equal(ns, '#dot');
  assert.ok(problems.some((p) => /Loop imports itself/.test(p)), problems.join('\n'));
  assert.ok(state.text.includes('Plain markup'));
});

test('RT-13 canvas:motion reaches pseudo-element motion that starts later: a ::before transition takes about 4 times as long at a quarter, and an ::after animation stays still at 0', { skip }, async () => {
  // A board whose only motion runs on pseudo-elements, started after the rate is set (as a switch's thumb fades in).
  const source = (await fs.readFile(path.join(root, 'canvases', 'fixture', 'project', 'plain.dc.html'), 'utf8')).replace(
    '<h1>{{title}}</h1>',
    '<h1>{{title}}</h1><style>.fx-pseudo{position:relative;width:40px;height:20px}.fx-pseudo::before{content:"";position:absolute;inset:0;background:#2457c5;opacity:0;transition:opacity 400ms linear}.fx-pseudo.on::before{opacity:1}.fx-after::after{content:"";display:block;width:8px;height:8px;background:#111}.fx-after.go::after{animation:fx-slide 400ms linear forwards}@keyframes fx-slide{to{transform:translateX(20px)}}</style><div class="fx-pseudo" data-test="pseudo"></div><div class="fx-after" data-test="after"></div>',
  );
  await fs.writeFile(path.join(root, 'canvases', 'fixture', 'project', 'pseudo.dc.html'), source);
  const { page, frame, problems } = await harness('fixture/project/pseudo');
  const fade = (on) => frame.evaluate((turnOn) => new Promise((resolve) => {
    const el = document.querySelector('[data-test="pseudo"]');
    // Date.now() stays real; performance.now() is the board's scaled clock.
    const t0 = Date.now();
    let rates = null;
    el.addEventListener('transitionrun', (e) => {
      if (e.pseudoElement !== '::before') return;
      requestAnimationFrame(() => { rates = document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement === '::before').map((a) => a.playbackRate); });
    }, { once: true });
    el.addEventListener('transitionend', (e) => { if (e.pseudoElement === '::before') resolve({ real: Date.now() - t0, rates }); }, { once: true });
    el.classList.toggle('on', turnOn);
  }), on);
  const normal = await fade(true);
  await fade(false);
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0.25);
  const quarter = await fade(true);
  assert.deepEqual(quarter.rates, [0.25], 'the ::before transition runs at the board rate');
  const ratio = quarter.real / normal.real;
  assert.ok(ratio > 3 && ratio < 5.5, `the ::before fade took ${Math.round(quarter.real)} ms against ${Math.round(normal.real)} ms (${ratio.toFixed(2)} times)`);

  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0);
  const still = await frame.evaluate(async () => {
    document.querySelector('[data-test="after"]').classList.add('go');
    await new Promise((r) => setTimeout(r, 0));
    const started = Date.now();
    await new Promise((r) => { const tick = () => (Date.now() - started > 300 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::after');
    return a ? { state: a.playState, time: Math.round(Number(a.currentTime)) } : null;
  });
  assert.ok(still, 'the ::after animation exists');
  assert.equal(still.state, 'paused');
  assert.ok(still.time < 50, `the ::after animation held near its start: ${still.time} ms`);

  // A transition announced while paused has not run at all: its first frame is taken back.
  const held = await frame.evaluate(async () => {
    const el = document.querySelector('[data-test="pseudo"]');
    el.classList.toggle('on');
    const started = Date.now();
    await new Promise((r) => { const tick = () => (Date.now() - started > 300 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::before');
    return a ? { state: a.playState, time: Number(a.currentTime) } : null;
  });
  assert.ok(held, 'the ::before transition exists');
  assert.equal(held.state, 'paused');
  assert.ok(held.time < 1, `a transition started while paused stays at its start: ${held.time} ms`);

  // At a quarter, its first frame runs at a quarter too.
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 1 && document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0.25);
  const first = await frame.evaluate(async () => {
    const el = document.querySelector('[data-test="pseudo"]');
    const started = Date.now();
    el.classList.toggle('on');
    await new Promise((r) => { const tick = () => (Date.now() - started > 120 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    const real = Date.now() - started;
    const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::before');
    return { real, time: Number(a.currentTime), rate: a.playbackRate };
  });
  assert.equal(first.rate, 0.25);
  assert.ok(first.time <= first.real * 0.25 + 6, `${first.time} ms of animation in ${first.real} ms at a quarter`);

  // An animation with a delay is announced only when its delay ends; its delay runs at the board's rate too.
  const delayed = await frame.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = '.fx-late{width:8px;height:8px;animation:fx-fade 200ms linear 300ms both}@keyframes fx-fade{from{opacity:0}to{opacity:1}}';
    document.head.append(style);
    const el = document.createElement('div');
    const started = Date.now();
    await new Promise((r) => { el.addEventListener('animationend', r, { once: true }); el.className = 'fx-late'; document.body.append(el); });
    el.remove();
    return Date.now() - started;
  });
  assert.ok(delayed > 3 * 500 && delayed < 5.5 * 500, `a 300 ms delay and 200 ms fade took ${delayed} ms at a quarter`);

  // A transition paused just after it starts holds still: the board's pause takes effect at once, not an update later.
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 1);
  for (let i = 0; i < 5; i += 1) {
    await frame.evaluate(() => new Promise((r) => { const el = document.querySelector('[data-test="pseudo"]'); el.classList.toggle('on'); requestAnimationFrame(() => r()); }));
    await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0 }));
    const drift = await frame.evaluate(async () => {
      const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::before');
      if (!a) return NaN;
      const wait = (ms) => new Promise((r) => { const end = Date.now() + ms; const tick = () => (Date.now() >= end ? r() : requestAnimationFrame(tick)); tick(); });
      while (a.playState === 'running') await wait(2);
      await wait(20);
      const c1 = Number(a.currentTime);
      await wait(400);
      return Number(a.currentTime) - c1;
    });
    assert.ok(Number.isFinite(drift), 'no ::before transition was found after the toggle');
    assert.ok(Math.abs(drift) < 1, `a paused transition moved ${drift} ms`);
    await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 1 }));
    await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 1 && document.getAnimations().every((a) => a.playState !== 'running'));
  }
  await page.evaluate(() => window.send({ type: 'canvas:motion', rate: 0.25 }));
  await frame.waitForFunction(() => window.__canvasRuntime.motion.rate === 0.25);

  // A parent's transition leaves its children's animations alone: a child at its own speed, and one reversed.
  const children = await frame.evaluate(async () => {
    const host = document.querySelector('[data-test="pseudo"]');
    const fast = document.createElement('i');
    const back = document.createElement('i');
    host.append(fast, back);
    const a = fast.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 4000 });
    a.playbackRate = 0.5;
    const b = back.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 4000 });
    // Reversed from mid-run, so it is still running backwards when the parent's transition starts.
    b.currentTime = 2000;
    b.reverse();
    await Promise.all([a.ready, b.ready]);
    const before = [a.playbackRate, b.playbackRate];
    await new Promise((r) => { host.addEventListener('transitionrun', () => requestAnimationFrame(() => r()), { once: true }); host.classList.toggle('on'); });
    return { before, after: [a.playbackRate, b.playbackRate], states: [a.playState, b.playState] };
  });
  assert.deepEqual(children.after, children.before, `children kept their rates: ${JSON.stringify(children)}`);
  assert.deepEqual(children.states, ['running', 'running'], 'both children were still running when the parent moved');
  assert.ok(children.before[1] < 0, 'the reversed child runs backwards');
  assert.deepEqual(problems, []);
  await page.close();
});
