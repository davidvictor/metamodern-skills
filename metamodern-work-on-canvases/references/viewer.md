# The viewer

A local viewer for every canvas in a project: a home page, the canvases with pan and zoom, a finder, live reload, a kit switch per board, a properties panel, motion controls and comments. It shows boards, adjusts their values, plays their motion and takes comments; design changes are made in files. The only thing it writes is comments, in `comments/` ([comments.md](comments.md)).

Code: [`scripts/canvas.mjs`](../scripts/canvas.mjs) (the command), [`scripts/lib/viewer-server.mjs`](../scripts/lib/viewer-server.mjs) (the server) and [`assets/viewer/`](../assets/viewer/app.js) (the browser app). Every board request goes through [`scripts/board-resolve.mjs`](../scripts/board-resolve.mjs) (contract 1); boards and the viewer talk through the messages of contract 2 ([board-language.md](board-language.md)).

## Running it

```text
node <package>/scripts/canvas.mjs view [--project <dir>] [--port <n>]
```

The project is the `--project` folder, or the nearest folder at or above the working directory that holds `canvas.config.json`. The viewer listens on `127.0.0.1` only, at the config's `port` unless `--port` is given, and answers only requests addressed to `127.0.0.1`, `localhost` or `[::1]`. It needs Node 22.13 or later and nothing else.

## Pages and links

Links follow contract 1 and never change: `/`, `/<canvas>/`, `/<canvas>/<page>/` and `/<canvas>/<page>/<board>`, with `-` as the page of a canvas without pages. A board link may carry `?canvas-kit=pinned|live:<name>` and `?canvas-props=<json>`; opening it applies both to that board. A page id cannot be `project`, because `/<canvas>/project/<path>` is where boards load their files.

**Home.** Canvases are grouped in the order of `config.groups`; groups the config leaves out follow in the standard order. A canvas's group is its `ws.group`, else `decided` when it is frozen (contract 1's rule), else `exploring`. The app group shows each canvas as a banner, decided and archive as compact rows, the rest as cards. A card shows the canvas title, its about line, its page and board counts and links to its first pages. The about line is the first paragraph of the canvas's own `README.md`. Canvases whose `canvas.json` has issues are still listed, with the issues named at the top of the page.

**A canvas.** One page at a time. The sidebar lists pages and boards (grouped under Live, Deciding, Building, Next and Later when boards carry `ws.row`), with a filter. The top bar has the breadcrumb (canvas and page menus), page steps, zoom, the page's motion controls, the tools slot and the panel toggle. Boards further than the screen show as titled boxes; boards on screen at 28% zoom or more run live, at most 14 at once, nearest first; the selected board always runs. A minimap shows the page.

## Kit switch and banner

Each board runs in its own frame, so each board can show its own kit. A board's kit is the viewer's choice for it (set in the panel or by a link, kept per browser), else its `ws.kit`, else `pinned`. The frame's link always carries the choice as `?canvas-kit=`, so the board reports its kit mode correctly in `canvas:ready`.

Every board has a banner above it naming its kit: `Pinned` or `Live <name>`, the namespace and version, the branch for a live build, the commit (7 characters) and `uncommitted changes` when the build says so. Live boards are outlined in a second colour. A legacy kit (no `kit.json`), a kit folder not built yet and a live name missing from `.canvas/live.json` are named as such.

The server polls each kit's `kit.json` (written last, contract 3) every 250 ms; for a legacy kit it polls the bundle files instead. When a kit changes it tells the browser, which reloads every live board on that kit and refreshes the banners. Changes to `.canvas/live.json` are picked up the same way.

## Properties panel

The side panel's Properties tab shows the selected board: its kit (with the switch), its motion controls and an editor for every value its `data-props` declares, grouped by `section`:

| Control shape | Editor |
| --- | --- |
| `enum` (`options`, `default`, `section`?) | a select; a value outside the options is kept and shown |
| `boolean` | a checkbox |
| `int` (`min`, `max`) and `number` | a number field, with a slider when both limits are set; `int` rounds |
| `text` | a text field |
| anything else | a JSON field |

`$`-prefixed entries such as `$preview` are not controls. A change is sent as `canvas:set-props`; the board answers `canvas:props-changed` and the panel follows it. Values set in the panel are kept for the board while the viewer is open and sent again whenever the board reloads. **Copy values as JSON** copies the current values (for a comment or a build brief), **Copy link** copies the board link with its kit choice and changed values, **Reset** returns to the board's defaults and its own kit, and the JSON is also shown under **Values as JSON**.

## Motion

Replay, quarter speed and pause, for the selected board (panel, or `R`, `S`, `P`) or every board on the page (top bar, or `Shift R`, `Shift S`, `Shift P`; with no board selected the plain keys act on the page). They are sent as `canvas:motion` (`rate` 1, 0.25 or 0, and `replay`); the runtime applies the rate to Web Animations and to the board's JavaScript clock, so CSS, Web Animations and frame-driven springs all slow and pause together. A page rate applies to boards that start later too; a board's own rate wins until the page rate is set again.

## Live reload

The server watches the canvases folder and batches changes for 60 ms. The browser then reloads every live board that loaded a changed file: its own board file, a board it imports with `dc-import`, a stylesheet, a script or an asset (from the frame's resource timing). A changed `canvas.json` or `README.md` refreshes the index, and the page is drawn again only when its pages or boards changed. A change to the project skin reloads every live board. A builder script's save reaches the open board in about 100 to 300 ms on a local machine.

## Server routes

| Route | Answer |
| --- | --- |
| `/`, viewer links | the viewer app |
| `/<canvas>/project/<path>` | what the board asked for, resolved per board (contract 1) |
| `/_viewer/<file>` | the viewer app's own files |
| `/_index` | `{name, groups, namespace, canvases: [{id, title, group, frozen, launch, pageless, pages, boards: [{f, t, p, x, y, w, h, kit, row, set}], about}], problems}` |
| `/_kits` | `{namespace, pinned, live: [...], issue}`: each kit's `choice`, `name`, `exists`, `legacy` and, from `kit.json`, `namespace`, `version`, `repo`, `commit`, `branch`, `dirty`, `builtAt` |
| `/_events` | server-sent events: `{type: "files", changes: [{canvas, file}]}`, `{type: "index"}`, `{type: "skin"}`, `{type: "kit", kit}`, `{type: "kits"}`, `{type: "comments"}` |
| `/_comments`, `/_comments/…` | comments and batches: read, create, reply, resolve, place, Send all to agent ([comments.md](comments.md#viewer-routes)) |
| `/_blob/<id>` | a file from a canvas's `assets/` or `project/assets/` (by name without extension), or from its optional `tools/blobs.json` map (`{"<id>": "<path inside the canvas folder>"}`); entries outside the canvas are ignored |

Only `GET` and `HEAD` are answered, except the comment routes' `POST`s, which must come from the viewer page itself (its own `Origin`, JSON).

## Keys

| Keys | Action |
| --- | --- |
| Cmd or Ctrl K, `/` | find a canvas, page or board |
| `]` `[`, `1` to `9` | next and previous page, page 1 to 9 |
| Arrow right and left, `J` `K` | next and previous board |
| Enter, Shift 2, double-click | fit the selected board and use it |
| Esc | let go of a board |
| `W`, Shift 1, Shift 0 | fit the page width, the whole page, actual size |
| `+` `-`, pinch or Cmd scroll | zoom |
| Space drag, middle drag | move, even over a board |
| `R` `S` `P` (Shift for the page) | replay, quarter speed, pause |
| `I`, Cmd or Ctrl backslash, `M` | side panel, sidebar, map |
| `O`, `L` | open the board alone, copy its link |
| `C`, Shift C | comment mode on and off, comment on the selected board ([comments.md](comments.md)) |
| `?` | all shortcuts |

A live board keeps its own keys; only Esc and modified keys reach the viewer from inside it.

## Slots for other layers

The side panel takes more tabs (`PANELS` in `app.js`), the top bar has a tools group (`TOOLS`, `data-slot="tools"`), `onBoardMessage(type, handler)` hands board messages such as `canvas:picked` to the layer that asked for them, and `LAYERS` lets a layer take keys first, learn when a page's boards are drawn or a board's frame loads, and hear server events. Comments ([`comments.js`](../assets/viewer/comments.js)) use all of these: the Comments tab, the comment and Send all to agent buttons, and pins on the boards. A view's `liveMinZoom` lowers the zoom from which boards run live (comment mode uses 10%).
