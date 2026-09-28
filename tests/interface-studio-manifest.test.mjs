import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../metamodern-interface-studio/scripts/validate-manifest.mjs';

const script = fileURLToPath(new URL('../metamodern-interface-studio/scripts/validate-manifest.mjs', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
function studio(t) {
  const dir = mkdtempSync(join(tmpdir(), 'interface-studio-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const save = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
  const record = (id, kind, data = {}) => ({
    id, kind, label: id, lifecycle: 'active', owner: 'generated', sources: [], dependencies: [],
    statuses: { design: { value: 'unknown', evidenceId: null }, delivery: { value: 'unknown', evidenceId: null }, evidence: { value: 'unverified', evidenceId: null } }, data,
  });
  writeFileSync(join(dir, 'source.js'), 'export const Screen = {};');
  save('fixture.json', { tasks: [] });
  const fixtureDigest = hash(readFileSync(join(dir, 'fixture.json')));
  const sourceDigest = hash(readFileSync(join(dir, 'source.js')));
  const manifest = {
    schemaVersion: 1, studioId: 'studio.tasks', label: 'Task Studio',
    baseline: { id: sourceDigest, sourceRevision: 'commit:abc123', dirty: false, discoveryVersion: '1', files: { 'source.js': sourceDigest } },
    overlaysFile: 'overlays.json', baselineFile: 'baseline.json', conflictsFile: 'conflicts.json', evidenceFile: 'evidence.json',
    records: [
      record('area.tasks', 'area', { description: 'Task management' }),
      record('state.empty', 'state', { description: 'No tasks' }),
      record('target.web', 'target', { platform: 'web' }),
      record('target.mobile', 'target', { platform: 'mobile' }),
      record('profile.desktop', 'profile', { targetId: 'target.web' }),
      record('surface.tasks', 'surface', { areaId: 'area.tasks', surfaceKind: 'primary', targetIds: ['target.web'], stateIds: ['state.empty'] }),
      record('fixture.empty', 'fixture', { version: 1, file: 'fixture.json', digest: fixtureDigest, provenance: { origin: 'synthetic', author: 'Studio author' }, audiences: ['internal'] }),
      record('scenario.empty', 'scenario', { fixtureId: 'fixture.empty', fixtureVersion: 1, stateId: 'state.empty', targetIds: ['target.web'], logicalTime: '2026-09-28T09:00:00Z', seed: 42, conditionIds: [], navigation: { primary: { surfaceId: 'surface.tasks', parameters: {} } }, setupCommands: [], completionSchedule: [], assertions: [] }),
    ],
  };
  manifest.records[5].sources = [{ path: 'source.js', export: 'Screen', route: '/tasks', targetId: 'target.web', digest: sourceDigest }];
  const overlays = { schemaVersion: 1, overrides: { 'surface.tasks': { label: { value: 'Tasks', baseValue: 'surface.tasks' } } }, records: [
    { id: 'collection.review', kind: 'collection', label: 'Review', owner: 'presenter', lifecycle: 'active', data: { scenarioIds: ['scenario.empty'] } },
    { id: 'walkthrough.first-task', kind: 'walkthrough', label: 'First task', owner: 'presenter', lifecycle: 'active', data: { steps: [{ scenarioId: 'scenario.empty', targetId: 'target.web', profileId: 'profile.desktop', narration: 'Start here.' }] } },
  ] };
  const evidence = { schemaVersion: 1, records: [] };
  const conflicts = { schemaVersion: 1, records: [] };
  const commit = () => { save('manifest.json', manifest); save('overlays.json', overlays); save('baseline.json', { schemaVersion: 1, records: [], inventory: {} }); save('conflicts.json', conflicts); save('evidence.json', evidence); };
  commit();
  return { dir, manifest, overlays, evidence, conflicts, save, commit, path: join(dir, 'manifest.json'), record };
}
const codes = result => result.diagnostics.map(diagnostic => diagnostic.code);

test('valid local v1 manifest validates without writing and CLI reports bounded coverage', t => {
  const s = studio(t);
  const before = readFileSync(s.path);
  const result = validateManifest(s.path);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(readFileSync(s.path), before);
  const cli = spawnSync(process.execPath, [script, s.path], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(JSON.parse(cli.stdout).limitations.join(' '), /Does not verify runtime/);
});

test('typed missing, wrong-kind and removed references remain distinct failures', t => {
  const s = studio(t);
  s.manifest.records[5].data.areaId = 'target.web';
  s.overlays.records[0].data.scenarioIds.push('scenario.missing');
  Object.assign(s.manifest.records[1], { lifecycle: 'removed', removedAtBaseline: 'baseline.previous', reason: 'Removed source state' });
  s.commit();
  const found = codes(validateManifest(s.path));
  for (const expected of ['reference', 'reference-kind', 'tombstone']) assert.ok(found.includes(expected), expected);
});

test('duplicate IDs, source mappings, record ownership and required envelopes are checked', t => {
  const s = studio(t);
  s.manifest.records.push(s.record('surface.tasks', 'surface'));
  delete s.manifest.records[0].statuses;
  s.manifest.records[0].owner = 'presenter';
  delete s.manifest.records[5].sources[0].export;
  delete s.manifest.baseline.dirty;
  s.commit();
  const found = codes(validateManifest(s.path));
  for (const expected of ['duplicate', 'shape', 'owner']) assert.ok(found.includes(expected), expected);
});

test('fixture byte changes, scenario version drift, missing provenance and audiences fail', t => {
  const s = studio(t);
  s.manifest.records[6].data.version = 2;
  s.manifest.records[6].data.provenance = { origin: 'copied' };
  s.manifest.records[6].data.audiences = [];
  s.commit();
  s.save('fixture.json', { tasks: ['Changed payload'] });
  const found = codes(validateManifest(s.path));
  for (const expected of ['digest', 'fixture-version', 'provenance', 'audience']) assert.ok(found.includes(expected), expected);
});

test('contained file checks reject absolute, traversal and symlink escape paths', t => {
  const s = studio(t);
  const outside = mkdtempSync(join(tmpdir(), 'studio-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const secret = join(outside, 'outside.json');
  writeFileSync(secret, '{}');
  symlinkSync(secret, join(s.dir, 'escape.json'));
  for (const invalidPath of [secret, '../outside.json', 'escape.json', 'C:\\outside.json']) {
    s.manifest.records[6].data.file = invalidPath;
    s.commit();
    assert.ok(codes(validateManifest(s.path)).includes('path'), invalidPath);
  }
});

test('presenter overrides and walkthrough references retain unresolved diagnostics', t => {
  const s = studio(t);
  s.overlays.overrides['surface.removed'] = { label: { value: 'Old surface', baseValue: 'Old label' } };
  s.overlays.overrides['surface.tasks'].id = { value: 'surface.renamed', baseValue: 'surface.tasks' };
  s.overlays.records[1].data.steps[0].profileId = 'profile.missing';
  s.overlays.records[1].data.steps.push({ scenarioId: 'scenario.missing' });
  s.conflicts.records.push({ recordId: 'surface.tasks', status: 'unresolved' });
  s.commit();
  const found = codes(validateManifest(s.path));
  for (const expected of ['reference', 'override', 'conflict']) assert.ok(found.includes(expected), expected);
});

test('target/profile mismatches and unsupported schemas fail honestly', t => {
  const s = studio(t);
  s.overlays.records[1].data.steps[0].targetId = 'target.mobile';
  s.commit();
  assert.ok(codes(validateManifest(s.path)).includes('target-profile'));
  s.manifest.schemaVersion = 2;
  s.commit();
  assert.deepEqual(codes(validateManifest(s.path)), ['schema']);
  assert.equal(spawnSync(process.execPath, [script, s.path]).status, 1);
  assert.equal(spawnSync(process.execPath, [script]).status, 2);
});

test('status claims require passing evidence; status axes remain independent', t => {
  const s = studio(t);
  s.manifest.records[5].statuses.delivery = { value: 'implemented', evidenceId: 'evidence.source' };
  s.commit();
  assert.ok(codes(validateManifest(s.path)).includes('evidence'));
  s.evidence.records.push({ id: 'evidence.source', outcome: 'failed', targetId: 'target.web', profileId: 'profile.desktop', scenarioId: 'scenario.empty' });
  s.commit();
  assert.ok(codes(validateManifest(s.path)).includes('evidence'));
  s.evidence.records[0].outcome = 'passed';
  s.commit();
  const result = validateManifest(s.path);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.equal(s.manifest.records[5].statuses.design.value, 'unknown');
});

test('malformed sidecar JSON and absent local files fail without exceptions', t => {
  const s = studio(t);
  writeFileSync(join(s.dir, 'overlays.json'), '{');
  rmSync(join(s.dir, 'fixture.json'));
  const found = codes(validateManifest(s.path));
  assert.ok(found.includes('json'));
  assert.ok(found.includes('file'));
});

test('unreferenced tombstones keep historic paths and dependencies without becoming runnable', t => {
  const s = studio(t);
  const removed = s.record('surface.old', 'surface', { areaId: 'area.deleted' });
  Object.assign(removed, { lifecycle: 'removed', removedAtBaseline: 'baseline.old', reason: 'Source removed', dependencies: ['state.old'], sources: [{ path: 'deleted.js', export: 'OldScreen', route: '/old', targetId: 'target.old', digest: '0'.repeat(64) }] });
  s.manifest.records.push(removed);
  s.manifest.baseline.files['deleted.js'] = null;
  s.evidence.records.push({ id: 'evidence.old', outcome: 'passed', surfaceId: 'surface.old', scenarioId: 'scenario.old' });
  s.commit();
  assert.equal(validateManifest(s.path).valid, true);
  s.manifest.records[7].data.navigation.primary.surfaceId = 'surface.old';
  s.commit();
  assert.ok(codes(validateManifest(s.path)).includes('tombstone'));
  writeFileSync(join(s.dir, 'deleted.js'), 'returned source');
  assert.ok(codes(validateManifest(s.path)).includes('baseline-drift'));
});

test('aggregate and reference-changing overrides cannot bypass the presentation-only allowlist', t => {
  const s = studio(t);
  s.overlays.overrides['surface.tasks'].data = { value: { capabilities: { behavior: true } }, baseValue: {} };
  s.overlays.overrides['surface.tasks']['data.scenarioId'] = { value: 'scenario.missing', baseValue: 'scenario.empty' };
  s.overlays.overrides['surface.tasks']['data.reviewContext'] = { value: { scenarioId: 'scenario.missing' }, baseValue: {} };
  s.commit();
  const found = codes(validateManifest(s.path));
  assert.equal(found.filter(code => code === 'override').length, 2);
  assert.ok(found.includes('reference'));
});

test('saved baseline needs a supported structured envelope', t => {
  const s = studio(t);
  for (const malformed of [null, {}, { schemaVersion: 2, records: [], inventory: {} }, { schemaVersion: 1, records: null, inventory: null }]) {
    s.save('baseline.json', malformed);
    assert.equal(validateManifest(s.path).valid, false);
  }
});
