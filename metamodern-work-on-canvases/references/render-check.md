# Render check

One command for one canvas or every canvas of a project. Run it before showing a board to anyone who decides on it.

```sh
node <package>/scripts/canvas.mjs render [--project <dir>] [--canvas <id> ...] [--board <file> ...] [--out <dir>] [--jobs <n>] [--no-heights]
```

Code: [`scripts/render-check.mjs`](../scripts/render-check.mjs) (`renderCheck()`, `themeVariants()`, `readRenderReport()`). It needs the tooling with Chromium, installed once outside the project: `node <package>/scripts/tooling.mjs install --browser`.

## What it does

1. Reads `canvas.config.json`, `.canvas/live.json` and each canvas's `project/canvas.json`.
2. Serves every canvas on `127.0.0.1` through the board handler the viewer uses (board resolution, contract 1), so each board loads exactly what the viewer gives it, including its own kit choice (`ws.kit`).
3. Opens every board in headless Chromium at its own size, in each theme variant, several pages at a time (`--jobs`, default half the processors, from 2 to 8).
4. Waits for the runtime's `canvas:ready`, every mount, images and fonts. No fixed waits.
5. Saves a screenshot per board per variant and writes a report.
6. Writes each board's natural height to `canvases/<id>/tools/heights.json` (unless `--no-heights`).

The exit code is 0 when every board passes and 1 otherwise.

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
- **Declared by the canvas:** `canvases/<id>/tools/render.json`, `{"variants": [{"theme": "light"}, {"theme": "dark", "density": "compact"}]}`, replaces the board's own variants. Each variant keeps only the props a board has controls for, so a board without a `density` control renders `{"theme": "dark"}`.

Variants are named by the theme's value, `high` for high contrast and `<prop>-<value>` for any other prop, so builder boards made with `themes: ["light", "dark"]` and `contrast: true` render as `light`, `dark`, `light-high` and `dark-high`, and `{"theme": "dark", "density": "compact"}` as `dark-density-compact`.

## Output

`--out` defaults to `<project>/.canvas/render` (machine-local and Git-ignored). For each canvas:

- `screens/<board>.<variant>.png`;
- `report.json` (`canvas-render/1`): `{canvas, boards, renders, failed, seconds, msPerBoard, results: [{file, page, title, w, h, interactive, hash, ok, ms, variants: [{name, props, ok, ms, problems, screenshot, natural}]}]}`, where `hash` is the SHA-256 of the board's source as rendered and `ms` the time spent on the board;
- `report.md`: a table of boards, themes, results and times.

A run limited with `--board` keeps the earlier results of the canvas's other boards; a `--board` name that matches no board stops the run. Heights come only from renders that ran (no page error and a ready runtime). Lock and archive (contract 5) read `report.json` and refuse a board whose source changed since its render.

## Speed

The pages run in parallel in one browser. The fixture showcase (30 boards, 76 renders) takes about 4 s on a laptop. A 276-board canvas took 107 s with 8 pages on a heavily loaded laptop; each board's report line gives its own time.
