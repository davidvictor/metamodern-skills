/** Compose one common shell and its small framework overlay. No product files are read. */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
const ignored = new Set(['node_modules', 'dist', '.next', 'out', '.acceptance', '.git']);
export function tree(root, dir = root) {
  return Object.fromEntries(readdirSync(dir).sort().flatMap(name => {
    if (ignored.has(name) || name.endsWith('.log')) return [];
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return Object.entries(tree(root, file));
    return [[relative(root, file).split('\\').join('/'), `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`]];
  }));
}
export function composeHost(host = 'vite', { common = join(assets, 'studio-shell'), output } = {}) {
  if (!['vite', 'next'].includes(host)) throw new Error(`Unknown Studio host ${host}`);
  const overlay = join(assets, 'studio-hosts', host);
  const dir = output ?? mkdtempSync(join(tmpdir(), `studio-${host}-source-`));
  mkdirSync(dir, { recursive: true });
  if (!output) process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  const copy = root => { for (const file of Object.keys(tree(root))) { mkdirSync(dirname(join(dir, file)), { recursive: true }); cpSync(join(root, file), join(dir, file)); } };
  copy(common); copy(overlay);
  const commonHashes = tree(common), overlayHashes = tree(overlay);
  const hashes = tree(dir);
  return { dir: realpathSync(dir), host, composition: { common: commonHashes, overlay: overlayHashes, files: hashes }, cleanup: () => { if (!output) rmSync(dir, { recursive: true, force: true }); } };
}
