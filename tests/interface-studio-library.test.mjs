import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const skill = new URL('../metamodern-interface-studio/', import.meta.url);
const shell = new URL('./assets/studio-shell/', skill);
const read = (path) => readFileSync(new URL(path, shell), 'utf8');

/** Load a pure shell module (it may import types only) without a TypeScript toolchain. */
async function loadPure(path) {
  const dir = mkdtempSync(join(tmpdir(), 'studio-library-'));
  const file = join(dir, `${basename(path).replace(/\.tsx?$/, '')}.mjs`);
  writeFileSync(file, stripTypeScriptTypes(read(path), { mode: 'strip', sourceMap: false }));
  return import(`${pathToFileURL(file).href}?${Date.now()}`);
}

const lib = {
  groups: [{ id: 'actions', label: 'Actions' }, { id: 'inputs', label: 'Inputs' }],
  components: [
    { id: 'button', label: 'Button', group: 'actions', summary: 'Starts an action.', keywords: ['cta'] },
    { id: 'text-field', label: 'Text field', group: 'inputs', summary: 'One line of typed text.', keywords: ['textbox'] },
    { id: 'icon-button', label: 'Icon button', group: 'actions', summary: 'An action shown as an icon.' },
  ],
};

test('LM-01 the declaration is checked, grouped in declared order and searched on every field', async () => {
  const { libraryProblems, groupedComponents, filterComponents } = await loadPure('src/studio/library/model.ts');
  assert.deepEqual(libraryProblems(undefined), []);
  assert.deepEqual(libraryProblems(lib), []);
  const bad = {
    groups: [{ id: 'Actions', label: '' }, { id: 'Actions', label: 'Again' }],
    components: [{ id: 'button', label: 'Button', group: 'nope', summary: 'x'.repeat(201) }, { id: 'button', label: ' ', group: 'Actions', summary: '' }],
  };
  const problems = libraryProblems(bad).join('\n');
  for (const text of ['Group ID "Actions" must be lowercase', 'Group ID "Actions" is declared twice', 'Group "Actions" has no label', 'names group "nope"', 'summary over 200 characters', 'Component ID "button" is declared twice', 'Component "button" has no label']) assert.ok(problems.includes(text), `missing: ${text}`);
  assert.match(libraryProblems({ groups: [{ id: 'a', label: 'A' }], components: [] }).join(), /declares no components/);
  assert.deepEqual(groupedComponents(lib).map((g) => `${g.label}:${g.components.map((c) => c.id).join('|')}`), ['Actions:button|icon-button', 'Inputs:text-field']);
  assert.deepEqual(filterComponents(lib, '  ').map((c) => c.id), ['button', 'text-field', 'icon-button']);
  assert.deepEqual(filterComponents(lib, 'TEXTBOX').map((c) => c.id), ['text-field'], 'keywords are searched');
  assert.deepEqual(filterComponents(lib, 'icon action').map((c) => c.id), ['icon-button'], 'every word must match');
  assert.deepEqual(filterComponents(lib, 'inputs').map((c) => c.id), ['text-field'], 'the group label is searched');
  assert.deepEqual(groupedComponents(lib, filterComponents(lib, 'cta')).map((g) => g.id), ['actions'], 'empty groups are left out');
});

test('LM-02 links name a component and a section; a module link wins, and an unknown component is reported', async () => {
  const { parseLibraryLink, SECTION_IDS } = await loadPure('src/studio/library/link.ts');
  const { SECTIONS } = await loadPure('src/studio/library/model.ts');
  assert.deepEqual([...SECTION_IDS], SECTIONS.map((s) => s.id), 'link.ts and model.ts list the same sections');
  assert.deepEqual(SECTIONS.map((s) => s.label), ['Preview', 'When to use', 'When not to use', 'Usage', 'Examples', 'API reference', 'Keyboard', 'Accessibility', 'Motion', 'Responsive behavior', 'Performance', 'Notes for AI']);
  assert.deepEqual(parseLibraryLink('#library=button', lib), { library: 'button', at: null });
  assert.deepEqual(parseLibraryLink('#library=button&section=api&theme=dark', lib), { library: 'button', at: 'api' });
  assert.deepEqual(parseLibraryLink('#library=button&section=installation', lib), { library: 'button', at: null });
  assert.deepEqual(parseLibraryLink('#library=nope', lib), { library: null, at: null, unknown: 'nope' });
  assert.deepEqual(parseLibraryLink('#module=site&library=button', lib), { library: null, at: null });
  assert.deepEqual(parseLibraryLink('#view=inspect', lib), { library: null, at: null });
  assert.deepEqual(parseLibraryLink('#library=button', undefined), { library: null, at: null, unknown: 'button' });
});

test('LM-03 previews load only from the adapter entry on the frame origin; captures only from the Studio or inline', async () => {
  const { previewSource, captureSource, NO_FRAME } = await loadPure('src/studio/library/model.ts');
  const page = 'http://127.0.0.1:4000/studio/index.html';
  assert.deepEqual(previewSource({ frameEntry: './example/index.html' }, page), { src: 'http://127.0.0.1:4000/studio/example/index.html', origin: undefined });
  assert.deepEqual(previewSource({ frameEntry: './example/index.html', library: { ...lib, entry: './example/library/frame.html' } }, page), { src: 'http://127.0.0.1:4000/studio/example/library/frame.html', origin: undefined });
  const fixture = { frameEntry: 'http://[::1]:3123/studio-frame', frameOrigin: 'http://[::1]:3123' };
  assert.deepEqual(previewSource({ ...fixture, library: { ...lib, entry: 'http://[::1]:3123/kit-frame' } }, page), { src: 'http://[::1]:3123/kit-frame', origin: 'http://[::1]:3123' });
  for (const entry of ['http://[::1]:3999/kit-frame', 'https://example.com/kit', '/kit-frame', 'javascript:alert(1)', 'data:text/html,hi']) {
    assert.match(previewSource({ ...fixture, library: { ...lib, entry } }, page).unavailable, /must be on the frame entry's origin/, entry);
  }
  assert.match(previewSource({ ...fixture, library: { ...lib, entry: 'http://[bad' } }, page).unavailable, /is not a URL/);
  assert.deepEqual(previewSource({}, page), { unavailable: NO_FRAME });
  // An exported Studio opened from files: the frame entry and the library entry share the file's opaque origin.
  assert.deepEqual(previewSource({ frameEntry: './frame.html', frameOrigin: 'null', library: { ...lib, entry: './kit-frame.html' } }, 'file:///export/index.html'), { src: 'file:///export/kit-frame.html', origin: 'null' });
  assert.match(previewSource({ frameEntry: './frame.html', frameOrigin: 'null', library: { ...lib, entry: 'data:text/html,hi' } }, 'file:///export/index.html').unavailable, /must be on the frame entry's origin/);
  assert.equal(captureSource('./assets/pressed.png', page), 'http://127.0.0.1:4000/studio/assets/pressed.png');
  assert.equal(captureSource('data:image/svg+xml,%3Csvg%2F%3E', page), 'data:image/svg+xml,%3Csvg%2F%3E');
  for (const src of ['https://example.com/a.png', '//example.com/a.png', 'data:text/html,<b>x</b>', 'javascript:alert(1)']) assert.equal(captureSource(src, page), null, src);
});

test('LM-04 playground values are declared, validated and complete', async () => {
  const { playgroundValue, playgroundValues } = await loadPure('src/studio/library/model.ts');
  const props = [
    { id: 'label', label: 'Label', kind: 'text', default: 'Save changes', maxLength: 12 },
    { id: 'variant', label: 'Variant', kind: 'select', default: 'primary', options: [{ id: 'primary', label: 'Primary' }, { id: 'danger', label: 'Danger' }] },
    { id: 'disabled', label: 'Disabled', kind: 'switch', default: false },
    { id: 'gap', label: 'Gap', kind: 'number', default: 8, min: 0, max: 10, step: 4 },
  ];
  assert.deepEqual(playgroundValues(props, undefined), { label: 'Save changes', variant: 'primary', disabled: false, gap: 8 });
  assert.deepEqual(playgroundValues(props, { label: 'Publish', variant: 'danger', disabled: true, gap: 3, extra: 'x', __proto__: { polluted: true } }), { label: 'Publish', variant: 'danger', disabled: true, gap: 4 });
  assert.deepEqual(playgroundValues(props, { label: 'x'.repeat(13), variant: 'ghost', disabled: 'true', gap: Infinity }), { label: 'Save changes', variant: 'primary', disabled: false, gap: 8 }, 'invalid edits fall back to the default');
  assert.equal(playgroundValue(props[0], 'two\nlines'), undefined);
  assert.equal(playgroundValue(props[3], 11), undefined, 'out of range');
  assert.equal(playgroundValue(props[3], 10), 8, 'a snapped value never passes max');
  assert.equal(playgroundValue({ id: 'n', label: 'N', kind: 'number', default: 1 }, 2.5), 2.5, 'no step keeps the value');
  assert.equal(playgroundValue(props[1], { toString: () => 'primary' }), undefined, 'objects never pass');
});

test('LM-05 documentation is checked before a page renders it', async () => {
  const { docsProblems } = await loadPure('src/studio/library/model.ts');
  const ok = {
    preview: {
      playground: { scenario: 'button:playground', width: 560, height: 160, properties: [{ id: 'label', label: 'Label', kind: 'text', default: 'Save' }] },
      groups: [{ id: 'styles', label: 'Styles', scenario: 'button:styles', width: 560, height: 120 }, { id: 'pressed', label: 'Pressed', capture: { src: 'data:image/png;base64,AA', alt: 'Pressed' }, width: 400, height: 120 }],
    },
    examples: { items: [{ id: 'with-icon', label: 'With an icon', scenario: 'button:with-icon', width: 560, height: 140 }] },
  };
  assert.deepEqual(docsProblems(ok), []);
  assert.deepEqual(docsProblems(null), ["The documentation module's default export is not an object"]);
  assert.deepEqual(docsProblems({}), ['The documentation has no preview (preview.groups)']);
  const bad = {
    preview: {
      playground: { scenario: '', width: 0, height: 160, properties: [{ id: '__proto__', label: 'P', kind: 'text', default: 'x' }, { id: 'size', label: 'Size', kind: 'select', default: 'huge', options: [{ id: 'small', label: 'Small' }] }, { id: 'size', label: 'Again', kind: 'switch', default: false }] },
      groups: [{ id: 'Styles', label: 'Styles', scenario: 'x', width: 4001, height: 10 }, { id: 'playground', label: 'P', scenario: 'x', width: 10, height: 10 }, { id: 'shot', label: 'Shot', capture: { src: 'a.png', alt: ' ' }, width: 10, height: 10 }],
    },
    examples: { items: [{ id: 'shot', label: 'Again', scenario: 'x', width: 10, height: 10 }] },
  };
  const text = docsProblems(bad).join('\n');
  for (const piece of ['Playground: width must be a whole number', 'Playground: scenario must be a short string', 'Playground property "__proto__" must start with a lowercase letter', 'Playground property "size": its default is not a value it accepts', 'Playground property "size" is listed twice', 'Preview group "Styles": ID must be lowercase', 'Preview group "Styles": width must be a whole number', 'Preview group "playground": the ID is reserved for the playground', 'Preview group "shot": a capture needs alt text', 'Example "shot" is listed twice']) assert.ok(text.includes(piece), `missing: ${piece}`);
});

test('LM-06 at most LIVE_FRAMES previews are live, nearest first, the playground preferred, only near ones', async () => {
  const { pickLive, LIVE_FRAMES, libraryProfile } = await loadPure('src/studio/library/model.ts');
  assert.equal(LIVE_FRAMES, 4);
  const slots = [
    { id: 'far', near: false, distance: 10 },
    { id: 'a', near: true, distance: 300 },
    { id: 'b', near: true, distance: 100 },
    { id: 'c', near: true, distance: 200 },
    { id: 'd', near: true, distance: 400 },
    { id: 'playground', near: true, distance: 900, pinned: true },
  ];
  assert.deepEqual([...pickLive(slots)].sort(), ['a', 'b', 'c', 'playground']);
  assert.deepEqual([...pickLive(slots, 2)].sort(), ['b', 'playground']);
  assert.deepEqual([...pickLive(slots, 0)], []);
  assert.deepEqual([...pickLive([{ id: 'p', near: false, distance: 0, pinned: true }])], [], 'a pinned preview far away stays a placeholder');
  const profiles = [{ id: 'phone', kind: 'phone' }, { id: 'desktop', kind: 'desktop' }];
  assert.equal(libraryProfile(profiles), 'desktop');
  assert.equal(libraryProfile(profiles, 'phone'), 'phone', 'the adapter default wins');
  assert.equal(libraryProfile([{ id: 'phone', kind: 'phone' }]), 'phone');
});

test('LM-08 the build reads the component IDs src/library/index.ts documents, or says why it cannot', async () => {
  const { definedDocs, undeclaredDocs } = await loadPure('src/studio/library/model.ts');
  const loader = (path) => ({ type: 'ArrowFunctionExpression', body: { type: 'ImportExpression', source: { type: 'Literal', value: path } } });
  const key = (name, literal) => ({ type: 'Property', computed: false, key: literal ? { type: 'Literal', value: name } : { type: 'Identifier', name }, value: loader(`./${name}`) });
  const define = (...props) => ({ type: 'CallExpression', callee: { type: 'Identifier', name: 'defineLibrary' }, arguments: [{ type: 'ObjectExpression', properties: props }] });
  const program = (...calls) => ({ type: 'Program', body: calls.map((expression) => ({ type: 'ExportDefaultDeclaration', declaration: expression })) });
  assert.deepEqual(definedDocs(program(define())), []);
  assert.deepEqual(definedDocs(program(define(key('button'), key('text-field', true)))), ['button', 'text-field']);
  assert.match(definedDocs(program(define({ type: 'SpreadElement', argument: { type: 'Identifier', name: 'more' } }))), /without spreads or computed keys/);
  assert.match(definedDocs(program({ type: 'CallExpression', callee: { type: 'Identifier', name: 'defineLibrary' }, arguments: [{ type: 'Identifier', name: 'docs' }] })), /takes an object literal/);
  assert.match(definedDocs({ type: 'Program', body: [] }), /does not call defineLibrary/);
  assert.match(definedDocs(program(define(key('a')), define(key('b')))), /called more than once/);
  assert.deepEqual(undeclaredDocs(lib, ['button', 'orphan']), ['orphan']);
  assert.deepEqual(undeclaredDocs(undefined, ['button']), ['button']);
});

test('LM-09 the library model files stay pure and the adapter type declares the library', () => {
  for (const path of ['src/studio/library/model.ts', 'src/studio/library/link.ts', 'src/studio/library/schema.ts']) assert.doesNotMatch(read(path), /^import (?!type )/m, `${path} may import types only`);
  const types = read('src/studio/types.ts');
  assert.match(types, /library\?: LibraryDeclaration/);
  assert.match(types, /export type LibraryDeclaration = \{/);
});

test('LM-07 code is tokenized losslessly into kinds the page draws as text', async () => {
  const { tokenize } = await loadPure('src/studio/library/highlight.ts');
  const samples = [
    ['tsx', 'import { Button } from "./button"\n// Save\nconst size = 2\nexport const Save = () => <Button variant="primary">Save</Button>'],
    ['html', '<!-- note -->\n<button class="btn" disabled>Save</button>'],
    ['css', '/* ring */\n.btn { padding: 9px 14px; --ex-radius: 10px; }'],
    ['json', '{ "size": 2, "on": true, "name": "x" }'],
    ['bash', '# install\nnpm run acceptance | tee log'],
    ['text', 'plain words <b>'],
  ];
  for (const [language, code] of samples) {
    const tokens = tokenize(code, language);
    assert.equal(tokens.map((t) => t.text).join(''), code, `${language} round-trips`);
    assert.ok(tokens.every((t, i) => t.text && !(t.kind === 'plain' && tokens[i + 1]?.kind === 'plain')), `${language} merges plain runs`);
  }
  const kinds = (code, language) => tokenize(code, language).filter((t) => t.kind !== 'plain' && t.kind !== 'punct').map((t) => `${t.kind}:${t.text}`);
  assert.deepEqual(kinds('const a = "b" // c', 'tsx'), ['keyword:const', 'string:"b"', 'comment:// c']);
  assert.ok(kinds('<Button size="sm" />', 'jsx').includes('tag:<Button'));
  assert.deepEqual(kinds('<a href="x">', 'html'), ['tag:<a', 'attr:href', 'string:"x"', 'tag:>']);
  assert.deepEqual(kinds('{ "a": 1, "b": null }', 'json'), ['string:"a"', 'number:1', 'string:"b"', 'keyword:null']);
  assert.deepEqual(kinds('# hi\necho "x"', 'sh'), ['comment:# hi', 'string:"x"']);
  assert.deepEqual(tokenize('<b>', 'text'), [{ kind: 'plain', text: '<b>' }]);
  assert.doesNotMatch(read('src/studio/library/highlight.ts'), /^import /m, 'the tokenizer imports nothing');
});

test('LM-10 documentation files import only @studio/library and their own files', async () => {
  const { libraryImportProblem, createLibraryBoundary, libraryBoundary } = await import(new URL('scripts/library-boundary.mjs', shell).href);
  const cwd = '/studio';
  const file = '/studio/src/library/button.ts';
  for (const ok of ['@studio/library', './shared', '../library/text-field', '@/library/button', '/src/library/x']) assert.equal(libraryImportProblem(file, ok, cwd), null, ok);
  for (const bad of ['react', '@studio/kit', '@studio/workspace', '@/store', '../studio/types', '@/library/../store', 'lucide-react', 'node:fs']) assert.match(libraryImportProblem(file, bad, cwd), /is outside the library boundary/, bad);
  assert.match(libraryImportProblem('/studio/example/library/button.ts', '@/library', cwd), /under example\/library\//);
  const lint = (node) => {
    const reports = [];
    createLibraryBoundary(cwd).rules.imports.create({ filename: file, report: (r) => reports.push(r.message) })[node.type](node);
    return reports;
  };
  const literal = (value) => ({ type: 'Literal', value });
  assert.deepEqual(lint({ type: 'ImportDeclaration', source: literal('@studio/library') }), []);
  assert.match(lint({ type: 'ImportDeclaration', source: literal('react') })[0], /react is outside the library boundary/);
  assert.match(lint({ type: 'ExportAllDeclaration', source: literal('@/store') })[0], /outside the library boundary/);
  assert.deepEqual(lint({ type: 'ImportExpression', source: literal('./button') }), []);
  assert.match(lint({ type: 'ImportExpression', source: { type: 'Identifier', name: 'target' } })[0], /not a string literal/);
  const glob = { type: 'CallExpression', callee: { type: 'MemberExpression', computed: false, object: { type: 'MetaProperty', meta: { name: 'import' }, property: { name: 'meta' } }, property: { type: 'Identifier', name: 'glob' } }, arguments: [literal('./*.ts')] };
  assert.match(lint(glob)[0], /may not use import\.meta\.glob/);
  assert.match(lint({ type: 'TSImportType', argument: { type: 'TSLiteralType', literal: literal('@/store') } })[0], /outside the library boundary/);
  const reports = [];
  libraryBoundary.rules.imports.create({ filename: join(fileURLToPath(shell), 'src/library/index.ts'), report: (r) => reports.push(r.message) }).ImportDeclaration({ type: 'ImportDeclaration', source: literal('./button') });
  assert.deepEqual(reports, [], 'the shared plugin checks against the Studio that holds it');
});

test('LM-11 the product seed is empty, the API is the published surface, and the build and lint know the library', () => {
  assert.equal(read('src/library/index.ts').match(/^(?!\s*\*|\/\*).+$/gm).join('\n'), 'import { defineLibrary } from "@studio/library"\nexport default defineLibrary({})');
  const api = read('src/studio/library/api.ts');
  assert.match(api, /export const LIBRARY_VERSION = "studio-library\/1"/);
  assert.match(api, /export function defineLibrary\b/);
  assert.match(api, /export type \{[^}]*ComponentDocs[^}]*\} from "\.\/schema"/);
  assert.doesNotMatch(api, /^import (?!type )/m, 'documentation can import the API without loading shell code');
  const vite = read('vite.config.ts');
  assert.match(vite, /@studio\\\/library/);
  assert.match(vite, /__STUDIO_LIBRARY__: JSON\.stringify\(!loaded \|\| "error" in loaded \|\| !!loaded\.adapter\.library\)/);
  assert.match(vite, /which the adapter does not declare in library\.components/);
  assert.match(vite, /"example-library": path\.resolve\(root, "example\/library\/frame\.html"\)/);
  for (const config of ['tsconfig.json', 'tsconfig.app.json']) assert.match(read(config), /"@studio\/library": \["\.\/src\/studio\/library\/api\.ts"\]/, config);
  const eslint = read('eslint.config.js');
  assert.match(eslint, /'library\/imports': 'error'/);
  assert.match(eslint, /'src\/library\/\*\*\/\*\.\{ts,tsx,js,jsx,mjs\}'/);
});

test('LM-12 the example library is a valid declaration, and every documented component has valid documentation', async () => {
  const { libraryProblems, docsProblems, undeclaredDocs } = await loadPure('src/studio/library/model.ts');
  const { exampleLibrary } = await loadPure('example/library/declaration.ts');
  assert.deepEqual(libraryProblems(exampleLibrary), []);
  assert.deepEqual(exampleLibrary.components.map((c) => `${c.group}/${c.id}`), ['actions/button', 'actions/icon-button', 'inputs/text-field', 'inputs/switch']);
  const index = read('example/library/index.ts');
  const documented = [...index.matchAll(/^\s+"?([a-z][a-z0-9-]*)"?: \(\) => import\("\.\/([a-z-]+)"\)/gm)].map((m) => m[1]);
  assert.deepEqual(documented, ['button', 'icon-button', 'text-field'], 'Switch is declared without documentation on purpose');
  assert.deepEqual(undeclaredDocs(exampleLibrary, documented), []);
  for (const id of documented) {
    const { default: docs } = await loadPure(`example/library/${id}.ts`);
    assert.deepEqual(docsProblems(docs), [], id);
  }
  const { default: button } = await loadPure('example/library/button.ts');
  assert.equal(button.source.version, '2.4.0');
  assert.deepEqual(button.preview.groups.map((g) => g.id).concat(button.examples.items.map((g) => g.id)), ['styles', 'sizes', 'states', 'with-icon', 'in-a-row']);
  assert.ok(!('performance' in (await loadPure('example/library/text-field.ts')).default), 'Text field leaves Performance out');
  for (const scenario of ['button:playground', 'button:styles', 'button:sizes', 'button:states', 'button:with-icon', 'button:in-a-row', 'icon-button:sizes', 'text-field:states']) assert.ok(read('example/library/frame.ts').includes(`"${scenario}"`), `the example entry renders ${scenario}`);
});
