import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { initialScriptGraph } from '../metamodern-interface-studio/assets/studio-shell/scripts/initial-graph.mjs';

test('initial script budget traverses static imports/preloads once and excludes lazy code, refusing escapes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-initial-graph-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'assets'));
  const entry = 'import "./shared.js"; export * from "./shared.js"; import("./lazy.js");';
  const shared = 'export const shared = 1;', lazy = 'export const lazy = 2;';
  writeFileSync(join(dir, 'index.html'), '<script type="module" src="./assets/entry.js"></script><link rel="modulepreload" href="./assets/shared.js">');
  for (const [name, text] of Object.entries({ entry, shared, lazy })) writeFileSync(join(dir, 'assets', name + '.js'), text);
  // The parser seam lets this Node-only suite exercise graph traversal; acceptance supplies Vite's real AST parser.
  const parse = code => ({ body: code === entry ? [{ type: 'ImportDeclaration', source: { value: './shared.js' } }, { type: 'ExportAllDeclaration', source: { value: './shared.js' } }, { type: 'ExpressionStatement' }] : [] });
  const result = initialScriptGraph(dir, parse);
  assert.deepEqual(result.scripts.map(row => row.file), ['assets/entry.js', 'assets/shared.js']);
  assert.equal(result.gzip, gzipSync(entry).length + gzipSync(shared).length);
  writeFileSync(join(dir, 'index.html'), '<script src="https://external.invalid/unmeasured.js"></script>');
  assert.throws(() => initialScriptGraph(dir, parse), /Unmeasurable/);
  writeFileSync(join(dir, 'index.html'), '<script src="../outside.js"></script>');
  assert.throws(() => initialScriptGraph(dir, parse), /leaves the build output/);
  const baseline = JSON.parse(readFileSync(new URL('../metamodern-interface-studio/evidence/optional-layers/baseline-0.18.0.json', import.meta.url)));
  assert.equal(baseline.sourceRevision, '874d5077ba0204cf77947e21509901003017d40e');
  assert.equal(baseline.gzip, baseline.scripts.reduce((sum, row) => sum + row.gzip, 0));
  assert.equal(baseline.gzip, 329651);
});
