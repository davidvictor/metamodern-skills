# Render check

One command for one canvas or every canvas of a project. Run it before showing a board to anyone who decides on it. It is fast enough to run after every change: a board is checked again only when something it loads has changed.

```sh
node <package>/scripts/canvas.mjs render [--project <dir>] [--canvas <id> ...] [--board <file> ...] [--out <dir>] [--jobs <n>] [--no-heights]
                                         [--force] [--reload-variants] [--watch]
node <package>/scripts/canvas.mjs build  [--project <dir>] [--canvas <id> ...] [--out <dir>] [--jobs <n>] [--force] [--reload-variants]
```

Code: [`scripts/render-check.mjs`](../scripts/render-check.mjs) (`renderCheck()`, `createRenderSession()`, `watchRender()`, `buildAndCheck()`, `themeVariants()`, `readRenderReport()`). It needs the tooling with Chromium, installed once outside the project: `node <package>/scripts/tooling.mjs install --browser`.

## What it does

1. Reads `canvas.config.json`, `.canvas/live.json` and each canvas's `project/canvas.json`.
2. Serves every canvas on `127.0.0.1` through the board handler the viewer uses (board resolution, contract 1), so each board loads exactly what the viewer gives it, including its own kit choice (`ws.kit`).
3. Skips each board whose inputs are all unchanged since its last check (below), keeping its result and pictures.
4. Opens every other board in headless Chromium at its own size, several boards at a time (`--jobs`, default all processors but two, from 2 to 8). Each board opens in its own browser context, so storage a board keeps (`localStorage`, cookies, IndexedDB, such as a kit that remembers its theme) never reaches another board, however many run at once.
5. Loads each board once, in its first theme variant, and switches it to each further variant in place, as the viewer's controls do (below).
6. Waits for the runtime's `canvas:ready`, every mount, images and fonts. No fixed waits.
7. Saves a screenshot per board per variant and writes a report.
8. Writes each board's natural height to `canvases/<id>/tools/heights.json` (unless `--no-heights`).

The exit code is 0 when every board passes and 1 otherwise.

## Only what changed

Each board is keyed by everything its render depends on:

- every file it loaded, by content: the board, the boards it imports, its stylesheets, scripts, pictures and fonts, the runtime, the skin and the kit's files (recorded from its own requests when it was last checked);
- its size, `is_interactive` and kit choice from `canvas.json`, and its theme variants;
- the package version, the Chromium version, `canvas.config.json`, the kit folder the board's kit choice resolves to, and how variants are drawn.

A board whose key is unchanged is not opened again: its result, time and pictures stay, and the report marks it `"reused": true`. That holds for a failing board too, since the same inputs fail the same way, so a known failure costs nothing until something it loads changes. A board whose failure can pass by itself (`the runtime never became ready`, `navigation failed`, `request failed`, `check failed`), a board named with `--board`, and every board under `--force` are always checked. A board that loads anything from another origin has no key and is always checked. The keys are in `<out>/<canvas>/cache.json`, beside the report, so an `--out` folder keeps its own.

So editing one board, or a stylesheet a few boards load, checks those boards only; a builder run that writes nothing checks nothing. **A kit sync** changes the kit's bundle, which every board that mounts the kit loads, so all of those boards are checked again, unless the kit declares part hashes in `kit.json` ([kit contract](kit-contract.md#part-hashes)). Then a board is keyed by the kit's shared part and the parts it names (`<Ns>.Button`, `<Ns>.sample.contracts`, or `A.sample` after `const A = window.<Ns>;`), and a kit sync checks only the boards that use a part that changed. A board that reaches the kit any other way (the bare global, a computed name, an alias passed on whole, or a path with no part) is keyed by the whole kit.

## Variants in place

A board loads once, with its first variant's props as its `canvas-props` link value. For each further variant, every prop goes back to its default and takes the variant's values, through the runtime's `props` and `render()`, as the viewer's controls change it; the check then waits for the render, every mount and two frames, and finishes any CSS transition the change started (a theme's colours easing in), so the picture shows the settled variant. Problems the load causes are reported with the first variant; problems after a switch (a console error, a missing file, an empty mount) with that variant. When the load left a mount empty, a switch does not wait for it again.

A board that reads a prop only when it mounts shows its first variant in every picture this way. Give its canvas `"reload": true` in `tools/render.json`, or run with `--reload-variants`, to load each variant afresh in its own context instead, as before 0.4.0. A board whose runtime never became ready loads each further variant afresh by itself.

## Build, check and heights in one step

`canvas build [--canvas <id> ...]` runs each canvas's builder script (`canvases/<id>/tools/build.mjs`, from the project root), render-checks the boards that changed, and when the measured heights changed, runs the builder again and checks the boards whose heights moved, up to three rounds, so a new or grown board passes in one command instead of failing with "rebuild the canvas to apply tools/heights.json". Without `--canvas` it builds every canvas that has a builder and is not frozen. It keeps one browser for every round and prints the failures of the last one.

## Watch

`canvas render --watch [--canvas <id> ...]` checks, then keeps the browser open and checks again whenever a file under a canvas's `project/`, the skin, a kit or `.canvas/live.json` changes (the same watcher the viewer uses): only the canvases whose files changed, and in them only the boards whose inputs changed. Run it beside the viewer while a builder or an agent rewrites boards; each check ends with one line. It takes no `--board` or `--force`.

## What fails a board

| Problem | How it shows in the report |
| --- | --- |
| a page error or console error | `page error: ...`, `console error: ...` |
| a missing file | `HTTP 404: <url>`, or `request failed: <url> (<reason>)` when a request fails without an answer. Aborted requests (an image whose source changed while loading) are not missing files. |
| an image with no picture | `image with no picture: <src>`: a shown `<img>` with no source, or one that did not decode |
| clipped text | `clipped text: "<text>" in <label> (<n> px cut)` |
| content past the board's size | `content runs <n> px past the board's height` (or width) |
| an empty mount | `empty mount: <Ns.Path>`: a mounted component that drew nothing, or failed |
| a runtime that never became ready | `the runtime never became ready` |

**Clipped text** is a line of visible text cut by its own box: the text's parent or grandparent with `overflow: hidden` or `clip`. Vertical cuts are measured against the line's em box. These are not clipped text:

- a frame or viewport further out that cuts a long screen at its edge, as phone frames and message threads do;
- deliberate truncation: `text-overflow: ellipsis` or a line clamp;
- a strip whose items run on past its edge, such as a carousel or a row of chips that peeks (some item lies wholly outside the box);
- hidden or nearly transparent text, such as the waiting digits of a rolling counter;
- visually hidden text (a box 1 px or smaller, or clipped with `clip` or `clip-path`);
- anything inside an element marked `data-canvas-allow-clip`.

**Content past the board's size:** for a builder board, its `board-shell` root's natural height against its height (rebuild to apply `heights.json`); for any other board, the document against the board's `w` and `h` in `canvas.json`. Boards with `is_interactive: true` scroll inside their frame in the viewer, so they may be larger.

## Themes

A board's theme is one of its props, set through the `canvas-props` link value (contract 2), so the check opens one link per variant:

- **Declared by the board:** every `light`, `dark` or contrast option (an option whose name contains `contrast`) of a `theme` enum control. When the board also has a `contrast` enum control with a `high` option, each of those again with `contrast: "high"`. A board with a `theme` control and none of those options renders in its default theme; a board with no `theme` control renders once, as `default`.
- **Declared by the canvas:** `canvases/<id>/tools/render.json`, `{"variants": [{"theme": "light"}, {"theme": "dark", "density": "compact"}]}`, replaces the board's own variants. Each variant keeps only the props a board has controls for, so a board without a `density` control renders `{"theme": "dark"}`. The same file takes `"reload": true` to load each variant afresh.

Variants are named by the theme's value, `high` for high contrast and `<prop>-<value>` for any other prop, so builder boards made with `themes: ["light", "dark"]` and `contrast: true` render as `light`, `dark`, `light-high` and `dark-high`, and `{"theme": "dark", "density": "compact"}` as `dark-density-compact`.

## Output

`--out` defaults to `<project>/.canvas/render` (machine-local and Git-ignored). For each canvas:

- `screens/<board>.<variant>.png`;
- `report.json` (`canvas-render/1`): `{canvas, boards, renders, failed, checked, reused, seconds, msPerBoard, results: [{file, page, title, w, h, interactive, hash, ok, ms, reused?, variants: [{name, props, ok, ms, problems, screenshot, natural}]}]}`, where `hash` is the SHA-256 of the board's source as rendered, `ms` the time spent on the board when it was checked, and `reused` marks a board kept from an earlier check;
- `report.md`: a table of boards, themes, results and times;
- `cache.json` (`canvas-render-cache/1`): each board's key and the inputs it loaded.

A run limited with `--board` checks those boards and keeps the earlier results of the canvas's other boards; a `--board` name that matches no board stops the run. Heights come only from renders that ran (no page error and a ready runtime). Lock and archive (contract 5) read `report.json` and refuse a board whose source changed since its render; a reused board's render is of its current source.

## Speed

Measured on AUTOSTAK's design project (14 canvases, 2,049 boards, 5,934 renders, most lab boards in four to eight variants) on a 10-core laptop that other sessions were loading heavily (load averages from 15 to 360), with 0.3.0 against 0.4.0:

| Run | 0.3.0 | 0.4.0 |
| --- | --- | --- |
| Every canvas, nothing rendered before | 1,880 s | 1,222 s, at a far higher load; the same canvas back to back is 1.8 to 2.6 times faster (below) |
| lab-actions cold (45 boards, 133 renders), back to back | 22 to 31 s | 10.5 to 11.8 s |
| lab-selection cold (140 boards, 433 renders), back to back | 69 to 71 s | 31 to 38 s with 5 in parallel, 27.5 s with 8 |
| Every canvas again, nothing changed | everything again | 1.7 to 2.1 s; `canvas build` of all 14 canvases 3.2 s |
| One canvas rebuilt, a label changed on one board | 84 s (builder, then the whole canvas) | 11.4 s (`canvas build`, 1 board checked) |
| Heights after a cold run (10 boards past their height) | a second build and render | one `canvas build`, 99.7 s, 42 boards checked |
| A kit sync, kit without part hashes | everything again | 1,203 s: the 1,245 boards that mount the kit, 804 reused |
| A kit sync changing one component, with part hashes (simulated) | everything again | 64 s: 109 boards (3 name the component; 106 reach the kit as a whole) |

The time of a cold board is mostly its page load: the kit's bundle running and its CSS parsing (about 300 to 550 ms a load), against 50 to 150 ms for a switch in place. A Chromium shutdown that could take 30 s on macOS is gone: the browser is killed at the end.
