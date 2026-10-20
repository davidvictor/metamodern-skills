// Install and update tests (no browser): installing into an empty folder at a pinned Git ref, the lock file's hashes,
// an update that leaves project-owned files alone, refusing an edited installed file, --keep and --replace, files
// added inside the installed copy, verify, and the package's hygiene (no home paths, no node_modules, no denied words).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readCanvas, validateCanvas, validateConfig } from '../metamodern-work-on-canvases/scripts/canvas-format.mjs';
import { CLAUDE_ENTRY, DEFAULT_DIR, LOCK_FILE, PROJECT_OWNED, run } from '../metamodern-work-on-canvases/scripts/install.mjs';
import { main } from '../metamodern-work-on-canvases/scripts/canvas.mjs';
import { PACKAGE } from './canvas-fixture.mjs';

const sha = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/**
 * A checkout of the collection holding a copy of the package, made once: tagged `pinned`, then a later commit, then
 * `newer`, which changes, adds and removes package files.
 */
let made = null;
function checkout() {
  if (made) return made;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-source-'));
  const pkg = path.join(root, 'metamodern-work-on-canvases');
  fs.cpSync(PACKAGE, pkg, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'pinned');
  git(root, 'tag', 'pinned');
  fs.appendFileSync(path.join(pkg, 'references', 'viewer.md'), '\nA line after the pinned tag.\n');
  git(root, 'commit', '-q', '-am', 'later');
  fs.appendFileSync(path.join(pkg, 'references', 'method.md'), '\nA newer line.\n');
  fs.writeFileSync(path.join(pkg, 'references', 'added-later.md'), '# Added later\n');
  fs.rmSync(path.join(pkg, 'references', 'render-check.md'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'newer');
  git(root, 'tag', 'newer');
  made = root;
  return root;
}

function call(command, args) {
  const out = [];
  const errors = [];
  const code = run(command, args, { log: (line) => out.push(line), err: (line) => errors.push(line) });
  return { code, out: out.join('\n'), err: errors.join('\n') };
}

/** Every file in the project outside the installed copy and the lock, with its hash. */
function projectOwned(project, dir = DEFAULT_DIR) {
  const files = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      const rel = path.relative(project, full).split(path.sep).join('/');
      if (rel === dir || rel === LOCK_FILE || rel === CLAUDE_ENTRY) continue;
      if (entry.isDirectory()) walk(full);
      else files[rel] = sha(full);
    }
  };
  walk(project);
  return files;
}

const emptyProject = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-project-')), 'design');

test('installs into an empty folder at a pinned ref, with a hash for every file and the starting files', () => {
  const source = checkout();
  const project = emptyProject();
  const result = call('install', ['--project', project, '--from', source, '--ref', 'pinned', '--name', 'Example design', '--namespace', 'Example']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Installed metamodern-work-on-canvases \d+\.\d+\.\d+ \(pinned, [0-9a-f]{7}\)/);

  const lock = JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'));
  assert.equal(lock.schema, 'canvas-package-lock/1');
  assert.equal(lock.dir, DEFAULT_DIR);
  assert.equal(lock.source.ref, 'pinned');
  assert.equal(lock.source.commit, git(source, 'rev-parse', 'pinned'));
  assert.equal(lock.version, fs.readFileSync(path.join(PACKAGE, 'PACKAGE_VERSION'), 'utf8').trim().split('@')[1]);
  assert.deepEqual(lock.kept, []);

  // Every package file at the tag is installed, each hash matches the file, and the lock lists nothing else.
  const tagged = git(source, 'ls-tree', '-r', '--name-only', 'pinned', '--', 'metamodern-work-on-canvases/').split('\n')
    .map((f) => `${DEFAULT_DIR}/${f.slice('metamodern-work-on-canvases/'.length)}`);
  assert.deepEqual(Object.keys(lock.files).sort(), [...tagged, CLAUDE_ENTRY].sort());
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha(path.join(project, file)), hash, file);
  // The tag's content, not the later commit's.
  assert.doesNotMatch(fs.readFileSync(path.join(project, DEFAULT_DIR, 'references', 'viewer.md'), 'utf8'), /after the pinned tag/);

  // The project's starting files.
  const config = JSON.parse(fs.readFileSync(path.join(project, 'canvas.config.json'), 'utf8'));
  assert.deepEqual(validateConfig(config), []);
  assert.equal(config.name, 'Example design');
  assert.equal(config.kit.namespace, 'Example');
  assert.ok(fs.existsSync(path.join(project, 'skin', 'board.css')));
  assert.match(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), /^\.canvas\/$/m);
  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.canvas, `node ${DEFAULT_DIR}/scripts/canvas.mjs`);
  return readCanvas(path.join(project, 'canvases', 'start')).then((canvas) => {
    assert.deepEqual(validateCanvas(canvas), []);
    assert.deepEqual(Object.keys(canvas.boards), ['start.dc.html']);

    // The Claude Code entry point links to the installed skill.
    const entry = fs.readFileSync(path.join(project, CLAUDE_ENTRY), 'utf8');
    assert.match(entry, /^---\nname: metamodern-work-on-canvases\ndescription: Use when /);
    const link = /\]\(([^)]+)\)/.exec(entry)[1];
    assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(project, CLAUDE_ENTRY)), link)));

    // The installed command line runs from the project, through the package.json script.
    const verify = spawnSync(process.execPath, [...pkg.scripts.canvas.split(' ').slice(1), 'verify'], { cwd: project, encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /matches canvas\.lock\.json/);
    // The comment loop runs from the installed copy too.
    const comments = spawnSync(process.execPath, [...pkg.scripts.canvas.split(' ').slice(1), 'comments', 'list', '--open'], { cwd: project, encoding: 'utf8' });
    assert.equal(comments.status, 0, comments.stderr);
    assert.doesNotThrow(() => JSON.parse(comments.stdout));
  });
});

test('install without --ref takes the package folder as it is, through the canvas command line', async () => {
  const project = emptyProject();
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(line);
  try { assert.equal(await main(['install', '--project', project, '--from', PACKAGE]), 0); } finally { console.log = log; }
  const lock = JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'));
  assert.deepEqual(lock.source, { ref: null, commit: null });
  assert.equal(sha(path.join(project, DEFAULT_DIR, 'scripts', 'install.mjs')), sha(path.join(PACKAGE, 'scripts', 'install.mjs')));
});

test('install refuses a project that already has the lock, and files in the way', () => {
  const source = checkout();
  const project = emptyProject();
  assert.equal(call('install', ['--project', project, '--from', source, '--ref', 'pinned']).code, 0);
  const again = call('install', ['--project', project, '--from', source, '--ref', 'pinned']);
  assert.equal(again.code, 1);
  assert.match(again.err, /Use canvas update/);

  const other = emptyProject();
  fs.mkdirSync(path.join(other, DEFAULT_DIR), { recursive: true });
  fs.writeFileSync(path.join(other, DEFAULT_DIR, 'SKILL.md'), 'mine\n');
  const blocked = call('install', ['--project', other, '--from', source, '--ref', 'pinned']);
  assert.equal(blocked.code, 1);
  assert.match(blocked.err, /SKILL\.md exists and differs from the package/);
  assert.equal(fs.existsSync(path.join(other, LOCK_FILE)), false);
  assert.equal(fs.readFileSync(path.join(other, DEFAULT_DIR, 'SKILL.md'), 'utf8'), 'mine\n');

  const owned = call('install', ['--project', emptyProject(), '--from', source, '--dir', 'canvases/package']);
  assert.equal(owned.code, 1);
  assert.match(owned.err, /project-owned path/);
});

test('install keeps existing project files and adds the canvas script to an existing package.json', () => {
  const project = emptyProject();
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'canvas.config.json'), '{"schema": "canvas-config/1"}\n');
  fs.writeFileSync(path.join(project, 'package.json'), '{"name": "kept", "scripts": {"test": "node --test"}}\n');
  fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n');
  const result = call('install', ['--project', project, '--from', PACKAGE]);
  assert.equal(result.code, 0, result.err);
  assert.equal(fs.readFileSync(path.join(project, 'canvas.config.json'), 'utf8'), '{"schema": "canvas-config/1"}\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).scripts, { test: 'node --test', canvas: `node ${DEFAULT_DIR}/scripts/canvas.mjs` });
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.match(result.out, /Add \.canvas\/ to \.gitignore/);
});

/** A project installed at `pinned`, with project work in it. */
function installedWithWork() {
  const source = checkout();
  const project = emptyProject();
  assert.equal(call('install', ['--project', project, '--from', source, '--ref', 'pinned']).code, 0);
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true }); fs.writeFileSync(path.join(project, rel), text); };
  write('canvas.config.json', fs.readFileSync(path.join(project, 'canvas.config.json'), 'utf8').replace('"port": 5410', '"port": 5420'));
  write('skin/board.css', '.board-shell { color: black; }\n');
  write('canvases/app/tools/build.mjs', '// the app canvas builder\n');
  write('canvases/app/project/canvas.json', '{}\n');
  write('review.json', '{"schema": "canvas-review/1", "sets": []}\n');
  write('comments/app/c_20261020_abc123.json', '{}\n');
  write('builds/set.md', '# set\n');
  write('decisions/log.md', '# log\n');
  write('.canvas/live.json', '{}\n');
  return { source, project };
}

test('update moves to a newer ref and leaves every project-owned file alone', () => {
  const { source, project } = installedWithWork();
  const before = projectOwned(project);
  assert.ok(Object.keys(before).some((f) => f.startsWith('comments/')));
  const result = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /1 added, \d+ replaced, 1 deleted/);
  assert.deepEqual(projectOwned(project), before);

  const lock = JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'));
  assert.equal(lock.source.commit, git(source, 'rev-parse', 'newer'));
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha(path.join(project, file)), hash, file);
  assert.equal(fs.existsSync(path.join(project, DEFAULT_DIR, 'references', 'render-check.md')), false);
  assert.ok(fs.existsSync(path.join(project, DEFAULT_DIR, 'references', 'added-later.md')));
  assert.match(fs.readFileSync(path.join(project, DEFAULT_DIR, 'references', 'viewer.md'), 'utf8'), /after the pinned tag/);

  const again = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(again.code, 0);
  assert.match(again.out, /nothing to change/);
  for (const name of PROJECT_OWNED) assert.ok(!name.startsWith(DEFAULT_DIR));
});

test('update refuses an edited installed file and writes nothing; --replace takes the package version', () => {
  const { source, project } = installedWithWork();
  const edited = `${DEFAULT_DIR}/references/method.md`;
  fs.appendFileSync(path.join(project, edited), '\nA local edit.\n');
  const lockBefore = fs.readFileSync(path.join(project, LOCK_FILE), 'utf8');
  const viewerBefore = sha(path.join(project, DEFAULT_DIR, 'references', 'viewer.md'));

  const refused = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /Nothing was written/);
  assert.match(refused.err, /references\/method\.md was edited in the project/);
  assert.equal(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'), lockBefore);
  assert.equal(sha(path.join(project, DEFAULT_DIR, 'references', 'viewer.md')), viewerBefore);

  const verify = call('verify', ['--project', project]);
  assert.equal(verify.code, 1);
  assert.match(verify.err, /references\/method\.md was edited/);

  const replaced = call('update', ['--project', project, '--from', source, '--ref', 'newer', '--replace', edited]);
  assert.equal(replaced.code, 0, replaced.err);
  assert.doesNotMatch(fs.readFileSync(path.join(project, edited), 'utf8'), /A local edit/);
  assert.match(fs.readFileSync(path.join(project, edited), 'utf8'), /A newer line/);
  assert.equal(call('verify', ['--project', project]).code, 0);
});

test('--keep keeps a local edit, records it in the lock and keeps it on later updates', () => {
  const { source, project } = installedWithWork();
  const edited = `${DEFAULT_DIR}/references/method.md`;
  fs.appendFileSync(path.join(project, edited), '\nA local edit.\n');
  const result = call('update', ['--project', project, '--from', source, '--ref', 'newer', '--keep', edited, '--reason', 'testing a change']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /kept .*method\.md: the package changed it/);
  assert.match(fs.readFileSync(path.join(project, edited), 'utf8'), /A local edit/);
  const lock = JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'));
  assert.deepEqual(lock.kept.map(({ path: p, reason }) => [p, reason]), [[edited, 'testing a change']]);
  assert.match(call('verify', ['--project', project]).out, /with 1 kept file/);

  const later = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(later.code, 0, later.err);
  assert.match(fs.readFileSync(path.join(project, edited), 'utf8'), /A local edit/);
});

test('a file added inside the installed copy blocks an update until it is replaced (deleted) or kept', () => {
  const { source, project } = installedWithWork();
  const extra = `${DEFAULT_DIR}/scripts/extra.mjs`;
  fs.writeFileSync(path.join(project, extra), '// added in the project\n');
  const refused = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /extra\.mjs is not part of the package/);
  assert.equal(call('verify', ['--project', project]).code, 1);
  assert.equal(call('update', ['--project', project, '--from', source, '--ref', 'newer', '--replace', extra]).code, 0);
  assert.equal(fs.existsSync(path.join(project, extra)), false);
});

test('a missing installed file is restored, and update needs --from and an installed project', () => {
  const { source, project } = installedWithWork();
  fs.rmSync(path.join(project, DEFAULT_DIR, 'references', 'viewer.md'));
  const result = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /1 restored/);
  assert.match(call('update', ['--project', project]).err, /needs --from/);
  assert.match(call('update', ['--project', emptyProject(), '--from', source]).err, /install the package first/);
});

// The deny list is not kept in this public repository: pass words with CANVAS_DENY_WORDS (comma separated) or a file
// of one word per line with CANVAS_DENY_FILE.
test('the package holds no home paths, no node_modules and no denied words', () => {
  const deny = [
    ...(process.env.CANVAS_DENY_WORDS ?? '').split(','),
    ...(process.env.CANVAS_DENY_FILE ? fs.readFileSync(process.env.CANVAS_DENY_FILE, 'utf8').split('\n') : []),
  ].map((w) => w.trim()).filter(Boolean);
  const home = /(?:\/Users\/[A-Za-z]|\/home\/[a-z]|[A-Z]:\\Users\\)/;
  const problems = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(PACKAGE, full);
      if (entry.name === 'node_modules') { problems.push(`${rel}: node_modules`); continue; }
      if (entry.isDirectory()) { walk(full); continue; }
      if (/\.(?:png|jpe?g|gif|webp|woff2?|ttf)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (home.test(text)) problems.push(`${rel}: an absolute home path`);
      for (const word of deny) if (text.toLowerCase().includes(word.toLowerCase())) problems.push(`${rel}: a denied word`);
    }
  };
  walk(PACKAGE);
  assert.deepEqual(problems, []);
});

// ---------- refusals found in review: overlapping folders, symbolic links, hand-edited locks, self-updates ----------

/** Every file under a folder, with its hash; follows nothing. */
function tree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out[path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name))] = sha(path.join(entry.parentPath ?? entry.path, entry.name));
  }
  return out;
}

test('install refuses a folder that overlaps the Claude Code entry point', () => {
  for (const dir of ['.claude/skills/metamodern-work-on-canvases', '.claude/skills/metamodern-work-on-canvases/pkg', '.claude']) {
    const project = emptyProject();
    const result = call('install', ['--project', project, '--from', PACKAGE, '--dir', dir]);
    assert.equal(result.code, 1, dir);
    assert.match(result.err, /overlaps the Claude Code entry point/);
    assert.equal(fs.existsSync(path.join(project, LOCK_FILE)), false);
  }
});

test('install and update refuse symbolic links on the way to an installed file and write nothing outside the project', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-outside-'));
  // .claude/skills is a link to the package's own folder: the loader would overwrite the package SKILL.md.
  const linkedClaude = emptyProject();
  fs.mkdirSync(path.join(linkedClaude, '.agents', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(linkedClaude, '.claude'), { recursive: true });
  fs.symlinkSync('../.agents/skills', path.join(linkedClaude, '.claude', 'skills'));
  const one = call('install', ['--project', linkedClaude, '--from', PACKAGE]);
  assert.equal(one.code, 1);
  assert.match(one.err, /\.claude\/skills is a symbolic link/);
  assert.deepEqual(tree(path.join(linkedClaude, '.agents')), {});
  // .agents is a link to a folder outside the project.
  const linkedAgents = emptyProject();
  fs.mkdirSync(linkedAgents, { recursive: true });
  fs.symlinkSync(outside, path.join(linkedAgents, '.agents'));
  const two = call('install', ['--project', linkedAgents, '--from', PACKAGE]);
  assert.equal(two.code, 1);
  assert.match(two.err, /\.agents is a symbolic link/);
  assert.deepEqual(tree(outside), {});
  assert.equal(fs.existsSync(path.join(linkedAgents, LOCK_FILE)), false);
  // A link made after install stops the update too.
  const project = emptyProject();
  assert.equal(call('install', ['--project', project, '--from', PACKAGE]).code, 0);
  fs.renameSync(path.join(project, DEFAULT_DIR), path.join(outside, 'moved'));
  fs.symlinkSync(path.join(outside, 'moved'), path.join(project, DEFAULT_DIR));
  const before = tree(outside);
  const three = call('update', ['--project', project, '--from', checkout(), '--ref', 'newer']);
  assert.equal(three.code, 1);
  assert.match(three.err, /symbolic link/);
  assert.deepEqual(tree(outside), before);
});

test('update refuses a lock whose paths leave the installed folder, and deletes nothing', () => {
  const source = checkout();
  const cases = [
    ['an owned key', (lock) => { lock.files['canvases/start/README.md'] = lock.files[`${DEFAULT_DIR}/SKILL.md`]; }, /canvases\/start\/README\.md, which is not an installed path/],
    ['a key outside the folder', (lock) => { lock.files['notes.md'] = 'sha256:00'; }, /notes\.md, which is not an installed path/],
    ['a key with ..', (lock) => { lock.files[`${DEFAULT_DIR}/../../review.json`] = 'sha256:00'; }, /not an installed path/],
    ['a kept key outside the folder', (lock) => { lock.kept.push({ path: 'review.json', reason: null, since: '0' }); }, /review\.json, which is not an installed path/],
    ['an escaping dir', (lock) => { lock.dir = '../escaped'; }, /dir \.\.\/escaped must be a folder inside the project/],
  ];
  for (const [label, edit, message] of cases) {
    const project = emptyProject();
    assert.equal(call('install', ['--project', project, '--from', source, '--ref', 'pinned']).code, 0);
    if (label === 'an owned key') fs.writeFileSync(path.join(project, 'canvases', 'start', 'README.md'), fs.readFileSync(path.join(project, DEFAULT_DIR, 'SKILL.md')));
    const lockFile = path.join(project, LOCK_FILE);
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    edit(lock);
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    const before = projectOwned(project);
    const result = call('update', ['--project', project, '--from', source, '--ref', 'newer']);
    assert.equal(result.code, 1, label);
    assert.match(result.err, message, label);
    assert.deepEqual(projectOwned(project), before, label);
    assert.equal(fs.existsSync(path.join(path.dirname(project), 'escaped')), false, label);
  }
});

test('update refuses the installed copy itself as --from', () => {
  const project = emptyProject();
  assert.equal(call('install', ['--project', project, '--from', PACKAGE]).code, 0);
  fs.appendFileSync(path.join(project, DEFAULT_DIR, 'references', 'method.md'), '\nA local edit.\n');
  const lock = fs.readFileSync(path.join(project, LOCK_FILE), 'utf8');
  const result = call('update', ['--project', project, '--from', path.join(project, DEFAULT_DIR)]);
  assert.equal(result.code, 1);
  assert.match(result.err, /--from is inside the project/);
  assert.equal(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'), lock);
  assert.match(call('verify', ['--project', project]).err, /from a checkout of the package outside the project/);
});

test('an invalid --namespace or --name writes nothing', () => {
  for (const args of [['--namespace', 'foo-bar'], ['--name', ' ']]) {
    const project = emptyProject();
    const result = call('install', ['--project', project, '--from', PACKAGE, ...args]);
    assert.equal(result.code, 1);
    assert.equal(fs.existsSync(project), false, args.join(' '));
  }
});

// ---------- automated review threads ----------

test('install leaves an existing start canvas alone and never runs a builder over it', () => {
  const project = emptyProject();
  const canvasJson = path.join(project, 'canvases', 'start', 'project', 'canvas.json');
  fs.mkdirSync(path.dirname(canvasJson), { recursive: true });
  fs.writeFileSync(canvasJson, '{"v": 3, "title": "Ours"}\n');
  const result = call('install', ['--project', project, '--from', PACKAGE]);
  assert.equal(result.code, 0, result.err);
  assert.equal(fs.readFileSync(canvasJson, 'utf8'), '{"v": 3, "title": "Ours"}\n');
  assert.equal(fs.existsSync(path.join(project, 'canvases', 'start', 'tools')), false);
  assert.equal(fs.existsSync(path.join(project, 'canvases', 'start', 'README.md')), false);
  assert.match(result.out, /canvases\/start\/ exists, so no start canvas was made/);
});

test('install at a ref works from a repository whose root is the package itself', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-root-package-'));
  fs.cpSync(PACKAGE, root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'package');
  git(root, 'tag', 'pinned');
  const project = emptyProject();
  const result = call('install', ['--project', project, '--from', root, '--ref', 'pinned']);
  assert.equal(result.code, 0, result.err);
  const lock = JSON.parse(fs.readFileSync(path.join(project, LOCK_FILE), 'utf8'));
  assert.equal(lock.source.commit, git(root, 'rev-parse', 'pinned'));
  assert.ok(`${DEFAULT_DIR}/SKILL.md` in lock.files);
  assert.ok(`${DEFAULT_DIR}/scripts/install.mjs` in lock.files);
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha(path.join(project, file)), hash, file);
});

test('--dir is compared with the Claude Code entry point regardless of case', () => {
  for (const dir of ['.Claude', '.CLAUDE/skills/Metamodern-Work-On-Canvases']) {
    const project = emptyProject();
    const result = call('install', ['--project', project, '--from', PACKAGE, '--dir', dir]);
    assert.equal(result.code, 1, dir);
    assert.match(result.err, /overlaps the Claude Code entry point/);
  }
});
