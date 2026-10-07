#!/usr/bin/env node
/**
 * Create a Studio from the shell starter, or bring an existing Studio up to the
 * newest shell without touching product work. See references/updating.md.
 *
 *   node update-studio.mjs <studio-dir>                  report what an update would do; writes nothing
 *   node update-studio.mjs <studio-dir> --apply          apply it, then install and run the checks
 *   node update-studio.mjs <studio-dir> --adopt          a Studio made before the lock file: find its shell version
 *   node update-studio.mjs <new-dir> --create            copy the starter into a new Studio and stamp it
 *
 * Resolving a blocked file (each flag may repeat):
 *   --keep <path> --reason "<why>"   keep a local edit to a shell file; listed on every later update
 *   --replace <path>                 discard a local edit, or restore a missing file, from the new shell
 *   --removed <path>                 record an optional file or folder (such as example/) as deliberately removed
 *   --accept-kit studio-kit/<n>      apply an update that changes the Studio UI kit's major version
 *
 * Other options: --skip-checks, --allow-dirty, --json, and for tests --shell <dir>, --shell-version <v>, --releases <file>.
 */
import { composeHost } from './compose-host.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCK = 'studio-shell.lock.json';
const LOCK_SCHEMA = 'studio-shell-lock/2';

/** Created once and then owned by the product. */
const SEEDS = new Set(['src/adapter.ts', 'studio.config.ts', 'src/workspace/index.ts', 'src/library/index.ts', 'src/design-runtime/index.ts']);
/** Folders that belong to the product: never compared, added to or removed from (a seed inside is created when missing). */
const PRODUCT_DIRS = ['src/workspace/', 'src/library/', 'src/design-runtime/'];
/** Replaced from the shell every time, then refreshed by npm install. */
const REGENERATED = new Set(['package-lock.json', 'next-env.d.ts']);
/** Shell files a Studio may delete on purpose; recorded under `removed`. */
const OPTIONAL = ['README.md', 'example/', 'src/adapters/example.ts', 'src/adapters/synthetic.ts', 'scripts/acceptance.mjs'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '.acceptance', '.git', '.next', 'out']);
const IGNORED_FILES = new Set(['.DS_Store', 'acceptance-report.json', LOCK]);

// ---------- arguments ----------

function parseArgs(argv) {
  const out = { dir: null, apply: false, adopt: false, create: false, skipChecks: false, allowDirty: false, json: false, keep: [], replace: [], removed: [], acceptKit: null, shell: null, shellVersion: null, releases: null, host: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === '--apply') out.apply = true;
    else if (a === '--adopt') out.adopt = true;
    else if (a === '--create') out.create = true;
    else if (a === '--skip-checks') out.skipChecks = true;
    else if (a === '--allow-dirty') out.allowDirty = true;
    else if (a === '--json') out.json = true;
    else if (a === '--keep') out.keep.push({ path: norm(next()), reason: null });
    else if (a === '--reason') {
      const last = out.keep.at(-1);
      if (!last || last.reason) throw new UsageError('--reason must follow a --keep');
      last.reason = next();
    } else if (a === '--replace') out.replace.push(norm(next()));
    else if (a === '--removed') out.removed.push(norm(next()));
    else if (a === '--accept-kit') out.acceptKit = next();
    else if (a === '--host') out.host = next();
    else if (a === '--shell') out.shell = resolve(next());
    else if (a === '--shell-version') out.shellVersion = next();
    else if (a === '--releases') out.releases = resolve(next());
    else if (a.startsWith('--')) throw new UsageError(`Unknown option ${a}`);
    else if (!out.dir) out.dir = resolve(a);
    else throw new UsageError(`Unexpected argument ${a}`);
  }
  if (out.host && !['vite', 'next'].includes(out.host)) throw new UsageError(`Unknown host ${out.host}`);
  if (!out.dir) throw new UsageError('Name the Studio directory');
  for (const k of out.keep) if (!k.reason) throw new UsageError(`--keep ${k.path} needs --reason "<why>"`);
  return out;
}

class UsageError extends Error {}

// ---------- files ----------

const norm = (p) => p.split(sep).join('/').replace(/^\.\//, '');
const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;
const hashFile = (file) => (existsSync(file) && statSync(file).isFile() ? sha(readFileSync(file)) : undefined);

function walk(root, dir = root) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) return IGNORED_DIRS.has(name) ? [] : walk(root, path);
    if (IGNORED_FILES.has(name) || name.endsWith('.log')) return [];
    return [norm(relative(root, path))];
  });
}

function hashTree(root) {
  return Object.fromEntries(walk(root).sort().map((p) => [p, sha(readFileSync(join(root, p)))]));
}

/** The Studio UI kit's major version in a tree (KIT_VERSION in src/kit/index.ts); null before the kit existed. */
function kitVersion(root) {
  const file = join(root, 'src/kit/index.ts');
  if (!existsSync(file)) return null;
  return /export const KIT_VERSION = "(studio-kit\/\d+)"/.exec(readFileSync(file, 'utf8'))?.[1] ?? null;
}

const underAny = (path, list) => list.some((r) => (r.endsWith('/') ? path.startsWith(r) : path === r));
const isOptional = (path) => underAny(path, OPTIONAL);
/** Files the updater compares one by one: everything in the shell except seeds, the lockfile it regenerates and package.json, which it merges. */
const isCompared = (path) => !SEEDS.has(path) && !REGENERATED.has(path) && path !== 'package.json' && !underAny(path, PRODUCT_DIRS);

const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));
const packageBase = (pkg) => ({ dependencies: pkg.dependencies ?? {}, devDependencies: pkg.devDependencies ?? {}, scripts: pkg.scripts ?? {} });

// ---------- update notes ----------

const versionKey = (v) => v.split('.').map((n) => Number(n));
function compareVersions(a, b) {
  const x = versionKey(a);
  const y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** Every `## <version>` section of UPDATING.md newer than `from` and not newer than `to`. */
function notesBetween(shellDir, from, to) {
  const file = join(shellDir, 'UPDATING.md');
  if (!existsSync(file)) return [];
  const sections = readFileSync(file, 'utf8').split(/^## /m).slice(1);
  return sections
    .map((s) => ({ version: s.slice(0, s.indexOf('\n')).trim(), text: s.slice(s.indexOf('\n') + 1).trim() }))
    .filter((s) => /^\d+\.\d+\.\d+$/.test(s.version) && (!from || compareVersions(s.version, from) > 0) && compareVersions(s.version, to) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
}

// ---------- package.json ----------

/**
 * The shell's packages always take the shell's version; packages and scripts a
 * Studio added stay; a script the Studio removed stays removed; an entry the
 * shell dropped is removed only if the previous shell declared it.
 */
function mergePackage(local, upstream, base) {
  const out = { ...local };
  const changes = [];
  for (const field of ['type', 'engines']) {
    if (upstream[field] !== undefined && JSON.stringify(local[field]) !== JSON.stringify(upstream[field])) {
      out[field] = upstream[field];
      changes.push(`${field} set from the shell`);
    }
  }
  for (const section of ['dependencies', 'devDependencies', 'scripts']) {
    const mine = { ...(local[section] ?? {}) };
    const theirs = upstream[section] ?? {};
    const before = base?.[section] ?? {};
    for (const [name, value] of Object.entries(theirs)) {
      if (section === 'scripts' && name in before && !(name in mine)) {
        changes.push(`script ${name} stays removed`);
        continue;
      }
      if (mine[name] !== value) {
        changes.push(mine[name] === undefined ? `${section} add ${name} ${value}` : `${section} ${name} ${mine[name]} -> ${value}`);
        mine[name] = value;
      }
    }
    for (const name of Object.keys(before)) {
      if (!(name in theirs) && name in mine) {
        changes.push(`${section} remove ${name} (the shell no longer uses it)`);
        delete mine[name];
      }
    }
    if (Object.keys(mine).length || local[section]) out[section] = mine;
  }
  return { pkg: out, changes };
}

// ---------- adoption ----------

/** The released shell version whose files the Studio matches best; ties go to the newer release. */
function identifyRelease(dir, releases) {
  let best = null;
  for (const [version, release] of Object.entries(releases.versions)) {
    const paths = Object.keys(release.files).filter(isCompared);
    const matched = paths.filter((p) => hashFile(join(dir, p)) === release.files[p]).length;
    const score = matched / Math.max(1, paths.length);
    if (!best || score > best.score || (score === best.score && compareVersions(version, best.version) > 0)) best = { version, score, matched, total: paths.length };
  }
  return best;
}

// ---------- the 0.6.0 seed ----------

/** First update onto a shell with studio.config.ts: carry the title and output folder the Studio had set in shell files. */
function seedStudioConfig(dir, upstreamDir) {
  const template = readFileSync(join(upstreamDir, 'studio.config.ts'), 'utf8');
  const index = existsSync(join(dir, 'index.html')) ? readFileSync(join(dir, 'index.html'), 'utf8') : '';
  const vite = existsSync(join(dir, 'vite.config.ts')) ? readFileSync(join(dir, 'vite.config.ts'), 'utf8') : '';
  const title = /<title>([^<]*)<\/title>/.exec(index)?.[1]?.trim() || 'Interface Studio';
  const outDir = /outDir:\s*path\.resolve\(\s*import\.meta\.dirname\s*,\s*["']([^"']+)["']\s*\)/.exec(vite)?.[1] ?? /outDir:\s*["']([^"']+)["']/.exec(vite)?.[1] ?? 'dist';
  const hasExample = existsSync(join(dir, 'example/index.html'));
  let text = template.replace(/title: "[^"]*"/, `title: ${JSON.stringify(title)}`).replace(/outDir: "[^"]*"/, `outDir: ${JSON.stringify(outDir)}`);
  if (!hasExample) text = text.replace(/\n\s*\/\/ The example product's preview entry[^\n]*\n\s*inputs: \{[^}]*\},/, '\n  inputs: {},');
  const notes = [`studio.config.ts created with title ${JSON.stringify(title)} and outDir ${JSON.stringify(outDir)}${hasExample ? '' : ' and no extra pages'}. Add any other pages your old vite.config.ts built to \`inputs\`.`];
  return { text, notes };
}

// ---------- plan ----------

function plan(opts) {
  const existing = existsSync(join(opts.dir, LOCK)) ? readJSON(join(opts.dir, LOCK)) : null;
  const host = existing?.schema === 'studio-shell-lock/1' ? 'vite' : existing?.host ?? 'vite';
  if (opts.host && opts.host !== host) throw new UsageError(`Studio host is ${host}; --host ${opts.host} requires an explicit migration, not a normal update`);
  const composed = opts.shell ? null : composeHost(host);
  const shellDir = opts.shell ?? composed.dir;
  const shellVersion = opts.shellVersion ?? readFileSync(resolve(here, '../PACKAGE_VERSION'), 'utf8').trim().replace(/^.*@/, '');
  const releasesFile = opts.releases ?? resolve(here, '../assets/studio-shell.releases.json');
  const dir = opts.dir;
  const upstream = hashTree(shellDir);
  const upstreamPkg = readJSON(join(shellDir, 'package.json'));
  const lockFile = join(dir, LOCK);
  const blocked = [];
  const notes = [];

  if (!existsSync(dir) || !existsSync(join(dir, 'package.json'))) throw new UsageError(`${dir} is not a Studio (no package.json)`);

  let lock;
  let from;
  if (existsSync(lockFile)) {
    lock = readJSON(lockFile);
    if (![LOCK_SCHEMA, 'studio-shell-lock/1'].includes(lock.schema)) throw new UsageError(`${LOCK} has schema ${lock.schema}; this updater reads ${LOCK_SCHEMA}`);
    from = lock.shell;
  } else {
    if (!opts.adopt) return { dir, shellVersion, needsAdopt: true, actions: [], blocked: [], notes: [] };
    const releases = existsSync(releasesFile) ? readJSON(releasesFile) : { versions: {} };
    const match = identifyRelease(dir, releases);
    if (!match || match.matched === 0) throw new UsageError('No released shell matches this Studio; it may not come from the starter');
    const release = releases.versions[match.version];
    lock = { schema: LOCK_SCHEMA, shell: match.version, files: Object.fromEntries(Object.entries(release.files).filter(([p]) => isCompared(p))), package: release.package, packageLock: release.files['package-lock.json'], removed: [], kept: [] };
    from = match.version;
    notes.push(`Adopting: this Studio matches shell ${match.version} (${match.matched} of ${match.total} shell files identical).`);
  }

  const kept = new Map((lock.kept ?? []).map((k) => [k.path, k]));
  for (const k of opts.keep) kept.set(k.path, { path: k.path, reason: k.reason, since: shellVersion });
  for (const p of opts.replace) kept.delete(p);
  const removed = [...new Set([...(lock.removed ?? []), ...opts.removed])].filter((r) => !underAny(r, opts.replace));
  const replacing = (path) => underAny(path, opts.replace);
  const actions = [];
  const nextFiles = {};

  const paths = [...new Set([...Object.keys(lock.files ?? {}), ...Object.keys(upstream)])].filter(isCompared).sort();
  for (const path of paths) {
    const B = lock.files?.[path];
    const U = upstream[path];
    const L = hashFile(join(dir, path));
    const isKept = kept.has(path);

    if (underAny(path, removed) && !replacing(path)) {
      if (L !== undefined) blocked.push({ path, why: 'is recorded as removed but exists; delete it or restore it with --replace', diff: false });
      continue;
    }
    if (U === undefined) {
      // The shell no longer ships this file.
      if (L === undefined) continue;
      if (L === B || replacing(path)) actions.push({ kind: 'delete', path });
      else if (isKept) actions.push({ kind: 'kept', path, note: 'removed from the shell; your copy stays' });
      else blocked.push({ path, why: 'was edited here and the new shell removes it; keep it with --keep and a reason, or delete it with --replace', diff: false });
      continue;
    }
    if (isKept) {
      nextFiles[path] = U;
      actions.push({ kind: 'kept', path, note: U !== B ? 'the shell changed this file; compare before keeping it longer' : undefined, diff: U !== B });
      continue;
    }
    if (L === undefined) {
      if (B === undefined || replacing(path)) actions.push({ kind: B === undefined ? 'add' : 'restore', path });
      else if (isOptional(path)) {
        const folder = OPTIONAL.find((r) => r.endsWith('/') && path.startsWith(r));
        const entry = folder && blocked.find((b) => b.path === folder);
        if (entry) entry.count++;
        else blocked.push({ path: folder ?? path, count: 1, why: `is missing; record it with --removed ${folder ?? path} if the Studio deleted it on purpose, or restore it with --replace`, diff: false });
      }
      else blocked.push({ path, why: 'is missing; restore it with --replace', diff: false });
      nextFiles[path] = U;
      continue;
    }
    nextFiles[path] = U;
    if (L === U) continue;
    if (L === B || replacing(path)) actions.push({ kind: 'replace', path });
    else if (B === undefined) blocked.push({ path, why: 'exists here and differs from a file the new shell adds; move your version aside, or take the shell version with --replace', diff: true });
    else blocked.push({ path, why: 'was edited here; move the change into the skill, take the shell version with --replace, or keep it with --keep and a reason', diff: true });
  }

  // Seeds are created once.
  for (const path of SEEDS) {
    if (upstream[path] && !existsSync(join(dir, path))) {
      if (path === 'studio.config.ts') {
        const seed = seedStudioConfig(dir, shellDir);
        actions.push({ kind: 'seed', path, content: seed.text });
        notes.push(...seed.notes);
      } else actions.push({ kind: 'seed', path });
    }
  }

  // package.json and its lockfile.
  const localPkg = readJSON(join(dir, 'package.json'));
  const merged = mergePackage(localPkg, upstreamPkg, lock.package);
  for (const c of merged.changes.filter((c) => c.endsWith('stays removed'))) notes.push(`package.json: ${c}.`);
  if (JSON.stringify(merged.pkg) !== JSON.stringify(localPkg)) actions.push({ kind: 'package', path: 'package.json', changes: merged.changes, content: `${JSON.stringify(merged.pkg, null, 2)}\n` });
  // The lockfile moves with the shell's: npm install afterwards adds the Studio's own packages back.
  const lockLocal = hashFile(join(dir, 'package-lock.json'));
  if (upstream['package-lock.json'] && lockLocal !== upstream['package-lock.json'] && (upstream['package-lock.json'] !== lock.packageLock || lockLocal === undefined)) actions.push({ kind: 'regenerate', path: 'package-lock.json' });

  const kitFrom = kitVersion(dir);
  const kitTo = kitVersion(shellDir);
  const kit = kitFrom && kitTo && kitFrom !== kitTo ? { from: kitFrom, to: kitTo } : null;

  const nextLock = {
    schema: LOCK_SCHEMA,
    host,
    composition: composed?.composition ?? { files: upstream },
    shell: shellVersion,
    files: nextFiles,
    package: packageBase(upstreamPkg),
    packageLock: upstream['package-lock.json'],
    removed: removed.sort(),
    kept: [...kept.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const lockChanged = !existsSync(lockFile) || JSON.stringify(readJSON(lockFile)) !== JSON.stringify(nextLock);

  return {
    dir,
    host,
    shellDir,
    from,
    shellVersion,
    adopting: !existsSync(lockFile),
    actions,
    blocked,
    notes,
    kit,
    updateNotes: notesBetween(shellDir, from, shellVersion),
    removed: nextLockRemoved(removed),
    nextLock,
    lockChanged,
  };
}

const nextLockRemoved = (removed) => [...removed].sort();

// ---------- diffs, git, checks ----------

function diffFor(dir, shellDir, path) {
  const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--', join(dir, path), join(shellDir, path)], { encoding: 'utf8' });
  if (r.error) return null;
  const lines = r.stdout.split(join(dir, path)).join(`studio/${path}`).split(join(shellDir, path)).join(`shell/${path}`).split('\n');
  return lines.length > 80 ? `${lines.slice(0, 80).join('\n')}\n... ${lines.length - 80} more lines` : r.stdout.trimEnd();
}

function dirtyShellFiles(dir, paths) {
  const top = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0) return null;
  const existing = paths.filter((p) => existsSync(join(dir, p)));
  if (!existing.length) return [];
  const r = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--', ...existing], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean);
}

function hasPlaywright(dir) {
  if (process.env.PLAYWRIGHT_MODULE) return true;
  try {
    createRequire(join(dir, 'package.json')).resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

function runChecks(dir, log) {
  const pkg = readJSON(join(dir, 'package.json'));
  const results = [];
  const run = (name, args) => {
    log(`  running ${name}`);
    const r = spawnSync('npm', args, { cwd: dir, encoding: 'utf8', env: process.env });
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    results.push({ name, ok: r.status === 0, output: r.status === 0 ? undefined : output.split('\n').slice(-40).join('\n') });
    return r.status === 0;
  };
  if (!run('install', ['install', '--no-audit', '--no-fund'])) return results;
  for (const script of ['typecheck', 'lint', 'build']) {
    if (pkg.scripts?.[script]) run(script, ['run', script]);
    else results.push({ name: script, skipped: 'no such script in package.json' });
  }
  const acceptanceReady = pkg.scripts?.acceptance && ['scripts/acceptance.mjs', 'example/index.html', 'example/workspace/mock-host.mjs', 'example/workspace/adapter.ts', 'example/library/adapter.ts', 'example/library/sections.ts', 'example/static-adapter.ts', 'src/adapters/synthetic.ts'].every((p) => existsSync(join(dir, p)));
  if (!acceptanceReady) results.push({ name: 'acceptance', skipped: 'needs the acceptance script, the example product (with example/workspace/ and example/library/), and the acceptance adapters' });
  else if (!hasPlaywright(dir)) results.push({ name: 'acceptance', skipped: 'Playwright is not installed (npm i -D playwright, or set PLAYWRIGHT_MODULE)' });
  else run('acceptance', ['run', 'acceptance']);
  return results;
}

// ---------- apply ----------

function apply(p) {
  for (const a of p.actions) {
    const target = join(p.dir, a.path);
    if (a.kind === 'delete') {
      rmSync(target, { force: true });
      let d = dirname(target);
      while (d.startsWith(p.dir) && d !== p.dir && existsSync(d) && readdirSync(d).length === 0) {
        rmdirSync(d);
        d = dirname(d);
      }
    } else if (['add', 'restore', 'replace', 'regenerate', 'seed'].includes(a.kind)) {
      mkdirSync(dirname(target), { recursive: true });
      if (a.content !== undefined) writeFileSync(target, a.content);
      else cpSync(join(p.shellDir, a.path), target);
    } else if (a.kind === 'package') writeFileSync(target, a.content);
  }
  writeFileSync(join(p.dir, LOCK), `${JSON.stringify(p.nextLock, null, 2)}\n`);
}

function create(opts) {
  const host = opts.host ?? 'vite';
  const composed = opts.shell ? null : composeHost(host);
  const shellDir = opts.shell ?? composed.dir;
  const shellVersion = opts.shellVersion ?? readFileSync(resolve(here, '../PACKAGE_VERSION'), 'utf8').trim().replace(/^.*@/, '');
  if (existsSync(opts.dir) && readdirSync(opts.dir).length) throw new UsageError(`${opts.dir} is not empty`);
  const files = walk(shellDir);
  for (const f of files) {
    mkdirSync(dirname(join(opts.dir, f)), { recursive: true });
    cpSync(join(shellDir, f), join(opts.dir, f));
  }
  const upstream = hashTree(shellDir);
  const lock = {
    schema: LOCK_SCHEMA,
    host,
    composition: composed?.composition ?? { files: upstream },
    shell: shellVersion,
    files: Object.fromEntries(Object.entries(upstream).filter(([p]) => isCompared(p))),
    package: packageBase(readJSON(join(shellDir, 'package.json'))),
    packageLock: upstream['package-lock.json'],
    removed: [],
    kept: [],
  };
  writeFileSync(join(opts.dir, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  return { dir: opts.dir, host, shellVersion, files: files.length };
}

// ---------- report ----------

const LABEL = { add: 'Add', restore: 'Restore', replace: 'Replace', delete: 'Delete', seed: 'Create (product owned from now on)', regenerate: 'Replace, then refresh with npm install', package: 'Merge', kept: 'Keep your version' };

function report(p, { applied, checks, dirty, acceptKit, kitRefused }) {
  const out = [];
  const title = applied ? 'Updated' : 'Update plan for';
  out.push(`${title} ${p.dir} (host: ${p.host})`);
  out.push(`Shell ${p.from ?? 'unknown'} -> ${p.shellVersion}${p.adopting ? ' (adopting: no lock file yet)' : ''}${applied ? '' : kitRefused ? ' (nothing written)' : ' (nothing written; add --apply)'}`);
  for (const n of p.notes) out.push(`Note: ${n}`);
  if (p.kit) out.push('', `Breaking: the Studio UI kit changes from ${p.kit.from} to ${p.kit.to}. Workspace modules in src/workspace/ may need changes; read the update notes first.${acceptKit === p.kit.to ? '' : ` Nothing is applied without --accept-kit ${p.kit.to}.`}`);
  if (p.blocked.length) {
    out.push('', `Blocked (${p.blocked.length}). Nothing is written until each file is resolved:`);
    for (const b of p.blocked) {
      out.push(`  ${b.path}${b.count > 1 ? ` (${b.count} files)` : ''} ${b.why}`);
      if (b.diff) {
        const d = diffFor(p.dir, p.shellDir, b.path);
        if (d) out.push(`    Your file compared with the new shell file:\n${d.replace(/^/gm, '      ')}`);
      }
    }
  }
  if (p.removed.length) out.push(`Recorded as removed on purpose: ${p.removed.join(', ')}`);
  if (dirty?.length) out.push('', 'Uncommitted changes to shell files; commit or stash them first (or pass --allow-dirty):', ...dirty.map((d) => `  ${d}`));
  const groups = {};
  for (const a of p.actions) (groups[a.kind] ??= []).push(a);
  if (p.actions.length) out.push('', applied ? 'Done:' : 'Would do:');
  for (const [kind, list] of Object.entries(groups)) {
    out.push(`  ${LABEL[kind]} (${list.length})`);
    for (const a of list) {
      out.push(`    ${a.path}${a.note ? `: ${a.note}` : ''}`);
      if (a.changes) for (const c of a.changes) out.push(`      ${c}`);
      if (a.kind === 'kept' && a.diff) {
        const d = diffFor(p.dir, p.shellDir, a.path);
        if (d) out.push(d.replace(/^/gm, '      '));
      }
    }
  }
  if (!p.actions.length && !p.blocked.length) out.push('', p.lockChanged ? 'Files are current; the lock will be rewritten.' : 'Already current.');
  if (p.updateNotes.length) {
    out.push('', 'Update notes (do these by hand where they apply):');
    for (const n of p.updateNotes) out.push(`  ${n.version}`, n.text.replace(/^/gm, '    '));
  }
  if (checks) {
    out.push('', 'Checks:');
    for (const c of checks) out.push(`  ${c.name}: ${c.skipped ? `skipped, ${c.skipped}` : c.ok ? 'passed' : 'FAILED'}`, ...(c.output ? [c.output.replace(/^/gm, '    ')] : []));
  }
  return out.join('\n');
}

// ---------- main ----------

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const log = opts.json ? () => {} : (m) => console.log(m);
  try {
    if (opts.create) {
      const r = create(opts);
      if (opts.json) console.log(JSON.stringify({ created: r }, null, 2));
      else console.log(`Created a Studio at ${r.dir} from ${r.host} shell ${r.shellVersion} (${r.files} files) with ${LOCK}.\nNext: point src/adapter.ts at the product adapter, set studio.config.ts, then npm install and npm run dev.`);
      return 0;
    }
    const p = plan(opts);
    if (p.needsAdopt) {
      const msg = `${p.dir} has no ${LOCK}. Run again with --adopt to identify its shell version and list what differs.`;
      if (opts.json) console.log(JSON.stringify({ needsAdopt: true, message: msg }, null, 2));
      else console.log(msg);
      return 1;
    }
    const compared = Object.keys(p.nextLock.files);
    const dirty = opts.apply && !opts.allowDirty ? dirtyShellFiles(p.dir, [...compared, 'package.json']) : null;
    const kitBlocked = !!p.kit && opts.acceptKit !== p.kit.to;
    const canApply = opts.apply && !p.blocked.length && !(dirty && dirty.length) && !kitBlocked;
    let checks = null;
    if (canApply) {
      apply(p);
      if (!opts.skipChecks) {
        log('Applied. Running the checks:');
        checks = runChecks(p.dir, log);
      }
    }
    const failed = checks?.some((c) => c.ok === false);
    if (opts.json) {
      console.log(JSON.stringify({ host: p.host, from: p.from, to: p.shellVersion, adopting: p.adopting, kit: p.kit, applied: canApply, actions: p.actions.map(({ content, ...a }) => a), blocked: p.blocked, dirty, notes: p.notes, updateNotes: p.updateNotes, checks }, null, 2));
    } else console.log(report(p, { applied: canApply, checks, dirty, acceptKit: opts.acceptKit, kitRefused: opts.apply && kitBlocked }));
    if (p.blocked.length || (dirty && dirty.length) || failed || (opts.apply && kitBlocked)) return 1;
    return 0;
  } catch (e) {
    console.error(e instanceof UsageError ? e.message : e.stack);
    return e instanceof UsageError ? 2 : 1;
  }
}

process.exitCode = main();
