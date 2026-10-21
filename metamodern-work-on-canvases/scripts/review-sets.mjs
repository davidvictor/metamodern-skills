// Review sets and build briefs (contract 5): review.json (canvas-review/1) read, validate and write; the
// status-to-row mapping; creating a set and setting its status; locking it (the record plus builds/<set>.md);
// and archiving its boards as pictures on an archive canvas, keeping their source. Node built-ins only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readCanvas, readConfig, viewerLink } from './canvas-format.mjs';
import { buildCanvas, escapeHtml, stableJson, writeIfChanged } from './board-builder.mjs';
import { hashOf, projectCanvases, readRenderReport } from './render-check.mjs';

export const REVIEW_SCHEMA = 'canvas-review/1';
export const STATUSES = ['exploring', 'ready', 'waiting', 'locked', 'building', 'live', 'next', 'later', 'archived'];
export const HARNESSES = ['claude-code', 'codex'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const ROW_OF = {
  exploring: 'deciding', ready: 'deciding', waiting: 'deciding',
  locked: 'building', building: 'building',
  next: 'next', later: 'later', live: 'live', archived: 'archive',
};

/** Where a set shows: deciding, building, next, later, live (after a sync; the set then leaves the app canvas) or archive (the archive canvas). */
export function statusRow(status) {
  const row = ROW_OF[status];
  if (!row) throw new Error(`Unknown review set status ${status}`);
  return row;
}

/** A new set with every contract field, in contract order. */
export function newSet({ id, page, title = '', question = '', lead = '', status = 'exploring', waits_on = [], replaces = [], canvas = null, boards = [] }) {
  return {
    id, page, title, question, lead, status, waits_on: [...waits_on], replaces: [...replaces], canvas, boards: [...boards],
    locked: null, build: { issue: null, pr: null, branch: null }, live: { commit: null },
  };
}

/** Issues with a review.json object; empty when valid. */
export function validateReview(review) {
  if (!isObject(review)) return ['review.json: must be an object'];
  const issues = [];
  if (review.schema !== REVIEW_SCHEMA) issues.push(`review.json: schema must be ${REVIEW_SCHEMA}`);
  if (!Array.isArray(review.sets)) return [...issues, 'review.json: sets must be an array'];
  const ids = new Set();
  for (const [i, set] of review.sets.entries()) {
    const at = `review.json: sets[${i}]`;
    if (!isObject(set)) { issues.push(`${at} must be an object`); continue; }
    if (typeof set.id !== 'string' || !ID.test(set.id)) issues.push(`${at}.id must be a link-safe id`);
    else if (ids.has(set.id)) issues.push(`review.json: duplicate set ${set.id}`);
    else ids.add(set.id);
  }
  for (const [i, set] of review.sets.entries()) {
    if (!isObject(set)) continue;
    const at = `review.json: set ${set.id ?? i}`;
    if (typeof set.page !== 'string' || !ID.test(set.page)) issues.push(`${at}: page must be a page id`);
    for (const key of ['title', 'question', 'lead']) if (typeof set[key] !== 'string') issues.push(`${at}: ${key} must be a string`);
    if (!STATUSES.includes(set.status)) issues.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
    for (const key of ['waits_on', 'replaces', 'boards']) if (!Array.isArray(set[key])) issues.push(`${at}: ${key} must be an array`);
    for (const dep of Array.isArray(set.waits_on) ? set.waits_on : []) {
      if (dep === set.id) issues.push(`${at}: waits on itself`);
      else if (!ids.has(dep)) issues.push(`${at}: waits on ${dep}, which is not a set`);
    }
    for (const r of Array.isArray(set.replaces) ? set.replaces : []) if (typeof r !== 'string' || !r) issues.push(`${at}: replaces must list set ids`);
    if (Array.isArray(set.boards)) {
      const seen = new Set();
      for (const b of set.boards) {
        if (typeof b !== 'string' || !b.endsWith('.dc.html') || b.includes('/')) issues.push(`${at}: boards must be <board>.dc.html file names`);
        else if (seen.has(b)) issues.push(`${at}: board ${b} is listed twice`);
        seen.add(b);
      }
    }
    if (set.canvas !== null && (typeof set.canvas !== 'string' || !ID.test(set.canvas))) issues.push(`${at}: canvas must be a canvas id or null`);
    if (set.status === 'waiting' && !(set.waits_on?.length)) issues.push(`${at}: a waiting set must name what it waits on`);
    if (set.locked !== null && set.locked !== undefined) {
      if (!isObject(set.locked)) issues.push(`${at}: locked must be {date, words, harness} or null`);
      else {
        if (typeof set.locked.date !== 'string' || !DATE.test(set.locked.date)) issues.push(`${at}: locked.date must be YYYY-MM-DD`);
        if (typeof set.locked.words !== 'string' || !set.locked.words.trim()) issues.push(`${at}: locked.words must be the decision-maker's words`);
        if (!HARNESSES.includes(set.locked.harness)) issues.push(`${at}: locked.harness must be one of ${HARNESSES.join(', ')}`);
      }
    } else if (['locked', 'building', 'live'].includes(set.status)) issues.push(`${at}: a ${set.status} set needs its locked record`);
    if (!isObject(set.build)) issues.push(`${at}: build must be {issue, pr, branch}`);
    else {
      if (set.build.issue != null && typeof set.build.issue !== 'number' && typeof set.build.issue !== 'string') issues.push(`${at}: build.issue must be a number, a string or null`);
      for (const key of ['pr', 'branch']) if (set.build[key] != null && typeof set.build[key] !== 'string') issues.push(`${at}: build.${key} must be a string or null`);
    }
    if (!isObject(set.live)) issues.push(`${at}: live must be {commit}`);
    else if (set.live.commit != null && (typeof set.live.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(set.live.commit))) issues.push(`${at}: live.commit must be a commit hash or null`);
  }
  // Waiting cycles.
  const byId = new Map(review.sets.filter(isObject).map((s) => [s.id, s]));
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { issues.push(`review.json: sets wait on each other: ${[...trail, id].join(' -> ')}`); return; }
    state.set(id, 1);
    for (const dep of byId.get(id)?.waits_on ?? []) if (byId.has(dep)) visit(dep, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);
  return [...new Set(issues)];
}

const reviewFile = (projectRoot) => path.join(projectRoot, 'review.json');

/** Reads and validates <project>/review.json; a missing file is an empty record. */
export async function readReview(projectRoot) {
  let review;
  try { review = JSON.parse(await fs.readFile(reviewFile(projectRoot), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schema: REVIEW_SCHEMA, sets: [] }; throw error; }
  const issues = validateReview(review);
  if (issues.length) throw new Error(issues.join('\n'));
  return review;
}

/** Validates and writes review.json (2-space JSON, sets in their order). */
export async function writeReview(projectRoot, review) {
  const issues = validateReview(review);
  if (issues.length) throw new Error(issues.join('\n'));
  await writeIfChanged(reviewFile(projectRoot), stableJson(review));
}

function findSet(review, id) {
  const set = review.sets.find((s) => s.id === id);
  if (!set) throw new Error(`No review set ${id}`);
  return set;
}

/** Adds a set. Locked, building, live and archived are reached through lock, status and archive. */
export function createSet(review, fields) {
  if (review.sets.some((s) => s.id === fields.id)) throw new Error(`Review set ${fields.id} already exists`);
  const set = newSet(fields);
  if (['locked', 'building', 'live', 'archived'].includes(set.status)) throw new Error(`A new set cannot start as ${set.status}`);
  const next = { ...review, sets: [...review.sets, set] };
  const issues = validateReview(next);
  if (issues.length) throw new Error(issues.join('\n'));
  return next;
}

/**
 * Sets a set's status. Locking goes through lockSet and archiving through archiveSet. building and live need the
 * set to be locked first; build fields ({issue, pr, branch}) and live.commit can be given with them.
 */
export function setStatus(review, id, status, { build, commit } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}; one of ${STATUSES.join(', ')}`);
  if (status === 'locked') throw new Error('Lock a set with the lock command, which records the date, the words and the harness');
  if (status === 'archived') throw new Error('Archive a set with the archive command, which keeps its boards as pictures');
  const next = structuredClone(review);
  const set = findSet(next, id);
  if (['building', 'live'].includes(status) && !set.locked) throw new Error(`${id} is not locked`);
  if (['exploring', 'ready', 'waiting', 'next', 'later'].includes(status) && set.locked) set.locked = null;
  set.status = status;
  if (build) Object.assign(set.build, Object.fromEntries(Object.entries(build).filter(([, v]) => v !== undefined)));
  if (commit !== undefined) set.live.commit = commit;
  const issues = validateReview(next);
  if (issues.length) throw new Error(issues.join('\n'));
  return next;
}

/** Every set id a set waits on, directly or through others. */
export function waitsOnAll(review, id) {
  const out = [];
  const walk = (sid) => {
    for (const dep of findSet(review, sid).waits_on) if (!out.includes(dep)) { out.push(dep); walk(dep); }
  };
  walk(id);
  return out;
}

/** Locked sets that wait on a set, directly or through others: they are built with it, in its pull request. */
export function builtWith(review, id) {
  return review.sets.filter((s) => s.id !== id && s.status === 'locked' && waitsOnAll(review, s.id).includes(id)).map((s) => s.id);
}

/** The project's app canvas id: the one canvas whose ws.group is "app". */
export async function appCanvasId(projectRoot) {
  const config = await readConfig(projectRoot);
  const canvases = await projectCanvases(projectRoot, config);
  const apps = [];
  for (const [id, dir] of Object.entries(canvases)) if ((await readCanvas(dir)).ws?.group === 'app') apps.push(id);
  if (apps.length !== 1) throw new Error(apps.length ? `More than one app canvas (${apps.join(', ')}): name one with --canvas` : 'No canvas has ws.group "app": name one with --canvas');
  return apps[0];
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Not a PNG');
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

/**
 * The render of each board: the render report entry, checked against the board's current source. Throws when a board
 * has no render, changed since it, or (with requireOk) failed it: run the render check first.
 */
export async function renders({ projectRoot, canvasId, files, renderOut, requireOk }) {
  const config = await readConfig(projectRoot);
  const canvasDir = (await projectCanvases(projectRoot, config))[canvasId];
  if (!canvasDir) throw new Error(`No canvas ${canvasId}`);
  const canvas = await readCanvas(canvasDir);
  const outDir = path.resolve(renderOut ?? path.join(projectRoot, '.canvas', 'render'));
  const report = await readRenderReport(outDir, canvasId);
  const problems = [];
  const found = [];
  for (const file of files) {
    if (!canvas.boards[file]) { problems.push(`${file} is not a board on ${canvasId}`); continue; }
    const result = report?.results.find((r) => r.file === file);
    if (!result) { problems.push(`${file} has no render: run the render check on ${canvasId}`); continue; }
    const source = await fs.readFile(path.join(canvasDir, 'project', file), 'utf8').catch(() => null);
    if (source == null || hashOf(source) !== result.hash) { problems.push(`${file} changed since its render: run the render check again`); continue; }
    if (!result.variants?.length) { problems.push(`${file} has no rendered picture: run the render check on ${canvasId}`); continue; }
    if (requireOk && !result.ok) { problems.push(`${file} failed the render check: ${result.variants.flatMap((v) => v.problems).slice(0, 3).join('; ')}`); continue; }
    const variants = [];
    for (const v of result.variants) {
      const shot = path.join(outDir, canvasId, v.screenshot);
      try { await fs.access(shot); variants.push({ ...v, file: shot }); } catch { problems.push(`${file}: the ${v.name} picture is missing from ${outDir}`); }
    }
    found.push({ file, board: canvas.boards[file], source, variants });
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return { canvasDir, canvas, found };
}

const today = () => new Date().toISOString().slice(0, 10);

// Pictures in reading order: the light (or only) theme first, then dark, then the rest.
const rank = (name) => (name === 'light' || name === 'default' ? 0 : name.startsWith('light') ? 1 : name === 'dark' ? 2 : 3);
export const byTheme = (variants) => [...variants].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
const stem = (file) => file.replace(/\.dc\.html$/, '');

/** The build brief's Markdown (contract 5 sections, in order). */
export function briefMarkdown({ set, review, canvasId, boards, pieces = [] }) {
  const title = (id) => review.sets.find((s) => s.id === id)?.title || id;
  const status = (id) => review.sets.find((s) => s.id === id)?.status ?? 'unknown';
  const lines = [`# ${set.title || set.id}`, ''];
  lines.push(`Set \`${set.id}\` on page \`${set.page}\`, locked on ${set.locked.date} (${set.locked.harness}): “${set.locked.words}”`, '');
  lines.push('## What changes', '');
  if (set.question) lines.push(`Question: ${set.question}`, '');
  if (set.lead) lines.push(`Lead: ${set.lead}`, '');
  if (set.replaces.length) lines.push(`Replaces: ${set.replaces.map((r) => `${title(r)} (\`${r}\`)`).join(', ')}.`, '');
  lines.push('## Lead boards', '');
  for (const b of boards) {
    const link = viewerLink({ canvas: canvasId, page: b.board.page ?? null, board: b.file });
    lines.push(`### ${b.board.title ?? stem(b.file)}`, '', `Viewer link: \`${link}\``, '');
    for (const v of b.pictures) lines.push(`![${b.board.title ?? stem(b.file)}, ${v.name}](${v.path})`, '');
  }
  lines.push('## Pieces', '');
  // The kit's Root only frames a board (theme, contrast), so it is not a piece of the change.
  const components = [...new Set(boards.flatMap((b) => [...b.source.matchAll(/component-from-global-scope="([^"]+)"/g)].map((m) => m[1])))].filter((c) => !/^[^.]+\.Root$/.test(c)).sort();
  const sources = [...new Set(boards.flatMap((b) => [...b.source.matchAll(/data-source="([^"]+)"/g)].map((m) => m[1])))].sort();
  for (const p of pieces) lines.push(`- ${p}`);
  if (components.length) lines.push(`- Kit components on the lead boards: ${components.map((c) => `\`${c}\``).join(', ')}`);
  if (sources.length) lines.push(`- Sources the lead boards show: ${sources.map((s) => `\`${s}\``).join(', ')}`);
  if (!pieces.length && !components.length && !sources.length) lines.push('- The lead boards name no kit components or sources.');
  lines.push('', '## Waits on', '');
  const deps = set.waits_on;
  const with_ = builtWith(review, set.id);
  if (!deps.length && !with_.length) lines.push('Nothing.');
  for (const dep of deps) {
    const s = status(dep);
    const note = s === 'live' ? 'already live' : ['locked', 'building'].includes(s) ? `built in the same pull request as \`${dep}\`` : `not locked yet (${s}); this build waits for it and is built with it`;
    lines.push(`- ${title(dep)} (\`${dep}\`): ${note}.`);
  }
  for (const id of with_) lines.push(`- Built with this set, in the same pull request: ${title(id)} (\`${id}\`, builds/${id}.md).`);
  lines.push('', '## Acceptance', '');
  lines.push('- After the build merges and the kit syncs, the Live boards match the lead boards above.');
  lines.push(`- The render check passes on the Live boards of page \`${set.page}\`.`);
  lines.push('', '## Out of bounds', '');
  lines.push('- No database, API or permission change. A lock that needs one stops and goes back as product work.');
  lines.push('');
  return lines.join('\n');
}

/**
 * Locks a set: records the date, the decision-maker's words and the harness, and writes builds/<set>.md with its lead boards'
 * pictures (copied from the render check into builds/<set>/). Every lead board must have passed the render check
 * at its current source. Returns {review, brief, pictures, buildNow, builtWith, waitsFor, joins}.
 */
export async function lockSet(projectRoot, id, { words, harness, date = today(), pieces = [], canvas, renderOut } = {}) {
  const root = path.resolve(projectRoot);
  const review = await readReview(root);
  const set = findSet(review, id);
  if (!words || !String(words).trim()) throw new Error('A lock needs the decision-maker\'s words');
  if (!HARNESSES.includes(harness)) throw new Error(`A lock needs the harness: ${HARNESSES.join(' or ')}`);
  if (!DATE.test(date)) throw new Error('The lock date must be YYYY-MM-DD');
  if (['locked', 'building', 'live', 'archived'].includes(set.status)) throw new Error(`${id} is already ${set.status}`);
  if (!set.boards.length) throw new Error(`${id} has no lead boards to build from`);
  const canvasId = canvas ?? (await appCanvasId(root));
  const { found } = await renders({ projectRoot: root, canvasId, files: set.boards, renderOut, requireOk: true });
  const next = structuredClone(review);
  const locked = findSet(next, id);
  locked.status = 'locked';
  locked.locked = { date, words: String(words), harness };
  const pictureDir = path.join(root, 'builds', id);
  await fs.rm(pictureDir, { recursive: true, force: true });
  await fs.mkdir(pictureDir, { recursive: true });
  const boards = [];
  const pictures = [];
  for (const b of found) {
    const list = [];
    for (const v of byTheme(b.variants)) {
      const name = `${stem(b.file)}.${v.name}.png`;
      await fs.copyFile(v.file, path.join(pictureDir, name));
      list.push({ name: v.name, path: `${id}/${name}` });
      pictures.push(path.join(pictureDir, name));
    }
    boards.push({ ...b, pictures: list });
  }
  const brief = path.join(root, 'builds', `${id}.md`);
  await fs.writeFile(brief, briefMarkdown({ set: locked, review: next, canvasId, boards, pieces }));
  await writeReview(root, next);
  const waitsFor = waitsOnAll(next, id).filter((dep) => findSet(next, dep).status !== 'live');
  // Dependencies already locked or building: this set joins their build now, in the same pull request.
  const joins = waitsFor.filter((dep) => ['locked', 'building'].includes(findSet(next, dep).status));
  return { review: next, brief, pictures, buildNow: waitsFor.length === 0, builtWith: builtWith(next, id), waitsFor, joins };
}

// ---------- archive ----------

export const ARCHIVE_SCHEMA = 'canvas-archive/1';

async function readArchive(archiveDir) {
  try {
    const record = JSON.parse(await fs.readFile(path.join(archiveDir, 'tools', 'archive.json'), 'utf8'));
    if (record.schema !== ARCHIVE_SCHEMA || !Array.isArray(record.entries)) throw new Error(`${archiveDir}/tools/archive.json is not ${ARCHIVE_SCHEMA}`);
    return record;
  } catch (error) {
    if (error.code === 'ENOENT') return { schema: ARCHIVE_SCHEMA, title: 'Archive', entries: [] };
    throw error;
  }
}

/**
 * A picture board: a board kept as its rendered picture, with where its source is kept. `b` is {file, title, image, w, h,
 * source}, as archive entries and exploration rounds record them. Used by the archive canvas and exploration canvases.
 */
export function pictureBoard(b, { file, where, set, row }) {
  return {
    file,
    title: b.title,
    w: Math.max(480, b.w + 64),
    h: b.h + 200,
    shell: {
      kind: 'archived', set, row, where, attrs: { was: b.file },
      css: '.archive-picture{display:block;max-width:100%;height:auto}',
      body: `<img class="archive-picture" src="${escapeHtml(b.image)}" width="${b.w}" height="${b.h}" alt="${escapeHtml(b.title)}, as it was">`,
      foot: [['Source', `<code>${escapeHtml(b.source)}</code>`]],
    },
  };
}

/** The archive canvas's spec, from its record: a page per app page, each entry a row of picture boards. */
export function archiveSpec(record, pageNames = {}) {
  const pages = [];
  const byPage = new Map();
  for (const entry of record.entries) {
    if (!byPage.has(entry.page)) byPage.set(entry.page, []);
    byPage.get(entry.page).push(entry);
  }
  const startBody = record.entries.length
    ? `<ul class="archive-list">${[...record.entries].reverse().map((e) => `<li data-canvas-id="entry-${escapeHtml(e.id)}"><b>${escapeHtml(e.date)}</b> ${escapeHtml(e.title)} (${e.boards.length} ${e.boards.length === 1 ? 'board' : 'boards'})${e.why ? `: ${escapeHtml(e.why)}` : ''}</li>`).join('')}</ul>`
    : '<p>Nothing archived yet.</p>';
  pages.push({
    id: 'start', name: 'Start here',
    boards: [{ file: 'Start.dc.html', title: record.title ?? 'Archive', w: 1600, h: 400, shell: { kind: 'page', page: 'start', summary: 'Designs that were replaced or set aside, kept as pictures. Their source files are in source/.', body: startBody } }],
  });
  for (const [page, entries] of byPage) {
    pages.push({
      id: page,
      name: pageNames[page] ?? page,
      rows: entries.map((e) => ({
        id: `e-${e.id}`.replace(/[^A-Za-z0-9._-]/g, '-'),
        name: `${e.title} · ${e.date}`,
        summary: [e.why, e.question ? `Question: ${e.question}` : '', e.lead ? `Lead: ${e.lead}` : ''].filter(Boolean).join(' '),
        boards: e.boards.map((b) => ({
          ...pictureBoard(b, { file: `X_${e.id}_${stem(b.file)}.dc.html`.replace(/[^A-Za-z0-9._-]/g, '-'), where: `${e.title} · archived ${e.date}`, set: e.set }),
          ws: { set: e.set },
        })),
      })),
    });
  }
  return { title: record.title ?? 'Archive', ws: { group: 'archive' }, launch: { view: 'canvas', page: 'start' }, pages };
}

/**
 * Archives a set's boards (or the named ones) as pictures on the archive canvas, keeping their source: pictures go to
 * <archive>/project/assets/<entry>/, source boards to <archive>/source/<entry>/, the entry to <archive>/tools/archive.json,
 * and the archive canvas is rebuilt. The set becomes archived. Needs a render of each board at its current source.
 */
export async function archiveSet(projectRoot, id, { boards: only, why = '', date = today(), canvas, archive, renderOut } = {}) {
  const root = path.resolve(projectRoot);
  const review = await readReview(root);
  const set = findSet(review, id);
  if (set.status === 'archived') throw new Error(`${id} is already archived`);
  const files = only?.length ? only.map((b) => (b.endsWith('.dc.html') ? b : `${b}.dc.html`)) : set.boards;
  if (!files.length) throw new Error(`${id} has no boards to archive`);
  if (!DATE.test(date)) throw new Error('The archive date must be YYYY-MM-DD');
  const canvasId = canvas ?? (await appCanvasId(root));
  const { canvas: source, canvasDir, found } = await renders({ projectRoot: root, canvasId, files, renderOut, requireOk: false });
  const config = await readConfig(root);
  const archiveId = archive ?? 'archive';
  if (!ID.test(archiveId)) throw new Error(`The archive canvas id ${archiveId} must be link-safe`);
  const archiveDir = path.join(path.resolve(root, config.canvases), archiveId);
  const record = await readArchive(archiveDir);
  let entryId = `${date}-${id}`;
  for (let n = 2; record.entries.some((e) => e.id === entryId); n += 1) entryId = `${date}-${id}-${n}`;
  const entry = { id: entryId, date, set: id, title: set.title || id, question: set.question, lead: set.lead, page: set.page, why, boards: [] };
  const pictures = [];
  for (const b of found) {
    const picture = byTheme(b.variants)[0];
    const buffer = await fs.readFile(picture.file);
    const { w, h } = pngSize(buffer);
    const image = `assets/${entryId}/${stem(b.file)}.png`;
    const sourcePath = `source/${entryId}/${b.file}`;
    pictures.push({ buffer, image, sourcePath, file: b.file });
    entry.boards.push({ file: b.file, title: b.board.title ?? stem(b.file), image, w, h, source: sourcePath, from: canvasId });
  }
  const nextRecord = { ...record, entries: [...record.entries, entry] };
  const pageNames = Object.fromEntries((source.pages ?? []).map((p) => [p.id, p.name]));
  const spec = archiveSpec(nextRecord, pageNames);
  // Every check before anything is written, so a refusal (a frozen archive, a hand board in the way) leaves no trace.
  await buildCanvas({ canvasDir: archiveDir, spec, dryRun: true });
  for (const p of pictures) {
    await fs.mkdir(path.join(archiveDir, 'project', 'assets', entryId), { recursive: true });
    await fs.mkdir(path.join(archiveDir, 'source', entryId), { recursive: true });
    await fs.writeFile(path.join(archiveDir, 'project', p.image), p.buffer);
    await fs.copyFile(path.join(canvasDir, 'project', p.file), path.join(archiveDir, p.sourcePath));
  }
  await fs.mkdir(path.join(archiveDir, 'tools'), { recursive: true });
  await fs.writeFile(path.join(archiveDir, 'tools', 'archive.json'), stableJson(nextRecord));
  const built = await buildCanvas({ canvasDir: archiveDir, spec });
  const next = structuredClone(review);
  const archived = findSet(next, id);
  archived.status = 'archived';
  await writeReview(root, next);
  return { review: next, entry, archive: archiveId, built };
}

/**
 * Rows for one app canvas page, from the review sets (contract 5 status-to-row mapping). `boardsFor(set)` gives each
 * set's boards as builder board specs. Live, archived sets are left out: live sets show through the Live boards after a
 * sync, archived ones on the archive canvas. Returns builder rows in order Live, Deciding, Building, Next, Later.
 */
export function appPageRows({ page, review, live = [], boardsFor, names = {} }) {
  const rows = [];
  const sets = review.sets.filter((s) => s.page === page);
  const label = { live: 'Live', deciding: 'Deciding', building: 'Building', next: 'Next', later: 'Later', ...names };
  rows.push({ id: 'live', name: label.live, boards: live });
  for (const row of ['deciding', 'building', 'next', 'later']) {
    rows.push({ id: row, name: label[row], sets: sets.filter((s) => statusRow(s.status) === row).map((set) => ({ set, boards: boardsFor(set) })) });
  }
  return rows;
}

