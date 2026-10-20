// Kit contract (contract 3): validators for kit.json (canvas-kit/1), tokens.json (canvas-tokens/1),
// the kit global's shape and a kit folder, plus the writer that puts kit.json last.
// Node built-ins only. The global check is a pure function, so a browser test can run it on window.<namespace>.
import fs from 'node:fs/promises';
import path from 'node:path';

export const KIT_FILES = ['components/bundle.js', 'components/bundle.css', 'components/index.d.ts', 'tokens.json'];
const TOKEN_GROUPS = ['type', 'space', 'radius', 'shadow', 'motion', 'density'];
const THEMES = ['light', 'dark', 'light-contrast', 'dark-contrast'];
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Issues with a kit.json object; empty when valid. */
export function validateKitManifest(kit) {
  if (!isObject(kit)) return ['kit.json: must be an object'];
  const issues = [];
  if (kit.schema !== 'canvas-kit/1') issues.push('kit.json: schema must be canvas-kit/1');
  if (typeof kit.namespace !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(kit.namespace)) issues.push('kit.json: namespace must be a JavaScript identifier');
  if (typeof kit.version !== 'string' || !kit.version.trim()) issues.push('kit.json: version must be a non-empty string (semver or date)');
  const source = kit.source;
  if (!isObject(source)) issues.push('kit.json: source must be {repo, commit, dirty, branch?}');
  else {
    if (typeof source.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(source.repo)) issues.push('kit.json: source.repo must be owner/name');
    if (typeof source.commit !== 'string' || !/^[0-9a-f]{40}$/.test(source.commit)) issues.push('kit.json: source.commit must be 40 lowercase hex characters');
    if (typeof source.dirty !== 'boolean') issues.push('kit.json: source.dirty must be a boolean');
    if (source.branch != null && (typeof source.branch !== 'string' || !source.branch)) issues.push('kit.json: source.branch must be a non-empty string');
    if (source.dirty === true && !source.branch) issues.push('kit.json: a live build (dirty) names its branch');
  }
  if (!Array.isArray(kit.inputs) || !kit.inputs.length || kit.inputs.some((p) => typeof p !== 'string' || !p || p.startsWith('/'))) {
    issues.push('kit.json: inputs must list repository paths or globs');
  }
  if (typeof kit.builtAt !== 'string' || Number.isNaN(Date.parse(kit.builtAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(kit.builtAt)) issues.push('kit.json: builtAt must be an ISO date-time');
  if (typeof kit.react !== 'string' || !/^19\./.test(kit.react)) issues.push('kit.json: react must be a 19.x version');
  return issues;
}

function tokenIssues(entry, label, key) {
  const issues = [];
  if (!isObject(entry)) return [`${label}: must be {name, value, usage?, source?}`];
  if (key != null && entry.name != null && entry.name !== key) issues.push(`${label}: name ${entry.name} differs from its key`);
  if (key == null && (typeof entry.name !== 'string' || !entry.name)) issues.push(`${label}: name must be a non-empty string`);
  if (typeof entry.value !== 'string' && typeof entry.value !== 'number') issues.push(`${label}: value must be a string or number`);
  else if (typeof entry.value === 'string' && /\b(?:var|color-mix)\(/.test(entry.value)) issues.push(`${label}: value must be resolved, not ${entry.value}`);
  if (entry.usage != null && typeof entry.usage !== 'string') issues.push(`${label}: usage must be a string`);
  if (entry.source != null && (typeof entry.source !== 'string' || entry.source.startsWith('/'))) issues.push(`${label}: source must be a repository path`);
  return issues;
}

/**
 * Issues with a tokens.json object; empty when valid. Each theme maps a token name to {value, usage?, source?}
 * (a `name`, when present, equals the key); every other group is an array of {name, value, usage?, source?}.
 */
export function validateTokens(tokens) {
  if (!isObject(tokens)) return ['tokens.json: must be an object'];
  const issues = [];
  if (tokens.schema !== 'canvas-tokens/1') issues.push('tokens.json: schema must be canvas-tokens/1');
  if (!isObject(tokens.themes)) issues.push('tokens.json: themes must be an object');
  else {
    for (const required of ['light', 'dark']) if (!isObject(tokens.themes[required])) issues.push(`tokens.json: themes.${required} is required`);
    for (const [theme, entries] of Object.entries(tokens.themes)) {
      if (!THEMES.includes(theme)) { issues.push(`tokens.json: unknown theme ${theme}`); continue; }
      if (!isObject(entries)) { issues.push(`tokens.json: themes.${theme} must map token names to entries`); continue; }
      for (const [name, entry] of Object.entries(entries)) issues.push(...tokenIssues(entry, `tokens.json: themes.${theme}.${name}`, name));
    }
  }
  for (const group of TOKEN_GROUPS) {
    if (!Array.isArray(tokens[group])) { issues.push(`tokens.json: ${group} must be an array`); continue; }
    tokens[group].forEach((entry, i) => issues.push(...tokenIssues(entry, `tokens.json: ${group}[${i}]`, null)));
  }
  return issues;
}

const isComponent = (v) => typeof v === 'function' || (isObject(v) && typeof v.$$typeof === 'symbol');

/** Issues with a kit global (window.<namespace>); empty when it has the contract's shape. */
export function validateKitGlobal(kit, namespace = 'kit') {
  const at = `window.${namespace}`;
  if (!kit || (typeof kit !== 'object' && typeof kit !== 'function')) return [`${at}: is not defined`];
  const issues = [];
  if (typeof kit.version !== 'string' || !kit.version) issues.push(`${at}.version must be a non-empty string`);
  if (typeof kit.mount !== 'function') issues.push(`${at}.mount must be a function (el, name, props) returning an unmount function`);
  if (!isComponent(kit.Root)) issues.push(`${at}.Root must be a component`);
  if (!isComponent(kit.Scene)) issues.push(`${at}.Scene must be a component`);
  if (!('sample' in kit)) issues.push(`${at}.sample must be defined`);
  if (!Array.isArray(kit.scenes)) issues.push(`${at}.scenes must be an array`);
  else {
    const ids = new Set();
    kit.scenes.forEach((scene, i) => {
      const label = `${at}.scenes[${i}]`;
      if (!isObject(scene)) { issues.push(`${label}: must be an object`); return; }
      if (typeof scene.id !== 'string' || !scene.id) issues.push(`${label}.id must be a non-empty string`);
      else if (ids.has(scene.id)) issues.push(`${label}.id ${scene.id} is a duplicate`);
      ids.add(scene.id);
      for (const key of ['title', 'area']) if (typeof scene[key] !== 'string' || !scene[key]) issues.push(`${label}.${key} must be a non-empty string`);
      if (!Array.isArray(scene.states) || !scene.states.length || scene.states.some((s) => !isObject(s) || typeof s.id !== 'string' || typeof s.label !== 'string')) {
        issues.push(`${label}.states must be a non-empty array of {id, label}`);
      }
      if (!Array.isArray(scene.viewports) || !scene.viewports.length || scene.viewports.some((v) => v !== 'desktop' && v !== 'phone')) {
        issues.push(`${label}.viewports must list desktop and/or phone`);
      }
    });
  }
  return issues;
}

/** Component names a kit global offers for mounting: its own component members, by name. */
export function kitComponentNames(kit) {
  const skip = new Set(['version', 'mount', 'scenes', 'sample']);
  return Object.keys(kit ?? {}).filter((name) => !skip.has(name) && /^[A-Z]/.test(name) && isComponent(kit[name]));
}

async function readJson(file, issues, label) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { issues.push(`${label}: ${error.code === 'ENOENT' ? 'missing' : 'not valid JSON'}`); return null; }
}

/**
 * Issues with a kit folder: the required files, kit.json and tokens.json, and the rule that kit.json is
 * written last (no file in the folder is newer than kit.json). A folder without kit.json is a legacy kit and
 * is reported as such, never as a contract kit.
 */
export async function validateKitFolder(dir) {
  const issues = [];
  let kitStat;
  try { kitStat = await fs.stat(path.join(dir, 'kit.json')); }
  catch { return ['kit.json: missing (a folder without kit.json is a legacy kit)']; }
  const kit = await readJson(path.join(dir, 'kit.json'), issues, 'kit.json');
  if (kit) issues.push(...validateKitManifest(kit));
  for (const file of KIT_FILES) {
    try { await fs.stat(path.join(dir, file)); } catch { issues.push(`${file}: missing`); }
  }
  const tokens = await readJson(path.join(dir, 'tokens.json'), [], 'tokens.json');
  if (tokens) issues.push(...validateTokens(tokens));
  for (const file of await listFiles(dir)) {
    if (file === 'kit.json') continue;
    const stat = await fs.stat(path.join(dir, file));
    if (stat.mtimeMs > kitStat.mtimeMs) issues.push(`${file}: written after kit.json (kit.json must be written last)`);
  }
  return issues;
}

async function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, relative)));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

/**
 * Writes kit.json last and atomically (a temporary file renamed into place), after checking it, so a watcher never
 * reads a half-made kit. Call it after every other file of the kit is in place.
 */
export async function writeKitManifest(dir, kit) {
  const issues = validateKitManifest(kit);
  if (issues.length) throw new Error(issues.join('\n'));
  const temp = path.join(dir, `.kit.json.${process.pid}.${Date.now()}`);
  await fs.writeFile(temp, `${JSON.stringify(kit, null, 2)}\n`);
  await fs.rename(temp, path.join(dir, 'kit.json'));
}
