# Preview adapter contract

Read this when selecting, implementing, or verifying an adapter. [manifest.md](manifest.md) owns the serializable records and IDs; [scenarios.md](scenarios.md) owns materialization and isolation. This document defines runtime behavior, not a universal rendering framework. [frame-protocol.md](frame-protocol.md) shows how the shell starter realizes it: an adapter declaration plus an isolated frame per preview.

## Fidelity and capabilities

Classify every preview as actual application UI and behavior, actual UI with substituted dependencies, instrumented native UI, static native capture, or illustrative recreation. Then independently describe **rendering, behavior, navigation, data, and operating-system interactions** as real, simulated, static, or unavailable, with a reason and evidence. A single “interactive” flag cannot describe these differences. An actual renderer with a fixture service can have real rendering and application commands, simulated data and navigation dependencies, and unavailable OS integration.

Derive controls from the effective capabilities of the adapter **and selected preview**, after profile, revision, fixture, and source compatibility checks. Do not enable a target-wide capability for a scenario that cannot support it.

| Operation | Required support and honest fallback |
|---|---|
| Exercise behavior | Real application command path or explicitly simulated behavior; static previews expose no product actions |
| Product navigation | Valid target mapping for destinations/outlets and back behavior; unsupported destinations report a reason |
| Reset | Restore isolated product state and navigation together; static previews only reload the selected evidence |
| Change profile/theme/variant/revision | A compatible renderer or matching capture; resizing an image is zoom, not responsive rendering |
| Inspect | Distinguish runtime semantics/accessibility inspection from viewing catalog provenance |
| Capture | A real target capture or an existing capture with its original provenance; a screenshot of an image is not new native evidence |
| Focus an anchor | An available semantic runtime anchor or an explicitly authored static annotation; missing anchors remain unresolved |

Hide irrelevant controls or disable them with a short explanation. Never silently ignore an unsupported request or simulate success. Share semantic scenario intent and token meaning only where they align; each target owns its router, rendering, inputs, safe areas, and OS conventions.

## Lifecycle and operation results

Use equivalent interfaces appropriate to the implementation language; no fixed SDK is required. A preview handle supports declared operations, observable lifecycle, and bounded failures:

1. **Validate:** resolve stable IDs, fixture version, profile, axes, navigation mapping, audience permissions, and required source dependencies before mounting. Unsupported combinations return a structured reason without changing the current preview.
2. **Mount:** allocate an isolated runtime and cancellation scope. The handle becomes `ready` only after initial state and navigation are applied, relevant controlled asynchronous work settles, and the rendering surface is available. For web this includes required fonts/assets; for native it includes the instrumented build or stream handshake. A loading spinner is not readiness evidence.
3. **Operate:** commands, navigation, reset, update, inspect, and capture return success with resulting state/evidence identifiers, or an explicit error. Reject unsupported operations. Serialize dependent transitions or use generation tokens so late completions cannot overwrite a newer selection or reset. An in-place property update (the starter's `live-values`, see [frame-protocol.md](frame-protocol.md)) keeps product state and navigation, is not a person's modification, and falls back to a fresh mount when it fails; the fingerprint and diagnostics taken at mount keep describing the mount.
4. **Dispose:** cancel pending requests, timers, subscriptions, streams, observers, and input listeners; unmount the renderer and release runtime resources. Disposal is safe to repeat. Ignore late callbacks from disposed handles and reject later operations as disposed.

Isolation is the adapter's choice. A web adapter whose previews must not carry the viewer's cookies, or must not navigate or script the Studio, declares it once for every preview (the starter's `frameIsolation`, see [frame-protocol.md](frame-protocol.md#frame-isolation)); the shell applies it as declared and adds no policy of its own. A sandbox with both `allow-scripts` and `allow-same-origin` isolates nothing when the frame is served from the Studio's own origin; use that pair only for a frame entry on a separate origin.

Use explicit states such as loading, ready, error, and disposed. Errors identify operation, target, scenario, recoverability, and a safe diagnostic reason without fixture secrets. Distinguish unsupported operation, invalid navigation, missing dependency/tool, readiness timeout, runtime failure, and capture failure. Retain the previous valid preview when possible; otherwise show an error surface. A bounded retry may recover a transient failure; repeated failure changes the reported capability/availability rather than looping indefinitely.

## Navigation and reset atomicity

Translate semantic locations/outlets into the target's actual route tree, history, stack, modal, and panel model. Validate the complete navigation snapshot before applying it. Commit product state and navigation as one visible transition: either the requested pair becomes ready or the prior valid pair remains. If the router cannot apply atomically, stage a separate preview and swap after readiness, or hide the transitioning surface and restore the prior pair on failure. Never display a successful new state with failed old navigation.

Test direct entry, user navigation, back/dismiss, unsupported destinations, and reset after interaction. Reset rematerializes the original scenario, cancels outstanding work, restores initial product navigation, and clears its modified state/history while preserving the scenario ID. Studio selection and presenter playback remain separate. Each comparison column and Gallery item has its own handle; disposing or resetting one must not affect another.

## Capture evidence

Capture only a ready preview at a defined settled point. Record target and adapter type, environment/build and source revision, scenario ID and fixture version, runtime fingerprint, modified state and command-history reference when available, profile, visual variant, theme, revision, logical time, capture time, dimensions/scale, artifact hash/location, fidelity, and failed/unavailable checks. Use the manifest's evidence representation rather than a parallel registry.

Store an immutable capture separately from its metadata. Source or fixture drift marks evidence stale; recopying it or changing its timestamp does not refresh it. Capturing Studio chrome, a stream, an image, or a recreation must identify that boundary. A capture proves the visible state recorded, not commands, accessibility, OS behavior, publication, or acceptance.
