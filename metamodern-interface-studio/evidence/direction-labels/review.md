# Independent 0.18.2 direction-label correction review

Clear for authorized feature-branch delivery of this bounded correction over `260d525267dc6e4f8a44b1b788313d5c1b134c35`. No remaining material finding or required evidence gap identified. Full candidate-manifest verification follows separately after this report is frozen.

## Source and grouped corrections

Only the generic direction manager's rendering changes. It constrains identity text, keeps revision/status outside the truncated name, bounds its local picker/value/menu rows and deleted rows, and wraps notices inside the popup. Full name text remains in the DOM and titles. Global Field/Select defaults, controller/compiler, persistence/transport and private product code are unchanged. The short source picker retains its natural 144px width.

Review exposed one missed saved-option mapping: revision was concatenated into the truncated name. The correction now passes it separately and renders a non-shrinking metadata span. The refreshed screenshot and geometry verify actual visible r1 in the trigger and menu, not merely presence in textContent/title.

The same long-label group also included an actual Save confirmation overflowing the portal, which cannot inherit wrapping from the bar. The final popup child grid uses a zero-minimum column and local overflow-wrap:anywhere. This resolves confirmation text without changing global components.

Final manager SHA256 is `4bc9292c5ba41c45c9a77e0a269b2f4cd38b8d26b2c1ebe3dad9aba08ce005ca`. Canonical source and all three actual consumer copies (Vite, Next development, separate Next production) independently match. Package/catalog/docs agree on 0.18.2; independently composed Vite (181 files)/Next (187 files) release fingerprints match with zero differences.

## Evidence and exact lineage

[Red evidence](red.json) uses actual 160-character saved names on both generic hosts: the 390px bar expanded to 1852px and the picker to 2163px. No private preparatory source or image is included.

[Cold/picker/import proof](green.json) has 12 passing host/engine/width records at source `6317219c4d3fd3b6908aedbe47851e26e10fd1e21924141bee9370dc811a2683`, retained explicitly in [its source receipt](source-cold-picker.json). Vite/Next × Chromium/WebKit × 1440/768/390 establish bounded bar/actions/document, complete text/title, visible revision metadata, scrolling, keyboard selection/focus, short-label compatibility and actual download/import of an Imported label containing 140 Ws without POST. The reviewer visually inspected the corrected phone picker and imported tablet state.

[Portal-notice red proof](notice-red.json) at that preceding source shows actual Save as new producing a 256px dialog with 2111px scrollWidth. [Final notice proof](notice-green.json) has 12 passing combinations at the final source: dialog/scrollWidth 256px, message widths 224px with anywhere wrapping, bounded controls/bar/document, internally reachable Close and zero page errors. Phone WebKit confirmation was visually inspected. These are control-layout witnesses, not preview pixel/readiness acceptance.

The final delta is exactly the two popup-grid classes. Reversing that class-string change in memory reconstructs the independently inspected 6317219c source hash. Therefore the preceding cold/import/picker records retain their honest lineage while unchanged paths carry forward; they are not relabeled as final-source captures. [source.json](source.json) records both revisions.

## Validation, integrity and limits

Final normalized check receipts record 234/234 tests and validation of 20 packages on each of Node 22.22.1 and 24.21.0, plus actual Vite/Next typecheck/lint/build success. Non-failing warnings remain visible. All 67 [artifact entries](artifacts.json), including 50 generic screenshots, independently match their hashes. No broad suite or lifecycle matrix was repeated by the reviewer.

Previous lifecycle and select-item evidence/reports are unchanged. This review accepts the bounded generic rendering correction only; private managed adoption, final private controls review, source/preview parity, product acceptance, Git delivery, remote CI, merge and deployment remain separate. The reviewer changed only this separate report. The full changed/untracked manifest including it must match before delivery.
