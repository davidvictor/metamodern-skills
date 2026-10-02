import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const shell = new URL('../metamodern-interface-studio/assets/studio-shell/', import.meta.url);
const read = (path) => readFileSync(new URL(path, shell), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(read('src/studio/compare.ts'), { mode: 'strip' })).toString('base64')}`);

test('a saved comparison keeps values and count in step', () => {
  const five = model.savedComparison({ values: ['a', 'b', 'c', 'd', 'e'] }, 'x', 'y');
  assert.deepEqual(five.values, ['a', 'b', 'c', 'd']);
  assert.equal(five.count, 4);
  const one = model.savedComparison({ values: ['a'] }, 'x', 'y');
  assert.deepEqual(one.values, ['a', 'y']);
  assert.equal(one.count, 2);
  assert.deepEqual(model.savedComparison({ values: ['y'] }, 'x', 'y').values, ['y', 'x'], 'the completed side is never the same value');
  assert.deepEqual(model.savedComparison({ a: 'p' }, 'x', 'y'), { a: 'p', b: 'y', values: ['p', 'y'], count: 2 }, 'legacy a/b still form a pair');
  for (const file of ['src/store.tsx', 'src/components/studio/rail-panel.tsx']) {
    assert.match(read(file), /savedComparison\(/, `${file} stores a saved comparison through the shared normalizer`);
  }
});

test('the resolved sides always start with the A and B the selectors show', () => {
  const options = ['light', 'dark', 'contrast', 'dim'];
  const invalidFirst = model.resolveComparison(options, ['gone', 'dark', 'dim'], 3);
  assert.equal(invalidFirst.a, 'light');
  assert.equal(invalidFirst.b, 'dark');
  assert.deepEqual(invalidFirst.compared, ['light', 'dark', 'dim']);
  const duplicateB = model.resolveComparison(options, ['dark', 'dark', 'dim', 'light'], 4);
  assert.deepEqual(duplicateB.compared.slice(0, 2), [duplicateB.a, duplicateB.b]);
  assert.deepEqual(duplicateB.compared, ['dark', 'light', 'dim', 'contrast']);
  const fallback = model.resolveComparison(options, ['role.admin', 'role.viewer', 'role.guest'], 3, ['light', 'dim']);
  assert.deepEqual(fallback.compared, ['light', 'dim', 'dark'], 'a fallback axis seeds its fixed pair and fills from its own options');
  assert.deepEqual(model.resolveComparison(options, ['light', 'dark', 'contrast'], 2).compared, ['light', 'dark']);
  const views = read('src/components/studio/views.tsx');
});

test('the count is capped at the values an axis has and an axis without two is unavailable', () => {
  const three = model.resolveComparison(['light', 'dark', 'dim'], ['light', 'dark', 'dim', 'contrast'], 4);
  assert.equal(three.count, 3, '4-up on a three-value axis shows and waits for three sides');
  assert.deepEqual(three.compared, ['light', 'dark', 'dim']);
  assert.equal(three.available, true);
  const two = model.resolveComparison(['a', 'b'], ['a', 'b'], 4);
  assert.equal(two.count, 2);
  assert.equal(two.compared.length, 2);
  const one = model.resolveComparison(['only'], ['only', 'other'], 4);
  assert.equal(one.count, 2, 'never below two');
  assert.equal(one.available, false, 'one value cannot be compared');
  assert.equal(model.resolveComparison([], [], 2).available, false);
  assert.equal(model.resolveComparison(['light'], [], 2, ['light', 'light']).available, false, 'a fallback pair of one theme is unavailable');
  assert.equal(model.resolveComparison(['light', 'dark'], [], 3, ['light', 'dark']).count, 2);
  const views = read('src/components/studio/views.tsx');
  assert.match(views, /const \{ a, b, compared, count, available \} = resolveComparison\(/, 'CompareStage waits only for the sides it mounts');
  assert.match(views, /if \(!available\) \{\s*set\(\{ preview: \{ status: "error"/, 'an unavailable axis is explained, not left loading');
  assert.match(views, /Nothing to compare on this axis/);
});

test('choosing a value another side shows swaps the two sides', () => {
  assert.deepEqual(model.chooseCompared(['light', 'dark', 'dim'], 0, 'dim'), ['dim', 'dark', 'light']);
  assert.deepEqual(model.chooseCompared(['light', 'dark'], 1, 'light'), ['dark', 'light']);
  assert.deepEqual(model.chooseCompared(['light', 'dark'], 1, 'contrast'), ['light', 'contrast']);
  assert.deepEqual(model.chooseCompared(['light', 'dark'], 0, 'light'), ['light', 'dark']);
  const views = read('src/components/studio/views.tsx');
  assert.equal(views.match(/chooseCompared\(compared, /g)?.length, 2, 'A/B and the extra sides both choose through the swap');
});
