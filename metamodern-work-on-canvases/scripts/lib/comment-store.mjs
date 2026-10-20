// Comment files and batches (contract 4, references/comments.md). One annotation per file in Agentation's annotation
// format (AFS 1.1) with our extension under `canvas`; batches bundle every open comment for an agent. The viewer and
// the agent command line both read and write through this module. Node built-ins only.
//
//   <project>/comments/<canvas>/<id>.json      one comment
//   <project>/comments/batches/<batchId>.json  one batch
//
// Every write replaces the file atomically (a temporary file renamed over it) under a short lock, so the viewer and an
// agent can write the same comment at once without losing either change.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const COMMENT_SCHEMA = 'canvas-comment/1';
export const BATCH_SCHEMA = 'canvas-batch/1';
export const COMMENT_ID = /^c_\d{8}_[0-9a-z]{6}$/;
export const BATCH_ID = /^b_\d{8}_[0-9a-z]{6}$/;
export const STATUSES = ['pending', 'acknowledged', 'resolved', 'dismissed'];
export const BATCH_STATUSES = ['sent', 'taken', 'done'];
export const KINDS = ['element', 'area', 'board'];
export const LABEL_KINDS = ['canvas-id', 'kit-component', 'test-id', 'path'];
const INTENTS = ['fix', 'change', 'question', 'approve'];
const SEVERITIES = ['blocking', 'important', 'suggestion'];
const CANVAS_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCK_WAIT_MS = 5000;
const LOCK_STALE_MS = 10000;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (n) => Math.round(n * 100) / 100;

export const commentsRoot = (projectRoot) => path.join(path.resolve(projectRoot), 'comments');
export const batchesDir = (projectRoot) => path.join(commentsRoot(projectRoot), 'batches');
export const commentFile = (projectRoot, canvas, id) => path.join(commentsRoot(projectRoot), canvas, `${id}.json`);
export const batchFile = (projectRoot, id) => path.join(batchesDir(projectRoot), `${id}.json`);

/** `c_<yyyymmdd>_<6 base36>` (or `b_` for a batch), from the local date. */
export function newId(prefix, date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const bytes = crypto.randomBytes(6);
  let tail = '';
  for (const b of bytes) tail += (b % 36).toString(36);
  return `${prefix}_${ymd}_${tail}`;
}

// ---------------------------------------------------------------- files

/** Writes JSON (two-space, trailing newline) by renaming a temporary file over the target. */
export async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try { await fsp.rename(tmp, file); } catch (error) { await fsp.rm(tmp, { force: true }); throw error; }
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

/** Runs fn while holding <target>.lock (a directory, created atomically). A lock older than 10 s is taken over. */
export async function withLock(target, fn) {
  const lock = `${target}.lock`;
  await fsp.mkdir(path.dirname(lock), { recursive: true });
  const start = Date.now();
  for (;;) {
    try { await fsp.mkdir(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = await fsp.stat(lock);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) { await fsp.rm(lock, { recursive: true, force: true }); continue; }
      } catch { continue; }
      if (Date.now() - start > LOCK_WAIT_MS) throw new Error(`${path.basename(target)} is locked by another writer`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  try { return await fn(); } finally { await fsp.rm(lock, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- validation

function checkRect(rect, where, issues) {
  if (!isObject(rect) || !['x', 'y', 'w', 'h'].every((k) => isNumber(rect[k]))) issues.push(`${where} must be {x, y, w, h} numbers`);
}

/** Issues with one comment against AFS 1.1 and the canvas extension; empty when it is valid. */
export function validateComment(c) {
  const issues = [];
  if (!isObject(c)) return ['a comment must be an object'];
  // AFS 1.1 required fields.
  for (const k of ['id', 'comment', 'elementPath', 'element']) if (typeof c[k] !== 'string') issues.push(`${k} must be a string`);
  for (const k of ['timestamp', 'x', 'y']) if (!isNumber(c[k])) issues.push(`${k} must be a number`);
  if (typeof c.id === 'string' && !COMMENT_ID.test(c.id)) issues.push('id must be c_<yyyymmdd>_<6 base36>');
  if (typeof c.comment === 'string' && !c.comment.trim()) issues.push('comment must not be empty');
  // AFS 1.1 optional fields we use.
  if (c.boundingBox !== undefined && !(isObject(c.boundingBox) && ['x', 'y', 'width', 'height'].every((k) => isNumber(c.boundingBox[k])))) issues.push('boundingBox must be {x, y, width, height} numbers');
  for (const k of ['reactComponents', 'nearbyText', 'resolvedAt', 'url']) if (c[k] !== undefined && typeof c[k] !== 'string') issues.push(`${k} must be a string`);
  if (c.attributes !== undefined && !(isObject(c.attributes) && Object.values(c.attributes).every((v) => typeof v === 'string'))) issues.push('attributes must map names to strings');
  if (c.intent !== undefined && !INTENTS.includes(c.intent)) issues.push(`intent must be one of ${INTENTS.join(', ')}`);
  if (c.severity !== undefined && !SEVERITIES.includes(c.severity)) issues.push(`severity must be one of ${SEVERITIES.join(', ')}`);
  if (!STATUSES.includes(c.status)) issues.push(`status must be one of ${STATUSES.join(', ')}`);
  if (c.resolvedBy !== undefined && !['human', 'agent'].includes(c.resolvedBy)) issues.push('resolvedBy must be human or agent');
  if (c.status === 'resolved' && (typeof c.resolvedAt !== 'string' || c.resolvedBy !== 'human')) issues.push('a resolved comment has resolvedAt and resolvedBy "human"');
  if (!Array.isArray(c.thread)) issues.push('thread must be an array');
  else c.thread.forEach((m, i) => {
    if (!isObject(m) || typeof m.id !== 'string' || !['human', 'agent'].includes(m.role) || typeof m.content !== 'string' || !isNumber(m.timestamp)) {
      issues.push(`thread[${i}] must be {id, role: human | agent, content, timestamp}`);
    }
  });
  // The canvas extension.
  const x = c.canvas;
  if (!isObject(x)) { issues.push('canvas must be an object'); return issues; }
  if (x.schema !== COMMENT_SCHEMA) issues.push(`canvas.schema must be ${COMMENT_SCHEMA}`);
  if (typeof x.canvas !== 'string' || !CANVAS_ID.test(x.canvas)) issues.push('canvas.canvas must be a canvas id');
  if (typeof x.page !== 'string' || !x.page) issues.push('canvas.page must be a page id (- for a canvas without pages)');
  if (typeof x.board !== 'string' || !x.board || x.board.endsWith('.dc.html')) issues.push('canvas.board must be the board file without .dc.html');
  if (!KINDS.includes(x.kind)) issues.push(`canvas.kind must be one of ${KINDS.join(', ')}`);
  if (x.kind === 'element') {
    if (typeof x.label !== 'string' || !x.label) issues.push('canvas.label must be a string for an element comment');
    if (!LABEL_KINDS.includes(x.labelKind)) issues.push(`canvas.labelKind must be one of ${LABEL_KINDS.join(', ')}`);
  } else if (x.label !== null || x.labelKind !== null) {
    issues.push('canvas.label and canvas.labelKind are null for an area or board comment');
  }
  checkRect(x.rect, 'canvas.rect', issues);
  if (!isObject(x.kit) || !['pinned', 'live'].includes(x.kit.mode) || !(x.kit.ref === null || typeof x.kit.ref === 'string') || !(x.kit.version === null || typeof x.kit.version === 'string')) {
    issues.push('canvas.kit must be {mode: pinned | live, ref, version}');
  }
  if (!isObject(x.props)) issues.push('canvas.props must be an object');
  if (typeof x.moved !== 'boolean') issues.push('canvas.moved must be a boolean');
  if (!(x.batch === null || (typeof x.batch === 'string' && BATCH_ID.test(x.batch)))) issues.push('canvas.batch must be a batch id or null');
  if (x.text !== undefined && typeof x.text !== 'string') issues.push('canvas.text must be a string');
  return issues;
}

export function validateBatch(b) {
  const issues = [];
  if (!isObject(b)) return ['a batch must be an object'];
  if (b.schema !== BATCH_SCHEMA) issues.push(`schema must be ${BATCH_SCHEMA}`);
  if (typeof b.id !== 'string' || !BATCH_ID.test(b.id)) issues.push('id must be b_<yyyymmdd>_<6 base36>');
  if (typeof b.createdAt !== 'string' || Number.isNaN(Date.parse(b.createdAt))) issues.push('createdAt must be an ISO time');
  if (!Array.isArray(b.comments) || !b.comments.every((id) => typeof id === 'string' && COMMENT_ID.test(id))) issues.push('comments must be comment ids');
  if (!BATCH_STATUSES.includes(b.status)) issues.push(`status must be one of ${BATCH_STATUSES.join(', ')}`);
  if (!(b.takenBy === null || typeof b.takenBy === 'string')) issues.push('takenBy must be a string or null');
  return issues;
}

// ---------------------------------------------------------------- reading

async function listDir(dir) {
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
}

/** Every valid comment in the project, oldest first. Files that are not valid comments are reported in problems, never dropped silently. */
export async function readComments(projectRoot) {
  const root = commentsRoot(projectRoot);
  const comments = [];
  const problems = [];
  for (const entry of await listDir(root)) {
    if (!entry.isDirectory() || entry.name === 'batches' || !CANVAS_ID.test(entry.name)) continue;
    for (const f of await listDir(path.join(root, entry.name))) {
      if (!f.isFile() || !/^c_.*\.json$/.test(f.name)) continue;
      const file = path.join(root, entry.name, f.name);
      try {
        const c = await readJson(file);
        const issues = validateComment(c);
        if (c?.id !== f.name.slice(0, -5)) issues.push('the file name is not the comment id');
        if (c?.canvas?.canvas !== entry.name) issues.push('the folder is not the comment\'s canvas');
        // A file that is not a valid comment is reported in problems and left on disk, never handed on half-read.
        if (issues.length) problems.push({ file: path.relative(path.resolve(projectRoot), file), issues });
        else comments.push(c);
      } catch (error) {
        problems.push({ file: path.relative(path.resolve(projectRoot), file), issues: [`not readable JSON: ${error.message}`] });
      }
    }
  }
  comments.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || String(a.id).localeCompare(String(b.id)));
  return { comments, problems };
}

/** One comment by id, from any canvas folder. */
export async function findComment(projectRoot, id) {
  if (!COMMENT_ID.test(id)) throw new Error(`${id} is not a comment id (c_<yyyymmdd>_<6 base36>)`);
  for (const entry of await listDir(commentsRoot(projectRoot))) {
    if (!entry.isDirectory() || entry.name === 'batches') continue;
    const file = path.join(commentsRoot(projectRoot), entry.name, `${id}.json`);
    if (fs.existsSync(file)) return { file, comment: await readJson(file) };
  }
  throw new Error(`No comment ${id}`);
}

/** Every batch, oldest first. */
export async function readBatches(projectRoot) {
  const out = [];
  for (const f of await listDir(batchesDir(projectRoot))) {
    if (!f.isFile() || !/^b_.*\.json$/.test(f.name)) continue;
    try { out.push(await readJson(path.join(batchesDir(projectRoot), f.name))); } catch { /* being replaced; the next read sees it */ }
  }
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  return out;
}

export async function readBatch(projectRoot, id) {
  if (!BATCH_ID.test(id)) throw new Error(`${id} is not a batch id (b_<yyyymmdd>_<6 base36>)`);
  try { return await readJson(batchFile(projectRoot, id)); } catch { throw new Error(`No batch ${id}`); }
}

// ---------------------------------------------------------------- writing comments

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/**
 * Makes and writes a new comment. `input`: {canvas, page, board, kind, comment, rect, boardWidth, label?, labelKind?,
 * elementPath?, element?, text?, nearbyText?, reactComponents?, attributes?, kit, props, intent?, severity?, url?}.
 */
export async function createComment(projectRoot, input, { now = Date.now() } = {}) {
  const kind = input.kind ?? 'element';
  const rect = input.rect;
  const width = Number(input.boardWidth) > 0 ? Number(input.boardWidth) : null;
  const c = {
    id: newId('c', new Date(now)),
    comment: String(input.comment ?? '').trim(),
    elementPath: kind === 'element' ? String(input.elementPath ?? '') : 'body',
    timestamp: now,
    x: isObject(rect) && width ? round((rect.x / width) * 100) : 0,
    y: isObject(rect) ? round(rect.y) : 0,
    element: kind === 'element' ? String(input.element ?? '') : kind,
    ...(isObject(rect) ? { boundingBox: { x: round(rect.x), y: round(rect.y), width: round(rect.w), height: round(rect.h) } } : {}),
    ...pick(input, ['url', 'reactComponents', 'nearbyText', 'attributes', 'intent', 'severity']),
    status: 'pending',
    thread: [],
    canvas: {
      schema: COMMENT_SCHEMA,
      canvas: input.canvas,
      page: input.page,
      board: input.board,
      kind,
      label: kind === 'element' ? input.label ?? null : null,
      labelKind: kind === 'element' ? input.labelKind ?? null : null,
      rect: isObject(rect) ? { x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h) } : rect,
      kit: isObject(input.kit) ? { mode: input.kit.mode === 'live' ? 'live' : 'pinned', ref: input.kit.ref ?? null, version: input.kit.version ?? null } : input.kit,
      props: isObject(input.props) ? Object.fromEntries(Object.entries(input.props).filter(([k]) => !k.startsWith('$'))) : input.props,
      moved: false,
      batch: null,
      ...(kind === 'element' && typeof input.text === 'string' ? { text: input.text } : {}),
    },
  };
  const issues = validateComment(c);
  if (issues.length) throw new Error(`The comment is not valid: ${issues.join('; ')}`);
  await writeJsonAtomic(commentFile(projectRoot, c.canvas.canvas, c.id), c);
  return c;
}

/** Changes one comment under its lock: fn(comment) returns the new comment (validated before it is written). */
export async function updateComment(projectRoot, id, fn) {
  const { file } = await findComment(projectRoot, id);
  return withLock(file, async () => {
    const current = await readJson(file);
    const next = await fn(structuredClone(current));
    if (next === undefined || JSON.stringify(next) === JSON.stringify(current)) return current;
    const issues = validateComment(next);
    if (issues.length) throw new Error(`The comment would not be valid: ${issues.join('; ')}`);
    await writeJsonAtomic(file, next);
    return next;
  });
}

const message = (role, content, now) => ({ id: `m_${now.toString(36)}_${crypto.randomBytes(3).toString('hex')}`, role, content, timestamp: now });

/**
 * A reply in a comment's thread.
 *   agent: adds the message; with `addressed`, the comment becomes acknowledged (a resolved comment stays resolved:
 *          only a person resolves or reopens).
 *   human: adds the message; an acknowledged or resolved comment is reopened (pending again).
 */
export async function replyToComment(projectRoot, id, { role, content, addressed = false, now = Date.now() }) {
  if (!['human', 'agent'].includes(role)) throw new Error('role must be human or agent');
  const text = String(content ?? '').trim();
  if (!text) throw new Error('A reply needs some text');
  return updateComment(projectRoot, id, (c) => {
    if (role === 'agent' && addressed && c.status === 'resolved') throw new Error(`${id} is resolved; only a person reopens it`);
    c.thread.push(message(role, text, now));
    if (role === 'agent' && addressed) c.status = 'acknowledged';
    if (role === 'human' && (c.status === 'acknowledged' || c.status === 'resolved' || c.status === 'dismissed')) {
      c.status = 'pending';
      delete c.resolvedAt;
      delete c.resolvedBy;
    }
    return c;
  });
}

/** Resolves a comment. Only the viewer calls this: a person resolves, never an agent. */
export async function resolveComment(projectRoot, id, { now = Date.now() } = {}) {
  return updateComment(projectRoot, id, (c) => {
    if (c.status === 'resolved') return c;
    c.status = 'resolved';
    c.resolvedAt = new Date(now).toISOString();
    c.resolvedBy = 'human';
    return c;
  });
}

/** Records where a comment's element is now ({rect}) or that it is gone ({moved: true}); writes only on a change. */
export async function placeComment(projectRoot, id, { rect, moved, boardWidth }) {
  return updateComment(projectRoot, id, (c) => {
    if (moved) { c.canvas.moved = true; return c; }
    if (!isObject(rect) || !['x', 'y', 'w', 'h'].every((k) => isNumber(rect[k]))) throw new Error('rect must be {x, y, w, h}');
    const r = { x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h) };
    const same = ['x', 'y', 'w', 'h'].every((k) => Math.abs(r[k] - c.canvas.rect[k]) < 0.5);
    if (same && !c.canvas.moved) return c;
    c.canvas.moved = false;
    c.canvas.rect = r;
    c.boundingBox = { x: r.x, y: r.y, width: r.w, height: r.h };
    const width = Number(boardWidth) > 0 ? Number(boardWidth) : null;
    if (width) c.x = round((r.x / width) * 100);
    c.y = r.y;
    return c;
  });
}

// ---------------------------------------------------------------- batches

/**
 * Send all to agent: one batch of every open (pending) comment that is not already in a batch an agent has yet to
 * finish. Each comment records the batch; the batch file is written last, so a listener never reads a batch whose
 * comments do not know it yet. Returns the batch, or null when nothing is open.
 */
export async function sendAll(projectRoot, { now = Date.now() } = {}) {
  return withLock(path.join(batchesDir(projectRoot), 'send'), async () => {
    const batches = new Map((await readBatches(projectRoot)).map((b) => [b.id, b]));
    const { comments } = await readComments(projectRoot);
    const open = comments.filter((c) => c?.status === 'pending' && validateComment(c).length === 0
      && (!c.canvas.batch || !batches.has(c.canvas.batch) || batches.get(c.canvas.batch).status === 'done'));
    if (!open.length) return null;
    const batch = { schema: BATCH_SCHEMA, id: newId('b', new Date(now)), createdAt: new Date(now).toISOString(), comments: open.map((c) => c.id), status: 'sent', takenBy: null };
    for (const c of open) await updateComment(projectRoot, c.id, (x) => { x.canvas.batch = batch.id; return x; });
    await writeJsonAtomic(batchFile(projectRoot, batch.id), batch);
    return batch;
  });
}

async function updateBatch(projectRoot, id, fn) {
  const file = batchFile(projectRoot, id);
  return withLock(file, async () => {
    const current = await readBatch(projectRoot, id);
    const next = fn(structuredClone(current));
    const issues = validateBatch(next);
    if (issues.length) throw new Error(`The batch would not be valid: ${issues.join('; ')}`);
    await writeJsonAtomic(file, next);
    return next;
  });
}

/** An agent takes a sent batch to work through it. */
export async function takeBatch(projectRoot, id, takenBy) {
  return updateBatch(projectRoot, id, (b) => {
    if (b.status === 'done') throw new Error(`${id} is done`);
    if (b.status === 'taken' && b.takenBy !== takenBy) throw new Error(`${id} is taken by ${b.takenBy}`);
    b.status = 'taken';
    b.takenBy = takenBy;
    return b;
  });
}

/** An agent has worked through a batch. */
export async function finishBatch(projectRoot, id) {
  return updateBatch(projectRoot, id, (b) => { b.status = 'done'; return b; });
}

/** A batch with its comments in full, as the command line prints it. */
export async function expandBatch(projectRoot, batch) {
  const { comments } = await readComments(projectRoot);
  const byId = new Map(comments.map((c) => [c.id, c]));
  return { ...batch, annotations: batch.comments.map((id) => byId.get(id)).filter(Boolean) };
}

/**
 * Waits until a batch is sent and returns it (the oldest one still waiting, at once, if there is one). Watches the
 * batches folder, with a poll as a safety net. `timeoutMs` 0 waits for ever; on a timeout it returns null.
 */
export async function waitForBatch(projectRoot, { timeoutMs = 0, pollMs = 1000, signal } = {}) {
  const dir = batchesDir(projectRoot);
  await fsp.mkdir(dir, { recursive: true });
  const waiting = async () => (await readBatches(projectRoot)).find((b) => b.status === 'sent' && validateBatch(b).length === 0) ?? null;
  const first = await waiting();
  if (first) return first;
  return new Promise((resolve, reject) => {
    let done = false;
    let watcher = null;
    let checking = false;
    let again = false;
    const finish = (value, error) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      watcher?.close();
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(value);
    };
    const check = async () => {
      if (done) return;
      if (checking) { again = true; return; }
      checking = true;
      try {
        const b = await waiting();
        if (b) finish(b);
      } catch (error) { finish(null, error); } finally {
        checking = false;
        if (again && !done) { again = false; check(); }
      }
    };
    const onAbort = () => finish(null);
    try { watcher = fs.watch(dir, () => check()); watcher.on('error', () => {}); } catch { /* the poll covers it */ }
    const poll = setInterval(check, pollMs);
    const timer = timeoutMs > 0 ? setTimeout(() => finish(null), timeoutMs) : null;
    signal?.addEventListener('abort', onAbort);
    check();
  });
}
