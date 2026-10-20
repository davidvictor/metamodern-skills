// Comment tests. CM-01 to CM-08 run on Node alone: ids, the AFS 1.1 and canvas extension check, atomic writes and
// locking, state transitions, batches, the command line (wait delivering a batch another process writes) and the
// viewer's comment routes. CM-10 runs the viewer in headless Chromium: pick an element in comment mode, the comment
// file, Send all to agent with a listening command, the agent's reply, resolve and reopen, and re-attachment after
// the board is regenerated (moved in the layout, and removed). It needs the tooling (see canvas-runtime.test.mjs).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { chromium, toolingInstalled } from '../metamodern-work-on-canvases/scripts/tooling.mjs';
import { startViewer } from '../metamodern-work-on-canvases/scripts/lib/viewer-server.mjs';
import {
  BATCH_ID, COMMENT_ID, createComment, findComment, finishBatch, newId, placeComment, readBatch, readBatchReport, readBatches, readComments,
  replyToComment, resolveComment, sendAll, takeBatch, updateComment, validateBatch, validateComment, waitForBatch, withLock, writeJsonAtomic,
} from '../metamodern-work-on-canvases/scripts/lib/comment-store.mjs';
import { main as commentsMain, sessionName } from '../metamodern-work-on-canvases/scripts/comments.mjs';

const PACKAGE = path.resolve('metamodern-work-on-canvases');
const CLI = path.join(PACKAGE, 'scripts', 'canvas.mjs');
const required = process.env.CANVAS_BROWSER_TESTS === 'required';
const available = toolingInstalled();
const skip = !available && !required ? 'canvas tooling is not installed (node metamodern-work-on-canvases/scripts/tooling.mjs install --browser)' : false;

const roots = [];
async function project() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-comments-'));
  roots.push(dir);
  await fs.cp(path.join(PACKAGE, 'assets', 'fixture-project'), dir, { recursive: true });
  return dir;
}
after(async () => { for (const r of roots) await fs.rm(r, { recursive: true, force: true }); });

const ELEMENT = {
  canvas: 'fixture', page: 'language', board: 'basics', kind: 'element', comment: 'Tighten the gap between the buttons.',
  rect: { x: 120, y: 80, w: 96, h: 32 }, boardWidth: 1200, label: 'buttons/Button[1]', labelKind: 'kit-component',
  elementPath: 'body > div:nth-of-type(1) > button:nth-of-type(1)', element: 'Button', text: 'Save changes', nearbyText: 'Save changes',
  reactComponents: 'Root > Button', kit: { mode: 'pinned', ref: 'a'.repeat(40), version: '1.0.0' }, props: { theme: 'dark', $preview: { width: 1 } },
};

/**
 * Runs the command line in its own process. The promise has `waiting`, which settles once `comments wait` says it is
 * listening (or the process ends).
 */
function cli(args, { cwd } = {}) {
  let heard;
  const waiting = new Promise((resolve) => { heard = resolve; });
  const done = new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, CANVAS_SESSION: 'test/session' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; if (stderr.includes('Waiting for a batch.')) heard(); });
    child.on('close', (code) => { heard(); resolve({ code, stdout, stderr, at: Date.now() }); });
  });
  done.waiting = waiting;
  return done;
}

test('CM-01 ids follow c_<yyyymmdd>_<6 base36> and b_<yyyymmdd>_<6 base36>', () => {
  const c = newId('c', new Date(2026, 9, 20));
  assert.match(c, /^c_20261020_[0-9a-z]{6}$/);
  assert.match(newId('b'), BATCH_ID);
  assert.match(c, COMMENT_ID);
  assert.notEqual(newId('c'), newId('c'));
});

test('CM-02 a new comment is valid AFS 1.1 with the canvas extension, one file per comment', async () => {
  const root = await project();
  const c = await createComment(root, ELEMENT, { now: Date.UTC(2026, 9, 20, 12) });
  assert.deepEqual(validateComment(c), []);
  // AFS 1.1 required fields, with x as percent of the board width and y in px from the board top.
  for (const k of ['id', 'comment', 'elementPath', 'timestamp', 'x', 'y', 'element']) assert.ok(k in c, k);
  assert.equal(c.x, 10);
  assert.equal(c.y, 80);
  assert.deepEqual(c.boundingBox, { x: 120, y: 80, width: 96, height: 32 });
  assert.equal(c.status, 'pending');
  assert.equal(c.reactComponents, 'Root > Button');
  assert.deepEqual(c.canvas, {
    schema: 'canvas-comment/1', canvas: 'fixture', page: 'language', board: 'basics', kind: 'element', label: 'buttons/Button[1]', labelKind: 'kit-component',
    rect: { x: 120, y: 80, w: 96, h: 32 }, kit: { mode: 'pinned', ref: 'a'.repeat(40), version: '1.0.0' }, props: { theme: 'dark' }, moved: false, batch: null, text: 'Save changes',
  });
  const file = path.join(root, 'comments', 'fixture', `${c.id}.json`);
  const raw = await fs.readFile(file, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.deepEqual(JSON.parse(raw), c);
  // Area and board comments have no label.
  const area = await createComment(root, { ...ELEMENT, kind: 'area', rect: { x: 10, y: 10, w: 200, h: 100 } });
  assert.equal(area.canvas.label, null);
  assert.equal(area.canvas.labelKind, null);
  assert.equal(area.element, 'area');
  assert.deepEqual(validateComment(area), []);
  // What the check refuses.
  const bad = structuredClone(c);
  delete bad.elementPath;
  bad.x = '10';
  bad.intent = 'maybe';
  bad.canvas.kind = 'element';
  bad.canvas.labelKind = 'css';
  bad.canvas.board = 'basics.dc.html';
  bad.thread = [{ role: 'bot', content: 'x' }];
  const issues = validateComment(bad).join('\n');
  for (const word of ['elementPath', 'x must', 'intent', 'labelKind', 'canvas.board', 'thread[0]']) assert.match(issues, new RegExp(word.replace(/[[\]]/g, '\\$&')));
  await assert.rejects(createComment(root, { ...ELEMENT, comment: '  ' }), /comment must not be empty/);
});

test('CM-03 threads and states: addressed by the agent, resolved or reopened only by a person', async () => {
  const root = await project();
  const c = await createComment(root, ELEMENT);
  let x = await replyToComment(root, c.id, { role: 'agent', content: 'Which gap: between Save and Archived?' });
  assert.equal(x.status, 'pending');
  x = await replyToComment(root, c.id, { role: 'agent', content: 'Set the row gap to 8px in the button row.', addressed: true });
  assert.equal(x.status, 'acknowledged');
  assert.deepEqual(x.thread.map((m) => m.role), ['agent', 'agent']);
  x = await resolveComment(root, c.id, { now: Date.UTC(2026, 9, 20, 13) });
  assert.equal(x.status, 'resolved');
  assert.equal(x.resolvedBy, 'human');
  assert.equal(x.resolvedAt, '2026-10-20T13:00:00.000Z');
  await assert.rejects(replyToComment(root, c.id, { role: 'agent', content: 'Done again', addressed: true }), /only a person reopens/);
  x = await replyToComment(root, c.id, { role: 'human', content: 'Still too wide on the phone layout.' });
  assert.equal(x.status, 'pending');
  assert.equal(x.resolvedAt, undefined);
  assert.equal(x.thread.at(-1).role, 'human');
  assert.deepEqual(validateComment(x), []);
  await assert.rejects(replyToComment(root, c.id, { role: 'agent', content: '   ' }), /needs some text/);
  await assert.rejects(findComment(root, 'c_20261020_zzzzzz'), /No comment/);
});

test('CM-04 writes are atomic and locked: concurrent replies are all kept, no temporary files are left', async () => {
  const root = await project();
  const c = await createComment(root, ELEMENT);
  await Promise.all(Array.from({ length: 12 }, (_, i) => replyToComment(root, c.id, { role: i % 2 ? 'agent' : 'human', content: `Reply ${i}` })));
  const { comment } = await findComment(root, c.id);
  assert.equal(comment.thread.length, 12);
  const files = await fs.readdir(path.join(root, 'comments', 'fixture'));
  assert.deepEqual(files, [`${c.id}.json`]);
  // A stale lock (a writer that died) is taken over.
  const file = path.join(root, 'comments', 'fixture', `${c.id}.json`);
  await fs.mkdir(`${file}.lock`);
  const old = new Date(Date.now() - 60000);
  await fs.utimes(`${file}.lock`, old, old);
  assert.equal(await withLock(file, async () => 'ran'), 'ran');
  // A new comment never replaces a file already there.
  await assert.rejects(writeJsonAtomic(file, { replaced: true }, { exclusive: true }), { code: 'EEXIST' });
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).id, c.id);
  assert.deepEqual((await fs.readdir(path.join(root, 'comments', 'fixture'))).sort(), [`${c.id}.json`]);
  // On a volume without hard links, a new file is created exclusively instead, and still never replaces one.
  const link = fs.link;
  let refused = 0;
  fs.link = async () => { refused += 1; throw Object.assign(new Error('not supported'), { code: 'EPERM' }); };
  try {
    const fresh = path.join(root, 'comments', 'fixture', 'c_20261020_aaaaaa.json');
    await writeJsonAtomic(fresh, { made: true }, { exclusive: true });
    assert.deepEqual(JSON.parse(await fs.readFile(fresh, 'utf8')), { made: true });
    await assert.rejects(writeJsonAtomic(fresh, { made: false }, { exclusive: true }), { code: 'EEXIST' });
    await fs.rm(fresh);
    assert.equal(refused, 2, 'the store tried the hard link first');
  } finally {
    fs.link = link;
  }
  assert.deepEqual((await fs.readdir(path.join(root, 'comments', 'fixture'))).sort(), [`${c.id}.json`]);
});

test('CM-05 re-attachment is recorded: a new place moves the pin, a missing element marks it moved, nothing is lost', async () => {
  const root = await project();
  const c = await createComment(root, ELEMENT);
  let x = await placeComment(root, c.id, { rect: { x: 120.2, y: 80.1, w: 96, h: 32 }, boardWidth: 1200 });
  assert.equal(x.canvas.rect.x, 120, 'under half a pixel is the same place: no rewrite');
  x = await placeComment(root, c.id, { rect: { x: 300, y: 400, w: 96, h: 32 }, boardWidth: 1200 });
  assert.deepEqual([x.canvas.rect.x, x.canvas.rect.y, x.x, x.y, x.canvas.moved], [300, 400, 25, 400, false]);
  x = await placeComment(root, c.id, { moved: true });
  assert.equal(x.canvas.moved, true);
  assert.deepEqual(x.canvas.rect, { x: 300, y: 400, w: 96, h: 32 }, 'a moved comment keeps its last position');
  x = await placeComment(root, c.id, { rect: { x: 300, y: 420, w: 96, h: 32 } });
  assert.equal(x.canvas.moved, false);
  assert.equal((await readComments(root)).comments.length, 1);
  // A broken file is reported, left on disk, and not handed on.
  const broken = path.join(root, 'comments', 'fixture', 'c_20261020_broken.json');
  await fs.writeFile(broken, JSON.stringify({ id: 'c_20261020_broken', comment: 'Half a comment' }));
  const read = await readComments(root);
  assert.equal(read.comments.length, 1);
  assert.equal(read.problems.length, 1);
  assert.match(read.problems[0].file, /c_20261020_broken\.json$/);
  await fs.access(broken);
});

test('CM-06 Send all to agent: one batch of every open comment, then taken and done', async () => {
  const root = await project();
  assert.equal(await sendAll(root), null, 'nothing open, no batch');
  const a = await createComment(root, ELEMENT);
  const b = await createComment(root, { ...ELEMENT, kind: 'board', rect: { x: 0, y: 0, w: 1200, h: 900 } });
  const c = await createComment(root, ELEMENT);
  await resolveComment(root, c.id);
  const batch = await sendAll(root);
  assert.deepEqual(validateBatch(batch), []);
  assert.deepEqual(batch.comments.sort(), [a.id, b.id].sort());
  assert.equal(batch.status, 'sent');
  assert.equal(batch.takenBy, null);
  assert.equal((await findComment(root, a.id)).comment.canvas.batch, batch.id);
  assert.equal(await sendAll(root), null, 'comments already in a batch the agent has not finished are not sent again');
  const taken = await takeBatch(root, batch.id, 'codex/one');
  assert.deepEqual([taken.status, taken.takenBy], ['taken', 'codex/one']);
  await assert.rejects(takeBatch(root, batch.id, 'claude-code/two'), /taken by codex\/one/);
  await replyToComment(root, a.id, { role: 'agent', content: 'Done.', addressed: true });
  assert.equal((await finishBatch(root, batch.id)).status, 'done');
  // b is still open (the agent did not address it) and its batch is done, so it goes out again.
  const again = await sendAll(root);
  assert.deepEqual(again.comments, [b.id]);
  assert.equal((await readBatches(root)).length, 2);
  await assert.rejects(readBatch(root, 'b_x'), /not a batch id/);
  // A batch file that cannot be read is reported, left on disk, and its comments are not sent again.
  const d = await createComment(root, ELEMENT);
  const unreadable = 'b_20261020_zzzzzz';
  await updateComment(root, d.id, (x) => { x.canvas.batch = unreadable; return x; });
  await fs.writeFile(path.join(root, 'comments', 'batches', `${unreadable}.json`), '{"schema": "canvas-batch/1", "id"');
  const report = await readBatchReport(root);
  assert.deepEqual(report.problems.map((p) => path.basename(p.file)), [`${unreadable}.json`]);
  assert.ok(report.unreadable.has(unreadable));
  assert.equal(await sendAll(root), null, 'a comment in a batch that cannot be read counts as still with the agent');
  // A batch id with no file at all (a send that stopped before writing it) is sent again.
  await updateComment(root, d.id, (x) => { x.canvas.batch = 'b_20261020_000000'; return x; });
  assert.deepEqual((await sendAll(root)).comments, [d.id]);
});

test('CM-07 the command line: list, wait (a batch written by another process arrives within 2 s), take, reply, done', async () => {
  const root = await project();
  const a = await createComment(root, ELEMENT);
  let r = await cli(['comments', 'list', '--open', '--project', root]);
  assert.equal(r.code, 0, r.stderr);
  const listed = JSON.parse(r.stdout);
  assert.deepEqual(listed.map((c) => c.id), [a.id]);
  assert.equal(listed[0].link, 'http://127.0.0.1:5410/fixture/language/basics');
  r = await cli(['comments', 'wait', '--timeout', '0.3', '--project', root]);
  assert.equal(r.code, 2, 'no batch before the timeout');
  // The listener runs first; the batch is sent from this process once it is waiting.
  const listening = cli(['comments', 'wait', '--timeout', '20'], { cwd: path.join(root, 'canvases', 'fixture') });
  await listening.waiting;
  const sentAt = Date.now();
  const batch = await sendAll(root);
  const heard = await listening;
  assert.equal(heard.code, 0, heard.stderr);
  const got = JSON.parse(heard.stdout);
  assert.equal(got.id, batch.id);
  assert.deepEqual(got.annotations.map((c) => c.id), [a.id]);
  assert.ok(heard.at - sentAt < 2000, `delivered in ${heard.at - sentAt} ms`);
  r = await cli(['comments', 'take', batch.id, '--project', root]);
  assert.equal(JSON.parse(r.stdout).takenBy, 'test/session');
  r = await cli(['comments', 'reply', a.id, 'Set the gap to 8px.', '--addressed', '--project', root]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, 'acknowledged');
  r = await cli(['comments', 'list', '--batch', batch.id, '--project', root]);
  assert.equal(JSON.parse(r.stdout)[0].thread[0].content, 'Set the gap to 8px.');
  r = await cli(['comments', 'done', batch.id, '--project', root]);
  assert.equal(JSON.parse(r.stdout).status, 'done');
  r = await cli(['comments', 'reply', 'c_20261020_000000', 'x', '--project', root]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /No comment/);
  r = await cli(['comments', 'bogus', '--project', root]);
  assert.equal(r.code, 1);
  // Ids are checked before the file system is touched: nothing is made outside the project.
  for (const sub of ['done', 'take']) {
    r = await cli(['comments', sub, '../../../outside/deep/x', '--project', root]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not a batch id/);
  }
  r = await cli(['comments', 'reply', '../../x', 'Hi', '--project', root]);
  assert.match(r.stderr, /not a comment id/);
  await assert.rejects(fs.access(path.join(root, '..', 'outside')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(root, 'outside')), { code: 'ENOENT' });
  assert.equal(await commentsMain(['list', '--nope']), 1);
  assert.equal(sessionName({ CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'abc' }), 'claude-code/abc');
  assert.equal(sessionName({ CODEX_THREAD_ID: 't1' }), 'codex/t1');
  assert.equal(sessionName({ CANVAS_SESSION: 'me' }), 'me');
});

const request = (origin, p, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request(`${origin}${p}`, { method, headers }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
  req.end();
});

test('CM-08 the viewer\'s comment routes: same-origin JSON only, and a change on disk reaches the browser as an event', async () => {
  const root = await project();
  const viewer = await startViewer({ projectRoot: root, port: 0 });
  try {
    const json = { 'content-type': 'application/json', origin: viewer.origin };
    assert.equal((await request(viewer.origin, '/_comments', { method: 'POST', body: ELEMENT, headers: { 'content-type': 'application/json', origin: 'http://evil.test' } })).status, 403);
    assert.equal((await request(viewer.origin, '/_comments', { method: 'POST', body: ELEMENT, headers: { origin: viewer.origin, 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await request(viewer.origin, '/_comments', { method: 'POST', body: { ...ELEMENT, canvas: 'nope' }, headers: json })).status, 400);
    assert.equal((await request(viewer.origin, '/_index', { method: 'POST', body: {}, headers: json })).status, 405);
    // Events: the comment the viewer writes is announced; then so is an agent's reply written on disk.
    let text = '';
    let wake = () => {};
    const opened = new Promise((resolve) => {
      const es = http.get(`${viewer.origin}/_events`, (res) => {
        res.setEncoding('utf8');
        res.on('data', (d) => { text += d; wake(); });
        resolve(es);
      });
    });
    const es = await opened;
    const announced = (ms = 3000) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      wake = () => { if (text.includes('"comments"')) { clearTimeout(timer); resolve(true); } };
      wake();
    });
    const made = await request(viewer.origin, '/_comments', { method: 'POST', body: ELEMENT, headers: json });
    assert.equal(made.status, 201);
    const c = JSON.parse(made.body);
    assert.ok(await announced(), 'the new comment is announced');
    text = '';
    await replyToComment(root, c.id, { role: 'agent', content: 'Changed.', addressed: true });
    const heard = await announced();
    es.destroy();
    assert.ok(heard, 'the browser hears about the agent\'s reply');
    let r = await request(viewer.origin, `/_comments/${c.id}/reply`, { method: 'POST', body: { content: 'Thanks, reopening for the phone.' }, headers: json });
    assert.equal(JSON.parse(r.body).status, 'pending');
    r = await request(viewer.origin, `/_comments/${c.id}/resolve`, { method: 'POST', body: {}, headers: json });
    assert.equal(JSON.parse(r.body).status, 'resolved');
    r = await request(viewer.origin, '/_comments/send', { method: 'POST', body: {}, headers: json });
    assert.deepEqual(JSON.parse(r.body), { batch: null });
    r = await request(viewer.origin, '/_comments');
    const all = JSON.parse(r.body);
    assert.equal(all.comments.length, 1);
    assert.deepEqual(all.problems, []);
    assert.equal((await request(viewer.origin, '/_comments/c_20261020_000000/resolve', { method: 'POST', body: {}, headers: json })).status, 404);
  } finally {
    await viewer.close();
  }
});

// ---------------------------------------------------------------- in the browser

let broot;
let viewer;
let browser;
let page;
const pageErrors = [];

before(async () => {
  if (skip) return;
  assert.ok(available, 'CANVAS_BROWSER_TESTS=required but the canvas tooling is not installed');
  const { buildFixtureKit } = await import('../metamodern-work-on-canvases/scripts/build-fixture-kit.mjs');
  broot = await project();
  await buildFixtureKit(path.join(broot, 'kit', 'current'));
  viewer = await startViewer({ projectRoot: broot, port: 0 });
  browser = await chromium().launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
});

after(async () => {
  await browser?.close();
  await viewer?.close();
});

async function frameReady(file) {
  await page.waitForFunction((f) => {
    const frame = document.querySelector(`iframe[data-board="${f}"]`);
    try { return !!frame?.contentWindow?.__canvasRuntime && frame.contentDocument.querySelector('[data-kit-component]'); } catch { return false; }
  }, file, { timeout: 15000 });
}
/** The screen point of an element's centre inside a board frame, through the canvas transform. */
async function screenPoint(file, selector) {
  return page.evaluate(({ file, selector }) => {
    const f = document.querySelector(`iframe[data-board="${file}"]`);
    const r = f.getBoundingClientRect(), k = r.width / f.clientWidth;
    const n = f.contentDocument.querySelector(selector).getBoundingClientRect();
    return { x: r.left + (n.left + n.width / 2) * k, y: r.top + (n.top + n.height / 2) * k };
  }, { file, selector });
}
const commentFiles = async () => (await readComments(broot)).comments;
/** Comment mode is on in the board itself (its crosshair style is in), not only in the viewer. */
const pickingIn = (file) => page.waitForFunction((f) => [...(document.querySelector(`iframe[data-board="${f}"]`)?.contentDocument?.querySelectorAll('style') ?? [])]
  .some((n) => n.textContent.includes('crosshair')), file);

// Rows of look-alikes: each row has a name, a role, an optional rank, two identical icons, an image and an "Edit"
// button. `data-mark` (not an identifying attribute) names every element for the checks only.
const ICON = (m) => `<svg data-mark="${m}" width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12"></rect></svg>`;
function rowsBoard(rows, o = {}) {
  const row = (r, i) => `<div class="${o.cls ?? 'row'}" data-mark="${r.name}-row"><b data-mark="${r.name}-b">${r.name}</b> <span data-mark="${r.name}-role">${r.role}</span>${o.rank ? ` <i>#${i + 1}</i>` : ''} ${o.extraIcon === r.name ? ICON(`${r.name}-new`) : ''}${ICON(`${r.name}-svg1`)}${ICON(`${r.name}-svg2`)} <img data-mark="${r.name}-img" src="dot.svg" alt="" width="12" height="12"> <button type="button" data-mark="${r.name}-button">Edit</button></div>`;
  const toolbar = `<div data-canvas-id="toolbar"><span>Tools</span> ${(o.icons ?? ['a', 'b', 'c']).map((m) => ICON(`tool-${m}`)).join('')}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rows</title><script src="./support.js"></script></head><body><x-dc>
${toolbar}<p>${o.note ?? 'Team'}</p><div data-canvas-id="rows">${rows.map(row).join('\n')}</div></x-dc></body></html>`;
}
const TEAM = [{ name: 'Ana', role: 'Lead' }, { name: 'Bea', role: 'Design' }, { name: 'Cy', role: 'Eng' }, { name: 'Dee', role: 'Ops' }];
const ROW_TARGETS = ['Bea-b', 'Bea-role', 'Bea-svg2', 'Bea-img', 'Bea-button'];
const SAME = (marks) => Object.fromEntries(marks.map((m) => [m, m]));
// [name, first board, regenerated board, targets, expected: the same mark, 'moved', or 'same-or-moved']
const IDENTITY_CASES = [
  ['rows re-sorted', rowsBoard(TEAM), rowsBoard([...TEAM].reverse()), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['class names changed', rowsBoard(TEAM), rowsBoard(TEAM, { cls: 'line' }), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['icon added in another row', rowsBoard(TEAM), rowsBoard(TEAM, { extraIcon: 'Cy' }), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['another cell edited', rowsBoard(TEAM), rowsBoard(TEAM.map((r) => (r.name === 'Bea' ? { ...r, role: 'Product' } : r))), ROW_TARGETS,
    { ...SAME(ROW_TARGETS), 'Bea-role': 'same-or-moved' }],
  ['ranked rows re-sorted', rowsBoard(TEAM, { rank: true }), rowsBoard([...TEAM].reverse(), { rank: true }), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['row added above', rowsBoard(TEAM, { rank: true }), rowsBoard([{ name: 'Zed', role: 'Sales' }, ...TEAM], { rank: true }), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['earlier row removed', rowsBoard(TEAM), rowsBoard(TEAM.slice(1)), ROW_TARGETS, SAME(ROW_TARGETS)],
  ['its row removed', rowsBoard(TEAM), rowsBoard(TEAM.filter((r) => r.name !== 'Bea')), ROW_TARGETS, Object.fromEntries(ROW_TARGETS.map((m) => [m, 'moved']))],
  ['identical icon inserted in its row', rowsBoard(TEAM), rowsBoard(TEAM, { extraIcon: 'Bea' }), ROW_TARGETS, { ...SAME(ROW_TARGETS), 'Bea-svg2': 'moved' }],
  ['identical toolbar icon inserted first', rowsBoard(TEAM), rowsBoard(TEAM, { icons: ['new', 'a', 'b', 'c'] }), ['tool-b'], { 'tool-b': 'moved' }],
  ['picked toolbar icon removed', rowsBoard(TEAM), rowsBoard(TEAM, { icons: ['a', 'c'] }), ['tool-b'], { 'tool-b': 'moved' }],
  ['earlier toolbar icon removed', rowsBoard(TEAM), rowsBoard(TEAM, { icons: ['b', 'c'] }), ['tool-b'], { 'tool-b': 'moved' }],
  ['toolbar unchanged, words elsewhere edited', rowsBoard(TEAM), rowsBoard(TEAM, { note: 'Our team' }), ['tool-b'], { 'tool-b': 'tool-b' }],
];

test('CM-09 look-alikes re-attach to the same element or show as moved, never a neighbour', { skip }, async () => {
  const file = path.join(broot, 'canvases', 'fixture', 'project', 'rows.dc.html');
  const p = await browser.newPage();
  const open = async () => {
    await p.goto(`${viewer.origin}/fixture/project/rows.dc.html`);
    await p.waitForFunction(() => window.__canvasRuntime && document.querySelector('[data-canvas-id="rows"] div'));
  };
  const failures = [];
  try {
    for (const [name, first, next, targets, expected] of IDENTITY_CASES) {
      await fs.writeFile(file, first);
      await open();
      const picked = await p.evaluate((marks) => marks.map((m) => window.__canvasRuntime.describe(document.querySelector(`[data-mark="${m}"]`))), targets);
      await fs.writeFile(file, next);
      await open();
      const got = await p.evaluate((list) => list.map((d) => window.__canvasRuntime.locate(d)?.dataset.mark ?? 'moved'), picked);
      targets.forEach((m, i) => {
        const want = expected[m];
        const ok = want === 'same-or-moved' ? got[i] === m || got[i] === 'moved' : got[i] === want;
        if (!ok) failures.push(`${name}: ${m} -> ${got[i]} (expected ${want})`);
      });
    }
    // The name cell has words of its own: it records no identity and is found by them wherever it moves.
    await fs.writeFile(file, rowsBoard(TEAM));
    await open();
    const b = await p.evaluate(() => window.__canvasRuntime.describe(document.querySelector('[data-mark="Bea-b"]')));
    assert.equal(b.identity, undefined);
    // 600 rows: a textless icon is found again in well under 20 ms per comment.
    const many = Array.from({ length: 600 }, (_, i) => ({ name: `N${i}`, role: `R${i}` }));
    many[1] = { name: 'Bea', role: 'Design' };
    await fs.writeFile(file, rowsBoard(many));
    await open();
    const icon = await p.evaluate(() => window.__canvasRuntime.describe(document.querySelector('[data-mark="Bea-svg2"]')));
    await fs.writeFile(file, rowsBoard([{ name: 'Zed', role: 'Sales' }, ...many]));
    await open();
    // The median of eleven calls (the first one also pays for the page's first layout).
    const timing = await p.evaluate((d) => {
      const times = [];
      let mark = null;
      for (let i = 0; i < 11; i += 1) {
        const t0 = performance.now();
        mark = window.__canvasRuntime.locate(d)?.dataset.mark ?? 'moved';
        times.push(performance.now() - t0);
      }
      return { first: times[0], median: [...times].sort((a, b) => a - b)[5], mark };
    }, icon);
    assert.equal(timing.mark, 'Bea-svg2');
    assert.ok(timing.median < 20, `median ${timing.median.toFixed(1)} ms (first ${timing.first.toFixed(1)} ms)`);
  } finally {
    await p.close();
    await fs.rm(file, { force: true });
  }
  assert.deepEqual(failures, []);
});

test('CM-10 click an element at quarter zoom, comment, send to a listening agent, reply, resolve and reopen, regenerate', { skip }, async () => {
  const board = 'basics.dc.html';
  await page.goto(`${viewer.origin}/fixture/language/basics`);
  await frameReady(board);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+0');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Control+-');
  assert.equal(await page.evaluate(() => /scale\(0\.25\)/.test(document.querySelector('.world').style.transform)), true);
  await page.keyboard.press('c');
  await page.waitForSelector('.cv.commenting');
  assert.equal(await page.getAttribute('[data-test="comment-mode"]', 'aria-pressed'), 'true');
  // Pick the table (a test-id label) at 25%.
  await pickingIn(board);
  const p = await screenPoint(board, '[data-test="owners"] tbody tr:nth-child(2) td');
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector('[data-test="comment-input"]');
  await page.fill('[data-test="comment-input"]', 'Give the second owner row more air.');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cm-pin');
  let [c] = await commentFiles();
  assert.equal(c.comment, 'Give the second owner row more air.');
  assert.equal(c.canvas.kind, 'element');
  assert.equal(c.canvas.labelKind, 'test-id');
  assert.equal(c.canvas.label, 'owners > tbody:nth-of-type(1) > tr:nth-of-type(2) > td:nth-of-type(1)');
  assert.equal(c.element, 'td');
  assert.equal(c.canvas.kit.mode, 'pinned');
  assert.match(c.canvas.kit.version, /fixture/);
  assert.equal(c.canvas.props.theme, 'light');
  assert.equal(c.url, `${viewer.origin}/fixture/language/basics`);
  assert.deepEqual(validateComment(c), []);
  // The pin sits at the element's top left on screen.
  const pin = await page.evaluate((id) => document.querySelector(`.cm-pin[data-comment="${id}"]`).getBoundingClientRect(), c.id);
  const td = await page.evaluate(() => {
    const f = document.querySelector('iframe[data-board="basics.dc.html"]');
    const r = f.getBoundingClientRect(), k = r.width / f.clientWidth;
    const n = f.contentDocument.querySelector('[data-test="owners"] tbody tr:nth-child(2) td').getBoundingClientRect();
    return { x: r.left + n.left * k, y: r.top + n.top * k };
  });
  assert.ok(Math.abs(pin.left + 4 - td.x) < 1.5 && Math.abs(pin.bottom - 4 - td.y) < 1.5, `pin ${JSON.stringify(pin)} vs element ${JSON.stringify(td)}`);

  // An area: drag a box.
  const a0 = await screenPoint(board, 'h1');
  await page.mouse.move(a0.x - 30, a0.y - 10);
  await page.mouse.down();
  await page.mouse.move(a0.x + 40, a0.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.fill('[data-test="comment-input"]', 'The heading and the row above it are too close.');
  await page.click('[data-test="comment-submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.cm-pin').length === 2);
  // The whole board: Shift C.
  await page.keyboard.press('Shift+C');
  await page.fill('[data-test="comment-input"]', 'This board needs a dark version.');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.cm-pin').length === 3);
  const kinds = (await commentFiles()).map((x) => x.canvas.kind).sort();
  assert.deepEqual(kinds, ['area', 'board', 'element']);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cv:not(.commenting)');

  // Send all to agent, with an agent listening in another process.
  const listening = cli(['comments', 'wait', '--timeout', '20', '--project', broot]);
  await listening.waiting;
  assert.equal(await page.textContent('[data-test="send-all"] .count'), '3');
  const clickedAt = Date.now();
  await page.click('[data-test="send-all"]');
  const heard = await listening;
  assert.equal(heard.code, 0, heard.stderr);
  const batch = JSON.parse(heard.stdout);
  assert.equal(batch.annotations.length, 3);
  assert.ok(heard.at - clickedAt < 3000, `the listening session had the batch ${heard.at - clickedAt} ms after the click`);
  await page.waitForFunction(() => document.querySelector('[data-test="send-all"]').disabled);

  // The agent replies and marks it addressed; the viewer shows it without a reload.
  const r = await cli(['comments', 'reply', c.id, 'Added 8px of padding to the owner rows.', '--addressed', '--project', broot]);
  assert.equal(r.code, 0, r.stderr);
  await page.click('.tab[data-tab="comments"]');
  await page.waitForSelector(`.cm-pin.acknowledged[data-comment="${c.id}"]`);
  await page.click(`[data-test="comment-item"][data-comment="${c.id}"]`);
  await page.waitForSelector('.cm-msg.agent');
  assert.match(await page.textContent('.cm-item.active'), /Added 8px of padding/);
  assert.ok(await page.$(`.cm-pin[data-comment="${c.id}"]`), 'an addressed comment is still open, with its pin');
  await page.click('[data-test="comment-resolve"]');
  await page.waitForSelector(`.cm-pin[data-comment="${c.id}"]`, { state: 'detached' });
  assert.equal((await findComment(broot, c.id)).comment.status, 'resolved');
  await page.click('[data-test="comments-resolved"]');
  await page.click(`[data-test="comment-item"][data-comment="${c.id}"]`);
  await page.fill(`[data-reply="${c.id}"]`, 'On the phone layout it is still tight.');
  await page.click('[data-test="comment-reply"]');
  await page.waitForSelector(`[data-test="comment-item"][data-comment="${c.id}"]`, { state: 'detached' });
  c = (await findComment(broot, c.id)).comment;
  assert.deepEqual([c.status, c.thread.map((m) => m.role)], ['pending', ['agent', 'human']]);
  await page.click('[data-test="comments-open"]');

  // Regenerate the board: the table moves down, the pin follows; the heading's area stays; an element comment on a
  // removed element shows as moved.
  await page.keyboard.press('c');
  await pickingIn(board);
  const typed = await screenPoint(board, '[data-test="typed"]');
  await page.mouse.click(typed.x, typed.y);
  await page.fill('[data-test="comment-input"]', 'Drop this line.');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.cm-pin').length === 4);
  await page.keyboard.press('Escape');
  const typedId = (await commentFiles()).find((x) => x.comment === 'Drop this line.').id;
  const before = (await findComment(broot, c.id)).comment.canvas.rect;
  const file = path.join(broot, 'canvases', 'fixture', 'project', board);
  const src = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, src
    .replace('<div class="basics-outside" data-canvas-id="outside">', '<p class="board-note" data-canvas-id="added">A line added above everything.</p>\n<div class="basics-outside" data-canvas-id="outside">')
    .replace('<p class="board-note" data-test="typed">Typed: {{typedText}}</p>', ''));
  await page.waitForFunction((id) => document.querySelector(`.cm-pin.moved[data-comment="${id}"]`), typedId, { timeout: 10000 });
  await page.waitForFunction(async ({ id, y }) => {
    const res = await fetch('/_comments');
    const c = (await res.json()).comments.find((x) => x.id === id);
    return c && c.canvas.rect.y > y + 10 && !c.canvas.moved;
  }, { id: c.id, y: before.y }, { timeout: 10000 });
  const after = (await findComment(broot, c.id)).comment;
  const moved = (await findComment(broot, typedId)).comment;
  assert.equal(moved.canvas.moved, true, 'the removed element\'s comment is marked moved in its file');
  assert.equal(after.canvas.moved, false);
  const tdNow = await page.evaluate(() => {
    const n = document.querySelector('iframe[data-board="basics.dc.html"]').contentDocument.querySelector('[data-test="owners"] tbody tr:nth-child(2) td').getBoundingClientRect();
    return { x: n.left + scrollX, y: n.top + scrollY };
  });
  assert.ok(Math.abs(after.canvas.rect.y - tdNow.y) < 1, 'the comment re-attached to the element where it is now');
  assert.equal((await commentFiles()).length, 4, 'no comment lost');
  assert.match(await page.getAttribute(`.cm-pin[data-comment="${typedId}"]`, 'aria-label'), /moved/);
  assert.deepEqual(pageErrors, []);
});
