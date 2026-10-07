import { studioSource } from './studio-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = fileURLToPath(new URL('../metamodern-interface-studio/', import.meta.url));
const starter = studioSource;
const updater = join(skill, 'scripts/update-studio.mjs');
const IGNORED = new Set(['node_modules', 'dist', 'dist-ssr', '.acceptance', '.git', '.DS_Store', 'acceptance-report.json']);

const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;
const walk = (root, dir = root) => readdirSync(dir).flatMap((name) => {
  if (IGNORED.has(name) || name.endsWith('.log')) return [];
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path).split(sep).join('/')];
});
const tree = (root) => Object.fromEntries(walk(root).sort().map((p) => [p, sha(readFileSync(join(root, p)))]));
const snapshot = (root) => Object.fromEntries(walk(root).sort().map((p) => [p, `${sha(readFileSync(join(root, p)))}@${statSync(join(root, p)).mtimeMs}`]));

function tmp(name) {
  return mkdtempSync(join(tmpdir(), `studio-${name}-`));
}

/** A copy of the starter as a fake shell release, changed by `mutate`. */
function shell(name, mutate = () => {}) {
  const dir = join(tmp(name), 'shell');
  for (const f of walk(starter)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(starter, f), join(dir, f));
  }
  mutate(dir);
  return dir;
}

function run(args, { json = true } = {}) {
  const r = spawnSync(process.execPath, [updater, ...args, ...(json ? ['--json'] : [])], { encoding: 'utf8' });
  let data = null;
  if (json) {
    try {
      data = JSON.parse(r.stdout);
    } catch {
      data = null;
    }
  }
  return { code: r.status, out: r.stdout, err: r.stderr, data };
}

function create(shellDir, version = '1.0.0') {
  const dir = join(tmp('studio'), 'studio');
  const r = run([dir, '--create', '--shell', shellDir, '--shell-version', version]);
  assert.equal(r.code, 0, r.err || r.out);
  return dir;
}

const update = (dir, shellDir, version, ...extra) => run([dir, '--shell', shellDir, '--shell-version', version, '--skip-checks', ...extra]);
const lockOf = (dir) => JSON.parse(readFileSync(join(dir, 'studio-shell.lock.json'), 'utf8'));
const pkgOf = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const editPkg = (dir, fn) => {
  const pkg = pkgOf(dir);
  fn(pkg);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
};
const SHELL_FILE = 'src/studio/protocol.ts';

test('UP-01 a created Studio is stamped with the shell files only', () => {
  const base = shell('base');
  const dir = create(base);
  const lock = lockOf(dir);
  assert.equal(lock.schema, 'studio-shell-lock/2');
  assert.equal(lock.shell, '1.0.0');
  const files = tree(dir);
  for (const [path, hash] of Object.entries(lock.files)) assert.equal(files[path], hash, path);
  for (const product of ['src/adapter.ts', 'studio.config.ts', 'src/workspace/index.ts', 'src/library/index.ts', 'package.json', 'package-lock.json', 'studio-shell.lock.json']) assert.ok(!(product in lock.files), `${product} must not be locked as a shell file`);
  assert.ok(SHELL_FILE in lock.files && 'vite.config.ts' in lock.files && 'index.html' in lock.files);
  assert.deepEqual(lock.package.scripts, pkgOf(base).scripts);
});

test('UP-02 a report writes nothing and lists every action', () => {
  const dir = create(shell('base'));
  const next = shell('next', (d) => {
    appendFileSync(join(d, SHELL_FILE), '\n// next\n');
    writeFileSync(join(d, 'src/studio/added.ts'), 'export const added = 1\n');
  });
  const before = snapshot(dir);
  const r = update(dir, next, '1.1.0');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.data.applied, false);
  assert.deepEqual(snapshot(dir), before);
  const kinds = r.data.actions.map((a) => `${a.kind} ${a.path}`);
  assert.ok(kinds.includes(`replace ${SHELL_FILE}`) && kinds.includes('add src/studio/added.ts'), kinds.join(', '));
});

test('UP-03 applying replaces, adds and deletes shell files and rewrites the lock', () => {
  const dir = create(shell('base'));
  const next = shell('next', (d) => {
    appendFileSync(join(d, SHELL_FILE), '\n// next\n');
    writeFileSync(join(d, 'src/studio/added.ts'), 'export const added = 1\n');
    rmSync(join(d, '.prettierignore'));
  });
  const r = update(dir, next, '1.1.0', '--apply');
  assert.equal(r.code, 0, r.err || r.out);
  assert.equal(r.data.applied, true);
  assert.ok(!existsSync(join(dir, '.prettierignore')));
  const local = tree(dir);
  const upstream = tree(next);
  for (const path of Object.keys(upstream).filter((p) => !['src/adapter.ts', 'studio.config.ts', 'package.json'].includes(p))) assert.equal(local[path], upstream[path], path);
  const lock = lockOf(dir);
  assert.equal(lock.shell, '1.1.0');
  assert.equal(lock.files['src/studio/added.ts'], upstream['src/studio/added.ts']);
  assert.ok(!('.prettierignore' in lock.files));
  // A second run is a no-op.
  const again = update(dir, next, '1.1.0');
  assert.equal(again.data.actions.length, 0);
});

test('UP-04 product files never change', () => {
  const dir = create(shell('base'));
  writeFileSync(join(dir, 'src/adapter.ts'), 'export { productAdapter as adapter } from "@/adapters/product"\n');
  writeFileSync(join(dir, 'studio.config.ts'), 'export default { title: "Product Studio" }\n');
  mkdirSync(join(dir, 'src/adapters'), { recursive: true });
  writeFileSync(join(dir, 'src/adapters/product.ts'), 'export const productAdapter = {}\n');
  writeFileSync(join(dir, 'layouts.json'), '{"schema":"studio-layouts/1","layouts":[]}\n');
  mkdirSync(join(dir, 'public/product'), { recursive: true });
  writeFileSync(join(dir, 'public/product/capture.png'), 'png');
  const product = ['src/adapter.ts', 'studio.config.ts', 'src/adapters/product.ts', 'layouts.json', 'public/product/capture.png'];
  const before = Object.fromEntries(product.map((p) => [p, readFileSync(join(dir, p), 'utf8')]));
  const next = shell('next', (d) => {
    writeFileSync(join(d, 'src/adapter.ts'), '// the shell changed its seed\n');
    writeFileSync(join(d, 'studio.config.ts'), '// the shell changed its seed\n');
    appendFileSync(join(d, SHELL_FILE), '\n// next\n');
  });
  const r = update(dir, next, '1.1.0', '--apply');
  assert.equal(r.code, 0, r.err || r.out);
  for (const p of product) assert.equal(readFileSync(join(dir, p), 'utf8'), before[p], p);
});

test('UP-05 a local edit blocks until it is replaced or kept with a reason', () => {
  const dir = create(shell('base'));
  appendFileSync(join(dir, SHELL_FILE), '\n// local fix\n');
  const next = shell('next', (d) => appendFileSync(join(d, 'src/store.tsx'), '\n// next\n'));
  const before = snapshot(dir);
  const blocked = update(dir, next, '1.1.0', '--apply');
  assert.equal(blocked.code, 1);
  assert.equal(blocked.data.applied, false);
  assert.deepEqual(blocked.data.blocked.map((b) => b.path), [SHELL_FILE]);
  assert.deepEqual(snapshot(dir), before, 'a blocked update writes nothing');
  const text = update(dir, next, '1.1.0', '--json=false');
  assert.equal(text.code, 2, 'unknown flags are usage errors');
  const human = run([dir, '--shell', next, '--shell-version', '1.1.0', '--skip-checks'], { json: false });
  assert.match(human.out, /was edited here/);
  assert.match(human.out, /local fix/, 'the report shows the diff');

  assert.equal(update(dir, next, '1.1.0', '--keep', SHELL_FILE).code, 2, '--keep needs a reason');
  const kept = update(dir, next, '1.1.0', '--apply', '--keep', SHELL_FILE, '--reason', 'waiting on the skill fix');
  assert.equal(kept.code, 0, kept.err || kept.out);
  assert.match(readFileSync(join(dir, SHELL_FILE), 'utf8'), /local fix/);
  assert.deepEqual(lockOf(dir).kept.map((k) => [k.path, k.reason, k.since]), [[SHELL_FILE, 'waiting on the skill fix', '1.1.0']]);

  const later = shell('later', (d) => appendFileSync(join(d, SHELL_FILE), '\n// later\n'));
  const listed = update(dir, later, '1.2.0');
  const entry = listed.data.actions.find((a) => a.path === SHELL_FILE);
  assert.equal(entry.kind, 'kept');
  assert.match(entry.note, /the shell changed this file/);

  const replaced = update(dir, later, '1.2.0', '--apply', '--replace', SHELL_FILE);
  assert.equal(replaced.code, 0);
  assert.equal(tree(dir)[SHELL_FILE], tree(later)[SHELL_FILE]);
  assert.deepEqual(lockOf(dir).kept, []);
});

test('UP-06 deleted optional files stay deleted once recorded; other missing files block', () => {
  const dir = create(shell('base'));
  rmSync(join(dir, 'example'), { recursive: true });
  const next = shell('next', (d) => writeFileSync(join(d, 'example/extra.ts'), 'export {}\n'));
  const blocked = update(dir, next, '1.1.0', '--apply');
  assert.equal(blocked.code, 1);
  assert.deepEqual(blocked.data.blocked.map((b) => b.path), ['example/']);
  const ok = update(dir, next, '1.1.0', '--apply', '--removed', 'example/');
  assert.equal(ok.code, 0, ok.err || ok.out);
  assert.ok(!existsSync(join(dir, 'example')), 'nothing under a removed folder comes back');
  assert.deepEqual(lockOf(dir).removed, ['example/']);

  rmSync(join(dir, 'src/store.tsx'));
  const missing = update(dir, next, '1.1.0', '--apply');
  assert.equal(missing.code, 1);
  assert.match(missing.data.blocked[0].why, /missing; restore it with --replace/);
  assert.equal(update(dir, next, '1.1.0', '--apply', '--replace', 'src/store.tsx').code, 0);
  assert.ok(existsSync(join(dir, 'src/store.tsx')));
});

test('UP-07 package.json keeps the Studio additions and takes the shell versions', () => {
  const dir = create(shell('base'));
  editPkg(dir, (p) => {
    p.name = 'product-studio';
    p.dependencies['left-pad'] = '^1.3.0';
    p.scripts.verify = 'node verify.mjs';
    delete p.scripts.acceptance;
  });
  const next = shell('next', (d) => editPkg(d, (p) => {
    p.dependencies.react = '^19.9.0';
    delete p.dependencies.cn;
    p.dependencies.zod = '^4.0.0';
    p.scripts.acceptance = 'node scripts/acceptance.mjs --all';
  }));
  const r = update(dir, next, '1.1.0', '--apply');
  assert.equal(r.code, 0, r.err || r.out);
  const pkg = pkgOf(dir);
  assert.equal(pkg.name, 'product-studio');
  assert.equal(pkg.dependencies['left-pad'], '^1.3.0');
  assert.equal(pkg.scripts.verify, 'node verify.mjs');
  assert.ok(!('acceptance' in pkg.scripts), 'a script the Studio removed stays removed');
  assert.equal(pkg.dependencies.react, '^19.9.0');
  assert.ok(!('cn' in pkg.dependencies), 'a package the shell dropped is removed');
  assert.equal(pkg.dependencies.zod, '^4.0.0');
});

test('UP-08 the report prints the update notes between the two versions', () => {
  const notes = (d) => writeFileSync(join(d, 'UPDATING.md'), '# Updating\n\n## 1.0.0\n\nOld note.\n\n## 1.1.0\n\nAdd `layouts.json`.\n\n## 1.2.0\n\nNot yet.\n');
  const dir = create(shell('base', notes));
  const next = shell('next', notes);
  const r = update(dir, next, '1.1.0');
  assert.deepEqual(r.data.updateNotes.map((n) => n.version), ['1.1.0']);
  const human = run([dir, '--shell', next, '--shell-version', '1.1.0', '--skip-checks'], { json: false });
  assert.match(human.out, /Update notes[\s\S]*1\.1\.0[\s\S]*Add `layouts\.json`/);
  assert.doesNotMatch(human.out, /Old note|Not yet/);
});

test('UP-09 adoption finds the release a Studio came from and lists exactly what differs', () => {
  const old = shell('old', (d) => appendFileSync(join(d, 'src/App.tsx'), '\n// an older release\n'));
  const dir = create(old, '0.4.0');
  rmSync(join(dir, 'studio-shell.lock.json'));
  rmSync(join(dir, 'studio.config.ts'));
  appendFileSync(join(dir, SHELL_FILE), '\n// edited\n');
  appendFileSync(join(dir, 'src/store.tsx'), '\n// edited\n');
  const release = (d) => ({ files: tree(d), package: { dependencies: pkgOf(d).dependencies, devDependencies: pkgOf(d).devDependencies, scripts: pkgOf(d).scripts } });
  const releases = join(tmp('releases'), 'releases.json');
  writeFileSync(releases, JSON.stringify({ schema: 'studio-shell-releases/1', versions: { '0.3.0': release(shell('older', (d) => rmSync(join(d, 'src/App.tsx')))), '0.4.0': release(old) } }));
  const next = shell('next');

  const noLock = update(dir, next, '0.6.0', '--releases', releases);
  assert.equal(noLock.code, 1);
  assert.equal(noLock.data.needsAdopt, true);

  const r = update(dir, next, '0.6.0', '--releases', releases, '--adopt');
  assert.equal(r.data.from, '0.4.0');
  assert.deepEqual(r.data.blocked.map((b) => b.path).sort(), [SHELL_FILE, 'src/store.tsx'].sort());
  assert.ok(r.data.actions.some((a) => a.kind === 'seed' && a.path === 'studio.config.ts'));

  assert.equal(update(dir, next, '0.6.0', '--releases', releases, '--adopt', '--apply').code, 1);
  assert.ok(!existsSync(join(dir, 'studio-shell.lock.json')), 'no lock until every difference is resolved');
  const done = update(dir, next, '0.6.0', '--releases', releases, '--adopt', '--apply', '--replace', SHELL_FILE, '--keep', 'src/store.tsx', '--reason', 'local experiment');
  assert.equal(done.code, 0, done.err || done.out);
  assert.equal(lockOf(dir).shell, '0.6.0');
  assert.equal(tree(dir)['src/App.tsx'], tree(next)['src/App.tsx'], 'files unchanged since 0.4.0 move to the new shell');
});

test('UP-10 applying refuses uncommitted changes to shell files', (t) => {
  const git = spawnSync('git', ['--version']);
  if (git.status !== 0) return t.skip('git is not available');
  const dir = create(shell('base'));
  const g = (...args) => spawnSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { encoding: 'utf8' });
  g('init', '-q');
  g('add', '-A');
  g('commit', '-qm', 'studio');
  editPkg(dir, (p) => { p.scripts.verify = 'node verify.mjs'; });
  const next = shell('next', (d) => appendFileSync(join(d, SHELL_FILE), '\n// next\n'));
  const r = update(dir, next, '1.1.0', '--apply');
  assert.equal(r.code, 1);
  assert.equal(r.data.applied, false);
  assert.ok(r.data.dirty.some((line) => line.includes('package.json')));
  const human = run([dir, '--shell', next, '--shell-version', '1.1.0', '--skip-checks', '--apply'], { json: false });
  assert.match(human.out, /commit or stash them first/);
  g('commit', '-qam', 'verify script');
  assert.equal(update(dir, next, '1.1.0', '--apply').code, 0);
});

test('UP-11 the workspace seed is created once, and nothing in src/workspace/ is ever compared or updated', () => {
  const old = shell('old', (d) => rmSync(join(d, 'src/workspace'), { recursive: true }));
  const dir = create(old);
  assert.ok(!existsSync(join(dir, 'src/workspace/index.ts')));
  const next = shell('next');
  const r = update(dir, next, '1.1.0', '--apply');
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.data.actions.some((a) => a.kind === 'seed' && a.path === 'src/workspace/index.ts'));
  assert.match(readFileSync(join(dir, 'src/workspace/index.ts'), 'utf8'), /export default defineWorkspace\(\{\}\)/);
  assert.ok(!Object.keys(lockOf(dir).files).some((p) => p.startsWith('src/workspace/')), 'nothing under src/workspace/ is a shell file');
  writeFileSync(join(dir, 'src/workspace/index.ts'), 'export default "product"\n');
  writeFileSync(join(dir, 'src/workspace/env.tsx'), 'export const env = 1\n');
  const later = shell('later', (d) => {
    writeFileSync(join(d, 'src/workspace/index.ts'), '// the shell changed its seed\n');
    writeFileSync(join(d, 'src/workspace/extra.ts'), 'export const extra = 1\n');
  });
  const again = update(dir, later, '1.2.0', '--apply');
  assert.equal(again.code, 0, again.err || again.out);
  assert.equal(readFileSync(join(dir, 'src/workspace/index.ts'), 'utf8'), 'export default "product"\n');
  assert.equal(readFileSync(join(dir, 'src/workspace/env.tsx'), 'utf8'), 'export const env = 1\n');
  assert.ok(!existsSync(join(dir, 'src/workspace/extra.ts')), 'the shell never adds files to the product folder');
});

test('UP-12 a major kit change is reported as breaking and applied only when accepted', () => {
  const dir = create(shell('base'));
  const next = shell('next', (d) => {
    const f = join(d, 'src/kit/index.ts');
    writeFileSync(f, readFileSync(f, 'utf8').replace('KIT_VERSION = "studio-kit/1"', 'KIT_VERSION = "studio-kit/2"'));
  });
  assert.deepEqual(update(dir, next, '2.0.0').data.kit, { from: 'studio-kit/1', to: 'studio-kit/2' });
  const human = run([dir, '--shell', next, '--shell-version', '2.0.0', '--skip-checks'], { json: false });
  assert.match(human.out, /Breaking: the Studio UI kit changes from studio-kit\/1 to studio-kit\/2/);
  assert.match(human.out, /--accept-kit studio-kit\/2/);
  const refused = update(dir, next, '2.0.0', '--apply');
  assert.equal(refused.code, 1);
  assert.equal(refused.data.applied, false);
  assert.equal(lockOf(dir).shell, '1.0.0');
  const refusedHuman = run([dir, '--shell', next, '--shell-version', '2.0.0', '--skip-checks', '--apply'], { json: false });
  assert.equal(refusedHuman.code, 1);
  assert.match(refusedHuman.out, /\(nothing written\)/);
  assert.doesNotMatch(refusedHuman.out, /add --apply/, 'a refused --apply does not ask for --apply');
  const wrong = update(dir, next, '2.0.0', '--apply', '--accept-kit', 'studio-kit/3');
  assert.equal(wrong.code, 1, 'a different kit version is not an acceptance');
  assert.equal(wrong.data.applied, false);
  assert.equal(lockOf(dir).shell, '1.0.0');
  const acceptedPlan = run([dir, '--shell', next, '--shell-version', '2.0.0', '--skip-checks', '--accept-kit', 'studio-kit/2'], { json: false });
  assert.match(acceptedPlan.out, /Breaking: the Studio UI kit changes from studio-kit\/1 to studio-kit\/2/);
  assert.doesNotMatch(acceptedPlan.out, /Nothing is applied without/);
  const accepted = update(dir, next, '2.0.0', '--apply', '--accept-kit', 'studio-kit/2');
  assert.equal(accepted.code, 0, accepted.err || accepted.out);
  assert.equal(lockOf(dir).shell, '2.0.0');
  assert.equal(update(dir, next, '2.0.1').data.kit, null, 'the same major needs nothing');
});

test('UP-13 acceptance is skipped with a reason when the workspace example it loads is missing', (t) => {
  if (process.platform === 'win32') return t.skip('the stand-in npm is a POSIX shell script');
  const bin = tmp('npm');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'npm'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PLAYWRIGHT_MODULE: 'stand-in' };
  const checks = (dir, ...extra) => {
    const r = spawnSync(process.execPath, [updater, dir, '--shell', starter, '--shell-version', '1.0.0', '--apply', '--json', ...extra], { encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return JSON.parse(r.stdout).checks.find((c) => c.name === 'acceptance');
  };
  const whole = create(starter);
  assert.equal(checks(whole).ok, true, 'a Studio with the whole example runs acceptance');
  for (const missing of ['example/workspace/mock-host.mjs', 'example/workspace/adapter.ts', 'example/library/adapter.ts']) {
    const dir = create(starter);
    rmSync(join(dir, missing));
    const acceptance = checks(dir, '--keep', missing, '--reason', 'removed for the test');
    assert.ok(acceptance.skipped, `acceptance is skipped without ${missing}`);
    assert.match(acceptance.skipped, /example\/workspace\//);
  }
});

test('UP-14 the library seed is created once, and nothing in src/library/ is ever compared or updated', () => {
  const old = shell('old', (d) => rmSync(join(d, 'src/library'), { recursive: true }));
  const dir = create(old);
  assert.ok(!existsSync(join(dir, 'src/library/index.ts')));
  const r = update(dir, shell('next'), '1.1.0', '--apply');
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.data.actions.some((a) => a.kind === 'seed' && a.path === 'src/library/index.ts'));
  assert.match(readFileSync(join(dir, 'src/library/index.ts'), 'utf8'), /export default defineLibrary\(\{\}\)/);
  assert.ok(!Object.keys(lockOf(dir).files).some((p) => p.startsWith('src/library/')), 'nothing under src/library/ is a shell file');
  writeFileSync(join(dir, 'src/library/index.ts'), 'export default "product"\n');
  writeFileSync(join(dir, 'src/library/button.ts'), 'export default {}\n');
  const later = shell('later', (d) => {
    writeFileSync(join(d, 'src/library/index.ts'), '// the shell changed its seed\n');
    writeFileSync(join(d, 'src/library/extra.ts'), 'export const extra = 1\n');
  });
  const again = update(dir, later, '1.2.0', '--apply');
  assert.equal(again.code, 0, again.err || again.out);
  assert.equal(readFileSync(join(dir, 'src/library/index.ts'), 'utf8'), 'export default "product"\n');
  assert.equal(readFileSync(join(dir, 'src/library/button.ts'), 'utf8'), 'export default {}\n');
  assert.ok(!existsSync(join(dir, 'src/library/extra.ts')), 'the shell never adds files to the product folder');
});

test('release fingerprints include the current shell', () => {
  const version = readFileSync(join(skill, 'PACKAGE_VERSION'), 'utf8').trim().replace(/^.*@/, '');
  const releases = JSON.parse(readFileSync(join(skill, 'assets/studio-shell.releases.json'), 'utf8'));
  assert.equal(releases.schema, 'studio-shell-releases/1');
  assert.deepEqual(releases.versions[version]?.files, tree(starter), 'run node scripts/generate-studio-shell-releases.mjs after changing the starter');
});
