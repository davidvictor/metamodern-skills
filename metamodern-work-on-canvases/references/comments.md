# Comments (contract 4)

Comments are a click-to-comment layer in the viewer, saved as files in the project. Every agent on every account and machine can read them, and diffs stay clean. Each file is one annotation in Agentation's published annotation format (AFS 1.1), with this package's facts under one key, `canvas`. Comments reach an agent through **Send all to agent**: one batch of everything open, which a listening session receives within seconds and any other session works through on request.

This file is the source for contract 4. Code: [`scripts/lib/comment-store.mjs`](../scripts/lib/comment-store.mjs) (files, checks, states, batches), [`scripts/comments.mjs`](../scripts/comments.mjs) (the agent's command line), [`assets/viewer/comments.js`](../assets/viewer/comments.js) (the viewer layer), and the picking and locating handlers in [`assets/runtime/support.js`](../assets/runtime/support.js) (contract 2 messages, [board-language.md](board-language.md)).

## In the viewer

- **Comment mode:** `C`, or the comment button in the top bar, turns it on and off. While it is on, every board on screen runs live from 10% zoom.
  - **An element:** click it, on any board at any zoom. The element under the pointer is outlined first.
  - **An area:** drag a box. Use it when the issue sits between elements, such as spacing or alignment.
  - **A whole board:** press `Shift C`, or choose **Comment on this board** in the Comments tab, for the selected board.
- **Writing a comment:** type, then `Enter` to post (`Shift Enter` for a new line). `Esc` cancels the comment, and a second `Esc` leaves comment mode. While picking, presses never reach the board, so nothing on it changes.
- **Pins:** each comment is a numbered pin on its board, at the element's top left, and it follows pan and zoom.
  - Pins are numbered per canvas, oldest first, and a number never changes.
  - A pin is green once the agent has addressed its comment.
  - A pin is dashed and orange, and named **Moved**, when its element is gone from the board. It stays at the last place the element was.
- **The Comments tab** lists comments by canvas (this one first), then by board. Filters show Open (pending and addressed), Resolved or All.
  - **Opening a comment:** clicking one flies to its pin, going to its page if needed, and opens its thread.
  - **Replying:** a reply is yours. Replying to an addressed or resolved comment reopens it.
  - **Resolving:** **Resolve** closes a comment. Only a person resolves.
- **Send all to agent:** the button in the top bar shows how many open comments are not yet with the agent, and sends them as one batch.
- **Live updates:** when an agent replies, its reply and the comment's state show up within moments, with no reload.

## Files

```text
comments/<canvas>/<id>.json          one annotation per file
comments/batches/<batchId>.json
```

Each write replaces the file atomically: a temporary file is renamed over the target, under a short lock (`<file>.lock`, a directory; one older than 10 seconds is taken over). That way the viewer and an agent can write the same comment at once without losing either change. JSON is written with two-space indents and a trailing newline.

**Ids:** comments are `c_<yyyymmdd>_<6 base36>`, batches `b_<yyyymmdd>_<6 base36>`, and thread messages `m_<time base36>_<6 hex>`.

## An annotation

AFS 1.1 (`https://agentation.com/schema/annotation.v1.1.json`).

**Required fields:**

| Field | Our value |
| --- | --- |
| `id` | The comment id. |
| `comment` | David's words. |
| `elementPath` | A CSS path from `body` (`body > div:nth-of-type(1) > p:nth-of-type(2)`). For an area or board comment, `body`. |
| `timestamp` | Milliseconds since the epoch. |
| `x` | The pin's place as a percent of the board's width. |
| `y` | The pin's place in pixels from the board's top. |
| `element` | The kit component name when the element is a component's root (`Button`), else its tag (`td`). For an area comment, `area`; for a board comment, `board`. |

**Optional fields we use:** `boundingBox` (`{x, y, width, height}` in board pixels), `url` (the board's viewer link), `reactComponents`, `nearbyText`, `attributes`, `intent` (`fix|change|question|approve`), `severity` (`blocking|important|suggestion`), `status`, `resolvedAt`, `resolvedBy` and `thread`.
- **`reactComponents`:** the kit components from the outermost one down to the element, from their `data-kit-component` names, such as `Root > Card > List > ListItem`.
- **`nearbyText`:** the element's own text, or its parent's when it has none.
- **`thread`:** `[{id, role: "human" | "agent", content, timestamp}]`. David's first words are in `comment`, not in the thread.

**Our extension**, under one key:

```json
"canvas": {
  "schema": "canvas-comment/1",
  "canvas": "<id>", "page": "<id>", "board": "<file without .dc.html>",
  "kind": "element | area | board",
  "label": "<stable label>", "labelKind": "canvas-id | kit-component | test-id | path",
  "rect": { "x": 0, "y": 0, "w": 0, "h": 0 },
  "kit": { "mode": "pinned | live", "ref": "<commit or live name>", "version": "<kit.json version>" },
  "props": { },
  "moved": false,
  "batch": "<batchId or null>",
  "text": "<the element's own text when it was picked>"
}
```

- **`page`:** `-` for a canvas without pages.
- **`label` and `labelKind`:** null for area and board comments, which stay where they were drawn.
- **`rect`:** the element's or area's rect in board pixels: the last place it was found.
- **`kit`:** what the board reported in `canvas:ready` when the comment was made.
- **`props`:** the board's adjustable values at that time, without `$`-prefixed entries.
- **`moved`:** true while the element is gone.
- **`batch`:** the last batch the comment went out in.
- **`text`:** element comments only. It is sent with `canvas:locate` to tell neighbours apart (see Re-attachment).

### Stable labels

Labels follow contract 2's order. The label is taken from the nearest element at or above the picked one that carries, in order:

1. `data-canvas-id`;
2. `data-kit-component`, plus the component's position;
3. `data-test` or `data-testid`.

The path from that element down to the picked one follows the label. An element with none of these above it is named by its CSS path.

| `labelKind` | Label |
| --- | --- |
| `canvas-id` | `<id>`, or `<id>[n]` when the id is used more than once, then ` > <steps>` |
| `kit-component` | `<scope id>/<Name>[n]`, then ` > <steps>`. `n` counts `<Name>` components in document order inside the nearest `data-canvas-id` above (empty scope: the whole board). |
| `test-id` | `<value>`, or `<value>[n]`, then ` > <steps>` |
| `path` | `body > <steps>` |

A step is `tag:nth-of-type(n)`.

## States

| State | `status` | How |
| --- | --- | --- |
| Open | `pending` | A new comment, or one a person replied to. |
| Addressed | `acknowledged` | The agent replied with `--addressed`; its message is in the thread. |
| Resolved | `resolved`, with `resolvedAt` and `resolvedBy: "human"` | David chose **Resolve** in the viewer. Only a person resolves. |
| Reopened | `pending` again | David replied to an addressed or resolved comment. |

An agent's reply without `--addressed` adds to the thread and leaves the state as it is. An agent cannot address a resolved comment, because only a person reopens it.

## Batches

```json
{ "schema": "canvas-batch/1", "id": "b_<yyyymmdd>_<6 base36>", "createdAt": "<ISO>", "comments": ["<id>"],
  "status": "sent | taken | done", "takenBy": "<harness/session or null>" }
```

**Send all to agent** bundles every comment that is `pending` and not in a batch an agent has yet to finish (`sent` or `taken`).
- Each comment records the batch in `canvas.batch`.
- The batch file is written last, so a listener never sees a batch its comments don't know about.
- A comment still open after its batch is `done` goes out in the next batch.
- With nothing open, no batch is made.

## Re-attachment

When a board loads, whether after its file or kit changed or after it was regenerated, the viewer locates each of its open element comments with `canvas:locate` and the comment's `label`, `labelKind`, `elementPath` and `text`. The board answers `canvas:located` with the element's rect now, or with `{missing: true}`.

**Choosing the element:** a label that counts its way to an element (`[n]`, or steps) could now point at a neighbour, so the recorded text decides. The runtime tries these in order:
1. the element at the label's place, if its text still matches;
2. otherwise, the one element of its kind there that has that text;
3. otherwise, the element at the label's place, if it is the only one of its kind (its text was edited).

If none of these fits, the element is missing.

**What the viewer records:**
- **Found:** the viewer writes the new place (`rect`, `boundingBox`, `x`, `y`) and clears `moved`. A change under half a pixel is not written.
- **Missing:** the viewer sets `moved`, and the pin stays at the last place.
- **Adjusting values:** while David adjusts a board's values, pins follow the board without writing the files.

A comment is never deleted and never attached to a different element.

**Known limit:** an element whose text was edited, and that sits among others of its kind, shows as moved instead of re-attached. Picking it again re-attaches the comment.

## The agent's command line

The same on every harness: Node built-ins only, JSON on standard output. Run it with the package's script from inside the project, or pass `--project <dir>`:

```text
node <package>/scripts/canvas.mjs comments list [--open] [--batch <id>]
node <package>/scripts/canvas.mjs comments wait [--timeout <s>]
node <package>/scripts/canvas.mjs comments take <batchId> [--by <harness/session>]
node <package>/scripts/canvas.mjs comments reply <id> "<text>" [--addressed]
node <package>/scripts/canvas.mjs comments done <batchId>
```

A project's install can wire this as `npm run canvas -- comments …`.

- **`list`:** prints comments with their viewer `link`. `--open` limits it to `pending` comments, and `--batch` to one batch's comments.
- **`wait`:** blocks until a batch is `sent`, then prints it with its comments in full (`annotations`, each with its `link`).
  - A batch already waiting is printed at once, the oldest first.
  - It watches `comments/batches/`, polling once a second as a safety net. A batch reaches a listening session well within a second of the click (see the tests).
  - With `--timeout`, it exits with code 2 when nothing arrives.
- **`take`:** marks the batch `taken` by `--by`, else `CANVAS_SESSION`, else the harness and session the environment names (`claude-code/<session>`, `codex/<thread>`). A batch taken by another session is refused.
- **`reply`:** adds the agent's message. `--addressed` marks the comment `acknowledged`.
- **`done`:** marks the batch `done`.

**The loop for an agent:** `wait` (or `list --open` when asked) → `take` → change the files → `reply <id> "<what changed>" --addressed` for each comment → `done`.

## Viewer routes

| Route | What it does |
| --- | --- |
| `GET /_comments` | `{comments, batches, problems}`. A comment file that does not pass the check is listed in `problems`, never dropped. |
| `POST /_comments` | Creates a comment. |
| `POST /_comments/<id>/reply` | `{content}`: a person's reply. |
| `POST /_comments/<id>/resolve` | Resolves the comment. |
| `POST /_comments/<id>/place` | `{rect, boardWidth}` or `{moved: true}`: where the comment's element is now. |
| `POST /_comments/send` | Send all to agent: `{batch}`, or `{batch: null}` when nothing is open. |

POSTs are accepted only with `content-type: application/json`, an `Origin` that is the viewer itself, and a body of at most 256 KB. The server watches `comments/` and sends a `{type: "comments"}` event when anything there changes.

## Change log

- 2026-10-20: built in MM-03, which records contract 4 as pinned with these additions, accepted before the first consumer:
  - `canvas.text`;
  - null `label` and `labelKind` for area and board comments;
  - `reactComponents` from the kit component chain.
