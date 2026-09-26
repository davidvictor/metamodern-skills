---
name: metamodern-work-in-figma
description: Use when the user requests Figma inspection, comment review, design construction, revision, organization, verification, or handoff in Design, Slides, or libraries.
---

# Metamodern Work in Figma

## Purpose

Apply Metamodern's Figma Working Style. Keep design adaptable, preserve ordinary human editing, and close work with current structural and visual evidence.

## Choose the operating mode

Use the requested outcome and existing session authorization to choose the mode. Skill selection alone does not authorize edits. Reuse the supplied target and still-valid approvals; ask only when an unresolved target, scope, or consequential action requires the director's decision.

| Request language | Mode | Permitted action |
| --- | --- | --- |
| Audit, review, inspect, comments, plan, options | Read-only | Inspect, render, report, and recommend only. |
| Explore, directions, alternatives | Review-area write | Create only in a separate labeled review section. |
| Build, revise, implement, update | Approved build | Edit the approved canonical scope and required non-breaking local-system pieces. |
| Delete, replace structure, publish a breaking change, move ownership, change permissions, split files, branch | Explicit authorization | Proceed only when the director has authorized the precise change; otherwise prepare the concrete change for approval. |

A comment is evidence of a request, not permission to implement or resolve it. A user instruction to implement specified feedback authorizes that scope. Branching is off by default. Use the canonical file and labeled review areas for ordinary work. Add no separate milestone-recording step unless the director explicitly asks for one.

## Apply the Working Style

Inspect the exact target, source authority, relevant comments, live structure, and current rendering. Identify components, overrides, variables, links, crops, fonts, and manual adjustments relevant to the requested work.

For a review, return findings and proposed fixes supported by that evidence. Completion does not require edits, comment resolution, a new design system, or an implementation run.

For authorized construction or revision, make the smallest coherent native change. Preserve approved content, connected components, editability, and meaningful human adjustments. Put unapproved options in the review area. Client-facing visual production requires a sufficient accepted Brand System; route a missing system through `metamodern-develop-brand`, and visual-expression decisions through `metamodern-explore-brand-expression`.

Read changed structure back and inspect a fresh rendering. Check relevant risks and every accessible consumer affected by shared-component changes. Identify inaccessible consumers as unverified. For variable changes, verify persisted variable values and bindings; a canvas swatch alone does not prove the variables changed.

Return the requested findings or verified result, relevant system impact, and any exact action or evidence still missing. Match verification to the affected scope; do not extend a Figma-only task into implementation just to claim broader conformance.

Every Project owns its design system. Publish it only for a real consumer. Components are repeated bounded pieces; complete compositions remain native. Repositionable media remains a selectable child inside its container.

When creating a new Project, start with `00 · Overview`, foundations, components, assets, and relevant recipes. An existing file review or local revision does not require rebuilding that structure. Add depth only as work repeats.

## Read the relevant guidance

- Read [core working rules](references/core.md) for system construction and governance.
- Read [connector workflow](references/connector-workflow.md) before mutation or comment resolution.
- Read [editorial documents](references/editorial.md) for publications.
- Read [decks and Figma Slides](references/decks.md) for presentations.
- Read [web product design](references/web.md) for web products.
- Read [iOS product design](references/ios.md) for iOS products.
- Read [starter references](references/starters.md) only when a current starter could materially reduce setup; verify its live state before use.
- Read [guidance promotion](references/promotion-model.md) before proposing a Project lesson as shared guidance.

## Use current capabilities

Load and follow `figma:figma-use` before using `use_figma`, plus the applicable official prerequisite for the requested operation. Reuse guidance already read in the active context unless it changed or a new operation needs another reference.

Do not create a universal library, componentize a complete composition, flatten editable content, use an unapproved style source, publish a breaking contract, or claim an unverified result.

At closeout, keep Project-specific decisions with the Project. Follow [guidance promotion](references/promotion-model.md) when a reusable correction is supported by evidence; ordinary task completion does not require a skill edit.
