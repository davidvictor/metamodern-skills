// The canvas viewer's server: every canvas in a project, live, on 127.0.0.1 only. A viewer, never an editor: the
// only thing it writes is comments (comments/, contract 4), on the person's actions. Node built-ins only.
//
//   /                                   the home page (the viewer app)
//   /<canvas>/  /<canvas>/<page>/  /<canvas>/<page>/<board>   viewer links (contract 1), the viewer app
//   /<canvas>/project/<path>            what a board loads, through board-resolve.mjs (kit chosen per board)
//   /_viewer/<file>                     the viewer app's own files (assets/viewer)
//   /_index                             every canvas with its group, pages and boards
//   /_kits                              the pinned kit and every live kit, from their kit.json
//   /_events                            server-sent events: file changes, kit rebuilds, live kit registry
//   /_blob/<id>                         a file from a canvas's assets/ folders or its tools/blobs.json map
//   /_comments                          GET every comment and batch; POST a new comment
//   /_comments/<id>/reply|resolve|place POST a person's reply, resolving, or where the comment's element is now
//   /_comments/send                     POST: Send all to agent, one batch of every open comment
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, isFactHref, isFrozen, isIconPath, parseViewerLink, readConfig, readLiveKits, validateCanvas } from '../canvas-format.mjs';
import { kitDirFor } from '../board-resolve.mjs';
import { localHost, sendFile, sendText, serveBoardRequest, TYPES } from './board-server.mjs';
import { COMMENT_ID, commentsRoot, createComment, placeComment, readBatchReport, readComments, replyToComment, resolveComment, sendAll } from './comment-store.mjs';

export const VIEWER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'viewer');
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KIT_POLL_MS = 250;

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const isDir = (dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } };

/** The project root: the nearest folder at or above `start` that holds canvas.config.json, or null. */
export function findProject(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'canvas.config.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Canvas id to its folder, for every folder in the canvases folder that holds project/canvas.json. */
export function canvasFolders(projectRoot, config) {
  const root = path.resolve(projectRoot, config.canvases);
  const out = new Map();
  let names = [];
  try { names = fs.readdirSync(root).sort(); } catch { return out; }
  for (const name of names) {
    if (!ID.test(name)) continue;
    const dir = path.join(root, name);
    if (isDir(dir) && fs.existsSync(path.join(dir, 'project', 'canvas.json'))) out.set(name, dir);
  }
  return out;
}

/** A board's facts for the side panel, from its ws.facts: [{label, text, href?}], each checked. */
function boardFacts(ws) {
  if (!Array.isArray(ws?.facts)) return [];
  return ws.facts
    .filter((f) => f && typeof f.label === 'string' && f.label.trim() && typeof f.text === 'string')
    .map((f) => ({ label: f.label, text: f.text, ...(isFactHref(f.href) ? { href: f.href } : {}) }));
}

/** A canvas's about line: the first paragraph of its README.md, after any heading. */
export function readAbout(canvasDir) {
  let text;
  try { text = fs.readFileSync(path.join(canvasDir, 'README.md'), 'utf8'); } catch { return ''; }
  const paragraphs = text.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
  const first = paragraphs.find((p) => !/^(#|<!--|```|\||- |\* |>)/.test(p));
  if (!first) return '';
  return first
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .slice(0, 280);
}

/** A canvas's home group: ws.group, else decided when frozen, else exploring. */
export function canvasGroup(canvas) {
  if (GROUPS.includes(canvas?.ws?.group)) return canvas.ws.group;
  return isFrozen(canvas) ? 'decided' : 'exploring';
}

const PAGELESS = '-';

/** Every canvas with its pages and boards, for the home page, the sidebar and the finder. */
export function buildIndex({ projectRoot, config }) {
  const canvases = [];
  const problems = [];
  for (const [id, dir] of canvasFolders(projectRoot, config)) {
    try {
      const canvas = readJson(path.join(dir, 'project', 'canvas.json'));
      if (!canvas) { problems.push({ canvas: id, issues: ['canvas.json: not readable JSON'] }); continue; }
      const issues = validateCanvas(canvas);
      // /<canvas>/project/... is where boards load their files, so a page cannot be called project.
      if (Array.isArray(canvas.pages) && canvas.pages.some((p) => p?.id === 'project')) issues.push('canvas.json: the page id project is taken by the viewer\'s board paths');
      if (issues.length) problems.push({ canvas: id, issues });
      const declared = Array.isArray(canvas.pages) ? canvas.pages.filter((p) => p && typeof p.id === 'string') : [];
      const pages = declared.length ? declared.map((p) => ({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : p.id })) : [{ id: PAGELESS, name: 'Boards' }];
      const first = pages[0].id;
      const rank = new Map((Array.isArray(canvas.order) ? canvas.order : []).map((f, i) => [f, i]));
      const boards = Object.entries(canvas.boards && typeof canvas.boards === 'object' ? canvas.boards : {})
        .filter(([f, b]) => f.endsWith('.dc.html') && b && typeof b === 'object')
        .map(([f, b]) => ({
          f,
          t: typeof b.title === 'string' && b.title ? b.title : f.replace(/\.dc\.html$/, ''),
          p: declared.length && pages.some((p) => p.id === b.page) ? b.page : first,
          x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.w) || 1, h: Number(b.h) || 1,
          kit: typeof b.ws?.kit === 'string' ? b.ws.kit : 'pinned',
          row: b.ws?.row ?? null,
          set: b.ws?.set ?? null,
          ...(boardFacts(b.ws).length ? { facts: boardFacts(b.ws) } : {}),
        }))
        .sort((a, b) => (rank.get(a.f) ?? 1e9) - (rank.get(b.f) ?? 1e9) || a.y - b.y || a.x - b.x);
      const launch = pages.some((p) => p.id === canvas.launch?.page) ? canvas.launch.page : first;
      canvases.push({
        id,
        title: typeof canvas.title === 'string' && canvas.title ? canvas.title : id,
        group: canvasGroup(canvas),
        frozen: isFrozen(canvas),
        launch,
        pageless: !declared.length,
        pages,
        boards,
        about: typeof canvas.ws?.about === 'string' && canvas.ws.about.trim() ? canvas.ws.about.trim() : readAbout(dir),
        icon: isIconPath(canvas.ws?.icon) && fs.existsSync(path.join(dir, 'project', canvas.ws.icon))
          ? `/${encodeURIComponent(id)}/project/${canvas.ws.icon.split(/[\\/]/).map(encodeURIComponent).join('/')}` : null,
      });
    } catch (error) {
      problems.push({ canvas: id, issues: [`canvas.json: ${error.message}`] });
    }
  }
  const order = [...config.groups, ...GROUPS.filter((g) => !config.groups.includes(g))];
  canvases.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.title.localeCompare(b.title));
  return { name: config.name, groups: config.groups, groupNames: config.groupNames ?? {}, namespace: config.kit.namespace, canvases, problems };
}

/** What a kit folder holds: its kit.json facts, a legacy kit (no kit.json), or nothing. */
export function kitInfo(dir) {
  if (!dir || !isDir(dir)) return { exists: false };
  const file = path.join(dir, 'kit.json');
  if (!fs.existsSync(file)) return { exists: true, legacy: true };
  const kit = readJson(file);
  if (!kit || typeof kit !== 'object') return { exists: true, legacy: false, error: 'kit.json is not readable JSON' };
  const source = kit.source && typeof kit.source === 'object' ? kit.source : {};
  return {
    exists: true,
    legacy: false,
    namespace: kit.namespace ?? null,
    version: kit.version ?? null,
    repo: source.repo ?? null,
    commit: source.commit ?? null,
    branch: source.branch ?? null,
    dirty: source.dirty === true,
    builtAt: kit.builtAt ?? null,
  };
}

/** The pinned kit and every live kit, for the board banners and the kit switch. */
export function kitsReport({ projectRoot, config, liveKits }) {
  const pinned = kitDirFor({ projectRoot, config, kit: 'pinned' }).dir;
  return {
    namespace: config.kit.namespace,
    pinned: { choice: 'pinned', name: 'pinned', ...kitInfo(pinned) },
    live: Object.keys(liveKits).sort().map((name) => ({ choice: `live:${name}`, name, ...kitInfo(liveKits[name]) })),
  };
}

/** Uploaded files by id: each canvas's assets/ and project/assets/ (name without extension) and tools/blobs.json. */
export function blobMap(folders) {
  const map = new Map();
  for (const dir of folders.values()) {
    for (const own of [path.join(dir, 'assets'), path.join(dir, 'project', 'assets')]) {
      let files = [];
      try { files = fs.readdirSync(own, { withFileTypes: true }); } catch { continue; }
      for (const f of files) if (f.isFile()) map.set(f.name.replace(/\.[^.]+$/, ''), path.join(own, f.name));
    }
    const listed = readJson(path.join(dir, 'tools', 'blobs.json'));
    if (listed && typeof listed === 'object' && !Array.isArray(listed)) {
      for (const [id, rel] of Object.entries(listed)) {
        if (typeof rel !== 'string' || !ID.test(id)) continue;
        const file = path.resolve(dir, rel);
        const inside = path.relative(dir, file);
        if (inside && !inside.startsWith('..') && !path.isAbsolute(inside)) map.set(id, file);
      }
    }
  }
  return map;
}

function sseHub() {
  const listeners = new Set();
  return {
    add(req, res) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': open\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
    },
    send(data) { for (const res of listeners) res.write(`data: ${JSON.stringify(data)}\n\n`); },
    ping() { for (const res of listeners) res.write(': ping\n\n'); },
    close() { for (const res of listeners) res.end(); listeners.clear(); },
  };
}

/** A file's change signature for polling: its modification time, or 0 when it is missing. */
const mtime = (file) => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };

/**
 * Watches the project and calls `emit` with batched events:
 *   {type: 'files', changes: [{canvas, file}]}   a file under a canvas's project/ changed
 *   {type: 'index'}                               a canvas.json, README.md or canvas folder changed
 *   {type: 'skin'}                                the project skin changed
 *   {type: 'kit', kit: 'pinned' | 'live:<name>'}  a kit was rebuilt (its kit.json, or any bundle file of a legacy kit)
 *   {type: 'kits'}                                .canvas/live.json changed
 *   {type: 'comments'}                            a comment or batch file changed
 */
export function watchProject({ projectRoot, config, getLiveKits, reloadLiveKits, emit }) {
  const closers = [];
  let pending = new Map();
  let index = false;
  let timer = null;
  const flush = () => {
    timer = null;
    if (index) emit({ type: 'index' });
    if (pending.size) emit({ type: 'files', changes: [...pending.values()] });
    pending = new Map();
    index = false;
  };
  const later = () => { if (!timer) timer = setTimeout(flush, 60); };

  // The canvases folder is watched recursively. A watcher that fails (the folder is removed or renamed, or the
  // system runs out of watches) is closed and tried again every second, as is a folder that does not exist yet.
  const canvasesDir = path.resolve(projectRoot, config.canvases);
  let closed = false;
  let watcher = null;
  let retry = null;
  const onChange = (_, name) => {
    if (!name) return;
    const parts = String(name).split(path.sep);
    const [canvas, folder, ...rest] = parts;
    if (!canvas || !ID.test(canvas)) return;
    // The index holds each canvas's README line and whether its icon file is there, so an .svg in project/ counts too.
    if (parts.length === 1 || (parts.length === 2 && folder === 'README.md') || (folder === 'project' && (rest.join('/') === 'canvas.json' || /\.svg$/i.test(rest.join('/'))))) index = true;
    if (folder === 'project' && rest.length) {
      const file = rest.join('/');
      pending.set(`${canvas}/${file}`, { canvas, file });
    }
    later();
  };
  const watchCanvases = () => {
    retry = null;
    if (closed) return;
    try {
      const mine = fs.watch(fs.realpathSync(canvasesDir), { recursive: true }, onChange);
      watcher = mine;
      mine.on('error', () => {
        mine.close();
        if (watcher !== mine) return;
        watcher = null;
        if (closed) return;
        index = true;
        later();
        clearTimeout(retry);
        retry = setTimeout(watchCanvases, 1000);
      });
    } catch (error) {
      // No folder yet: try again. No recursive watching on this system: reload by hand.
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') retry = setTimeout(watchCanvases, 1000);
    }
  };
  watchCanvases();
  closers.push(() => { closed = true; clearTimeout(retry); watcher?.close(); });

  const skin = path.resolve(projectRoot, config.skin);
  let skinTime = mtime(skin);
  const onSkin = () => { const t = mtime(skin); if (t !== skinTime) { skinTime = t; emit({ type: 'skin' }); } };
  fs.watchFile(skin, { interval: KIT_POLL_MS }, onSkin);
  closers.push(() => fs.unwatchFile(skin, onSkin));

  // Kits are polled: a build replaces files by renaming, and a kit folder may not exist until its first build.
  const kitWatchers = new Map();
  const watchKit = (choice, dir) => {
    const files = ['kit.json', 'components/bundle.js', 'components/bundle.css', 'components/scenes.js', 'components/scenes.css'].map((f) => path.join(dir, f));
    const signature = () => (fs.existsSync(files[0]) ? `k${mtime(files[0])}` : files.map(mtime).join(','));
    let last = signature();
    let debounce = null;
    const check = () => {
      const now = signature();
      if (now === last) return;
      last = now;
      clearTimeout(debounce);
      debounce = setTimeout(() => emit({ type: 'kit', kit: choice }), 80);
    };
    for (const f of files) fs.watchFile(f, { interval: KIT_POLL_MS }, check);
    return () => { clearTimeout(debounce); for (const f of files) fs.unwatchFile(f, check); };
  };
  const syncKits = () => {
    const wanted = new Map([['pinned', kitDirFor({ projectRoot, config, kit: 'pinned' }).dir]]);
    for (const [name, dir] of Object.entries(getLiveKits())) wanted.set(`live:${name}`, path.resolve(dir));
    for (const [choice, entry] of kitWatchers) {
      if (wanted.get(choice) !== entry.dir) { entry.stop(); kitWatchers.delete(choice); }
    }
    for (const [choice, dir] of wanted) if (!kitWatchers.has(choice)) kitWatchers.set(choice, { dir, stop: watchKit(choice, dir) });
  };
  syncKits();
  closers.push(() => { for (const entry of kitWatchers.values()) entry.stop(); kitWatchers.clear(); });

  const liveFile = path.join(projectRoot, '.canvas', 'live.json');
  let liveTime = mtime(liveFile);
  const onLive = async () => {
    const t = mtime(liveFile);
    if (t === liveTime) return;
    liveTime = t;
    await reloadLiveKits();
    if (closed) return;
    syncKits();
    emit({ type: 'kits' });
  };
  fs.watchFile(liveFile, { interval: KIT_POLL_MS }, onLive);
  closers.push(() => fs.unwatchFile(liveFile, onLive));

  // Comments: any change under comments/ (an agent's reply, a new batch) tells the browser to read them again. A
  // recursive watch reports most changes at once; a poll of the files' names, sizes and times every 300 ms catches
  // what it misses (folders created after the watch began, systems without recursive watching).
  const commentsDir = commentsRoot(projectRoot);
  let commentWatcher = null;
  let commentRetry = null;
  let commentTimer = null;
  const commentSignature = () => {
    const parts = [];
    let dirs = [];
    try { dirs = fs.readdirSync(commentsDir, { withFileTypes: true }); } catch { return ''; }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      let files = [];
      try { files = fs.readdirSync(path.join(commentsDir, d.name)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try { const st = fs.statSync(path.join(commentsDir, d.name, f)); parts.push(`${d.name}/${f}:${st.size}:${st.mtimeMs}`); } catch { /* replaced meanwhile */ }
      }
    }
    return parts.sort().join('|');
  };
  let commentSig = commentSignature();
  const announce = () => {
    if (!commentTimer) commentTimer = setTimeout(() => { commentTimer = null; commentSig = commentSignature(); emit({ type: 'comments' }); }, 40);
  };
  // Every event counts, temporary and lock files included: a rename may be reported under the temporary name only.
  const watchComments = () => {
    commentRetry = null;
    if (closed) return;
    try {
      const mine = fs.watch(commentsDir, { recursive: true }, announce);
      commentWatcher = mine;
      mine.on('error', () => { mine.close(); if (commentWatcher === mine) commentWatcher = null; if (!closed) commentRetry = setTimeout(watchComments, 1000); });
    } catch {
      commentRetry = setTimeout(watchComments, 1000);
    }
  };
  watchComments();
  const commentPoll = setInterval(() => { if (!commentTimer && commentSignature() !== commentSig) announce(); }, 300);
  commentPoll.unref?.();
  closers.push(() => { clearTimeout(commentRetry); clearTimeout(commentTimer); clearInterval(commentPoll); commentWatcher?.close(); });

  return () => { clearTimeout(timer); for (const close of closers) close(); };
}

const MAX_BODY = 256 * 1024;

/** A JSON body from the viewer page itself: same origin, JSON, at most 256 KB. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin;
    if (origin !== `http://${req.headers.host}`) return reject(Object.assign(new Error('Forbidden'), { status: 403 }));
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return reject(Object.assign(new Error('JSON only'), { status: 415 }));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Not JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/** The comment routes. Writes go through comment-store.mjs (atomic, locked); the watcher tells every viewer. */
async function serveComments({ req, res, parts, projectRoot, canvases }) {
  const json = (status, value) => sendText(res, status, JSON.stringify(value), TYPES['.json']);
  try {
    if (req.method === 'GET' && parts.length === 1) {
      const { comments, problems } = await readComments(projectRoot);
      const report = await readBatchReport(projectRoot);
      return json(200, { comments, batches: report.batches, unreadableBatches: [...report.unreadable], problems: problems.concat(report.problems) });
    }
    if (req.method !== 'POST') return sendText(res, 405, 'Method not allowed');
    const body = await readBody(req);
    if (parts.length === 1) {
      if (!canvases().has(body?.canvas)) return json(400, { error: `No canvas named ${body?.canvas}` });
      return json(201, await createComment(projectRoot, body));
    }
    if (parts.length === 2 && parts[1] === 'send') return json(200, { batch: await sendAll(projectRoot) });
    const [, id, action] = parts;
    if (parts.length !== 3 || !COMMENT_ID.test(id ?? '')) return sendText(res, 404, 'Not found');
    if (action === 'reply') return json(200, await replyToComment(projectRoot, id, { role: 'human', content: body.content }));
    if (action === 'resolve') return json(200, await resolveComment(projectRoot, id));
    if (action === 'place') return json(200, await placeComment(projectRoot, id, body));
    return sendText(res, 404, 'Not found');
  } catch (error) {
    if (res.headersSent) return undefined;
    return json(error.status ?? (/^No comment/.test(error.message) ? 404 : 400), { error: error.message });
  }
}

// What /_whoami answers, so a viewer can tell itself from another project's viewer or any other server on a port.
const WHOAMI = 'metamodern-canvas';

/** Who answers on host:port: null when nothing does, else its /_whoami ({} for a server that isn't a canvas viewer). */
function whoIs(host, port) {
  return new Promise((done) => {
    // One answer, within a second in all, read up to 4 KB: an unrelated server can't stall or stop the scan.
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(deadline); req.destroy(); done(value); };
    const deadline = setTimeout(() => finish({}), 1000);
    const req = http.get({ host, port, path: '/_whoami', headers: { host: `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.on('error', () => finish({}));
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4096) finish({});
      });
      res.on('end', () => { try { finish(JSON.parse(body)); } catch { finish({}); } });
    });
    req.on('error', (error) => finish(['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code) ? null : {}));
  });
}

/**
 * The port a project's viewer should use, from `from` on: the first that nothing holds on 127.0.0.1 or ::1, or the one
 * where this project's viewer is already running ({running: true}). Several projects' viewers can run side by side.
 * @returns {Promise<{port: number, running: boolean}>}
 */
export async function findPort({ projectRoot, from, tries = 50 }) {
  projectRoot = path.resolve(projectRoot);
  // Every candidate is probed: this project's viewer may be running higher up, on a port it took while an earlier
  // one was held, and a port freed since must not start a second viewer.
  let free = null;
  for (let port = from; port < from + tries && port <= 65535; port++) {
    const answers = await Promise.all([whoIs('127.0.0.1', port), whoIs('::1', port)]);
    if (answers.some((a) => a?.viewer === WHOAMI && a.root === projectRoot)) return { port, running: true };
    if (free === null && answers.every((a) => a === null)) free = port;
  }
  if (free !== null) return { port: free, running: false };
  throw Object.assign(new Error(`No free port from ${from} to ${from + tries - 1}`), { code: 'EADDRINUSE' });
}

/**
 * Starts the viewer for a project.
 * @param {{projectRoot: string, config?: object, port?: number, watch?: boolean, quiet?: boolean}} options
 *   port defaults to the project's config port; 0 picks a free one.
 */
export async function startViewer({ projectRoot, config, port, watch = true, quiet = true } = {}) {
  projectRoot = path.resolve(projectRoot);
  config ??= await readConfig(projectRoot);
  let liveKits = {};
  let liveIssue = null;
  const reloadLiveKits = async () => {
    try { liveKits = await readLiveKits(projectRoot); liveIssue = null; }
    catch (error) { liveKits = {}; liveIssue = String(error.message); }
  };
  await reloadLiveKits();
  const viewerFiles = new Set(fs.readdirSync(VIEWER_DIR));
  let blobs = null;
  const hub = sseHub();

  const server = http.createServer((req, res) => {
    if (!localHost(req)) return sendText(res, 403, 'Forbidden');
    let url;
    let parts;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
      parts = url.pathname.split('/').slice(1);
    } catch {
      return sendText(res, 400, 'Bad request');
    }
    const [head] = parts;
    if (head === '_comments') return serveComments({ req, res, parts, projectRoot, canvases: () => canvasFolders(projectRoot, config) });
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    if (head === '_viewer') {
      const name = parts.length === 2 ? parts[1] : '';
      return viewerFiles.has(name) ? sendFile(res, path.join(VIEWER_DIR, name)) : sendText(res, 404, 'Not found');
    }
    if (head === '_whoami' && parts.length === 1) return sendText(res, 200, JSON.stringify({ viewer: WHOAMI, root: projectRoot, name: config.name }), TYPES['.json']);
    if (head === '_index' && parts.length === 1) return sendText(res, 200, JSON.stringify(buildIndex({ projectRoot, config })), TYPES['.json']);
    if (head === '_kits' && parts.length === 1) {
      return sendText(res, 200, JSON.stringify({ ...kitsReport({ projectRoot, config, liveKits }), issue: liveIssue }), TYPES['.json']);
    }
    if (head === '_events' && parts.length === 1) return hub.add(req, res);
    if (head === '_blob' && parts.length === 2) {
      let id;
      try { id = decodeURIComponent(parts[1]); } catch { return sendText(res, 400, 'Bad request'); }
      if (!ID.test(id)) return sendText(res, 400, 'Bad request');
      if (!blobs || !blobs.has(id) || !fs.existsSync(blobs.get(id))) blobs = blobMap(canvasFolders(projectRoot, config));
      return blobs.has(id) ? sendFile(res, blobs.get(id)) : sendText(res, 404, 'Not found');
    }
    let canvasId;
    try { canvasId = decodeURIComponent(head ?? ''); } catch { return sendText(res, 400, 'Bad request'); }
    if (parts[1] === 'project' && parts.length > 2 && !(parts.length === 3 && parts[2] === '')) {
      const dir = canvasFolders(projectRoot, config).get(canvasId);
      if (!dir) return sendText(res, 404, `No canvas named ${canvasId}`);
      return serveBoardRequest({
        req, res, url, projectRoot, config, liveKits,
        projectDir: path.join(dir, 'project'),
        requestPath: parts.slice(2).join('/'),
      });
    }
    const link = parseViewerLink(url.pathname);
    if (link && (!link.canvas || canvasFolders(projectRoot, config).has(link.canvas))) return sendFile(res, path.join(VIEWER_DIR, 'app.html'));
    return sendText(res, 404, 'Not found');
  });

  // localhost can resolve to ::1 first: the viewer answers there too, at the same port, so a link to localhost never
  // reaches another project's server. A system without IPv6 loopback serves IPv4 alone; any other failure on ::1 stops
  // the start, except with port 0, where the system's pick is retried on a port free on both.
  const six = http.createServer((req, res) => server.emit('request', req, res));
  const listen = (srv, p, host) => new Promise((resolve, reject) => {
    const fail = (error) => { srv.off('listening', done); reject(error); };
    const done = () => { srv.off('error', fail); resolve(); };
    srv.once('error', fail);
    srv.once('listening', done);
    srv.listen(p, host);
  });
  const wanted = port ?? config.port;
  for (let attempt = 1; ; attempt++) {
    await listen(server, wanted, '127.0.0.1');
    try {
      await listen(six, server.address().port, '::1');
      break;
    } catch (error) {
      if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL') break;
      await new Promise((resolve) => server.close(resolve));
      if (wanted !== 0 || error.code !== 'EADDRINUSE' || attempt === 5) throw error;
    }
  }
  const stopWatching = watch
    ? watchProject({
      projectRoot, config, getLiveKits: () => liveKits, reloadLiveKits,
      emit: (data) => {
        // A canvas's files changed: blob ids are looked up afresh.
        if (data.type === 'files' || data.type === 'index') blobs = null;
        hub.send(data);
      },
    })
    : () => {};
  const ping = setInterval(() => hub.ping(), 25000);
  ping.unref();
  const { port: actual } = server.address();
  const origin = `http://127.0.0.1:${actual}`;
  if (!quiet) {
    const index = buildIndex({ projectRoot, config });
    console.log(`${config.name}: ${origin}  (${index.canvases.length} canvases)`);
    for (const p of index.problems) console.log(`  ${p.canvas}: ${p.issues.join('; ')}`);
    if (!kitInfo(kitDirFor({ projectRoot, config, kit: 'pinned' }).dir).exists) console.log(`  The pinned kit folder ${config.kit.pinned} does not exist yet, so boards show without it.`);
    if (liveIssue) console.log(`  .canvas/live.json: ${liveIssue}`);
  }
  return {
    server,
    origin,
    port: actual,
    emit: (data) => hub.send(data),
    close: () => new Promise((resolve) => {
      clearInterval(ping);
      stopWatching();
      hub.close();
      if (six.listening) six.close();
      six.closeAllConnections?.();
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
}
