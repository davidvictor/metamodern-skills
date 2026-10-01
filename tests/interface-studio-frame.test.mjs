import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const root = new URL('../metamodern-interface-studio/assets/studio-shell/', import.meta.url);
const source = readFileSync(new URL('src/studio/profile-frame.ts', root), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' })).toString('base64')}`);

test('declared device corners match the renderer at fractional, small and large zoom', () => {
  for (const scale of [0.1, 0.25, 0.625, 1, 2, 4]) {
    assert.equal(model.scaledFrameRadius({ kind: 'phone', frameRadius: 66 }, 410, 864, scale), 66 * scale);
    assert.equal(model.scaledFrameRadius({ kind: 'tablet', frameRadius: 24 }, 834, 1112, scale), 24 * scale);
  }
});

test('tablets get their own defaults and a flat renderer can explicitly opt out', () => {
  assert.equal(model.scaledFrameRadius({ kind: 'phone' }, 390, 844, 1), 44);
  assert.equal(model.scaledFrameRadius({ kind: 'tablet' }, 834, 1112, 1), 28);
  assert.equal(model.scaledFrameRadius({ kind: 'desktop' }, 1280, 800, 1), 8);
  assert.equal(model.scaledFrameRadius({ kind: 'tablet', frameRadius: 0 }, 834, 1112, 1), 0);
  assert.equal(model.scaledFrameRadius({ kind: 'phone', frameRadius: 900 }, 100, 80, 1), 40);
});
