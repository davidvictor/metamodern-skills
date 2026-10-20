# Review sets and build briefs (contract 5)

Schema version `canvas-review/1`. This file is the source for contract 5; the PM39 contracts brief links here. A change after a consumer has merged bumps the schema, adds a dated line to the change log below and updates every consumer in the same delivery.

Code: [`scripts/review-sets.mjs`](../scripts/review-sets.mjs) (validation, the status-to-row mapping, create, status, lock, archive) and [`scripts/canvas.mjs`](../scripts/canvas.mjs) (`canvas review ...`).

## `review.json`

At the project root: `{"schema": "canvas-review/1", "sets": [Set]}`, where each `Set` is:

```json
{ "id": "contracts-table-header", "page": "contracts", "title": "", "question": "", "lead": "",
  "status": "exploring | ready | waiting | locked | building | live | next | later | archived",
  "waits_on": [], "replaces": [], "canvas": "<exploration canvas id or null>", "boards": [],
  "locked": { "date": "YYYY-MM-DD", "words": "<the decision-maker's words>", "harness": "claude-code | codex" },
  "build": { "issue": null, "pr": null, "branch": null }, "live": { "commit": null } }
```

- `id` and `page` are link-safe ids; `page` is a page of the app canvas.
- `boards` are the set's lead boards: `<board>.dc.html` file names on the app canvas.
- `waits_on` names other sets; a set never waits on itself and sets never wait on each other in a cycle.
- `replaces` names sets this one replaces; when it goes live, archive each of them with `canvas review archive`.
- `locked` is `null` until the set is locked, and is required while the set is `locked`, `building` or `live`.
- `waiting` needs a non-empty `waits_on`.
- `build.issue` is a number, a string or `null`; `build.pr` and `build.branch` are strings or `null`; `live.commit` is a commit hash or `null`.

## Status to row

- exploring, ready and waiting go to **Deciding**;
- locked and building go to **Building**;
- next goes to **Next**, and later to **Later**;
- live shows in **Live** after a sync, then the set leaves the app canvas;
- archived goes to the **archive canvas**.

`statusRow(status)` returns `deciding`, `building`, `next`, `later`, `live` or `archive`. `appPageRows()` gives a builder script the rows of one app canvas page in this order: Live (the page's Live boards), Deciding, Building, Next, Later.

## Commands

Run from the project root (or pass `--project <dir>`):

| Command | What it does |
| --- | --- |
| `canvas review validate` | Checks `review.json` and lists every issue. |
| `canvas review list` | One line per set: id, status, row, page, title. |
| `canvas review create <id> --page <page> [--title] [--question] [--lead] [--status] [--waits-on id ...] [--replaces id ...] [--canvas id] [--board file ...]` | Adds a set. A new set starts as exploring, ready, waiting, next or later. |
| `canvas review status <id> <status> [--issue n] [--pr url] [--branch name] [--commit sha]` | Moves a set. `building` and `live` need a lock; moving back to a deciding, next or later status clears the lock. Locking and archiving have their own commands. |
| `canvas review lock <id> --words "<the decision-maker's words>" --harness claude-code\|codex [--date YYYY-MM-DD] [--piece text ...] [--canvas id] [--renders dir]` | Locks the set and writes its build brief. |
| `canvas review archive <id> [--board file ...] [--why text] [--date YYYY-MM-DD] [--canvas id] [--archive id] [--renders dir]` | Archives the set's boards as pictures and moves it to archived. |

## Lock

Lock records the date, the decision-maker's words and the harness in `review.json` and writes `builds/<set>.md` with these sections, in this order:

- What changes
- Lead boards: viewer links and rendered pictures
- Pieces: the kit's modules, compositions and routes
- Waits on
- Acceptance: the Live boards match the lead after the merge and sync, and the render check passes
- Out of bounds: no database, API or permission change

The pictures come from the render check: every lead board must have a render whose source hash matches the board as it is now, and that render must pass. Lock copies each theme's picture into `builds/<set>/` and links them from the brief. Pieces lists what the agent passes with `--piece` (such as the kit's modules, compositions and routes), then the kit components (other than the kit's `Root`, which only frames a board) and `data-source` paths found on the lead boards.

**Waiting sets** are built with their dependency, in the same pull request. Locking a set whose dependencies are all live says "start the build now". Locking a set that waits on a set not yet live says the build goes with that set. When the dependency is locked, its brief lists every locked set built with it.

## Archive

Archive keeps a set's boards (or the named ones) as pictures of how they were rendered, on the archive canvas (`canvases/archive/` unless `--archive` names another):

- the picture of each board's first theme goes to `project/assets/<entry>/<board>.png`;
- the board's source goes to `source/<entry>/<board>.dc.html`, outside `project/`, so it is kept but not served as a board;
- the entry (`{id, date, set, title, question, lead, page, why, boards: [{file, title, image, w, h, source, from}]}`) goes to `tools/archive.json` (`canvas-archive/1`);
- the archive canvas is rebuilt with the board builder: a Start here page listing every entry, and a page per app page with a row per entry;
- the set becomes `archived`.

Archive never changes the app canvas: the project's builder script leaves archived sets out on its next run, which removes their generated boards.

## Change log

- 2026-10-20: first pinned version. MM-04 adds the field rules, the commands, how lock checks renders, the build-with rule for waiting sets and the archive layout. The package text says "the decision-maker's words" and "the kit's modules" where the PM39 brief names a person and a product's kit; the schema is unchanged.
