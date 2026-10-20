// Exploration canvases: one command makes a canvas from the template (four pages: Start here, Directions, Lead and
// Archive), in the exploring group, on the project's pinned kit, with copies of the component boards it needs.
// Deciding it records the lead and freezes the canvas (ws.frozen). Node built-ins only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { BOARD_SUFFIX, readCanvas, readConfig, viewerLink } from './canvas-format.mjs';
import { boardShell, buildCanvas, escapeHtml, isGenerated, section, stableJson } from './board-builder.mjs';
import { readReview, writeReview } from './review-sets.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const EXPLORE_PAGES = [
  { id: 'start', name: 'Start here' },
  { id: 'directions', name: 'Directions' },
  { id: 'lead', name: 'Lead' },
  { id: 'archive', name: 'Archive' },
];

const today = () => new Date().toISOString().slice(0, 10);

function startShell(facts, height) {
  const parts = [section({ id: 'question', title: 'Question', body: `<p>${escapeHtml(facts.question)}</p>` })];
  parts.push(section({ id: 'state', title: 'State', body: `<p>${facts.decided ? `Decided on ${escapeHtml(facts.decided.date)}.` : 'Exploring. Options sit side by side on Directions; the chosen one moves to Lead.'}</p>` }));
  if (facts.decided?.lead) parts.push(section({ id: 'lead', title: 'Lead', body: `<p>${escapeHtml(facts.decided.lead)}</p>` }));
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
  archive: 'Directions set aside.',
};

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
  const template = new Set(['Start.dc.html', ...EXPLORE_PAGES.slice(1).map((p) => `P_${p.id}.dc.html`)]);
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
  const facts = { schema: 'canvas-explore/1', title, question, set, created: date, decided: null };
  await fs.mkdir(path.join(canvasDir, 'tools'), { recursive: true });
  await fs.writeFile(path.join(canvasDir, 'tools', 'explore.json'), stableJson(facts));
  await fs.writeFile(path.join(canvasDir, 'README.md'), `# ${title}\n\n${question}\n\nAn exploration canvas: Start here, Directions, Lead and Archive. Boards use the project's pinned kit.\n`);
  const intro = (page) => ({ file: `P_${page.id}.dc.html`, title: page.name, w: 1600, h: 200, shell: { kind: 'page', page: page.id, summary: PAGE_LINES[page.id] } });
  const spec = {
    title,
    ws: { group: 'exploring' },
    launch: { view: 'canvas', page: 'start' },
    pages: [
      { id: 'start', name: 'Start here', boards: [{ file: 'Start.dc.html', title, w: 1600, h: 520, html: (h) => startShell(facts, h) }] },
      { id: 'directions', name: 'Directions', boards: [intro(EXPLORE_PAGES[1]), ...placed.map(({ file, board }) => ({ file, title: board.title ?? file.replace(BOARD_SUFFIX, ''), w: board.w, h: board.h, existing: true, ...(board.expand ? { expand: board.expand } : {}), ...(board.is_interactive != null ? { is_interactive: board.is_interactive } : {}) }))] },
      { id: 'lead', name: 'Lead', boards: [intro(EXPLORE_PAGES[2])] },
      { id: 'archive', name: 'Archive', boards: [intro(EXPLORE_PAGES[3])] },
    ],
  };
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

/** Marks an exploration decided: records the lead, redraws Start here, moves it to the decided group and freezes it. */
export async function decideExploration(projectRoot, { id, lead = '', date = today() }) {
  if (!ID.test(id ?? '')) throw new Error('An exploration canvas needs a link-safe id');
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const canvasDir = path.join(path.resolve(root, config.canvases), id);
  const factsFile = path.join(canvasDir, 'tools', 'explore.json');
  let facts;
  try { facts = JSON.parse(await fs.readFile(factsFile, 'utf8')); } catch { throw new Error(`${id} was not made with explore create (no tools/explore.json)`); }
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
