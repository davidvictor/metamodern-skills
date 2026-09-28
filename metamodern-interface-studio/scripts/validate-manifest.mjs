#!/usr/bin/env node
/** Read-only structural and local-file integrity checks. No runtime or approval inference. */
import { readFileSync, realpathSync, statSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const coverage = [
  'v1 envelopes, unique IDs, typed references and tombstones',
  'contained local paths (including symlinks), baseline and fixture SHA-256 bytes',
  'fixture versions/provenance/audiences, target/profile references, presenter and claimed evidence references',
];
export const limitations = [
  'Does not verify runtime exports/routes, capabilities, determinism, visual fidelity, approval or audience authorization.',
  'Does not reconcile updates, establish evidence freshness, or validate project-specific extensions.',
];
const kinds = new Set('area state command flow anchor surface token target profile variant theme revision condition fixture scenario'.split(' '));
const presenterKinds = new Set(['collection', 'walkthrough', 'comparison', 'decision']);
const neutral = { design: 'unknown', delivery: 'unknown', evidence: 'unverified' };
const statuses = {
  design: ['unknown', 'exploration', 'selected', 'approved'],
  delivery: ['unknown', 'concept', 'prototype', 'implemented', 'deployed'],
  evidence: ['unverified', 'source-checked', 'runtime-checked', 'user-accepted'],
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;
const hashPattern = /^(?:sha256:)?[a-f0-9]{64}$/;
const relativePath = path => text(path) && !isAbsolute(path) && !/^[A-Za-z]:|\\/.test(path) && !path.split('/').includes('..');

/** Validate a JSON manifest and its referenced local files without writing anything. */
export function validateManifest(manifestPath) {
  const root = dirname(resolve(manifestPath));
  const diagnostics = [];
  const issue = (code, at, message) => diagnostics.push({ code, at, message });
  const requireText = (value, at) => { if (!text(value)) issue('required', at, 'Expected nonempty text.'); };
  const requireArray = (value, at) => { if (!Array.isArray(value)) issue('shape', at, 'Expected an array.'); return Array.isArray(value) ? value : []; };
  let realRoot;
  try { realRoot = realpathSync(root); } catch { issue('file', 'root', 'Workspace root is unavailable.'); }
  const contained = path => { const rel = relative(realRoot, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
  function file(path, at, digest, expectedAbsent = false) {
    if (!realRoot) return;
    if (!relativePath(path)) {
      issue('path', at, 'Expected a relative contained path without parent traversal.'); return;
    }
    const absolute = resolve(realRoot, path);
    if (!contained(absolute)) { issue('path', at, 'Path escapes workspace root.'); return; }
    if (expectedAbsent) {
      try { lstatSync(absolute); issue('baseline-drift', at, 'Baseline expects this file to be absent.'); }
      catch (error) { if (error.code !== 'ENOENT') issue('file', at, `Cannot verify missing file (${error.code}).`); }
      return;
    }
    try {
      const actual = realpathSync(absolute);
      if (!contained(actual)) { issue('path', at, 'Symlink escapes workspace root.'); return; }
      if (!statSync(actual).isFile()) { issue('file', at, 'Expected a regular file.'); return; }
      const bytes = readFileSync(actual);
      if (digest !== undefined) {
        if (typeof digest !== 'string' || !hashPattern.test(digest)) issue('digest', at, 'Expected a SHA-256 content digest.');
        else if (createHash('sha256').update(bytes).digest('hex') !== digest.replace(/^sha256:/, '')) issue('digest', at, 'File bytes do not match the declared digest.');
      }
      return bytes;
    } catch (error) { issue('file', at, `Cannot read referenced file (${error.code ?? 'unknown error'}).`); }
  }
  function json(path, at) {
    const bytes = file(path, at);
    if (!bytes) return;
    try { return JSON.parse(bytes.toString()); } catch { issue('json', at, 'Expected valid JSON.'); }
  }
  function version(value, at) {
    if (!object(value) || value.schemaVersion !== 1) { issue('schema', at, 'Only schemaVersion 1 is supported; no migration or writes performed.'); return false; }
    return true;
  }
  const result = () => ({ valid: diagnostics.length === 0, diagnostics, coverage, limitations });
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { issue('json', 'manifest', 'Cannot read manifest JSON.'); return result(); }
  if (!version(manifest, 'manifest')) return result();
  requireText(manifest.studioId, 'studioId');
  if (text(manifest.studioId) && !idPattern.test(manifest.studioId)) issue('id', 'studioId', 'Expected a semantic lowercase ID.');
  requireText(manifest.label, 'label');
  const baseline = manifest.baseline;
  if (!object(baseline)) issue('shape', 'baseline', 'Expected baseline object.');
  else {
    for (const key of ['id', 'sourceRevision', 'discoveryVersion']) requireText(baseline[key], `baseline.${key}`);
    if (typeof baseline.id !== 'string' || !hashPattern.test(baseline.id)) issue('digest', 'baseline.id', 'Expected SHA-256 baseline content digest.');
    if (typeof baseline.dirty !== 'boolean') issue('shape', 'baseline.dirty', 'Expected boolean.');
    if (!object(baseline.files)) issue('shape', 'baseline.files', 'Expected relative-path to SHA-256 map.');
    else for (const [path, digest] of Object.entries(baseline.files)) file(path, `baseline.files.${path}`, digest, digest === null);
  }
  const records = requireArray(manifest.records, 'records');
  const overlays = json(manifest.overlaysFile, 'overlaysFile');
  const accepted = json(manifest.baselineFile, 'baselineFile');
  if (accepted !== undefined && version(accepted, 'baselineFile')) {
    requireArray(accepted.records, 'baseline.records');
    if (!object(accepted.inventory)) issue('shape', 'baseline.inventory', 'Expected saved source inventory object.');
  }
  const conflicts = json(manifest.conflictsFile, 'conflictsFile');
  if (conflicts !== undefined && version(conflicts, 'conflictsFile')) {
    requireArray(conflicts.records, 'conflicts.records').forEach((conflict, i) => {
      if (!object(conflict) || !['resolved', 'unresolved'].includes(conflict.status)) issue('shape', `conflicts.records[${i}]`, 'Expected conflict with explicit status.');
      else if (conflict.status === 'unresolved') issue('conflict', `conflicts.records[${i}]`, 'Unresolved conflict.');
    });
  }
  const evidence = json(manifest.evidenceFile, 'evidenceFile');
  const evidenceById = new Map();
  if (evidence !== undefined && version(evidence, 'evidenceFile')) {
    requireArray(evidence.records, 'evidence.records').forEach((entry, i) => {
      const at = `evidence.records[${i}]`;
      if (!object(entry) || !text(entry.id)) { issue('shape', at, 'Expected evidence record with ID.'); return; }
      if (evidenceById.has(entry.id)) issue('duplicate', `${at}.id`, 'Duplicate evidence ID.');
      evidenceById.set(entry.id, entry);
      if (!['passed', 'failed', 'unavailable', 'stale'].includes(entry.outcome)) issue('shape', `${at}.outcome`, 'Invalid evidence outcome.');
      if (entry.capturePath !== undefined) file(entry.capturePath, `${at}.capturePath`, entry.captureHash ?? null);
    });
  }
  const all = new Map();
  function envelope(record, at, owner, allowedKinds) {
    if (!object(record)) { issue('shape', at, 'Expected record object.'); return; }
    if (!text(record.id) || !idPattern.test(record.id)) issue('id', `${at}.id`, 'Expected a semantic lowercase ID.');
    if (all.has(record.id)) issue('duplicate', `${at}.id`, 'Duplicate catalog or presenter ID.');
    else if (text(record.id)) all.set(record.id, record);
    if (!allowedKinds.has(record.kind)) issue('kind', `${at}.kind`, 'Unsupported record kind.');
    if (record.owner !== owner) issue('owner', `${at}.owner`, `Expected ${owner} ownership.`);
    requireText(record.label, `${at}.label`);
    if (!['active', 'removed'].includes(record.lifecycle)) issue('lifecycle', `${at}.lifecycle`, 'Expected active or removed.');
    if (!object(record.data)) issue('shape', `${at}.data`, 'Expected data object.');
    if (record.lifecycle === 'removed') {
      requireText(record.removedAtBaseline, `${at}.removedAtBaseline`);
      requireText(record.reason, `${at}.reason`);
    }
  }
  records.forEach((record, i) => envelope(record, `records[${i}]`, 'generated', kinds));
  let presenterRecords = [];
  if (overlays !== undefined && version(overlays, 'overlaysFile')) {
    presenterRecords = requireArray(overlays.records, 'overlays.records');
    presenterRecords.forEach((record, i) => envelope(record, `overlays.records[${i}]`, 'presenter', presenterKinds));
  }
  function reference(id, kind, at) {
    if (!text(id)) { issue('reference', at, 'Expected stable record ID.'); return; }
    const record = all.get(id);
    if (!record) issue('reference', at, `Missing record: ${id}.`);
    else if (record.lifecycle === 'removed') issue('tombstone', at, `Unresolved reference to removed record: ${id}.`);
    else if (kind && record.kind !== kind) issue('reference-kind', at, `Expected ${kind}, found ${record.kind}.`);
    return record;
  }
  function evidenceRef(id, at, requirePassed = false) {
    const entry = evidenceById.get(id);
    if (!text(id) || !entry) issue('evidence', at, 'Missing evidence reference.');
    else if (requirePassed && entry.outcome !== 'passed') issue('evidence', at, 'Claim cites evidence that has not passed.');
    else if (requirePassed) refs(entry, at);
  }
  // Only explicit typed keys are references; arbitrary prose and extension fields are never inferred.
  function refs(value, at) {
    if (Array.isArray(value)) { value.forEach((entry, i) => refs(entry, `${at}[${i}]`)); return; }
    if (!object(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'extensions') continue;
      if (key === 'evidenceId') evidenceRef(item, `${at}.${key}`);
      else if (key === 'evidenceIds') requireArray(item, `${at}.${key}`).forEach((id, i) => evidenceRef(id, `${at}.${key}[${i}]`));
      else {
        const match = /^(area|state|command|flow|anchor|surface|token|target|profile|variant|theme|revision|condition|fixture|scenario|collection|walkthrough|comparison|decision|record)(Id|Ids)$/.exec(key);
        if (match) {
          const expected = match[1] === 'record' ? null : match[1];
          if (match[2] === 'Ids') requireArray(item, `${at}.${key}`).forEach((id, i) => reference(id, expected, `${at}.${key}[${i}]`));
          else if (item !== null) reference(item, expected, `${at}.${key}`);
        } else refs(item, `${at}.${key}`);
      }
    }
    if (value.targetId && value.profileId) {
      const profile = all.get(value.profileId);
      if (profile?.data?.targetId !== value.targetId) issue('target-profile', at, 'Profile does not belong to selected target.');
    }
  }
  for (const [i, record] of records.entries()) {
    if (!object(record)) continue;
    const at = `records[${i}]`;
    const historical = record.lifecycle === 'removed';
    requireArray(record.dependencies, `${at}.dependencies`).forEach((id, j) => {
      if (historical) requireText(id, `${at}.dependencies[${j}]`);
      else reference(id, null, `${at}.dependencies[${j}]`);
    });
    requireArray(record.sources, `${at}.sources`).forEach((source, j) => {
      const loc = `${at}.sources[${j}]`;
      if (!object(source)) { issue('shape', loc, 'Expected source mapping object.'); return; }
      for (const key of ['path', 'export', 'route', 'targetId', 'digest']) {
        if (!(key in source) || (source[key] !== null && !text(source[key]))) issue('shape', `${loc}.${key}`, 'Expected text or explicit null.');
      }
      if (historical && source.path !== null && !relativePath(source.path)) issue('path', `${loc}.path`, 'Historical source path must still be relative and contained.');
      if (source.digest !== null && (typeof source.digest !== 'string' || !hashPattern.test(source.digest))) issue('digest', `${loc}.digest`, 'Expected SHA-256 or explicit null.');
      if (!historical && source.path !== null) file(source.path, `${loc}.path`, source.digest ?? null);
      if (!historical && source.targetId !== null) reference(source.targetId, 'target', `${loc}.targetId`);
    });
    if (!object(record.statuses)) issue('shape', `${at}.statuses`, 'Expected independent status axes.');
    else for (const [axis, choices] of Object.entries(statuses)) {
      const status = record.statuses[axis];
      const value = status?.value;
      if (!object(status) || !('evidenceId' in status) || (status.evidenceId !== null && !text(status.evidenceId))) issue('status', `${at}.statuses.${axis}`, 'Expected {value,evidenceId:null|string}.');
      if (!choices.includes(value)) issue('status', `${at}.statuses.${axis}`, 'Invalid status value.');
      else if (value !== neutral[axis]) evidenceRef(status?.evidenceId, `${at}.statuses.${axis}`, !historical);
      else if (status.evidenceId !== null) evidenceRef(status.evidenceId, `${at}.statuses.${axis}`);
    }
    const data = record.data;
    if (!object(data) || historical) continue;
    refs(data, `${at}.data`);
    if (data.sourceDependencies !== undefined) {
      if (!object(data.sourceDependencies)) issue('shape', `${at}.data.sourceDependencies`, 'Expected path to digest map.');
      else for (const [path, digest] of Object.entries(data.sourceDependencies)) file(path, `${at}.data.sourceDependencies.${path}`, digest);
    }
    if (record.kind === 'fixture') {
      if (!(Number.isInteger(data.version) && data.version > 0) && !text(data.version)) issue('fixture-version', `${at}.data.version`, 'Expected explicit positive integer or nonempty version string.');
      file(data.file, `${at}.data.file`, data.digest ?? null);
      if (!object(data.provenance) || !['synthetic', 'licensed', 'approved'].includes(data.provenance.origin) || (!text(data.provenance.author) && !text(data.provenance.rightsReference))) issue('provenance', `${at}.data.provenance`, 'Expected origin and author or rightsReference.');
      if (!Array.isArray(data.audiences) || !data.audiences.length || !data.audiences.every(text)) issue('audience', `${at}.data.audiences`, 'Expected explicit nonempty permitted audience IDs.');
    }
    if (record.kind === 'profile') reference(data.targetId, 'target', `${at}.data.targetId`);
    if (record.kind === 'surface') {
      reference(data.areaId, 'area', `${at}.data.areaId`);
      requireText(data.surfaceKind, `${at}.data.surfaceKind`);
      for (const key of ['targetIds', 'stateIds']) requireArray(data[key], `${at}.data.${key}`);
    }
    if (record.kind === 'scenario') {
      const fixture = reference(data.fixtureId, 'fixture', `${at}.data.fixtureId`);
      if (data.fixtureVersion === undefined || fixture?.data?.version !== data.fixtureVersion) issue('fixture-version', `${at}.data.fixtureVersion`, 'Scenario must pin the referenced fixture version exactly.');
      reference(data.stateId, 'state', `${at}.data.stateId`);
      for (const key of ['targetIds', 'conditionIds', 'setupCommands', 'completionSchedule', 'assertions']) requireArray(data[key], `${at}.data.${key}`);
      if (!text(data.logicalTime) || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.logicalTime) || !Number.isFinite(Date.parse(data.logicalTime))) issue('clock', `${at}.data.logicalTime`, 'Expected fixed ISO date-time with timezone.');
      if (!text(data.seed) && !Number.isFinite(data.seed)) issue('seed', `${at}.data.seed`, 'Expected explicit string or finite numeric seed.');
      if (!object(data.navigation?.primary)) issue('navigation', `${at}.data.navigation.primary`, 'Expected primary navigation location.');
      else reference(data.navigation.primary.surfaceId, 'surface', `${at}.data.navigation.primary.surfaceId`);
    }
  }
  presenterRecords.forEach((record, i) => {
    if (!object(record) || record.lifecycle === 'removed') return;
    refs(record.data, `overlays.records[${i}].data`);
    if (record.kind === 'walkthrough') requireArray(record.data?.steps, `overlays.records[${i}].data.steps`).forEach((step, j) => reference(step?.scenarioId, 'scenario', `overlays.records[${i}].data.steps[${j}].scenarioId`));
  });
  if (object(overlays)) {
    if (!object(overlays.overrides)) issue('shape', 'overlays.overrides', 'Expected overrides keyed by catalog ID and field path.');
    else for (const [id, fields] of Object.entries(overlays.overrides)) {
      reference(id, null, `overlays.overrides.${id}`);
      if (!object(fields)) { issue('shape', `overlays.overrides.${id}`, 'Expected field-path map.'); continue; }
      for (const [field, override] of Object.entries(fields)) {
        const at = `overlays.overrides.${id}.${field}`;
        if (!['label', 'data.description', 'data.reviewContext'].includes(field)) issue('override', at, 'Supported overrides: label, data.description, data.reviewContext.');
        else if (field === 'data.reviewContext') refs(override?.value, `${at}.value`);
        else if (!text(override?.value)) issue('override', at, 'Label and description overrides require nonempty text.');
        if (!object(override) || !('value' in override) || (!('baseValue' in override) && !text(override.baseHash))) issue('override', at, 'Expected value and baseValue or baseHash.');
      }
    }
  }
  // Evidence is historical: current live references are checked only when a claim cites it.
  // Historic target/scenario IDs may legitimately refer to removed records.
  return result();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    console.error('Usage: node validate-manifest.mjs path/to/manifest.json');
    process.exitCode = 2;
  } else {
    const result = validateManifest(path);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  }
}
