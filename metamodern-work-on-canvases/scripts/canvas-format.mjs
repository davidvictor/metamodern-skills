// Canvas format (contract 1): canvas.json v3 with the optional `ws` additions, canvas.config.json
// (canvas-config/1), live kit registration, the frozen-canvas rule and viewer links. Pure functions
// plus small readers; Node built-ins only.
import fs from 'node:fs/promises';
import path from 'node:path';

export const GROUPS = ['foundations', 'lab', 'app', 'exploring', 'decided', 'archive'];
export const ROWS = ['live', 'deciding', 'building', 'next', 'later'];
export const BOARD_SUFFIX = '.dc.html';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LIVE_NAME = /^[a-z0-9][a-z0-9-]*$/;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Whether a canvas's ws.icon is an .svg path inside its project/ folder: forward slashes only, no `.` or `..`, and not
 * under the paths a board request answers from elsewhere (`support/`, `ds/`) or a drive letter.
 */
export function isIconPath(value) {
  if (typeof value !== 'string' || !/\.svg$/i.test(value) || value.includes('\\') || path.isAbsolute(value)) return false;
  const parts = value.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..') && !['support', 'ds'].includes(parts[0]) && !/^[A-Za-z]:/.test(parts[0]);
}

/** Whether a board fact's href is one the viewer opens: http(s), or a path on the viewer (never `//` or a backslash, which browsers read as another host). */
export function isFactHref(value) {
  return typeof value === 'string' && (/^https?:\/\/[^\s\\]+$/i.test(value) || /^\/(?![/\\])[^\s\\]*$/.test(value));
}

/** Issues with a canvas.json object; empty when valid. Unknown fields are allowed (older and newer writers add their own). */
export function validateCanvas(canvas) {
  const issues = [];
  if (!isObject(canvas)) return ['canvas.json: must be an object'];
  if (canvas.v !== 3) issues.push('canvas.json: v must be 3');
  if (typeof canvas.title !== 'string' || !canvas.title.trim()) issues.push('canvas.json: title must be a non-empty string');
  if (!isObject(canvas.launch) || typeof canvas.launch.view !== 'string') issues.push('canvas.json: launch must be {view, page?}');
  else if (canvas.launch.page != null && typeof canvas.launch.page !== 'string') issues.push('canvas.json: launch.page must be a string');
  const pages = Array.isArray(canvas.pages) ? canvas.pages : null;
  if (!pages) issues.push('canvas.json: pages must be an array');
  const pageIds = new Set();
  for (const [i, page] of (pages ?? []).entries()) {
    if (!isObject(page) || typeof page.id !== 'string' || !ID.test(page.id)) { issues.push(`canvas.json: pages[${i}].id must be a link-safe id`); continue; }
    if (pageIds.has(page.id)) issues.push(`canvas.json: duplicate page ${page.id}`);
    pageIds.add(page.id);
    if (typeof page.name !== 'string') issues.push(`canvas.json: pages[${i}].name must be a string`);
  }
  if (canvas.launch?.page != null && !pageIds.has(canvas.launch.page)) issues.push(`canvas.json: launch.page ${canvas.launch.page} is not a page`);
  if (!isObject(canvas.boards)) issues.push('canvas.json: boards must be an object');
  for (const [file, board] of Object.entries(canvas.boards ?? {})) {
    const at = `canvas.json: boards["${file}"]`;
    if (!file.endsWith(BOARD_SUFFIX) || file.includes('/') || file.includes('\\') || !ID.test(file)) issues.push(`${at}: must name a <board>.dc.html file in project/`);
    if (!isObject(board)) { issues.push(`${at}: must be an object`); continue; }
    for (const key of ['x', 'y', 'w', 'h']) if (!isNumber(board[key])) issues.push(`${at}.${key} must be a number`);
    if (isNumber(board.w) && board.w <= 0) issues.push(`${at}.w must be positive`);
    if (isNumber(board.h) && board.h <= 0) issues.push(`${at}.h must be positive`);
    if (board.title != null && typeof board.title !== 'string') issues.push(`${at}.title must be a string`);
    if (board.page != null && (typeof board.page !== 'string' || (pageIds.size && !pageIds.has(board.page)))) issues.push(`${at}.page must name a page`);
    if (board.expand != null && typeof board.expand !== 'string') issues.push(`${at}.expand must be a string`);
    if (board.is_interactive != null && typeof board.is_interactive !== 'boolean') issues.push(`${at}.is_interactive must be a boolean`);
    if (board.ws != null) issues.push(...validateBoardWs(board.ws).map((m) => `${at}.ws${m}`));
  }
  if (canvas.order != null) {
    if (!Array.isArray(canvas.order)) issues.push('canvas.json: order must be an array');
    else for (const file of canvas.order) if (!isObject(canvas.boards) || !Object.hasOwn(canvas.boards, file)) issues.push(`canvas.json: order names ${file}, which is not a board`);
  }
  if (canvas.ws != null) {
    if (!isObject(canvas.ws)) issues.push('canvas.json: ws must be an object');
    else {
      if (!GROUPS.includes(canvas.ws.group)) issues.push(`canvas.json: ws.group must be one of ${GROUPS.join(', ')}`);
      if (canvas.ws.frozen != null && typeof canvas.ws.frozen !== 'boolean') issues.push('canvas.json: ws.frozen must be a boolean');
      if (canvas.ws.about != null && (typeof canvas.ws.about !== 'string' || !canvas.ws.about.trim())) issues.push('canvas.json: ws.about must be a non-empty string');
      if (canvas.ws.icon != null && !isIconPath(canvas.ws.icon)) issues.push('canvas.json: ws.icon must be the path of an .svg file inside project/');
    }
  }
  return issues;
}

function validateBoardWs(ws) {
  if (!isObject(ws)) return [' must be an object'];
  const issues = [];
  if (ws.set != null && (typeof ws.set !== 'string' || !ws.set)) issues.push('.set must be a non-empty string');
  if (ws.row != null && !ROWS.includes(ws.row)) issues.push(`.row must be one of ${ROWS.join(', ')}`);
  if (ws.kit != null && !(ws.kit === 'pinned' || (typeof ws.kit === 'string' && /^live:/.test(ws.kit) && LIVE_NAME.test(ws.kit.slice(5))))) issues.push('.kit must be "pinned" or "live:<name>"');
  if (ws.facts != null) {
    if (!Array.isArray(ws.facts)) issues.push('.facts must be an array');
    else for (const [i, fact] of ws.facts.entries()) {
      if (!isObject(fact) || typeof fact.label !== 'string' || !fact.label.trim() || typeof fact.text !== 'string') issues.push(`.facts[${i}] must be {label, text, href?}`);
      else if (fact.href != null && !isFactHref(fact.href)) issues.push(`.facts[${i}].href must be an http(s) link or a path on the viewer`);
    }
  }
  return issues;
}

/** A canvas is frozen when ws.frozen is true or its title starts with "History:" or "Decided:". */
export function isFrozen(canvas) {
  return canvas?.ws?.frozen === true || /^(History|Decided):/.test(canvas?.title ?? '');
}

/** The kit a board uses: an explicit override, else its ws.kit, else "pinned". */
export function boardKit(canvas, file, override) {
  const choice = override ?? canvas?.boards?.[file]?.ws?.kit ?? 'pinned';
  return choice === 'pinned' || /^live:[a-z0-9][a-z0-9-]*$/.test(choice) ? choice : 'pinned';
}

/** Issues with a canvas.config.json object (canvas-config/1); empty when valid. */
export function validateConfig(config) {
  if (!isObject(config)) return ['canvas.config.json: must be an object'];
  const issues = [];
  const relative = (value, label) => {
    if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) issues.push(`canvas.config.json: ${label} must be a relative path inside the project`);
  };
  if (config.schema !== 'canvas-config/1') issues.push('canvas.config.json: schema must be canvas-config/1');
  if (typeof config.name !== 'string' || !config.name.trim()) issues.push('canvas.config.json: name must be a non-empty string');
  relative(config.canvases, 'canvases');
  if (!isObject(config.kit)) issues.push('canvas.config.json: kit must be {namespace, pinned}');
  else {
    if (typeof config.kit.namespace !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(config.kit.namespace)) issues.push('canvas.config.json: kit.namespace must be a JavaScript identifier');
    relative(config.kit.pinned, 'kit.pinned');
  }
  relative(config.skin, 'skin');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) issues.push('canvas.config.json: port must be an integer from 1 to 65535');
  if (!Array.isArray(config.groups) || !config.groups.length) issues.push('canvas.config.json: groups must be a non-empty array');
  else for (const group of config.groups) if (!GROUPS.includes(group)) issues.push(`canvas.config.json: unknown group ${group}`);
  if (config.groupNames != null) {
    if (!isObject(config.groupNames)) issues.push('canvas.config.json: groupNames must be an object');
    else for (const [group, name] of Object.entries(config.groupNames)) {
      if (!GROUPS.includes(group)) issues.push(`canvas.config.json: groupNames names unknown group ${group}`);
      else if (typeof name !== 'string' || !name.trim()) issues.push(`canvas.config.json: groupNames.${group} must be a non-empty string`);
    }
  }
  return issues;
}

/** Issues with a .canvas/live.json object: {"<name>": "<absolute path to a kit folder>"}. */
export function validateLiveKits(live) {
  if (!isObject(live)) return ['.canvas/live.json: must be an object'];
  const issues = [];
  for (const [name, dir] of Object.entries(live)) {
    if (!LIVE_NAME.test(name)) issues.push(`.canvas/live.json: ${name} must be lowercase letters, digits and hyphens`);
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) issues.push(`.canvas/live.json: ${name} must map to an absolute path`);
  }
  return issues;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

/** Reads and validates a project's canvas.config.json. Throws with every issue listed. */
export async function readConfig(projectRoot) {
  const config = await readJson(path.join(projectRoot, 'canvas.config.json'));
  const issues = validateConfig(config);
  if (issues.length) throw new Error(issues.join('\n'));
  return config;
}

/** Reads .canvas/live.json; a missing file is an empty registry. Invalid entries throw. */
export async function readLiveKits(projectRoot) {
  let live;
  try { live = await readJson(path.join(projectRoot, '.canvas', 'live.json')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  const issues = validateLiveKits(live);
  if (issues.length) throw new Error(issues.join('\n'));
  return live;
}

/** Reads and validates <canvasDir>/project/canvas.json. */
export async function readCanvas(canvasDir) {
  const canvas = await readJson(path.join(canvasDir, 'project', 'canvas.json'));
  const issues = validateCanvas(canvas);
  if (issues.length) throw new Error(issues.join('\n'));
  return canvas;
}

const seg = (value) => encodeURIComponent(value);

/** Viewer link: /, /<canvas>/, /<canvas>/<page>/ or /<canvas>/<page>/<board>. A page-less canvas uses "-". */
export function viewerLink({ canvas, page, board } = {}) {
  if (!canvas) return '/';
  const pageSegment = page ?? '-';
  if (!board && page == null) return `/${seg(canvas)}/`;
  if (!board) return `/${seg(canvas)}/${seg(pageSegment)}/`;
  const name = board.endsWith(BOARD_SUFFIX) ? board.slice(0, -BOARD_SUFFIX.length) : board;
  return `/${seg(canvas)}/${seg(pageSegment)}/${seg(name)}`;
}

/** The parts of a viewer link, or null when it is not one. `page` is null for "-"; `board` is the file name. */
export function parseViewerLink(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;
  const parts = pathname.split('/').slice(1);
  if (parts.length === 1 && parts[0] === '') return {};
  let decoded;
  try { decoded = parts.map((p) => decodeURIComponent(p)); } catch { return null; }
  const [canvas, page, board, extra] = decoded;
  if (!canvas || extra !== undefined || decoded.slice(0, -1).some((p) => !p)) return null;
  if (parts.length === 1) return { canvas };
  if (parts.length === 2 && board === undefined && page === '') return { canvas };
  if (parts.length === 3 && board === '') return { canvas, page: page === '-' ? null : page };
  if (parts.length === 3 && board) return { canvas, page: page === '-' ? null : page, board: `${board}${BOARD_SUFFIX}` };
  return null;
}
