// Builds the neutral fixture kit (assets/fixture-kit) to a kit folder that follows contract 3, with
// kit.json written last. Needs the tooling (node scripts/tooling.mjs install).
//
//   node scripts/build-fixture-kit.mjs <out-dir>
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolingRequire } from './tooling.mjs';
import { writeKitManifest } from './kit-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, '..', 'assets', 'fixture-kit', 'src');
const PACKAGE_ROOT = path.resolve(here, '..');

function packageVersion() {
  return readFileSync(path.join(PACKAGE_ROOT, 'PACKAGE_VERSION'), 'utf8').trim().split('@').pop();
}

function sourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PACKAGE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '0'.repeat(40);
  }
}

/**
 * Builds the fixture kit into outDir. `version` and `source` override kit.json's, so a test can build a
 * second, "live" copy (source.branch, source.dirty) beside the pinned one.
 */
export async function buildFixtureKit(outDir, { version: versionOverride, source: sourceOverride } = {}) {
  const require = toolingRequire();
  if (!require) throw new Error('The canvas tooling is not installed: node scripts/tooling.mjs install');
  const esbuild = require('esbuild');
  const reactVersion = require('react/package.json').version;
  const version = versionOverride ?? `${packageVersion()}-fixture`;
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'components'), { recursive: true });
  const toolingModules = path.dirname(path.dirname(require.resolve('react/package.json')));
  await esbuild.build({
    entryPoints: [path.join(SOURCE, 'kit.jsx')],
    outfile: path.join(outDir, 'components', 'bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    jsx: 'automatic',
    nodePaths: [toolingModules],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    legalComments: 'eof',
  });
  const bundle = path.join(outDir, 'components', 'bundle.js');
  await fs.writeFile(bundle, (await fs.readFile(bundle, 'utf8')).replace('__VERSION__', version));
  await fs.copyFile(path.join(SOURCE, 'kit.css'), path.join(outDir, 'components', 'bundle.css'));
  await fs.copyFile(path.join(SOURCE, 'scenes.js'), path.join(outDir, 'components', 'scenes.js'));
  await fs.copyFile(path.join(SOURCE, 'scenes.css'), path.join(outDir, 'components', 'scenes.css'));
  await fs.copyFile(path.join(SOURCE, 'index.d.ts'), path.join(outDir, 'components', 'index.d.ts'));
  await fs.copyFile(path.join(SOURCE, 'tokens.json'), path.join(outDir, 'tokens.json'));
  await writeKitManifest(outDir, {
    schema: 'canvas-kit/1',
    namespace: 'Fixture',
    version,
    source: { repo: 'davidvictor/metamodern-skills', commit: sourceCommit(), dirty: false, ...sourceOverride },
    inputs: ['metamodern-work-on-canvases/assets/fixture-kit/src/**', 'metamodern-work-on-canvases/assets/runtime/support/react-markup.js'],
    builtAt: new Date().toISOString(),
    react: reactVersion,
  });
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node scripts/build-fixture-kit.mjs <out-dir>');
    process.exit(1);
  }
  await buildFixtureKit(path.resolve(out));
  console.log(path.resolve(out));
}
