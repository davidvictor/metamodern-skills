// Board builder: the one library every project builder script uses. A project script is mostly its own data
// (pages, rows, sets and what each board shows); this module writes each board's shell, lays the boards out,
// keeps the board-height cache and writes canvas.json. Node built-ins only.
//
//   buildCanvas({ canvasDir, spec })   writes <canvasDir>/project/*.dc.html and canvas.json
//   boardShell(options)                one board's HTML: head loads, header, stage, footer and data-* facts
//
// Re-running a build with the same input writes byte-identical files, writes only files whose content changed,
// and removes only boards it generated earlier (they carry GENERATED_MARK). It refuses to overwrite a board it
// did not generate and to write into a frozen canvas.
import fs from 'node:fs/promises';
import path from 'node:path';
import { BOARD_SUFFIX, ROWS, isFrozen, validateCanvas } from './canvas-format.mjs';

/** Every generated board carries this generator meta tag. Boards without it are never overwritten or removed. */
export const GENERATED_MARK = 'metamodern-work-on-canvases/board-builder';
const MARK_TAG = `<meta name="generator" content="${GENERATED_MARK}">`;

export const ROW_NAMES = { live: 'Live', deciding: 'Deciding', building: 'Building', next: 'Next', later: 'Later' };

export const LAYOUT = Object.freeze({ gapX: 80, gapRow: 160, gapBanner: 120, gapSection: 360, maxRowWidth: 7600, setCardWidth: 600 });

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Escapes text for HTML text and double-quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A board file name for a link-safe stem. */
export function boardFile(stem) {
  const file = stem.endsWith(BOARD_SUFFIX) ? stem : `${stem}${BOARD_SUFFIX}`;
  if (!ID.test(file)) throw new Error(`Board name ${stem} must be letters, digits, dots, hyphens and underscores`);
  return file;
}

const dataAttr = (name, value) => (value == null || value === '' ? '' : ` data-${name}="${escapeHtml(value)}"`);

/** A labelled section inside a board's stage. `body` is trusted HTML. */
export function section({ id, title, description, body = '' }) {
  if (!ID.test(id)) throw new Error(`Section id ${id} must be link-safe`);
  const head = title || description
    ? `<div class="shell-section-head">${title ? `<h2 class="shell-section-title">${escapeHtml(title)}</h2>` : ''}${description ? `<p class="shell-section-desc">${escapeHtml(description)}</p>` : ''}</div>`
    : '';
  return `<section class="shell-section" data-canvas-id="section-${escapeHtml(id)}">${head}${body}</section>`;
}

/** A labelled cell (one specimen, state or option) inside a section. `body` is trusted HTML. */
export function cell({ id, label, body = '' }) {
  if (!ID.test(id)) throw new Error(`Cell id ${id} must be link-safe`);
  return `<div class="shell-cell" data-canvas-id="cell-${escapeHtml(id)}">${body}${label ? `<p class="shell-cell-label">${escapeHtml(label)}</p>` : ''}</div>`;
}

const jsonAttr = (value) => JSON.stringify(value).replace(/&/g, '&amp;').replace(/'/g, '&#39;');

/**
 * One board's HTML.
 * @param {object} o
 * @param {string} o.title            the board's title (document title and header)
 * @param {string} o.kind             data-kind, such as page, row, set, component, screen, foundation, archived
 * @param {number} o.width            board width in px
 * @param {number} o.height           board height in px (the builder passes the fitted height)
 * @param {string} [o.page]           data-page
 * @param {string} [o.row]            data-row (one of live, deciding, building, next, later; or a lab row id)
 * @param {string} [o.set]            data-set
 * @param {string} [o.source]         data-source: the repository path the board shows
 * @param {string} [o.status]         data-status (a review set's status)
 * @param {string} [o.kit]            data-kit: "pinned" (default) or "live:<name>"
 * @param {string} [o.namespace]      the kit namespace; when given the head loads the kit
 * @param {string[]} [o.kitFiles]     kit file pairs under ds/<namespace>/ (default ["components/bundle"]; .css and .js each)
 * @param {string[]} [o.styles]       extra relative stylesheets, after the skin
 * @param {string[]|null} [o.themes]  theme control options (for example ["light", "dark"]); adds a `theme` control
 * @param {boolean} [o.contrast]      adds a `contrast` control (standard, high)
 * @param {object} [o.controls]       further data-props controls
 * @param {boolean} [o.root]          wraps the stage in the kit's Root with theme and contrast (default: when namespace and themes)
 * @param {string} [o.where]          the line above the header title
 * @param {string} [o.summary]        the line under the header title
 * @param {string[]} [o.tags]         header tags
 * @param {string} [o.body]           the stage's trusted HTML
 * @param {Array<[string, string]>} [o.foot]  footer facts: [label, trusted HTML]
 * @param {string} [o.logic]          the DCLogic class body; default returns theme, contrast and every control
 * @param {string} [o.css]            extra board CSS in the helmet
 * @param {object} [o.attrs]          extra data-* facts on the root: {name: value}
 * @param {boolean} [o.bare]          a screen board: the stage is the whole board, with no header or footer (where,
 *                                    summary, tags and foot are refused; put a screen's facts in the board's ws.facts,
 *                                    which the viewer's side panel shows)
 */
export function boardShell(o) {
  for (const key of ['title', 'kind']) if (typeof o[key] !== 'string' || !o[key]) throw new Error(`boardShell: ${key} is required`);
  for (const key of ['width', 'height']) if (!Number.isFinite(o[key]) || o[key] <= 0) throw new Error(`boardShell: ${key} must be a positive number`);
  if (o.row != null && !ROWS.includes(o.row) && !ID.test(o.row)) throw new Error(`boardShell: row ${o.row} must be link-safe`);
  if (o.bare) for (const key of ['where', 'summary', 'tags', 'foot']) {
    if (o[key] != null && !(Array.isArray(o[key]) && !o[key].length)) throw new Error(`boardShell: a bare board has no ${key}; put its facts in the board's ws.facts`);
  }
  const ns = o.namespace ?? null;
  const themes = o.themes ?? null;
  const controls = {};
  if (themes?.length) controls.theme = { editor: 'enum', options: [...themes], default: themes[0], section: 'Board' };
  if (o.contrast) controls.contrast = { editor: 'enum', options: ['standard', 'high'], default: 'standard', section: 'Board' };
  Object.assign(controls, o.controls ?? {});
  controls.$preview = { width: o.width, height: o.height };
  const wrap = o.root ?? Boolean(ns && (themes?.length || o.contrast));
  const kitFolder = ns ? ns.toLowerCase() : null;
  const head = [
    '<meta charset="utf-8">',
    MARK_TAG,
    `<title>${escapeHtml(o.title)}</title>`,
    '<script src="./support.js"></script>',
    '<link rel="stylesheet" href="skin.css">',
    ...(o.styles ?? []).map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`),
    ...(ns ? (o.kitFiles ?? ['components/bundle']).flatMap((f) => [
      `<link rel="stylesheet" href="ds/${kitFolder}/${escapeHtml(f)}.css">`,
      `<script src="ds/${kitFolder}/${escapeHtml(f)}.js"></script>`,
    ]) : []),
  ];
  const facts = [
    dataAttr('kind', o.kind), dataAttr('page', o.page), dataAttr('row', o.row), dataAttr('set', o.set), dataAttr('status', o.status),
    dataAttr('source', o.source), dataAttr('kit', o.kit ?? 'pinned'),
    ...Object.entries(o.attrs ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => dataAttr(k, v)),
    controls.theme ? ' data-theme="{{theme}}"' : '', controls.contrast ? ' data-contrast="{{contrast}}"' : '',
  ].join('');
  const tags = (o.tags ?? []).filter(Boolean);
  const header = o.bare ? '' : [
    `<header class="shell-head" data-canvas-id="board-head">`,
    `<div class="shell-head-text">`,
    o.where ? `<p class="shell-where">${escapeHtml(o.where)}</p>` : '',
    `<h1 class="shell-title">${escapeHtml(o.title)}</h1>`,
    o.summary ? `<p class="shell-summary">${escapeHtml(o.summary)}</p>` : '',
    `</div>`,
    tags.length ? `<ul class="shell-tags">${tags.map((t) => `<li class="shell-tag">${escapeHtml(t)}</li>`).join('')}</ul>` : '',
    `</header>`,
  ].join('');
  const rootProps = [controls.theme ? ' theme="{{theme}}"' : '', controls.contrast ? ' contrast="{{contrast}}"' : ''].join('');
  const stageInner = wrap ? `<x-import component-from-global-scope="${escapeHtml(ns)}.Root"${rootProps}>\n${o.body ?? ''}\n</x-import>` : (o.body ?? '');
  const foot = (o.foot ?? []).length
    ? `<footer class="shell-foot" data-canvas-id="board-foot">${o.foot.map(([k, v]) => `<span><b>${escapeHtml(k)}</b> ${v}</span>`).join('')}</footer>`
    : '';
  const valueNames = Object.keys(controls).filter((k) => k !== '$preview');
  const logic = o.logic ?? `renderVals() {\n    return { ${valueNames.map((k) => `${JSON.stringify(k)}: this.props[${JSON.stringify(k)}] ?? ${JSON.stringify(controls[k].default ?? null)}`).join(', ')} };\n  }`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    ...head,
    '</head>',
    '<body>',
    '<x-dc>',
    '<helmet>',
    `<style>body{margin:0}.board-shell{box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}.shell-stage{flex:1 1 auto;min-height:0}${o.bare ? '.board-shell.bare{padding:0;gap:0;border:0;border-radius:0;box-shadow:none}.board-shell.bare>.shell-stage{padding:0;border:0;border-radius:0}' : ''}${o.css ?? ''}</style>`,
    '</helmet>',
    `<div class="board-shell${o.bare ? ' bare' : ''}" data-canvas-id="board"${facts} style="width: ${o.width}px; height: ${o.height}px;">`,
    header,
    `<div class="shell-stage" data-canvas-id="board-stage">`,
    stageInner,
    `</div>`,
    foot,
    '</div>',
    '</x-dc>',
    `<script type="text/x-dc" data-dc-script data-props='${jsonAttr(controls)}'>`,
    'class Component extends DCLogic {',
    `  ${logic}`,
    '}',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].filter((line) => line !== '').join('\n');
}

/** Whether a board file's HTML was written by the builder. */
export function isGenerated(html) {
  return typeof html === 'string' && html.includes(MARK_TAG);
}

/** The height a board gets: its measured natural height (heights.json) rounded up to 10 px with an 8 px margin, else its own. */
export function fittedHeight(height, measured) {
  return Number.isFinite(measured) && measured > 0 ? Math.ceil((measured + 8) / 10) * 10 : height;
}

/** Reads <canvasDir>/tools/heights.json ({"<file>": px}); a missing file is empty. */
export async function readHeights(canvasDir) {
  try { return JSON.parse(await fs.readFile(path.join(canvasDir, 'tools', 'heights.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

/** Stable JSON: keys of plain objects in the given order, 2-space indent, trailing newline. */
export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Merges measured heights into <canvasDir>/tools/heights.json, keys sorted. Returns true when the file changed. */
export async function writeHeights(canvasDir, measured) {
  const current = await readHeights(canvasDir);
  const merged = { ...current };
  for (const [file, h] of Object.entries(measured)) if (Number.isFinite(h) && h > 0) merged[file] = Math.round(h);
  const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
  return writeIfChanged(path.join(canvasDir, 'tools', 'heights.json'), stableJson(sorted));
}

/** Writes a file only when its content differs. Returns true when it wrote. */
export async function writeIfChanged(file, content) {
  try { if ((await fs.readFile(file, 'utf8')) === content) return false; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return true;
}

// ---------- automatic boards ----------

function pageHeaderBoard(page, counts) {
  const parts = Object.entries(counts).map(([name, n]) => `${ROW_NAMES[name] ?? name} ${n}`);
  return {
    file: boardFile(`P_${page.id}`), title: page.name, w: 1600, h: page.summary ? 260 : 200, fit: true,
    shell: { kind: 'page', page: page.id, where: page.where, summary: page.summary, tags: parts },
  };
}

function rowBannerBoard(page, row, count) {
  return {
    file: boardFile(`R_${page.id}_${row.id}`), title: row.name, w: row.bannerWidth ?? 3200, h: 160, fit: true,
    shell: { kind: 'row', page: page.id, row: row.id, where: page.name, summary: row.summary, tags: [count] },
  };
}

export const STATUS_NAMES = {
  exploring: 'Exploring', ready: 'Ready', waiting: 'Waiting', locked: 'Locked', building: 'Building',
  live: 'Live', next: 'Next', later: 'Later', archived: 'Archived',
};

function setCardBoard(page, row, set, boards) {
  const lines = [];
  if (set.question) lines.push(section({ id: 'question', title: 'Question', body: `<p>${escapeHtml(set.question)}</p>` }));
  if (set.lead) lines.push(section({ id: 'lead', title: 'Lead', body: `<p>${escapeHtml(set.lead)}</p>` }));
  if (set.waits_on?.length) lines.push(section({ id: 'waits-on', title: 'Waits on', body: `<p>${set.waits_on.map(escapeHtml).join(', ')}</p>` }));
  if (set.locked) lines.push(section({ id: 'locked', title: 'Locked', body: `<p>${escapeHtml(set.locked.date)}: “${escapeHtml(set.locked.words)}”</p>` }));
  const foot = [['Set', escapeHtml(set.id)], ['Boards', String(boards.length)]];
  if (set.build?.pr) foot.push(['Pull request', `<a href="${escapeHtml(set.build.pr)}">${escapeHtml(set.build.pr)}</a>`]);
  return {
    file: boardFile(`S_${set.id}`), title: set.title || set.id, w: LAYOUT.setCardWidth, h: 480, fit: true,
    ws: { set: set.id, ...(ROWS.includes(row.id) ? { row: row.id } : {}) },
    shell: {
      kind: 'set', page: page.id, row: row.id, set: set.id, status: set.status, where: `${page.name} · ${row.name}`,
      tags: [STATUS_NAMES[set.status] ?? set.status], body: lines.join('\n'), foot,
    },
  };
}

// ---------- layout ----------

function checkBoardSpec(board, where) {
  if (!isObject(board)) throw new Error(`${where}: a board must be an object`);
  boardFile(board.file);
  if (typeof board.title !== 'string' || !board.title) throw new Error(`${where}: board ${board.file} needs a title`);
  if (!Number.isFinite(board.w) || board.w <= 0 || !Number.isFinite(board.h) || board.h <= 0) throw new Error(`${where}: board ${board.file} needs a positive w and h`);
  if (!board.existing && !board.shell && typeof board.html !== 'function') throw new Error(`${where}: board ${board.file} needs shell options, html(height) or existing: true`);
}

/**
 * Lays out a canvas spec. Pure: returns the placed boards and the canvas.json object; writes nothing.
 * spec: {title, ws?, launch?, extra?, layout?, pages: [{id, name, where?, summary?, header?, boards?, rows?}]}
 *   row: {id, name, summary?, banner?, boards?, sets?: [{set, boards}]}  (`id` one of live|deciding|building|next|later
 *        puts ws.row on its boards; any other link-safe id is a lab row with no ws.row)
 *   board: {file, title, w, h, fit?, ws?, expand?, is_interactive?, shell | html(height) | existing: true}
 */
export function layoutCanvas(spec, { heights = {} } = {}) {
  if (!isObject(spec) || !Array.isArray(spec.pages) || !spec.pages.length) throw new Error('A canvas spec needs pages');
  const L = { ...LAYOUT, ...(spec.layout ?? {}) };
  const placed = [];
  const files = new Set();
  const add = (board, x, y, page, extraWs = {}) => {
    checkBoardSpec(board, `page ${page.id}`);
    const file = boardFile(board.file);
    if (files.has(file)) throw new Error(`Board ${file} is placed twice`);
    files.add(file);
    const h = board.fit === false || board.existing ? board.h : fittedHeight(board.h, heights[file]);
    const ws = { ...extraWs, ...(board.ws ?? {}) };
    placed.push({ ...board, file, x, y, h, page: page.id, ws: Object.keys(ws).length ? ws : undefined });
    return h;
  };
  const line = (page, boards, y, x0, extraWs) => {
    let x = x0;
    let lineH = 0;
    for (const board of boards) {
      if (x > x0 && x + board.w > L.maxRowWidth) { x = x0; y += lineH + L.gapRow; lineH = 0; }
      const h = add(board, x, y, page, extraWs);
      x += board.w + L.gapX;
      lineH = Math.max(lineH, h);
    }
    return y + lineH;
  };
  const pageIds = new Set();
  for (const page of spec.pages) {
    if (!isObject(page) || !ID.test(page.id ?? '') || typeof page.name !== 'string') throw new Error('Every page needs a link-safe id and a name');
    if (pageIds.has(page.id)) throw new Error(`Page ${page.id} is listed twice`);
    pageIds.add(page.id);
    let y = 0;
    const rows = page.rows ?? [];
    if (page.header !== false && rows.length) {
      const counts = {};
      for (const row of rows) counts[row.id] = (row.boards?.length ?? 0) + (row.sets ?? []).reduce((n, s) => n + s.boards.length, 0);
      y = add(pageHeaderBoard(page, counts), 0, 0, page) + L.gapSection;
    }
    for (const row of rows) {
      if (!ID.test(row.id ?? '') || typeof row.name !== 'string') throw new Error(`Page ${page.id}: every row needs a link-safe id and a name`);
      const rowWs = ROWS.includes(row.id) ? { row: row.id } : {};
      const sets = row.sets ?? [];
      const boards = row.boards ?? [];
      if (row.banner !== false) {
        const n = boards.length + sets.reduce((sum, s) => sum + s.boards.length, 0);
        const count = sets.length
          ? `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}, ${n} ${n === 1 ? 'board' : 'boards'}`
          : n ? `${n} ${n === 1 ? 'board' : 'boards'}` : 'None yet';
        y += add(rowBannerBoard(page, row, count), 0, y, page, rowWs) + L.gapBanner;
      }
      for (const { set, boards: setBoards } of sets) {
        if (!isObject(set) || !ID.test(set.id ?? '')) throw new Error(`Page ${page.id}: every set needs a link-safe id`);
        const card = setCardBoard(page, row, set, setBoards);
        const cardH = add(card, 0, y, page);
        const bottom = setBoards.length ? line(page, setBoards, y, L.setCardWidth + L.gapX, { ...rowWs, set: set.id }) : y;
        y = Math.max(y + cardH, bottom) + L.gapRow;
      }
      if (boards.length) y = line(page, boards, y, 0, rowWs) + L.gapRow;
      y += L.gapSection - L.gapRow;
    }
    if (page.boards?.length) line(page, page.boards, y, 0, {});
  }
  const canvas = {
    v: 3,
    title: spec.title,
    launch: spec.launch ?? { view: 'canvas', page: spec.pages[0].id },
    pages: spec.pages.map((p) => ({ id: p.id, name: p.name })),
    boards: Object.fromEntries(placed.map((b) => [b.file, {
      x: b.x, y: b.y, w: b.w, h: b.h, title: b.title, page: b.page,
      ...(b.expand != null ? { expand: b.expand } : {}),
      ...(b.is_interactive != null ? { is_interactive: b.is_interactive } : {}),
      ...(b.ws ? { ws: b.ws } : {}),
    }])),
    order: placed.map((b) => b.file),
    ...(spec.ws ? { ws: spec.ws } : {}),
  };
  const issues = validateCanvas(canvas);
  if (issues.length) throw new Error(issues.join('\n'));
  return { canvas, boards: placed };
}

/** The HTML for a placed board, with the fitted height and its canvas facts. */
export function renderBoard(board) {
  if (board.existing) return null;
  if (typeof board.html === 'function') {
    const html = board.html(board.h);
    if (!isGenerated(html)) throw new Error(`Board ${board.file}: html(height) must include the generator meta tag (use boardShell)`);
    return html;
  }
  return boardShell({
    ...board.shell,
    title: board.shell.title ?? board.title,
    page: board.shell.page ?? board.page,
    row: board.shell.row ?? board.ws?.row,
    set: board.shell.set ?? board.ws?.set,
    kit: board.shell.kit ?? board.ws?.kit,
    width: board.w,
    height: board.h,
  });
}

/**
 * Builds a canvas from a spec into <canvasDir>/project/. Reads <canvasDir>/tools/heights.json, writes changed boards
 * and canvas.json, removes stale generated boards. Returns {written, removed, unchanged, canvas}.
 * Unknown top-level fields of an existing canvas.json (such as notes) are kept after the builder's own.
 */
export async function buildCanvas({ canvasDir, spec, force = false, dryRun = false }) {
  const projectDir = path.join(canvasDir, 'project');
  const canvasFile = path.join(projectDir, 'canvas.json');
  let existing = null;
  try { existing = JSON.parse(await fs.readFile(canvasFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && isFrozen(existing) && !force) throw new Error(`${path.basename(canvasDir)} is frozen: its canvas.json has ws.frozen or a History:/Decided: title`);
  const heights = await readHeights(canvasDir);
  const { canvas, boards } = layoutCanvas(spec, { heights });
  // Fields the builder owns follow the spec; any other field an existing canvas.json has (such as notes) is kept.
  const OWNED = new Set(['v', 'title', 'launch', 'pages', 'boards', 'order', 'ws']);
  if (existing) {
    for (const [key, value] of Object.entries(existing)) if (!OWNED.has(key)) canvas[key] = value;
  }
  // Every check comes first: rendering, existence and ownership of every target. A build that fails writes nothing.
  const plan = [];
  for (const board of boards) {
    const target = path.join(projectDir, board.file);
    let current = null;
    try { current = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (board.existing) {
      if (current == null) throw new Error(`Board ${board.file} is listed as existing but is not in ${projectDir}`);
      continue;
    }
    const html = renderBoard(board);
    if (current != null && !isGenerated(current)) throw new Error(`${board.file} exists and was not generated by the builder; rename the board or remove the file`);
    plan.push({ file: board.file, target, html, current });
  }
  const produced = new Set(boards.map((b) => b.file));
  if (dryRun) return { written: [], removed: [], unchanged: 0, canvas };
  await fs.mkdir(projectDir, { recursive: true });
  const written = [];
  let unchanged = 0;
  for (const { file, target, html, current } of plan) {
    if (current === html) { unchanged += 1; continue; }
    await fs.writeFile(target, html);
    written.push(file);
  }
  const removed = [];
  for (const name of (await fs.readdir(projectDir)).sort()) {
    if (!name.endsWith(BOARD_SUFFIX) || produced.has(name)) continue;
    const file = path.join(projectDir, name);
    if (isGenerated(await fs.readFile(file, 'utf8'))) { await fs.rm(file); removed.push(name); }
  }
  if (await writeIfChanged(canvasFile, stableJson(canvas))) written.push('canvas.json');
  else unchanged += 1;
  return { written, removed, unchanged, canvas };
}
