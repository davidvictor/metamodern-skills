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

Each write replaces the file atomically: a temporary file is renamed over the target, under a short lock (`<file>.lock`, a directory; one older than 10 seconds is taken over). That way the viewer and an agent can write the same comment at once without losing either change. A new comment or batch is linked into place instead, so it never replaces a file already there. JSON is written with two-space indents and a trailing newline. Every id is checked against its form before anything touches the file system.

**Ids:** comments are `c_<yyyymmdd>_<6 base36>`, batches `b_<yyyymmdd>_<6 base36>`, and thread messages `m_<time base36>_<6 hex>`.

## An annotation

AFS 1.1 (`https://agentation.com/schema/annotation.v1.1.json`).

**Required fields:**

| Field | Our value |
| --- | --- |
| `id` | The comment id. |
| `comment` | The person's words. |
| `elementPath` | A CSS path from `body` (`body > div:nth-of-type(1) > p:nth-of-type(2)`). For an area or board comment, `body`. |
| `timestamp` | Milliseconds since the epoch. |
| `x` | The pin's place as a percent of the board's width. |
| `y` | The pin's place in pixels from the board's top. |
| `element` | The kit component name when the element is a component's root (`Button`), else its tag (`td`). For an area comment, `area`; for a board comment, `board`. |

**Optional fields we use:** `boundingBox` (`{x, y, width, height}` in board pixels), `url` (the board's viewer link), `reactComponents`, `nearbyText`, `attributes`, `intent` (`fix|change|question|approve`), `severity` (`blocking|important|suggestion`), `status`, `resolvedAt`, `resolvedBy` and `thread`.
- **`reactComponents`:** the kit components from the outermost one down to the element, from their `data-kit-component` names, such as `Root > Card > List > ListItem`.
- **`nearbyText`:** the element's own text, or its parent's when it has none.
- **`thread`:** `[{id, role: "human" | "agent", content, timestamp}]`. The person's first words are in `comment`, not in the thread.

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
  "text": "<the element's own text when it was picked>",
  "identity": { "mode": "look-alike | words", "anchor": { "kind": "canvas-id | kit-component | test-id | board", "key": "" },
                "like": { "tag": "", "attrs": { }, "text": "", "shape": "" },
                "levels": [{ "depth": 1, "own": [], "others": [] }], "count": 0, "index": 0 }
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
- **`identity`:** element comments only, recorded for an element without its own unique label: the evidence that finds it again (see [Identification](#identification)). `count` and `index` are present for `mode: "look-alike"`.

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
| Resolved | `resolved`, with `resolvedAt` and `resolvedBy: "human"` | The person chose **Resolve** in the viewer. Only a person resolves. |
| Reopened | `pending` again | The person replied to an addressed or resolved comment. |

An agent's reply without `--addressed` adds to the thread and leaves the state as it is. An agent cannot address a resolved comment, because only a person reopens it.

## Batches

```json
{ "schema": "canvas-batch/1", "id": "b_<yyyymmdd>_<6 base36>", "createdAt": "<ISO>", "comments": ["<id>"],
  "status": "sent | taken | done", "takenBy": "<harness/session or null>" }
```

**Send all to agent** bundles every comment that is `pending` and not in a batch an agent has yet to finish (`sent` or `taken`).
- Each comment is checked again inside its own lock and records the batch in `canvas.batch`; the batch lists only the comments that did. A comment resolved or sent meanwhile is left out.
- A batch file that cannot be read, or is not a valid batch, is left on disk and reported in `problems`; its comments count as still with the agent, so they are never sent twice. A comment whose batch has no file at all (a send that stopped before writing it) goes out again.
- The batch file is written last, so a listener never sees a batch its comments don't know about.
- A comment still open after its batch is `done` goes out in the next batch.
- With nothing open, no batch is made.

## Re-attachment

When a board loads, whether after its file or kit changed or after it was regenerated, and when its values change, the viewer locates each of its open element comments with `canvas:locate` and the comment's `label`, `labelKind`, `elementPath`, `text` and `identity`. The board answers `canvas:located` with the element's rect now, or with `{missing: true}`.

### Identification

**The guarantee:** a comment is re-attached only on unambiguous evidence; otherwise it shows as moved. A wrong attachment is never acceptable; an extra "moved" after an edit is. This design is provisional (set by the lead on 2026-10-20 after four reviews; revisit with real boards). Cases that are adversarial rather than realistic for design boards are documented below, not handled.

**Terms.**
- **Look-alikes:** elements with the same tag, the same identifying attributes (`src`, `alt`, `aria-label`, `name`, `placeholder`, `href`, `data-test`, `data-testid`, `role`, `title`, `type`), the same **shape** and the same own text. The shape is a short hash of the element's markup without text, children included, and without `class`, `style`, `data-*`, `id`, `for` and the id-reference attributes `aria-controls`, `aria-labelledby`, `aria-describedby`, `aria-owns` and `aria-activedescendant`: two icons drawn differently are not look-alikes, while a kit re-render that changes class names or generates new ids still matches.
- **Anchor:** the nearest element above with a stable, unique label, in contract order: a `data-canvas-id` or test id used once, or a kit component alone of its name in its scope; else the board.
- **A level of evidence** for an element among its look-alikes inside a scope: its **group**, the nearest element above it (`depth` levels up, inside the scope) whose words differ from those of the corresponding element above every other look-alike; **own tokens** (`own`), up to five own texts of the group's descendants (80 characters at most) that no other group has; and **other tokens** (`others`), the texts this group lacks from the other look-alikes' groups **and from every sibling of the group's tag** (the other rows beside it, whether or not they hold a look-alike yet), up to five hundred, each group's first texts first. Ranks and plain numbers (`#2`, `120`, `3.5`) are left out of the other tokens, so re-sorted ranked rows still match. All levels of one identity together stay within 96,000 characters (the last other tokens of the largest level are dropped first), well inside the viewer's 256 KB request limit.
- **Repeated structure:** the nearest element above an element that is one of several of its tag under its parent (a row among rows, a card among cards).

**When a comment is made**, the runtime records:
1. **Its own unique label** (a `data-canvas-id` or test id used once on the board): nothing more.
2. **Words of its own** (own text non-empty, and no other element of its tag on the board has it): when it sits inside a repeated structure, an `identity` with `mode: "words"` holding one level of evidence for that row among its siblings. Outside any repeated structure (a page title), nothing more: the words find it.
3. **Otherwise** an `identity` with `mode: "look-alike"`: the anchor, `like` (tag, attributes, text, shape), up to three levels of evidence (each narrowing from the anchor to the group that tells it apart, then within that group to the next), and its place among the look-alikes left in the innermost group (`count`, `index`).

**When a board loads**, the runtime finds:
1. an element with its own unique label by that label;
2. a look-alike identity level by level: inside the current scope, a group holding **any** of that level's other tokens is rejected; among the rest, the one group holding the most own tokens (at least one, with no tie) is the scope for the next level. After the levels, the element is the look-alike at its recorded index, **only while the number of look-alikes there is unchanged**;
3. an element with words of its own by them: the one element of its tag with those words (if several have them now, the one at the label's place; if none, the element at the label's place when it is still the only one of its kind there), and then, when row evidence was recorded, only if the row it is in now (the same number of levels up) holds none of the other rows' tokens and at least one of its row's own tokens **other than those words** (when the row had any): words never follow into another row, or into a new row.

Anything else is missing. A textless icon on a 601-row board is found in about 4.4 ms (median of 20).

**What the viewer records:**
- **Found:** the viewer writes the new place (`rect`, `boundingBox`, `x`, `y`) and clears `moved`. A change under half a pixel is not written.
- **Missing:** the viewer sets `moved`, and the pin stays at the last place.
- **Only under the same values:** the file is written only while the board shows every value the comment recorded in `canvas.props`. Under other values an element can be hidden or elsewhere for a while: the pin follows the board, and the file keeps the place the element had under the comment's own values.

A comment is never deleted and never attached to a different element.

**Known limits** (each shows as moved, or, for the last two, is accepted by design):
- **Moved after an edit:** an element whose words were edited; an element whose row or card took one of another row's words (a role, a vendor) or lost all of its own tokens; an element found by its words whose row's only other own word was edited (nothing else tells its row from a new row that took those words); an identical item whose group gained or lost a look-alike. Picking the element again re-attaches the comment.
- **Rows that share every word but one** (for example only the name differs): editing that word leaves no evidence, so the comment shows as moved.
- **A row that becomes word for word the one commented on** (its own row removed, another row given exactly its words): indistinguishable, so it is accepted as the same row.
- **A new row that takes the removed row's remaining words** (its row removed, a new row added with its role but a new name): indistinguishable from the row being renamed and moved, so it is accepted as the same row.
- **Truly identical items** (toolbar icons drawn the same, rating stars): found by their place, only while their number is unchanged.

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
  - It watches `comments/batches/`, polling once a second as a safety net, and writes `Waiting for a batch.` to standard error once it is listening. A batch reaches a listening session well within a second of the click (see the tests).
  - With `--timeout`, it exits with code 2 when nothing arrives.
- **`take`:** marks the batch `taken` by `--by`, else `CANVAS_SESSION`, else the harness and session the environment names (`claude-code/<session>`, `codex/<thread>`). A batch taken by another session is refused.
- **`reply`:** adds the agent's message. `--addressed` marks the comment `acknowledged`.
- **`done`:** marks the batch `done`.

**The loop for an agent:** `wait` (or `list --open` when asked) → `take` → change the files → `reply <id> "<what changed>" --addressed` for each comment → `done`.

## Viewer routes

| Route | What it does |
| --- | --- |
| `GET /_comments` | `{comments, batches, problems}`. A comment or batch file that does not pass the check is left on disk and listed in `problems` (shown in the Comments tab), not in `comments` or `batches`. |
| `POST /_comments` | Creates a comment. |
| `POST /_comments/<id>/reply` | `{content}`: a person's reply. |
| `POST /_comments/<id>/resolve` | Resolves the comment. |
| `POST /_comments/<id>/place` | `{rect, boardWidth}` or `{moved: true}`: where the comment's element is now. |
| `POST /_comments/send` | Send all to agent: `{batch}`, or `{batch: null}` when nothing is open. |

POSTs are accepted only with `content-type: application/json`, an `Origin` that is the viewer itself, and a body of at most 256 KB. The server watches `comments/` (a recursive watch, with a 300 ms poll of the files as a safety net) and sends a `{type: "comments"}` event when anything there changes.

## Change log

- 2026-10-20: built in MM-03, which records contract 4 as pinned with these additions, accepted before the first consumer:
  - `canvas.text`;
  - null `label` and `labelKind` for area and board comments;
  - `reactComponents` from the kit component chain.
- 2026-10-20: closing review: words found inside a repeated structure always carry their row's evidence and must find at least one of the row's other own words; other tokens come from every sibling row; generated ids no longer change the shape; other tokens are capped at 500 per level within a 96,000-character budget.
- 2026-10-20: after three reviews, `canvas.identity` (replacing a `canvas.fingerprint` that was never released) with the guarantee above: own unique label; else words of its own, checked against their group's evidence; else an identity among look-alikes (anchor, shape, up to three levels of own and other tokens, place). Groups holding another group's tokens are rejected, words never follow into another row, look-alikes drawn differently are told apart, and nested look-alikes are narrowed level by level. Batch files that cannot be read are reported and their comments not sent again; Send all re-checks each comment inside its lock; places are written only under the comment's own values; new files never replace existing ones; ids are checked before any file system call; `wait` says when it is listening.
