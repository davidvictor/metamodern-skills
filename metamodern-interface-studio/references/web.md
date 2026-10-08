# Web integration

Use this with [adapters.md](adapters.md) when a web target is in scope. Choose the smallest mount boundary that preserves the application's actual components, providers, styles, router semantics, and command behavior. The Studio must be removable without breaking the product.

## Select the boundary from observed source

| Existing application | Suitable starting point |
|---|---|
| Client components with explicit dependencies | Component mount with the same providers and an isolated store/router per preview |
| Route-driven application with nested layouts/loaders | Dedicated preview route or isolated application frame that runs the real routing tree |
| Server-rendered or server-component application | Framework-supported preview entry with controlled loader/server dependencies; preserve the server/client boundary |
| Global CSS, singleton state, or route collisions | Isolated frame or separate preview process until a narrower existing boundary is demonstrated |

Do not flatten a router into a component switch or rebuild server behavior in browser mock code and call it equivalent. If a boundary cannot run, identify the missing dependency and use an explicitly lower-fidelity preview for the bounded scope. A broad product refactor is not a prerequisite for adoption. Any necessary product change must be within the user's authorized scope.

## Controlled dependencies

Inject versioned fixtures, clock, seed, conditions, and asynchronous outcomes at existing service/provider seams. Commands still execute application rules and produce their actual outcomes. Do not replace an application action with a Studio-only DOM edit. Keep preview persistence separate from customer stores, cookies, service workers, and live API mutations. Use isolated storage namespaces or frames/contexts where provider instances alone are insufficient.

Map semantic surface IDs and parameters to observed routes, including nested routes, dialogs, drawers, and auxiliary outlets. Give each preview independent history. Product back/dismiss affects that history; Studio back affects catalog selection or presentation. Verify deep entry as well as clicking into the state. A reload must not accidentally escape into a production route.

For frame or remote mounts, use a versioned handshake and per-instance request IDs, validate message origin and source, and expose readiness/error/disposal through the adapter. The starter implements this as studio-preview/1; see [frame-protocol.md](frame-protocol.md) for the product-side client. Do not rely on arbitrary cross-origin DOM access. Capture and semantic inspection may be unavailable even when a frame is visible; report their limits.

## Display, input, and evidence

Load the actual token sources, fonts, icons, and assets where authorized. Keep fixture or dependency substitutions visible in review metadata. Treat a viewport/profile change as new layout evidence only after the real renderer responds; CSS-transform scaling is a viewing convenience.

Test relevant narrow and wide viewports, overflow, keyboard traversal, visible focus, accessible names, and an important interaction including its feedback and navigation result. Review Studio controls separately from product accessibility. Define capture readiness around required asset loading, controlled pending work, and an intentional animation frame/time; disable animation only as a recorded environment choice. Observe representative screenshots rather than treating successful capture creation as visual verification.

## Build result

Deliver a working target with Inspect, Gallery, useful capability-derived controls, and an initial walkthrough from [presentation.md](presentation.md). Record source mappings, fixture provenance, dependencies, and limitations in the manifest. Verify production-facing routes still work without the Studio when changes touched their shared boundary. Build success and local browser evidence do not establish hosted operation; Publish separately verifies the specified hosted destination.

For mapped Free icons and state-preserving appearance updates, use the explicit [live appearance contract](frame-protocol.md#declared-live-appearance-0190). Verify a negotiated `live-appearance` client, refused/invalid and stale updates, state preservation and an older client's remount fallback. A single installed `stroke-rounded` style does not imply alternate style availability or entitlement.
