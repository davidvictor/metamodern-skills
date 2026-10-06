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

## Publishing to a static host

A built Studio is static files: `npm run build` writes one page, its assets and any extra pages from `studio.config.ts` to the output folder, and nothing in it needs a server. Every place in the Studio is a hash link (`#view=…&scenario=…`, `#library=…`, `#module=…&section=…&item=…`), so a static host serves deep links from the one `index.html` with no rewrites. Publication still follows [Publication](#publication): a request naming the destination and audience, and hosted checks after deploying.

What a product sets for a static host:

- Frames at an opaque origin. Declare `frameIsolation: { sandbox: "allow-scripts allow-forms" }` (never with `allow-same-origin` for a frame entry on the Studio's own origin). Each preview frame then runs at origin "null" over https, as in an offline export opened from files, and the shell checks the sending frame element instead of an origin: a sandbox without `allow-same-origin` implies `frameOrigin: "null"` for every preview, including a module's kit `PreviewFrame` (0.15.0; an explicit `frameOrigin: "null"` is still accepted). Add `credentialless: true` if the frames must not carry the viewer's cookies in Chromium.
- The frame client's allowed origin. An opaque frame cannot default to its own origin, so each preview entry (`frameEntry`, `library.entry`) passes the Studio's origin to `connectStudioFrame(handlers, { allowedOrigins: ["https://studio.example.com"] })`, written into the frame's page or bundle at build or deploy time (the starter's example reads `<meta name="studio-allowed-origins" content="…">`). Keep the frame's referrer at least its origin (the default policy does) or list the Studio's origin first: the client posts to the referrer's origin when it is allowed, else to the first allowed origin.
- CORS on the frame's files. An opaque frame loads its scripts (module scripts included), styles and fonts cross-origin, so the host answers them with `Access-Control-Allow-Origin: *` (they are public build assets). Frames have no storage at an opaque origin; a preview entry must not need `localStorage` or cookies.
- No operations and no writes. Omit `workspace.operations`; only host-free modules (`uses` empty or omitted) open, and a module that declares `uses` shows why it cannot. Saving layouts and states (`layouts.json`, `scenarios.json`) is a dev-server feature and is absent from a build. Publish no development host or mock (`example/`, `__studio/*` endpoints).
- Headers. Serve the Studio and its frames with a Content Security Policy and headers such as:
  - On the Studio page, `frame-ancestors 'none'` (or the exact sites allowed to embed the Studio). On the preview entry pages, `frame-ancestors 'self'` (the Studio's origin): the Studio must be able to frame them, so never send `X-Frame-Options: DENY` or `frame-ancestors 'none'` for them.
  - `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` (the shell and the frame client write theme, brand and draft CSS into style elements); `img-src 'self' data:`; `font-src 'self'`; `frame-src 'self'` (the preview entries' origin); `object-src 'none'; base-uri 'none'; form-action 'none'`.
  - `connect-src 'none'` unless the Studio declares something to fetch: a static Studio makes no requests beyond its own files. A Design font parameter loads Google Fonts inside the frames, so a frame page that uses one allows `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`.
  - `X-Content-Type-Options: nosniff`, and `X-Robots-Tag: noindex` if search engines must not list it (the page already carries a `noindex` meta).
- Audience. Everything in the build is readable by whoever can load it: bundled fixtures, captures, generated material such as prebuilt emails, and documentation. Leave out pages and modules the public audience must not see by building a separate adapter for publication rather than hiding them.

Hosted checks after deploying, on the actual URL, in light and dark and at phone width (390 px) as well as desktop:

1. The shell loads with no console errors; each view in the rail opens; deep links to a view and scenario, a library page and section, and a workspace module, section and item open where they point, also after a reload, and Back behaves.
2. Assets: scripts, styles, fonts and images load with no CSP or CORS errors, and the product mark and fonts render.
3. Scenarios: selected scenarios mount live in their opaque frames and become ready; interactions and navigation the adapter supports work; Gallery and a walkthrough with interruption and return.
4. Library: component pages, including wide ones (previews break out of the column and never upscale), Preview and Code tabs, Phone width and Expand.
5. Workspace: every published module page opens with no request to an operations host; any module left unavailable says why.
6. Nothing writes: no save controls succeed, and the network shows only GETs of the build's own files.

The shell's static build in acceptance (`VITE_STUDIO_ADAPTER=static`, served with CORS and the Studio's origin in its preview pages) measures the opaque frames (AC-69) and the host-free workspace (WS-12) locally over http. It does not measure a CSP, https or a real host; those are the hosted checks above.
