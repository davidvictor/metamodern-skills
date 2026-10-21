# Board builder

One library that every project builder script uses: [`scripts/board-builder.mjs`](../scripts/board-builder.mjs). A builder script is mostly its own data (pages, rows, sets and what each board shows); the library writes each board's shell, lays the boards out, keeps the board-height cache and writes `canvas.json`. Nobody copies the library into a project, and nobody edits a generated board by hand: change the script and run it again.

The fixture project's [`assets/fixture-builder/showcase.mjs`](../assets/fixture-builder/showcase.mjs) is a complete builder script: a Foundations page drawn from the kit's tokens, a component lab page with rows, and an app page whose Live, Deciding, Building, Next and Later rows come from `review.json`.

## A builder script

A project keeps its builder scripts in `canvases/<id>/tools/`. Each one imports the library from the installed package, describes the canvas and calls `buildCanvas`:

```js
import { buildCanvas, section, cell } from '<package>/scripts/board-builder.mjs';
import { appPageRows, readReview } from '<package>/scripts/review-sets.mjs';

await buildCanvas({
  canvasDir: '<project>/canvases/app',
  spec: {
    title: 'App',
    ws: { group: 'app' },
    pages: [
      { id: 'home', name: 'Home', rows: appPageRows({ page: 'home', review, live: liveBoards, boardsFor }) },
    ],
  },
});
```

## The spec

```text
spec   {title, ws?, launch?, layout?, pages: [page]}
page   {id, name, where?, summary?, header?, boards?: [board], rows?: [row]}
row    {id, name, summary?, banner?, boards?: [board], sets?: [{set, boards: [board]}]}
board  {file, title, w, h, fit?, ws?, expand?, is_interactive?, shell | html(height) | existing: true}
```

- **Pages with rows** get a header board (`P_<page>`, with each row's board count) unless `header: false`. **Rows** get a banner board (`R_<page>_<row>`) unless `banner: false`.
- **Row ids** `live`, `deciding`, `building`, `next` and `later` put `ws.row` on their boards (contract 1). Any other link-safe id is a lab row (States, Playground, In place, Directions) and adds no `ws.row`.
- **Sets** in a row get a card board (`S_<set>`: title, status, question, lead, what it waits on, its lock and pull request) on the left, with the set's boards to its right. Their boards get `ws.set`.
- **Boards** are placed left to right and wrap at `maxRowWidth`. A board is drawn from `shell` options (below), from `html(height)` (which must come from `boardShell`), or is `existing: true`, a board file already in `project/` that the builder places but never writes.
- **Layout** defaults: `gapX` 80, `gapRow` 160, `gapBanner` 120, `gapSection` 360, `maxRowWidth` 7600, `setCardWidth` 600.

## Board shells

`boardShell(options)` writes one board:

- **Head:** a generator meta tag, `support.js`, the project skin (`skin.css`), any `styles`, then the kit's `ds/<namespace>/<file>.css` and `.js` pairs when `namespace` is given.
- **Root:** `<div class="board-shell" data-canvas-id="board">` with the facts agents read: `data-kind`, `data-page`, `data-row`, `data-set`, `data-status`, `data-source` (the repository path the board shows), `data-kit` (`pinned` or `live:<name>`), any `attrs`, and `data-theme` and `data-contrast` when the board has those controls. Its size is the board's `w` and fitted `h`.
- **Header** (`data-canvas-id="board-head"`): `where`, the title, `summary` and `tags`.
- **Stage** (`data-canvas-id="board-stage"`): `body`, wrapped in the kit's `Root` with the theme and contrast values when the board has a kit and those controls (`root: false` leaves it out, for a scene that takes the theme itself).
- **Footer** (`data-canvas-id="board-foot"`): `foot` facts, `[label, html]`.
- **Bare** (`bare: true`): a screen board. It has no header and no footer, and its stage is the whole board, so the board is the screen at its real size (pass `fit: false` on the board so the height cache keeps it at the viewport's height). `where`, `summary`, `tags` and `foot` are refused. Put the screen's facts (scene, route, source, kit) in the board's `ws.facts`, `[{label, text, href?}]`, which the viewer's side panel lists.
- **Controls:** `themes` (such as `["light", "dark"]`) adds a `theme` enum control, `contrast: true` adds a `contrast` control (`standard`, `high`), and `controls` adds any other `data-props` control. `$preview` is always the board's size.
- **Logic:** by default `renderVals()` returns every control's value; `logic` replaces the class body.

`section({id, title, description, body})` and `cell({id, label, body})` label the parts of a stage with `data-canvas-id="section-<id>"` and `cell-<id>`, so comments attach to them (contract 2, stable labels). Text passed as options is escaped; `body`, `foot` values and `html` are trusted HTML.

The skin styles the shell's classes: `board-shell`, `shell-head`, `shell-where`, `shell-title`, `shell-summary`, `shell-tags`, `shell-tag`, `shell-stage`, `shell-section`, `shell-section-title`, `shell-section-desc`, `shell-cell`, `shell-cell-label`, `shell-grid`, `shell-row` and `shell-foot`.

## What a build writes

`buildCanvas({canvasDir, spec, force?})`:

- reads `tools/heights.json` and gives each board its measured height, rounded up to 10 px with an 8 px margin (`fit: false` keeps the given height);
- writes each board whose content changed, and `canvas.json` (key order `v`, `title`, `launch`, `pages`, `boards`, `order`, `ws`, which follow the spec, then any other field an existing file had, such as `notes`);
- removes boards it generated earlier (they carry the generator meta tag) that the spec no longer lists;
- never overwrites or removes a board without the generator meta tag, and stops with an error if the spec names one; every board is rendered and every target checked before the first write, so a build that stops writes nothing;
- refuses to write into a frozen canvas (`ws.frozen`, or a `History:` or `Decided:` title) unless `force` is set;
- returns `{written, removed, unchanged, canvas}`; with `dryRun: true` it makes every check and writes nothing.

The same input gives byte-identical files, and a second run writes nothing, so the viewer only reloads boards that really changed.

## Heights

`tools/heights.json` is `{"<board>.dc.html": <natural height in px>}`, sorted. The render check writes it after measuring each board (its `board-shell` root with height auto, or the whole document for other boards). The next build applies it. A board whose content runs past its height fails the render check until the canvas is rebuilt.

## Exploration canvases

`canvas explore create <id> --title <title> --question <question> [--set <set id>] [--copy <canvas>/<board> ...]` makes a canvas from the template:

- four pages: Start here (the question and its state), Directions, Lead and Archive, drawn by `explorationSpec` (below);
- `ws.group: exploring`, on the project's pinned kit (boards with no `ws.kit`);
- copies of the named boards on Directions, with the files they load from their canvas: imported boards, relative `src` and `href` files in any quoting, `url()` references, and what copied stylesheets load; a copy is the exploration's own board, so it loses the generator meta tag;
- `tools/explore.json` with the title, question, set, date and round 1, and a short `README.md`;
- with `--set`, the review set's `canvas` points at it.

`canvas explore round <id> --said "<the decision-maker's words>" [--learned <text>] [--board <file> ...] [--renders <dir>] [--date YYYY-MM-DD]` (`roundExploration(projectRoot, {id, said, learned, boards, date, renderOut})`) keeps the current round:

- the options on Directions (every board on the page but its intro `P_directions.dc.html` and generated row banners, or the `--board` subset) are kept as the picture of their last render, in the light theme or the first one, at `project/assets/round-<n>/<stem>.png`, with their source at `source/round-<n>/<file>`;
- `tools/explore.json` gains the round, `{n, date, said, learned, boards: [{file, title, image, w, h, source}]}`, in `rounds`, and `round` (the current round, 1 for a new canvas) moves to `n + 1`;
- each board needs a render at its current source, as for archiving; a render that failed is kept as it was seen;
- it refuses, before writing anything, an empty `--said`, a board that changed since its render, a board not on Directions, a round whose boards and sources are all the same as the last round's, and a decided canvas.

A round draws nothing itself: the canvas's builder draws the next round.

`explorationSpec(canvasDir, {directions = [], lead = [], precedent = null})` returns the template's spec for an exploration's builder script, from `tools/explore.json`; pass it to `buildCanvas`, adding boards to it or `ws` fields first if needed:

- **Start here:** `Start.dc.html` with the question, the state and the rounds (`Round n · date: “said”`), and with `precedent` (`[{title, href, note?}]`, each `href` an http(s) link or a path on the viewer, checked as `ws.facts` links are) a `Precedent.dc.html` board of links;
- **Directions:** an intro naming the current round and, from round 2, quoting the last round's `said` and `learned`, then `directions`;
- **Lead:** an intro, then `lead`;
- **Archive:** an intro, then a row `round-<n>` per kept round, newest first, of picture boards `R<n>_<stem>.dc.html` (the archive canvas's picture board), with the round's words as the row's summary.

`directions` and `lead` take builder rows or boards; a run of boards becomes a row without a banner. Round pictures are drawn from `tools/explore.json` on every build, so they stay on Archive after their options leave Directions, and a rebuild with the same input writes nothing. A copied board that leaves Directions stays in `project/`; the builder never removes a board it did not generate.

```js
import { buildCanvas } from '<package>/scripts/board-builder.mjs';
import { explorationSpec } from '<package>/scripts/explore.mjs';

const canvasDir = '<project>/canvases/explore-due-dates';
const options = [{ id: 'options', name: 'Round 2', boards: [/* this round's options */] }];
const precedent = [{ title: 'A product that does this', href: 'https://example.com/screen', note: 'What it shows' }];
await buildCanvas({ canvasDir, spec: await explorationSpec(canvasDir, { directions: options, precedent }) });
```

`canvas explore decide <id> [--lead <text>]` redraws Start here as decided, with every round, moves the canvas to the `decided` group and freezes it.
