---
name: metamodern-prepare-project
description: Use when a user asks to start, adopt, inspect, repair, refresh, or make portable a project workspace, especially when project context, references, capability artifacts, or skill routing are missing, stale, conflicting, or scattered.
---

# Metamodern Prepare Project

## Purpose

Make a project understandable, portable, correctly routed, and ready for its capabilities without introducing another database, fixed scaffold, or workflow engine.

## Resolve the boundary

Identify the project, repository, and application roots; active branch or worktree; and requested scope. One Project spanning several apps keeps one root `PROJECT.md` and `REFERENCES.md`; child apps receive only local `AGENTS.md` overlays and capability artifacts they own. Create child core artifacts only when the child is a separate Project with its own bounded outcome. Read current instructions before writing.

## Choose the behavior

- **Inspect or review:** Map the workspace, authority, routing, and missing portable artifacts read-only. Propose exact local changes without creating or merging artifacts.
- **Start:** The project is new or lacks an incumbent working environment. Read [Start](references/start.md).
- **Adopt:** The project already contains implementation, assets, documents, decisions, skills, or active work. Read [Adopt](references/adopt.md).

Begin Adopt read-only. Preserve dirty work, untracked files, current branches, sources, history, and external state.

## Prepare the workspace

Inspect the evidence needed for the requested mode and distinguish project, product, brand, design, artifact, working, published, historical, and unresolved context. Return a concise workspace map and exact local artifact change set.

For Start or Adopt, create or merge `PROJECT.md`, `REFERENCES.md`, and `AGENTS.md` using [Artifact Contracts](references/artifact-contracts.md). Fill only supported content. Ask one focused question before replacing or materially reinterpreting an existing canonical artifact. Inspect and review requests remain read-only unless the user separately authorizes the proposed local changes.

Route `PRODUCT.md`, `BRAND.md`, `DESIGN.md`, and briefs through their owning capabilities. Project Preparation coordinates those artifacts and does not author substitutes for them. When skill routing is needed, read [Shared Skills](references/shared-skills.md); stop on a same-name user/project collision until one unambiguous capability is selected. Reference shared Metamodern skills by canonical name and keep project-specific skills uniquely named.

Verify fresh-session understanding, authority, routing, links, capabilities, and preservation in proportion to the requested changes.

## Compose engineering setup when authorized

When the requested outcome includes establishing development for a web app, mobile app, or website, route to `metamodern-initiate-engineering` after grounding the portable core. Pass settled decisions, source authority, existing artifacts, scope, and unresolved dependencies. It owns the adaptive engineering interview and first-task handoff. For an explicitly requested MakerKit base preparation only, route directly to `metamodern-bootstrap-app`; full initiation is not a prerequisite.

Authorized initiation and MakerKit bootstrap route profile setup to `metamodern-configure-engineering`. Add its canonical source and the resulting local profile to `REFERENCES.md`, and retain managed policy links in `AGENTS.md` and actual stack commands in `README.md`. Configuration owns generated runtime files; Project Preparation owns the portable core. Preserve supplied decisions, local overrides, and separate configuration/native/provider evidence states. Do not install this profile for Inspect, brand, prose, document, or orientation work alone.

When an engineering skill delegates missing portable context here, honor its **portable-core-only** scope: create or merge the supported core and return to the caller. Do not invoke initiation, bootstrap, configuration, interface setup, or another product interview from that delegated call. Existing core needs only missing/stale fields reconciled. Project preparation alone does not authorize feature implementation or hosted provisioning.

Brand, writing, document, workspace orientation, and other non-engineering projects do not acquire an engineering process automatically. Missing engineering capabilities block only that routing; identify the canonical source and continue independent preparation.

## Activate interface production conditionally

When the current request authorizes interface-production setup or implementation for a user-facing website, application, or interface, read [Impeccable interface foundation](references/impeccable-interface-foundation.md). Prepare its derived local runtime only after the project root, product scope, and Brand System sufficiency are resolved.

When no interface is in scope, do not install, initialize, or invoke Impeccable. Brand, Figma, deck, document, and other non-interface work stays with its owning capability.

## Maintain references normally

Every participating skill maintains `REFERENCES.md`. Add a durable resource when its role, project relationship, and stable link are clear. Ask one focused question before changing authority or choosing between plausible sources.

Resolve requests such as `do it in Figma`, `use the approved copy`, and `check the live site` through System, Role, Scope, Authority, Use when, and current verification. Use one clear owner; ask one target question when several remain plausible.

## Capability routing

- Missing or insufficient Brand System: use `metamodern-develop-brand`; accept `BRAND.md` before client-facing artifact production.
- Visual translation: use `metamodern-explore-brand-expression`.
- Product or frontend context: after interface-foundation preflight, use Impeccable init for confirmed `PRODUCT.md`.
- Implemented interface system: use Impeccable document mode for `DESIGN.md` after reconciling it with accepted brand authority.
- Interface implementation and QA: use Impeccable inside the accepted Brand System; it does not replace Brand Development, Visual Direction, or Figma.
- Surface or deliverable strategy: use the owning capability's native brief contract.

If a required capability is unavailable, report its canonical name and source. Do not silently substitute an unrelated skill.

## Closeout

Return changed artifacts, preserved work, open authority questions, reference additions, required capabilities, verification, and the next substantive action. Project setup never implies external mutation, publication, deployment, cleanup, merge, or client approval.
