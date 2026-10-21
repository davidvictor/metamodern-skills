// Render check tests in headless Chromium: each failure kind on fixture boards (a console error, a missing file, an
// image with no picture, clipped text, an empty mount), clean builder boards in light, dark and high contrast,
// screenshots, heights written back, and a lock and an archive from a real render.
// Needs the tooling: node metamodern-work-on-canvases/scripts/tooling.mjs install --browser
// Without it these tests are skipped, unless CANVAS_BROWSER_TESTS=required (CI), when they fail.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { toolingInstalled } from '../metamodern-work-on-canvases/scripts/tooling.mjs';
import { buildShowcase } from '../metamodern-work-on-canvases/assets/fixture-builder/showcase.mjs';
import { fixtureProject } from './canvas-fixture.mjs';

const required = process.env.CANVAS_BROWSER_TESTS === 'required';
const available = toolingInstalled();
const skip = !available && !required ? 'canvas tooling is not installed (node metamodern-work-on-canvases/scripts/tooling.mjs install --browser)' : false;

const board = (title, { head = '', body, logic = 'renderVals() { return {}; }', props = '{"$preview":{"width":600,"height":300}}' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="skin.css">
${head}</head>
<body>
<x-dc>
<helmet><style>body{margin:0;font:14px/20px system-ui}</style></helmet>
<div style="padding: 16px">${body}</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
class Component extends DCLogic {
  ${logic}
}
</script>
</body>
</html>
`;

const KIT_HEAD = '<link rel="stylesheet" href="ds/fixture/components/bundle.css">\n<script src="ds/fixture/components/bundle.js"></script>\n';

const FAULTS = {
  'console.dc.html': board('A console error', { body: '<p>Fine to look at</p>', logic: "componentDidMount() { console.error('Broken on purpose'); }\n  renderVals() { return {}; }" }),
  'missing.dc.html': board('A missing file', { head: '<link rel="stylesheet" href="missing.css">\n', body: '<p>Its stylesheet is missing</p>' }),
  'image.dc.html': board('An image with no picture', { body: '<p>Below is a picture</p><img src="assets/not-a-picture.png" alt="Nothing" width="40" height="40">' }),
  'clipped.dc.html': board('Clipped text', { body: '<p style="width: 80px; white-space: nowrap; overflow: hidden; margin: 0">This sentence is far too long for its box</p>' }),
  'mount.dc.html': board('An empty mount', { head: KIT_HEAD, body: '<x-import component-from-global-scope="Fixture.Missing"></x-import>' }),
  'clean.dc.html': board('A clean themed board', {
    head: KIT_HEAD,
    // Deliberate truncation (an ellipsis) and a strip that peeks past its edge are not clipped text.
    body: '<x-import component-from-global-scope="Fixture.Root" theme="{{theme}}" contrast="{{contrast}}"><x-import component-from-global-scope="Fixture.Button">Save</x-import></x-import>'
      + '<p style="width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 8px 0">A long title that ends in an ellipsis</p>'
      + '<div style="display: flex; gap: 8px; width: 200px; overflow: hidden">' + ['7:50', '8:10', '8:30', '8:50', '9:10'].map((t) => `<span style="flex: none; padding: 4px 12px; border: 1px solid">${t}</span>`).join('') + '</div>',
    logic: "renderVals() { return { theme: this.props.theme ?? 'light', contrast: this.props.contrast ?? 'standard' }; }",
    props: '{"theme":{"editor":"enum","options":["light","dark"],"default":"light"},"contrast":{"editor":"enum","options":["standard","high"],"default":"standard"},"$preview":{"width":600,"height":300}}',
  }),
};

// A board whose kit keeps its theme in localStorage: once stored, the stored theme wins over the board's own value.
// Run in a shared browser context, a dark variant would show the light theme a neighbour stored, and say so.
const THEMED = board('A theme kept in storage', {
  body: '<p>Theme kept in storage</p>',
  logic: "componentDidMount() {\n    const asked = this.props.theme ?? 'light';\n    const shown = localStorage.getItem('kit-theme') ?? asked;\n    localStorage.setItem('kit-theme', shown);\n    document.body.style.background = shown === 'dark' ? '#000' : '#fff';\n    if (shown !== asked) console.error(`showed the ${shown} theme for ${asked}`);\n  }\n  renderVals() { return { theme: this.props.theme ?? 'light' }; }",
  props: '{"theme":{"editor":"enum","options":["light","dark"],"default":"light"},"$preview":{"width":600,"height":300}}',
});

// Frames inside a board: a script-free email preview (a sandboxed srcdoc frame without allow-scripts) is clean, and
// a frame whose own script logs an error still fails the board.
const FRAMES = {
  'sandboxed.dc.html': board('A script-free email frame', {
    body: '<p>Email preview</p><iframe title="Email" sandbox="allow-same-origin" srcdoc="&lt;p&gt;Your contract renews on 17 December.&lt;/p&gt;" width="400" height="120"></iframe>',
  }),
  'scripted.dc.html': board('A frame with a broken script', {
    body: '<p>Frame preview</p><iframe title="Frame" srcdoc="&lt;script&gt;console.error(\'Frame broken on purpose\')&lt;/script&gt;" width="400" height="120"></iframe>',
  }),
};

let root;
let renderCheck;

before(async () => {
  if (skip) return;
  assert.ok(available, 'CANVAS_BROWSER_TESTS=required but the canvas tooling is not installed');
  ({ renderCheck } = await import('../metamodern-work-on-canvases/scripts/render-check.mjs'));
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  root = await fixtureProject('canvas-render-');
  await buildFixtureKit(path.join(root, 'kit', 'current'));
  const faults = path.join(root, 'canvases', 'faults', 'project');
  await fs.mkdir(path.join(faults, 'assets'), { recursive: true });
  await fs.writeFile(path.join(faults, 'assets', 'not-a-picture.png'), 'this is text, not a picture');
  const boards = {};
  let x = 0;
  for (const [file, html] of Object.entries(FAULTS)) {
    await fs.writeFile(path.join(faults, file), html);
    boards[file] = { x, y: 0, w: 600, h: 300, title: file };
    x += 680;
  }
  await fs.writeFile(path.join(faults, 'canvas.json'), JSON.stringify({ v: 3, title: 'Faults', launch: { view: 'canvas' }, pages: [], boards, order: Object.keys(boards) }));
  const storage = path.join(root, 'canvases', 'storage', 'project');
  await fs.mkdir(storage, { recursive: true });
  const stored = {};
  for (let i = 1; i <= 4; i += 1) {
    await fs.writeFile(path.join(storage, `themed-${i}.dc.html`), THEMED);
    stored[`themed-${i}.dc.html`] = { x: (i - 1) * 680, y: 0, w: 600, h: 300, title: `Themed ${i}` };
  }
  await fs.writeFile(path.join(storage, 'canvas.json'), JSON.stringify({ v: 3, title: 'Storage', launch: { view: 'canvas' }, pages: [], boards: stored, order: Object.keys(stored) }));
  const frames = path.join(root, 'canvases', 'frames', 'project');
  await fs.mkdir(frames, { recursive: true });
  const framed = {};
  let fx = 0;
  for (const [file, html] of Object.entries(FRAMES)) {
    await fs.writeFile(path.join(frames, file), html);
    framed[file] = { x: fx, y: 0, w: 600, h: 300, title: file };
    fx += 680;
  }
  await fs.writeFile(path.join(frames, 'canvas.json'), JSON.stringify({ v: 3, title: 'Frames', launch: { view: 'canvas' }, pages: [], boards: framed, order: Object.keys(framed) }));
  await buildShowcase(root);
});

after(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

const problemsOf = (report, file) => report.results.find((r) => r.file === file).variants.flatMap((v) => v.problems);

test('RC-01 the render check catches each failure kind and passes a clean board in every theme', { skip }, async () => {
  const result = await renderCheck({ projectRoot: root, canvases: ['faults'], heights: false, jobs: 4 });
  assert.equal(result.ok, false);
  const report = JSON.parse(await fs.readFile(path.join(root, '.canvas', 'render', 'faults', 'report.json'), 'utf8'));
  const only = (file, pattern) => {
    const problems = problemsOf(report, file);
    assert.ok(problems.length, `${file} fails`);
    for (const p of problems) assert.match(p, pattern, `${file}: ${problems.join(' | ')}`);
  };
  only('console.dc.html', /^console error: Broken on purpose/);
  only('missing.dc.html', /missing\.css/);
  assert.ok(problemsOf(report, 'missing.dc.html').some((p) => /^HTTP 404: /.test(p)));
  only('image.dc.html', /^image with no picture: assets\/not-a-picture\.png/);
  only('clipped.dc.html', /^clipped text: "This sentence is far too long for its box" in p \(\d+ px cut\)$/);
  assert.ok(problemsOf(report, 'mount.dc.html').some((p) => /^empty mount: Fixture\.Missing/.test(p)), problemsOf(report, 'mount.dc.html').join(' | '));
  const clean = report.results.find((r) => r.file === 'clean.dc.html');
  assert.equal(clean.ok, true, problemsOf(report, 'clean.dc.html').join(' | '));
  assert.deepEqual(clean.variants.map((v) => v.name), ['dark', 'dark-high', 'light', 'light-high']);
  for (const v of clean.variants) await fs.access(path.join(root, '.canvas', 'render', 'faults', v.screenshot));
  assert.equal(report.boards, 6);
  assert.equal(report.failed, 5);
  assert.ok(Number.isFinite(clean.ms) && clean.ms > 0, 'time per board');
  await assert.rejects(fs.access(path.join(root, 'canvases', 'faults', 'tools', 'heights.json')), 'no heights with heights: false');
});

test('RC-02 the builder\'s showcase passes in light, dark and high contrast, and heights go back to the builder', { skip }, async () => {
  const result = await renderCheck({ projectRoot: root, canvases: ['showcase'], jobs: 6 });
  const report = JSON.parse(await fs.readFile(result.canvases[0].report, 'utf8'));
  const failing = report.results.filter((r) => !r.ok).map((r) => `${r.file}: ${r.variants.flatMap((v) => v.problems).join(' | ')}`);
  assert.deepEqual(failing, []);
  assert.equal(result.ok, true);
  const lab = report.results.find((r) => r.file === 'C_button_states.dc.html');
  assert.deepEqual(lab.variants.map((v) => v.name), ['dark', 'dark-high', 'light', 'light-high']);
  assert.deepEqual(report.results.find((r) => r.file === 'P_tasks.dc.html').variants.map((v) => v.name), ['default'], 'a board with no theme control renders once');
  const heights = JSON.parse(await fs.readFile(path.join(root, 'canvases', 'showcase', 'tools', 'heights.json'), 'utf8'));
  assert.equal(Object.keys(heights).length, report.boards);
  const rebuilt = await buildShowcase(root);
  assert.ok(rebuilt.written.includes('canvas.json'), 'the measured heights change the layout');
  const canvas = JSON.parse(await fs.readFile(path.join(root, 'canvases', 'showcase', 'project', 'canvas.json'), 'utf8'));
  assert.equal(canvas.boards['F_colour.dc.html'].h, Math.ceil((heights['F_colour.dc.html'] + 8) / 10) * 10);
  const again = await renderCheck({ projectRoot: root, canvases: ['showcase'], boards: ['D_due_badges', 'L_history'], jobs: 4 });
  assert.equal(again.ok, true);
  const partial = JSON.parse(await fs.readFile(again.canvases[0].report, 'utf8'));
  assert.equal(partial.boards, report.boards, 'a run over some boards keeps the others\' results');
});

test('RC-04 each board and variant renders in its own browser context, so stored state never crosses pages', { skip }, async () => {
  const result = await renderCheck({ projectRoot: root, canvases: ['storage'], heights: false, jobs: 4 });
  const report = JSON.parse(await fs.readFile(result.canvases[0].report, 'utf8'));
  assert.equal(report.renders, 8);
  for (const entry of report.results) {
    assert.deepEqual(entry.variants.map((v) => [v.name, v.problems]), [['dark', []], ['light', []]], entry.file);
  }
  assert.equal(result.ok, true);
});

test('RC-03 a lock and an archive work from a real render', { skip }, async () => {
  const { lockSet, archiveSet, readReview } = await import('../metamodern-work-on-canvases/scripts/review-sets.mjs');
  const locked = await lockSet(root, 'tasks-due-dates', { words: 'Ship the badges.', harness: 'claude-code', date: '2026-10-20' });
  const pictures = await fs.readdir(path.join(root, 'builds', 'tasks-due-dates'));
  assert.deepEqual(pictures.sort(), ['D_due_badges.dark-high.png', 'D_due_badges.dark.png', 'D_due_badges.light-high.png', 'D_due_badges.light.png']);
  assert.ok(locked.buildNow);
  const archived = await archiveSet(root, 'tasks-history', { why: 'Held for later.', date: '2026-10-20' });
  assert.equal((await readReview(root)).sets.find((s) => s.id === 'tasks-history').status, 'archived');
  const result = await renderCheck({ projectRoot: root, canvases: ['archive'], jobs: 2 });
  assert.equal(result.ok, true, 'the archive canvas renders its pictures');
  assert.ok(archived.entry.boards[0].w > 1000, 'the picture keeps the board\'s size');
});

test('RC-05 a script-free sandboxed frame passes, and a frame whose own script logs an error still fails', { skip }, async () => {
  const result = await renderCheck({ projectRoot: root, canvases: ['frames'], heights: false, jobs: 2 });
  const report = JSON.parse(await fs.readFile(result.canvases[0].report, 'utf8'));
  assert.deepEqual(problemsOf(report, 'sandboxed.dc.html'), [], 'the render check injects nothing into a frame that may not run scripts');
  const scripted = problemsOf(report, 'scripted.dc.html');
  assert.ok(scripted.some((p) => /^console error: Frame broken on purpose/.test(p)), scripted.join(' | '));
  assert.equal(result.ok, false);
});
