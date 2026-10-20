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

- four pages: Start here (the question and its state), Directions, Lead and Archive;
- `ws.group: exploring`, on the project's pinned kit (boards with no `ws.kit`);
- copies of the named boards on Directions, with the files they load from their canvas: imported boards, relative `src` and `href` files in any quoting, `url()` references, and what copied stylesheets load; a copy is the exploration's own board, so it loses the generator meta tag;
- `tools/explore.json` with the title, question, set and date, and a short `README.md`;
- with `--set`, the review set's `canvas` points at it.

`canvas explore decide <id> [--lead <text>]` redraws Start here as decided, moves the canvas to the `decided` group and freezes it.
