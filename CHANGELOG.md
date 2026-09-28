# Changelog

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
