// The fixture project's builder script for its showcase canvas: a Foundations page drawn from the kit's tokens, a
// component lab page with rows, and an app page whose Live, Deciding, Building, Next and Later rows come from
// review.json. It is what a project's canvases/<id>/tools/build.mjs looks like: mostly its own data, with the
// layout, the board shells, the heights and canvas.json left to the package's board builder.
//
//   node assets/fixture-builder/showcase.mjs --project <project root>
//
// Reads <project>/review.json and <project>/<pinned kit>/tokens.json; writes <project>/canvases/showcase/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildCanvas, cell, escapeHtml, section } from '../../scripts/board-builder.mjs';
import { readConfig } from '../../scripts/canvas-format.mjs';
import { appPageRows, readReview } from '../../scripts/review-sets.mjs';

const NS = 'Fixture';
const KIT = { namespace: NS, themes: ['light', 'dark'], contrast: true };

// ---------- the canvas's own data ----------

const BUTTON_STATES = [
  { id: 'primary', label: 'Primary', attrs: 'variant="primary"', text: 'Save changes' },
  { id: 'secondary', label: 'Secondary', attrs: 'variant="secondary"', text: 'Cancel' },
  { id: 'ghost', label: 'Ghost', attrs: 'variant="ghost"', text: 'Skip' },
  { id: 'small', label: 'Small', attrs: 'variant="primary" size="small"', text: 'Add' },
  { id: 'disabled', label: 'Disabled', attrs: 'variant="primary" disabled', text: 'Archived' },
];

const SCENES = [
  { id: 'overview', state: 'filled', title: 'Overview, filled' },
  { id: 'overview', state: 'empty', title: 'Overview, empty' },
  { id: 'settings', state: 'default', title: 'Settings' },
];

// What each review set's boards show. The sets themselves (question, lead, status) are in review.json.
const SET_BOARDS = {
  'tasks-due-dates': [
    { stem: 'D_due_badges', title: 'Due dates as badges', body: '<x-import component-from-global-scope="Fixture.Card" title="This week" description="3 tasks open"><x-import component-from-global-scope="Fixture.List" label="Tasks"><x-import component-from-global-scope="Fixture.ListItem" label="Schedule interviews" detail="Jun"><x-import component-from-global-scope="Fixture.Badge" tone="neutral">Nov 5</x-import></x-import><x-import component-from-global-scope="Fixture.ListItem" label="Send the survey" detail="Ana"><x-import component-from-global-scope="Fixture.Badge" tone="neutral">Nov 9</x-import></x-import></x-import></x-import>' },
  ],
  'tasks-filter': [
    { stem: 'D_filter_tabs', title: 'Filter by owner', body: '<x-import component-from-global-scope="Fixture.Tabs" items="{{owners}}"></x-import>', vals: "owners: window.Fixture.sample.members.map((m) => ({ id: m.id, label: m.name }))" },
  ],
  'tasks-done': [
    { stem: 'B_done_check', title: 'Done tasks keep a check', body: '<x-import component-from-global-scope="Fixture.List" label="Done"><x-import component-from-global-scope="Fixture.ListItem" label="Draft the outline" detail="Rae" selected><x-import component-from-global-scope="Fixture.Icons.Check" size="16" label="Done"></x-import></x-import></x-import>' },
  ],
  'tasks-bulk': [
    { stem: 'N_bulk_move', title: 'Move several tasks at once', body: '<div class="shell-row"><x-import component-from-global-scope="Fixture.Button" variant="secondary">Move 3 tasks</x-import><x-import component-from-global-scope="Fixture.Button" variant="ghost">Clear selection</x-import></div>' },
  ],
  'tasks-history': [
    { stem: 'L_history', title: 'A task\'s history', body: '<x-import component-from-global-scope="Fixture.Card" title="Send the survey" description="Created by Ana on Nov 1, moved to Jun on Nov 3"></x-import>' },
  ],
};

// ---------- boards ----------

function swatches(theme, values) {
  return Object.entries(values).map(([name, t]) => cell({
    id: `${theme}-${name}`,
    label: `${name} ${t.value}`,
    body: `<span class="swatch-chip" style="background: ${escapeHtml(t.value)}" title="${escapeHtml(t.usage ?? name)}"></span>`,
  })).join('');
}

function foundations(tokens, tokensPath) {
  const list = (items, render) => items.map((t) => cell({ id: t.name, label: `${t.name} ${t.value}`, body: render(t) })).join('');
  const board = (stem, title, summary, body, h) => ({
    file: `${stem}.dc.html`, title, w: 1600, h,
    shell: { kind: 'foundation', source: tokensPath, where: 'Foundations', summary, body, foot: [['Source', `<code>${escapeHtml(tokensPath)}</code>`]] },
  });
  return [
    board('F_colour', 'Colour', 'Every colour token, per theme, read from the kit.', Object.entries(tokens.themes).map(([theme, values]) => section({ id: theme, title: theme, body: `<div class="shell-grid">${swatches(theme, values)}</div>` })).join('\n'), 560),
    board('F_type', 'Type', 'The named text styles.', section({ id: 'styles', body: list(tokens.type, (t) => `<p style="font: ${escapeHtml(t.value)}; margin: 0">${escapeHtml(t.usage ?? t.name)}</p>`) }), 360),
    board('F_space', 'Space and radius', 'Spacing steps and corner radii.', [
      section({ id: 'space', title: 'Space', body: `<div class="shell-grid">${list(tokens.space, (t) => `<span class="space-bar" style="width: ${escapeHtml(t.value)}"></span>`)}</div>` }),
      section({ id: 'radius', title: 'Radius', body: `<div class="shell-grid">${list(tokens.radius, (t) => `<span class="radius-box" style="border-radius: ${escapeHtml(t.value)}"></span>`)}</div>` }),
    ].join('\n'), 420),
    board('F_motion', 'Motion', 'Durations and easing.', section({ id: 'motion', body: `<div class="shell-grid">${list(tokens.motion, () => '')}</div>` }), 260),
  ];
}

function kitBoard({ file, title, w = 1200, h = 480, body, where, vals = '', source }) {
  const logic = `renderVals() {\n    return { theme: this.props.theme ?? 'light', contrast: this.props.contrast ?? 'standard'${vals ? `, ${vals}` : ''} };\n  }`;
  return { file, title, w, h, shell: { ...KIT, kind: 'component', where, body, logic, source } };
}

function lab() {
  const states = kitBoard({
    file: 'C_button_states.dc.html', title: 'Button states', w: 1600, h: 360, where: 'Buttons · States', source: 'assets/fixture-kit/src/kit.jsx',
    body: `<div class="shell-grid">${BUTTON_STATES.map((s) => cell({ id: s.id, label: s.label, body: `<x-import component-from-global-scope="Fixture.Button" ${s.attrs}>${escapeHtml(s.text)}</x-import>` })).join('')}</div>`,
  });
  const playground = {
    file: 'C_button_playground.dc.html', title: 'Button playground', w: 1200, h: 360,
    shell: {
      ...KIT, kind: 'component', where: 'Buttons · Playground', source: 'assets/fixture-kit/src/kit.jsx',
      controls: {
        variant: { editor: 'enum', options: ['primary', 'secondary', 'ghost'], default: 'primary', section: 'Button' },
        label: { editor: 'text', default: 'Save changes', section: 'Button' },
        disabled: { editor: 'boolean', default: false, section: 'Button' },
      },
      body: cell({ id: 'button', label: 'Adjust the variant, label and state in the properties panel.', body: '<x-import component-from-global-scope="Fixture.Button" variant="{{variant}}" disabled="{{disabled}}">{{label}}</x-import>' }),
    },
  };
  const inPlace = {
    file: 'C_button_in_place.dc.html', title: 'Buttons in the settings screen', w: 1280, h: 640,
    shell: { ...KIT, root: false, kind: 'screen', where: 'Buttons · In place', body: '<x-import component-from-global-scope="Fixture.Scene" id="settings" state="default" theme="{{theme}}" contrast="{{contrast}}"></x-import>' },
  };
  return [
    { id: 'states', name: 'States', summary: 'Every variant and state at once.', boards: [states] },
    { id: 'playground', name: 'Playground', summary: 'Adjust the properties live.', boards: [playground] },
    { id: 'in-place', name: 'In place', summary: 'The piece inside a real screen.', boards: [inPlace] },
  ];
}

function liveBoards() {
  return SCENES.map((s) => ({
    file: `Live_${s.id}_${s.state}.dc.html`, title: s.title, w: 1280, h: 640,
    shell: { ...KIT, root: false, kind: 'screen', where: 'Tasks · Live', attrs: { scene: s.id, state: s.state }, body: `<x-import component-from-global-scope="Fixture.Scene" id="${s.id}" state="${s.state}" theme="{{theme}}" contrast="{{contrast}}"></x-import>` },
  }));
}

function setBoards(set) {
  return (SET_BOARDS[set.id] ?? []).map((b) => kitBoard({ file: `${b.stem}.dc.html`, title: b.title, body: b.body, vals: b.vals, where: `${set.title} · ${set.status}` }));
}

// ---------- build ----------

export async function buildShowcase(projectRoot) {
  const root = path.resolve(projectRoot);
  const config = await readConfig(root);
  const tokensPath = path.posix.join(config.kit.pinned, 'tokens.json');
  const tokens = JSON.parse(await fs.readFile(path.join(root, tokensPath), 'utf8'));
  const review = await readReview(root);
  const spec = {
    title: 'Showcase',
    ws: { group: 'app' },
    pages: [
      { id: 'foundations', name: 'Foundations', boards: foundations(tokens, tokensPath) },
      { id: 'buttons', name: 'Buttons', summary: 'The button, in every state, adjustable, and in place.', rows: lab() },
      { id: 'tasks', name: 'Tasks', summary: 'The task list as it is live, and the designs in review.', rows: appPageRows({ page: 'tasks', review, live: liveBoards(), boardsFor: setBoards }) },
    ],
  };
  return buildCanvas({ canvasDir: path.join(path.resolve(root, config.canvases), 'showcase'), spec });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { project: { type: 'string' } } });
  if (!values.project) {
    console.error('Usage: node assets/fixture-builder/showcase.mjs --project <project root>');
    process.exit(2);
  }
  const result = await buildShowcase(values.project);
  console.log(`showcase: ${result.written.length} written, ${result.removed.length} removed, ${result.unchanged} unchanged`);
}
