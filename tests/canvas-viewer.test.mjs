// Viewer tests. VW-01 to VW-06 run on Node alone: project discovery, the command line, the index, the kit
// report, server routing and resolution (path traversal, live kits, blobs, host names) and the server-sent
// events. VW-10 onwards run the viewer in headless Chromium on a copy of the fixture project with the
// fixture kit built twice, pinned and "live"; they need the tooling (see canvas-runtime.test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { chromium, toolingInstalled } from '../metamodern-work-on-canvases/scripts/tooling.mjs';
import { parseViewerLink, viewerLink } from '../metamodern-work-on-canvases/scripts/canvas-format.mjs';
import { buildIndex, canvasGroup, findProject, kitInfo, kitsReport, readAbout, startViewer } from '../metamodern-work-on-canvases/scripts/lib/viewer-server.mjs';
import { parseArgs } from '../metamodern-work-on-canvases/scripts/canvas.mjs';

const PACKAGE = path.resolve('metamodern-work-on-canvases');
const required = process.env.CANVAS_BROWSER_TESTS === 'required';
const available = toolingInstalled();
const skip = !available && !required ? 'canvas tooling is not installed (node metamodern-work-on-canvases/scripts/tooling.mjs install --browser)' : false;

const BUTTON_BOARD = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/fixture/components/bundle.css">
<script src="ds/fixture/components/bundle.js"></script>
</head>
<body>
<x-dc>
<x-import component-from-global-scope="Fixture.Root" theme="{{theme}}">
  <div style="padding: 24px" data-canvas-id="pair">
    <x-import component-from-global-scope="Fixture.Button" variant="{{variant}}" busy="{{busy}}" data-test="button">{{label}}</x-import>
    <span data-test="size">{{size}}</span>
  </div>
</x-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"theme":{"editor":"enum","options":["light","dark"],"default":"light"},"variant":{"editor":"enum","options":["primary","secondary"],"default":"primary","section":"Button"},"label":{"editor":"text","default":"Save changes","section":"Button"},"busy":{"editor":"boolean","default":false,"section":"Button"},"size":{"editor":"int","default":2,"min":1,"max":4,"section":"Button"},"$preview":{"width":480,"height":160}}'>
class Component extends DCLogic {
  renderVals() {
    return { theme: this.props.theme, variant: this.props.variant, label: this.props.label, busy: this.props.busy, size: this.props.size };
  }
}
</script>
</body>
</html>
`;

let root;
let liveDir;

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

/** A copy of the fixture project, plus a pageless "pair" canvas (one board pinned, one live), and a decided canvas. */
async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-viewer-'));
  await fs.cp(path.join(PACKAGE, 'assets', 'fixture-project'), dir, { recursive: true });
  const pair = path.join(dir, 'canvases', 'pair', 'project');
  await fs.mkdir(pair, { recursive: true });
  await fs.writeFile(path.join(pair, 'button-pinned.dc.html'), BUTTON_BOARD('Button, pinned'));
  await fs.writeFile(path.join(pair, 'button-live.dc.html'), BUTTON_BOARD('Button, live'));
  await writeJson(path.join(pair, 'canvas.json'), {
    v: 3, title: 'Button pair', launch: { view: 'canvas' }, pages: [],
    boards: {
      'button-pinned.dc.html': { x: 0, y: 0, w: 480, h: 160, title: 'Button on the pinned kit' },
      'button-live.dc.html': { x: 560, y: 0, w: 480, h: 160, title: 'Button on the live kit', ws: { kit: 'live:watch' } },
    },
    order: ['button-pinned.dc.html', 'button-live.dc.html'],
  });
  await fs.writeFile(path.join(dir, 'canvases', 'pair', 'README.md'), '# Button pair\n\nThe same button on the pinned kit and on a live kit,\nside by side.\n\n## Boards\n\nTwo.\n');
  const decided = path.join(dir, 'canvases', 'old-choice', 'project');
  await fs.mkdir(decided, { recursive: true });
  await fs.copyFile(path.join(dir, 'canvases', 'fixture', 'project', 'plain.dc.html'), path.join(decided, 'plain.dc.html'));
  await writeJson(path.join(decided, 'canvas.json'), {
    v: 3, title: 'Decided: header layout', launch: { view: 'canvas' }, pages: [],
    boards: { 'plain.dc.html': { x: 0, y: 0, w: 800, h: 500 } },
  });
  await fs.mkdir(path.join(dir, 'canvases', 'not-a-canvas'), { recursive: true });
  await fs.mkdir(path.join(dir, 'kit', 'current', 'components'), { recursive: true });
  return dir;
}

before(async () => {
  root = await makeProject();
  liveDir = path.join(root, 'live-kit');
  await fs.mkdir(path.join(liveDir, 'components'), { recursive: true });
  await writeJson(path.join(root, '.canvas', 'live.json'), { watch: liveDir });
  await writeJson(path.join(liveDir, 'kit.json'), {
    schema: 'canvas-kit/1', namespace: 'Fixture', version: 'live-0', builtAt: '2026-10-20T00:00:00.000Z', react: '19.3.0', inputs: [],
    source: { repo: 'example/app', commit: 'a'.repeat(40), dirty: true, branch: 'feature/pill' },
  });
});

after(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

const get = (origin, p, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(`${origin}${p}`, { method, headers }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? '', body }));
  });
  req.on('error', reject);
  req.end();
});

test('VW-01 the project is found from any folder inside it, and the command line reads its options', async () => {
  assert.equal(findProject(path.join(root, 'canvases', 'pair', 'project')), root);
  assert.equal(findProject(os.tmpdir() === '/' ? '/' : path.parse(os.tmpdir()).root), null);
  assert.deepEqual(parseArgs(['view', '--project', 'x', '--port', '5411']), { command: 'view', project: 'x', port: 5411 });
  assert.deepEqual(parseArgs(['view']), { command: 'view' });
  assert.throws(() => parseArgs(['view', '--port']), /needs a value/);
  assert.throws(() => parseArgs(['view', '--port', '70000']), /--port/);
  assert.throws(() => parseArgs(['view', '--open']), /Unknown option/);
});

test('VW-02 the index groups canvases by ws.group, then the frozen rule, then exploring, in the config order', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'canvas.config.json'), 'utf8'));
  const index = buildIndex({ projectRoot: root, config });
  assert.equal(index.name, 'Fixture project');
  assert.deepEqual(index.canvases.map((c) => [c.id, c.group]), [['fixture', 'lab'], ['pair', 'exploring'], ['old-choice', 'decided'], ['legacy', 'archive']]);
  const pair = index.canvases.find((c) => c.id === 'pair');
  assert.equal(pair.pageless, true);
  assert.deepEqual(pair.pages, [{ id: '-', name: 'Boards' }]);
  assert.equal(pair.launch, '-');
  assert.deepEqual(pair.boards.map((b) => [b.f, b.p, b.kit]), [['button-pinned.dc.html', '-', 'pinned'], ['button-live.dc.html', '-', 'live:watch']]);
  assert.equal(pair.about, 'The same button on the pinned kit and on a live kit, side by side.');
  const fixture = index.canvases.find((c) => c.id === 'fixture');
  assert.equal(fixture.launch, 'language');
  assert.deepEqual(fixture.boards.find((b) => b.f === 'basics.dc.html'), { f: 'basics.dc.html', t: 'Values, lists and branches', p: 'language', x: 0, y: 0, w: 1200, h: 900, kit: 'pinned', row: 'live', set: 'language-basics' });
  assert.equal(index.canvases.find((c) => c.id === 'old-choice').frozen, true);
  assert.deepEqual(index.problems, []);
  assert.equal(canvasGroup({ title: 'History: v1' }), 'decided');
  assert.equal(canvasGroup({ title: 'History: v1', ws: { group: 'archive' } }), 'archive');
  assert.equal(canvasGroup({ title: 'Work' }), 'exploring');
  assert.equal(readAbout(path.join(root, 'canvases', 'fixture')), '');

  const reordered = buildIndex({ projectRoot: root, config: { ...config, groups: ['archive', 'exploring'] } });
  assert.deepEqual(reordered.canvases.map((c) => c.group), ['archive', 'exploring', 'lab', 'decided'], 'listed groups first, then the rest in the standard order');

  const broken = path.join(root, 'canvases', 'broken', 'project');
  await writeJson(path.join(broken, 'canvas.json'), { v: 3, title: 'Broken', launch: { view: 'canvas' }, pages: [], boards: { 'x.dc.html': { x: 0, y: 0, w: 0, h: 10 } } });
  const withBroken = buildIndex({ projectRoot: root, config });
  assert.deepEqual(withBroken.problems.map((p) => p.canvas), ['broken']);
  assert.ok(withBroken.canvases.some((c) => c.id === 'broken'), 'a canvas with issues is still listed');
  await fs.rm(path.join(root, 'canvases', 'broken'), { recursive: true });
});

test('VW-03 the kit report names the pinned kit and every live kit, legacy kits and missing ones', async () => {
  assert.deepEqual(kitInfo(path.join(root, 'nowhere')), { exists: false });
  assert.deepEqual(kitInfo(path.join(root, 'canvases', 'legacy', 'project', 'ds', 'legacy')), { exists: true, legacy: true });
  const config = JSON.parse(await fs.readFile(path.join(root, 'canvas.config.json'), 'utf8'));
  const report = kitsReport({ projectRoot: root, config, liveKits: { watch: liveDir, gone: path.join(root, 'gone') } });
  assert.equal(report.namespace, 'Fixture');
  assert.deepEqual(report.pinned, { choice: 'pinned', name: 'pinned', exists: true, legacy: true });
  assert.deepEqual(report.live.map((k) => [k.choice, k.exists, k.version ?? null, k.branch ?? null, k.dirty ?? null]), [
    ['live:gone', false, null, null, null],
    ['live:watch', true, 'live-0', 'feature/pill', true],
  ]);
});

test('VW-04 the server routes viewer links, board requests, kits and blobs, and refuses traversal', async () => {
  const viewer = await startViewer({ projectRoot: root, port: 0, watch: false });
  try {
    const o = viewer.origin;
    for (const p of ['/', '/pair/', '/pair/-/', '/pair/-/button-live', '/fixture/language/', '/fixture/language/basics']) {
      const r = await get(o, p);
      assert.equal(r.status, 200, p);
      assert.match(r.body, /<script type="module" src="\/_viewer\/app.js">/, p);
    }
    for (const p of ['/nope/', '/fixture/a/b/c', '/fixture//x', '/not-a-canvas/']) assert.equal((await get(o, p)).status, 404, p);
    assert.match((await get(o, '/_viewer/app.js')).type, /javascript/);
    assert.equal((await get(o, '/_viewer/%2e%2e%2fpackage.json')).status, 404);
    assert.equal((await get(o, '/_viewer/../../scripts/canvas.mjs')).status, 404);

    const index = JSON.parse((await get(o, '/_index')).body);
    assert.deepEqual(index.canvases.map((c) => c.id), ['fixture', 'pair', 'old-choice', 'legacy']);
    const kits = JSON.parse((await get(o, '/_kits')).body);
    assert.deepEqual(kits.live.map((k) => k.choice), ['live:watch']);
    assert.equal(kits.issue, null);

    const board = await get(o, '/pair/project/button-live.dc.html');
    assert.equal(board.status, 200);
    assert.match(board.body, /Fixture\.Button/);
    assert.match((await get(o, '/pair/project/support.js')).body, /Canvas board runtime/);
    // A board's ws.kit applies without a link choice; a link choice and the referrer override it.
    assert.match((await get(o, '/pair/project/ds/fixture/kit.json', { referer: `${o}/pair/project/button-live.dc.html` })).body, /"version":\s*"live-0"/);
    assert.match((await get(o, '/pair/project/ds/fixture/kit.json?canvas-kit=live:watch')).body, /"version":\s*"live-0"/);
    assert.match((await get(o, '/pair/project/ds/fixture/kit.json', { referer: `${o}/pair/project/button-pinned.dc.html` })).body, /canvas-kit\/legacy/);
    assert.equal((await get(o, '/pair/project/ds/fixture/kit.json?canvas-kit=live:gone')).status, 404);
    assert.match((await get(o, '/pair/project/ds/fixture/kit.json?canvas-kit=live:..%2Fx')).body, /canvas-kit\/legacy/, 'a malformed kit choice falls back to the pinned kit');

    for (const p of ['/pair/project/../../canvas.config.json', '/pair/project/%2e%2e/%2e%2e/canvas.config.json', '/pair/project/ds/fixture/..%2F..%2F..%2Fcanvas.config.json', '/pair/project/%5c..%5ccanvas.config.json']) {
      assert.ok([400, 404].includes((await get(o, p)).status), p);
    }
    assert.match((await get(o, '/pair/project/')).body, /_viewer\/app\.js/, 'a page link is never a board request');
    assert.equal((await get(o, '/fixture/project/%7B%7Bitem.src%7D%7D')).status, 204);

    assert.match((await get(o, '/_blob/dot')).type, /svg/);
    assert.equal((await get(o, '/_blob/missing')).status, 404);
    assert.equal((await get(o, '/_blob/.env')).status, 400);
    assert.equal((await get(o, '/_blob/%2e%2e%2fcanvas.config')).status, 400);
    await writeJson(path.join(root, 'canvases', 'fixture', 'tools', 'blobs.json'), { readme: 'project/canvas.json', escape: '../../canvas.config.json' });
    assert.match((await get(o, '/_blob/readme')).body, /"Fixture canvas"/);
    assert.equal((await get(o, '/_blob/escape')).status, 404, 'a blob map entry outside its canvas is ignored');

    assert.equal((await get(o, '/', { host: 'example.test' })).status, 403);
    assert.equal((await get(o, '/_index', {}, 'POST')).status, 405);
    assert.equal(viewer.server.address().address, '127.0.0.1');
  } finally {
    await viewer.close();
  }
});

test('VW-05 viewer links round-trip through the contract helpers the viewer follows', () => {
  assert.equal(viewerLink({ canvas: 'pair', board: 'button-live.dc.html' }), '/pair/-/button-live');
  assert.deepEqual(parseViewerLink('/pair/-/button-live'), { canvas: 'pair', page: null, board: 'button-live.dc.html' });
  assert.deepEqual(parseViewerLink('/fixture/language/'), { canvas: 'fixture', page: 'language' });
});

/** Reads server-sent events until `match` returns true for one, or times out. */
function nextEvent(origin, match, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${origin}/_events`, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (match(data)) { clearTimeout(timer); req.destroy(); resolve(data); return; }
        }
      });
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('no matching event')); }, timeout);
    req.on('error', () => {});
  });
}

test('VW-06 the server sends file changes, index changes, kit rebuilds and live kit registrations', async () => {
  const viewer = await startViewer({ projectRoot: root, port: 0 });
  try {
    const board = path.join(root, 'canvases', 'pair', 'project', 'button-live.dc.html');
    const ready = (p) => new Promise((r) => setTimeout(r, 150)).then(p);
    const files = nextEvent(viewer.origin, (d) => d.type === 'files' && d.changes.some((c) => c.canvas === 'pair' && c.file === 'button-live.dc.html'));
    await ready(() => fs.appendFile(board, '\n'));
    await files;
    const index = nextEvent(viewer.origin, (d) => d.type === 'index');
    await ready(async () => fs.appendFile(path.join(root, 'canvases', 'pair', 'project', 'canvas.json'), '\n'));
    await index;
    const kit = nextEvent(viewer.origin, (d) => d.type === 'kit' && d.kit === 'live:watch');
    await ready(async () => {
      const file = path.join(liveDir, 'kit.json');
      const next = JSON.parse(await fs.readFile(file, 'utf8'));
      next.version = 'live-0b';
      await fs.writeFile(`${file}.tmp`, JSON.stringify(next));
      await fs.rename(`${file}.tmp`, file);
    });
    await kit;
    const kits = nextEvent(viewer.origin, (d) => d.type === 'kits');
    await ready(() => writeJson(path.join(root, '.canvas', 'live.json'), { watch: liveDir, other: liveDir }));
    await kits;
    assert.deepEqual(JSON.parse((await get(viewer.origin, '/_kits')).body).live.map((k) => k.name), ['other', 'watch']);
    await writeJson(path.join(root, '.canvas', 'live.json'), { watch: liveDir });
  } finally {
    await viewer.close();
  }
});

// ---------------------------------------------------------------- in the browser

let browser;
let page;
let viewer;
let pinnedVersion;
let broot;
let bLive;
const pageErrors = [];

/** Writes a fresh build into the live kit folder the way watch mode does: each file renamed into place, kit.json last. */
async function rebuildLive(version) {
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  const staging = await fs.mkdtemp(path.join(broot, 'stage-'));
  await buildFixtureKit(staging, { version, source: { branch: 'feature/pill', dirty: true } });
  const files = (await fs.readdir(staging, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => path.relative(staging, path.join(e.parentPath ?? e.path, e.name)));
  files.sort((a, b) => (a === 'kit.json') - (b === 'kit.json'));
  for (const rel of files) {
    await fs.mkdir(path.dirname(path.join(bLive, rel)), { recursive: true });
    await fs.rename(path.join(staging, rel), path.join(bLive, rel));
  }
  await fs.rm(staging, { recursive: true, force: true });
}

const frameOf = async (file) => (await page.$(`iframe[data-board="${file}"]`))?.contentFrame();
const banner = (file) => page.textContent(`.board[data-f="${file}"] [data-test="kit-banner"]`);
async function boardText(file, selector, expected, timeout = 10000) {
  await page.waitForFunction(({ file, selector, expected }) => {
    const frame = document.querySelector(`iframe[data-board="${file}"]`);
    try { return frame?.contentDocument?.querySelector(selector)?.textContent?.trim() === expected; } catch { return false; }
  }, { file, selector, expected }, { timeout });
}
const kitVersion = (file) => page.evaluate((f) => document.querySelector(`iframe[data-board="${f}"]`)?.contentWindow?.__canvasRuntime?.kit?.manifest?.version, file);
const motionRate = (file) => page.evaluate((f) => {
  const doc = document.querySelector(`iframe[data-board="${f}"]`)?.contentDocument;
  return doc ? getComputedStyle(doc.documentElement).getPropertyValue('--canvas-motion-rate').trim() : null;
}, file);

before(async () => {
  if (skip) return;
  assert.ok(available, 'CANVAS_BROWSER_TESTS=required but the canvas tooling is not installed');
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  broot = await makeProject();
  bLive = path.join(broot, 'live-kit');
  await writeJson(path.join(broot, '.canvas', 'live.json'), { watch: bLive });
  await buildFixtureKit(path.join(broot, 'kit', 'current'));
  pinnedVersion = JSON.parse(await fs.readFile(path.join(broot, 'kit', 'current', 'kit.json'), 'utf8')).version;
  await rebuildLive('live-1');
  viewer = await startViewer({ projectRoot: broot, port: 0 });
  browser = await chromium().launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
});

after(async () => {
  await browser?.close();
  await viewer?.close();
  if (broot) await fs.rm(broot, { recursive: true, force: true });
});

test('VW-10 the home page lists every canvas by group, with links that never change', { skip }, async () => {
  await page.goto(`${viewer.origin}/`);
  await page.waitForSelector('section[data-group]');
  const groups = await page.$$eval('section[data-group]', (s) => s.map((n) => [n.dataset.group, n.querySelector('h2').textContent, [...n.querySelectorAll('[data-canvas]')].map((c) => c.dataset.canvas)]));
  assert.deepEqual(groups, [['lab', 'Labs', ['fixture']], ['exploring', 'Exploring', ['pair']], ['decided', 'Decided', ['old-choice']], ['archive', 'Archive', ['legacy']]]);
  assert.equal(await page.getAttribute('[data-canvas="pair"] a[data-go]', 'href'), '/pair/-/');
  assert.equal(await page.getAttribute('[data-canvas="fixture"] .pages a', 'href'), '/fixture/language/');
  await page.keyboard.press('/');
  await page.fill('.palette input', 'pinned kit');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${viewer.origin}/pair/-/button-pinned`);
});

test('VW-11 a pinned board and a live board of the same component sit side by side, each with its kit banner', { skip }, async () => {
  await page.goto(`${viewer.origin}/pair/-/`);
  await boardText('button-pinned.dc.html', '[data-test="button"]', 'Save changes');
  await boardText('button-live.dc.html', '[data-test="button"]', 'Save changes');
  assert.equal(await kitVersion('button-pinned.dc.html'), pinnedVersion);
  assert.equal(await kitVersion('button-live.dc.html'), 'live-1');
  assert.match(await banner('button-pinned.dc.html'), new RegExp(`^Pinned · Fixture ${pinnedVersion.replace(/\./g, '\\.')} · [0-9a-f]{7}$`));
  assert.match(await banner('button-live.dc.html'), /^Live watch · Fixture live-1 · branch feature\/pill · [0-9a-f]{7} · uncommitted changes$/);
});

test('VW-12 the properties panel edits every control shape, and the values copy as JSON', { skip }, async () => {
  await page.click('.board[data-f="button-pinned.dc.html"] .shield');
  await page.waitForSelector('[data-test="prop-label"]');
  const editors = await page.$$eval('[data-prop]', (n) => n.map((e) => [e.dataset.prop, e.tagName.toLowerCase(), e.type]));
  assert.deepEqual(editors, [['theme', 'select', 'select-one'], ['variant', 'select', 'select-one'], ['label', 'input', 'text'], ['busy', 'input', 'checkbox'], ['size', 'input', 'number']]);
  await page.fill('[data-test="prop-label"]', 'Publish');
  await boardText('button-pinned.dc.html', '[data-test="button"]', 'Publish');
  await page.fill('[data-test="prop-size"]', '3');
  await boardText('button-pinned.dc.html', '[data-test="size"]', '3');
  await page.check('[data-test="prop-busy"]');
  await page.selectOption('[data-test="prop-variant"]', 'secondary');
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-test="props-json"]').textContent).variant === 'secondary');
  const json = JSON.parse(await page.textContent('[data-test="props-json"]'));
  assert.deepEqual(json, { theme: 'light', variant: 'secondary', label: 'Publish', busy: true, size: 3 });
  assert.equal(await (await frameOf('button-live.dc.html')).textContent('[data-test="button"]'), 'Save changes', 'the other board keeps its own values');
});

test('VW-13 motion: quarter speed and pause for one board or the whole page, and replay', { skip }, async () => {
  await page.click('[data-test="motion-board-0.25"]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('iframe[data-board="button-pinned.dc.html"]').contentDocument.documentElement).getPropertyValue('--canvas-motion-rate').trim() === '0.25');
  assert.equal(await motionRate('button-live.dc.html'), '1');
  await page.click('[data-test="motion-canvas-0"]');
  for (const f of ['button-pinned.dc.html', 'button-live.dc.html']) {
    await page.waitForFunction((file) => getComputedStyle(document.querySelector(`iframe[data-board="${file}"]`).contentDocument.documentElement).getPropertyValue('--canvas-motion-rate').trim() === '0', f);
  }
  for (const f of ['button-pinned.dc.html', 'button-live.dc.html']) {
    await (await frameOf(f)).evaluate(() => { window.__motion = []; window.__canvasRuntime.on('canvas:motion', (m) => window.__motion.push(m)); });
  }
  await page.click('[data-test="motion-canvas-replay"]');
  for (const f of ['button-pinned.dc.html', 'button-live.dc.html']) {
    await (await frameOf(f)).waitForFunction(() => window.__motion.some((m) => m.replay === true && m.rate === 0));
  }
  await page.keyboard.press('Shift+P');
  for (const f of ['button-pinned.dc.html', 'button-live.dc.html']) {
    await page.waitForFunction((file) => getComputedStyle(document.querySelector(`iframe[data-board="${file}"]`).contentDocument.documentElement).getPropertyValue('--canvas-motion-rate').trim() === '1', f);
  }
});

test('VW-14 the kit switch moves one board to the live kit and back, keeping its values', { skip }, async () => {
  await page.selectOption('[data-test="board-kit"]', 'live:watch');
  await page.waitForFunction(() => document.querySelector('.board[data-f="button-pinned.dc.html"] [data-test="kit-banner"]').textContent.startsWith('Live watch'));
  await boardText('button-pinned.dc.html', '[data-test="button"]', 'Publish');
  assert.equal(await kitVersion('button-pinned.dc.html'), 'live-1');
  assert.match(await page.getAttribute('iframe[data-board="button-pinned.dc.html"]', 'src'), /\?canvas-kit=live%3Awatch$/);
  await page.selectOption('[data-test="board-kit"]', 'pinned');
  await page.waitForFunction(() => document.querySelector('.board[data-f="button-pinned.dc.html"] [data-test="kit-banner"]').textContent.startsWith('Pinned'));
  await boardText('button-pinned.dc.html', '[data-test="button"]', 'Publish');
  assert.equal(await kitVersion('button-pinned.dc.html'), pinnedVersion);
});

test('VW-15 a live kit rebuild reloads the boards on that kit only, and a board edit reloads within 2 seconds', { skip }, async (t) => {
  for (const f of ['button-pinned.dc.html', 'button-live.dc.html']) await (await frameOf(f)).evaluate(() => { window.__mark = 1; });
  await rebuildLive('live-2');
  await page.waitForFunction(() => document.querySelector('.board[data-f="button-live.dc.html"] [data-test="kit-banner"]').textContent.includes('live-2'), null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('iframe[data-board="button-live.dc.html"]').contentWindow.__canvasRuntime?.kit?.manifest?.version === 'live-2', null, { timeout: 10000 });
  assert.equal(await (await frameOf('button-live.dc.html')).evaluate(() => window.__mark), undefined, 'the live board reloaded');
  assert.equal(await (await frameOf('button-pinned.dc.html')).evaluate(() => window.__mark), 1, 'the pinned board did not');

  const file = path.join(broot, 'canvases', 'pair', 'project', 'button-live.dc.html');
  const source = await fs.readFile(file, 'utf8');
  const started = Date.now();
  await fs.writeFile(file, source.replace('"default":"Save changes"', '"default":"Save draft"'));
  await boardText('button-live.dc.html', '[data-test="button"]', 'Save draft', 2000);
  const ms = Date.now() - started;
  t.diagnostic(`board edit to reloaded board: ${ms} ms`);
  assert.ok(ms <= 2000, `reloaded in ${ms} ms`);
  assert.equal(await (await frameOf('button-pinned.dc.html')).evaluate(() => window.__mark), 1, 'a board that did not load the file stays');
  assert.deepEqual(pageErrors, [], 'no page or console errors in the viewer or its boards');
});
