/** Build-only icon profile resolution. Credentials and geometry never enter this module or generated source. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
export const PROFILE_FILE = 'studio-icons.json';
export const ICON_PROFILES = Object.freeze({ free: { schema: 'studio-icon-profile/1', edition: 'free', package: '@hugeicons/core-free-icons', version: '4.3.5', style: 'stroke-rounded' }, pro: { schema: 'studio-icon-profile/1', edition: 'pro', package: '@hugeicons-pro/core-stroke-rounded', version: '4.3.4', style: 'stroke-rounded' } });
export function parseIconProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== 'studio-icon-profile/1' || !['free', 'pro'].includes(data.edition) || Object.keys(data).some(key => !['schema', 'edition'].includes(key))) throw Error('Invalid Studio icon profile; expected schema and explicit free/pro edition');
  return { ...ICON_PROFILES[data.edition] };
}
export function assertIconProfileLock(recorded, profile) {
  if (!recorded || typeof recorded !== 'object' || Array.isArray(recorded) || Object.keys(recorded).some(key => !Object.hasOwn(profile, key)) || Object.keys(profile).some(key => recorded[key] !== profile[key])) throw Error('Studio icon profile differs from its lock declaration; run explicit profile activation or the managed updater');
}
export function readIconProfile(root) {
  const file = join(root, PROFILE_FILE);
  if (!existsSync(file)) {
    const lock = join(root, 'studio-shell.lock.json');
    if (existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).icons?.edition === 'pro') throw Error('Configured Pro icon profile declaration is missing; restore it or activate a profile explicitly. No Free fallback was applied.');
    return { ...ICON_PROFILES.free };
  }
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { throw Error('Invalid Studio icon profile JSON'); }
  return parseIconProfile(data);
}
export function projectIconPackage(pkg, profile) {
  const dependencies = { ...pkg.dependencies };
  delete dependencies[profile.edition === 'pro' ? ICON_PROFILES.free.package : ICON_PROFILES.pro.package];
  dependencies[profile.package] = profile.version;
  dependencies['@hugeicons/react'] = '1.1.10';
  return { ...pkg, dependencies };
}
export function parseGlyphAliases(source) {
  const aliases = new Map();
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!/^\.\/[A-Za-z\d_]+\.js$/.test(match[2])) continue;
    for (const alias of match[1].matchAll(/default\s+as\s+([A-Za-z\d_]+)/g)) aliases.set(alias[1], basename(match[2], '.js'));
  }
  return aliases;
}
function packageRoot(root, name) {
  const require = createRequire(join(root, 'package.json'));
  let cursor = dirname(require.resolve(name));
  while (cursor !== dirname(cursor)) {
    const file = join(cursor, 'package.json');
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).name === name) return cursor;
    cursor = dirname(cursor);
  }
  throw Error(`Cannot locate installed icon package ${name}`);
}
export function prepareIconProfile(root, selected) {
  const explicit = selected !== undefined;
  const profile = ICON_PROFILES[(selected ?? readIconProfile(root)).edition];
  if (!profile) throw Error('Unknown Studio icon edition');
  const managedLock = join(root, 'studio-shell.lock.json');
  if (!explicit && existsSync(managedLock)) {
    const recorded = JSON.parse(readFileSync(managedLock, 'utf8')).icons;
    if (recorded) assertIconProfileLock(recorded, profile);
  }
  let installed;
  try { installed = packageRoot(root, profile.package); } catch { throw Error(`Configured ${profile.edition} icon profile requires ${profile.package}@${profile.version}; install it explicitly before building. No fallback was applied.`); }
  const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  if (pkg.version !== profile.version) throw Error(`Configured icon profile requires exact ${profile.package}@${profile.version}; found ${pkg.version}`);
  const renderer = JSON.parse(readFileSync(join(packageRoot(root, '@hugeicons/react'), 'package.json'), 'utf8'));
  if (renderer.version !== '1.1.10') throw Error('Studio icon profiles require @hugeicons/react@1.1.10');
  const map = JSON.parse(readFileSync(join(root, 'src/icon-map.json'), 'utf8'));
  const names = [...new Set(Object.values(map.icons))].sort();
  const index = readFileSync(join(installed, 'dist/esm/index.js'), 'utf8');
  const aliases = profile.edition === 'pro' ? parseGlyphAliases(index) : null;
  const sourceHashes = [['dist/esm/index.js', createHash('sha256').update(index).digest('hex')]];
  const imports = names.map(name => {
    if (!/^[A-Za-z\d_]+$/.test(name)) throw Error('Invalid semantic glyph name');
    if (profile.edition === 'free') return `export { ${name} } from ${JSON.stringify(profile.package)};`;
    const file = aliases.get(name);
    if (!file || !existsSync(join(installed, 'dist/esm', file + '.js'))) throw Error(`Pro icon profile has no published ESM glyph for ${name}; no Free substitution is allowed`);
    sourceHashes.push(['dist/esm/' + file + '.js', createHash('sha256').update(readFileSync(join(installed, 'dist/esm', file + '.js'))).digest('hex')]);
    return `export { default as ${name} } from ${JSON.stringify(profile.package + '/dist/esm/' + file)};`;
  }).join('\n') + '\n';
  const receipt = { ...profile, renderer: { package: '@hugeicons/react', version: '1.1.10' }, glyphs: names.length, sourceFingerprint: createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex'), mapFingerprint: createHash('sha256').update(JSON.stringify(map)).digest('hex'), importFingerprint: createHash('sha256').update(imports).digest('hex') };
  const generated = join(root, '.studio-generated'); mkdirSync(generated, { recursive: true });
  const glyphs = join(generated, 'icon-glyphs.ts'), metadata = join(generated, 'icon-profile.ts');
  writeFileSync(glyphs, imports);
  writeFileSync(metadata, `export const ICON_PROFILE = ${JSON.stringify(receipt)} as const;\nexport const ICON_EDITION: "free" | "pro" = ICON_PROFILE.edition;\n`);
  writeFileSync(join(generated, 'icon-profile.json'), JSON.stringify(receipt, null, 2) + '\n');
  return { profile: receipt, glyphs, metadata };
}
export function activateIconProfile(root, edition) {
  if (!ICON_PROFILES[edition]) throw Error('Select free or pro explicitly');
  // Validate every import before changing the existing configuration/package/lock.
  const prepared = prepareIconProfile(root, ICON_PROFILES[edition]);
  const pkgFile = join(root, 'package.json'), pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  writeFileSync(pkgFile, JSON.stringify(projectIconPackage(pkg, prepared.profile), null, 2) + '\n');
  writeFileSync(join(root, PROFILE_FILE), JSON.stringify({ schema: 'studio-icon-profile/1', edition }, null, 2) + '\n');
  const lockFile = join(root, 'studio-shell.lock.json');
  if (existsSync(lockFile)) { const lock = JSON.parse(readFileSync(lockFile, 'utf8')); lock.icons = ICON_PROFILES[edition]; lock.package = projectIconPackage(lock.package ?? pkg, prepared.profile); writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n'); }
  return prepared;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [action = 'prepare', edition] = process.argv.slice(2);
    if (!['prepare', 'activate'].includes(action)) throw Error('Usage: node scripts/icon-profile.mjs prepare | activate free|pro');
    const result = action === 'activate' ? activateIconProfile(process.cwd(), edition) : prepareIconProfile(process.cwd());
    console.log(`Studio icons: ${result.profile.edition}, ${result.profile.package}@${result.profile.version}, ${result.profile.glyphs} mapped glyphs. ${action === 'activate' ? 'Run npm install with your protected registry configuration to synchronize the dependency lock, then run the host checks.' : ''}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
