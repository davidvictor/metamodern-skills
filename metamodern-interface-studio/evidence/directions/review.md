# Independent issue 6 integrated review

## Decision

Clear for the authorized feature-branch delivery of the reviewed issue 6 candidate: no remaining material finding or required evidence gap identified. All grouped findings, including the final unavailable aggregate-status correction, are resolved. This assessment does not authorize merge, publication, deployment or private-product acceptance.

## Exact reviewed scope

Read-only base-to-candidate review of the generic named-direction lifecycle over canonical 0.17.1 (`713fcc9`): envelope/journal/receipt/codec, controller preparation/adoption and captured acknowledgement, recovery service and shared manager, provider/store/Compare and stable links, local saved-file transport, Vite/Next overlays, configured saved paths and generated Tailwind exclusions. Product payload interpretation, migrations, source/assets readiness and opaque basis remain owned by explicit local product runtime modules. No private product material or second Source CSS resolver was added.

The 188-file runtime manifest covers common `src`, `example`, `scripts` and both host overlays. The final [runtime manifest](runtime-final.json) compact sorted JSON SHA256 is `36dae0ed35f4a6f188a20f616844ebc84f887a18a796c84439fd00c3a7029546`; all 188 entries independently matched actual file bytes, with zero mismatches. Only App.tsx differs from the preceding `7e05ad44291c13b3d8964f56293f77fe91aee1082a3de332f15cb468ec7930dc` runtime used for the four combined journeys. That delta is the bounded aggregate-status correction described below. Package 0.18.0 metadata/docs were also inspected; generated Vite (181 files) and Next (187 files) release fingerprints independently match their composed source with zero mismatches.

## Grouped findings and recheck

All earlier material findings have corrections visible in the reviewed source: save-as-new acknowledges the new ID/revision without overwriting later edits; recovery/import retains product/schema/raw input metadata and requires the product codec; offered records survive until explicit decision; malformed bootstrap and excessive JSON depth fail safely; stale journal reads cannot replace a confirmed newer write.

The final three recovery corrections were independently rechecked with the exact command:

```sh
node --test --test-name-pattern='valid recovery captured|denied browser storage|independent immutable draft pin' tests/interface-studio-directions.test.mjs
```

Result: 3 passed, 0 failed. Valid recovered B with last-valid A now publishes Pending and resumes the registered compiler; raw invalid inputs remain Invalid. Denied recovery Storage reads are contained and in-memory edits/compilation continue. Frozen draft pins are persisted independently per key, so another initialized tab cannot erase them through its stale cache; these records are distinct from editable offered recoveries.

Also inspected: append-only historical transitions, strict local CAS and read-failure preservation, generation/selection stamps, metadata-only historical acknowledgement, cold saved-ID hydration before URL rewrite, captured save A versus newer working B, recoverable delete/restore, immutable duplicate/export, readiness receipts and independent pin resolution with explicit unavailable output. No further defect identified in these durable-state paths.

## Browser evidence inspected

- Final owner Chromium and WebKit lifecycle receipts: four host/engine journeys pass with zero page errors. They establish two independently saved directions, fresh-context saved-pair appearance/fingerprint equality, ID-only links, pinned working draft, rejected import without canonical write, conflict followed by Keep as new, and raw invalid browser recovery with last-valid output.
- WebKit native dismissal receipt: four host/width cases pass keyboard Close, Enter, Escape and focus return.
- Independent Chromium native controls: 12 cases across both hosts, 1440/768/390 and fine/coarse pointer pass. Independent static-final receipts: two hosts pass saved selection, local import/recovery/download, disabled canonical writes, zero POST, unchanged journal bytes and zero page errors. All 28 independent screenshot hashes were verified; desktop saved comparison and phone Close/focus captures were visually inspected.
- Watch correction: pre-fix reproduction records document replacement and draft 1.6 reverting to saved 1.4. Corrected default/custom paths retain the same document nonce and draft 1.6 through external write and CAS conflict. Held own-save retains newer draft 1.7. Normal TSX/CSS HMR still updates without replacing the document. Configured path service proof writes the selected file for both hosts and does not create the default journal.

## Evidence limits and lineage

The independent native/static receiver freeze predates seven final common-runtime paths. The inspected delta adds capability guards, the generated data-source exclusion, transport/config and recovery corrections; native control layout/dismissal is unchanged. These receipts retain their original lineage and are not represented as captured from the final runtime.

Historical owner lifecycle/watch receipts did not capture every response-module hash. The [final scoped lineage](served-lineage-final.json) matches 172 Vite files and 177 Next files; the only Next variance is generated next-env.d.ts. The final scoped run records 546 Vite and 229 Next response hashes/status/MIME with zero page errors. It is contemporaneous rather than retroactively claimed as historical journey hashes. No broad suite or browser matrix was repeated by the reviewer. Only the three named correction regressions were rerun.

Implementation and validation belong to the owner; this is the independent review assessment. Repository commit/push, CI, adoption, merge, deployment and user acceptance are separate states.

## Final status finding resolved

The preceding fresh unknown-ID receipts showed an explicit unavailable stage and no substituted frame, but Details still reported `Loading`. `src/App.tsx:98` returns early for `selectionProblem` before `ScenarioPreview` can report an error status. `src/components/studio/chrome.tsx:94-100` then consumes the old `s.preview` status, which can remain Loading or stale Ready after a prior selection.

The final App.tsx guard publishes the explicit error/reason whenever the unavailable selection and underlying preview status diverge, including restaging. It excludes independent Directions Compare. The final scoped receipts on both hosts show `Did not start` after preview reset and retain two Ready frames plus aggregate Ready for a valid independent saved-pair comparison. Source and receipt recheck resolve this finding; no broad matrix was repeated.

## Final validation and evidence integrity

The final delivery logs record 234/234 tests and 20-package validation on each of Node 22.22.1 and 24.21.0. Both actual synthetic hosts pass final typecheck, lint and production build; non-failing warnings remain visible in the logs. The reviewer inspected these receipts rather than repeating the collection suites.

[Named-operation evidence](browser-operations.json) passes both hosts: rename preserves payload, duplicate has an independent identity, delete/restore appends recoverable events, exports name the selected envelope, and valid import does not write canonical data. [Availability evidence](browser-availability.json) passes four cases: malformed journals produce HTTP 500 with byte-identical originals and disabled Save on both hosts; final production receivers compile source scale 1 then a local Airy draft 1.4 with canonical Save disabled and zero page errors.

All 98 entries in [artifacts.json](artifacts.json), including 53 screenshots, independently match their recorded SHA256 values. The artifact index intentionally excludes itself and this report to avoid self-hashing. The full changed/untracked candidate manifest including this final report is verified separately before feature commit/push. No code, private source, merge or release was changed by the reviewer; reviewer writes are limited to this evidence report.

The final [live-selection witness](browser-live-unavailable.json) passes both hosts: rejecting an unsupported saved schema after a valid mounted selection exposes no substituted frame, reports `Did not start` before and after Reset, and records zero page errors. This covers the actual live-failure path separately from cold missing-ID links.
