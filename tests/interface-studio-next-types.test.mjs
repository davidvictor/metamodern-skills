import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const overlay = new URL('../metamodern-interface-studio/assets/studio-hosts/next/', import.meta.url);
test('Next standalone checks regenerate current production route types and exclude stale development validators', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', overlay), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('tsconfig.json', overlay), 'utf8'));
  for (const script of ['build', 'typecheck']) {
    const steps = pkg.scripts[script].split(' && ');
    assert.ok(steps.indexOf('tsx scripts/prepare-next.ts') < steps.indexOf('next typegen'), `${script} generates routes after the selected static/Node service is prepared`);
    assert.ok(steps.indexOf('next typegen') < steps.indexOf('tsc --noEmit'), `${script} checks current route definitions`);
  }
  assert.ok(config.include.includes('.next/types/**/*.ts'), 'current generated validators remain checked');
  assert.ok(config.exclude.includes('.next/dev/types'), 'development validators cannot import deleted static-build routes');
  assert.ok(pkg.scripts.build.endsWith('next build'), 'the normal build retains framework validation');
});
