#!/usr/bin/env node
// Installs this package into a project at a pinned version, updates it, and checks that nobody edited the copy.
// Node built-ins only (and git, for --ref). See references/install.md.
//
//   canvas install [--project <dir>] [--from <checkout or package>] [--ref <tag or commit>] [--dir <path>]
//                  [--name <project name>] [--namespace <kit global>] [--dry-run]
//   canvas update  --from <checkout or package> [--ref <tag or commit>] [--project <dir>]
//                  [--keep <path> [--reason <why>]] ... [--replace <path>] ... [--dry-run]
//   canvas verify  [--project <dir>]
//
// The project commits canvas.lock.json: the version, where it came from (ref and commit), the folder the package is
// installed in and a sha256 for every installed file. Install and update write only the installed files, the Claude
// Code entry point and the lock; on install they also create the project's starting files when they are absent.
// They never touch project-owned paths (PROJECT_OWNED), and they refuse to overwrite an installed file that was edited
// in the project unless --replace names it (take the package's version) or --keep names it (keep the local one).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_NAME = 'metamodern-work-on-canvases';
export const LOCK_FILE = 'canvas.lock.json';
export const LOCK_SCHEMA = 'canvas-package-lock/1';
export const DEFAULT_DIR = `.agents/skills/${PACKAGE_NAME}`;
export const CLAUDE_ENTRY = `.claude/skills/${PACKAGE_NAME}/SKILL.md`;
const CLAUDE_DIR = path.posix.dirname(CLAUDE_ENTRY);
/** Paths that belong to the project. Install creates some of them once, when absent; update never writes any. */
export const PROJECT_OWNED = [
  'canvas.config.json', 'package.json', '.gitignore', 'review.json',
  'skin/', 'canvases/', 'comments/', 'builds/', 'decisions/', 'kit/', '.canvas/',
];
const IGNORED = new Set(['.DS_Store', 'node_modules', '.git']);

const sha = (buffer) => `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
const posix = (p) => p.split(path.sep).join('/');
const under = (p, owned) => (owned.endsWith('/') ? p === owned.slice(0, -1) || p.startsWith(owned) : p === owned);
const isOwned = (p) => PROJECT_OWNED.some((owned) => under(p, owned) || owned.startsWith(`${p}/`));

class InstallError extends Error {}

function git(cwd, args, input) {
  const result = spawnSync('git', ['-C', cwd, ...args], { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw new InstallError(`git is needed for --ref: ${result.error.message}`);
  if (result.status !== 0) throw new InstallError(`git ${args[0]} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function walk(root, dir = root) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new InstallError(`${posix(path.relative(root, full))} is a symlink; the package has none`);
    if (entry.isDirectory()) return walk(root, full);
    return entry.isFile() ? [posix(path.relative(root, full))] : [];
  }).sort();
}

/** The package folder named by --from: the package itself, or a checkout of the collection that holds it. */
export function packageFolder(from) {
  const dir = path.resolve(from);
  for (const candidate of [dir, path.join(dir, PACKAGE_NAME)]) {
    const id = path.join(candidate, 'PACKAGE_ID');
    if (fs.existsSync(id) && fs.readFileSync(id, 'utf8').startsWith(`${PACKAGE_NAME}:`)) return candidate;
  }
  throw new InstallError(`${from} is neither the ${PACKAGE_NAME} package nor a checkout that holds it`);
}

/**
 * The package's files at a pinned version: from a Git ref of the checkout (--ref), else from the folder as it is.
 * Returns {version, source: {ref, commit}, files: Map<path inside the package, Buffer>}.
 */
export function readSource({ from = path.resolve(here, '..'), ref = null } = {}) {
  const pkg = packageFolder(from);
  const files = new Map();
  let commit = null;
  if (ref) {
    const top = git(pkg, ['rev-parse', '--show-toplevel']).toString().trim();
    const prefix = posix(path.relative(fs.realpathSync(top), fs.realpathSync(pkg)));
    commit = git(top, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).toString().trim();
    const listing = git(top, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', `${prefix}/`]).toString().split('\0').filter(Boolean);
    const blobs = listing.map((line) => {
      const [meta, file] = line.split('\t');
      const [mode, type, id] = meta.split(' ');
      if (type !== 'blob' || mode === '120000') throw new InstallError(`${file} at ${ref} is not a plain file`);
      return { id, file: file.slice(prefix.length + 1) };
    }).filter((b) => !b.file.split('/').some((part) => IGNORED.has(part)));
    if (!blobs.length) throw new InstallError(`${ref} has no ${prefix}/`);
    const out = git(top, ['cat-file', '--batch'], `${blobs.map((b) => b.id).join('\n')}\n`);
    let at = 0;
    for (const blob of blobs) {
      const eol = out.indexOf(0x0a, at);
      const size = Number(out.subarray(at, eol).toString().split(' ')[2]);
      files.set(blob.file, out.subarray(eol + 1, eol + 1 + size));
      at = eol + 1 + size + 1;
    }
  } else {
    for (const file of walk(pkg)) files.set(file, fs.readFileSync(path.join(pkg, file)));
  }
  const stamp = files.get('PACKAGE_VERSION')?.toString().trim() ?? '';
  const version = stamp.startsWith(`${PACKAGE_NAME}@`) ? stamp.slice(PACKAGE_NAME.length + 1) : null;
  if (!version) throw new InstallError(`PACKAGE_VERSION is missing or not ${PACKAGE_NAME}@<version>`);
  return { version, source: { ref, commit }, files, folder: pkg };
}

/** The Claude Code entry point: a loader that points at the installed skill, as project skills do. */
export function claudeEntry(skillText, dir) {
  const description = /^description:\s*(.*)$/m.exec(skillText)?.[1]?.trim();
  if (!description) throw new InstallError('The package SKILL.md has no description');
  const link = path.posix.relative(path.posix.dirname(CLAUDE_ENTRY), `${dir}/SKILL.md`);
  return [
    '---',
    `name: ${PACKAGE_NAME}`,
    `description: ${description}`,
    '---',
    '',
    `Read [the installed canvas package skill](${link}) and follow it. This file is the Claude Code entry point that \`canvas install\` writes; the package itself is installed in \`${dir}/\` at the version in \`${LOCK_FILE}\`. Neither file is edited in the project.`,
    '',
  ].join('\n');
}

/** Every file the install puts in the project: {"<project path>": Buffer}. */
function targetFiles(source, dir) {
  const target = new Map();
  for (const [file, buffer] of source.files) target.set(`${dir}/${file}`, buffer);
  target.set(CLAUDE_ENTRY, Buffer.from(claudeEntry(source.files.get('SKILL.md')?.toString() ?? '', dir)));
  return target;
}

/** Whether a project path may be an installed file: the Claude entry, or a plain path inside the install folder. */
function installedPath(p, dir) {
  return typeof p === 'string' && (p === CLAUDE_ENTRY || p.startsWith(`${dir}/`))
    && !p.split('/').some((part) => !part || part === '.' || part === '..') && !p.includes('\\') && !isOwned(p);
}

export function readLock(project) {
  const file = path.join(project, LOCK_FILE);
  if (!fs.existsSync(file)) return null;
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (lock.schema !== LOCK_SCHEMA) throw new InstallError(`${LOCK_FILE} has schema ${lock.schema}; this version reads ${LOCK_SCHEMA}`);
  const dir = checkDir(lock.dir, `${LOCK_FILE} dir`);
  if (dir !== lock.dir) throw new InstallError(`${LOCK_FILE} dir ${lock.dir} is not a plain folder path`);
  const files = lock.files && typeof lock.files === 'object' ? Object.keys(lock.files) : null;
  if (!files || !Array.isArray(lock.kept)) throw new InstallError(`${LOCK_FILE} needs files and kept`);
  for (const key of [...files, ...lock.kept.map((k) => k?.path)]) {
    if (!installedPath(key, dir)) throw new InstallError(`${LOCK_FILE} lists ${key}, which is not an installed path; restore the lock from version control`);
  }
  return lock;
}

function checkDir(dir, label = '--dir') {
  const d = posix(path.normalize(String(dir ?? ''))).replace(/\/$/, '');
  if (!d || d === '.' || path.isAbsolute(d) || d.split('/').includes('..') || d.includes('\\')) throw new InstallError(`${label} ${dir} must be a folder inside the project`);
  if (isOwned(d)) throw new InstallError(`${label} ${dir} is a project-owned path`);
  if (d === CLAUDE_DIR || d.startsWith(`${CLAUDE_DIR}/`) || CLAUDE_DIR.startsWith(`${d}/`)) throw new InstallError(`${label} ${dir} overlaps the Claude Code entry point, ${CLAUDE_DIR}/`);
  return d;
}

/**
 * Refuses a project path that would be reached through a symbolic link (any folder on the way, or the file itself),
 * so nothing is read, written or deleted outside the project, and two paths never name one file.
 */
function guard(project, rel) {
  let at = project;
  for (const part of rel.split('/')) {
    at = path.join(at, part);
    let stat;
    try { stat = fs.lstatSync(at); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw new InstallError(`${posix(path.relative(project, at))} is a symbolic link; install and update write only real folders inside the project`);
  }
}

/** Refuses a --from package folder inside the project (the installed copy, for one). */
function refuseInside(project, folder) {
  const inside = path.relative(fs.realpathSync(project), fs.realpathSync(folder));
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) throw new InstallError('--from is inside the project; use a checkout of the package outside it');
}

/**
 * What an install or update would do. Compares, for each path, the hash in the lock (base), the new package's
 * (upstream) and the file in the project (local). Nothing is written here.
 */
export function plan({ project, lock, source, dir, keep = [], replace = [] }) {
  const target = targetFiles(source, dir);
  const upstream = new Map([...target].map(([p, b]) => [p, sha(b)]));
  const base = lock?.files ?? {};
  const local = (p) => {
    const file = path.join(project, p);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? sha(fs.readFileSync(file)) : undefined;
  };
  for (const p of upstream.keys()) if (!installedPath(p, dir)) throw new InstallError(`The package file ${p} cannot be installed`);
  const folded = new Map();
  for (const p of upstream.keys()) {
    const key = p.toLowerCase();
    if (folded.has(key)) throw new InstallError(`${p} and ${folded.get(key)} would be the same file on some systems`);
    folded.set(key, p);
  }
  guard(project, dir);
  guard(project, CLAUDE_ENTRY);
  const paths = new Set([...Object.keys(base), ...upstream.keys(), ...walk(path.join(project, dir)).map((p) => `${dir}/${p}`)]);
  for (const p of paths) guard(project, p);
  for (const p of [...keep.map((k) => k.path), ...replace]) {
    if (!paths.has(p)) throw new InstallError(`${p} is not an installed file`);
  }
  const replacing = new Set(replace);
  const kept = new Map((lock?.kept ?? []).map((k) => [k.path, k]));
  for (const k of keep) kept.set(k.path, { path: k.path, reason: k.reason ?? null, since: source.version });
  for (const p of replacing) kept.delete(p);

  const actions = [];
  const blocked = [];
  const files = {};
  const nextKept = [];
  for (const p of [...paths].sort()) {
    const B = base[p];
    const U = upstream.get(p);
    const L = local(p);
    if (U !== undefined) files[p] = U;
    if (L === U) continue;
    if (kept.has(p) && L !== undefined) {
      nextKept.push(kept.get(p));
      actions.push({ kind: 'kept', path: p, note: U === undefined ? 'the package no longer has it' : U !== B ? 'the package changed it' : null });
      continue;
    }
    if (L === undefined) { actions.push({ kind: B === undefined ? 'add' : 'restore', path: p }); continue; }
    if (L === B || replacing.has(p)) { actions.push({ kind: U === undefined ? 'delete' : 'replace', path: p }); continue; }
    if (B === undefined && U === undefined) blocked.push({ path: p, why: 'is not part of the package; move it out of the installed folder, delete it with --replace, or keep it with --keep' });
    else if (B === undefined) blocked.push({ path: p, why: 'exists and differs from the package; take the package version with --replace, or keep yours with --keep' });
    else blocked.push({ path: p, why: 'was edited in the project; take the package version with --replace, or keep the edit with --keep' });
  }
  for (const k of keep) if (!nextKept.some((n) => n.path === k.path)) actions.push({ kind: 'note', path: k.path, note: 'matches the package; nothing to keep' });
  const nextLock = {
    schema: LOCK_SCHEMA,
    package: PACKAGE_NAME,
    version: source.version,
    source: { ref: source.source.ref, commit: source.source.commit },
    dir,
    files,
    kept: nextKept.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return { target, actions, blocked, nextLock };
}

function writeAtomic(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
}

function removeEmptyParents(project, file) {
  let dir = path.dirname(file);
  while (dir.startsWith(project) && dir !== project && fs.existsSync(dir) && !fs.readdirSync(dir).length) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function apply(project, { target, actions, nextLock }, again) {
  try {
    guard(project, LOCK_FILE);
    for (const action of actions) {
      guard(project, action.path);
      const file = path.join(project, action.path);
      if (action.kind === 'add' || action.kind === 'restore' || action.kind === 'replace') writeAtomic(file, target.get(action.path));
      else if (action.kind === 'delete') { fs.rmSync(file); removeEmptyParents(project, file); }
    }
    writeAtomic(path.join(project, LOCK_FILE), `${JSON.stringify(nextLock, null, 2)}\n`);
  } catch (error) {
    // The lock is written last, so files written so far already match the package and a second run finishes the job.
    const message = error instanceof InstallError ? error.message : `${error.code ?? 'error'}: ${error.message}`;
    throw new InstallError(`It stopped part way (${message}). ${again}`);
  }
}

// ---------- the project's starting files (install only, each only when absent) ----------

function builderScript(dir, name) {
  const lib = `../../../${dir}/scripts/board-builder.mjs`;
  return `// The start canvas's builder script. Change it and run it again; never edit the boards it writes.
//
//   node canvases/start/tools/build.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanvas, cell, section } from '${lib}';

const canvasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const loops = [
  ['foundations', 'Foundations', 'Tokens, type, colour and motion, drawn from the pinned kit.'],
  ['lab', 'Component lab', 'One component per page, with its states, a playground and the component in place.'],
  ['app', 'App canvas', 'Every screen in rows: Live, Deciding, Building, Next and Later.'],
  ['exploring', 'Exploring', 'One question per canvas, with directions side by side and one lead.'],
];

const body = section({
  id: 'groups',
  title: 'Canvas groups',
  description: 'Each canvas has a builder script in its tools folder and passes the render check before anyone sees it.',
  body: \`<div class="shell-grid">\${loops.map(([id, label, text]) => cell({ id, label, body: \`<p>\${text}</p>\` })).join('')}</div>\`,
});

await buildCanvas({
  canvasDir,
  spec: {
    title: 'Start here',
    ws: { group: 'foundations' },
    pages: [{ id: 'start', name: 'Start here', boards: [{ file: 'start.dc.html', title: 'Start here', w: 1200, h: 480, shell: { kind: 'page', where: ${JSON.stringify(name)}, summary: 'How this project designs on canvases.', body } }] }],
  },
});
`;
}

function scaffold(project, { dir, source, name, namespace }) {
  const created = [];
  const notes = [];
  const create = (rel, content) => {
    guard(project, rel);
    const file = path.join(project, rel);
    if (fs.existsSync(file)) return false;
    writeAtomic(file, content);
    created.push(rel);
    return true;
  };
  const config = {
    schema: 'canvas-config/1', name, canvases: 'canvases', kit: { namespace, pinned: 'kit/current' },
    skin: 'skin/board.css', port: 5410, groups: ['foundations', 'lab', 'app', 'exploring', 'decided', 'archive'],
  };
  create('canvas.config.json', `${JSON.stringify(config, null, 2)}\n`);
  const skin = source.files.get('assets/fixture-project/skin/board.css')?.toString() ?? '';
  create('skin/board.css', skin.replace(/^\/\* The fixture project's board skin\. \*\//, "/* The project's board skin. */"));
  const wroteBuilder = create('canvases/start/tools/build.mjs', builderScript(dir, name));
  create('canvases/start/README.md', 'Where to begin: the canvas groups this project uses and how each canvas is made.\n');
  if (!fs.existsSync(path.join(project, '.gitignore'))) create('.gitignore', '.canvas/\n');
  else if (!/^\/?\.canvas\/?$/m.test(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'))) notes.push('Add .canvas/ to .gitignore: it holds machine-local live kits and caches.');
  const script = `node ${dir}/scripts/canvas.mjs`;
  guard(project, 'package.json');
  const pkgFile = path.join(project, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    create('package.json', `${JSON.stringify({ name: path.basename(project).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'design', private: true, type: 'module', scripts: { canvas: script } }, null, 2)}\n`);
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    if (!pkg.scripts?.canvas) {
      pkg.scripts = { ...(pkg.scripts ?? {}), canvas: script };
      writeAtomic(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
      created.push('package.json (scripts.canvas)');
    } else if (pkg.scripts.canvas !== script) notes.push(`package.json already has a canvas script; the installed command line is ${script}.`);
  }
  if (wroteBuilder) {
    const run = spawnSync(process.execPath, [path.join(project, 'canvases/start/tools/build.mjs')], { cwd: project, encoding: 'utf8' });
    if (run.status !== 0) throw new InstallError(`The start canvas's builder failed:\n${run.stderr}`);
    created.push('canvases/start/project/ (built)');
  }
  return { created, notes };
}

// ---------- commands ----------

const describe = (lock) => {
  const { ref, commit } = lock.source;
  const at = !ref ? '' : commit.startsWith(ref) ? ` (${commit.slice(0, 7)})` : ` (${ref}, ${commit.slice(0, 7)})`;
  return `${lock.package} ${lock.version}${at}`;
};

function report(result, log) {
  const counts = {};
  for (const a of result.actions) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  const done = { add: 'added', restore: 'restored', replace: 'replaced', delete: 'deleted', kept: 'kept' };
  const parts = Object.keys(done).filter((k) => counts[k]).map((k) => `${counts[k]} ${done[k]}`);
  for (const a of result.actions) if (a.kind === 'kept' || a.kind === 'note') log(`  ${a.kind === 'kept' ? 'kept' : 'note'} ${a.path}${a.note ? `: ${a.note}` : ''}`);
  return parts.length ? parts.join(', ') : 'no file changes';
}

function refuse(result, err) {
  err('Nothing was written. These files need a decision:');
  for (const b of result.blocked) err(`  ${b.path} ${b.why}`);
  return 1;
}

export function install(options) {
  const project = path.resolve(options.project ?? process.cwd());
  if (fs.existsSync(path.join(project, LOCK_FILE))) throw new InstallError(`${LOCK_FILE} exists: the package is installed. Use canvas update.`);
  const dir = checkDir(options.dir ?? DEFAULT_DIR);
  const source = readSource({ from: options.from, ref: options.ref });
  refuseInside(project, source.folder);
  const result = plan({ project, lock: null, source, dir, replace: options.replace ?? [], keep: options.keep ?? [] });
  return { project, source, dir, result };
}

/** Runs a command; returns an exit code. log and err take one line each. */
export function run(command, argv, { log = console.log, err = console.error } = {}) {
  const { values: o } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' }, from: { type: 'string' }, ref: { type: 'string' }, dir: { type: 'string' },
      name: { type: 'string' }, namespace: { type: 'string' }, keep: { type: 'string', multiple: true },
      reason: { type: 'string', multiple: true }, replace: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' },
    },
    strict: true,
  });
  const project = path.resolve(o.project ?? process.cwd());
  const keep = (o.keep ?? []).map((p, i) => ({ path: posix(p), reason: o.reason?.[i] ?? null }));
  const replace = (o.replace ?? []).map(posix);
  try {
    if (command === 'verify') {
      const lock = readLock(project);
      if (!lock) { err(`No ${LOCK_FILE} in ${project}.`); return 1; }
      const keptPaths = new Set(lock.kept.map((k) => k.path));
      const problems = [];
      for (const [p, hash] of Object.entries(lock.files)) {
        const file = path.join(project, p);
        const local = fs.existsSync(file) ? sha(fs.readFileSync(file)) : undefined;
        if (local !== hash && !keptPaths.has(p)) problems.push(`${p} ${local === undefined ? 'is missing' : 'was edited'}`);
      }
      for (const p of walk(path.join(project, lock.dir))) if (!(`${lock.dir}/${p}` in lock.files) && !keptPaths.has(`${lock.dir}/${p}`)) problems.push(`${lock.dir}/${p} is not part of the package`);
      for (const p of problems) err(`  ${p}`);
      if (problems.length) { err(`The installed ${describe(lock)} differs from ${LOCK_FILE}. Restore it from a checkout of the package outside the project: canvas update --from <checkout>${lock.source.ref ? ` --ref ${lock.source.ref}` : ''} --replace <path>.`); return 1; }
      log(`${describe(lock)} in ${lock.dir} matches ${LOCK_FILE}${keptPaths.size ? `, with ${keptPaths.size} kept ${keptPaths.size === 1 ? 'file' : 'files'}` : ''}.`);
      return 0;
    }
    if (command === 'install') {
      const name = o.name ?? path.basename(project);
      const namespace = o.namespace ?? 'Kit';
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(namespace)) throw new InstallError('--namespace must be a JavaScript identifier');
      if (!name.trim()) throw new InstallError('--name must not be empty');
      if (!fs.existsSync(project)) fs.mkdirSync(project, { recursive: true });
      const { source, dir, result } = install({ project, from: o.from, ref: o.ref, dir: o.dir, keep, replace });
      if (result.blocked.length) return refuse(result, err);
      const summary = report(result, log);
      if (o['dry-run']) { log(`Would install ${describe(result.nextLock)} into ${dir}: ${summary}.`); return 0; }
      apply(project, result, `Delete ${LOCK_FILE} if it was written, then run canvas install again.`);
      const { created, notes } = scaffold(project, { dir, source, name, namespace });
      log(`Installed ${describe(result.nextLock)} into ${dir}: ${summary}. Lock: ${LOCK_FILE}.`);
      if (created.length) log(`Created ${created.join(', ')}.`);
      for (const note of notes) log(note);
      log('Run the command line with: npm run canvas -- <view | render | review | explore | comments | update | verify> ...');
      return 0;
    }
    if (command === 'update') {
      const lock = readLock(project);
      if (!lock) { err(`No ${LOCK_FILE} in ${project}: install the package first with canvas install.`); return 1; }
      if (!o.from) { err('canvas update needs --from <checkout or package> (and --ref <tag> for a pinned version).'); return 1; }
      const source = readSource({ from: o.from, ref: o.ref ?? null });
      refuseInside(project, source.folder);
      const result = plan({ project, lock, source, dir: lock.dir, keep, replace });
      if (result.blocked.length) return refuse(result, err);
      const summary = report(result, log);
      const same = JSON.stringify(result.nextLock) === JSON.stringify(lock);
      if (o['dry-run']) { log(`Would update ${describe(lock)} to ${describe(result.nextLock)}: ${summary}.`); return 0; }
      if (same && !result.actions.some((a) => a.kind !== 'kept' && a.kind !== 'note')) { log(`${describe(lock)} is installed; nothing to change.`); return 0; }
      apply(project, result, `Run canvas update again with the same --from${o.ref ? ` and --ref ${o.ref}` : ''}.`);
      log(`Updated ${describe(lock)} to ${describe(result.nextLock)}: ${summary}. Project-owned files were not touched.`);
      return 0;
    }
    err(`Unknown command ${command}`);
    return 1;
  } catch (error) {
    if (error instanceof InstallError) { err(error.message); return 1; }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try { process.exitCode = run(command, rest); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
