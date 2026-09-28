---
name: metamodern-interface-studio
description: Use when the user wants to inspect, build, update, verify, prepare, or publish an Interface Studio for reviewing and presenting an existing application's UI kit and screens across web or native targets.
---

# Metamodern: Interface Studio

Build a review environment around existing product behavior. The Studio is removable; the application owns its rules, permissions, calculations, command outcomes, and navigation. Reuse its components and seams before proposing abstractions or refactors. This skill supplies contracts, not an application scaffold or a universal UI language.

## Route the request

Select the requested operation; compose operations only within the authorized scope. Internal scanning, reconciliation, repair, capture, and export are steps, not extra modes. The Studio's interface **views** are Inspect, Compare, Gallery, and Present; they are distinct from these six operations.

| Operation | Outcome and references |
| --- | --- |
| **Inspect** | Read source and tests without modifying the application or kit. Inventory tokens, components, routes, surfaces, states, interactions, assets, target platforms, and tests. Produce a source map, preview strategy, coverage gaps, and concrete build scope. Use [manifest](references/manifest.md) and [adapters](references/adapters.md) to separate observations, assumptions, and unavailable evidence. |
| **Build** | Deliver a working catalog, repeatable scenarios, at least one appropriate adapter, Inspect and Gallery views, capability-aware controls, and an initial coherent walkthrough. Read [manifest](references/manifest.md), [scenarios](references/scenarios.md), [adapters](references/adapters.md), the relevant [web](references/web.md) or [native](references/native.md) guide, and [presentation](references/presentation.md). Verify using [verification](references/verification.md). |
| **Update** | Reconcile last baseline, current source, and current Studio material using [manifest](references/manifest.md). Preserve presenter work, stable identity, and unresolved references. Report changes, conflicts, stale evidence, and verification. Read target guides only for changed integrations. |
| **Verify** | Check requested claims against named source, scenarios, and environments using [verification](references/verification.md). Repair only within scope. Verification alone does not authorize a product release or infer acceptance. |
| **Prepare** | Create or revise audience-specific collections, comparisons, narration, and walkthroughs using [presentation](references/presentation.md). Preserve product facts and report missing or stale story steps. |
| **Publish** | Only on a request naming a destination: follow [verification](references/verification.md#publication), build the Studio, deploy to that destination, and verify the hosted result. A missing destination blocks deployment, not local preparation. |

## Non-negotiable boundaries

- Preserve the fixed product identity and existing kit. Do not invent a new brand direction or redesign the application as a side effect. Follow the project's accepted design authority where available; missing authority is an evidence gap, not permission to claim approval.
- Stable semantic IDs survive labels, routes, files, and layout changes. Ambiguous renames remain candidates. Keep generated records separate from presenter overlays.
- Every preview discloses fidelity and operational capabilities. Actual UI with fixture dependencies, instrumented native UI, static captures, and illustrative recreations establish different claims. Unsupported controls explain their limits.
- Each preview owns an isolated scenario runtime. Keep product state, product navigation, catalog selection, and presenter playback separate. Reset restores product state and navigation; interaction does not rename the scenario.
- Fixtures need provenance and audience permission. Never put credentials or personal fixture values in URLs, telemetry, or public bundles.
- Do not silently substitute a different scenario or story when references break. Show unresolved or stale material and keep recovery possible.

## Finish

Report artifacts and their locations, operation completed, source baseline, implemented coverage, preview fidelity, verification environment/results, conflicts, unavailable checks, and next concrete limitations. Distinguish package checks, source inspection, local runtime evidence, native runtime evidence, hosted Studio publication, product deployment, and real-user acceptance. None implies the next.
