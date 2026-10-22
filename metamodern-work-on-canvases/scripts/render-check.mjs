// Render check: opens every board of one canvas or of all of them in headless Chromium, in each declared theme,
// and fails on page or console errors, missing files, images with no picture, clipped text, content past the
// board's size and empty mounts. It saves a screenshot per board per theme, writes a report with the time per
// board, and writes the boards' natural heights to <canvas>/tools/heights.json for the builder.
//
//   node scripts/canvas.mjs render [--project <dir>] [--canvas <id> ...] [--board <file> ...] [--out <dir>]
//        [--jobs <n>] [--no-heights] [--force] [--reload-variants] [--watch]
//   node scripts/canvas.mjs build  [--project <dir>] [--canvas <id> ...] [--out <dir>] [--jobs <n>] [--force]
//        [--reload-variants]
//
// Boards are served through board-resolve.mjs by the shared board handler the viewer uses (serveBoards below), so a
// board loads exactly what the viewer would give it, its own kit choice included. Each board loads once, in its own
// browser context, and its other variants are switched in place. A board that passed keeps its result and pictures
// while everything it loaded is unchanged (its key, in <out>/<canvas>/cache.json).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardKit, isFrozen, readCanvas, readConfig, readLiveKits } from './canvas-format.mjs';
import { writeHeights, stableJson } from './board-builder.mjs';
import { kitDirFor, resolveBoardRequest } from './board-resolve.mjs';
import { localHost, sendText, serveBoardRequest } from './lib/board-server.mjs';
import { openBoard, switchProps } from './lib/check-board.mjs';
import { watchProject } from './lib/viewer-server.mjs';
import { chromium } from './tooling.mjs';

export const REPORT_SCHEMA = 'canvas-render/1';
export const CACHE_SCHEMA = 'canvas-render-cache/1';
// The package and its version: a new package version checks every board again.
const PACKAGE = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'PACKAGE_VERSION'), 'utf8').trim();
// Chromium draws and captures pages up to 16,384 px on a side; taller boards are measured against their own size.
const MAX_SIDE = 16384;

/** The board's data-props controls, read from its source; {} when it has none or they do not parse. */
export function readControls(html) {
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(html)?.[0];
  if (!tag) return {};
  const match = /\bdata-props\s*=\s*(?:'([^']*)'|"([^"]*)")/i.exec(tag);
  if (!match) return {};
  const raw = (match[1] ?? match[2])
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

const enumOptions = (control) => (control && control.editor === 'enum' && Array.isArray(control.options) ? control.options : []);

/**
 * The theme variants to check for a board: a list of prop objects passed as its canvas-props link value.
 * Declared variants (a canvas's tools/render.json) are kept to the props the board has controls for. Otherwise:
 * every light, dark or contrast option of a `theme` enum control, and each of those again with contrast "high"
 * when the board has a `contrast` enum control with a "high" option. A board with no theme control renders once.
 */
export function themeVariants(controls, declared) {
  const seen = new Set();
  const out = [];
  const push = (variant) => {
    const key = JSON.stringify(variant);
    if (!seen.has(key)) { seen.add(key); out.push(variant); }
  };
  if (Array.isArray(declared) && declared.length) {
    for (const variant of declared) push(Object.fromEntries(Object.entries(variant ?? {}).filter(([key]) => key in controls && key !== '$preview')));
    return out;
  }
  const themes = enumOptions(controls.theme).filter((o) => /^(light|dark)$|contrast/i.test(String(o)));
  const base = themes.length ? themes.map((theme) => ({ theme })) : controls.theme ? [{ theme: controls.theme.default }] : [{}];
  for (const variant of base) push(variant);
  if (enumOptions(controls.contrast).includes('high')) for (const variant of base) push({ ...variant, contrast: 'high' });
  return out;
}

/** A file-safe name for a variant: the theme's value, "high" for high contrast, and key-value for any other prop; "default" when empty. */
export function variantName(variant) {
  const safe = (v) => String(v).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = Object.entries(variant).map(([key, value]) => (key === 'theme' ? safe(value) : key === 'contrast' && value === 'high' ? 'high' : `${safe(key)}-${safe(value)}`));
  return parts.filter(Boolean).join('-') || 'default';
}

export const hashOf = (content) => crypto.createHash('sha256').update(content).digest('hex');

/**
 * Reads <canvasDir>/tools/render.json: {"variants": [props], "reload": true}, both optional. `variants` replaces the
 * boards' own theme variants; `reload` loads each variant afresh instead of switching it in place. {} when absent.
 */
async function readSettings(canvasDir) {
  const file = path.join(canvasDir, 'tools', 'render.json');
  let value;
  try { value = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  if (value?.variants !== undefined && !Array.isArray(value.variants)) throw new Error(`${file}: variants must be an array of prop objects`);
  if (value?.reload !== undefined && typeof value.reload !== 'boolean') throw new Error(`${file}: reload must be true or false`);
  return { variants: value?.variants ?? null, reload: value?.reload === true };
}

/** The canvases of a project: {id: canvasDir} for every folder under config.canvases with project/canvas.json. */
export async function projectCanvases(projectRoot, config) {
  const root = path.resolve(projectRoot, config.canvases);
  const found = {};
  for (const entry of (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    try { await fs.access(path.join(dir, 'project', 'canvas.json')); found[entry.name] = dir; } catch { /* not a canvas */ }
  }
  return found;
}

/**
 * The small, isolated server part: /<canvas>/project/<path> for every canvas, on 127.0.0.1 only, answered by the
 * shared board handler the viewer uses (serveBoardRequest), so a board loads exactly what the viewer gives it.
 */
export function serveBoards({ projectRoot, config, canvasDirs, liveKits = {} }) {
  const server = http.createServer((req, res) => {
    if (!localHost(req)) return sendText(res, 403, 'Forbidden');
    let url;
    let canvasId;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
      canvasId = decodeURIComponent(url.pathname.split('/')[1] ?? '');
    } catch {
      return sendText(res, 400, 'Bad request');
    }
    const parts = url.pathname.split('/');
    if (parts[2] !== 'project' || !Object.hasOwn(canvasDirs, canvasId)) return sendText(res, 404, 'Not found');
    return serveBoardRequest({ req, res, url, projectRoot, config, projectDir: path.join(canvasDirs[canvasId], 'project'), requestPath: parts.slice(3).join('/'), liveKits });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) });
    });
  });
}

// Runs inside the board page after it is ready: waits for images and fonts, then reports images with no picture,
// clipped text, content past the board's size and the board's natural height.
async function inspectPage(page, timeout, { interactive, width, height }) {
  await page.evaluate((limit) => {
    const images = [...document.images].map((img) => {
      img.loading = 'eager';
      return img.complete ? null : new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); });
    }).filter(Boolean);
    return Promise.race([Promise.all([...images, document.fonts ? document.fonts.ready : null]), new Promise((r) => setTimeout(r, limit))]);
  }, Math.min(timeout, 5000));
  return page.evaluate(({ interactive, width, height }) => {
    const labelOf = (el) => {
      const own = el.closest('[data-canvas-id]');
      if (el.getAttribute('data-canvas-id')) return `[data-canvas-id="${el.getAttribute('data-canvas-id')}"]`;
      if (el.getAttribute('data-kit-component')) return `[data-kit-component="${el.getAttribute('data-kit-component')}"]`;
      if (el.getAttribute('data-test') || el.getAttribute('data-testid')) return `[data-test="${el.getAttribute('data-test') || el.getAttribute('data-testid')}"]`;
      const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : '');
      return own ? `${tag} in [data-canvas-id="${own.getAttribute('data-canvas-id')}"]` : tag;
    };
    const snippet = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 60);
    const problems = [];
    for (const img of document.images) {
      const shown = getComputedStyle(img);
      if (!img.getClientRects().length || shown.visibility !== 'visible' || Number(shown.opacity) === 0) continue;
      const src = img.getAttribute('src') || img.getAttribute('srcset') || '';
      if (!src) { problems.push(`image with no picture: ${labelOf(img)} has no src`); continue; }
      if (!img.complete || img.naturalWidth === 0) problems.push(`image with no picture: ${src.slice(0, 160)} (${labelOf(img)})`);
    }
    // Clipped text: a line of visible text cut by its own box, the text's parent or grandparent with overflow hidden or
    // clip. A frame or viewport further out that cuts a long screen at its edge is how screen mockups work, so it is not
    // clipped text; neither is deliberate truncation (text-overflow: ellipsis, line clamps) or text that is hidden or
    // nearly transparent, such as the waiting digits of a rolling counter. Vertical cuts are measured against each
    // line's em box, not its taller line box. The board root's own overflow is checked below.
    const root = document.querySelector('[data-canvas-id="board"]');
    const clipsX = (s) => /hidden|clip/.test(s.overflowX);
    const clipsY = (s) => /hidden|clip/.test(s.overflowY);
    const flagged = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('[data-canvas-allow-clip], script, style, title, noscript, template')) continue;
      if (getComputedStyle(parent).visibility !== 'visible') continue;
      let opacity = 1;
      let box = null;
      let boxStyle = null;
      let depth = 0;
      for (let el = parent; el && el !== document.documentElement && el !== root; el = el.parentElement, depth += 1) {
        const style = getComputedStyle(el);
        opacity *= Number(style.opacity);
        if (clipsX(style) || clipsY(style)) { if (depth <= 1) { box = el; boxStyle = style; } break; }
      }
      if (!box || opacity < 0.1 || flagged.has(box)) continue;
      if (box.clientWidth <= 1 || box.clientHeight <= 1) continue; // visually hidden text, such as a screen-reader label
      if (boxStyle.clipPath !== 'none' || (boxStyle.clip && boxStyle.clip !== 'auto')) continue;
      if (boxStyle.textOverflow === 'ellipsis' || (boxStyle.webkitLineClamp && boxStyle.webkitLineClamp !== 'none')) continue;
      if (getComputedStyle(parent).textOverflow === 'ellipsis') continue;
      const r = box.getBoundingClientRect();
      const left = r.left + box.clientLeft;
      const top = r.top + box.clientTop;
      const right = left + box.clientWidth;
      const bottom = top + box.clientHeight;
      range.selectNodeContents(node);
      const em = parseFloat(getComputedStyle(parent).fontSize) || 16;
      let cutX = 0;
      let cutY = 0;
      for (const line of range.getClientRects()) {
        if (line.width < 1 || line.height < 1) continue;
        const slack = Math.max(0, (line.height - em) / 2);
        const lineTop = line.top + slack;
        const lineBottom = line.bottom - slack;
        const meets = line.right > left && line.left < right && lineBottom > top && lineTop < bottom;
        if (!meets) continue;
        const outX = clipsX(boxStyle) ? Math.max(0, left - line.left, line.right - right) : 0;
        const outY = clipsY(boxStyle) ? Math.max(0, top - lineTop, lineBottom - bottom) : 0;
        if (outX > 1) cutX = Math.max(cutX, outX);
        if (outY > 1) cutY = Math.max(cutY, outY);
      }
      // A strip whose items run on past its edge (a carousel, a row of chips that peeks) cuts its edge item by design:
      // some item lies wholly outside the box on that axis.
      const beyond = (axis) => [...box.children].some((child) => {
        const c = child.getBoundingClientRect();
        if (!c.width && !c.height) return false;
        return axis === 'x' ? c.left >= right - 1 || c.right <= left + 1 : c.top >= bottom - 1 || c.bottom <= top + 1;
      });
      if (cutX && beyond('x')) cutX = 0;
      if (cutY && beyond('y')) cutY = 0;
      const cut = Math.max(cutX, cutY);
      if (cut) flagged.set(box, `clipped text: "${snippet(box.textContent || node.textContent)}" in ${labelOf(box)} (${Math.ceil(cut)} px cut)`);
    }
    problems.push(...flagged.values());
    let natural;
    if (root) {
      const fixed = root.getBoundingClientRect().height;
      const old = root.style.height;
      root.style.height = 'auto';
      natural = Math.ceil(root.getBoundingClientRect().height);
      root.style.height = old;
      const over = Math.max(natural - Math.round(fixed), root.scrollHeight - root.clientHeight);
      if (over > 4) problems.push(`content runs ${over} px past the board's height: rebuild the canvas to apply tools/heights.json`);
    } else {
      const doc = document.documentElement;
      const overY = doc.scrollHeight - height;
      const overX = doc.scrollWidth - width;
      // An interactive board scrolls inside its frame in the viewer, so it may be taller or wider than the frame.
      if (overY > 4 && !interactive) problems.push(`content runs ${overY} px past the board's height`);
      if (overX > 4 && !interactive) problems.push(`content runs ${overX} px past the board's width`);
      natural = Math.ceil(Math.max(doc.scrollHeight, document.body.scrollHeight));
    }
    if (root) {
      const overX = root.scrollWidth - root.clientWidth;
      if (overX > 4) problems.push(`content runs ${overX} px past the board's width`);
    }
    return { problems, natural };
  }, { interactive, width, height });
}

// Problems from openBoard, without Chromium's duplicate "Failed to load resource" console lines when an HTTP line covers
// them, and without aborted requests (an image whose source changed or whose element left while it loaded): those are
// not missing files, which are answered 404 and reported as an HTTP line.
function tidy(problems) {
  const http = problems.some((p) => p.startsWith('HTTP '));
  return [...new Set(problems.filter((p) => !(http && /^console error: Failed to load resource/.test(p)) && !/^request failed: .*\(net::ERR_ABORTED\)$/.test(p)))];
}

async function pool(items, jobs, work) {
  let next = 0;
  const runners = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ---------- what a board loaded, and its key ----------

const inside = (dir, file) => {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/**
 * What a board loaded, from the URLs its pages requested: {file} for each file the board handler answered with (the
 * board, the boards it imports, its styles, pictures and fonts, the runtime, the skin and the kit), {json} for a
 * generated answer and {error} for a refused one, sorted. null when it requested anything from another origin, which
 * no key can follow.
 */
export function boardInputs(urls, { origin, projectRoot, config, canvasDirs, kit, liveKits }) {
  const inputs = new Map();
  for (const raw of urls) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) continue;
    if (url.origin !== origin) return null;
    const parts = url.pathname.split('/');
    let canvasId;
    try { canvasId = decodeURIComponent(parts[1] ?? ''); } catch { return null; }
    if (parts[2] !== 'project' || !Object.hasOwn(canvasDirs, canvasId)) return null;
    const requestPath = parts.slice(3).join('/');
    let result;
    try {
      result = resolveBoardRequest({ projectRoot, config, canvasProjectDir: path.join(canvasDirs[canvasId], 'project'), requestPath, kit: url.searchParams.get('canvas-kit') ?? kit, liveKits });
    } catch { result = { kind: 'error', status: 400, message: 'Bad request' }; }
    if (result.kind === 'file') inputs.set(`f ${result.file}`, { file: result.file });
    else if (result.kind === 'json') inputs.set(`j ${requestPath}`, { json: result.body });
    else if (result.kind === 'error') inputs.set(`e ${requestPath}`, { error: `${result.status} ${result.message}` });
  }
  return [...inputs.keys()].sort().map((key) => inputs.get(key));
}

/** A file hasher that rereads a file only when its size or modification time changed. A missing file is "missing". */
export function fileHasher() {
  const known = new Map();
  return async (file) => {
    let stat;
    try { stat = await fs.stat(file); } catch { return 'missing'; }
    if (!stat.isFile()) return 'missing';
    const signature = `${stat.size}:${stat.mtimeMs}`;
    const seen = known.get(file);
    if (seen?.signature === signature) return seen.hash;
    const hash = hashOf(await fs.readFile(file));
    known.set(file, { signature, hash });
    return hash;
  };
}

const isHash = (v) => typeof v === 'string' && v.length > 0;

/**
 * A kit folder's part hashes from its kit.json (contract 3, `parts`): {shared, components: {<path>: hash}}, or null
 * when it declares none or they are malformed.
 */
export async function readKitParts(kitDir) {
  let kit;
  try { kit = JSON.parse(await fs.readFile(path.join(kitDir, 'kit.json'), 'utf8')); } catch { return null; }
  const parts = kit?.parts;
  if (!parts || !isHash(parts.shared) || !parts.components || typeof parts.components !== 'object') return null;
  if (Object.values(parts.components).some((h) => !isHash(h))) return null;
  return parts;
}

/**
 * The kit paths a board names, from the text of every board it loaded (itself and the boards it imports): each
 * `<Ns>.Path.To.Thing`, such as Ns.Button from an <x-import> or Ns.sample.contracts from its logic, and each
 * `<alias>.Path` after `const <alias> = window.<Ns>;`. null when a board reaches the kit any other way (the bare
 * global, a computed name, or an alias passed on whole), so only the whole kit can key it.
 */
export async function kitReferences(inputs, namespace) {
  const refs = new Set();
  const ns = namespace.replace(/[$]/g, '\\$');
  const id = '[A-Za-z_$][\\w$]*';
  const member = (name, before = '\\w$') => new RegExp(`(?<![${before}])${name}((?:\\s*\\.\\s*${id})+)`, 'g');
  const aliases = new RegExp(`\\b(?:const|let|var)\\s+(${id})\\s*=\\s*(?:window\\s*\\.\\s*)?${ns}\\s*;`, 'g');
  // The global used whole in code: window.<Ns> not followed by a member, <Ns>[...], or <Ns> passed as a value. The
  // name in copy ("<Ns> AI") is not a use.
  const bare = new RegExp(`(?<![\\w$])window\\s*\\.\\s*${ns}(?![\\w$])(?!\\s*\\.)|(?<![\\w$.])${ns}\\s*\\[|[(,=:]\\s*${ns}\\s*[,)\\];}]`);
  for (const input of inputs) {
    if (!input.file?.endsWith('.dc.html')) continue;
    let text;
    try { text = await fs.readFile(input.file, 'utf8'); } catch { continue; }
    const names = [...text.matchAll(aliases)].map((m) => m[1]);
    text = text.replace(aliases, '');
    if (bare.test(text)) return null;
    for (const match of text.matchAll(member(ns))) refs.add(match[1].replace(/\s+/g, '').slice(1));
    for (const name of names) {
      const alias = name.replace(/[$]/g, '\\$');
      // An alias used as a value (an argument, an element, a reassignment) may reach any part.
      if (new RegExp(`(?<![\\w$.])${alias}\\s*[,)\\][;}]|[(,=:]\\s*${alias}(?![\\w$])(?!\\s*\\.)`).test(text)) return null;
      for (const match of text.matchAll(member(alias, '\\w$.'))) refs.add(match[1].replace(/\s+/g, '').slice(1));
    }
  }
  return refs;
}

/** The hash of the part that holds a kit path: the part named by the path's longest prefix, or null. */
export function partFor(parts, ref) {
  const segments = ref.split('.');
  for (let n = segments.length; n > 0; n -= 1) {
    const hash = parts.components[segments.slice(0, n).join('.')];
    if (hash) return hash;
  }
  return null;
}

/**
 * A board's key: a hash of everything its render depends on: the check itself (`engine`: package, browser, how
 * variants are drawn), the board's size, kind and kit choice, its variants, and the content of every input it loaded.
 * For a kit that declares part hashes, the kit's files are replaced by its shared part and the parts the board names,
 * so a kit change re-checks only the boards that use what changed.
 */
export async function boardKey({ engine, board, variants, inputs, hashFile, kits = [], namespace }) {
  const parts = [];
  const partKits = new Set();
  for (const input of inputs) {
    if (input.file) {
      const kit = kits.find((k) => k.parts && inside(k.dir, input.file));
      if (kit) { partKits.add(kit); continue; }
      parts.push([input.file, await hashFile(input.file)]);
    } else if (input.json) parts.push(['json', JSON.stringify(input.json)]);
    else parts.push(['error', input.error]);
  }
  let refs;
  for (const kit of partKits) {
    if (refs === undefined) refs = namespace ? await kitReferences(inputs, namespace) : null;
    const named = refs ? [...refs].map((ref) => partFor(kit.parts, ref)) : null;
    if (!named || named.some((h) => !h)) {
      for (const input of inputs) if (input.file && inside(kit.dir, input.file)) parts.push([input.file, await hashFile(input.file)]);
    } else {
      parts.push([`kit ${kit.dir}`, kit.parts.shared, ...[...new Set(named)].sort()]);
    }
  }
  return hashOf(JSON.stringify({ engine, board, variants: variants.map((v) => v.props), parts }));
}

/** Reads a canvas's inputs cache from an output folder ({schema, boards: {<file>: {key, inputs}}}); null when absent. */
async function readCache(outDir, canvasId) {
  try {
    const cache = JSON.parse(await fs.readFile(path.join(outDir, canvasId, 'cache.json'), 'utf8'));
    return cache.schema === CACHE_SCHEMA && cache.boards && typeof cache.boards === 'object' ? cache : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

const stemOf = (file) => file.replace(/\.dc\.html$/, '');
// Problems that mean a render never ran: its height is not measured.
const DID_NOT_RUN = /^(page error|navigation failed|check failed|the runtime never became ready)/;
// Problems that can go away by themselves (a limit reached on a busy machine, a request or navigation that failed):
// a board with one is checked again even when its inputs are unchanged.
const TRANSIENT = /^(navigation failed|check failed|the runtime never became ready|request failed)/;

// ---------- the check ----------

/**
 * Starts a render session: one headless Chromium and one board server, kept for every check it runs, so a watch or a
 * build-and-check loop pays for them once. `check(options)` runs the render check; `close()` ends the session.
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {number} [o.jobs]     boards in parallel
 * @param {number} [o.timeout]  ms a board may take to load and become ready
 * @param {(line: string) => void} [o.log]
 */
export async function createRenderSession({ projectRoot, jobs, timeout = 15000, log = () => {} }) {
  if (jobs !== undefined && !(Number.isInteger(jobs) && jobs > 0)) throw new Error(`jobs must be a positive whole number, not ${jobs}`);
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const launcher = chromium();
  if (!launcher) throw new Error('The canvas tooling is not installed: node scripts/tooling.mjs install --browser');
  // The server reads these on each request; each check refreshes them in place.
  const canvasDirs = {};
  const liveKits = {};
  const server = await serveBoards({ projectRoot: root, config, canvasDirs, liveKits });
  // The browser runs as a server the session connects to, so closing it is a kill: Chromium's own shutdown can take
  // 30 s on macOS, and nothing in the browser is kept.
  let browserServer;
  let browser;
  try {
    browserServer = await launcher.launchServer();
    browser = await launcher.connect(browserServer.wsEndpoint());
  } catch (error) {
    await browserServer?.kill().catch(() => {});
    await server.close();
    throw error;
  }
  // All processors but two, from 2 to 8: each board is one page load and its variants, mostly CPU in the browser.
  const parallel = Math.max(1, jobs ?? Math.min(8, Math.max(2, (os.availableParallelism?.() ?? os.cpus().length) - 2)));
  const hashFile = fileHasher();
  // Each board gets its own browser context, so storage a board keeps (localStorage, cookies, IndexedDB) never
  // reaches another board running beside it or after it.
  const newContext = () => browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' });

  async function check({ canvases: only, boards: boardFilter, out, heights = true, force = false, reloadVariants = false } = {}) {
    const fresh = await readLiveKits(root);
    for (const key of Object.keys(liveKits)) delete liveKits[key];
    Object.assign(liveKits, fresh);
    const all = await projectCanvases(root, config);
    const ids = only?.length ? only : Object.keys(all);
    for (const id of ids) if (!all[id]) throw new Error(`No canvas ${id} under ${path.join(root, config.canvases)}`);
    for (const key of Object.keys(canvasDirs)) delete canvasDirs[key];
    for (const id of ids) canvasDirs[id] = all[id];
    const outDir = path.resolve(out ?? path.join(root, '.canvas', 'render'));
    const wanted = boardFilter?.length ? new Set(boardFilter.map((b) => (b.endsWith('.dc.html') ? b : `${b}.dc.html`))) : null;
    const kits = [{ dir: path.resolve(root, config.kit.pinned) }, ...Object.values(liveKits).map((dir) => ({ dir: path.resolve(dir) }))];
    for (const kit of kits) kit.parts = await readKitParts(kit.dir);
    const engine = { report: REPORT_SCHEMA, cache: CACHE_SCHEMA, package: PACKAGE, browser: browser.version(), maxSide: MAX_SIDE, config: hashOf(stableJson(config)) };
    const tasks = [];
    const perCanvas = {};
    for (const id of ids) {
      const dir = canvasDirs[id];
      const canvas = await readCanvas(dir);
      const settings = await readSettings(dir);
      const reload = reloadVariants || settings.reload === true;
      const order = canvas.order ?? Object.keys(canvas.boards);
      const files = order.filter((f) => canvas.boards[f] && (!wanted || wanted.has(f)));
      const previous = await readRenderReport(outDir, id);
      const cache = await readCache(outDir, id);
      const before = new Map((previous?.results ?? []).map((r) => [r.file, r]));
      // A run over some boards keeps the earlier results of the canvas's other boards.
      const kept = wanted ? (previous?.results ?? []).filter((r) => canvas.boards[r.file] && !wanted.has(r.file)) : [];
      const info = { canvas: id, dir, order, boards: [], kept, cache: {}, checked: 0, reused: 0 };
      for (const r of kept) if (cache?.boards?.[r.file]) info.cache[r.file] = cache.boards[r.file];
      perCanvas[id] = info;
      const screens = path.join(outDir, id, 'screens');
      await fs.mkdir(screens, { recursive: true });
      const redo = new Set();
      for (const file of files) {
        const board = canvas.boards[file];
        let source = '';
        try { source = await fs.readFile(path.join(dir, 'project', file), 'utf8'); } catch { /* the board's own request reports the missing file */ }
        const variants = [];
        const names = new Set();
        for (const props of themeVariants(readControls(source), settings.variants)) {
          let name = variantName(props);
          for (let n = 2; names.has(name); n += 1) name = `${variantName(props)}-${n}`;
          names.add(name);
          variants.push({ props, name });
        }
        const kit = boardKit(canvas, file);
        const facts = { w: board.w, h: board.h, interactive: board.is_interactive === true, kit, kitDir: kitDirFor({ projectRoot: root, config, kit, liveKits }).dir ?? null, variants: reload ? 'reload' : 'in-place' };
        // A board whose inputs are all unchanged keeps its result and pictures, failures included: the same inputs fail
        // the same way. Named boards, a forced run and boards whose failure can pass by itself are always checked.
        const last = before.get(file);
        const stored = cache?.boards?.[file];
        const transient = !last || last.variants.some((v) => v.problems.some((p) => TRANSIENT.test(p)));
        if (!force && !wanted && !transient && stored?.key && Array.isArray(stored.inputs)
          && (await Promise.all(last.variants.map((v) => exists(path.join(outDir, id, v.screenshot))))).every(Boolean)
          && (await boardKey({ engine, board: facts, variants, inputs: stored.inputs, hashFile, kits, namespace: config.kit.namespace })) === stored.key) {
          info.boards.push({ ...last, page: board.page ?? null, title: board.title ?? null, reused: true });
          info.cache[file] = stored;
          info.reused += 1;
          continue;
        }
        const entry = { file, page: board.page ?? null, title: board.title ?? null, w: board.w, h: board.h, interactive: facts.interactive, hash: hashOf(source), ok: true, ms: 0, variants: [] };
        info.boards.push(entry);
        info.checked += 1;
        redo.add(stemOf(file));
        tasks.push({ id, info, entry, facts, variants, reload, cost: last?.ms ?? 0 });
      }
      // Pictures of boards drawn again, and of boards no longer on the canvas, go; the others stay with their results.
      const stems = new Set(Object.keys(canvas.boards).map(stemOf));
      for (const name of await fs.readdir(screens)) {
        const stem = name.replace(/\.[^.]+\.png$/, '');
        if (redo.has(stem) || !stems.has(stem)) await fs.rm(path.join(screens, name), { force: true });
      }
    }
    if (wanted) {
      const found = new Set(Object.values(perCanvas).flatMap((c) => c.boards.map((b) => b.file)));
      const unknown = [...wanted].filter((f) => !found.has(f));
      if (unknown.length) throw new Error(`No board ${unknown.join(', ')} on ${ids.join(', ')}`);
    }

    const started = Date.now();
    const link = (task, props) => {
      const query = Object.keys(props).length ? `?canvas-props=${encodeURIComponent(JSON.stringify(props))}` : '';
      return `${server.origin}/${encodeURIComponent(task.id)}/project/${encodeURIComponent(task.entry.file)}${query}`;
    };
    const record = (task, variant, problems, natural, ms) => {
      const shot = path.join('screens', `${stemOf(task.entry.file)}.${variant.name}.png`);
      const found = tidy(problems);
      task.entry.variants.push({ name: variant.name, props: variant.props, ok: found.length === 0, ms, problems: found, screenshot: shot, natural });
      if (found.length) task.entry.ok = false;
      log(found.length ? `FAIL ${task.id}/${task.entry.file} [${variant.name}]\n${found.map((p) => `  ${p}`).join('\n')}` : `ok   ${task.id}/${task.entry.file} [${variant.name}] ${ms} ms`);
    };
    const size = (entry) => ({ width: Math.max(1, Math.min(MAX_SIDE, Math.round(entry.w))), height: Math.max(1, Math.min(MAX_SIDE, Math.round(entry.h))) });
    const inspect = (page, entry) => inspectPage(page, timeout, { interactive: entry.interactive, width: Math.round(entry.w), height: Math.round(entry.h) });

    // Each variant loaded afresh in its own context, as a link with its props opens it.
    const renderFresh = async (task, variants, urls) => {
      for (const variant of variants) {
        const t0 = Date.now();
        let context = null;
        let problems = [];
        const found = { problems: [], natural: null };
        try {
          context = await newContext();
          context.on('request', (request) => urls.add(request.url()));
          let page;
          ({ page, problems } = await openBoard(context, link(task, variant.props), { viewport: size(task.entry), timeout }));
          Object.assign(found, await inspect(page, task.entry));
          await page.screenshot({ path: path.join(outDir, task.id, 'screens', `${stemOf(task.entry.file)}.${variant.name}.png`) });
        } catch (error) {
          found.problems.push(`check failed: ${String(error.message).split('\n')[0].slice(0, 200)}`);
        } finally {
          await context?.close().catch(() => {});
        }
        record(task, variant, [...problems, ...found.problems], found.natural, Date.now() - t0);
      }
    };

    // One load, then each further variant switched in place, as the viewer's controls switch it. Problems from the
    // load are reported with the first variant; a board whose runtime never became ready loads each variant afresh.
    const renderInPlace = async (task, urls) => {
      const [first, ...rest] = task.variants;
      let context = null;
      let t0 = Date.now();
      let left = task.variants;
      try {
        context = await newContext();
        context.on('request', (request) => urls.add(request.url()));
        const { page, problems, state } = await openBoard(context, link(task, first.props), { viewport: size(task.entry), timeout });
        let seen = 0;
        for (const variant of task.variants) {
          if (variant !== first) {
            if (!state.ready) break;
            t0 = Date.now();
          }
          const own = [];
          let natural = null;
          try {
            if (variant !== first) own.push(...(await switchProps(page, variant.props, { timeout, mounts: !state.empty.length })));
            const found = await inspect(page, task.entry);
            own.push(...found.problems);
            natural = found.natural;
            await page.screenshot({ path: path.join(outDir, task.id, 'screens', `${stemOf(task.entry.file)}.${variant.name}.png`) });
          } catch (error) {
            own.push(`check failed: ${String(error.message).split('\n')[0].slice(0, 200)}`);
          }
          const latest = problems.length;
          record(task, variant, [...problems.slice(seen, latest), ...own], natural, Date.now() - t0);
          seen = latest;
          left = left.slice(1);
        }
      } catch (error) {
        for (const variant of left) record(task, variant, [`check failed: ${String(error.message).split('\n')[0].slice(0, 200)}`], null, Date.now() - t0);
        left = [];
      } finally {
        await context?.close().catch(() => {});
      }
      if (left.length && rest.length) await renderFresh(task, left, urls);
    };

    // The slowest boards (by their last time) start first, so the run does not end waiting on one long board.
    tasks.sort((a, b) => b.cost - a.cost);
    await pool(tasks, parallel, async (task) => {
      const t0 = Date.now();
      const urls = new Set();
      if (task.reload) await renderFresh(task, task.variants, urls);
      else await renderInPlace(task, urls);
      task.entry.ms = Date.now() - t0;
      task.entry.variants.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      if (!task.entry.variants.length) task.entry.ok = false;
      const inputs = boardInputs(urls, { origin: server.origin, projectRoot: root, config, canvasDirs, kit: task.facts.kit, liveKits });
      if (inputs) task.info.cache[task.entry.file] = { key: await boardKey({ engine, board: task.facts, variants: task.variants, inputs, hashFile, kits, namespace: config.kit.namespace }), inputs };
    });

    const seconds = Math.round((Date.now() - started) / 100) / 10;
    const result = { ok: true, seconds, jobs: parallel, checked: 0, reused: 0, canvases: [] };
    for (const info of Object.values(perCanvas)) {
      const current = info.boards;
      info.boards = [...current, ...info.kept].sort((a, b) => info.order.indexOf(a.file) - info.order.indexOf(b.file));
      const failed = info.boards.filter((b) => !b.ok);
      if (failed.length) result.ok = false;
      result.checked += info.checked;
      result.reused += info.reused;
      const report = {
        schema: REPORT_SCHEMA,
        canvas: info.canvas,
        boards: info.boards.length,
        renders: info.boards.reduce((n, b) => n + b.variants.length, 0),
        failed: failed.length,
        checked: info.checked,
        reused: info.reused,
        seconds,
        msPerBoard: info.boards.length ? Math.round(info.boards.reduce((n, b) => n + b.ms, 0) / info.boards.length) : 0,
        results: info.boards,
      };
      const reportFile = path.join(outDir, info.canvas, 'report.json');
      await fs.writeFile(reportFile, stableJson(report));
      const cache = { schema: CACHE_SCHEMA, boards: Object.fromEntries(info.boards.filter((b) => info.cache[b.file]).map((b) => [b.file, info.cache[b.file]])) };
      await fs.writeFile(path.join(outDir, info.canvas, 'cache.json'), stableJson(cache));
      const lines = [
        `# Render check: ${info.canvas}`,
        '',
        `${report.boards - report.failed} of ${report.boards} boards passed (${report.renders} renders, ${report.msPerBoard} ms per board on average, ${parallel} boards in parallel). ${info.checked} checked in this run, ${info.reused} unchanged since their last check.`,
        '',
        '| Board | Themes | Result | Time |',
        '| --- | --- | --- | --- |',
        ...info.boards.map((b) => `| ${b.file} | ${b.variants.map((v) => v.name).join(', ')} | ${b.ok ? 'pass' : `fail: ${b.variants.flatMap((v) => v.problems.map((p) => `${v.name}: ${p}`)).join('; ').replace(/\|/g, '/')}`} | ${b.ms} ms${b.reused ? ' (unchanged)' : ''} |`),
        '',
      ];
      await fs.writeFile(path.join(outDir, info.canvas, 'report.md'), lines.join('\n'));
      let heightsChanged = false;
      if (heights) {
        const measured = {};
        for (const b of current) {
          // Only renders that ran: a board that never became ready measures its raw markup.
          const ran = b.variants.filter((v) => !v.problems.some((p) => DID_NOT_RUN.test(p)));
          const values = ran.map((v) => v.natural).filter((n) => Number.isFinite(n) && n > 0);
          if (values.length) measured[b.file] = Math.max(...values);
        }
        heightsChanged = await writeHeights(info.dir, measured);
      }
      result.canvases.push({ canvas: info.canvas, report: reportFile, boards: report.boards, failed: report.failed, checked: info.checked, reused: info.reused, msPerBoard: report.msPerBoard, heightsChanged });
    }
    return result;
  }

  return {
    jobs: parallel,
    check,
    async close() {
      await browser.close().catch(() => {});
      await browserServer.kill().catch(() => {});
      await server.close();
    },
  };
}

/**
 * Runs the render check. Returns {ok, seconds, jobs, checked, reused, canvases: [{canvas, report, boards, failed,
 * checked, reused, msPerBoard, heightsChanged}]}.
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string[]} [o.canvases]       canvas ids; default every canvas
 * @param {string[]} [o.boards]         board files (or stems) to check, always checked; default every board
 * @param {string} [o.out]              output folder; default <project>/.canvas/render
 * @param {number} [o.jobs]             boards in parallel
 * @param {boolean} [o.heights]         write tools/heights.json (default true)
 * @param {boolean} [o.force]           check every board, even those unchanged since they last passed
 * @param {boolean} [o.reloadVariants]  load each variant afresh instead of switching it in place
 * @param {(line: string) => void} [o.log]
 */
export async function renderCheck({ projectRoot, jobs, timeout = 15000, log = () => {}, ...options }) {
  const session = await createRenderSession({ projectRoot, jobs, timeout, log });
  try {
    return await session.check(options);
  } finally {
    await session.close();
  }
}

/** Reads a canvas's render report from an output folder; null when there is none. */
export async function readRenderReport(outDir, canvasId) {
  try {
    const report = JSON.parse(await fs.readFile(path.join(outDir, canvasId, 'report.json'), 'utf8'));
    return report.schema === REPORT_SCHEMA ? report : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** One line on a check's outcome. */
export function summary(result) {
  const failed = result.canvases.flatMap((c) => (c.failed ? [`${c.canvas} ${c.failed}`] : []));
  return `${result.ok ? 'Passed' : `Failed (${failed.join(', ')})`} in ${result.seconds} s: ${result.checked} ${result.checked === 1 ? 'board' : 'boards'} checked, ${result.reused} unchanged since their last check, ${result.jobs} in parallel.`;
}

// ---------- watch, and build then check ----------

/**
 * Checks, then keeps the browser open and checks again whenever a board, the skin or a kit changes: only the canvases
 * whose files changed, and in them only the boards whose inputs changed. Returns {close}. `onResult` gets each result.
 */
export async function watchRender({ projectRoot, canvases: only, out, heights = true, reloadVariants = false, jobs, timeout = 15000, log = () => {}, onResult = () => {} }) {
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const session = await createRenderSession({ projectRoot: root, jobs, timeout, log });
  const selected = only?.length ? new Set(only) : null;
  const pending = new Set();
  let everything = true;
  let running = false;
  let closed = false;
  let timer = null;
  let live = await readLiveKits(root);
  const drain = async () => {
    timer = null;
    if (running || closed) return;
    const known = await projectCanvases(root, config);
    let ids = everything ? (selected ? [...selected] : Object.keys(known)) : [...pending];
    ids = ids.filter((id) => known[id] && (!selected || selected.has(id)));
    everything = false;
    pending.clear();
    if (!ids.length) return;
    running = true;
    try {
      onResult(await session.check({ canvases: ids, out, heights, reloadVariants }));
    } catch (error) {
      log(`check failed: ${error.message}`);
    } finally {
      running = false;
      if (!closed && (everything || pending.size)) timer = setTimeout(drain, 200);
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(drain, 200); };
  const stopWatching = watchProject({
    projectRoot: root,
    config,
    getLiveKits: () => live,
    reloadLiveKits: async () => { live = await readLiveKits(root).catch(() => live); },
    emit: (event) => {
      if (event.type === 'files') for (const change of event.changes) pending.add(change.canvas);
      else if (event.type === 'skin' || event.type === 'kit' || event.type === 'kits') everything = true;
      else return;
      if (!running) later();
    },
  });
  await drain();
  return {
    async close() {
      closed = true;
      clearTimeout(timer);
      stopWatching();
      while (running) await new Promise((r) => setTimeout(r, 50));
      await session.close();
    },
  };
}

/** Runs a canvas's builder script (<canvas>/tools/build.mjs) from the project root; its output goes to `log`. */
function runBuilder(projectRoot, canvasId, script, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = (chunk) => { for (const line of String(chunk).split('\n')) if (line.trim()) log(`  ${line}`); };
    child.stdout.on('data', lines);
    child.stderr.on('data', lines);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${canvasId}: tools/build.mjs failed (exit code ${code})`))));
  });
}

/**
 * One step from a builder change to checked boards: runs each canvas's builder (tools/build.mjs), render-checks the
 * boards that changed, and when measured heights changed, builds and checks those canvases again so the heights
 * apply in the same command (at most three rounds). Without `canvases`, every canvas with a builder that is not
 * frozen. Returns the render check's result for the last round of each canvas.
 */
export async function buildAndCheck({ projectRoot, canvases: only, out, force = false, reloadVariants = false, jobs, timeout = 15000, log = () => {} }) {
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  // Canvases with a builder, built or not yet.
  const known = {};
  const folder = path.resolve(root, config.canvases);
  for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.isDirectory() && (await exists(path.join(folder, entry.name, 'tools', 'build.mjs')))) known[entry.name] = path.join(folder, entry.name);
  }
  const builder = (id) => path.join(known[id], 'tools', 'build.mjs');
  let ids = [];
  if (only?.length) {
    for (const id of only) if (!known[id]) throw new Error(`${id} has no builder script (${path.join(config.canvases, id, 'tools', 'build.mjs')})`);
    ids = [...only];
  } else {
    for (const id of Object.keys(known)) {
      let canvas = null;
      try { canvas = await readCanvas(known[id]); } catch { /* not built yet */ }
      if (canvas && isFrozen(canvas)) { log(`${id}: frozen, not built`); continue; }
      ids.push(id);
    }
  }
  const session = await createRenderSession({ projectRoot: root, jobs, timeout, log: () => {} });
  const started = Date.now();
  const last = new Map();
  let checked = 0;
  try {
    let round = ids;
    for (let n = 1; n <= 3 && round.length; n += 1) {
      for (const id of round) {
        log(`${id}: building${n > 1 ? ' again with the measured heights' : ''}`);
        await runBuilder(root, id, builder(id), log);
      }
      const result = await session.check({ canvases: round, out, heights: true, force: force && n === 1, reloadVariants });
      for (const c of result.canvases) last.set(c.canvas, c);
      checked += result.checked;
      round = result.canvases.filter((c) => c.heightsChanged).map((c) => c.canvas);
      if (round.length && n === 3) log(`Heights still changing on ${round.join(', ')} after three builds: run canvas build again.`);
    }
  } finally {
    await session.close();
  }
  const canvases = ids.map((id) => last.get(id));
  const outDir = path.resolve(out ?? path.join(root, '.canvas', 'render'));
  for (const c of canvases) {
    if (!c.failed) continue;
    const report = await readRenderReport(outDir, c.canvas);
    for (const b of report.results.filter((r) => !r.ok)) {
      log(`FAIL ${c.canvas}/${b.file}\n${[...new Set(b.variants.flatMap((v) => v.problems.map((p) => `  [${v.name}] ${p}`)))].join('\n')}`);
    }
  }
  return {
    ok: canvases.every((c) => !c.failed),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    jobs: session.jobs,
    checked,
    reused: canvases.reduce((n, c) => n + c.reused, 0),
    canvases,
  };
}
