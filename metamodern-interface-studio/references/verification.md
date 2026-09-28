# Verification and publication

## Match evidence to the claim

Plan checks from the affected seams and supported capabilities. A manifest validator proves reference integrity only within its documented coverage. A screenshot does not prove behavior; a browser mirror does not prove native rendering; source tests do not prove hosted delivery or user acceptance. Inspect actual captures before making visual claims.

Each result records check ID, target, environment and tool version, source revision plus dirty-file digest, scenario/fixture version, fingerprint, profile, variant/theme/revision, expected and observed result, capture/log paths if relevant, and limitations. Use `passed`, `failed`, `unavailable`, or `stale`; omit inapplicable fields with a reason. Keep source, local, native, hosted, and real-user evidence distinguishable. A missing tool or fixture is unavailable, never a pass. Scope acceptance to the named behavior and environment.

## Checks by seam

| Seam | Observable evidence |
| --- | --- |
| Catalog | Unique immutable IDs, valid typed refs, source mappings, fixture versions/hashes, audience policy, target/profile/combinations, overlay ownership, resolvable steps/anchors. Tombstones produce explicit unresolved refs. |
| Scenario | Materialize twice; compare fingerprints and visible results. Exercise a meaningful product command and navigation. Reset both, including during in-flight work; compare original fingerprint. Interact in one preview and inspect siblings for leakage. |
| Adapter | Ready/failure/timeout, representable and rejected navigation, supported controls, cancellation, reset and disposal. Capture metadata matches mounted inputs; no false native or interactive claims. |
| Presentation | Search/group Gallery; lazy previews do not run unnecessary background work. Inspect controls stay outside product. Walkthrough manual next/back, pause/resume, live interruption, exit and safe return. Broken steps stop with diagnostics. |
| Comparison | Name one axis; record both input tuples and fingerprints. Hold other inputs equal or disclose unavoidable differences. Check isolation and unsupported combinations. |
| Update | Rename keeps ID; token/source dependency changes stale evidence; deleted surfaces leave tombstones; manual narration survives; competing edits produce durable conflicts; unchanged rerun is byte-identical. Unsupported versions and interrupted updates preserve last valid material. |
| Responsive | Representative narrow and wide shell plus meaningful target profiles. Inspect overflow, wrapping, preview scale labels, navigation/control reachability, safe areas where actually supported, loading/error and long-content states. |
| Accessibility | Keyboard order/activation, visible focus, accessible names/roles, announcements for meaningful state changes, control contrast/size, pause and reduced motion. Automated scanning where available supplements manual checks; report untested assistive technologies and native accessibility. |

For the Studio's own interface, check the acceptance criteria in [shell.md](shell.md#acceptance-criteria) and report each as met, partial, not measured or not applicable. Use current project tooling; don't require an arbitrary framework or broaden tests after relevant checks pass. Read current framework/router/tool documentation when integration details are uncertain. Preserve editable assets and keep capture bundles out of source control unless appropriate to the project.

## Isolated skill evaluation

To evaluate this skill itself, give an independent agent the skill and a disposable source application, not a model answer. Keep evaluation artifacts outside real applications. A small web component must perform a meaningful state mutation and product navigation, with real product logic reused by its Studio. Include a clearly labeled static native-target sample; a synthetic image only proves fallback handling, not native rendering. Record this distinction.

Exercise Inspect, Build, Update, Verify and Prepare against the isolated source. The first Build includes Gallery and an initial walkthrough. Verify deterministic reset/isolation, interaction/navigation, interruption/return, one declared comparison axis, source rename, token change, deletion, manual presenter edit, ambiguous conflict, unresolved removed reference and a byte-identical unchanged rerun. Use a distinct case to test a discovered contract repair rather than matching prose. Check actual browser behavior, responsive/keyboard behavior and representative captures. Do not deploy as part of evaluation unless separately requested.

Record raw inputs, commands, outcomes and artifact paths in a report. Distinguish which decisions an evaluator made from which behaviors automation checked. If an evaluator manually models reconciliation, that tests guidance application for those cases, not a production reconciliation engine. Package validation and synthetic success do not establish a real-app integration.

## Publication

Publish requires the user's request plus destination and intended audience. Read destination/project state before changing it; if missing, prepare locally and ask for the missing destination. Use the environment's authorized deployment tooling and release conventions.

Before deploying: build the Studio, verify routes/assets and target adapters, resolve audience permissions for actual fixture/media bytes, review bundled files for credentials/private payloads, and check that conflicts or stale material cannot be mistaken for verified current behavior. Exclude development write endpoints and secrets. Public viewers receive only the assets and permissions intended for them. A native stream still needs its own access policy; do not publish an unrestricted simulator/control endpoint.

After deploying: load the actual destination URL, verify shell and nested/deep links, images/fonts/scripts, selected scenarios, supported interactions, Gallery, walkthrough interruption/return and responsive behavior. Compare hosted source/asset baseline to the intended build. Report deployment ID/URL and actual hosted checks. If authentication prevents verification, report publication status and hosted verification as separate facts. Studio publication never proves product deployment, native runtime verification, design approval, or real-user acceptance.
