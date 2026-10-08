# Independent 0.18.1 select-item correction review

Clear for the authorized feature-branch delivery of this bounded correction over `874d5077ba0204cf77947e21509901003017d40e`. No material finding or required evidence gap remains. The full changed/untracked manifest, including this report, is independently verified at delivery separately from this report's own hash.

## Source and compatibility

Reviewed the complete correction diff, public type seam, synthetic consumer and metadata. `FieldProps.itemClassName?: string` is optional and confined to the `kind="select"` branch. It reaches each actual portaled `SelectItem` via `cn(TARGET, props.itemClassName)`. Omitting it preserves existing target classes; text, secret, switch, triggers and global menus are unchanged. The synthetic Review fixture alone opts into `max-[999px]:min-h-11 pointer-coarse:min-h-11`; Registered asset retains the default path. Product panels still use the protected public kit API, without store/Base UI imports or boundary relaxation.

[Source receipts](source.json) match actual canonical files and both task-owned consumer copies. Field SHA256: `af877be5c3e7f797421116c51d795c17d6a554f8e439cfb8e6ec6e3962ee9ee6`; synthetic editor SHA256: `608ade9fe3964a101d0d0c7f7fa1f7789ccf4d0713d8375f2e30c8ec5e2835e7`. The recorded pre-fix Field hash independently matches the Git base. Package/catalog/docs agree on 0.18.1; independently composed Vite (181 files) and Next (187 files) fingerprints match the release metadata exactly.

## Validation inspected

[Red proof](red.json) reproduces 32px portaled options at 768/390 fine-pointer widths. [Green proof](green.json) passes all 16 combinations: both hosts and Chromium/WebKit at 1440/768/390 fine pointer plus 1440 coarse pointer. Every opted-in row measures 44px at phone/tablet widths or coarse pointer, and remains 32px at desktop fine pointer. Untouched default rows remain 32px for fine pointer and 44px for coarse pointer. ArrowDown/Enter selection and settled Escape dismissal restore trigger focus; every case has zero page errors. Phone WebKit and tablet Chromium screenshots were visually inspected.

Actual host typecheck/lint/build receipts pass. Required collection receipts pass 234/234 tests and 20-package validation on each of Node 22.22.1 and 24.21.0. Existing non-failing lint warnings remain visible. All 32 [artifact entries](artifacts.json), including 18 synthetic screenshots, independently match their recorded SHA256 values. No broad suite or browser matrix was repeated by the reviewer.

## Boundaries and delivery state

The historical [0.18.0 lifecycle review](../directions/review.md) and its evidence are unchanged. This patch changes only the optional select-item styling seam, synthetic opt-in and release metadata/docs; prior lifecycle evidence carries forward for unchanged inputs. No private product source or image is included. The review author changed only this evidence report. Commit/push, remote CI, managed private adoption, merge, deployment and product acceptance remain separate states owned by the lead and current project authority.
