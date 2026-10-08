# Named local directions

Opt in with `adapter.design.directions = {schema: "studio-direction-lifecycle/1", product: {id, revision}, payloadSchema}` alongside the registered compiler and Design editor. This declaration is JSON data. The protected `src/design-runtime/` module supplies `directionCodec` and optional async `checkDirection`; private panels keep the public `@studio/kit` and `@studio/design-ui` boundary. No remote module loading, product files or second token/CSS resolver are introduced.

## Durable and working identities

`SavedDirectionEnvelope` uses `schema: "studio-direction/1"`, `id`, `label`, positive integer `revision`, `createdAt`, `updatedAt`, `product: {id,revision}`, `payloadSchema`, opaque JSON `payload` and optional `receipt`. Envelope identity is separate from payload metadata: saving, renaming and duplication never rewrite private payload IDs or revisions. `DirectionReceipt` records compiler ID/version, optional sourceLockId, theme fingerprints and optional opaque JSON `basis`. Products use a stable basis to bind actual source, helper, mapping and asset bytes; timestamps and request IDs do not belong in it. Reopening compares receipts structurally and never silently accepts compiler/source drift.

`DirectionsFile` is a `studio-directions/1` journal with immutable, contiguous per-ID `revisions` and append-only delete/restore `events`. Rename creates a new revision. Duplicate copies the selected historical payload exactly into a new identity. Delete is recoverable; original revisions remain available for explicit comparison. Source is reserved as `direction.source` and remains the model's original initial values. A browser draft or frozen draft pin is not a saved direction.

The journal is limited to 1 MiB; payloads to 256 KiB. JSON depth and node budgets reject pathological inputs before serialization. Journal validation and transition validation reject overwritten history. `scripts/saved-file.ts` is the single server implementation used by both hosts: same-origin JSON, size checks, required expected-revision CAS, temporary file plus atomic rename, and structured read/validation errors. Conflicts never replace the file. Failed/malformed reads preserve bytes and disable canonical writes until repaired. Static builds remain usable with explicit read-only capability.

## Product decoding and readiness

`DirectionCodec.decode({schema,payload,product?})` returns `{payload?,problems,migratedFrom?}`; optional `legacy(variant)` has the same result. Every saved selection, import and browser recovery passes through this pure contract. Known invalid values can return an editable payload plus `DesignProblem` entries with controlId/raw. Unknown/newer schemas remain quarantined as original bytes, outside active saved data. Migration must not silently round or drop unsupported edits. Legacy CSS or arbitrary token overrides cannot become a second pipeline.

Optional `checkDirection({purpose,values,compiled})` returns `{problems,basis?}` or a promise; purpose is save/adopt/compare/import. It owns source/font/media readiness without requiring generic filesystem access. Missing assets or mismatched basis prevent adoption/save/export; current valid output remains labeled. Read-only consumers can report readiness without claiming write capability.

## Controller and lifecycle service

`DesignController.prepareSaved({id,revision,values})` compiles a candidate through the same registered compiler; `adoptSaved(token)` atomically accepts only its current owned token. Original values remain unchanged. `prepareDraft(values,lastValidValues?)` and `adoptDraft(token,inputProblems)` restore raw invalid drafts with their matching last-valid output. A valid draft captured while compilation was pending resumes compilation; failed compilation retains the prior valid result. `replaceDraft` supports explicit controlled input problems and history options. Selection tickets prevent slow prior selections from replacing newer choices.

`captureSave()` captures exact values, draft revision and compiled maps. Acknowledgement must name that candidate after confirmed persistence. Saving A while editing B confirms A and leaves B dirty. Save as new enters a new envelope revision domain. `captureSavedBasis()` supports metadata-only revisions without consuming newer work. Save eligibility requires ready output matching the working revision and no raw input errors. Model validation and compiled data remain authoritative.

`DesignDirectionService` owns local journal operations and browser recovery. Public methods include initialize/reload/select/save/rename/duplicate/remove/importText/recover/discardRecovery/resetDraft/beginNew/pinDraft/resolvePin/projection/exportSaved/exportDraft. `useDesignDirections` and `useDirectionSnapshot` expose the optional service to public API consumers. Service state distinguishes load/readiness/saving/conflict/selection failure from controller validity. Recovery storage failures leave memory editing functional with an explicit download warning.

Browser recovery persists product revision and payload schema, exact raw field problems, last-valid values and receipts. Offered records survive fresh edits and saves until explicitly recovered or discarded. Immutable draft pin records are stored independently so stale tabs cannot erase them. Storage denial and unsupported caches preserve originals rather than poisoning edits or overwriting unreadable data. Downloads of drafts are labeled unsaved; imports become drafts and never write automatically.

## Shared review UI and links

The shared Directions manager uses the existing SaveBar, modal and controls for naming, new/save/save as new, rename/duplicate/delete/restore, import/download and recovery. Context navigation remains outside design history. New lifecycle controls have 44px actionable targets on coarse pointers or widths below 1000px and 16px editable inputs at those widths. Legacy shell controls and product frames retain their existing sizing.

All working review views use the current labeled overlay; Present uses only confirmed saved/source output. Compare's Directions axis pins source, a precise saved ID/revision, or an immutable local draft snapshot independently on each side. Changing the active direction does not mutate those snapshots. Missing source/saved/pin output shows an explicit unavailable reason; it never mounts a raw fallback frame. URL parameters carry only direction/revision and pin IDs, never values, CSS or payloads. Local draft pin links require the corresponding browser cache. Cold saved links hydrate before shared navigation can rewrite them. Unknown or unavailable IDs remain explicit rather than silently selecting another direction.

## Host ownership and updates

`directions.json` is product-owned. Optional `studio.config.ts.savedFiles.directions` chooses a relative JSON path confined to the Studio root. Both hosts use that path for safe bootstrap and HTTP transport. Generated `.studio-generated/saved-sources.css` excludes exact owned saved paths and atomic-temp patterns from Tailwind source watches. External journal changes and successful saves therefore cannot reload the document or discard a newer draft; unrelated TSX/style HMR remains active. Next typecheck/build regenerate official route types and omit stale development-only validators when switching to static mode.

Use managed create/update commands from [updating.md](updating.md). The updater preserves protected runtime/UI folders, adapter, config, journal and other product files. Synthetic generic fixtures demonstrate the contract; product-specific codec, source checks, migrations, panels and media remain private product responsibilities.
