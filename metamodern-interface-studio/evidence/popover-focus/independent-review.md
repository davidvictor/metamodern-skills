# Independent integrated review: generic 0.18.3

Disposition: clear for the bounded CR19-003/004 generic correction. No remaining material findings were identified. This review does not establish private #19 control acceptance.

## Exact candidate and evidence

Reviewed working candidate over `e3e026fd72c9559ed9218e8bfb352b25334de473`, package `0.18.3`, on `codex/ui-studio-next-host`. All 14 entries in [source-freeze.json](source-freeze.json) were independently hashed against the current repository: zero mismatches. Its compact ordered-row JSON digest is `3929ea5bf376caa0f7f78c90cd289de5390c905b35c0116c3b02d3cc91514b3e`; the preserved file's raw SHA256 is `5209a279925a069904fd711b79cd090cc3e685b5e5ef72ff37fcfd9377fb48f8`.

The reviewed evidence set comprises the 120 entries in [artifacts.json](artifacts.json), file SHA256 `7aeafceca758b6f8ef76e1cfbf36bcf471de78e7509b195f8c5a39d35d8370ea`. Every entry was independently hashed: zero mismatches. The SHA256 of compact UTF-8 JSON for those ordered `{path,sha256}` rows is `dbaa798fc79e698a7e13e5bc30f2cf04cd9fe393b3a75b9e55416df39c3fbf3d`. The artifact table and this report are excluded from its rows. A subsequent complete candidate table may include both without changing this reviewed evidence set.

## Implementation review

Inspected all eight changed runtime files and the six metadata/documentation/test-expectation changes. `EditorPopoverClose` renders the existing styled native Button through the actual Base UI Close part; current Palette and Named directions callers use that visible control. Installed Base UI 1.8.0 source hashes match [vendor.json](vendor.json); its Close registers the close part and its Popup uses `modal !== false && hasClosePart` for modal focus management. No manual Tab trap, hidden Close, nested button, ordinary Popover default change, or private Arc implementation was introduced.

Diagnostic changes are local minimum-width and `overflow-wrap:anywhere` constraints in the existing status, initialization and selection consumers. Controller validation, frame lifecycle and save eligibility are unchanged. Documentation correctly requires protected product panels to adopt the exported Close after updating. The release generator's main-first-parent history plus current-version policy explains the intermediate candidate label replacement; lock-based update preservation was checked separately.

## Validation reviewed

Read [checks.json](checks.json), actual log tails and delegated Next lineage. Node 22.22.1 and 24.21.0 each passed all 234 tests and validation of 20 packages. Actual Vite and Next typecheck, lint and production build exited zero on Node 26.7.0. Lint retained one existing Vite warning and six existing Next warnings, with zero errors. Next checks preserve matching before/after hashes for the eight runtime files. Repository `git diff --check` also passed. Passed suites were not rerun by this reviewer.

Read the portable verifier sources and all final result records: 20 focus records, 16 controlled/uncontrolled records, 12 native-width diagnostic records and 12 phone initialization/loader/selection records. The durable result objects are semantically identical to their inspected task-owned originals. Boundary Tab/Shift+Tab, interior navigation, Escape, visible Close, opener focus and nested phone Sheet survival pass in both engines and hosts. All four ordinary Settings negative controls preserve focus outside the nonmodal popup. Before/after Close dimensions and classes match exactly; ready status dimensions and text match, with only the explicitly recorded subpixel entrance-animation x sampling difference.

Long synthetic source paths and both complete 64-character hashes fit their native paragraph/status bounds at 1440, 768 and 390. Failure retains the same loaded frame document/body and blocks Save; initialization/loader/unavailable-selection failures mount no substitute frame. Representative desktop and phone popup images, Chromium phone diagnostics, WebKit tablet diagnostics, loader failure and unavailable-selection images were visually inspected. These are scoped behavior checks, not a full shell pixel-parity claim.

All five embedded fixture sources in [source.json](source.json) match their declared hashes and observed receiver files. Exact fixture diffs preserve canonical controls: uncontrolled only omits controlled Root props, diagnostic only changes the existing failure message, and initial failure only changes its trigger condition. Served response hash manifests preserve unavailable cached/detached bodies honestly; the eight fresh 200 verification fetches are separately scoped and do not claim retroactive original-response bytes.

[update-preservation.json](update-preservation.json) proves both locked 0.18.2-to-0.18.3 host updates retain 12 protected product hashes, product identity and custom script, with zero blocked files. That proof intentionally skipped installation/checks; separate final host checks establish compilation.

## Delivery and acceptance boundaries

Implementation and required local validation are reviewed clear on the exact candidate above. The reviewer changed only this report and performed no source/Git mutations, service takeover or product saved-data writes. Root owns feature commit/push, remote CI, publication and private managed adoption. Agency pin/installer release, deployment, canonical merge and user acceptance are not established here. Actual private control adoption and the independent #19 design/control gate remain separate obligations.
