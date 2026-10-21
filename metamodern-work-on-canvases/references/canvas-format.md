# Canvas format and project config (contract 1)

Schema versions: `canvas.json` v3 (with the optional `ws` additions) and `canvas-config/1`. This file is the source for contract 1; the PM39 contracts brief links here. A change after a consumer has merged bumps the schema, adds a dated line to the change log below and updates every consumer in the same delivery.

Code: [`scripts/canvas-format.mjs`](../scripts/canvas-format.mjs) (readers, validators, the frozen rule and viewer links) and [`scripts/board-resolve.mjs`](../scripts/board-resolve.mjs) (what a board can load).

## Project layout

```text
<project>/
  canvas.config.json
  canvases/<canvas-id>/
    project/canvas.json
    project/<board>.dc.html
    project/assets/...
    tools/...              project builder scripts, heights.json
    README.md
  comments/              contract 4
  review.json            contract 5
  builds/                contract 5
  .canvas/               machine-local, Git-ignored (live kits, caches)
```

## `canvas.json`

It stays compatible with existing files, and readers keep fields they do not know (for example `createdOnFiles`, `notes` and `designSystems`).

- **Fields:** `v` (3), `title`, `launch` (`{view, page?}`), `pages` (`[{id, name}]`), `boards` (`{"<file>.dc.html": {x, y, w, h, title?, page?, expand?, is_interactive?}}`) and `order`.
- **Additions:**
  - **On the canvas:** an optional `ws` object, `{group, frozen?, about?, icon?}`. `group` is one of `foundations`, `lab`, `app`, `exploring`, `decided` or `archive`. `about` is the one line the home page shows for the canvas (else the first paragraph of its `README.md`). `icon` is the path of an `.svg` file inside `project/`, drawn on the canvas's card in the card's ink (its shape is used as a mask, so its own colours do not matter).
  - **On a board:** `ws: {set?, row?, kit?, facts?}`. `row` is one of `live`, `deciding`, `building`, `next` or `later`, and `kit` is `"pinned"` (the default) or `"live:<name>"`. `facts` is `[{label, text, href?}]`, the board's facts for the side panel (such as a screen's scene, route, source file and kit); `href` is an `http(s)` link or a path on the viewer.
- **Older readers** ignore `ws`.
- **Frozen canvases:** a canvas is frozen when `ws.frozen` is true or its title starts with `History:` or `Decided:`. The second rule keeps older canvases compatible.

Validation (`validateCanvas`) checks the fields above, that board files are `<name>.dc.html` inside `project/`, that pages, `launch.page`, `order` and board pages agree, and the `ws` values. It accepts every existing canvas the package was checked against (13 canvases from two design repositories).

## `canvas.config.json` (`canvas-config/1`)

```json
{
  "schema": "canvas-config/1",
  "name": "Example design",
  "canvases": "canvases",
  "kit": { "namespace": "Example", "pinned": "kit/current" },
  "skin": "skin/board.css",
  "port": 5410,
  "groups": ["foundations", "lab", "app", "exploring", "decided", "archive"],
  "groupNames": { "lab": "Components" }
}
```

`canvases`, `kit.pinned` and `skin` are paths inside the project. `kit.namespace` is the kit's JavaScript global (`window.Example`). `groupNames` (optional) names a group the project's way on the home page and in the canvas menu; groups it leaves out keep the package's names (Foundations, Labs, App, Exploring, Decided, Archive).

## Live kits

Live kits are registered in `.canvas/live.json` as `{"<name>": "<absolute path to a kit folder>"}`. Names are lowercase letters, digits and hyphens. The file is machine-local and never committed. A missing file is an empty registry.

## Viewer links

Links follow one scheme: `/`, `/<canvas>/`, `/<canvas>/<page>/` and `/<canvas>/<page>/<board>`. `<board>` is the file name without `.dc.html`, and a canvas without pages uses `-` as the page. These links appear in comments, briefs and reports, so they never change. `viewerLink` writes them and `parseViewerLink` reads them back.

## What a board can load

Every request a board makes is relative to its canvas's `project/` folder and resolves through `resolveBoardRequest`:

| Request | Answer |
| --- | --- |
| `support.js` | the package runtime (`assets/runtime/support.js`) |
| `support/<file>` | the runtime's own files: `react-markup.js`, and React 18.3.1 for legacy kits |
| `ds/<namespace>/<path>` | the kit chosen for the board (contract 3): the pinned kit folder, or a named live kit; the namespace folder matches case-insensitively |
| `ds/<namespace>/kit.json` in a kit folder without one | a generated record, `{"schema": "canvas-kit/legacy", ...}`: the folder is a legacy kit |
| `skin.css` | the project skin from `canvas.config.json` |
| any other path | a file inside `project/`; a kit copied into `project/ds/<folder>/` follows the same legacy rule |
| a path holding an unexpanded `{{value}}` | an empty answer (HTTP 204): the browser's preload scanner reads the raw board before the runtime takes it over |

Paths with `..`, `.`, empty segments, backslashes, absolute or drive paths, or encoded forms of these are refused (HTTP 400). A board's kit choice is its own link's `canvas-kit` query value, else its `ws.kit`, else `pinned`; requests the board makes carry that choice through their referrer, and the runtime adds it to kit stylesheet links so what a stylesheet loads (fonts, images) comes from the same kit.

## Change log

- 2026-10-20: first pinned version. MM-01 adds the `support/<file>` path, the generated legacy `kit.json` record and the empty answer for unexpanded values to "What a board can load".
- 2026-10-20: MM-02 adds the board's kit choice to kit stylesheet links (no format change).
