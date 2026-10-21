/* The canvas viewer. Two levels: the home page lists every canvas by group; a canvas opens on one page at a time,
   with its pages and boards in the sidebar and the selected board's properties in the side panel. A viewer, never
   an editor: nothing here changes a canvas.
   Links (contract 1): /  /<canvas>/  /<canvas>/<page>/  /<canvas>/<page>/<board>   (board = its file without .dc.html;
   a canvas without pages uses "-"). A board link may carry ?canvas-kit=pinned|live:<name> and ?canvas-props=<json>.
   Each board runs in its own frame, so each board can show its own kit. */
import { el, MOD, toast, copyText } from './dom.js';
import { kitEntry, kitLabel, motionControls, renderBoardPanel, updateBoardPanel, valuesJson } from './panel.js';
import { installComments } from './comments.js';

const app = document.getElementById('app');
const store = {
  get(k, d) { try { const v = localStorage.getItem('canvas-viewer:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('canvas-viewer:' + k, JSON.stringify(v)); } catch { /* storage refused */ } },
};
const slug = (f) => f.replace(/\.dc\.html$/, '');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const GROUP_NAMES = { foundations: 'Foundations', lab: 'Labs', app: 'App', exploring: 'Exploring', decided: 'Decided', archive: 'Archive' };
/** A group's heading: the project's name for it (canvas.config.json groupNames), else the package's. */
const groupName = (g) => INDEX.groupNames?.[g] ?? GROUP_NAMES[g] ?? g;

let INDEX = { name: 'Canvases', groups: [], canvases: [], problems: [] };
let KITS = null;
const canvasById = (id) => INDEX.canvases.find((c) => c.id === id);
async function loadIndex() { INDEX = await (await fetch('/_index', { cache: 'no-store' })).json(); }
async function loadKits() { KITS = await (await fetch('/_kits', { cache: 'no-store' })).json(); }

/* ---------- per-board viewer state: kit choice, value overrides, motion ---------- */
const keyOf = (canvasId, file) => `${canvasId}/${file}`;
/** Kit switches are kept per viewer, so a lab session survives a reload. */
const kitChoices = store.get('kits', {});
const choiceFor = (canvasId, b) => kitChoices[keyOf(canvasId, b.f)] ?? b.kit ?? 'pinned';
function setChoice(canvasId, b, choice) {
  const key = keyOf(canvasId, b.f);
  if (choice === (b.kit ?? 'pinned')) delete kitChoices[key]; else kitChoices[key] = choice;
  store.set('kits', kitChoices);
}
/** Values set in the panel or carried by a link, re-sent whenever the board (re)loads. */
const overrides = new Map();

/* Hooks for other viewer layers (comments): board messages by type, extra side-panel tabs and top-bar tools. */
const boardHooks = new Map();
export function onBoardMessage(type, fn) { if (!boardHooks.has(type)) boardHooks.set(type, []); boardHooks.get(type).push(fn); }
export const PANELS = [{ id: 'properties', label: 'Properties', render: (body, v) => v.renderProperties(body) }];
export const TOOLS = [];
/* Layers can also take keys first (key(e, view, fromBoard) returns true when used), learn when a page's boards are
   drawn (world(view)) and when a board's frame loads (frame(view, rec)), and hear server events (event(data)). */
export const LAYERS = [];

/* ---------- routing ---------- */
const urlFor = (c, p, f) => '/' + [c, p, f && slug(f)].filter(Boolean).map(encodeURIComponent).join('/') + (f ? '' : '/');
function go(url, { replace = false } = {}) {
  if (url === location.pathname + location.search) return route();
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  route();
}
addEventListener('popstate', () => route());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-go]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); go(a.getAttribute('href'));
});

let view = null; // the canvas view while one is open
function route() {
  closeOverlays();
  let parts;
  try { parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { parts = []; }
  const [c, p, b] = parts;
  const canvas = c && canvasById(c);
  if (!canvas) { view?.destroy(); view = null; return showHome(); }
  const page = canvas.pages.some((x) => x.id === p) ? p : canvas.launch;
  if (!p || p !== page) return go(urlFor(canvas.id, page), { replace: true });
  const board = b ? canvas.boards.find((x) => slug(x.f) === b && x.p === page) : null;
  if (board) applyLinkQuery(canvas, board);
  if (!view || view.canvas.id !== canvas.id) { view?.destroy(); view = new CanvasView(canvas); }
  view.show(page, board);
}
/** A board link's canvas-kit and canvas-props apply to that board, then leave the address bar. */
function applyLinkQuery(canvas, board) {
  const q = new URLSearchParams(location.search);
  if (!q.has('canvas-kit') && !q.has('canvas-props')) return;
  const kit = q.get('canvas-kit');
  if (kit && (kit === 'pinned' || /^live:[a-z0-9][a-z0-9-]*$/.test(kit))) setChoice(canvas.id, board, kit);
  const props = q.get('canvas-props');
  if (props) {
    try {
      const values = JSON.parse(props);
      if (values && typeof values === 'object' && !Array.isArray(values)) overrides.set(keyOf(canvas.id, board.f), values);
    } catch { toast('The link’s canvas-props is not JSON'); }
  }
  history.replaceState({}, '', location.pathname);
}

/* ---------- recent ---------- */
function remember(c, p) {
  const list = store.get('recent', []).filter((r) => !(r.c === c && r.p === p));
  list.unshift({ c, p, t: Date.now() });
  store.set('recent', list.slice(0, 8));
}

/* ---------- home ---------- */
// Soft neutral tones for the card heads, one per canvas (stable by its id), so its icon and name carry the card.
const TONES = [['#f4f2ed', '#e2ddd2'], ['#eef2f0', '#d5e0da'], ['#f1f0f5', '#dcdae7'], ['#f4efeb', '#e6d9ce'],
  ['#eef1f4', '#d4dde7'], ['#f2f1ea', '#e0ddc9'], ['#f2eef1', '#e3d7df'], ['#edf0ea', '#d7dfd0']];
const toneOf = (id) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [a, b] = TONES[h % TONES.length];
  return `radial-gradient(120% 100% at 0% 0%, rgba(255,255,255,.7), rgba(255,255,255,0) 60%), linear-gradient(135deg, ${a}, ${b})`;
};
/** A canvas's tile: its icon (ws.icon, drawn in the tile's ink) or the first letter of its title. */
const tile = (c) => el('span', { class: 'tile', 'aria-hidden': 'true' },
  c.icon ? el('span', { class: 'ic', style: `--icon: url("${c.icon}")` }) : (c.title.trim()[0] ?? '?').toUpperCase());
const counts = (c) => `${c.pageless ? '' : `${c.pages.length} ${c.pages.length === 1 ? 'page' : 'pages'} · `}${c.boards.length} ${c.boards.length === 1 ? 'board' : 'boards'}`;
function groupOrder() { return [...INDEX.groups, ...Object.keys(GROUP_NAMES).filter((g) => !INDEX.groups.includes(g))]; }
function showHome() {
  document.title = INDEX.name;
  const recent = store.get('recent', []).map((r) => ({ r, c: canvasById(r.c) })).filter((x) => x.c && x.c.pages.some((p) => p.id === x.r.p)).slice(0, 6);
  const sections = [];
  for (const g of groupOrder()) {
    const list = INDEX.canvases.filter((c) => c.group === g);
    if (!list.length) continue;
    const body = g === 'app' ? list.map(banner)
      : g === 'decided' || g === 'archive' ? el('div', { class: 'list' }, list.map(rowCard))
      : el('div', { class: 'cards' }, list.map(card));
    sections.push(el('section', { 'data-group': g, 'aria-label': groupName(g) }, el('h2', { text: groupName(g) }), body));
  }
  const home = el('div', { class: 'home' }, el('main', { class: 'home-in' },
    el('div', { class: 'home-head' },
      el('h1', { text: INDEX.name }),
      el('button', { class: 'btn', title: 'Keyboard shortcuts (?)', 'aria-label': 'Keyboard shortcuts', onclick: showHelp, text: '?' }),
      el('button', { class: 'btn search-btn', onclick: () => openPalette() }, el('span', { text: 'Find a canvas, page or board' }), el('kbd', { text: MOD + ' K' }))),
    INDEX.problems.length ? el('div', { class: 'problems', role: 'note' }, INDEX.problems.map((p) => el('p', { text: `${p.canvas}: ${p.issues.join('; ')}` }))) : null,
    recent.length ? el('div', { class: 'recent' }, el('span', { class: 'recent-h', text: 'Recently viewed' }), recent.map(({ r, c }) =>
      el('a', { class: 'chip', href: urlFor(c.id, r.p), 'data-go': true }, c.title, c.pageless ? null : el('small', { text: c.pages.find((p) => p.id === r.p)?.name })))) : null,
    sections.length ? sections : el('p', { class: 'empty', text: 'No canvases yet. A canvas is a folder in the canvases folder with project/canvas.json.' })));
  app.replaceChildren(home);
}
function banner(c) {
  return el('a', { class: 'banner', href: urlFor(c.id, c.launch), 'data-go': true, 'data-canvas': c.id, style: `background: ${toneOf(c.id)}` },
    el('div', {},
      el('div', { class: 'banner-title', text: c.title }),
      c.about ? el('p', { class: 'banner-about', text: c.about }) : null,
      el('div', { class: 'banner-meta', text: counts(c) })),
    tile(c));
}
// The whole card opens the canvas (the head's link covers it); its page links sit above that and open their page.
function card(c) {
  const shown = c.pageless ? [] : c.pages.slice(0, 6);
  return el('div', { class: 'card', 'data-canvas': c.id },
    el('a', { class: 'card-head', href: urlFor(c.id, c.launch), 'data-go': true, style: `background: ${toneOf(c.id)}` }, tile(c), el('span', { class: 'card-title', text: c.title })),
    el('div', { class: 'body' },
      c.about ? el('p', { class: 'about', text: c.about }) : null,
      el('div', { class: 'm', text: counts(c) }),
      shown.length ? el('div', { class: 'pages' }, shown.map((p) => el('a', { href: urlFor(c.id, p.id), 'data-go': true, text: p.name })),
        c.pages.length > shown.length ? el('a', { href: urlFor(c.id, c.launch), 'data-go': true, text: `+${c.pages.length - shown.length}` }) : null) : null));
}
function rowCard(c) {
  return el('a', { class: 'row-card', href: urlFor(c.id, c.launch), 'data-go': true, 'data-canvas': c.id }, tile(c),
    el('span', { class: 'row-text' }, el('span', { class: 'row-title', text: c.title }),
      c.about ? el('span', { class: 'row-about', text: c.about }) : null, el('span', { class: 'm', text: counts(c) })));
}

/* ---------- the canvas view ---------- */
const ZOOMS = [0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const LIVE_MIN_ZOOM = 0.28, MAX_LIVE = 14, PAD = 48;
const ROW_ORDER = ['live', 'deciding', 'building', 'next', 'later'];
const ROW_NAMES = { live: 'Live', deciding: 'Deciding', building: 'Building', next: 'Next', later: 'Later' };
const ease = (t) => 1 - Math.pow(1 - t, 3);

class CanvasView {
  constructor(canvas) {
    this.canvas = canvas;
    this.cam = { x: 0, y: 0, s: 1 };
    this.els = new Map(); // board file -> { b, el, frame, iframe, kitEl, state, rate }
    this.sel = null; this.live = null;
    this.canvasRate = 1;
    this.tab = store.get('tab', 'properties');
    this.root = el('div', { class: 'cv' + (store.get('side', true) ? '' : ' no-side') + (store.get('panel', true) ? '' : ' no-panel') });
    this.side = el('aside', { class: 'side', 'aria-label': 'Pages and boards' });
    this.top = el('header', { class: 'top' });
    this.panel = el('aside', { class: 'panel', 'aria-label': 'Side panel' });
    this.world = el('div', { class: 'world' });
    this.panLayer = el('div', { class: 'pan-layer' });
    this.stage = el('div', { class: 'stage', tabindex: '-1' }, this.world, this.panLayer);
    this.mini = el('canvas', { class: 'minimap' + (store.get('mini', true) ? '' : ' off'), width: 200, height: 140, title: 'Map of the page (M)' });
    this.hud = el('div', { class: 'hud', role: 'status' });
    this.stage.append(this.mini, this.hud);
    this.root.append(this.side, this.top, this.stage, this.panel);
    app.replaceChildren(this.root);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.paint()); this.ro.observe(this.stage);
    this.buildSide();
  }
  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.anim); }

  /* pages */
  boardsOn(page) { return this.canvas.boards.filter((b) => b.p === page); }
  groups(page) {
    const list = this.boardsOn(page);
    if (!list.some((b) => b.row)) return [{ heading: null, boards: list }];
    const out = ROW_ORDER.map((r) => ({ heading: ROW_NAMES[r], boards: list.filter((b) => b.row === r) }));
    out.push({ heading: 'Other boards', boards: list.filter((b) => !ROW_ORDER.includes(b.row)) });
    return out.filter((g) => g.boards.length);
  }
  show(page, board) {
    const pageChanged = page !== this.page;
    if (pageChanged) {
      if (this.page) this.saveView();
      this.page = page; this.boards = this.boardsOn(page);
      this.sel = null; this.live = null;
      this.canvasRate = 1;
      this.renderWorld();
      const saved = store.get(`view:${this.canvas.id}/${page}`, null);
      if (board) this.fitBoard(board, { animate: false });
      else if (saved) this.setCam(saved);
      else this.fitWidth({ animate: false });
      remember(this.canvas.id, page);
    }
    if (board && (!this.sel || this.sel.b !== board)) { this.select(board, { url: false }); if (!pageChanged) this.fitBoard(board); else this.makeLive(board); }
    if (!board && this.sel && !pageChanged) this.release({ url: false });
    const pg = this.canvas.pages.find((p) => p.id === page);
    document.title = `${this.canvas.pageless ? '' : `${pg?.name ?? page} · `}${this.canvas.title}`;
    this.buildTop(); this.buildSide(); this.buildPanel(); this.paint();
  }
  pageIndex() { return this.canvas.pages.findIndex((p) => p.id === this.page); }
  goPage(i) { const p = this.canvas.pages[i]; if (p) go(urlFor(this.canvas.id, p.id)); }

  /* world */
  renderWorld() {
    for (const rec of this.els.values()) rec.iframe?.remove();
    this.world.replaceChildren(); this.els.clear();
    for (const b of this.boards) {
      const frame = el('div', { class: 'frame' });
      const kitEl = el('span', { class: 'kit', 'data-test': 'kit-banner' });
      const node = el('div', { class: 'board', 'data-f': b.f },
        el('div', { class: 'head' }, el('span', { class: 'label', text: b.t }), kitEl), frame, el('div', { class: 'shield' }));
      Object.assign(node.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      this.world.append(node);
      const rec = { b, el: node, frame, iframe: null, boxed: false, kitEl, state: null, rate: null };
      this.els.set(b.f, rec);
      this.markKit(rec);
    }
    for (const l of LAYERS) l.world?.(this);
  }
  /** The banner on a board: which kit it shows and its commit or branch. */
  markKit(rec) {
    const choice = choiceFor(this.canvas.id, rec.b);
    const entry = kitEntry(KITS, choice);
    rec.kitEl.textContent = kitLabel(entry, INDEX.namespace);
    rec.kitEl.title = rec.kitEl.textContent;
    rec.kitEl.classList.toggle('live', choice !== 'pinned');
    rec.kitEl.classList.toggle('missing', !!entry && !entry.exists);
    rec.el.classList.toggle('live-kit', choice !== 'pinned');
    rec.el.dataset.kit = choice;
    this.quietKits();
  }
  /** Kit banners show only when they tell boards apart: while every board on the page shows the pinned kit, they hide. */
  quietKits() {
    const quiet = [...this.els.values()].every((r) => r.el.dataset.kit === 'pinned' && !r.kitEl.classList.contains('missing'));
    this.world.classList.toggle('kits-quiet', quiet);
  }
  /** A titled box stands in for a board until it's close enough to run live. */
  placeholder(rec) {
    if (rec.boxed) return; rec.boxed = true;
    rec.frame.prepend(el('div', { class: 'card-ph' }, el('span', { text: rec.b.t })));
  }
  frameSrc(rec) {
    // The kit choice always travels in the frame's link: the board reports its kit mode from it.
    return `/${encodeURIComponent(this.canvas.id)}/project/${encodeURI(rec.b.f)}?canvas-kit=${encodeURIComponent(choiceFor(this.canvas.id, rec.b))}`;
  }
  mount(rec) {
    if (rec.iframe) return;
    const f = el('iframe', { src: this.frameSrc(rec), title: rec.b.t, 'data-board': rec.b.f });
    f.addEventListener('load', () => this.wireFrame(f));
    rec.state = null;
    rec.iframe = f; rec.frame.append(f);
  }
  unmount(rec) { rec.iframe?.remove(); rec.iframe = null; rec.state = null; }
  /** Loads a board again: a new frame when its link changed (kit switch), else a reload in place. */
  reload(rec) {
    if (!rec.iframe) return;
    rec.state = null;
    const src = this.frameSrc(rec);
    if (rec.iframe.getAttribute('src') !== src) rec.iframe.setAttribute('src', src);
    else { try { rec.iframe.contentWindow.location.reload(); } catch { rec.iframe.setAttribute('src', src); } }
    if (rec === this.sel) this.buildPanel();
  }
  wireFrame(f) {
    let doc; try { doc = f.contentDocument; } catch { return; }
    if (!doc) return;
    doc.addEventListener('keydown', (e) => { if (onKey(e, true)) e.preventDefault(); });
    doc.addEventListener('keyup', (e) => onKeyUp(e));
    const rec = this.recForWindow(f.contentWindow);
    if (rec) for (const l of LAYERS) l.frame?.(this, rec);
    // Scrolling over a live board moves the canvas, unless the board has something of its own to scroll.
    doc.addEventListener('wheel', (e) => {
      if (scrollsInside(e.target, e.deltaX, e.deltaY) && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = f.getBoundingClientRect(), k = r.width / (f.clientWidth || 1);
      this.onWheel({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
        clientX: r.left + e.clientX * k, clientY: r.top + e.clientY * k });
    }, { passive: false });
  }
  recForWindow(win) { for (const rec of this.els.values()) if (rec.iframe && rec.iframe.contentWindow === win) return rec; return null; }

  /* messages from boards (contract 2) */
  onMessage(rec, data) {
    if (data.type === 'canvas:ready') {
      rec.state = { ready: true, schema: data.props ?? {}, values: data.values ?? {}, kit: data.kit ?? null };
      const wanted = overrides.get(keyOf(this.canvas.id, rec.b.f));
      if (wanted && Object.keys(wanted).length) this.post(rec, 'canvas:set-props', { values: wanted });
      const rate = this.rateOf(rec);
      if (rate !== 1) this.post(rec, 'canvas:motion', { rate });
      if (rec === this.sel) this.buildPanel();
    } else if (data.type === 'canvas:props-changed' && rec.state) {
      rec.state.values = data.values ?? {};
      if (rec === this.sel && this.tab === 'properties') updateBoardPanel(this.panelBody, rec.state.values);
    }
    for (const fn of boardHooks.get(data.type) ?? []) { try { fn({ view: this, rec, data }); } catch (error) { console.error(error); } }
  }
  post(rec, type, payload = {}) {
    const win = rec.iframe?.contentWindow;
    if (win) win.postMessage({ type, board: slug(rec.b.f), ...payload }, location.origin);
  }

  /* values */
  setValue(rec, name, value) {
    const key = keyOf(this.canvas.id, rec.b.f);
    const next = { ...(overrides.get(key) ?? {}), [name]: value };
    overrides.set(key, next);
    this.post(rec, 'canvas:set-props', { values: { [name]: value } });
  }
  resetBoard(rec) {
    overrides.delete(keyOf(this.canvas.id, rec.b.f));
    const kitChanged = choiceFor(this.canvas.id, rec.b) !== (rec.b.kit ?? 'pinned');
    setChoice(this.canvas.id, rec.b, rec.b.kit ?? 'pinned');
    this.markKit(rec);
    if (kitChanged) return this.reload(rec);
    const defaults = {};
    for (const [k, spec] of Object.entries(rec.state?.schema ?? {})) if (!k.startsWith('$') && spec && 'default' in spec) defaults[k] = spec.default;
    this.post(rec, 'canvas:set-props', { values: defaults });
  }
  switchKit(rec, choice) {
    setChoice(this.canvas.id, rec.b, choice);
    this.markKit(rec);
    this.reload(rec);
    toast(`${rec.b.t}: ${kitLabel(kitEntry(KITS, choice), INDEX.namespace)}`);
  }
  boardLink(rec) {
    const q = new URLSearchParams();
    const choice = choiceFor(this.canvas.id, rec.b);
    if (choice !== (rec.b.kit ?? 'pinned')) q.set('canvas-kit', choice);
    const values = overrides.get(keyOf(this.canvas.id, rec.b.f));
    if (values && Object.keys(values).length) q.set('canvas-props', JSON.stringify(values));
    const query = q.toString();
    return location.origin + urlFor(this.canvas.id, this.page, rec.b.f) + (query ? `?${query}` : '');
  }

  /* motion */
  rateOf(rec) { return rec.rate ?? this.canvasRate; }
  motion(rec, { rate, replay }) {
    if (rate != null) rec.rate = rate;
    this.post(rec, 'canvas:motion', { rate: this.rateOf(rec), ...(replay ? { replay: true } : {}) });
    if (rec === this.sel) this.buildPanel();
  }
  motionAll({ rate, replay }) {
    if (rate != null) { this.canvasRate = rate; for (const rec of this.els.values()) rec.rate = null; }
    for (const rec of this.els.values()) if (rec.iframe) this.post(rec, 'canvas:motion', { rate: this.rateOf(rec), ...(replay ? { replay: true } : {}) });
    this.buildTop(); this.buildPanel();
    toast(replay ? 'Replaying every board on this page' : rate === 0 ? 'Motion paused on this page' : rate === 1 ? 'Motion at normal speed' : 'Motion at quarter speed');
  }
  motionKey(kind, all) {
    const target = all || !this.sel ? null : this.sel;
    const current = target ? this.rateOf(target) : this.canvasRate;
    const req = kind === 'replay' ? { replay: true } : kind === 'slow' ? { rate: current === 0.25 ? 1 : 0.25 } : { rate: current === 0 ? 1 : 0 };
    if (target) this.motion(target, req); else this.motionAll(req);
  }

  /* live reload */
  /** Whether a live board loaded a file of this canvas: its own document, an imported board, a stylesheet or an asset. */
  loaded(rec, file) {
    let win;
    try { win = rec.iframe?.contentWindow; if (!win || !win.location) return false; } catch { return false; }
    const target = `/${this.canvas.id}/project/${file}`;
    const same = (u) => { try { return decodeURIComponent(new URL(u, location.origin).pathname) === target; } catch { return false; } };
    if (same(win.location.href)) return true;
    let entries = [];
    try { entries = win.performance.getEntriesByType('resource'); } catch { return true; }
    return entries.length >= 250 || entries.some((e) => same(e.name));
  }
  onFilesChanged(files) {
    for (const rec of this.els.values()) if (rec.iframe && files.some((f) => this.loaded(rec, f))) this.reload(rec);
  }
  onKitRebuilt(choice) {
    for (const rec of this.els.values()) if (rec.iframe && choiceFor(this.canvas.id, rec.b) === choice) this.reload(rec);
  }
  refreshKits() { for (const rec of this.els.values()) this.markKit(rec); if (this.sel) this.buildPanel(); }

  /* camera */
  setCam(c) { Object.assign(this.cam, c); this.paint(); }
  animateTo(t, ms = 260) {
    cancelAnimationFrame(this.anim);
    if (reduceMotion.matches) return this.setCam(t);
    const from = { ...this.cam }, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = ease(k);
      // Zoom moves on a log scale so it feels even.
      const s = Math.exp(Math.log(from.s) + (Math.log(t.s) - Math.log(from.s)) * e);
      const x = from.x + (t.x - from.x) * e, y = from.y + (t.y - from.y) * e;
      this.setCam({ x, y, s });
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  moveTo(t, animate) { animate === false ? this.setCam(t) : this.animateTo(t); }
  size() { return { W: this.stage.clientWidth, H: this.stage.clientHeight }; }
  bounds(list = this.boards) {
    if (!list.length) return { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    return { x0: Math.min(...list.map((b) => b.x)), y0: Math.min(...list.map((b) => b.y)),
      x1: Math.max(...list.map((b) => b.x + b.w)), y1: Math.max(...list.map((b) => b.y + b.h)) };
  }
  fitWidth(o = {}) {
    const { x0, y0, x1, y1 } = this.bounds(), { W, H } = this.size();
    const s = Math.min(1, (W - PAD * 2) / (x1 - x0));
    const top = (y1 - y0) * s < H - PAD * 2 ? (H - (y1 - y0) * s) / 2 : PAD + 8;
    this.moveTo({ s, x: (W - (x1 - x0) * s) / 2 - x0 * s, y: top - y0 * s }, o.animate);
  }
  fitAll(o = {}) {
    const { x0, y0, x1, y1 } = this.bounds(), { W, H } = this.size();
    const s = Math.min(1, (W - PAD * 2) / (x1 - x0), (H - PAD * 2) / (y1 - y0));
    this.moveTo({ s, x: (W - (x1 - x0) * s) / 2 - x0 * s, y: (H - (y1 - y0) * s) / 2 - y0 * s }, o.animate);
  }
  fitBoard(b, o = {}) {
    const { W, H } = this.size(), p = 40;
    const sw = Math.min(2, (W - p * 2) / b.w), sb = Math.min(sw, (H - p * 2) / b.h);
    // A tall board reads better at full width from its top than shrunk to fit.
    const s = sb >= sw * 0.6 ? sb : sw;
    const y = b.h * s <= H - p * 2 ? (H - b.h * s) / 2 - b.y * s : p - b.y * s;
    this.moveTo({ s, x: (W - b.w * s) / 2 - b.x * s, y }, o.animate);
    this.makeLive(b);
  }
  zoomAt(s, cx, cy, animate = false) {
    s = Math.min(4, Math.max(0.02, s));
    const t = { s, x: cx - (cx - this.cam.x) * (s / this.cam.s), y: cy - (cy - this.cam.y) * (s / this.cam.s) };
    animate ? this.animateTo(t, 160) : this.setCam(t);
  }
  zoomStep(dir) {
    const { W, H } = this.size(), s = this.cam.s;
    const next = dir > 0 ? ZOOMS.find((z) => z > s * 1.02) ?? 4 : [...ZOOMS].reverse().find((z) => z < s * 0.98) ?? 0.02;
    const c = this.sel ? this.screenCenter(this.sel.b) : null;
    this.zoomAt(next, c && c.inView ? c.x : W / 2, c && c.inView ? c.y : H / 2, true);
  }
  screenCenter(b) {
    const { W, H } = this.size();
    const x = (b.x + b.w / 2) * this.cam.s + this.cam.x, y = (b.y + b.h / 2) * this.cam.s + this.cam.y;
    return { x, y, inView: x > 0 && y > 0 && x < W && y < H };
  }
  pan(dx, dy) { cancelAnimationFrame(this.anim); this.setCam({ x: this.cam.x + dx, y: this.cam.y + dy }); }

  paint() {
    const { x, y, s } = this.cam;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.world.style.setProperty('--s', s);
    this.world.classList.toggle('tiny', s < 0.06);
    if (this.zoomBtn) this.zoomBtn.textContent = Math.round(s * 100) + '%';
    if (!this.cullQueued) { this.cullQueued = true; requestAnimationFrame(() => { this.cullQueued = false; this.cull(); this.drawMini(); }); }
    clearTimeout(this.saveT); this.saveT = setTimeout(() => this.saveView(), 400);
  }
  saveView() { if (this.page) store.set(`view:${this.canvas.id}/${this.page}`, this.cam); }
  /** Pictures for everything near the screen; live boards only when close enough to use, nearest first. */
  cull() {
    const { W, H } = this.size(), { x, y, s } = this.cam, m = 300;
    const near = [];
    for (const rec of this.els.values()) {
      const { b } = rec;
      const L = b.x * s + x, T = b.y * s + y, R = L + b.w * s, B = T + b.h * s;
      const vis = R > -m && B > -m && L < W + m && T < H + m;
      if (vis) this.placeholder(rec);
      const keep = rec === this.live || rec === this.sel;
      if (vis && (s >= (this.liveMinZoom ?? LIVE_MIN_ZOOM) || keep)) near.push({ rec, d: Math.hypot((L + R) / 2 - W / 2, (T + B) / 2 - H / 2) - (keep ? 1e9 : 0) });
      else if (!keep) this.unmount(rec);
    }
    near.sort((a, b) => a.d - b.d);
    near.forEach(({ rec }, i) => (i < MAX_LIVE ? this.mount(rec) : rec !== this.live && rec !== this.sel && this.unmount(rec)));
  }
  drawMini() {
    const c = this.mini; if (c.classList.contains('off')) return;
    const g = c.getContext('2d'), dpr = devicePixelRatio || 1, Wm = 200, Hm = 140;
    if (c.width !== Wm * dpr) { c.width = Wm * dpr; c.height = Hm * dpr; c.style.width = Wm + 'px'; c.style.height = Hm + 'px'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wm, Hm);
    const { x0, y0, x1, y1 } = this.bounds(), pad = 8;
    const k = Math.min((Wm - pad * 2) / (x1 - x0), (Hm - pad * 2) / (y1 - y0));
    const ox = (Wm - (x1 - x0) * k) / 2 - x0 * k, oy = (Hm - (y1 - y0) * k) / 2 - y0 * k;
    this.miniMap = { k, ox, oy };
    for (const b of this.boards) {
      g.fillStyle = this.sel?.b === b ? '#2f6fed' : '#ffffff';
      g.strokeStyle = '#c9c9c4'; g.lineWidth = 0.5;
      g.fillRect(ox + b.x * k, oy + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
      g.strokeRect(ox + b.x * k, oy + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
    }
    const { W, H } = this.size(), s = this.cam.s;
    g.strokeStyle = '#2f6fed'; g.lineWidth = 1.5;
    g.strokeRect(ox + (-this.cam.x / s) * k, oy + (-this.cam.y / s) * k, (W / s) * k, (H / s) * k);
  }
  miniJump(e) {
    const r = this.mini.getBoundingClientRect(), { k, ox, oy } = this.miniMap, { W, H } = this.size();
    const wx = (e.clientX - r.left - ox) / k, wy = (e.clientY - r.top - oy) / k;
    this.setCam({ x: W / 2 - wx * this.cam.s, y: H / 2 - wy * this.cam.s });
  }

  /* selection and focus */
  select(b, { url = true } = {}) {
    const rec = this.els.get(b.f); if (!rec) return;
    if (this.sel && this.sel !== rec) { this.sel.el.classList.remove('sel'); if (this.live === this.sel) this.unlive(); }
    this.sel = rec; rec.el.classList.add('sel');
    if (url) history.replaceState({}, '', urlFor(this.canvas.id, this.page, b.f));
    this.buildTop(); this.markSide(); this.buildPanel(); this.paint();
  }
  makeLive(b) {
    const rec = this.els.get(b.f); if (!rec) return;
    if (this.sel !== rec) this.select(b);
    if (this.live && this.live !== rec) this.unlive();
    this.live = rec; rec.el.classList.add('live'); this.mount(rec);
    this.hint('Live: use the board. Esc to let go.');
  }
  unlive() { this.live?.el.classList.remove('live'); this.live = null; }
  release({ url = true, fit = false } = {}) {
    this.unlive(); this.sel?.el.classList.remove('sel'); this.sel = null;
    if (url) history.replaceState({}, '', urlFor(this.canvas.id, this.page));
    if (fit) this.fitWidth();
    this.buildTop(); this.markSide(); this.buildPanel(); this.paint(); this.hint();
  }
  focus(b, o = {}) { this.select(b); this.fitBoard(b, o); }
  step(dir) {
    const list = this.boards; if (!list.length) return;
    const i = this.sel ? list.findIndex((b) => b === this.sel.b) : -1;
    const j = i < 0 ? (dir > 0 ? 0 : list.length - 1) : i + dir;
    if (j < 0 || j >= list.length) return toast(j < 0 ? 'First board on this page: [ for the page before' : 'Last board on this page: ] for the next page');
    this.focus(list[j]);
  }
  hint(text) {
    this.hud.replaceChildren();
    if (text) this.hud.append(text);
    else this.hud.append('Scroll to move · pinch or ', el('kbd', { text: MOD }), ' scroll to zoom · double-click a board · ', el('a', { text: 'all shortcuts', onclick: showHelp }));
  }

  /* chrome */
  buildTop() {
    const pg = this.canvas.pages.find((p) => p.id === this.page), i = this.pageIndex();
    const sideBtn = el('button', { class: 'icon-btn', title: `Sidebar (${MOD} \\)`, 'aria-label': 'Sidebar', onclick: () => this.toggle('side'),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M6 2.5v11"/></svg>' });
    const panelBtn = el('button', { class: 'icon-btn', title: 'Side panel (I)', 'aria-label': 'Side panel', onclick: () => this.toggle('panel'),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11"/></svg>' });
    const canvasBtn = el('button', { class: 'crumb', 'aria-haspopup': 'menu', onclick: (e) => this.canvasMenu(e.currentTarget) }, el('span', { text: this.canvas.title }), el('span', { class: 'chev', text: '▾' }));
    const pageBtn = this.canvas.pageless ? null : el('button', { class: 'crumb', 'aria-haspopup': 'menu', onclick: (e) => this.pageMenu(e.currentTarget) }, el('span', { text: pg?.name ?? this.page }), el('span', { class: 'chev', text: '▾' }));
    const crumbs = el('nav', { class: 'crumbs', 'aria-label': 'Where you are' },
      el('a', { class: 'crumb home-c', href: '/', 'data-go': true, text: 'Canvases' }), el('span', { class: 'sep', text: '›' }),
      canvasBtn, pageBtn ? [el('span', { class: 'sep', text: '›' }), pageBtn] : null,
      this.sel ? [el('span', { class: 'sep', text: '›' }), el('span', { class: 'crumb at' }, el('span', { text: this.sel.b.t }))] : null);
    this.zoomBtn = el('button', { class: 'zoom-pct', title: 'Fit the page width (W)', onclick: () => this.fitWidth(), text: Math.round(this.cam.s * 100) + '%' });
    const motion = motionControls({ rate: this.canvasRate, scope: 'canvas', onMotion: (m) => this.motionAll(m) });
    motion.className = 'group';
    motion.title = 'Motion for every board on this page (Shift R, Shift S, Shift P)';
    this.tools = el('div', { class: 'group tools', 'data-slot': 'tools' }, TOOLS.map((t) => t.render(this)));
    this.top.replaceChildren(...[sideBtn, crumbs,
      this.canvas.pageless ? null : [
        el('button', { class: 'icon-btn', title: 'Previous page ([)', 'aria-label': 'Previous page', disabled: i <= 0, onclick: () => this.goPage(i - 1), text: '‹' }),
        el('button', { class: 'icon-btn', title: 'Next page (])', 'aria-label': 'Next page', disabled: i >= this.canvas.pages.length - 1, onclick: () => this.goPage(i + 1), text: '›' })],
      el('button', { class: 'icon-btn', title: 'Zoom out (−)', 'aria-label': 'Zoom out', onclick: () => this.zoomStep(-1), text: '−' }), this.zoomBtn,
      el('button', { class: 'icon-btn', title: 'Zoom in (+)', 'aria-label': 'Zoom in', onclick: () => this.zoomStep(1), text: '+' }),
      motion, this.tools,
      el('button', { class: 'icon-btn', title: `Find (${MOD} K)`, 'aria-label': 'Find', onclick: () => openPalette(),
        html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>' }),
      el('button', { class: 'icon-btn', title: 'Shortcuts (?)', 'aria-label': 'Shortcuts', onclick: showHelp, text: '?' }),
      panelBtn].flat().filter(Boolean));
    if (!this.hud.childNodes.length) this.hint();
  }
  canvasMenu(anchor) {
    const m = menu(anchor);
    for (const g of groupOrder()) {
      const list = INDEX.canvases.filter((c) => c.group === g); if (!list.length) continue;
      m.append(el('div', { class: 'mh', text: groupName(g) }));
      for (const c of list) m.append(el('a', { class: c.id === this.canvas.id ? 'cur' : '', href: urlFor(c.id, c.launch), 'data-go': true },
        el('span', { text: c.title }), el('span', { class: 'k', text: counts(c) })));
    }
  }
  pageMenu(anchor) {
    const m = menu(anchor);
    this.canvas.pages.forEach((p, i) => m.append(el('a', { class: p.id === this.page ? 'cur' : '', href: urlFor(this.canvas.id, p.id), 'data-go': true },
      el('span', { text: p.name }), el('span', { class: 'k', text: (i < 9 ? `${i + 1} · ` : '') + this.boardsOn(p.id).length }))));
  }
  toggle(which) {
    const cls = which === 'side' ? 'no-side' : 'no-panel';
    const off = this.root.classList.toggle(cls); store.set(which, !off);
    setTimeout(() => this.paint(), 0);
  }
  buildSide() {
    if (!this.side.firstChild) {
      this.filter = el('input', { class: 'filter', placeholder: 'Filter boards in this canvas', type: 'search', 'aria-label': 'Filter boards in this canvas' });
      this.filter.addEventListener('input', () => this.buildTree());
      this.filter.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.filter.value = ''; this.buildTree(); this.stage.focus(); } });
      this.tree = el('div', { class: 'tree' });
      this.side.append(el('div', { class: 'side-head' },
        el('a', { class: 'side-home', href: '/', 'data-go': true, text: '← All canvases' }),
        el('div', { class: 'side-title', text: this.canvas.title }), this.filter), this.tree);
    }
    this.buildTree();
  }
  buildTree() {
    const q = (this.filter?.value ?? '').trim().toLowerCase();
    const open = store.get(`open:${this.canvas.id}`, {});
    const frag = document.createDocumentFragment();
    let any = false;
    this.canvas.pages.forEach((p, i) => {
      const match = (b) => !q || b.t.toLowerCase().includes(q) || b.f.toLowerCase().includes(q);
      const hits = this.groups(p.id).map((g) => ({ ...g, boards: g.boards.filter(match) })).filter((g) => g.boards.length);
      if (q && !hits.length && !p.name.toLowerCase().includes(q)) return;
      any = true;
      const isCur = p.id === this.page, isOpen = q ? true : (open[p.id] ?? isCur);
      const head = el('div', { class: 'pg' + (isCur ? ' cur' : '') + (isOpen ? ' open' : ''), title: i < 9 ? `Page ${i + 1} (press ${i + 1})` : '', role: 'button', tabindex: '0', 'aria-expanded': String(isOpen) },
        el('span', { class: 'caret', text: '▸' }), el('span', { text: p.name }), el('span', { class: 'n', text: this.boardsOn(p.id).length }));
      const activate = (e) => {
        if (e.target.classList?.contains('caret') || isCur) { open[p.id] = !isOpen; store.set(`open:${this.canvas.id}`, open); return this.buildTree(); }
        go(urlFor(this.canvas.id, p.id));
      };
      head.addEventListener('click', activate);
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } });
      frag.append(head);
      if (!isOpen) return;
      for (const g of hits) {
        if (g.heading) frag.append(el('div', { class: 'grp', text: g.heading }));
        for (const b of g.boards) {
          const row = el('a', { class: 'bd' + (g.heading ? ' ingrp' : ''), 'data-f': p.id + '/' + b.f, href: urlFor(this.canvas.id, p.id, b.f), title: b.t, text: b.t });
          row.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); this.openBoard(p.id, b); });
          frag.append(row);
        }
      }
    });
    if (!any) frag.append(el('div', { class: 'none', text: 'Nothing matches.' }));
    this.tree.replaceChildren(frag);
    this.markSide();
  }
  openBoard(page, b) { if (page === this.page) { this.focus(b); this.stage.focus(); } else go(urlFor(this.canvas.id, page, b.f)); }
  markSide() {
    if (!this.tree) return;
    this.tree.querySelectorAll('.bd.cur').forEach((n) => n.classList.remove('cur'));
    if (!this.sel) return;
    const n = this.tree.querySelector(`.bd[data-f="${CSS.escape(this.page + '/' + this.sel.b.f)}"]`);
    if (n) { n.classList.add('cur'); n.scrollIntoView({ block: 'nearest' }); }
  }

  /* the side panel: tabs, then the open tab's body */
  buildPanel() {
    if (!PANELS.some((p) => p.id === this.tab)) this.tab = PANELS[0].id;
    const tabs = el('div', { class: 'tabs', role: 'tablist' }, PANELS.map((p) => el('button', {
      class: 'tab', role: 'tab', 'aria-selected': String(p.id === this.tab), 'data-tab': p.id, text: p.label,
      onclick: () => { this.tab = p.id; store.set('tab', p.id); this.buildPanel(); },
    })));
    this.panelBody = el('div', { class: 'panel-body', role: 'tabpanel' });
    this.panel.replaceChildren(tabs, this.panelBody);
    PANELS.find((p) => p.id === this.tab).render(this.panelBody, this);
  }
  renderProperties(body) {
    const rec = this.sel;
    if (!rec) {
      body.replaceChildren(
        el('h3', { text: this.canvas.title }),
        el('p', { class: 'note', text: 'Select a board to see its kit and adjust its values.' }),
        el('h4', { text: 'Motion on this page' }),
        motionControls({ rate: this.canvasRate, scope: 'page', onMotion: (m) => this.motionAll(m) }));
      return;
    }
    const key = keyOf(this.canvas.id, rec.b.f);
    renderBoardPanel(body, {
      board: rec.b,
      state: rec.state,
      values: rec.state?.values,
      kits: KITS,
      namespace: INDEX.namespace,
      choice: choiceFor(this.canvas.id, rec.b),
      defaultChoice: rec.b.kit ?? 'pinned',
      rate: this.rateOf(rec),
      onSet: (name, value) => this.setValue(rec, name, value),
      onReset: () => this.resetBoard(rec),
      onKit: (choice) => this.switchKit(rec, choice),
      onMotion: (m) => this.motion(rec, m),
      onCopyJson: () => copyText(valuesJson(rec.state?.values ?? overrides.get(key) ?? {}), 'Values copied as JSON'),
      onCopyLink: () => copyText(this.boardLink(rec), 'Link copied'),
      onOpen: () => window.open(this.frameSrc(rec), '_blank'),
    });
  }

  /* mouse and trackpad */
  onWheel(e) {
    cancelAnimationFrame(this.anim);
    const r = this.stage.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
    let dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      const k = Math.exp(-dy * (e.ctrlKey && !e.metaKey ? 0.012 : 0.004)); // pinch arrives as ctrl + wheel
      return this.zoomAt(this.cam.s * k, e.clientX - r.left, e.clientY - r.top);
    }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    this.pan(-dx, -dy);
  }
  bindPointer() {
    this.stage.addEventListener('wheel', (e) => { e.preventDefault(); this.onWheel(e); }, { passive: false });
    let drag = null;
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.target === this.mini) { this.miniDrag = true; this.miniJump(e); this.stage.setPointerCapture(e.pointerId); return; }
      const onBoard = e.target.closest('.board');
      const can = e.button === 1 || (e.button === 0 && (spaceDown || !onBoard || e.target.classList.contains('shield')));
      if (!can) return;
      if (e.button === 1) e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false, board: onBoard };
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (this.miniDrag) return this.miniJump(e);
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; cancelAnimationFrame(this.anim); this.stage.classList.add('dragging'); this.stage.setPointerCapture(e.pointerId); }
      this.setCam({ x: drag.cx + dx, y: drag.cy + dy });
    });
    const end = (e) => {
      if (this.miniDrag) { this.miniDrag = false; return; }
      if (!drag || e.pointerId !== drag.id) return;
      this.stage.classList.remove('dragging');
      if (!drag.moved && e.button === 0 && e.type === 'pointerup') {
        if (drag.board) { const rec = this.els.get(drag.board.dataset.f); if (rec) this.select(rec.b); }
        else if (this.sel) this.release();
      }
      drag = null;
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    this.stage.addEventListener('dblclick', (e) => {
      if (e.target === this.mini) return;
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('board'));
      const onBoard = e.target.closest('.board') ?? under;
      if (onBoard) { const rec = this.els.get(onBoard.dataset.f); if (rec) this.focus(rec.b); }
      else this.fitWidth();
    });
    this.stage.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  }

  /* keyboard */
  key(e) {
    const k = e.key, mod = e.metaKey || e.ctrlKey;
    const { W, H } = this.size(), small = e.shiftKey ? 480 : 120;
    if (mod && (k === '=' || k === '+')) return this.zoomStep(1), true;
    if (mod && (k === '-' || k === '_')) return this.zoomStep(-1), true;
    if (mod && k === '0') return this.zoomAt(1, W / 2, H / 2, true), true;
    if (mod && k === '\\') return this.toggle('side'), true;
    if (mod || e.altKey) return false;
    if (e.shiftKey && e.code === 'Digit0') return this.zoomAt(1, W / 2, H / 2, true), true;
    if (e.shiftKey && e.code === 'Digit1') return this.fitAll(), true;
    if (e.shiftKey && e.code === 'Digit2') { if (this.sel) this.fitBoard(this.sel.b); return true; }
    if (!e.shiftKey && /^Digit[1-9]$/.test(e.code)) { this.goPage(Number(e.code.slice(5)) - 1); return true; }
    switch (k) {
      case '+': case '=': this.zoomStep(1); return true;
      case '-': case '_': this.zoomStep(-1); return true;
      case 'ArrowRight': e.shiftKey ? this.pan(-small, 0) : this.step(1); return true;
      case 'ArrowLeft': e.shiftKey ? this.pan(small, 0) : this.step(-1); return true;
      case 'ArrowDown': this.pan(0, -small); return true;
      case 'ArrowUp': this.pan(0, small); return true;
      case 'j': case 'J': this.step(1); return true;
      case 'k': case 'K': this.step(-1); return true;
      case ']': this.goPage(this.pageIndex() + 1); return true;
      case '[': this.goPage(this.pageIndex() - 1); return true;
      case 'Enter': this.sel ? this.fitBoard(this.sel.b) : this.step(1); return true;
      case 'w': case 'W': this.fitWidth(); return true;
      case 'i': case 'I': this.toggle('panel'); return true;
      case 'r': case 'R': this.motionKey('replay', e.shiftKey); return true;
      case 's': case 'S': this.motionKey('slow', e.shiftKey); return true;
      case 'p': case 'P': this.motionKey('pause', e.shiftKey); return true;
      case 'm': case 'M': this.mini.classList.toggle('off'); store.set('mini', !this.mini.classList.contains('off')); this.drawMini(); return true;
      case 'o': case 'O': if (this.sel) window.open(this.frameSrc(this.sel), '_blank'); return true;
      case 'l': case 'L': {
        const url = this.sel ? this.boardLink(this.sel) : location.origin + urlFor(this.canvas.id, this.page);
        copyText(url, 'Link copied');
        return true;
      }
      case 'Escape':
        if (this.live || this.sel) { this.release({ fit: !!this.live }); return true; }
        return false;
      case 'Home': this.fitWidth(); return true;
    }
    return false;
  }
}

function scrollsInside(node, dx, dy) {
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    const cs = n.ownerDocument.defaultView.getComputedStyle(n);
    if (dy && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) {
      if ((dy < 0 && n.scrollTop > 0) || (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return true;
    }
    if (dx && /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) {
      if ((dx < 0 && n.scrollLeft > 0) || (dx > 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1)) return true;
    }
  }
  return false;
}

/* ---------- menus ---------- */
let openMenu = null;
function menu(anchor) {
  closeMenu();
  const r = anchor.getBoundingClientRect();
  const m = el('div', { class: 'menu', role: 'menu' });
  m.style.left = Math.max(8, r.left) + 'px'; m.style.top = r.bottom + 4 + 'px';
  document.body.append(m); openMenu = m;
  setTimeout(() => m.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }), 0);
  return m;
}
function closeMenu() { openMenu?.remove(); openMenu = null; }
document.addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.crumb')) closeMenu(); }, true);
document.addEventListener('click', (e) => { if (openMenu && e.target.closest('.menu a')) closeMenu(); });

/* ---------- find anything ---------- */
let overlay = null;
function closeOverlays() { overlay?.remove(); overlay = null; closeMenu(); }
function searchItems() {
  const items = [];
  for (const c of INDEX.canvases) {
    items.push({ kind: 'Canvas', title: c.title, where: counts(c), url: urlFor(c.id, c.launch), hay: `${c.title} ${c.id}`, c: c.id });
    if (!c.pageless) for (const p of c.pages) items.push({ kind: 'Page', title: p.name, where: c.title, url: urlFor(c.id, p.id), hay: `${p.name} ${c.title}`, c: c.id });
    for (const b of c.boards) {
      const p = c.pages.find((x) => x.id === b.p);
      items.push({ kind: 'Board', title: b.t, where: c.pageless ? c.title : `${c.title} › ${p?.name ?? b.p}`, url: urlFor(c.id, b.p, b.f), hay: `${b.t} ${slug(b.f)} ${p?.name ?? ''} ${c.title}`, c: c.id });
    }
  }
  return items;
}
function openPalette() {
  closeOverlays();
  const items = searchItems();
  const input = el('input', { placeholder: 'Find a canvas, page or board…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Find a canvas, page or board', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'finder-results' });
  const res = el('div', { class: 'res', id: 'finder-results', role: 'listbox' });
  let shown = [], on = 0;
  const here = view?.canvas.id;
  const run = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const score = (it) => {
      const t = it.title.toLowerCase(), h = it.hay.toLowerCase();
      if (!words.every((w) => h.includes(w))) return -1;
      let s = 0;
      if (words.length && t.startsWith(words[0])) s += 6;
      if (words.every((w) => t.includes(w))) s += 4;
      if (it.kind === 'Canvas') s += 3; else if (it.kind === 'Page') s += 2;
      if (it.c === here) s += 1.5;
      return s;
    };
    shown = (words.length ? items.map((it) => ({ it, s: score(it) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.it)
      : items.filter((it) => it.kind === 'Canvas' || (it.kind === 'Page' && it.c === here))).slice(0, 60);
    on = 0; draw();
  };
  const draw = () => {
    res.replaceChildren(...shown.map((it, i) => {
      const row = el('div', { class: 'it' + (i === on ? ' on' : ''), role: 'option', 'aria-selected': String(i === on), id: `finder-${i}` },
        el('span', { class: 'kind', text: it.kind }), el('span', { class: 'tt', text: it.title }), el('span', { class: 'wh', text: it.where }));
      row.addEventListener('mousemove', () => { if (on !== i) { on = i; draw(); } });
      row.addEventListener('click', () => pick(it));
      return row;
    }));
    if (!shown.length) res.append(el('div', { class: 'it' }, el('span', { class: 'tt', text: 'Nothing matches.' })));
    input.setAttribute('aria-activedescendant', shown.length ? `finder-${on}` : '');
    res.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (it) => { closeOverlays(); go(it.url); };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { on = Math.min(shown.length - 1, on + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { on = Math.max(0, on - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (shown[on]) pick(shown[on]); e.preventDefault(); }
    else if (e.key === 'Escape') { closeOverlays(); e.preventDefault(); }
  });
  overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) closeOverlays(); } },
    el('div', { class: 'palette', role: 'dialog', 'aria-label': 'Find' }, input, res, el('div', { class: 'foot' },
      el('span', {}, el('kbd', { text: '↑ ↓' }), ' move'), el('span', {}, el('kbd', { text: '↵' }), ' open'), el('span', {}, el('kbd', { text: 'Esc' }), ' close'))));
  document.body.append(overlay);
  run(); input.focus();
}

/* ---------- shortcuts ---------- */
const SHORTCUTS = [
  ['Getting around', [
    ['Find any canvas, page or board', [MOD + ' K', '/']], ['All canvases', ['Canvases, top left']],
    ['Next and previous page', [']', '[']], ['Go to page 1 to 9', ['1 … 9']],
    ['Next and previous board', ['→', '←', 'J', 'K']], ['Fit the selected board, and use it', ['Enter', 'Shift 2', 'Double-click']],
    ['Let go of a board', ['Esc']], ['Sidebar', [MOD + ' \\']], ['Side panel', ['I']], ['Map of the page', ['M']],
  ]],
  ['Zoom', [
    ['Zoom in and out', [MOD + ' +', MOD + ' −', '+', '−']], ['Zoom with the pointer', ['Pinch', MOD + ' scroll']],
    ['Fit the page width', ['W', 'Double-click empty canvas']], ['The whole page', ['Shift 1']], ['Actual size', ['Shift 0', MOD + ' 0']],
  ]],
  ['Move', [
    ['Move around', ['Scroll', 'Drag the canvas']], ['Move sideways with a mouse', ['Shift scroll']],
    ['Drag anywhere, even over a board', ['Space drag', 'Middle drag']], ['Move with the keyboard', ['↑', '↓', 'Shift ←', 'Shift →']],
  ]],
  ['Motion (the selected board, or the page when none is)', [
    ['Replay', ['R']], ['Quarter speed, and back', ['S']], ['Pause, and play', ['P']], ['The same for every board on the page', ['Shift R', 'Shift S', 'Shift P']],
  ]],
  ['A board', [
    ['Open it on its own', ['O']], ['Copy a link to it, with its kit and values', ['L']], ['Shortcuts', ['?']],
  ]],
  ['Comments', [
    ['Comment mode on and off', ['C']], ['Comment on an element', ['Click it, in comment mode']], ['Comment on an area', ['Drag a box, in comment mode']],
    ['Comment on the selected board', ['Shift C']], ['Cancel', ['Esc']], ['Post a comment or reply', ['Enter']], ['A new line', ['Shift Enter']],
  ]],
];
function showHelp() {
  closeOverlays();
  const cols = el('div', { class: 'cols' });
  for (const [h, rows] of SHORTCUTS) {
    cols.append(el('h4', { text: h }));
    for (const [what, keys] of rows) cols.append(el('div', { class: 'row' }, el('span', { text: what }), el('span', {}, keys.map((k) => el('kbd', { text: k })))));
  }
  overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay || e.target.closest('.help')) closeOverlays(); } },
    el('div', { class: 'help', role: 'dialog', 'aria-label': 'Keyboard shortcuts' }, el('h3', { text: 'Getting around the canvases' }), cols));
  document.body.append(overlay);
}

/* ---------- keys ---------- */
let spaceDown = false;
function onKey(e, fromBoard = false) {
  const typing = !fromBoard && e.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'k' || e.key === 'K')) { overlay ? closeOverlays() : openPalette(); return true; }
  if (overlay || openMenu) { if (e.key === 'Escape') { closeOverlays(); return true; } return false; }
  if (typing) return false;
  for (const l of LAYERS) if (l.key?.(e, view, fromBoard)) return true;
  if (fromBoard && e.key !== 'Escape' && !mod) return false; // a live board keeps its own keys
  if (fromBoard && e.key === 'Escape' && e.defaultPrevented) return false; // the board used Esc itself (a menu or dialog)
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) { showHelp(); return true; }
  if (e.key === '/') { openPalette(); return true; }
  // Enter and Space on a focused control belong to that control.
  if ((e.key === 'Enter' || e.key === ' ') && !fromBoard && e.target.closest?.('button, a, summary, [role="button"], [role="tab"], [role="option"]')) return false;
  if (e.key === ' ' && view) { spaceDown = true; view.stage.classList.add('panning'); return true; }
  return view ? view.key(e) : false;
}
function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; view?.stage.classList.remove('panning'); } }
addEventListener('keydown', (e) => { if (onKey(e)) e.preventDefault(); });
addEventListener('keyup', onKeyUp);
addEventListener('blur', () => { spaceDown = false; view?.stage.classList.remove('panning'); });

/* ---------- messages from boards ---------- */
addEventListener('message', (e) => {
  if (e.origin !== location.origin || !view) return;
  const data = e.data;
  if (!data || typeof data.type !== 'string' || !data.type.startsWith('canvas:')) return;
  const rec = view.recForWindow(e.source);
  if (rec) view.onMessage(rec, data);
});

/* ---------- live reload ---------- */
let indexTimer;
async function refreshIndex() {
  await loadIndex();
  if (!view) return showHome();
  const fresh = canvasById(view.canvas.id);
  if (!fresh) return route();
  const layout = (c) => JSON.stringify([c.pages, c.boards]);
  if (layout(fresh) === layout(view.canvas)) { view.canvas = fresh; return; }
  const cam = { ...view.cam }, page = view.page, sel = view.sel?.b.f;
  view.canvas = fresh; view.page = null;
  if (!fresh.pages.some((p) => p.id === page)) return route();
  view.show(page, sel ? fresh.boards.find((b) => b.f === sel && b.p === page) : null); view.setCam(cam);
}
const events = new EventSource('/_events');
events.onmessage = async (m) => {
  let d;
  try { d = JSON.parse(m.data); } catch { return; }
  if (d.type === 'index') { clearTimeout(indexTimer); indexTimer = setTimeout(refreshIndex, 120); return; }
  for (const l of LAYERS) l.event?.(d);
  if (!view && d.type !== 'kits' && d.type !== 'kit') return;
  if (d.type === 'files') {
    const mine = d.changes.filter((c) => c.canvas === view.canvas.id && c.file !== 'canvas.json').map((c) => c.file);
    if (mine.length) view.onFilesChanged(mine);
  } else if (d.type === 'skin') {
    for (const rec of view.els.values()) view.reload(rec);
  } else if (d.type === 'kit') {
    await loadKits();
    view?.refreshKits();
    view?.onKitRebuilt(d.kit);
  } else if (d.type === 'kits') {
    await loadKits();
    view?.refreshKits();
    if (view) for (const rec of view.els.values()) if (choiceFor(view.canvas.id, rec.b) !== 'pinned') view.reload(rec);
  }
};

await Promise.all([loadIndex(), loadKits()]);
await installComments({ PANELS, TOOLS, LAYERS, onBoardMessage, getView: () => view, getIndex: () => INDEX, go, urlFor, choiceFor, keyOf, slug });
route();
