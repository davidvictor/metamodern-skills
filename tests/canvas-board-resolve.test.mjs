import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { RUNTIME_DIR, resolveBoardRequest, safeSegments } from '../metamodern-work-on-canvases/scripts/board-resolve.mjs';

let root;
let project;
let liveKit;
const config = { schema: 'canvas-config/1', kit: { namespace: 'Kit', pinned: 'kit/current' }, skin: 'skin/board.css' };

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-resolve-'));
  project = path.join(root, 'canvases', 'one', 'project');
  liveKit = path.join(root, 'live-kit');
  await fs.mkdir(path.join(project, 'ds', 'copied', 'components'), { recursive: true });
  await fs.mkdir(path.join(root, 'kit', 'current', 'components'), { recursive: true });
  await fs.mkdir(path.join(liveKit, 'components'), { recursive: true });
  await fs.writeFile(path.join(liveKit, 'kit.json'), '{}');
});
after(() => fs.rm(root, { recursive: true, force: true }));

const resolve = (requestPath, extra = {}) =>
  resolveBoardRequest({ projectRoot: root, config, canvasProjectDir: project, requestPath, liveKits: { work: liveKit }, ...extra });

test('BR-01 support.js and the runtime files resolve to the package runtime', () => {
  assert.deepEqual(resolve('support.js'), { kind: 'file', file: path.join(RUNTIME_DIR, 'support.js') });
  assert.deepEqual(resolve('support/react-markup.js'), { kind: 'file', file: path.join(RUNTIME_DIR, 'support', 'react-markup.js') });
  assert.equal(resolve('support/react-18.3.1.production.min.js').kind, 'file');
  assert.equal(resolve('support/missing.js').status, 404);
});

test('BR-02 ds/<namespace>/ resolves to the pinned kit, case-insensitively, or to a named live kit', () => {
  assert.deepEqual(resolve('ds/kit/components/bundle.js'), { kind: 'file', file: path.join(root, 'kit', 'current', 'components', 'bundle.js') });
  assert.deepEqual(resolve('ds/Kit/tokens.json').file, path.join(root, 'kit', 'current', 'tokens.json'));
  assert.deepEqual(resolve('ds/kit/components/bundle.js', { kit: 'live:work' }).file, path.join(liveKit, 'components', 'bundle.js'));
  assert.equal(resolve('ds/kit/components/bundle.js', { kit: 'live:gone' }).status, 404);
  assert.equal(resolve('ds/kit/components/bundle.js', { kit: 'live:../x' }).status, 400);
});

test('BR-03 a kit folder without kit.json is a legacy kit: kit.json answers with a generated record', () => {
  const legacy = resolve('ds/kit/kit.json');
  assert.equal(legacy.kind, 'json');
  assert.equal(legacy.body.schema, 'canvas-kit/legacy');
  assert.equal(legacy.body.react, '18.3.1');
  assert.deepEqual(resolve('ds/kit/kit.json', { kit: 'live:work' }), { kind: 'file', file: path.join(liveKit, 'kit.json') });
  const copied = resolve('ds/copied/kit.json');
  assert.equal(copied.kind, 'json');
  assert.equal(copied.body.namespace, 'copied');
  assert.equal(resolve('ds/absent/kit.json').kind, 'file', 'no folder, no record: an ordinary missing file');
});

test('BR-04 skin.css and relative paths', () => {
  assert.deepEqual(resolve('skin.css'), { kind: 'file', file: path.join(root, 'skin', 'board.css') });
  assert.deepEqual(resolve('doc.css'), { kind: 'file', file: path.join(project, 'doc.css') });
  assert.deepEqual(resolve('assets/a%20b.png'), { kind: 'file', file: path.join(project, 'assets', 'a b.png') });
  assert.deepEqual(resolve('ds/other/components/bundle.js').file, path.join(project, 'ds', 'other', 'components', 'bundle.js'));
});

test('BR-05 path traversal is refused', () => {
  for (const bad of ['../canvas.json', 'a/../../x', '%2e%2e/x', 'a%2F..%2F..%2Fx', '/etc/passwd', 'a\\..\\x', 'a//b', './x', 'ds/kit/../../../x', 'C:/x', 'a\0b', '']) {
    const result = resolve(bad);
    assert.equal(result.kind, 'error', bad);
    assert.equal(result.status, 400, bad);
  }
  assert.equal(safeSegments('ds/kit/components/bundle.js').length, 4);
});

test('BR-06 unexpanded {{values}} that the preload scanner requests are answered empty', () => {
  assert.deepEqual(resolve('%7B%7Brow.src%7D%7D'), { kind: 'empty' });
  assert.deepEqual(resolve('{{row.src}}'), { kind: 'empty' });
  assert.deepEqual(resolve('assets/{{name}}.png'), { kind: 'empty' });
});
