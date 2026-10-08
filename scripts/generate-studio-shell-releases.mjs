#!/usr/bin/env node
import { composeHost } from '../metamodern-interface-studio/scripts/compose-host.mjs';
/**
 * Regenerate metamodern-interface-studio/assets/studio-shell.releases.json: the
 * file hashes of every released shell starter, read from Git history, plus the
 * working tree for the current version. The shell updater uses it to adopt a
 * Studio made before lock files existed. Run it on every shell release.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const skill = 'metamodern-interface-studio';
const starter = `${skill}/assets/studio-shell`;
const out = join(repo, skill, 'assets/studio-shell.releases.json');
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '.acceptance', '.git']);
const IGNORED_FILES = new Set(['.DS_Store', 'acceptance-report.json', 'studio-shell.lock.json']);
const ignored = (path) => path.split('/').some((part, i, all) => (i < all.length - 1 ? IGNORED_DIRS.has(part) : IGNORED_FILES.has(part) || part.endsWith('.log')));
const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 });
const packageBase = (pkg) => ({ dependencies: pkg.dependencies ?? {}, devDependencies: pkg.devDependencies ?? {}, scripts: pkg.scripts ?? {} });

// Keep candidate dependency fingerprints as well as published main history.
const versions = JSON.parse(readFileSync(out, "utf8")).versions ?? {};
const rebuilt = new Set();
// Released versions are the merges on main's first-parent line; newest first, so the newest
// commit carrying a version is that version's release. Branch work in progress never counts.
for (const commit of git('log', '--first-parent', '--format=%H', 'main', '--', skill).toString().trim().split('\n')) {
  let version;
  try {
    version = git('show', `${commit}:${skill}/PACKAGE_VERSION`).toString().trim().replace(/^.*@/, '');
  } catch {
    continue;
  }
  if (rebuilt.has(version)) continue;
  rebuilt.add(version);
  const paths = git('ls-tree', '-r', '--name-only', commit, '--', starter).toString().trim().split('\n').filter(Boolean);
  if (!paths.length) continue;
  const files = {};
  for (const path of paths) {
    const rel = path.slice(starter.length + 1);
    if (!ignored(rel)) files[rel] = sha(git('show', `${commit}:${path}`));
  }
  versions[version] = { commit, files, package: packageBase(JSON.parse(git('show', `${commit}:${starter}/package.json`).toString())) };
}

// The working tree is the current release.
const current = readFileSync(join(repo, skill, 'PACKAGE_VERSION'), 'utf8').trim().replace(/^.*@/, '');
const composed = composeHost('vite');
const next = composeHost('next');
const files = composed.composition.files;
versions[current] = { commit: 'working tree', files, package: packageBase(JSON.parse(readFileSync(join(composed.dir, 'package.json'), 'utf8'))), hosts: { vite: { files, composition: composed.composition }, next: { files: next.composition.files, composition: next.composition, package: packageBase(JSON.parse(readFileSync(join(next.dir, 'package.json'), 'utf8'))) } } };

const sorted = Object.fromEntries(Object.entries(versions).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([v, r]) => [v, { files: r.files, package: r.package, ...(r.hosts ? { hosts: r.hosts } : {}) }]));
writeFileSync(out, `${JSON.stringify({ schema: 'studio-shell-releases/1', versions: sorted }, null, 2)}\n`);
console.log(`Wrote ${relative(repo, out)}: ${Object.keys(sorted).join(', ')}`);
