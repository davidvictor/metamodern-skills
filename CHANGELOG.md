# Changelog

## 1.6.1 — 2026-09-29

- Interface Studio 0.4.1: remove the caption above the preview. It repeated the dock and Details. Fidelity is stated in Details (and in the top bar for static captures and recreations), Inspect's Zoom control states the shown scale ("Fit · 54%") beside the Size control's pixels, and other views keep a size chip under the frame.
- Labels under the rail icons are on by default on desktop; only a viewer's explicit choice is stored, so older stored options do not keep them off. Acceptance grows to AC-01 to AC-16 and AC-10, AC-11 and the walkthrough-exit focus check follow the new layout. All sixteen pass for the starter.

## 1.6.0 — 2026-09-29

- Interface Studio 0.4.0: profiles become a range of sizes. The dock's profile icons become one Size menu grouped by profile kind (phone, tablet, laptop, desktop), and with a live frame and `axes.resizable` Inspect's frame can be dragged by its right edge, bottom edge or corner to any size. Edges snap to profile sizes and adapter breakpoints, the scale is frozen during a drag, a readout names the profile a drag lands on, the size travels in the link, the handles are keyboard sliders, and a double-click returns to the profile. The frame is resized in place, so a product must lay itself out from its own viewport.
- Fix the Gallery size slider under a pointer drag (Base UI passes a number, not an array). Compare gains Profile and scenario-input axes and reports the pair's state instead of a stale Loading. Add `axes.defaultProfile`, `product.brandDefault` and an optional `product.markSvg` drawn on a solid brand tile.
- The walkthrough player's All steps opens a step list that works with the side panel closed. On a phone the header actions fold behind one trigger that slides them out, and the mark's tile stays square. In dark appearance the frame's inner keyline is a faint hairline; corner ticks carry the 3:1 boundary.
- Acceptance grows to AC-01 to AC-15 (AC-10 now measures light and dark separately, and adds AC-12 Gallery zoom, AC-13 size and resize, AC-14 All steps, AC-15 phone header). All fifteen pass for the starter; swipe, real devices, more than two Compare sides, and real-product integration remain unverified.

## 1.5.0 — 2026-09-28

- Interface Studio 0.3.0: the shell starter now meets its own scale criteria. The catalog and walkthrough step list are windowed lists with one tab stop, arrow keys and type-ahead; the token grid is windowed and folds families over 60; walkthroughs past 24 steps use one progress bar with marks for broken steps and an All steps list.
- Every preview states its size and percentage with a Fit or 100% action; the frame edge uses two keylines so any product edge stays visible; controls reach 44 px on coarse pointers; Exit returns focus to what opened Present.
- Add `npm run acceptance`, a Playwright script that builds the starter with a 1,000-scenario stress adapter and a capture-only adapter and measures AC-01 to AC-11. All eleven pass for the starter; swipe, real devices, more than two Compare sides, and real-product integration remain unverified.

## 1.4.0 — 2026-09-28

- Add a product-neutral Studio shell starter to Interface Studio 0.2.0 in `assets/studio-shell`: a grey review stage, icon rail with contextual panels, and Inspect, Compare, Gallery, Present, and Tokens views on shadcn 4.21 (Base UI, Rhea style).
- Connect products through one adapter declaration and the studio-preview/1 frame protocol, with a framework-free client for the product's preview entry, staged swaps, timeouts, isolated runtimes per preview, live token drafts, and walkthrough command replay with anchors.
- Add a Studio brand color that tints only Studio accents, and treat Modified as a state set by real product changes rather than a count of clicks.
- Add the shell and frame protocol references, shell acceptance criteria with the starter's current status, and a synthetic example product. Real-application integration, native runtime, hosted publication, and user acceptance remain unverified.

## 1.3.0 — 2026-09-28

- Add Interface Studio 0.1.0 for Inspect, Build, Update, Verify, Prepare, and Publish workflows around existing application interfaces.
- Define portable manifest, presenter ownership, deterministic scenario, target fidelity, update reconciliation, presentation, and verification contracts.
- Add a read-only manifest validator with 12 regression tests and document installation and usage for Codex and Claude Code.
- Validate the method in an isolated synthetic web example; native runtime, real-application integration, hosted publication, and user acceptance remain unverified.

## 1.2.0 — 2026-09-26

- Add Prompt Learn mode for explicit local knowledge saving, research, correction, inspection, and removal.
- Discover relevant personal and project references outside installed packages, preserving knowledge across supported updates and reinstalls.
- Document scope, provenance, conflict handling, backup/sharing, and Codex-only project installation.
- Add installer preservation coverage and independent save/retrieval checks. Writing remains at 0.1.3.

## 1.1.0 — 2026-09-26

- Expand Prompt to version 1.1.0 with eight source-backed domain references: UI design, front-end development, back-end/API design, domain and data modeling, automotive design, automotive engineering, copywriting, and marketing.
- Add selective domain routing and connections between interface behavior, APIs, data rules, vehicle design/engineering, and marketing/copy.
- Preserve the four existing prompt modes and their scope boundaries. Writing remains at version 0.1.3.
- Add domain evaluation cases and package-discovery checks.

## 1.0.0 — 2026-09-26

First public release of the 13 Metamodern skills.

- Publish one canonical collection with independent package versions and selective Codex/Claude Code installation.
- Include Prompt's Clarify, Expand, Combine, and Prepare modes plus Review, Focus, Split, and Shorten.
- Replace personal authority and private source assumptions with the requesting user's own project context and approvals.
- Keep client examples, private design-file identifiers, account-specific consent, and third-party paid works outside this release.
- Add package validation, isolated installer regression coverage, writing-preservation checks, and GitHub CI.

The Agency repository consumes this collection as a pinned submodule. The earlier Articulate Intent and Expand Intent packages are replaced by `metamodern-shape-prompt`; see the README for migration and update commands.
