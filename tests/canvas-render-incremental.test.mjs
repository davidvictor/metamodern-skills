// The fast render check: a board is keyed by everything it loaded and skipped while that is unchanged; a kit that
// declares part hashes re-checks only the boards that use the part that changed; variants switch in place unless a
// canvas asks for a reload; `canvas build` builds, checks and applies heights in one command; and a watch re-checks
// what changes. The keys and kit references are tested without a browser; the rest needs the tooling, as in
// canvas-render-check.test.mjs (CANVAS_BROWSER_TESTS=required makes a missing tooling fail).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after, before } from 'node:test';
import { toolingInstalled } from '../metamodern-work-on-canvases/scripts/tooling.mjs';
import { boardInputs, boardKey, fileHasher, kitReferences, partFor } from '../metamodern-work-on-canvases/scripts/render-check.mjs';
import { validateKitManifest } from '../metamodern-work-on-canvases/scripts/kit-contract.mjs';
import { fixtureProject, PACKAGE } from './canvas-fixture.mjs';

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
const THEMES = '{"theme":{"editor":"enum","options":["light","dark"],"default":"light"},"$preview":{"width":600,"height":300}}';

async function writeCanvas(root, id, boards) {
  const dir = path.join(root, 'canvases', id, 'project');
  await fs.mkdir(dir, { recursive: true });
  const entries = {};
  let x = 0;
  for (const [file, html] of Object.entries(boards)) {
    await fs.writeFile(path.join(dir, file), html);
    entries[file] = { x, y: 0, w: 600, h: 300, title: file };
    x += 680;
  }
  await fs.writeFile(path.join(dir, 'canvas.json'), JSON.stringify({ v: 3, title: id, launch: { view: 'canvas' }, pages: [], boards: entries, order: Object.keys(entries) }));
  return dir;
}

// ---------- keys, without a browser ----------

test('RF-01 a kit path names the part of its longest prefix', () => {
  const parts = { shared: 's', components: { Button: 'b', Screens: 'all-screens', 'Screens.Work': 'work', sample: 'data' } };
  assert.equal(partFor(parts, 'Button'), 'b');
  assert.equal(partFor(parts, 'Screens.Work'), 'work');
  assert.equal(partFor(parts, 'Screens.Home'), 'all-screens');
  assert.equal(partFor(parts, 'sample.contracts.0'), 'data');
  assert.equal(partFor(parts, 'Card'), null);
});

test('RF-02 the kit paths a board names come from its own text and the boards it imports; a bare global names the whole kit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-refs-'));
  try {
    const a = path.join(dir, 'a.dc.html');
    const b = path.join(dir, 'b.dc.html');
    await fs.writeFile(a, '<link href="ds/fixture/components/bundle.css"><x-import component-from-global-scope="Fixture.Card"></x-import><script>return { rows: window.Fixture.sample.tasks };</script>');
    await fs.writeFile(b, '<x-import component-from-global-scope="Fixture.Screens.Work"></x-import>');
    assert.deepEqual([...(await kitReferences([{ file: a }, { file: b }, { file: path.join(dir, 'x.css') }], 'Fixture'))].sort(), ['Card', 'Screens.Work', 'sample.tasks']);
    const aliased = path.join(dir, 'aliased.dc.html');
    await fs.writeFile(aliased, '<script>\n    // A screen inside a board: plain words are not the alias.\n    const A = window.Fixture;\n    const S = A.sample;\n    return { list: A.element(A.List, {}), rows: S.tasks };\n</script>');
    assert.deepEqual([...(await kitReferences([{ file: aliased }], 'Fixture'))].sort(), ['List', 'sample.tasks'], 'an alias of the global names what it reaches');
    const passed = path.join(dir, 'passed.dc.html');
    await fs.writeFile(passed, '<script>const A = window.Fixture; const S = A.sample; return draw(A, S);</script>');
    assert.equal(await kitReferences([{ file: passed }], 'Fixture'), null, 'an alias passed on whole names the whole kit');
    const bare = path.join(dir, 'bare.dc.html');
    await fs.writeFile(bare, '<script>register(window.Fixture);</script>');
    assert.equal(await kitReferences([{ file: a }, { file: bare }], 'Fixture'), null);
    const computed = path.join(dir, 'computed.dc.html');
    await fs.writeFile(computed, '<script>window.Fixture[name]</script>');
    assert.equal(await kitReferences([{ file: computed }], 'Fixture'), null);
    const copy = path.join(dir, 'copy.dc.html');
    await fs.writeFile(copy, '<p>Fixture AI keeps your contracts</p><x-import component-from-global-scope="Fixture.Card"></x-import>');
    assert.deepEqual([...(await kitReferences([{ file: copy }], 'Fixture'))], ['Card'], 'the name in copy is not a use of the global');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('RF-03 a board key changes with any input it loaded, and with only the kit parts it names when the kit declares them', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-key-'));
  try {
    const kitDir = path.join(dir, 'kit');
    await fs.mkdir(path.join(kitDir, 'components'), { recursive: true });
    const boardFile = path.join(dir, 'board.dc.html');
    const style = path.join(dir, 'style.css');
    const bundle = path.join(kitDir, 'components', 'bundle.js');
    await fs.writeFile(boardFile, '<x-import component-from-global-scope="Fixture.Card"></x-import>');
    await fs.writeFile(style, 'p { color: red }');
    await fs.writeFile(bundle, 'window.Fixture = {}');
    const inputs = [{ file: boardFile }, { file: style }, { file: bundle }];
    const facts = { engine: { package: 'x' }, board: { w: 600, h: 300 }, variants: [{ props: { theme: 'light' } }], inputs, namespace: 'Fixture' };
    const key = (extra = {}) => boardKey({ ...facts, hashFile: fileHasher(), ...extra });
    const first = await key();
    assert.equal(await key(), first, 'the same inputs give the same key');
    await fs.writeFile(style, 'p { color: blue }');
    const styled = await key();
    assert.notEqual(styled, first, 'a changed stylesheet changes the key');
    assert.notEqual(await key({ board: { w: 600, h: 320 } }), styled, 'a new height changes the key');
    assert.notEqual(await key({ variants: [{ props: { theme: 'dark' } }] }), styled, 'new variants change the key');
    await fs.writeFile(bundle, 'window.Fixture = { changed: true }');
    assert.notEqual(await key(), styled, 'without parts, any kit change changes the key');
    const parts = (card, button) => [{ dir: kitDir, parts: { shared: 'shared-1', components: { Card: card, Button: button } } }];
    const withParts = await key({ kits: parts('card-1', 'button-1') });
    await fs.writeFile(bundle, 'window.Fixture = { changed: "again" }');
    assert.equal(await key({ kits: parts('card-1', 'button-2') }), withParts, 'a change to a part the board does not name keeps its key');
    assert.notEqual(await key({ kits: parts('card-2', 'button-1') }), withParts, 'a change to a part it names changes its key');
    assert.notEqual(await key({ kits: [{ dir: kitDir, parts: { shared: 'shared-2', components: { Card: 'card-1', Button: 'button-1' } } }] }), withParts, 'a change to the shared part changes every key');
    await fs.writeFile(boardFile, '<x-import component-from-global-scope="Fixture.Table"></x-import>');
    const unnamed = await key({ kits: parts('card-1', 'button-1') });
    await fs.writeFile(bundle, 'window.Fixture = { changed: "once more" }');
    assert.notEqual(await key({ kits: parts('card-1', 'button-1') }), unnamed, 'a board naming a path with no part is keyed by the whole kit');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('RF-04 a board\'s inputs are the files its requests resolve to; a request to another origin makes it unkeyable', () => {
  const projectRoot = '/p';
  const config = { canvases: 'canvases', kit: { namespace: 'Fixture', pinned: 'kit/current' }, skin: 'skin/board.css' };
  const options = { origin: 'http://127.0.0.1:9', projectRoot, config, canvasDirs: { c: '/p/canvases/c' }, kit: 'pinned', liveKits: {} };
  const inputs = boardInputs([
    'http://127.0.0.1:9/c/project/a.dc.html?canvas-props=%7B%7D',
    'http://127.0.0.1:9/c/project/skin.css',
    'http://127.0.0.1:9/c/project/ds/fixture/components/bundle.js',
    'http://127.0.0.1:9/c/project/assets/x.png',
    'http://127.0.0.1:9/c/project/assets/x.png',
    'data:image/png;base64,AAAA',
  ], options);
  assert.deepEqual(inputs.map((i) => i.file), ['/p/canvases/c/project/a.dc.html', '/p/canvases/c/project/assets/x.png', '/p/kit/current/components/bundle.js', '/p/skin/board.css']);
  assert.equal(boardInputs(['https://example.com/font.woff2'], options), null);
});

test('RF-05 kit.json may declare part hashes, and they must be well formed', () => {
  const kit = { schema: 'canvas-kit/1', namespace: 'Fixture', version: '1', source: { repo: 'o/r', commit: 'a'.repeat(40), dirty: false }, inputs: ['src'], builtAt: '2026-10-21T00:00:00Z', react: '19.2.0' };
  assert.deepEqual(validateKitManifest(kit), []);
  assert.deepEqual(validateKitManifest({ ...kit, parts: { shared: 'sha256:1', components: { Button: 'sha256:2', 'Screens.Work': 'sha256:3' } } }), []);
  assert.ok(validateKitManifest({ ...kit, parts: { components: { Button: 'x' } } }).some((i) => /parts\.shared/.test(i)));
  assert.ok(validateKitManifest({ ...kit, parts: { shared: 'x', components: { 'not a path': 'x' } } }).some((i) => /parts\.components/.test(i)));
  assert.deepEqual(validateKitManifest({ ...kit, parts: { shared: 's', components: { Example: 'e', 'Example#button:styles': 'e1', 'Scene#ai.home': 'h' }, selectors: { Example: 'example', Scene: 'id' } } }), [], 'a part per thing a selector component shows');
  assert.ok(validateKitManifest({ ...kit, parts: { shared: 's', components: { 'Example#a': 'x' } } }).some((i) => /needs parts\.selectors\.Example/.test(i)));
  assert.ok(validateKitManifest({ ...kit, parts: { shared: 's', components: {}, selectors: { Example: 'not a prop' } } }).some((i) => /parts\.selectors\.Example/.test(i)));
});

async function referencesOf(files, options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-refs-'));
  try {
    const inputs = [];
    for (const [i, text] of files.entries()) {
      const file = path.join(dir, `${i}.dc.html`);
      await fs.writeFile(file, text);
      inputs.push({ file });
    }
    const refs = await kitReferences(inputs, 'Fixture', options);
    return refs && [...refs].sort();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('RF-13 element and mount with a literal name name that path; a computed name names the whole kit', async () => {
  assert.deepEqual(await referencesOf(['<script>const Kit = window.Fixture; return { badge: Kit.element(\'Badge\', { tone: f(1, 2) }), pill: Kit.element("Marketing.Pill"), icon: window.Fixture.element(`Fixture.Icon`, {}), img: Kit.element(\'img\', { src: \'a.png\' }), list: Kit.element(Kit.List, {}) };</script>']), ['Badge', 'Icon', 'List', 'Marketing.Pill'], 'element names its literal path (a plain tag names none), and element itself needs no part');
  assert.deepEqual(await referencesOf(['<script>const A = window.Fixture; A.mount(document.querySelector(\'#x\'), \'Fixture.Button\', { label: \'Save\' }); Fixture.mount(el, "Screens.Work");</script>']), ['Button', 'Screens.Work'], 'mount names the path it is given second');
  for (const computed of [
    "const A = window.Fixture; A.element('Marketing.' + n, {});",
    'const A = window.Fixture; A.element(n, {});',
    'const A = window.Fixture; A.mount(el, name);',
    "const Kit = window.Fixture; const K = ((n, p) => Kit.element(n, p || {})); K('Badge', {});",
    "const Kit = window.Fixture; return ((n, p) => Kit.element(n, p || {}))('Badge', {});",
    'const A = window.Fixture; const make = A.element; make(x);',
  ]) assert.equal(await referencesOf([`<script>${computed}</script>`]), null, computed);
});

test('RF-14 a selector component names the one thing its prop picks, by a part of its own when the kit declares one', async () => {
  const selectors = { Example: 'example', Scene: 'id' };
  const boards = [
    '<x-import component-from-global-scope="Fixture.Example" example="button:styles"></x-import>',
    '<x-import component-from-global-scope="Fixture.Scene" id="ai.home" state="current" theme="{{theme}}"></x-import>',
  ];
  assert.deepEqual(await referencesOf(boards, { selectors }), ['Example#button:styles', 'Scene#ai.home']);
  assert.deepEqual(await referencesOf(boards), ['Example', 'Scene'], 'without selectors from the kit, the component as a whole');
  assert.deepEqual(await referencesOf(['<x-import component-from-global-scope="Fixture.Scene" id="{{scene}}"></x-import>'], { selectors }), ['Scene'], 'a computed pick names the component as a whole');
  const parts = { shared: 's', components: { Example: 'all-examples', 'Example#button:styles': 'button-styles' }, selectors: { Example: 'example' } };
  assert.equal(partFor(parts, 'Example#button:styles'), 'button-styles');
  assert.equal(partFor(parts, 'Example#card:default'), 'all-examples', 'a thing with no part of its own is held by the component\'s part');
  assert.equal(partFor({ shared: 's', components: { Button: 'b' } }, 'Example#card:default'), null);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-key-'));
  try {
    const kitDir = path.join(dir, 'kit');
    await fs.mkdir(kitDir);
    const boardFile = path.join(dir, 'board.dc.html');
    await fs.writeFile(boardFile, boards[0]);
    const inputs = [{ file: boardFile }, { file: path.join(kitDir, 'bundle.js') }];
    const key = (components) => boardKey({ engine: {}, board: {}, variants: [], inputs, hashFile: fileHasher(), namespace: 'Fixture', kits: [{ dir: kitDir, parts: { ...parts, components: { ...parts.components, ...components } } }] });
    const first = await key({});
    assert.equal(await key({ Example: 'all-examples-2', 'Example#card:default': 'card-2' }), first, 'another example changing keeps the key');
    assert.notEqual(await key({ 'Example#button:styles': 'button-styles-2' }), first, 'its own example changing changes it');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('RF-15 an alias of a path in the kit names the paths under it', async () => {
  assert.deepEqual(await referencesOf(['<script>const Kit = window.Fixture;\nconst S = Kit.sample;\nconst C = S.contracts;\nreturn { rows: S.tasks.slice(0, 3), first: C.first };</script>']), ['sample.contracts.first', 'sample.tasks.slice']);
  assert.deepEqual(await referencesOf(['<script>const S = Fixture.sample; return { all: draw(S) };</script>']), ['sample'], 'passed on whole, it names its path, not the whole kit');
  assert.deepEqual(await referencesOf(['<script>const Kit = window.Fixture; const S = Kit.sample; return {};</script><x-import component-from-global-scope="Fixture.Card"></x-import>']), ['Card'], 'an alias never used names nothing');
  assert.deepEqual(await referencesOf(['<script>const Kit = window.Fixture; const B = Kit.Button; return { el: Kit.element(B, {}) };</script>']), null, 'an alias given to element as a value is a name it cannot read');
});

// ---------- the check, in a browser ----------

let root;
let renderCheck;
let buildAndCheck;
let watchRender;

before(async () => {
  if (skip) return;
  assert.ok(available, 'CANVAS_BROWSER_TESTS=required but the canvas tooling is not installed');
  ({ renderCheck, buildAndCheck, watchRender } = await import('../metamodern-work-on-canvases/scripts/render-check.mjs'));
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  root = await fixtureProject('canvas-render-fast-');
  await buildFixtureKit(path.join(root, 'kit', 'current'));
  const dir = await writeCanvas(root, 'steady', {
    'plain.dc.html': board('Plain', { body: '<p>Nothing loaded but the runtime</p>' }),
    'styled.dc.html': board('Styled', { head: '<link rel="stylesheet" href="style.css">\n', body: '<p class="note">Styled</p>' }),
    'card.dc.html': board('A card', { head: KIT_HEAD, body: '<x-import component-from-global-scope="Fixture.Root" theme="{{theme}}"><x-import component-from-global-scope="Fixture.Card" title="Card"></x-import></x-import>', props: THEMES, logic: "renderVals() { return { theme: this.props.theme ?? 'light' }; }" }),
    'button.dc.html': board('A button', { head: KIT_HEAD, body: '<x-import component-from-global-scope="Fixture.Root" theme="{{theme}}"><x-import component-from-global-scope="Fixture.Button">Save</x-import></x-import>', props: THEMES, logic: "renderVals() { return { theme: this.props.theme ?? 'light' }; }" }),
  });
  await fs.writeFile(path.join(dir, 'style.css'), '.note { color: #333 }');
});

after(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

const reportOf = async (result) => JSON.parse(await fs.readFile(result.canvases[0].report, 'utf8'));

test('RF-06 a board that passed is skipped while everything it loaded is unchanged, and checked again when anything changes', { skip }, async () => {
  const first = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  assert.equal(first.ok, true);
  assert.deepEqual([first.checked, first.reused], [4, 0]);
  const again = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  assert.deepEqual([again.checked, again.reused], [0, 4], 'nothing changed');
  const report = await reportOf(again);
  assert.equal(report.boards, 4);
  assert.ok(report.results.every((r) => r.reused && r.ok));
  for (const r of report.results) for (const v of r.variants) await fs.access(path.join(root, '.canvas', 'render', 'steady', v.screenshot));

  await fs.writeFile(path.join(root, 'canvases', 'steady', 'project', 'style.css'), '.note { color: #111 }');
  const styled = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  assert.deepEqual((await reportOf(styled)).results.filter((r) => !r.reused).map((r) => r.file), ['styled.dc.html'], 'only the board that loads the stylesheet');

  const bundle = path.join(root, 'kit', 'current', 'components', 'bundle.js');
  await fs.appendFile(bundle, '\n// a kit sync\n');
  const synced = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  assert.deepEqual((await reportOf(synced)).results.filter((r) => !r.reused).map((r) => r.file).sort(), ['button.dc.html', 'card.dc.html'], 'a kit without parts re-checks every board that loads it');

  const forced = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4, force: true });
  assert.deepEqual([forced.checked, forced.reused], [4, 0], '--force checks every board');
  const named = await renderCheck({ projectRoot: root, canvases: ['steady'], boards: ['plain'], heights: false, jobs: 4 });
  assert.deepEqual([named.checked, (await reportOf(named)).boards], [1, 4], 'a named board is always checked, and the others keep their results');
});

test('RF-07 with part hashes in kit.json, a kit sync re-checks only the boards that use the part that changed', { skip }, async () => {
  const kitFile = path.join(root, 'kit', 'current', 'kit.json');
  const kit = JSON.parse(await fs.readFile(kitFile, 'utf8'));
  const write = (card, button) => fs.writeFile(kitFile, JSON.stringify({ ...kit, parts: { shared: 'shared-1', components: { Root: 'root-1', Card: card, Button: button } } }, null, 2));
  await write('card-1', 'button-1');
  await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  const bundle = path.join(root, 'kit', 'current', 'components', 'bundle.js');
  await fs.appendFile(bundle, '\n// the button changed\n');
  await write('card-1', 'button-2');
  const result = await renderCheck({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 4 });
  assert.equal(result.ok, true);
  assert.deepEqual((await reportOf(result)).results.filter((r) => !r.reused).map((r) => r.file), ['button.dc.html']);
  await fs.writeFile(kitFile, JSON.stringify(kit, null, 2));
});

test('RF-08 variants switch in place, each with its own problems, unless the canvas asks for a reload', { skip }, async () => {
  // Logs an error when it mounts in the dark theme: a fresh dark load sees it, a switch in place does not remount.
  const mountsDark = board('Reads its theme when it mounts', {
    body: '<p>{{theme}}</p>',
    logic: "componentDidMount() { if (this.props.theme === 'dark') console.error('mounted dark'); }\n  renderVals() { return { theme: this.props.theme }; }",
    props: THEMES,
  });
  // Logs an error whenever it draws dark: in place, the error belongs to the dark variant only.
  const drawsDark = board('Fails in the dark theme', {
    body: '<p>{{theme}}</p>',
    logic: "renderVals() { if (this.props.theme === 'dark') console.error('drew dark'); return { theme: this.props.theme }; }",
    props: THEMES,
  });
  await writeCanvas(root, 'variants', { 'mounts.dc.html': mountsDark, 'draws.dc.html': drawsDark });
  const problems = (report, file) => Object.fromEntries(report.results.find((r) => r.file === file).variants.map((v) => [v.name, v.problems]));
  const inPlace = await reportOf(await renderCheck({ projectRoot: root, canvases: ['variants'], heights: false, jobs: 2 }));
  assert.deepEqual(problems(inPlace, 'mounts.dc.html'), { dark: [], light: [] });
  assert.deepEqual(problems(inPlace, 'draws.dc.html'), { dark: ['console error: drew dark'], light: [] });
  await fs.mkdir(path.join(root, 'canvases', 'variants', 'tools'), { recursive: true });
  await fs.writeFile(path.join(root, 'canvases', 'variants', 'tools', 'render.json'), JSON.stringify({ reload: true }));
  const reloaded = await reportOf(await renderCheck({ projectRoot: root, canvases: ['variants'], heights: false, jobs: 2 }));
  assert.deepEqual(problems(reloaded, 'mounts.dc.html'), { dark: ['console error: mounted dark'], light: [] }, 'reload: true loads each variant afresh, and the key changes with it');
  assert.deepEqual(problems(reloaded, 'draws.dc.html'), { dark: ['console error: drew dark'], light: [] });
});

test('RF-09 canvas build runs the builder, checks, and applies measured heights in the same command', { skip }, async () => {
  const canvasDir = path.join(root, 'canvases', 'tall');
  await fs.mkdir(path.join(canvasDir, 'tools'), { recursive: true });
  const builder = pathToFileURL(path.join(PACKAGE, 'scripts', 'board-builder.mjs')).href;
  await fs.writeFile(path.join(canvasDir, 'tools', 'build.mjs'), `import { buildCanvas } from ${JSON.stringify(builder)};
const body = '<div style="height: 640px">Taller than the board was drawn</div>';
const result = await buildCanvas({ canvasDir: ${JSON.stringify(canvasDir)}, spec: { title: 'Tall', pages: [{ id: 'home', name: 'Home', header: false, boards: [{ file: 'tall.dc.html', title: 'Tall', w: 800, h: 300, shell: { kind: 'spec', body } }] }] } });
console.log(\`tall: \${result.written.length} written\`);
`);
  const lines = [];
  const result = await buildAndCheck({ projectRoot: root, canvases: ['tall'], jobs: 2, log: (line) => lines.push(line) });
  assert.equal(result.ok, true, lines.join('\n'));
  assert.ok(lines.some((l) => /building again with the measured heights/.test(l)), lines.join('\n'));
  const canvas = JSON.parse(await fs.readFile(path.join(canvasDir, 'project', 'canvas.json'), 'utf8'));
  assert.ok(canvas.boards['tall.dc.html'].h > 640, `the height applied: ${canvas.boards['tall.dc.html'].h}`);
  const again = await buildAndCheck({ projectRoot: root, canvases: ['tall'], jobs: 2 });
  assert.deepEqual([again.ok, again.checked], [true, 0], 'a second build changes nothing and checks nothing');
  await assert.rejects(buildAndCheck({ projectRoot: root, canvases: ['steady'] }), /has no builder script/);
});

test('RF-10 a watch checks again when a board changes, and only that board', { skip }, async () => {
  const results = [];
  let notify = () => {};
  const watcher = await watchRender({ projectRoot: root, canvases: ['steady'], heights: false, jobs: 2, onResult: (r) => { results.push(r); notify(); } });
  try {
    assert.equal(results.length, 1);
    const changed = new Promise((resolve) => { notify = resolve; });
    await fs.writeFile(path.join(root, 'canvases', 'steady', 'project', 'plain.dc.html'), board('Plain', { body: '<p>Changed while watched</p>' }));
    await Promise.race([changed, new Promise((_, reject) => setTimeout(() => reject(new Error('no check after the change')), 20000))]);
    assert.deepEqual([results[1].checked, results[1].ok], [1, true]);
  } finally {
    await watcher.close();
  }
});

test('RF-11 part hashes from a module graph change only for the parts whose modules changed', async () => {
  const { partHashes } = await import('../metamodern-work-on-canvases/scripts/kit-contract.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-parts-'));
  try {
    const files = { 'entry.js': 'entry', 'root.js': 'root', 'button.js': 'button', 'card.js': 'card', 'icon.js': 'icon', 'bundle.css': 'css' };
    for (const [file, text] of Object.entries(files)) await fs.writeFile(path.join(dir, file), text);
    const metafile = { inputs: {
      'entry.js': { imports: [{ path: 'root.js' }, { path: 'button.js' }, { path: 'card.js' }] },
      'root.js': { imports: [] },
      'button.js': { imports: [{ path: 'icon.js' }] },
      'card.js': { imports: [] },
      'icon.js': { imports: [] },
    } };
    const hashes = () => partHashes({ metafile, root: dir, shared: ['root.js', 'bundle.css'], components: { Button: ['button.js'], Card: ['card.js'], Icon: ['icon.js'] } });
    const before = await hashes();
    await fs.writeFile(path.join(dir, 'icon.js'), 'icon, changed');
    const after = await hashes();
    assert.equal(after.shared, before.shared);
    assert.equal(after.components.Card, before.components.Card);
    assert.notEqual(after.components.Icon, before.components.Icon);
    assert.notEqual(after.components.Button, before.components.Button, 'a part changes with the modules it imports');
    await fs.writeFile(path.join(dir, 'bundle.css'), 'css, changed');
    assert.notEqual((await hashes()).shared, after.shared, 'an output file in shared is hashed by content');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('RF-12 a failing board is reused while its inputs are unchanged, unless its failure can pass by itself', { skip }, async () => {
  const broken = board('Broken', { body: '<p>Broken</p>', logic: "componentDidMount() { console.error('broken on purpose'); }\n  renderVals() { return {}; }" });
  // No runtime: it never becomes ready, which a busy machine can also cause.
  const unready = board('No runtime', { body: '<p>No runtime</p>' }).replace('<script src="./support.js"></script>\n', '');
  await writeCanvas(root, 'failing', { 'broken.dc.html': broken, 'unready.dc.html': unready });
  const run = () => renderCheck({ projectRoot: root, canvases: ['failing'], heights: false, jobs: 2, timeout: 2000 });
  const first = await run();
  assert.deepEqual([first.ok, first.checked], [false, 2]);
  const again = await run();
  assert.equal(again.ok, false, 'a reused failure still fails the run');
  const report = await reportOf(again);
  assert.deepEqual(report.results.filter((r) => !r.reused).map((r) => r.file), ['unready.dc.html']);
  assert.match(report.results.find((r) => r.file === 'broken.dc.html').variants[0].problems[0], /broken on purpose/);
});
