// The package's Node tooling (esbuild, React 19 for the fixture kit, playwright-core) lives in
// assets/tooling/package.json and is installed outside the repository, in a cache folder keyed by the
// lockfile's hash, so no node_modules ever lands inside a skill package.
//
//   node scripts/tooling.mjs install            install the tooling (npm ci) if it is not there yet
//   node scripts/tooling.mjs install --browser  also install Playwright's headless Chromium
//   node scripts/tooling.mjs path               print the tooling folder
//
// CANVAS_TOOLING_DIR overrides the folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TOOLING_SOURCE = path.resolve(here, '..', 'assets', 'tooling');

export function toolingDir() {
  if (process.env.CANVAS_TOOLING_DIR) return path.resolve(process.env.CANVAS_TOOLING_DIR);
  const lock = fs.readFileSync(path.join(TOOLING_SOURCE, 'package-lock.json'));
  const hash = crypto.createHash('sha256').update(lock).digest('hex').slice(0, 12);
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'metamodern-canvas-tooling', hash);
}

export function toolingInstalled(dir = toolingDir()) {
  return fs.existsSync(path.join(dir, 'node_modules', '.package-lock.json'));
}

export function installTooling({ browser = false, withDeps = false, quiet = false } = {}) {
  const dir = toolingDir();
  if (!toolingInstalled(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(TOOLING_SOURCE, file), path.join(dir, file));
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`npm ci failed in ${dir}${quiet ? `\n${result.stderr}` : ''}`);
  }
  if (browser) {
    const cli = path.join(dir, 'node_modules', 'playwright-core', 'cli.js');
    const args = [cli, 'install', '--only-shell', 'chromium'];
    if (withDeps) args.splice(2, 0, '--with-deps');
    const result = spawnSync(process.execPath, args, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Chromium install failed${quiet ? `\n${result.stderr}` : ''}`);
  }
  return dir;
}

/** require() bound to the tooling folder, or null when it is not installed. */
export function toolingRequire(dir = toolingDir()) {
  if (!toolingInstalled(dir)) return null;
  return createRequire(path.join(dir, 'package.json'));
}

/** playwright-core's chromium from the tooling, or null. */
export function chromium(dir = toolingDir()) {
  const require = toolingRequire(dir);
  return require ? require('playwright-core').chromium : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...flags] = process.argv.slice(2);
  if (command === 'install') {
    const dir = installTooling({ browser: flags.includes('--browser'), withDeps: flags.includes('--with-deps') });
    console.log(dir);
  } else if (command === 'path') {
    console.log(toolingDir());
  } else {
    console.error('Usage: node scripts/tooling.mjs install [--browser] [--with-deps] | path');
    process.exit(1);
  }
}
