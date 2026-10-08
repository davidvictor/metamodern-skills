---
name: metamodern-interface-studio
description: Use when the user wants to inspect, build, update, verify, prepare, or publish an Interface Studio for reviewing and presenting an existing application's UI kit and screens across web or native targets.
---

# Metamodern: Interface Studio

Build a review environment around existing product behavior. The Studio is removable; the application owns its rules, permissions, calculations, command outcomes, and navigation. Reuse its components and seams before proposing abstractions or refactors. This skill supplies contracts and a product-neutral Studio shell starter in [assets/studio-shell](assets/studio-shell/README.md). The shell has its own interface language for the Studio only; it never renders product UI and never becomes a universal UI language for products.

## Route the request

Select the requested operation; compose operations only within the authorized scope. Internal scanning, reconciliation, repair, capture, and export are steps, not extra modes. The Studio's interface **views** are Inspect, Compare, Gallery, and Present, plus Responsive (one screen at several sizes) and Design when the product declares design parameters or has a token source; they are distinct from these six operations.

| Operation | Outcome and references |
| --- | --- |
| **Inspect** | Read source and tests without modifying the application or kit. Inventory tokens, components, routes, surfaces, states, interactions, assets, target platforms, and tests. Produce a source map, preview strategy, coverage gaps, and concrete build scope. Use [manifest](references/manifest.md) and [adapters](references/adapters.md) to separate observations, assumptions, and unavailable evidence. |
| **Build** | Create the Studio from the shell starter with `scripts/update-studio.mjs --create` using [shell](references/shell.md), then deliver a working catalog, repeatable scenarios, at least one appropriate adapter, Inspect and Gallery views, capability-aware controls, and an initial coherent walkthrough. Read [manifest](references/manifest.md), [scenarios](references/scenarios.md), [adapters](references/adapters.md), [frame protocol](references/frame-protocol.md), the relevant [web](references/web.md) or [native](references/native.md) guide, and [presentation](references/presentation.md). Verify using [verification](references/verification.md) and the shell acceptance criteria. |
| **Update** | Reconcile last baseline, current source, and current Studio material using [manifest](references/manifest.md). Preserve presenter work, stable identity, and unresolved references. Report changes, conflicts, stale evidence, and verification. Read target guides only for changed integrations, and [shell](references/shell.md) when the Studio's own interface changes. To bring a Studio to the newest shell, follow [updating](references/updating.md): report first, resolve blocked files, apply, and report the checks. |
| **Verify** | Check requested claims against named source, scenarios, and environments using [verification](references/verification.md). Repair only within scope. Verification alone does not authorize a product release or infer acceptance. |
| **Prepare** | Create or revise audience-specific collections, comparisons, narration, and walkthroughs using [presentation](references/presentation.md). Preserve product facts and report missing or stale story steps. |
| **Publish** | Only on a request naming a destination: follow [verification](references/verification.md#publication), build the Studio, deploy to that destination, and verify the hosted result. A missing destination blocks deployment, not local preparation. |

When a product asks for its own workspace tools in its Studio, such as environment configuration, a schema explorer, email previews or translations, also read [workspace](references/workspace.md). No other request needs it; Inspect, Build and Update are otherwise unchanged.

When a product asks for a component library in its Studio (one documentation page per component, with live, grouped previews and a playground), also read [library](references/library.md). No other request needs it.

When a product requests reviewed rich Design controls or a component-treatment inspector, read [Design editors](references/design-ui.md). Use its opt-in controller and protected panels; retain the product compiler as the only interpretation path. For named saved directions, hydration, imports, recovery or independent comparison pins, also read [saved directions](references/directions.md).

When the product requests local feedback annotations, read [local annotations](references/annotations.md). The capability is opt-in, Library/Inspect only, and excluded from production/export builds.

## Non-negotiable boundaries

- Preserve the fixed product identity and existing kit. Do not invent a new brand direction or redesign the application as a side effect. Keep the shell and the product apart: product tokens never style the shell, shell tokens never reach a preview, and product needs go in the adapter rather than in shell components. Follow the project's accepted design authority where available; missing authority is an evidence gap, not permission to claim approval.
- Stable semantic IDs survive labels, routes, files, and layout changes. Ambiguous renames remain candidates. Keep generated records separate from presenter overlays.
- Every preview discloses fidelity and operational capabilities. Actual UI with fixture dependencies, instrumented native UI, static captures, and illustrative recreations establish different claims. Unsupported controls explain their limits.
- The shell defaults to mapped Hugeicons Free Stroke Rounded through provider-neutral icon slots. A licensed receiver may activate the explicit Pro build profile through the [icon profile contract](references/icon-profiles.md); Pro activation uses only installed Pro glyphs and never adds a Free choice. Product icon policy belongs to its adapter and runtime. Declare only real installed styles; `stroke-rounded` is appearance, not entitlement. For state-preserving appearance changes, use the explicit `apply.live` / `live-appearance` contract in [frame protocol](references/frame-protocol.md#declared-live-appearance-0190); ordinary `live-values` does not qualify.
- Each preview owns an isolated scenario runtime. Keep product state, product navigation, catalog selection, and presenter playback separate. Reset restores product state and navigation; interaction does not rename the scenario.
- Fixtures need provenance and audience permission. Never put credentials or personal fixture values in URLs, telemetry, or public bundles.
- Do not silently substitute a different scenario or story when references break. Show unresolved or stale material and keep recovery possible.

## Finish

Report artifacts and their locations, operation completed, source baseline, implemented coverage, preview fidelity, verification environment/results, conflicts, unavailable checks, and next concrete limitations. Distinguish package checks, source inspection, local runtime evidence, native runtime evidence, hosted Studio publication, product deployment, and real-user acceptance. None implies the next.
