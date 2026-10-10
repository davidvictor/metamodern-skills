/** Real Next/Webpack regression proof. Prepare an owned generic Next host, start it with
 * next dev --webpack, then run: node scripts/verify-next-saved-transport.mjs URL FIXTURE_ROOT.
 * Never point this destructive fixture check at a product Studio: it deliberately corrupts
 * and restores only its marked synthetic journal. Service lifecycle belongs to the caller.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [url, directory] = process.argv.slice(2);
if (url === '--prepare') {
  assert.ok(directory, 'Usage: node scripts/verify-next-saved-transport.mjs --prepare FRESH_DIRECTORY');
  const root = resolve(directory);
  assert.ok(!existsSync(root), 'Prepare only a new task-owned directory');
  const updater = fileURLToPath(new URL('../metamodern-interface-studio/scripts/update-studio.mjs', import.meta.url));
  const created = spawnSync(process.execPath, [updater, root, '--create', '--host', 'next', '--json'], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  // Keep the real canonical saved route and validators; omit shell-only aliases/UI preparation.
  writeFileSync(join(root, 'next.config.mjs'), 'export default { devIndicators: false }\n');
  mkdirSync(join(root, 'app/%5F%5Fstudio/[file]'), { recursive: true });
  writeFileSync(join(root, 'app/%5F%5Fstudio/[file]/route.ts'), 'export { GET, POST } from "../../saved-route"\nexport const dynamic = "force-dynamic"\nexport const runtime = "nodejs"\n');
  writeFileSync(join(root, 'app/layout.tsx'), 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }\n');
  writeFileSync(join(root, 'app/page.tsx'), 'export default function Page() { return <p>Synthetic saved transport fixture</p> }\n');
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', plugins: [{ name: 'next' }] }, include: ['app/**/*.tsx', 'app/**/*.ts', 'next-env.d.ts'], exclude: ['node_modules'] }, null, 2) + '\n');
  writeFileSync(join(root, '.saved-transport-fixture'), 'studio-next-saved-transport-fixture/1\n');
  console.log(JSON.stringify({ root, next: 'Install dependencies from the generated package.json, then start node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port OWNED_PORT', verify: 'Run this script with the URL and fixture directory' }));
  process.exit(0);
}
assert.ok(url && directory, 'Usage: node scripts/verify-next-saved-transport.mjs URL FIXTURE_ROOT');
const root = resolve(directory), base = new URL(url).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use a task-owned loopback fixture');
assert.equal(readFileSync(join(root, '.saved-transport-fixture'), 'utf8').trim(), 'studio-next-saved-transport-fixture/1');
const file = join(root, 'directions.json');
assert.ok(!existsSync(file), 'Start with a fresh synthetic fixture journal');
const statuses = [];
async function call(name, method = 'GET', data, headers = {}) {
  const response = await fetch(`${base}/__studio/${name}`, { method,
    headers: { origin: base, 'content-type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  statuses.push({ name, method, status: response.status });
  return response;
}
const empty = { schema: 'studio-directions/1', revisions: [], events: [] };
for (const name of ['directions', 'layouts', 'scenarios']) {
  const response = await call(name);
  assert.equal(response.status, 200, `${name}: ${await response.clone().text()}`);
  assert.equal(response.headers.get('x-studio-revision'), 'empty');
  assert.equal((await response.json()).schema, `studio-${name}/1`);
}
const one = { ...empty, revisions: [{ schema: 'studio-direction/1', id: 'synthetic', label: 'Synthetic', revision: 1,
  createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
  product: { id: 'synthetic-product', revision: 'fixture-1' }, payloadSchema: 'synthetic/1', payload: { value: 1 } }] };
assert.equal((await call('directions', 'POST', one)).status, 428);
assert.equal((await call('directions', 'POST', one, { origin: 'http://attacker.invalid', 'x-studio-expected-revision': 'empty' })).status, 403);
assert.equal((await call('directions', 'POST', one, { 'content-type': 'text/plain', 'x-studio-expected-revision': 'empty' })).status, 415);
const saved = await call('directions', 'POST', one, { 'x-studio-expected-revision': 'empty' });
assert.equal(saved.status, 200, await saved.clone().text());
const bytes = readFileSync(file, 'utf8'), revision = saved.headers.get('x-studio-revision');
assert.equal(revision, createHash('sha256').update(bytes).digest('hex'));
assert.deepEqual(JSON.parse(bytes), one);
const stale = await call('directions', 'POST', one, { 'x-studio-expected-revision': 'empty' });
assert.equal(stale.status, 409);
assert.equal((await stale.json()).current.revision, revision);
assert.equal((await call('directions', 'POST', empty, { 'x-studio-expected-revision': revision })).status, 422);
assert.equal((await call('directions', 'POST', '{', { 'x-studio-expected-revision': revision })).status, 400);
assert.equal((await call('directions', 'POST', 'x'.repeat(1024 * 1024 + 1), { 'x-studio-expected-revision': revision })).status, 413);
assert.equal(readFileSync(file, 'utf8'), bytes);
const two = { ...one, revisions: [...one.revisions, { ...one.revisions[0], revision: 2, updatedAt: '2026-10-09T00:01:00Z', payload: { value: 2 } }] };
assert.equal((await call('directions', 'POST', two, { 'x-studio-expected-revision': revision })).status, 200);
assert.deepEqual(await (await call('directions')).json(), two);
const nextBytes = readFileSync(file, 'utf8');
try {
  writeFileSync(file, 'torn {');
  assert.equal((await call('directions')).status, 500);
  assert.equal((await call('directions', 'POST', two, { 'x-studio-expected-revision': revision })).status, 500);
  assert.equal(readFileSync(file, 'utf8'), 'torn {');
} finally { writeFileSync(file, nextBytes); }
for (const name of ['layouts', 'scenarios']) {
  const body = { schema: `studio-${name}/1`, [name]: [] };
  assert.equal((await call(name, 'POST', body, { 'x-studio-expected-revision': 'empty' })).status, 200);
  const stored = readFileSync(join(root, `${name}.json`), 'utf8');
  assert.equal((await call(name, 'POST', body, { 'x-studio-expected-revision': 'empty' })).status, 409);
  assert.equal(readFileSync(join(root, `${name}.json`), 'utf8'), stored);
}
assert.deepEqual(readdirSync(root).filter(n => n.endsWith('.tmp')), []);
console.log(JSON.stringify({ schema: 'studio-next-saved-transport-check/1', base, root, statuses, ok: true }, null, 2));
