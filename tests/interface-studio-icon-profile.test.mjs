import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readIconProfile, prepareIconProfile, activateIconProfile, parseGlyphAliases, parseIconProfile, assertIconProfileLock } from '../metamodern-interface-studio/assets/studio-shell/scripts/icon-profile.mjs';
const updater = new URL('../metamodern-interface-studio/scripts/update-studio.mjs', import.meta.url).pathname;
const run = (root, ...args) => spawnSync(process.execPath, [updater, root, ...args, '--json'], { encoding: 'utf8' });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'studio-icon-profile-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/icon-map.json'), JSON.stringify({ icons: { Check: 'AliasIcon', Close: 'OtherIcon' } }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'synthetic-profile-test', type: 'module', dependencies: { '@hugeicons/core-free-icons': '4.3.5' } }));
  const pkg = (name, version, aliases = '') => {
    const dir = join(root, 'node_modules', name); mkdirSync(join(dir, 'dist/esm'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, type: 'module', exports: { '.': './dist/esm/index.js' } }));
    writeFileSync(join(dir, 'dist/esm/index.js'), aliases);
    return dir;
  };
  pkg('@hugeicons/react', '1.1.10'); pkg('@hugeicons/core-free-icons', '4.3.5');
  return { root, pkg };
}
test('no entitlement selects Free; configured Pro never substitutes Free and malformed profiles are refused', t => {
  const { root } = fixture(t); assert.equal(readIconProfile(root).edition, 'free');
  const normalized = parseIconProfile({ schema: 'studio-icon-profile/1', edition: 'pro' }); assert.doesNotThrow(() => assertIconProfileLock(normalized, normalized)); assert.throws(() => assertIconProfileLock({ ...normalized, version: 'wrong' }, normalized), /differs from its lock/);
  const free = prepareIconProfile(root); assert.equal(free.profile.edition, 'free'); assert.match(readFileSync(free.glyphs, 'utf8'), /core-free-icons/);
  writeFileSync(join(root, 'studio-icons.json'), JSON.stringify({ schema: 'studio-icon-profile/1', edition: 'pro' }));
  assert.throws(() => prepareIconProfile(root), /No fallback was applied/);
  writeFileSync(join(root, 'studio-icons.json'), JSON.stringify({ schema: 'studio-icon-profile/1', edition: 'pro', credential: 'synthetic-forbidden-field' }));
  assert.throws(() => readIconProfile(root), /Invalid Studio icon profile/);
});
test('Pro aliases resolve published ESM default files without a CJS barrel or Free source; missing glyph preserves configuration', t => {
  const { root, pkg } = fixture(t);
  const pro = pkg('@hugeicons-pro/core-stroke-rounded', '4.3.4', "export { default as AliasIcon, default as RealStrokeRounded } from './RealIcon.js';\nexport { default as OtherIcon } from './OtherIcon.js';");
  for (const file of ['RealIcon', 'OtherIcon']) writeFileSync(join(pro, 'dist/esm', file + '.js'), 'export default []; // synthetic fixture, no licensed geometry\n');
  assert.equal(parseGlyphAliases("export {default as EscapeIcon} from '../outside.js'").size, 0);
  writeFileSync(join(root, 'studio-shell.lock.json'), JSON.stringify({ schema: 'studio-shell-lock/2', package: { dependencies: { '@hugeicons/core-free-icons': '4.3.5' } } }));
  const before = readFileSync(join(root, 'package.json'), 'utf8');
  rmSync(join(pro, 'dist/esm/OtherIcon.js')); assert.throws(() => activateIconProfile(root, 'pro'), /no published ESM glyph/); assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before); assert.equal(readIconProfile(root).edition, 'free');
  writeFileSync(join(pro, 'dist/esm/OtherIcon.js'), 'export default []; // synthetic\n');
  const result = activateIconProfile(root, 'pro'), generated = readFileSync(result.glyphs, 'utf8');
  assert.match(generated, /export \{ default as AliasIcon \} from "@hugeicons-pro\/core-stroke-rounded\/dist\/esm\/RealIcon"/);
  assert.doesNotMatch(generated, /core-free-icons|dist\/cjs|_authToken|synthetic fixture/);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'))); assert.equal(manifest.dependencies['@hugeicons/core-free-icons'], undefined); assert.equal(manifest.dependencies['@hugeicons-pro/core-stroke-rounded'], '4.3.4');
  assert.equal(result.profile.glyphs, 2); assert.equal(readIconProfile(root).edition, 'pro');
  const lock = JSON.parse(readFileSync(join(root, 'studio-shell.lock.json'))); assert.equal(lock.package.dependencies['@hugeicons/core-free-icons'], undefined); assert.equal(lock.package.dependencies['@hugeicons-pro/core-stroke-rounded'], '4.3.4');
});
test('both host updates preserve explicit Pro profile, private dependency lock and generated files without managed hash exceptions', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-profile-update-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const host of ['vite', 'next']) {
    const dir = join(root, host); const created = run(dir, '--create', '--host', host); assert.equal(created.status, 0, created.stderr);
    const initial = JSON.parse(readFileSync(join(dir, 'studio-shell.lock.json'))); assert.equal(initial.icons.edition, 'free'); assert.equal(initial.files['studio-icons.json'], undefined);
    writeFileSync(join(dir, 'studio-icons.json'), '{"schema":"studio-icon-profile/1","edition":"pro"}\n');
    const pkgFile = join(dir, 'package.json'), pkg = JSON.parse(readFileSync(pkgFile)); delete pkg.dependencies['@hugeicons/core-free-icons']; pkg.dependencies['@hugeicons-pro/core-stroke-rounded'] = '4.3.4'; writeFileSync(pkgFile, JSON.stringify(pkg));
    const privateLock = '{"name":"synthetic-private-lock","lockfileVersion":3,"packages":{}}\n'; writeFileSync(join(dir, 'package-lock.json'), privateLock);
    mkdirSync(join(dir, '.studio-generated')); writeFileSync(join(dir, '.studio-generated/private-profile.ts'), '// synthetic generated imports\n');
    const result = run(dir, '--apply', '--skip-checks'); assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'package-lock.json'), 'utf8'), privateLock); assert.equal(JSON.parse(readFileSync(pkgFile)).dependencies['@hugeicons/core-free-icons'], undefined);
    const lock = JSON.parse(readFileSync(join(dir, 'studio-shell.lock.json'))); assert.equal(lock.icons.edition, 'pro'); assert.equal(lock.icons.version, '4.3.4'); assert.equal(lock.files['.studio-generated/private-profile.ts'], undefined); assert.equal(lock.files['studio-icons.json'], undefined); assert.equal(lock.kept.length, 0);
    rmSync(join(dir, 'studio-icons.json'));
    const refused = run(dir, '--apply', '--skip-checks'); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /Configured Pro icon profile declaration is missing/); assert.equal(readFileSync(join(dir, 'package-lock.json'), 'utf8'), privateLock);
  }
});
