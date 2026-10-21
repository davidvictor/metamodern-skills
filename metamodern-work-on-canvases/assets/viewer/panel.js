/* The properties panel for the selected board: its kit (with the switch), motion, and an editor for every
   value its data-props declares. Values travel to the board as canvas:set-props and come back as
   canvas:props-changed (contract 2). */
import { el } from './dom.js';

export const RATES = [
  { rate: 1, label: '1×', title: 'Normal speed' },
  { rate: 0.25, label: '¼×', title: 'Quarter speed' },
  { rate: 0, label: 'Pause', title: 'Pause' },
];

/** The kit facts for a board's choice ("pinned" or "live:<name>") from /_kits. */
export function kitEntry(kits, choice) {
  if (!kits) return null;
  if (choice === 'pinned') return kits.pinned;
  const name = choice.slice(5);
  return kits.live.find((k) => k.name === name) ?? { choice, name, exists: false, unregistered: true };
}

const short = (commit) => (typeof commit === 'string' && /^[0-9a-f]{7,}$/i.test(commit) ? commit.slice(0, 7) : commit);

/** One line naming the kit a board shows and its commit or branch, for the banner on the board. */
export function kitLabel(entry, namespace) {
  if (!entry) return 'Kit';
  const mode = entry.choice === 'pinned' ? 'Pinned' : `Live ${entry.name}`;
  if (entry.unregistered) return `${mode} · not in .canvas/live.json`;
  if (!entry.exists) return `${mode} · not built`;
  if (entry.legacy) return `${mode} · legacy kit (no kit.json)`;
  if (entry.error) return `${mode} · ${entry.error}`;
  const parts = [mode, [entry.namespace ?? namespace, entry.version].filter(Boolean).join(' ')];
  // A detached worktree's build names its branch HEAD: say detached; the short commit follows.
  if (entry.branch) parts.push(entry.branch === 'HEAD' ? 'detached' : `branch ${entry.branch}`);
  if (entry.commit) parts.push(short(entry.commit));
  if (entry.dirty) parts.push('uncommitted changes');
  return parts.filter(Boolean).join(' · ');
}

/** The adjustable values a board declares, in order, each with the editor that fits its shape. */
export function controlsFor(schema) {
  const out = [];
  for (const [name, spec] of Object.entries(schema ?? {})) {
    if (name.startsWith('$') || !spec || typeof spec !== 'object') continue;
    const editor = spec.editor;
    const d = spec.default;
    let kind = 'json';
    if (editor === 'enum' || Array.isArray(spec.options)) kind = 'enum';
    else if (editor === 'boolean' || (editor == null && typeof d === 'boolean')) kind = 'boolean';
    else if (editor === 'int' || editor === 'number' || editor === 'float' || (editor == null && typeof d === 'number')) kind = 'number';
    else if (editor === 'text' || editor === 'string' || (editor == null && typeof d === 'string')) kind = 'text';
    out.push({ name, spec, kind, section: typeof spec.section === 'string' && spec.section ? spec.section : '' });
  }
  return out;
}

/** The board's values without the $-prefixed entries, as the JSON a comment or build brief carries. */
export function valuesJson(values) {
  const clean = {};
  for (const [k, v] of Object.entries(values ?? {})) if (!k.startsWith('$')) clean[k] = v;
  return JSON.stringify(clean, null, 2);
}

function editor(control, value, onSet) {
  const { name, spec, kind } = control;
  const id = `prop-${name}`;
  const test = `prop-${name}`;
  if (kind === 'enum') {
    const options = Array.isArray(spec.options) ? spec.options.map(String) : [];
    if (value != null && !options.includes(String(value))) options.push(String(value));
    const select = el('select', { id, 'data-test': test, 'data-prop': name },
      options.map((o) => el('option', { value: o, text: o })));
    select.value = value == null ? '' : String(value);
    select.addEventListener('change', () => onSet(name, select.value));
    return select;
  }
  if (kind === 'boolean') {
    const box = el('input', { type: 'checkbox', id, 'data-test': test, 'data-prop': name });
    box.checked = value === true;
    box.addEventListener('change', () => onSet(name, box.checked));
    return box;
  }
  if (kind === 'number') {
    const step = spec.editor === 'int' ? 1 : spec.step ?? 'any';
    const attrs = { type: 'number', id, 'data-test': test, 'data-prop': name, step, min: spec.min, max: spec.max, inputmode: spec.editor === 'int' ? 'numeric' : 'decimal' };
    const input = el('input', attrs);
    input.value = value == null ? '' : String(value);
    const read = (raw) => {
      if (raw === '' || !Number.isFinite(Number(raw))) return null;
      let n = Number(raw);
      if (spec.editor === 'int') n = Math.round(n);
      if (typeof spec.min === 'number') n = Math.max(spec.min, n);
      if (typeof spec.max === 'number') n = Math.min(spec.max, n);
      return n;
    };
    input.addEventListener('input', () => { const n = read(input.value); if (n != null) onSet(name, n); });
    if (typeof spec.min !== 'number' || typeof spec.max !== 'number') return input;
    const range = el('input', { type: 'range', min: spec.min, max: spec.max, step, 'aria-label': `${name} slider`, 'data-prop-range': name });
    range.value = input.value;
    range.addEventListener('input', () => { input.value = range.value; const n = read(range.value); if (n != null) onSet(name, n); });
    input.addEventListener('input', () => { range.value = input.value; });
    return el('div', { class: 'num' }, range, input);
  }
  if (kind === 'text') {
    const input = el('input', { type: 'text', id, 'data-test': test, 'data-prop': name, autocomplete: 'off', spellcheck: 'false' });
    input.value = value == null ? '' : String(value);
    input.addEventListener('input', () => onSet(name, input.value));
    return input;
  }
  const area = el('textarea', { id, rows: 2, 'data-test': test, 'data-prop': name, spellcheck: 'false' });
  area.value = JSON.stringify(value ?? null);
  area.addEventListener('change', () => {
    try { onSet(name, JSON.parse(area.value)); area.removeAttribute('aria-invalid'); }
    catch { area.setAttribute('aria-invalid', 'true'); }
  });
  return area;
}

/** A segmented rate control with a replay button, for one board or the whole canvas. */
export function motionControls({ rate, onMotion, scope }) {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': `Motion speed for ${scope}` },
    RATES.map((r) => el('button', {
      type: 'button', title: r.title, text: r.label, 'aria-pressed': String(rate === r.rate), 'data-test': `motion-${scope}-${r.rate}`,
      onclick: () => onMotion({ rate: r.rate }),
    })));
  const replay = el('button', { type: 'button', class: 'btn', text: 'Replay', 'data-test': `motion-${scope}-replay`, onclick: () => onMotion({ replay: true }) });
  return el('div', { class: 'actions' }, replay, seg);
}

/**
 * Draws the panel for one board.
 * ctx: {board, state, values, kits, namespace, choice, defaultChoice, rate, onSet, onReset, onKit, onMotion, onCopyJson, onCopyLink, onOpen}
 */
export function renderBoardPanel(body, ctx) {
  const { board, state, kits, namespace, choice, defaultChoice } = ctx;
  const entry = kitEntry(kits, choice);
  const options = [{ choice: 'pinned', label: 'Pinned' }, ...(kits?.live ?? []).map((k) => ({ choice: k.choice, label: `Live ${k.name}` }))];
  if (!options.some((o) => o.choice === choice)) options.push({ choice, label: `Live ${choice.slice(5)}` });
  const kitSelect = el('select', { id: 'board-kit', 'data-test': 'board-kit' },
    options.map((o) => el('option', { value: o.choice, text: o.label + (o.choice === defaultChoice ? ' (board default)' : '') })));
  kitSelect.value = choice;
  kitSelect.addEventListener('change', () => ctx.onKit(kitSelect.value));

  const parts = [
    el('h3', { text: board.t }),
    el('div', { class: 'note', text: board.f }),
    board.facts?.length ? el('dl', { class: 'facts', 'data-test': 'board-facts' }, board.facts.map((f) => [
      el('dt', { text: f.label }),
      el('dd', {}, f.href ? el('a', { href: f.href, ...(f.href.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' }), text: f.text }) : f.text),
    ])) : null,
    el('h4', { text: 'Kit' }),
    el('div', { class: 'field' }, el('label', { for: 'board-kit', text: 'Shows' }), kitSelect),
    el('div', { class: 'kitinfo' + (choice === 'pinned' ? '' : ' live'), 'data-test': 'panel-kit', text: kitLabel(entry, namespace) }),
    el('h4', { text: 'Motion' }),
    motionControls({ rate: ctx.rate, onMotion: ctx.onMotion, scope: 'board' }),
  ];

  const controls = controlsFor(state?.schema);
  if (!state?.ready) parts.push(el('h4', { text: 'Values' }), el('p', { class: 'note', text: 'Loading the board…' }));
  else if (!controls.length) parts.push(el('h4', { text: 'Values' }), el('p', { class: 'note', text: 'This board declares no adjustable values.' }));
  else {
    const sections = new Map();
    for (const c of controls) {
      if (!sections.has(c.section)) sections.set(c.section, []);
      sections.get(c.section).push(c);
    }
    for (const [section, list] of sections) {
      parts.push(el('h4', { text: section || 'Values' }));
      for (const c of list) {
        const field = el('div', { class: 'field' },
          el('label', { for: `prop-${c.name}`, text: c.name, title: c.name }),
          editor(c, ctx.values?.[c.name], ctx.onSet));
        parts.push(field);
      }
    }
  }
  parts.push(el('div', { class: 'actions' },
    el('button', { type: 'button', class: 'btn', text: 'Copy values as JSON', 'data-test': 'copy-json', onclick: ctx.onCopyJson }),
    el('button', { type: 'button', class: 'btn', text: 'Copy link', title: 'A link to this board with its kit and values (L)', onclick: ctx.onCopyLink }),
    el('button', { type: 'button', class: 'btn', text: 'Reset', title: 'Back to the board’s defaults and its own kit', onclick: ctx.onReset }),
    el('button', { type: 'button', class: 'btn', text: 'Open alone', title: 'Open the board on its own (O)', onclick: ctx.onOpen })));
  parts.push(el('details', {}, el('summary', { text: 'Values as JSON' }), el('pre', { class: 'json', 'data-test': 'props-json', text: valuesJson(ctx.values) })));
  body.replaceChildren(...parts.filter(Boolean));
}

/** Refreshes the editors and the JSON after canvas:props-changed, leaving the editor being typed in alone. */
export function updateBoardPanel(body, values) {
  for (const input of body.querySelectorAll('[data-prop]')) {
    if (input === document.activeElement) continue;
    const v = values?.[input.dataset.prop];
    if (input.type === 'checkbox') input.checked = v === true;
    else if (input.tagName === 'TEXTAREA') input.value = JSON.stringify(v ?? null);
    else input.value = v == null ? '' : String(v);
    const range = body.querySelector(`[data-prop-range="${CSS.escape(input.dataset.prop)}"]`);
    if (range && range !== document.activeElement) range.value = input.value;
  }
  const pre = body.querySelector('[data-test="props-json"]');
  if (pre) pre.textContent = valuesJson(values);
}
