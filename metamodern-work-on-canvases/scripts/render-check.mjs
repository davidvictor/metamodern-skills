// Render check: opens every board of one canvas or of all of them in headless Chromium, in each declared theme,
// and fails on page or console errors, missing files, images with no picture, clipped text, content past the
// board's size and empty mounts. It saves a screenshot per board per theme, writes a report with the time per
// board, and writes the boards' natural heights to <canvas>/tools/heights.json for the builder.
//
//   node scripts/canvas.mjs render [--project <dir>] [--canvas <id> ...] [--board <file> ...] [--out <dir>]
//        [--jobs <n>] [--no-heights]
//
// Boards are served through board-resolve.mjs by the shared board handler the viewer uses (serveBoards below), so a
// board loads exactly what the viewer would give it, its own kit choice included.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readCanvas, readConfig, readLiveKits } from './canvas-format.mjs';
import { writeHeights, stableJson } from './board-builder.mjs';
import { localHost, sendText, serveBoardRequest } from './lib/board-server.mjs';
import { openBoard } from './lib/check-board.mjs';
import { chromium } from './tooling.mjs';

export const REPORT_SCHEMA = 'canvas-render/1';
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

/** Reads <canvasDir>/tools/render.json ({"variants": [props]}); null when absent. */
async function readDeclared(canvasDir) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(canvasDir, 'tools', 'render.json'), 'utf8'));
    if (!Array.isArray(value?.variants)) throw new Error(`${path.join(canvasDir, 'tools', 'render.json')}: variants must be an array of prop objects`);
    return value.variants;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
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

/**
 * Runs the render check. Returns {ok, seconds, canvases: [{canvas, report path, boards}]}.
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string[]} [o.canvases]  canvas ids; default every canvas
 * @param {string[]} [o.boards]    board files (or stems) to check; default every board
 * @param {string} [o.out]         output folder; default <project>/.canvas/render
 * @param {number} [o.jobs]        pages in parallel
 * @param {boolean} [o.heights]    write tools/heights.json (default true)
 * @param {(line: string) => void} [o.log]
 */
export async function renderCheck({ projectRoot, canvases: only, boards: boardFilter, out, jobs, heights = true, timeout = 15000, log = () => {} }) {
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const liveKits = await readLiveKits(root);
  const all = await projectCanvases(root, config);
  const ids = only?.length ? only : Object.keys(all);
  for (const id of ids) if (!all[id]) throw new Error(`No canvas ${id} under ${path.join(root, config.canvases)}`);
  const canvasDirs = Object.fromEntries(ids.map((id) => [id, all[id]]));
  const outDir = path.resolve(out ?? path.join(root, '.canvas', 'render'));
  const wanted = boardFilter?.length ? new Set(boardFilter.map((b) => (b.endsWith('.dc.html') ? b : `${b}.dc.html`))) : null;
  if (jobs !== undefined && !(Number.isInteger(jobs) && jobs > 0)) throw new Error(`jobs must be a positive whole number, not ${jobs}`);
  const tasks = [];
  const perCanvas = {};
  for (const [id, dir] of Object.entries(canvasDirs)) {
    const canvas = await readCanvas(dir);
    const declared = await readDeclared(dir);
    const files = (canvas.order ?? Object.keys(canvas.boards)).filter((f) => canvas.boards[f] && (!wanted || wanted.has(f)));
    // A run over some boards keeps the earlier results of the canvas's other boards.
    const previous = wanted ? await readRenderReport(outDir, id) : null;
    perCanvas[id] = { canvas: id, dir, order: canvas.order ?? Object.keys(canvas.boards), boards: [], kept: (previous?.results ?? []).filter((r) => canvas.boards[r.file] && !wanted.has(r.file)) };
    const screens = path.join(outDir, id, 'screens');
    await fs.mkdir(screens, { recursive: true });
    const stems = new Set(files.map((f) => f.replace(/\.dc\.html$/, '')));
    for (const name of await fs.readdir(screens)) if (!wanted || stems.has(name.replace(/\.[^.]+\.png$/, ''))) await fs.rm(path.join(screens, name), { force: true });
    for (const file of files) {
      const board = canvas.boards[file];
      let source = '';
      try { source = await fs.readFile(path.join(dir, 'project', file), 'utf8'); } catch { /* the board's own request reports the missing file */ }
      const variants = themeVariants(readControls(source), declared);
      const entry = { file, page: board.page ?? null, title: board.title ?? null, w: board.w, h: board.h, interactive: board.is_interactive === true, hash: hashOf(source), ok: true, ms: 0, variants: [] };
      perCanvas[id].boards.push(entry);
      const names = new Set();
      for (const props of variants) {
        let name = variantName(props);
        for (let n = 2; names.has(name); n += 1) name = `${variantName(props)}-${n}`;
        names.add(name);
        tasks.push({ id, entry, props, name });
      }
    }
  }
  if (wanted) {
    const found = new Set(Object.values(perCanvas).flatMap((c) => c.boards.map((b) => b.file)));
    const unknown = [...wanted].filter((f) => !found.has(f));
    if (unknown.length) throw new Error(`No board ${unknown.join(', ')} on ${ids.join(', ')}`);
  }

  const launcher = chromium();
  if (!launcher) throw new Error('The canvas tooling is not installed: node scripts/tooling.mjs install --browser');
  const server = await serveBoards({ projectRoot: root, config, canvasDirs, liveKits });
  const browser = await launcher.launch();
  // Each board and variant gets its own browser context, so storage a board keeps (localStorage, cookies, IndexedDB)
  // never reaches another page running beside it or after it.
  const newContext = () => browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const started = Date.now();
  const parallel = Math.max(1, jobs ?? Math.min(8, Math.max(2, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / 2))));
  try {
    await pool(tasks, parallel, async ({ id, entry, props, name }) => {
      const width = Math.max(1, Math.min(MAX_SIDE, Math.round(entry.w)));
      const height = Math.max(1, Math.min(MAX_SIDE, Math.round(entry.h)));
      const query = Object.keys(props).length ? `?canvas-props=${encodeURIComponent(JSON.stringify(props))}` : '';
      const url = `${server.origin}/${encodeURIComponent(id)}/project/${encodeURIComponent(entry.file)}${query}`;
      const shot = path.join(outDir, id, 'screens', `${entry.file.replace(/\.dc\.html$/, '')}.${name}.png`);
      const t0 = Date.now();
      let context = null;
      let page = null;
      let problems = [];
      let found = { problems: [], natural: null };
      try {
        context = await newContext();
        ({ page, problems } = await openBoard(context, url, { viewport: { width, height }, timeout }));
        found = await inspectPage(page, timeout, { interactive: entry.interactive, width: Math.round(entry.w), height: Math.round(entry.h) });
        await page.screenshot({ path: shot });
      } catch (error) {
        found.problems.push(`check failed: ${String(error.message).split('\n')[0].slice(0, 200)}`);
      } finally {
        await context?.close().catch(() => {});
      }
      const all = tidy([...problems, ...found.problems]);
      const ms = Date.now() - t0;
      entry.variants.push({ name, props, ok: all.length === 0, ms, problems: all, screenshot: path.relative(path.join(outDir, id), shot), natural: found.natural });
      entry.ms += ms;
      if (all.length) entry.ok = false;
      log(all.length ? `FAIL ${id}/${entry.file} [${name}]\n${all.map((p) => `  ${p}`).join('\n')}` : `ok   ${id}/${entry.file} [${name}] ${ms} ms`);
    });
  } finally {
    await browser.close();
    await server.close();
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const result = { ok: true, seconds, jobs: parallel, canvases: [] };
  for (const info of Object.values(perCanvas)) {
    for (const entry of info.boards) {
      entry.variants.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      if (!entry.variants.length) entry.ok = false;
    }
    const checked = info.boards;
    info.boards = [...checked, ...info.kept].sort((a, b) => info.order.indexOf(a.file) - info.order.indexOf(b.file));
    const failed = info.boards.filter((b) => !b.ok);
    if (failed.length) result.ok = false;
    const report = {
      schema: REPORT_SCHEMA,
      canvas: info.canvas,
      boards: info.boards.length,
      renders: info.boards.reduce((n, b) => n + b.variants.length, 0),
      failed: failed.length,
      seconds,
      msPerBoard: info.boards.length ? Math.round(info.boards.reduce((n, b) => n + b.ms, 0) / info.boards.length) : 0,
      results: info.boards,
    };
    const reportFile = path.join(outDir, info.canvas, 'report.json');
    await fs.writeFile(reportFile, stableJson(report));
    const lines = [
      `# Render check: ${info.canvas}`,
      '',
      `${report.boards - report.failed} of ${report.boards} boards passed (${report.renders} renders, ${report.msPerBoard} ms per board on average, ${parallel} pages in parallel).`,
      '',
      '| Board | Themes | Result | Time |',
      '| --- | --- | --- | --- |',
      ...info.boards.map((b) => `| ${b.file} | ${b.variants.map((v) => v.name).join(', ')} | ${b.ok ? 'pass' : `fail: ${b.variants.flatMap((v) => v.problems.map((p) => `${v.name}: ${p}`)).join('; ').replace(/\|/g, '/')}`} | ${b.ms} ms |`),
      '',
    ];
    await fs.writeFile(path.join(outDir, info.canvas, 'report.md'), lines.join('\n'));
    if (heights) {
      const measured = {};
      for (const b of checked) {
        // Only renders that ran: a board that never became ready measures its raw markup.
        const ran = b.variants.filter((v) => !v.problems.some((p) => /^(page error|navigation failed|check failed|the runtime never became ready)/.test(p)));
        const values = ran.map((v) => v.natural).filter((n) => Number.isFinite(n) && n > 0);
        if (values.length) measured[b.file] = Math.max(...values);
      }
      await writeHeights(info.dir, measured);
    }
    result.canvases.push({ canvas: info.canvas, report: reportFile, boards: report.boards, failed: report.failed, msPerBoard: report.msPerBoard });
  }
  return result;
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
