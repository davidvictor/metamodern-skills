---
name: metamodern-work-on-canvases
description: Use when designing on canvases that mount a project's real component kit, including the Foundations canvas, component labs and live mode, the app canvas and its review sets, exploration canvases, choosing a lead, locking a set and its build brief, keeping Live rows current after a kit sync, archiving, working through viewer comments, viewing canvases in the local viewer, writing or running a builder script, render-checking boards, checking a kit against the kit contract, or installing, updating or verifying this package in a project.
---

# Metamodern Work on Canvases

## Purpose

Canvases are where interface designs are explored and decided against the real component code. A canvas is a `canvas.json` plus one HTML board per artboard; every board loads this package's runtime and mounts components from the project's kit. Code stays the source of components: a canvas explores and decides, and the decided version is built in the product's code.

The package is the runner, the file format and the method. The project owns its kit build, its builder scripts, its canvases and its records.

## Rules

- One lead per set on the app canvas.
- Options only on exploration canvases, at most two open per area.
- Components are decided before the flows that use them.
- Run the builder, then the render check, before showing anything.
- Boards that are recorded, rendered for the decision-maker, or used as a lead or a Live row use the pinned kit. A live worktree kit is only for boards switched to it during a lab session, and the banner shows it.
- Lock only with the decision-maker's own words. A lock that needs a database, API or permission change stops and goes back as product work.
- Generated boards are never edited by hand, and no canvas gets its own copy of the tooling. The installed package is never edited in the project.
- Never open or copy a hosted canvas runtime script. Copy on boards is plain and final.

## Working loops

Each loop is described in [the method](references/method.md):

1. **Foundations:** tokens and motion drawn from the pinned kit, rebuilt after each kit sync.
2. **Component lab:** states, playground and in place, plus live mode on a project app worktree (`.canvas/live.json`, boards switched to `live:<name>`).
3. **App canvas:** a page per area with Live, Deciding, Building, Next and Later rows from `review.json`.
4. **Exploring:** `canvas explore create`, directions side by side.
5. **Choosing a lead:** the lead moves to the app canvas, `canvas explore decide` freezes the exploration.
6. **Locking:** `canvas review lock` with the words, then the build from `builds/<set>.md` in the product's repository.
7. **Keeping Live current:** run the project's kit sync after a build merges and before rendering for a decision, then rebuild and render-check.
8. **Archiving:** `canvas review archive` keeps replaced or set-aside boards as pictures.
9. **Comments:** `canvas comments wait`, `take`, `reply --addressed`, `done`, after the decision-maker presses Send all to agent.

## Commands

In a project where the package is installed, run `npm run canvas -- <command>` from the project root. Here, run `node scripts/canvas.mjs <command>` from this folder with `--project <dir>`.

| Command | Use |
| --- | --- |
| `view` | Serve every canvas on `127.0.0.1`. Send viewer links (`/<canvas>/<page>/<board>`), never file paths. |
| `render [--canvas <id>]` | The render check: every board in each theme, screenshots and heights. |
| `review validate \| list \| create \| status \| lock \| archive` | Review sets and build briefs. |
| `explore create \| decide` | Exploration canvases. |
| `comments list \| wait \| take \| reply \| done` | The comment loop. |
| `install \| update \| verify` | Install the package at a pinned version, update it, check it is unedited. |

Install the browser tooling once per machine, outside the repository: `node scripts/tooling.mjs install --browser`.

## References

- [The method](references/method.md): the loops and rules in detail.
- [Installing and updating](references/install.md): pinned install, the lock file, project-owned paths, `--keep` and `--replace`.
- [Canvas format and project config](references/canvas-format.md): `canvas.json`, `canvas.config.json`, live kits, frozen canvases, viewer links, what a board can load.
- [Board language and messages](references/board-language.md): the constructs boards use and the messages between a board and the viewer.
- [Kit contract](references/kit-contract.md): what a project's kit provides, including legacy kits.
- [The viewer](references/viewer.md): home, links, the kit switch and banner, properties, motion, live reload and keys.
- [Board builder](references/board-builder.md): the library every builder script uses, and exploration canvases.
- [Render check](references/render-check.md): what fails a board, theme variants, screenshots and heights.
- [Review sets and build briefs](references/review-sets.md): `review.json`, rows, lock briefs and the archive canvas.

Existing boards can be run unchanged on the runtime with `node scripts/compat-check.mjs --canvas <folder> --kit <Namespace>=<kit folder> --out <evidence folder>`, and a kit folder checked with `validateKitFolder(dir)` from `scripts/kit-contract.mjs`.
