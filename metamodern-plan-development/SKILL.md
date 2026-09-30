---
name: metamodern-plan-development
description: Use when planning or materially reframing software development into an outcome brief and proportionate delivery batches. Planning alone does not authorize execution.
---

# Metamodern: Plan Development

Translate the user's direction into observable behavior, then choose the smallest useful plan that can deliver it. Read the owning project's instructions and relevant source contracts. Reuse decisions and the existing task record; do not start another requirements inventory.

This skill augments the project's engineering workflow. Keep its orchestration, mandatory tests, independent review and delivery controls. The user describes the result in ordinary language; the agent supplies decomposition and validation cadence without requiring the user to write an engineering specification.

## Establish the outcome

Distinguish the result the user wants from the implementation they suggested. Preserve explicit choices, certainty and urgency. Identify what must survive, what may change, what is excluded and the authorized endpoint. A request to simplify an interface may permit new composition without changing permissions or form values. A request to plan stays read-only unless preparation edits are separately authorized.

Reflect the interpreted outcome and material assumptions briefly, matching the user's level of detail. Do not demand a restatement in a template, flatten distinctive intent or invent missing scope. Use relevant prior decisions, not the whole conversation history. A clear build instruction proceeds after this readback; it is not an approval checkpoint.

Use [the outcome brief](references/outcome-brief.md) when work needs a handoff or multiple steps. For a small change, the current conversation can be the brief. Add the project's required delivery fields to its existing record rather than duplicating them in another artifact.

Discover before asking. Resolve routine reversible choices and state meaningful assumptions. Ask a concise question only when its answer changes product meaning, an obligation, authority or a materially costly choice. Continue independent work while a dependent decision is pending. Stop interviewing once the selected outcome is clear enough to act on.

## Choose delivery batches

Separate implementation steps from delivery batches. Group related steps under one reviewable outcome and integration boundary; a component family or worker milestone need not become its own release. Respect repository branch, review and check requirements. If an existing mandate forces wasteful per-step delivery, identify the specific conflict and propose a bounded revision; do not silently bypass it.

Default to a sequence of appropriately sized delivery worktrees: a coherent outcome that one owner can implement, test and review, with explicit dependencies and a usable handoff to the next. Keep batches small enough to diagnose regressions and inspect the complete diff. Consolidation does not mean replacing the whole product in one unchecked change. Parallel implementation remains subject to project ownership rules and genuinely independent interfaces.

When migration semantics are uncertain, choose one real representative consumer to resolve them before broad replacement. Record which old behaviors remain obligations and which structures, visuals or APIs the user authorizes replacing. Treat a changing family map as evidence to reconcile, not a permanent compatibility promise.

Select proof by failure consequence, uncertainty, reversibility and current consumers. Name focused checks for editing, required integrated checks for delivery, and the actual environment each needs. Do not schedule unavailable application routes against a component-only server. Record existing failures relevant to the change without repeatedly reproducing unrelated noise.

## Hand off or proceed

Return the outcome, coherent batches, acceptance examples, relevant sources, selected checks, meaningful assumptions and next action. Do not create numeric cost estimates without supporting telemetry. Planning is complete when the next owner can execute without rediscovering scope and knows when to stop.

If the user already authorized implementation, continue through the requested endpoint using `metamodern-execute-development` when available, or this project's execution method. Do not ask for approval of the same work again. Load only the next skill needed; these skills are capabilities, not four mandatory ceremonies.
