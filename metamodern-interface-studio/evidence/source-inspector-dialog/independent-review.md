# Independent review: bounded generic 0.18.4

Disposition: clear. No remaining material findings were identified in the Source inspector wrapping, opt-in centered dialog, or read-only Tokens rail correction. Private #19 controls and reference acceptance remain separate.

## Exact source and evidence

Reviewed over `ec09d26997364f970db9a7d24731fb7c5ab8d7f0` on `codex/ui-studio-next-host`. Independently hashed all 11 current source/metadata files in [source-freeze.json](source-freeze.json): zero mismatches. Compact ordered-row JSON digest: `1a9dc0d10bf8ad5d37cf892161fa94b283bcf5e92812f2b179f809f654dce929`. Preserved file raw SHA256: `e1a7b71c28c49aa4857fcd9e709bca9cb35cd63f264dfed3104b8e76bf306ece`.

Independently verified all 111 entries in [artifacts.json](artifacts.json): zero mismatches, including 68 screenshots. Artifact table raw SHA256: `2d0b1aa90226e6e570a163cff92239a65e165318bf23c1bcb81132cee67a5394`; compact ordered-row JSON digest: `7c2eb715fb5ef086606ca6378da531436cc4a5771a5dc382642c48d770aa43fa`. That table excludes itself and this report. A subsequent full candidate manifest may include both.

## Implementation review

Read all five runtime changes, new helper source, exports, update guidance, API documentation and metadata/test expectation changes. Source lock and diagnostic paragraphs gain local width constraints and `overflow-wrap:anywhere`; existing fingerprint and compiled-token treatment is unchanged. The parent can shrink without prose forcing its intrinsic width. Intentional existing scrolling is retained.

`EditorDialog`, Title and Close compose existing native Dialog parts. The real visible Close renders the existing kit Button. Controlled state remains product-owned; omitting controlled props preserves native state. Geometry is an opt-in 420px cap, viewport minus 32px, 20px padding and 16px gap/radius with bounded vertical scrolling. `DialogContent.overlayClassName` is additive: an omitted value preserves the old overlay defaults. No application focus trap, hidden Close, global Popover change, private source or product choice resolver was introduced.

The Tokens rail uses exactly the existing TokensStage predicate, `adapter.design?.editor`, retains its header/tabs and read-only context, and omits filters unused by compiled output. The legacy branch and its working state/filter logic are unchanged. Product picker content, actual colors, search, readiness and choices remain an explicit protected-product composition responsibility.

## Validation and behavior review

Read [checks.json](checks.json) and the actual final logs; independently verified all ten log hashes and zero exits. Node 22.22.1 and 24.21.0 each passed 234 tests and validation of 20 packages. Vite and Next typecheck/lint/build passed on Node 26.7.0, retaining one existing Vite warning and six existing Next warnings, with zero errors. Root-owned Next receipts bind all five unchanged runtime hashes before/after checks. All 15 runtime receiver entries across the three owned consumers match actual files. Initial installer-copy inventory-race failures are retained as superseded evidence; final stable-inventory runs are the passing gate. No passed suite was rerun by this reviewer.

Read verifier sources and final results: 24 inspector cases, 12 exact short/compiled preservation comparisons, 12 dialog cases, four Tokens boundary cases and four final served-lineage/outside-dismiss cases. Long source identifiers and complete diagnostic hashes remain within native pane bounds at 1440/768/390 in both engines and hosts. Compiled token measurements and short Source sizes/text match before/after exactly.

Dialog records establish centered bounds, scrolling, controlled choice application, boundary Tab/Shift+Tab containment, visible Close, Escape/opener focus, uncontrolled Close, outside dismissal and nested phone Sheet survival. Top-level masks measure 18% with no blur. Native nested-phone backdrop suppression is explicitly scoped as an accepted functional adaptation preserving the parent Sheet; no second-mask or private reference parity is claimed. Anchored Popover width remains 256px, and ordinary confirmation padding/mask remain 24px/30%.

Tokens evidence establishes absent unused controls, functional Source inspection and preserved real legacy search, no-match and Unread filtering. Representative phone/tablet long provenance, desktop/phone centered dialog and final WebKit read-only Tokens screenshots were visually inspected. Earlier inspector/dialog images are honestly scoped before the rail-only correction; final Tokens screenshots and fresh served lineage bind that later change.

All seven retained fixture hashes match their files. Compiler fixture diffs change only provenance metadata; centered content uses the public helper with neutral synthetic swatches. All four executed-original and portable-copy verifier hashes match their recorded lineage. The portable copies only parameterize runtime/browser/origin/output configuration and are separately syntax checked; they are not relabeled as the executed originals. Observed response-body failures remain explicit rather than fabricated hashes.

## Delivery and acceptance

Implementation and required local checks are reviewed clear on the exact source/evidence above. The reviewer wrote only this report after collection completion and made no implementation/Git edits, saved-product-data writes or service changes. Root owns feature delivery, remote CI, publication and private managed adoption. Canonical merge, Agency pin/installer release, production deployment, actual private control/reference review and user acceptance are not established by this generic review.
