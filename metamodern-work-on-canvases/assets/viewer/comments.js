/* Comments in the viewer (contract 4, references/comments.md). C (or the Comment button) turns comment mode on:
   click an element on any board at any zoom, drag a box for an area, or comment on the selected board (Shift C),
   then type. Each comment is a pin on its board and a thread in the Comments tab; Send all to agent bundles every
   open comment into one batch. Comments are files in the project, written by the viewer's server; agents reply
   through `canvas comments`, and their replies show up here as the files change.

   Picking happens inside each board (canvas:pick, canvas:picked); after a board loads, every comment on it is
   located again by its label (canvas:locate, canvas:located): a comment whose element is gone shows as moved, at
   its last position. */
import { el, toast } from './dom.js';

const STATUS_NAMES = { pending: 'Open', acknowledged: 'Addressed', resolved: 'Resolved', dismissed: 'Dismissed' };
const FILTERS = [{ id: 'open', label: 'Open' }, { id: 'resolved', label: 'Resolved' }, { id: 'all', label: 'All' }];
const isOpen = (c) => c.status === 'pending' || c.status === 'acknowledged';

export async function installComments(api) {
  const { PANELS, TOOLS, LAYERS, onBoardMessage, getView, go, urlFor, choiceFor, slug } = api;
  const state = {
    comments: [],
    batches: [],
    problems: [],
    mode: false,
    filter: 'open',
    active: null, // the comment id open in the panel and highlighted on the canvas
    draft: null, // {rec, kind, picked?, rect}
    places: new Map(), // id -> {rect, moved}: where the comment's element is now, as the open board reports it
    replies: new Map(), // id -> reply text being typed
    flyTo: null,
  };

  let loads = 0;
  async function load() {
    // Only the latest read counts: an older answer arriving late never overwrites a newer one.
    const mine = ++loads;
    try {
      const data = await (await fetch('/_comments', { cache: 'no-store' })).json();
      if (mine !== loads) return;
      state.comments = data.comments ?? [];
      state.batches = data.batches ?? [];
      state.problems = data.problems ?? [];
    } catch { return; }
    refresh();
    const view = getView();
    if (view) for (const rec of view.els.values()) if (rec.state?.ready) locateAll(view, rec, { persist: false });
  }

  async function call(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `The viewer answered ${res.status}`);
    return data;
  }

  /* ---------- which comments, where ---------- */
  const onBoard = (view, rec) => state.comments.filter((c) => c.canvas.canvas === view.canvas.id && c.canvas.board === slug(rec.b.f) && c.canvas.page === rec.b.p);
  const placeOf = (c) => {
    const live = state.places.get(c.id);
    return { rect: live?.rect ?? c.canvas.rect, moved: live ? live.moved : c.canvas.moved };
  };
  const activeBatch = (c) => c.canvas.batch && state.batches.find((b) => b.id === c.canvas.batch && b.status !== 'done');
  const sendable = () => state.comments.filter((c) => c.status === 'pending' && !activeBatch(c));
  // Pins are numbered per canvas, oldest first, counting every comment so a number never changes.
  const numberOf = (c) => state.comments.filter((x) => x.canvas.canvas === c.canvas.canvas).indexOf(c) + 1;

  /* ---------- locating: after a board loads, every comment finds its element again ---------- */
  function locateAll(view, rec, { persist }) {
    const list = onBoard(view, rec).filter((c) => c.canvas.kind === 'element' && c.status !== 'resolved');
    // Answers come back in the order asked, so each canvas:located is matched to the oldest question waiting.
    rec.locateQueue = (rec.locateQueue ?? []).concat(list.map((c) => ({ id: c.id, persist })));
    for (const c of list) {
      view.post(rec, 'canvas:locate', { label: c.canvas.label, labelKind: c.canvas.labelKind, elementPath: c.elementPath, ...(c.canvas.text ? { text: c.canvas.text } : {}) });
    }
  }
  function located(view, rec, data) {
    const next = rec.locateQueue?.shift();
    if (!next) return;
    const c = state.comments.find((x) => x.id === next.id);
    if (!c) return;
    const place = data.missing ? { rect: c.canvas.rect, moved: true } : { rect: data.rect, moved: false };
    state.places.set(c.id, place);
    drawPins(view);
    if (state.active === c.id || getView()?.tab === 'comments') refreshPanel();
    // The file keeps the last place the element was found, and whether it is gone, when the board loads.
    if (!next.persist) return;
    const r = c.canvas.rect;
    const same = !data.missing && ['x', 'y', 'w', 'h'].every((k) => Math.abs(data.rect[k] - r[k]) < 0.5);
    if ((data.missing && !c.canvas.moved) || (!data.missing && (!same || c.canvas.moved))) {
      call(`/_comments/${c.id}/place`, data.missing ? { moved: true } : { rect: data.rect, boardWidth: rec.b.w }).catch((e) => console.error(e));
    }
  }

  /* ---------- comment mode ---------- */
  function setMode(on) {
    state.mode = on;
    const view = getView();
    if (!view) return;
    view.root.classList.toggle('commenting', on);
    // Boards run live from 10% zoom while commenting, so any board on screen can be picked.
    view.liveMinZoom = on ? 0.1 : undefined;
    for (const rec of view.els.values()) if (rec.state?.ready) view.post(rec, 'canvas:pick', { enabled: on });
    if (!on) cancelDraft();
    view.paint();
    view.buildTop();
    view.hint(on ? 'Comment mode: click an element, or drag a box for an area. Esc to stop.' : undefined);
  }

  function kitFor(view, rec) {
    const k = rec.state?.kit;
    if (k) return { mode: k.mode === 'live' ? 'live' : 'pinned', ref: k.ref ?? null, version: k.version ?? null };
    const choice = choiceFor(view.canvas.id, rec.b);
    return { mode: choice === 'pinned' ? 'pinned' : 'live', ref: choice === 'pinned' ? null : choice.slice(5), version: null };
  }

  function openDraft(view, rec, kind, picked, rect) {
    cancelDraft();
    state.draft = { rec, kind, picked, rect };
    if (view.sel !== rec) view.select(rec.b);
    const box = kind === 'element' ? null : el('div', { class: 'cm-area', style: rectStyle(rect) });
    const input = el('textarea', { class: 'cm-input', rows: 3, placeholder: kind === 'board' ? 'Comment on this board' : kind === 'area' ? 'Comment on this area' : 'Add a comment', 'aria-label': 'Comment', 'data-test': 'comment-input' });
    const submit = el('button', { type: 'button', class: 'btn primary', text: 'Comment', 'data-test': 'comment-submit', onclick: () => postDraft() });
    const cancel = el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => cancelDraft() });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelDraft(); }
      else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); postDraft(); }
    });
    const composer = el('div', { class: 'cm-composer', style: `left: ${rect.x}px; top: ${rect.y + rect.h}px`, role: 'dialog', 'aria-label': 'New comment' },
      kind === 'element' ? el('div', { class: 'cm-what', text: `${picked.element}${picked.labelKind === 'path' ? '' : ` · ${picked.label}`}` }) : null,
      input, el('div', { class: 'cm-actions' }, cancel, submit));
    state.draft.nodes = [box, composer].filter(Boolean);
    layer(rec).append(...state.draft.nodes);
    // The press that picked the element ends inside the board's frame, which keeps the focus until the pointer
    // events are over: take it once they are.
    const take = () => { if (state.draft?.nodes.includes(composer) && document.activeElement !== input) input.focus({ preventScroll: true }); };
    take();
    requestAnimationFrame(() => requestAnimationFrame(take));
    setTimeout(take, 120);
  }
  function cancelDraft() {
    for (const n of state.draft?.nodes ?? []) n.remove();
    state.draft = null;
  }
  async function postDraft() {
    const d = state.draft;
    if (!d) return;
    const input = d.nodes.at(-1).querySelector('textarea');
    const words = input.value.trim();
    if (!words) { input.focus(); return; }
    const view = getView();
    const { rec } = d;
    const p = d.picked;
    const body = {
      canvas: view.canvas.id, page: rec.b.p, board: slug(rec.b.f), kind: d.kind, comment: words,
      rect: d.rect, boardWidth: rec.b.w, kit: kitFor(view, rec), props: rec.state?.values ?? {},
      url: location.origin + urlFor(view.canvas.id, rec.b.p, rec.b.f),
      ...(p ? { label: p.label, labelKind: p.labelKind, elementPath: p.elementPath, element: p.element, text: p.text, nearbyText: p.nearbyText, ...(p.reactComponents ? { reactComponents: p.reactComponents } : {}) } : {}),
    };
    input.disabled = true;
    // Posted: Esc from here on leaves comment mode instead of cancelling a comment that is being saved.
    state.draft = null;
    try {
      const c = await call('/_comments', body);
      for (const node of d.nodes) node.remove();
      state.comments = state.comments.filter((x) => x.id !== c.id).concat(c);
      state.active = c.id;
      refresh();
      toast('Comment saved');
    } catch (error) {
      input.disabled = false;
      if (!state.draft) state.draft = d; else for (const node of d.nodes) node.remove();
      toast(`Not saved: ${error.message}`);
    }
  }

  /* ---------- pins ---------- */
  const rectStyle = (r) => `left: ${r.x}px; top: ${r.y}px; width: ${r.w}px; height: ${r.h}px`;
  function layer(rec) {
    let l = rec.el.querySelector(':scope > .cm-layer');
    if (!l) { l = el('div', { class: 'cm-layer' }); rec.el.append(l); }
    return l;
  }
  function drawPins(view) {
    if (!view) return;
    for (const rec of view.els.values()) {
      const l = layer(rec);
      for (const n of l.querySelectorAll('.cm-pin, .cm-mark')) n.remove();
      for (const c of onBoard(view, rec)) {
        if (state.filter === 'open' && !isOpen(c)) continue;
        if (state.filter === 'resolved' && c.status !== 'resolved') continue;
        const { rect, moved } = placeOf(c);
        const active = state.active === c.id;
        if (active && c.canvas.kind !== 'board') l.append(el('div', { class: 'cm-mark' + (moved ? ' moved' : ''), style: rectStyle(rect) }));
        const pin = el('button', {
          type: 'button', class: `cm-pin ${c.status}${moved ? ' moved' : ''}${active ? ' active' : ''}`, style: `left: ${rect.x}px; top: ${rect.y}px`,
          'data-comment': c.id, 'aria-label': `Comment ${numberOf(c)}${moved ? ', moved' : ''}: ${c.comment}`,
          title: `${moved ? 'Moved: its element is gone, shown where it was. ' : ''}${c.comment}`, text: String(numberOf(c)),
        });
        pin.addEventListener('pointerdown', (e) => e.stopPropagation());
        pin.addEventListener('click', (e) => { e.stopPropagation(); focusComment(c.id, { fly: false }); });
        l.append(pin);
      }
    }
  }

  /* ---------- the panel ---------- */
  function focusComment(id, { fly = true } = {}) {
    state.active = id;
    const view = getView();
    const c = state.comments.find((x) => x.id === id);
    if (!view || !c) return;
    if (view.tab !== 'comments') { view.tab = 'comments'; }
    if (c.canvas.canvas !== view.canvas.id || c.canvas.page !== view.page) {
      state.flyTo = id;
      go(urlFor(c.canvas.canvas, c.canvas.page, `${c.canvas.board}.dc.html`));
      return;
    }
    const rec = [...view.els.values()].find((r) => slug(r.b.f) === c.canvas.board);
    if (rec && view.sel !== rec) view.select(rec.b);
    else view.buildPanel();
    drawPins(view);
    if (fly && rec) flyToPin(view, rec, c);
  }
  function flyToPin(view, rec, c) {
    const { rect } = placeOf(c);
    const { W, H } = view.size();
    const s = Math.min(2, Math.max(view.cam.s, 0.75));
    const cx = rec.b.x + rect.x + Math.min(rect.w, W / s) / 2, cy = rec.b.y + rect.y + Math.min(rect.h, H / s) / 2;
    view.moveTo({ s, x: W / 2 - cx * s, y: H / 2 - cy * s });
  }

  function refreshPanel() {
    const view = getView();
    if (!view || view.tab !== 'comments' || !view.panelBody) return;
    // Keep what is being typed in a reply.
    const focused = document.activeElement?.closest?.('.panel') ? document.activeElement.dataset.reply : null;
    renderPanel(view.panelBody, view);
    if (focused) view.panelBody.querySelector(`[data-reply="${CSS.escape(focused)}"]`)?.focus();
  }
  function refresh() {
    const view = getView();
    if (!view) return;
    drawPins(view);
    refreshPanel();
    view.top.querySelectorAll('[data-test="send-all"]').forEach((b) => updateSend(b));
  }

  function thread(c) {
    const items = [el('li', { class: 'cm-msg human' }, el('span', { class: 'who', text: 'You' }), el('p', { text: c.comment }))];
    for (const m of c.thread) items.push(el('li', { class: `cm-msg ${m.role}` }, el('span', { class: 'who', text: m.role === 'agent' ? 'Agent' : 'You' }), el('p', { text: m.content })));
    return el('ol', { class: 'cm-thread' }, items);
  }
  function item(c, view) {
    const { moved } = placeOf(c);
    const active = state.active === c.id;
    const batch = activeBatch(c);
    const chips = [el('span', { class: `chip-s ${c.status}`, text: STATUS_NAMES[c.status] ?? c.status })];
    if (moved) chips.push(el('span', { class: 'chip-s moved', text: 'Moved' }));
    if (batch) chips.push(el('span', { class: 'chip-s sent', text: batch.status === 'taken' ? 'With the agent' : 'Sent' }));
    const what = c.canvas.kind === 'board' ? 'Whole board' : c.canvas.kind === 'area' ? 'Area' : c.element;
    const head = el('button', { type: 'button', class: 'cm-head', 'aria-expanded': String(active), 'data-test': 'comment-item', 'data-comment': c.id,
      onclick: () => (active ? (state.active = null, refresh()) : focusComment(c.id)) },
    el('span', { class: 'n', text: String(numberOf(c)) }),
    el('span', { class: 'cm-sum' }, el('span', { class: 'cm-text', text: c.comment }), el('span', { class: 'cm-meta' }, el('span', { text: what }), chips,
      c.thread.length ? el('span', { text: `${c.thread.length} ${c.thread.length === 1 ? 'reply' : 'replies'}` }) : null)));
    if (!active) return el('li', { class: 'cm-item' }, head);
    const reply = el('textarea', { rows: 2, class: 'cm-reply', 'data-reply': c.id, placeholder: c.status === 'pending' ? 'Reply' : 'Reply to reopen', 'aria-label': 'Reply' });
    reply.value = state.replies.get(c.id) ?? '';
    reply.addEventListener('input', () => state.replies.set(c.id, reply.value));
    const send = async () => {
      const content = reply.value.trim();
      if (!content) return;
      try {
        replace(await call(`/_comments/${c.id}/reply`, { content }));
        state.replies.delete(c.id);
        refresh();
      } catch (error) { toast(error.message); }
    };
    reply.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    const actions = el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn', text: c.status === 'pending' ? 'Reply' : 'Reply and reopen', 'data-test': 'comment-reply', onclick: send }),
      c.status !== 'resolved' ? el('button', { type: 'button', class: 'btn', text: 'Resolve', 'data-test': 'comment-resolve', onclick: async () => {
        try { replace(await call(`/_comments/${c.id}/resolve`)); state.active = null; refresh(); toast('Resolved'); } catch (error) { toast(error.message); }
      } }) : null);
    const facts = el('p', { class: 'note cm-facts', text: [
      moved ? 'Its element is gone from the board, so the pin shows where it was.' : null,
      c.canvas.kit ? `Made on the ${c.canvas.kit.mode === 'live' ? `live kit ${c.canvas.kit.ref ?? ''}` : 'pinned kit'}${c.canvas.kit.version ? ` ${c.canvas.kit.version}` : ''}.` : null,
    ].filter(Boolean).join(' ') });
    return el('li', { class: 'cm-item active' }, head, thread(c), facts, reply, actions);
  }
  const replace = (c) => { state.comments = state.comments.map((x) => (x.id === c.id ? c : x)); };

  function renderPanel(body, view) {
    const shown = state.comments.filter((c) => (state.filter === 'open' ? isOpen(c) : state.filter === 'resolved' ? c.status === 'resolved' : true));
    const filter = el('div', { class: 'seg', role: 'group', 'aria-label': 'Which comments' }, FILTERS.map((f) => el('button', {
      type: 'button', text: f.label, 'aria-pressed': String(state.filter === f.id), 'data-test': `comments-${f.id}`,
      onclick: () => { state.filter = f.id; refresh(); },
    })));
    const top = el('div', { class: 'actions cm-top' }, filter,
      view.sel ? el('button', { type: 'button', class: 'btn', text: 'Comment on this board', title: 'Shift C', 'data-test': 'comment-board', onclick: () => boardComment(view) }) : null);
    const parts = [top];
    if (!state.mode) parts.push(el('p', { class: 'note', text: 'Press C to comment, then click an element or drag a box on any board.' }));
    for (const p of state.problems) parts.push(el('p', { class: 'note warn', text: `${p.file}: ${p.issues.join('; ')}` }));
    // By canvas (this one first), then by board.
    const canvases = [...new Set([view.canvas.id, ...shown.map((c) => c.canvas.canvas)])];
    const index = api.getIndex();
    for (const cid of canvases) {
      const mine = shown.filter((c) => c.canvas.canvas === cid);
      if (!mine.length) continue;
      const canvas = index.canvases.find((x) => x.id === cid);
      parts.push(el('h3', { class: 'cm-canvas', text: canvas?.title ?? cid }));
      const boards = [...new Set(mine.map((c) => `${c.canvas.page}/${c.canvas.board}`))];
      for (const key of boards) {
        const [page, board] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
        const b = canvas?.boards.find((x) => slug(x.f) === board && x.p === page);
        parts.push(el('h4', { text: b?.t ?? board }));
        parts.push(el('ol', { class: 'cm-list' }, mine.filter((c) => c.canvas.board === board && c.canvas.page === page).map((c) => item(c, view))));
      }
    }
    if (!shown.length) parts.push(el('p', { class: 'note', text: state.filter === 'resolved' ? 'No resolved comments.' : state.filter === 'open' ? 'No open comments.' : 'No comments yet.' }));
    body.replaceChildren(...parts);
  }

  function boardComment(view) {
    const rec = view.sel;
    if (!rec) { toast('Select a board first'); return; }
    openDraft(view, rec, 'board', null, { x: 0, y: 0, w: rec.b.w, h: rec.b.h });
  }

  /* ---------- Send all to agent ---------- */
  function updateSend(button) {
    const n = sendable().length;
    button.querySelector('.count').textContent = n ? String(n) : '';
    button.disabled = !n;
    button.title = n ? `Send ${n} open ${n === 1 ? 'comment' : 'comments'} to the agent as one batch` : 'No open comments to send';
  }
  async function sendAll() {
    try {
      const { batch } = await call('/_comments/send');
      if (!batch) { toast('No open comments to send'); return; }
      state.batches = state.batches.concat(batch);
      await load();
      toast(`Sent ${batch.comments.length} ${batch.comments.length === 1 ? 'comment' : 'comments'} to the agent`);
    } catch (error) { toast(`Not sent: ${error.message}`); }
  }

  /* ---------- wiring into the viewer ---------- */
  PANELS.push({ id: 'comments', label: 'Comments', render: (body, view) => renderPanel(body, view) });
  TOOLS.push({
    render: (view) => {
      const toggle = el('button', { type: 'button', class: 'icon-btn', title: 'Comment (C)', 'aria-label': 'Comment mode', 'aria-pressed': String(state.mode), 'data-test': 'comment-mode',
        onclick: () => setMode(!state.mode),
        html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>' });
      const send = el('button', { type: 'button', class: 'btn send', 'data-test': 'send-all', onclick: sendAll }, el('span', { text: 'Send all to agent' }), el('span', { class: 'count' }));
      updateSend(send);
      void view;
      return [toggle, send];
    },
  });
  LAYERS.push({
    key(e, view, fromBoard) {
      if (!view || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === 'Escape' && (state.draft || state.mode)) { if (state.draft) cancelDraft(); else setMode(false); return true; }
      if (fromBoard && !state.mode) return false;
      if (e.key === 'c' || e.key === 'C') {
        if (e.shiftKey) boardComment(view); else setMode(!state.mode);
        return true;
      }
      return false;
    },
    world(view) {
      if (state.mode) { view.root.classList.add('commenting'); view.liveMinZoom = 0.1; }
      drawPins(view);
      if (state.flyTo) {
        const id = state.flyTo;
        state.flyTo = null;
        setTimeout(() => focusComment(id), 0);
      }
    },
    // A drag inside a board, in comment mode, is an area. The board's own coordinates are board pixels.
    frame(view, rec) {
      const win = rec.iframe?.contentWindow;
      if (!win) return;
      let drag = null;
      win.addEventListener('pointerdown', (e) => {
        if (!state.mode || e.button !== 0) return;
        drag = { x: e.clientX + win.scrollX, y: e.clientY + win.scrollY, box: null };
      }, true);
      win.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const x = e.clientX + win.scrollX, y = e.clientY + win.scrollY;
        if (!drag.box && Math.hypot(x - drag.x, y - drag.y) <= 5) return;
        if (!drag.box) { drag.box = el('div', { class: 'cm-area drawing' }); layer(rec).append(drag.box); }
        drag.rect = { x: Math.min(x, drag.x), y: Math.min(y, drag.y), w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) };
        drag.box.setAttribute('style', rectStyle(drag.rect));
      }, true);
      win.addEventListener('pointerup', () => {
        const d = drag;
        drag = null;
        if (!d?.box) return;
        d.box.remove();
        if (state.mode) openDraft(view, rec, 'area', null, d.rect);
      }, true);
    },
    event(d) { if (d.type === 'comments') load(); },
  });
  onBoardMessage('canvas:ready', ({ view, rec }) => {
    rec.locateQueue = []; // a new document: nothing asked of the old one will be answered
    if (state.mode) view.post(rec, 'canvas:pick', { enabled: true });
    locateAll(view, rec, { persist: true });
  });
  onBoardMessage('canvas:props-changed', ({ view, rec }) => {
    // The pins follow the board's values while they are adjusted; the files keep the place from the last load.
    clearTimeout(rec.relocate);
    rec.relocate = setTimeout(() => locateAll(view, rec, { persist: false }), 60);
  });
  onBoardMessage('canvas:located', ({ view, rec, data }) => located(view, rec, data));
  onBoardMessage('canvas:picked', ({ view, rec, data }) => {
    if (!state.mode) return;
    openDraft(view, rec, 'element', data, data.rect);
  });

  await load();
}
