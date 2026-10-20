// Board resolution (contract 1, "What a board can load"): maps a request a board makes, relative to
// its canvas's project/ folder, to what answers it. The viewer, the render check and the
// compatibility check all use this one module.
//
//   support.js           the package runtime
//   support/<file>       the runtime's own files (react-markup.js, and React 18.3.1 for legacy kits)
//   ds/<namespace>/...   the kit chosen for the board: the pinned kit folder, or a live kit from .canvas/live.json
//   skin.css             the project skin named in canvas.config.json
//   anything else        a file inside the canvas's project/ folder
//
// A request for an unexpanded {{value}} (the browser's preload scanner reads the raw board) is answered
// empty (kind "empty", HTTP 204). A kit folder without kit.json is a legacy kit. Its ds/<namespace>/kit.json is answered with a
// generated record, {"schema": "canvas-kit/legacy", ...}, so the runtime learns that it must supply
// React 18.3.1 without making a failing request. Path traversal is refused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'runtime');
export const LEGACY_REACT = '18.3.1';

const refuse = (status, message) => ({ kind: 'error', status, message });

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Splits a request path into safe segments, or returns null when it could escape or is malformed. */
export function safeSegments(requestPath) {
  if (typeof requestPath !== 'string' || !requestPath) return null;
  let decoded = requestPath;
  if (/%/.test(decoded)) {
    try { decoded = decodeURIComponent(decoded); } catch { return null; }
  }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.startsWith('/') || /^[A-Za-z]:/.test(decoded)) return null;
  const segments = decoded.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return segments;
}

/** The kit folder for a board's kit choice ("pinned" or "live:<name>"), or an error. */
export function kitDirFor({ projectRoot, config, kit = 'pinned', liveKits = {} }) {
  if (kit === 'pinned' || kit == null) return { dir: path.resolve(projectRoot, config.kit.pinned) };
  const live = /^live:([a-z0-9][a-z0-9-]*)$/.exec(kit);
  if (!live) return { error: refuse(400, `Unknown kit choice ${kit}`) };
  const dir = liveKits[live[1]];
  if (!dir) return { error: refuse(404, `No live kit named ${live[1]} in .canvas/live.json`) };
  return { dir: path.resolve(dir) };
}

/**
 * Resolves one board request.
 * @returns {{kind: 'file', file: string} | {kind: 'json', body: object} | {kind: 'empty'} | {kind: 'error', status: number, message: string}}
 */
export function resolveBoardRequest({
  projectRoot,
  config,
  canvasProjectDir,
  requestPath,
  kit = 'pinned',
  liveKits = {},
  runtimeDir = RUNTIME_DIR,
  exists = fs.existsSync,
}) {
  // The browser's preload scanner reads the board source before the runtime takes it over, so it may ask
  // for an unexpanded value such as <img src="{{item.src}}">. Those requests are answered empty.
  if (typeof requestPath === 'string' && /\{\{|\}\}|%7B%7B|%7D%7D/i.test(requestPath)) return { kind: 'empty' };
  const segments = safeSegments(requestPath);
  if (!segments) return refuse(400, `Refused path ${requestPath}`);
  const [head, ...rest] = segments;

  if (segments.length === 1 && head === 'support.js') return { kind: 'file', file: path.join(runtimeDir, 'support.js') };
  if (head === 'support' && rest.length === 1) {
    const file = path.join(runtimeDir, 'support', rest[0]);
    return exists(file) ? { kind: 'file', file } : refuse(404, `No runtime file ${rest[0]}`);
  }
  if (segments.length === 1 && head === 'skin.css' && config?.skin) {
    return { kind: 'file', file: path.resolve(projectRoot, config.skin) };
  }
  if (head === 'ds' && rest.length >= 2 && config?.kit?.namespace && rest[0].toLowerCase() === config.kit.namespace.toLowerCase()) {
    const chosen = kitDirFor({ projectRoot, config, kit, liveKits });
    if (chosen.error) return chosen.error;
    const file = path.resolve(chosen.dir, ...rest.slice(1));
    if (!inside(chosen.dir, file)) return refuse(400, `Refused path ${requestPath}`);
    if (rest.length === 2 && rest[1] === 'kit.json' && !exists(file)) {
      if (!exists(chosen.dir)) return refuse(404, `The kit folder for ${kit} does not exist`);
      return {
        kind: 'json',
        body: {
          schema: 'canvas-kit/legacy',
          namespace: config.kit.namespace,
          react: LEGACY_REACT,
          designSystem: exists(path.join(chosen.dir, 'design-system.json')),
          kit,
        },
      };
    }
    return { kind: 'file', file };
  }
  const file = path.resolve(canvasProjectDir, ...segments);
  if (!inside(path.resolve(canvasProjectDir), file)) return refuse(400, `Refused path ${requestPath}`);
  // A kit copied into the canvas (ds/<folder>/ inside project/) follows the same legacy rule.
  if (head === 'ds' && rest.length === 2 && rest[1] === 'kit.json' && !exists(file) && exists(path.dirname(file))) {
    return {
      kind: 'json',
      body: { schema: 'canvas-kit/legacy', namespace: rest[0], react: LEGACY_REACT, designSystem: exists(path.join(path.dirname(file), 'design-system.json')), kit: 'project' },
    };
  }
  return { kind: 'file', file };
}
