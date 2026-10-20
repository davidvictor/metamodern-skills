---
name: metamodern-work-on-canvases
description: Use when working with design canvases that mount a project's real component kit, including reading or validating canvas.json and canvas.config.json, writing or running a canvas builder script, render-checking boards, creating, locking or archiving review sets, making an exploration canvas, running existing boards on the package's board runtime, or checking a kit against the kit contract.
---

# Metamodern Work on Canvases

## Purpose

Canvases are where interface designs are explored and decided against the real component code. A canvas is a `canvas.json` plus one HTML board per artboard; every board loads this package's runtime as `support.js` and mounts components from the project's kit. Code stays the source of components: a canvas explores and decides, and the decided version is built in the product's code.

## What the package holds

- [Canvas format and project config](references/canvas-format.md): `canvas.json` v3 with the `ws` additions, `canvas.config.json`, live kits, frozen canvases, viewer links and what a board can load.
- [Board language and messages](references/board-language.md): the constructs boards use, how each behaves, and the messages between a board and the viewer.
- [Kit contract](references/kit-contract.md): what a project's kit provides, including legacy kits.
- [Board builder](references/board-builder.md): the one library every project builder script uses, board shells, layout, heights, and exploration canvases.
- [Render check](references/render-check.md): what it opens, what fails a board, theme variants, screenshots, reports and heights.
- [Review sets and build briefs](references/review-sets.md): `review.json`, the status-to-row mapping, lock briefs and the archive canvas.
- The board runtime, `assets/runtime/support.js`, with no framework of its own.
- Node modules with no dependencies: `scripts/canvas-format.mjs`, `scripts/board-resolve.mjs`, `scripts/kit-contract.mjs`, `scripts/board-builder.mjs`, `scripts/render-check.mjs`, `scripts/review-sets.mjs` and `scripts/explore.mjs`, with one command line, `scripts/canvas.mjs`.

## Checks

Paths below are relative to this skill's folder (`metamodern-work-on-canvases/`); run the commands with that folder's path in front of `scripts/` from anywhere else.

1. Install the tooling once, outside the repository: `node scripts/tooling.mjs install --browser`.
2. Validate a kit folder with `validateKitFolder(dir)` from `scripts/kit-contract.mjs`.
3. Render-check boards before anyone sees them: `node scripts/canvas.mjs render --project <project> [--canvas <id>]`. It fails on page and console errors, missing files, images with no picture, clipped text, content past the board's size and empty mounts, in each declared theme, saves screenshots and writes heights for the builder.
4. Build a canvas by running its builder script, then render-check it; a builder change shows after one run.
5. Work with review sets through `node scripts/canvas.mjs review <validate | list | create | status | lock | archive>`, and make an exploration canvas with `node scripts/canvas.mjs explore create <id> --title <title> --question <question>`.
6. Run existing boards unchanged on the runtime: `node scripts/compat-check.mjs --canvas <folder with canvas.json> --kit <Namespace>=<kit folder> --out <evidence folder>`. It writes a screenshot per board and a summary, and fails on page errors, console errors, failed requests and empty mounts. Run it locally; it reads boards and kits where they are and writes only to `--out`.

## Rules

- Never edit a generated board by hand, and never copy the runtime, the builder or the render check into a canvas: boards load `support.js` from the package, and builder scripts import the package's library.
- Lock a set only with the decision-maker's words, after its lead boards pass the render check at their current source.
- Never open or copy a hosted canvas runtime script. The runtime is written from the boards themselves.
- Copy on boards is plain and final.
