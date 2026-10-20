---
name: metamodern-work-on-canvases
description: Use when working with design canvases that mount a project's real component kit, including reading or validating canvas.json and canvas.config.json, running existing boards on the package's board runtime, checking a kit against the kit contract, or confirming that existing boards still run unchanged.
---

# Metamodern Work on Canvases

## Purpose

Canvases are where interface designs are explored and decided against the real component code. A canvas is a `canvas.json` plus one HTML board per artboard; every board loads this package's runtime as `support.js` and mounts components from the project's kit. Code stays the source of components: a canvas explores and decides, and the decided version is built in the product's code.

## What the package holds

- [Canvas format and project config](references/canvas-format.md): `canvas.json` v3 with the `ws` additions, `canvas.config.json`, live kits, frozen canvases, viewer links and what a board can load.
- [Board language and messages](references/board-language.md): the constructs boards use, how each behaves, and the messages between a board and the viewer.
- [Kit contract](references/kit-contract.md): what a project's kit provides, including legacy kits.
- The board runtime, `assets/runtime/support.js`, with no framework of its own.
- Node modules with no dependencies: `scripts/canvas-format.mjs`, `scripts/board-resolve.mjs` and `scripts/kit-contract.mjs`.

## Checks

1. Install the tooling once, outside the repository: `node scripts/tooling.mjs install --browser`.
2. Validate a kit folder with `validateKitFolder(dir)` from `scripts/kit-contract.mjs`.
3. Run existing boards unchanged on the runtime: `node scripts/compat-check.mjs --canvas <folder with canvas.json> --kit <Namespace>=<kit folder> --out <evidence folder>`. It writes a screenshot per board and a summary, and fails on page errors, console errors, failed requests and empty mounts. Run it locally; it reads boards and kits where they are and writes only to `--out`.

## Rules

- Never edit a generated board by hand, and never copy the runtime into a canvas: boards load `support.js` from the package.
- Never open or copy a hosted canvas runtime script. The runtime is written from the boards themselves.
- Copy on boards is plain and final.
