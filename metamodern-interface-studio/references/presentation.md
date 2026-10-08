# Review and presentation

Read this for Build, Prepare, or presentation verification. The Studio's views are **Inspect, Compare, Gallery, and Present**, plus **Responsive** (one screen at several sizes, with sync) and **Design** (Adjust and Tokens) when the product declares design parameters or has a token source. A design draft is exploration: it is always labeled and never plays in a walkthrough. They are not extra skill operations. [shell.md](shell.md) defines how the starter lays them out and which controls it uses. [manifest.md](manifest.md) defines stable records and presenter ownership; [adapters.md](adapters.md) determines which controls can honestly work.

## Design around reviewer tasks

- **Find a surface/state:** searchable labels and descriptions, useful area/state/target/status filters, and direct selection by stable IDs.
- **Understand context:** expose scenario, target, profile, variant, theme, revision, source, fixture provenance, capabilities, independent statuses, and freshness beside the preview.
- **Exercise behavior:** present supported product inputs plus clear reset/modified state and relevant feedback.
- **Compare a named change:** label the changing axis and the held inputs.
- **Follow or interrupt a story:** keep narration, step controls, interruption, and return accessible.

Keep controls and internal review metadata outside the product preview. Areas describe product organization; collections describe reviewer/presenter grouping. Product flows describe real tasks; walkthroughs describe a presentation of those tasks. Use plain labels and progressive detail rather than filling the shell with raw manifest fields.

The first Build includes **Inspect, Gallery, and an initial walkthrough**, even for a small catalog. The walkthrough should explain one coherent task grounded in observed application behavior. A Compare view may initially explain that no meaningful supported alternatives exist; never invent a variant just to populate it.

## Gallery and shell

Gallery supports catalog or collection discovery, search/filter, and meaningful surface/state grouping. Prefer isolated captures or lazily mounted previews. Offscreen entries must not keep unnecessary requests, timers, media, or animations running. Dispose unused runtimes and indicate loading, stale evidence, unsupported targets, and failed captures individually. A thumbnail click opens its declared scenario, not the last mutated state of another preview.

Keep a narrow-screen catalog collapsible and controls reachable by keyboard/touch. Preserve the target preview's declared dimensions; disclose scaling. Restore focus after dialogs, drawer closure, view changes, and presentation exit. Studio accessibility and product accessibility are separate verification subjects.

## Comparisons

Keep visual variant, theme, structural revision, profile, and target as separate axes. Each comparison declares one changing axis, all compared values, equivalent scenario/fixture/clock/seed/conditions, and fixed remaining axes. Verify equality from resolved inputs rather than labels alone. Revision comparisons can have explicit behavior differences; profile or target comparisons can have unavoidable layout, input, or navigation differences. Describe these limits instead of asserting pixel equivalence.

Each side starts from a fresh isolated runtime or matching evidence. Interacting with one side marks that side modified and invalidates baseline equivalence until reset or a declared equivalent command replay. Cross-target semantic equivalence needs evidence; matching scenario IDs alone does not prove it. Unsupported combinations remain unavailable. A stale capture alongside a current preview is a disclosed historical comparison, not a current token-only comparison.

The starter supports a pair or an explicit set of up to four values of one axis. A set holds one scenario and the remaining resolved inputs constant, except disclosed target coupling. Every column owns an independent runtime. Preserve a product's authored three-direction overview as a set rather than silently replacing it with pairwise views.

## Walkthrough contract

Steps reference stable scenario IDs and optional semantic anchors, expected outcomes, commands, narration, and timing. Resolve each step before playback against current target capabilities and source/evidence freshness. A missing scenario, removed surface, stale assumption, unsupported command, or missing anchor remains an explicit unresolved step. Do not silently skip it, substitute a similar scenario, or invent an outcome. A presenter may deliberately revise the story through Prepare.

The starter's `Step.values` supplies authored scenario inputs, `duration` supplies seconds, and an optional stable `id` keys presenter edits across reorderings. A deliberate `hidden` edit suppresses playback without deleting the authored step. Without an explicit ID the starter uses the tour and original step position, so add IDs before changing order. Browser overlays have a separate versioned import/export envelope; preserve the original export when a source revision removes a tour or step. Play all sequences the authored tours, while manual next/back, pause, focus mode and interruption remain available. Presenter overlays never grant new preview capabilities or source approval.

Implement equivalent player behavior with these semantics:

| Action | Expected result |
|---|---|
| Enter | Save the prior Studio selection and relevant focus/scroll context; open the first resolved step in a dedicated runtime |
| Advance | Materialize the step's scenario, wait for readiness, issue declared commands through the application path if supported, check expected outcomes, then narrate/focus |
| Back | Reconstruct the prior step deterministically from its scenario and declared commands; do not attempt to reverse arbitrary application effects |
| Pause/interruption | Freeze presentation timing and prevent queued automatic commands; preserve the step and current runtime |
| Live exploration | Pause before accepting exploration; retain original scenario ID, mark modified, and record supported command history |
| Resume | After exploration, visibly restore/replay the current step baseline before continuing its schedule, or offer an explicit continue-from-modified choice; never replay commands silently on modified state |
| Exit | Cancel timing and in-flight player work, dispose its runtime, restore prior Studio selection/focus; keep presenter edits |

Manual advance and back work without autoplay. Resume after an ordinary pause must not execute the same completed command twice. Use operation/generation identity to reject late completions from previous steps or exited playback. If the saved selection is no longer resolvable, return to a safe catalog view and explain the missing reference. Product back within a live preview remains distinct from player Back.

## Prepare and preserve

Adapt collections, order, narration, comparisons, and emphasis to the requested audience using supported evidence and authorized fixture material. Keep presenter edits in the manual ownership layer so Update can report drift without overwriting them. Retain unresolved/stale steps and competing edits for deliberate reconciliation. Preparing a persuasive presentation does not change design approval, implementation status, publication, or user acceptance.

For independent Design-only appearance comparisons, use the namespaced `appearance:<parameter-id>` axis and existing ordered `Comparison.values` tuple. Appearance is never saved as a component property. Authored steps and presenter overlay patches retain appearance in optional `Step.design`; import/export and effective-theme checks preserve its meaning. See [the exact contract](frame-protocol.md#appearance-comparisons-and-presentation). One installed style creates no fake comparison control, and share receivers require a capable shell.
