// Exploration canvases: one command makes a canvas from the template (four pages: Start here, Directions, Lead and
// Archive), in the exploring group, on the project's pinned kit, with copies of the component boards it needs.
// A round keeps the Directions boards the decision-maker commented on as pictures, with their words, and the
// template's pages (explorationSpec) draw every round on Archive. Deciding it records the lead and freezes the canvas
// (ws.frozen). Node built-ins only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { BOARD_SUFFIX, isFactHref, isFrozen, readCanvas, readConfig, viewerLink } from './canvas-format.mjs';
import { boardShell, buildCanvas, escapeHtml, isGenerated, section, stableJson } from './board-builder.mjs';
import { byTheme, pictureBoard, pngSize, readReview, renders, writeReview } from './review-sets.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const EXPLORE_PAGES = [
  { id: 'start', name: 'Start here' },
  { id: 'directions', name: 'Directions' },
  { id: 'lead', name: 'Lead' },
  { id: 'archive', name: 'Archive' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const stem = (file) => file.replace(/\.dc\.html$/, '');
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The current round (1 before any round is kept) and the rounds kept so far; explore.json from 0.2.0 has neither. */
const roundOf = (facts) => (Number.isInteger(facts.round) && facts.round > 0 ? facts.round : 1);
const roundsOf = (facts) => (Array.isArray(facts.rounds) ? facts.rounds : []);
const quoted = (text) => `“${escapeHtml(text)}”`;

function startShell(facts, height) {
  const n = roundOf(facts);
  const parts = [section({ id: 'question', title: 'Question', body: `<p>${escapeHtml(facts.question)}</p>` })];
  const state = facts.decided
    ? `Decided on ${escapeHtml(facts.decided.date)}.`
    : `Exploring${n > 1 ? `, round ${n}` : ''}. Options sit side by side on Directions; the chosen one moves to Lead.`;
  parts.push(section({ id: 'state', title: 'State', body: `<p>${state}</p>` }));
  if (facts.decided?.lead) parts.push(section({ id: 'lead', title: 'Lead', body: `<p>${escapeHtml(facts.decided.lead)}</p>` }));
  const rounds = roundsOf(facts);
  if (rounds.length) {
    const items = rounds.map((r) => `<li data-canvas-id="round-${r.n}">Round ${r.n} · ${escapeHtml(r.date)}: ${quoted(r.said)}${r.learned ? ` ${escapeHtml(r.learned)}` : ''}</li>`);
    parts.push(section({ id: 'rounds', title: 'Rounds', description: 'Each round as the decision-maker saw it is on Archive.', body: `<ul class="explore-rounds">${items.join('')}</ul>` }));
  }
  const foot = [['Kit', 'pinned'], ['Started', escapeHtml(facts.created)]];
  if (facts.set) foot.unshift(['Review set', escapeHtml(facts.set)]);
  return boardShell({
    title: facts.title, kind: 'page', page: 'start', width: 1600, height,
    tags: [facts.decided ? 'Decided' : 'Exploring'], body: parts.join('\n'), foot,
  });
}

const PAGE_LINES = {
  directions: 'Options for the question, side by side. Each differs in structure and meaning, not decoration.',
  lead: 'The chosen direction, as it goes to the review set.',
  archive: 'Each round as the decision-maker saw it, newest first, with their words. Its source boards are in source/round-<n>/.',
};

// Boards of the template itself, which a copy may not be named like.
const TEMPLATE_BOARDS = new Set(['Start.dc.html', 'Precedent.dc.html', ...EXPLORE_PAGES.slice(1).map((p) => `P_${p.id}.dc.html`)]);

async function readFacts(canvasDir, id = path.basename(canvasDir)) {
  try { return JSON.parse(await fs.readFile(path.join(canvasDir, 'tools', 'explore.json'), 'utf8')); }
  catch { throw new Error(`${id} was not made with explore create (no tools/explore.json)`); }
}

/** Checks precedent links: [{title, href, note?}], each href an http(s) link or a path on the viewer, as ws.facts. */
function checkPrecedent(precedent) {
  if (precedent == null) return [];
  if (!Array.isArray(precedent)) throw new Error('precedent must be a list of {title, href, note?}');
  for (const [i, p] of precedent.entries()) {
    if (!isObject(p) || typeof p.title !== 'string' || !p.title.trim() || typeof p.href !== 'string' || (p.note != null && typeof p.note !== 'string')) throw new Error(`precedent[${i}] must be {title, href, note?}`);
    if (!isFactHref(p.href)) throw new Error(`precedent[${i}].href must be an http(s) link or a path on the viewer: ${p.href}`);
  }
  return precedent;
}

function precedentShell(links, height) {
  const items = links.map((p) => {
    const target = /^https?:/i.test(p.href) ? ' target="_blank" rel="noopener noreferrer"' : ' target="_top"';
    return `<li><a href="${escapeHtml(p.href)}"${target}>${escapeHtml(p.title)}</a>${p.note ? ` ${escapeHtml(p.note)}` : ''}</li>`;
  });
  return boardShell({
    title: 'Precedent', kind: 'page', page: 'start', width: 1600, height,
    summary: 'What other products do, looked at before the options were drawn.', body: section({ id: 'precedent', body: `<ul class="explore-precedent">${items.join('')}</ul>` }),
  });
}

/** Builder rows from a mix of rows ({id, name, boards | sets}) and boards ({file, ...}): runs of boards become a row with no banner. */
function rowsOf(items, pageId) {
  if (!Array.isArray(items)) throw new Error(`${pageId} must be a list of builder rows or boards`);
  const rows = [];
  let loose = null;
  for (const item of items) {
    if (isObject(item) && typeof item.file === 'string') {
      if (!loose) { loose = { id: `${pageId}-${rows.length + 1}`, name: '', banner: false, boards: [] }; rows.push(loose); }
      loose.boards.push(item);
    } else {
      loose = null;
      rows.push(item);
    }
  }
  return rows;
}

/** A page of the template: its intro board on top, then the caller's rows. */
function templatePage(page, intro, rows) {
  return { id: page.id, name: page.name, header: false, rows: [{ id: 'intro', name: page.name, banner: false, boards: [intro] }, ...rows] };
}

/**
 * The exploration template's spec, for createExploration and a project's exploration builder script:
 *   Start here   the question, the state, the rounds and, with `precedent` ([{title, href, note?}]), a Precedent board;
 *   Directions   an intro naming the current round (from round 2, with the last round's words), then `directions`;
 *   Lead         an intro, then `lead`;
 *   Archive      a row per kept round, newest first, of picture boards (R<n>_<stem>.dc.html) from tools/explore.json.
 * `directions` and `lead` are builder rows or boards. Round pictures are drawn from explore.json on every build, so they
 * survive rebuilds after their option boards leave Directions. Returns {title, ws, launch, pages} for buildCanvas.
 */
export async function explorationSpec(canvasDir, { directions = [], lead = [], precedent = null } = {}) {
  const facts = await readFacts(canvasDir);
  const links = checkPrecedent(precedent);
  const n = roundOf(facts);
  const rounds = roundsOf(facts);
  const last = rounds.at(-1);
  const [, directionsPage, leadPage, archivePage] = EXPLORE_PAGES;
  const intro = (page, shell = {}) => ({ file: `P_${page.id}.dc.html`, title: page.name, w: 1600, h: 200, shell: { kind: 'page', page: page.id, summary: PAGE_LINES[page.id], ...shell } });
  const lastWords = last
    ? section({ id: 'last-round', title: `Round ${last.n} · ${last.date}`, body: `<blockquote class="explore-said">${quoted(last.said)}</blockquote>${last.learned ? `<p class="explore-learned">${escapeHtml(last.learned)}</p>` : ''}` })
    : '';
  const start = [{ file: 'Start.dc.html', title: facts.title, w: 1600, h: 520, html: (h) => startShell(facts, h) }];
  if (links.length) start.push({ file: 'Precedent.dc.html', title: 'Precedent', w: 1600, h: 200 + 40 * links.length, html: (h) => precedentShell(links, h) });
  const archiveRows = [...rounds].reverse().map((r) => ({
    id: `round-${r.n}`,
    name: `Round ${r.n} · ${r.date}`,
    summary: [r.said, r.learned].filter(Boolean).join(' · '),
    boards: r.boards.map((b) => pictureBoard(b, { file: `R${r.n}_${stem(b.file)}.dc.html`, where: `Round ${r.n} · ${r.date}`, set: facts.set ?? undefined, row: `round-${r.n}` })),
  }));
  return {
    title: facts.title,
    ws: { group: 'exploring' },
    launch: { view: 'canvas', page: 'start' },
    pages: [
      { id: 'start', name: 'Start here', boards: start },
      templatePage(directionsPage, intro(directionsPage, { where: `Round ${n}`, body: lastWords }), rowsOf(directions, 'directions')),
      templatePage(leadPage, intro(leadPage), rowsOf(lead, 'lead')),
      templatePage(archivePage, intro(archivePage), archiveRows),
    ],
  };
}

// An attribute value in any quoting HTML allows: "double", 'single' or unquoted.
const attrValue = (name) => new RegExp(`\\b(?:${name})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'gi');
// A CSS url() reference, quoted or not.
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi;
const valueOf = (m) => m[1] ?? m[2] ?? m[3] ?? '';

/** A canvas-relative file path for a reference made from `fromDir` (a folder inside the canvas), or null. */
function localPath(ref, fromDir) {
  const raw = ref.trim();
  if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|#)|\{\{/i.test(raw)) return null;
  const clean = raw.split(/[?#]/)[0];
  const joined = path.posix.normalize(path.posix.join(fromDir, clean));
  if (!joined || joined === '.' || joined.startsWith('..') || path.posix.isAbsolute(joined)) return null;
  if (fromDir === '.' && /^(?:support(?:\.js|\/)|skin\.css$|ds\/)/i.test(joined)) return null; // served by the package or the kit
  return joined;
}

/** Files a board needs from its canvas: imported boards, and relative stylesheets, scripts and pictures (with what stylesheets load). */
async function dependencies(projectDir, file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = await fs.readFile(path.join(projectDir, file), 'utf8');
  const dir = path.posix.dirname(file);
  const refs = [];
  if (file.endsWith(BOARD_SUFFIX)) {
    for (const m of text.matchAll(/<dc-import\b[^>]*>/gi)) {
      const name = [...m[0].matchAll(attrValue('name'))].map(valueOf)[0];
      if (!name || !ID.test(name)) continue; // not a board of this canvas; the render check reports it
      const board = `${name}${BOARD_SUFFIX}`;
      try { await fs.access(path.join(projectDir, board)); await dependencies(projectDir, board, seen); } catch { /* the render check reports it */ }
    }
    for (const m of text.matchAll(attrValue('href|src'))) refs.push(valueOf(m));
  }
  if (file.endsWith(BOARD_SUFFIX) || file.endsWith('.css')) for (const m of text.matchAll(CSS_URL)) refs.push(valueOf(m));
  for (const ref of refs) {
    const local = localPath(ref, dir);
    if (!local || seen.has(local)) continue;
    try {
      if (!(await fs.stat(path.join(projectDir, local))).isFile()) continue;
      if (local.endsWith('.css')) await dependencies(projectDir, local, seen);
      else seen.add(local);
    } catch { /* not a file of the canvas */ }
  }
  return seen;
}

/**
 * Creates an exploration canvas. copies: ["<canvas id>/<board>"], copied with what they load into Directions.
 * Returns {canvasDir, links, copied}.
 */
export async function createExploration(projectRoot, { id, title, question, set = null, copies = [], date = today() }) {
  const root = path.resolve(projectRoot);
  if (!ID.test(id ?? '')) throw new Error('An exploration canvas needs a link-safe id');
  if (!title || !question) throw new Error('An exploration canvas needs a title and its question');
  const config = await readConfig(root);
  const canvasesRoot = path.resolve(root, config.canvases);
  const canvasDir = path.join(canvasesRoot, id);
  try { await fs.access(canvasDir); throw new Error(`Canvas ${id} already exists`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let review = null;
  if (set) {
    review = await readReview(root);
    const entry = review.sets.find((s) => s.id === set);
    if (!entry) throw new Error(`No review set ${set}`);
    if (entry.canvas && entry.canvas !== id) throw new Error(`Review set ${set} already explores on ${entry.canvas}`);
  }
  // Resolve the copies before writing anything.
  const plan = new Map();
  const placed = [];
  const template = TEMPLATE_BOARDS;
  for (const ref of copies) {
    const [from, board, extra] = String(ref).split('/');
    if (!from || !board || extra !== undefined || !ID.test(from) || !ID.test(board)) throw new Error(`Copy ${ref} must be <canvas id>/<board>`);
    const file = board.endsWith(BOARD_SUFFIX) ? board : `${board}${BOARD_SUFFIX}`;
    const sourceDir = path.join(canvasesRoot, from, 'project');
    const source = await readCanvas(path.join(canvasesRoot, from)).catch(() => null);
    if (!source?.boards?.[file]) throw new Error(`No board ${file} on canvas ${from}`);
    for (const dep of await dependencies(sourceDir, file)) {
      const target = dep;
      if (template.has(target)) throw new Error(`${ref} needs ${target}, which is a board of the exploration template: rename it on ${from} first`);
      const origin = path.join(sourceDir, dep);
      const prior = plan.get(target);
      if (prior && prior !== origin) {
        const [a, b] = await Promise.all([fs.readFile(prior), fs.readFile(origin)]);
        if (!a.equals(b)) throw new Error(`Two copies need different files named ${target}`);
      }
      plan.set(target, origin);
    }
    if (!placed.some((p) => p.file === file)) placed.push({ file, board: source.boards[file] });
  }
  const projectDir = path.join(canvasDir, 'project');
  const writes = [...plan].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([target, origin]) => {
    const destination = path.resolve(projectDir, target);
    const relative = path.relative(projectDir, destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refused to copy ${target} outside the canvas`);
    return { target, origin, destination };
  });
  await fs.mkdir(projectDir, { recursive: true });
  for (const { target, origin, destination } of writes) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const content = await fs.readFile(origin);
    if (target.endsWith(BOARD_SUFFIX) && isGenerated(content.toString('utf8'))) {
      // A copy is the exploration's own starting point: it is no longer the builder's output.
      await fs.writeFile(destination, content.toString('utf8').replace(/<meta name="generator" content="[^"]*">\n?/, ''));
    } else await fs.writeFile(destination, content);
  }
  const facts = { schema: 'canvas-explore/1', title, question, set, created: date, decided: null, round: 1, rounds: [] };
  await fs.mkdir(path.join(canvasDir, 'tools'), { recursive: true });
  await fs.writeFile(path.join(canvasDir, 'tools', 'explore.json'), stableJson(facts));
  await fs.writeFile(path.join(canvasDir, 'README.md'), `# ${title}\n\n${question}\n\nAn exploration canvas: Start here, Directions, Lead and Archive. Boards use the project's pinned kit.\n`);
  const copiesOnDirections = placed.map(({ file, board }) => ({ file, title: board.title ?? file.replace(BOARD_SUFFIX, ''), w: board.w, h: board.h, existing: true, ...(board.expand ? { expand: board.expand } : {}), ...(board.is_interactive != null ? { is_interactive: board.is_interactive } : {}) }));
  const spec = await explorationSpec(canvasDir, { directions: copiesOnDirections });
  const built = await buildCanvas({ canvasDir, spec });
  if (review) {
    const next = structuredClone(review);
    next.sets.find((s) => s.id === set).canvas = id;
    await writeReview(root, next);
  }
  return {
    canvasDir,
    copied: [...plan.keys()].sort(),
    links: [viewerLink({ canvas: id }), ...Object.entries(built.canvas.boards).map(([file, b]) => viewerLink({ canvas: id, page: b.page, board: file }))],
  };
}

/**
 * Keeps the current round: the Directions boards (all but the page's intro and row banners, or the named ones) as
 * pictures at <canvas>/project/assets/round-<n>/<stem>.png, their source at <canvas>/source/round-<n>/<file>, and the
 * round, with the decision-maker's words, in tools/explore.json; the next round is n + 1. Each board needs a render at
 * its current source (failed renders are kept as they were seen). Every check comes before the first write.
 * Returns {canvasDir, round}. The canvas's builder then draws the next round with explorationSpec.
 */
export async function roundExploration(projectRoot, { id, said, learned = '', boards = null, date = today(), renderOut } = {}) {
  if (!ID.test(id ?? '')) throw new Error('An exploration canvas needs a link-safe id');
  if (typeof said !== 'string' || !said.trim()) throw new Error('A round needs the decision-maker\'s words (--said)');
  if (typeof learned !== 'string') throw new Error('learned must be text');
  if (!DATE.test(date)) throw new Error('The round date must be YYYY-MM-DD');
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const canvasDir = path.join(path.resolve(root, config.canvases), id);
  const facts = await readFacts(canvasDir, id);
  const canvas = await readCanvas(canvasDir);
  if (facts.decided || isFrozen(canvas)) throw new Error(`${id} is decided: a decided exploration takes no more rounds`);
  const n = roundOf(facts);
  const rounds = roundsOf(facts);
  if (rounds.some((r) => r.n === n)) throw new Error(`${id}: round ${n} is already kept in tools/explore.json`);
  // The options on Directions: every board on the page but its intro and the builder's row banners.
  const options = [];
  for (const file of canvas.order ?? Object.keys(canvas.boards)) {
    if (canvas.boards[file]?.page !== 'directions' || file === 'P_directions.dc.html') continue;
    const html = await fs.readFile(path.join(canvasDir, 'project', file), 'utf8').catch(() => '');
    if (isGenerated(html) && /<div class="board-shell[^"]*" data-canvas-id="board" data-kind="(?:page|row)"/.test(html)) continue;
    options.push(file);
  }
  const files = boards?.length ? boards.map((b) => (b.endsWith(BOARD_SUFFIX) ? b : `${b}${BOARD_SUFFIX}`)) : options;
  for (const file of files) if (!options.includes(file)) throw new Error(`${file} is not an option on Directions of ${id}`);
  if (!files.length) throw new Error(`${id} has no options on Directions to keep`);
  const { found } = await renders({ projectRoot: root, canvasId: id, files, renderOut, requireOk: false });
  const last = rounds.at(-1);
  if (last && last.boards.length === found.length) {
    const kept = await Promise.all(last.boards.map((b) => fs.readFile(path.join(canvasDir, b.source), 'utf8').catch(() => null)));
    if (found.every((b, i) => b.file === last.boards[i].file && b.source === kept[i])) throw new Error(`nothing on Directions changed since round ${last.n}: draw round ${n} first`);
  }
  const round = { n, date, said: String(said), learned, boards: [] };
  const pictures = [];
  for (const b of found) {
    const buffer = await fs.readFile(byTheme(b.variants)[0].file);
    const { w, h } = pngSize(buffer);
    const image = `assets/round-${n}/${stem(b.file)}.png`;
    const source = `source/round-${n}/${b.file}`;
    pictures.push({ buffer, image, source: b.source, sourcePath: source });
    round.boards.push({ file: b.file, title: b.board.title ?? stem(b.file), image, w, h, source });
  }
  // Writes: what a stopped earlier attempt at this round left is replaced; the record is written last.
  const assetDir = path.join(canvasDir, 'project', 'assets', `round-${n}`);
  const sourceDir = path.join(canvasDir, 'source', `round-${n}`);
  await fs.rm(assetDir, { recursive: true, force: true });
  await fs.rm(sourceDir, { recursive: true, force: true });
  await fs.mkdir(assetDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  for (const p of pictures) {
    await fs.writeFile(path.join(canvasDir, 'project', p.image), p.buffer);
    await fs.writeFile(path.join(canvasDir, p.sourcePath), p.source);
  }
  await fs.writeFile(path.join(canvasDir, 'tools', 'explore.json'), stableJson({ ...facts, round: n + 1, rounds: [...rounds, round] }));
  return { canvasDir, round };
}

/** Marks an exploration decided: records the lead, redraws Start here (with every round), moves it to the decided group and freezes it. */
export async function decideExploration(projectRoot, { id, lead = '', date = today() }) {
  if (!ID.test(id ?? '')) throw new Error('An exploration canvas needs a link-safe id');
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const canvasDir = path.join(path.resolve(root, config.canvases), id);
  const factsFile = path.join(canvasDir, 'tools', 'explore.json');
  const facts = await readFacts(canvasDir, id);
  if (facts.decided) throw new Error(`${id} is already decided`);
  const canvas = await readCanvas(canvasDir);
  facts.decided = { date, lead };
  const startFile = path.join(canvasDir, 'project', 'Start.dc.html');
  const current = await fs.readFile(startFile, 'utf8').catch(() => null);
  if (current != null && !isGenerated(current)) throw new Error('Start.dc.html was edited by hand; it is not the template\'s board');
  await fs.writeFile(startFile, startShell(facts, canvas.boards['Start.dc.html']?.h ?? 520));
  canvas.ws = { ...(canvas.ws ?? {}), group: 'decided', frozen: true };
  await fs.writeFile(path.join(canvasDir, 'project', 'canvas.json'), stableJson(canvas));
  await fs.writeFile(factsFile, stableJson(facts));
  return { canvasDir, canvas };
}
