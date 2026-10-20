// The canvas viewer's server: every canvas in a project, live, on 127.0.0.1 only. A viewer, never an editor:
// nothing here writes to the project. Node built-ins only.
//
//   /                                   the home page (the viewer app)
//   /<canvas>/  /<canvas>/<page>/  /<canvas>/<page>/<board>   viewer links (contract 1), the viewer app
//   /<canvas>/project/<path>            what a board loads, through board-resolve.mjs (kit chosen per board)
//   /_viewer/<file>                     the viewer app's own files (assets/viewer)
//   /_index                             every canvas with its group, pages and boards
//   /_kits                              the pinned kit and every live kit, from their kit.json
//   /_events                            server-sent events: file changes, kit rebuilds, live kit registry
//   /_blob/<id>                         a file from a canvas's assets/ folders or its tools/blobs.json map
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, isFrozen, parseViewerLink, readConfig, readLiveKits, validateCanvas } from '../canvas-format.mjs';
import { kitDirFor } from '../board-resolve.mjs';
import { localHost, sendFile, sendText, serveBoardRequest, TYPES } from './board-server.mjs';

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
        about: readAbout(dir),
      });
    } catch (error) {
      problems.push({ canvas: id, issues: [`canvas.json: ${error.message}`] });
    }
  }
  const order = [...config.groups, ...GROUPS.filter((g) => !config.groups.includes(g))];
  canvases.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.title.localeCompare(b.title));
  return { name: config.name, groups: config.groups, namespace: config.kit.namespace, canvases, problems };
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
 */
function watchProject({ projectRoot, config, getLiveKits, reloadLiveKits, emit }) {
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
    if (parts.length === 1 || (parts.length === 2 && folder === 'README.md') || (folder === 'project' && rest.join('/') === 'canvas.json')) index = true;
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

  return () => { clearTimeout(timer); for (const close of closers) close(); };
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
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    let url;
    let parts;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
      parts = url.pathname.split('/').slice(1);
    } catch {
      return sendText(res, 400, 'Bad request');
    }
    const [head] = parts;
    if (head === '_viewer') {
      const name = parts.length === 2 ? parts[1] : '';
      return viewerFiles.has(name) ? sendFile(res, path.join(VIEWER_DIR, name)) : sendText(res, 404, 'Not found');
    }
    if (head === '_index' && parts.length === 1) return sendText(res, 200, JSON.stringify(buildIndex({ projectRoot, config })), TYPES['.json']);
    if (head === '_kits' && parts.length === 1) {
      return sendText(res, 200, JSON.stringify({ ...kitsReport({ projectRoot, config, liveKits }), issue: liveIssue }), TYPES['.json']);
    }
    if (head === '_events' && parts.length === 1) return hub.add(req, res);
    if (head === '_blob' && parts.length === 2) {
      let id;
      try { id = decodeURIComponent(parts[1]); } catch { return sendText(res, 400, 'Bad request'); }
      if (!ID.test(id)) return sendText(res, 400, 'Bad request');
      if (!blobs || !blobs.has(id)) blobs = blobMap(canvasFolders(projectRoot, config));
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

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port ?? config.port, '127.0.0.1', resolve);
  });
  const stopWatching = watch
    ? watchProject({ projectRoot, config, getLiveKits: () => liveKits, reloadLiveKits, emit: (data) => hub.send(data) })
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
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
}
