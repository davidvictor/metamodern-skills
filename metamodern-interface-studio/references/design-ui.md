# Product-owned Design editors

Use this optional interface for reviewed rich controls that cannot fit the legacy flat DesignParameter list. The single shared shell owns placement, chrome, kit styling, accessibility and lifecycle. A product owns semantic values, targets, validation, recipes, asset roster and compilation. Non-opted consumers keep the legacy Design behavior.

## Declaration and loaders

`StudioAdapter.design.editor` is data only: `schema: "studio-design-editor/1"`, stable `id`, product module `version`, `controllerSchema: "studio-design-controller/1"`, declared `slots` (`foundation`, `component`) and `capabilities` (`edit`, `reset`, `history`, `inheritance`, `diagnostics`). Unknown, duplicate or incompatible declarations fail explicitly. A module cannot acquire an undeclared slot; a component-only editor uses the read-only Tokens inspector rather than a fictitious Foundation panel.

The product-owned `src/design-ui/index.ts` exports `designEditors`, an explicit local ID-to-lazy-module map. Each module declares matching schema/ID/version/capabilities and supplies its declared `Foundation`/`Component` React panels. UI files import only React, `@studio/kit`, `@studio/design-ui` and their own panel files. Computed/remote imports, CSS forks and shared-shell internals are rejected by the boundary rule. These product files are protected during creation, update and locking.

The existing protected `src/design-runtime/index.ts` remains the compiler map. Its registered compiler may expose an optional pure `DesignModel`: `initial`, `validate`, `edit`, `reset`, `readout`. The editor requires that model. Panels emit semantic intents; the model owns inheritance, linked modes, whitelist targets, coupled changes and reset meaning. Only the existing `compileDesign` compiles tokens/CSS/stylesheets. The shell never interprets private selector mappings or makes a second CSS path.

## Controlled panels and values

`@studio/design-ui` exports the types, loader, controller factory, `useDesignController` and `useDesignSnapshot`. Foundation occupies Design > Adjust; component treatment occupies Library Details. Tokens is a read-only Compiled / Source inspector. Existing rail, stage, Details, Library playground and responsive chrome stay shared.

Targets name component/variant/part/state/property, with `DesignScope.themes` separate. Review context (`setScope`, `setTarget`, fixture/profile selection) does not enter direction history. Readouts expose effective/inherited/override values, source scope, linking, consumer reach and diagnostics. The product validates exact supported tuples.

`edit`, `reset`, `beginGesture`/`commitGesture`/`cancelGesture`, `undo` and `redo` obey declared capabilities. One gesture creates one history entry. JSON payloads, saved basis and output snapshots are cloned/frozen. Invalid text belongs to `inputProblems` with recoverable raw text; unrelated edits do not clear it. The NumberField keeps invalid/out-of-range/off-step text and its inline error while the slider/readout retain the last valid controlled number. Explicit reset/undo increments `inputEpoch` for the field's `resetKey`.

Kit additions are controlled `NumberField`, `SegmentedControl` and modal `EditorPopover`. They reuse Studio fields/slider/menus, numeric and keyboard alternatives, focus return and coarse-pointer hit areas. Specialized palette/font/target content stays product-owned. Unsupported two-axis, curve/spring or other controls are not inferred from the interface.

## Compilation and previews

Compilation is latest-request-wins and publishes the complete theme map atomically. Validation, source/asset or compile failure keeps the last valid map and blocks save/export. Registered frame acknowledgements anchor the applied snapshot; a rejection restores the whole accepted pair rather than a merely compiler-valid but unapplied result. Frame failure retains and labels the previous frame, or makes it unavailable if opaque rollback cannot be confirmed.

The active source/confirmed saved basis applies to previews. Working drafts overlay review views; Present uses the source/saved basis. Identity includes channel, direction ID, saved/draft/requested revisions, compiled fingerprint, source lock and source/saved/draft/last-valid status. Payloads are never encoded in URLs.

`CompiledDesign.data` optionally carries opaque JSON (maximum256KB). Mount/draft messages forward it unchanged as `compiledData`; a product frame supplies `FrameHandlers.applyCompiled(data, identity)`, validating/readiness-checking before mutation. The frame advertises `compiled-data`; unsupported receivers are explicit failures. Renderers and exporters consume the same authoritative snapshot/fingerprint. The generic shell does not interpret it.

A frame may register exact same-origin `FrameOptions.registeredStylesheets`. Opted-in assets must have a successful CSS MIME/content response (SPA fallback HTML is not a stylesheet), load without error, and remain non-applying until the complete set is ready. Local fonts/assets and hashes remain product-owned. A custom `applyCss`/`settle` must implement the same readiness/atomic rejection guarantee. Unconfirmed opaque restoration makes the frame unavailable; Retry rematerializes it. Legacy Google stylesheet behavior is retained for legacy previews.

## Confirmed-save hook and optional lifecycle

`captureSave()` returns an immutable `DesignSaveCandidate` containing the captured ID, base saved revision, draft revision, payload and compiled theme map. Only the persistence owner calls `acknowledgeSaved(id, revision, candidate)` after a confirmed write. If A was captured and B was edited during that write, confirmation saves A as the basis and keeps B dirty. Unknown, reused and stale candidates are rejected.

The optional [saved-direction lifecycle](directions.md) owns envelopes, canonical local writes, recovery and import/export UI. The controller alone does not persist anything. A browser cache is never represented as durable saved state.

## Synthetic checks

The optional starter fixture uses `VITE_STUDIO_ADAPTER=editor` or `STUDIO_ADAPTER=editor` with the same product-neutral editor in both hosts. It exercises semantic macro/linked modes, inherited component radius, invalid input, async/error preservation, local stylesheet failures, opaque forwarding, no remount and saved-only Present. Use disposable consumers and named native/keyboard/coarse-pointer evidence. Required collection checks and real host type/lint/build still apply. Private panels/source are never copied into this generic fixture.

## Review context

Foundation and Component receive `DesignPanelProps.review: DesignReviewContext`: readonly `scenarioId`, readonly `scenarios: {id,label}[]` and `selectScenario(id)`. This is the current shared review navigation, supplied as UI props. It is never adapter executable data, a design-model edit or an undo entry. Unknown or Later scenarios cannot be selected through this callback. Use the selected ID with product-owned mappings for contextual reach/readouts; never import the shared store into product panels.

`EditorPopover` accepts optional `open?: boolean` and `onOpenChange?: (open: boolean) => void`. Controlled product panels can close after a choice or a visible Close picker action using React state. Escape/outside dismissal uses the same callback and the existing modal primitive restores focus. Omit both props to keep the existing uncontrolled behavior; product panels need no Base UI or DOM imports.

## Portaled select options

`Field` with `kind="select"` accepts optional `itemClassName?: string`, forwarded to every portaled option alongside the kit's existing coarse-pointer target class. Ancestor classes in a product panel cannot style a portal. Use `itemClassName="max-[999px]:min-h-11 pointer-coarse:min-h-11"` when an editor's accepted controls require 44px rows on native phone/tablet widths as well as coarse pointers. Trigger styling remains separate. Omit this prop to preserve default option geometry; no legacy menu or product preview is enlarged globally.

## Modal popover close controls

Every `EditorPopover` must include an enabled, visible `EditorPopoverClose` from `@studio/kit` at the panel's existing Close action. A plain Button that changes controlled open state does not register the vendor Close part. [Base UI's Root contract](https://base-ui.com/react/components/popover#root) requires that part for modal focus containment. This shared component renders the same styled native Button and delegates containment/closure to Base UI; do not add a manual Tab handler or hidden substitute.

`EditorPopoverCloseProps` is `Omit<React.ComponentProps<typeof Button>, "render" | "nativeButton">`: normal Button variants, size, className, children and native accessibility/event props remain available. The control stays in the same place with the same visible label. Its Root callback handles controlled closure, so remove redundant pure setOpen(false) onClick handlers. Choice handlers can continue to set controlled open false. Omit open/onOpenChange for normal uncontrolled state; the real Close action and Escape still restore opener focus. Ordinary nonmodal Popover callers keep their existing behavior.

```tsx
<EditorPopover label="Choose a registered value" open={open} onOpenChange={setOpen}
  trigger={<Button>Choose value</Button>}>
  {/* Product-owned choices use the existing shared primitives. */}
  <EditorPopoverClose variant="ghost">Close picker</EditorPopoverClose>
</EditorPopover>
```

Protected product panels are not rewritten by the updater: adopt the exported Close component after the checked shared update. Use the same component when the picker is nested in a phone sheet; the vendor owns the nested focus scopes.

Structured source/compiler diagnostics and initialization/selection reasons retain their full text and wrap inside the existing editor status or panel. This presentation does not change validation, last-valid snapshots or save/export eligibility. Long paths and hash words must reduce intrinsic minimum width rather than push a sidebar or global status beyond its available bounds.

### Centered picker surface

`EditorDialog` is an opt-in native centered alternative for product picker composition. `EditorDialogProps` contains `label: string`, `trigger: React.ReactElement`, `children: React.ReactNode`, optional `open?: boolean`, `onOpenChange?: (open: boolean) => void`, `className?: string` and `overlayClassName?: string`. It reuses the existing [Base UI Dialog](https://base-ui.com/react/components/dialog) through shared kit wrappers. Default EditorPopover callers retain their anchored geometry.

Its width is at most 420px and viewport minus 32px, with 20px padding, 16px gap and radius, vertical scrolling within viewport minus 32px, and an 18% black backdrop without blur. Product content supplies visible `EditorDialogTitle`, a real visible `EditorDialogClose`, search, options and optional swatches. Close accepts the same native Button props as EditorPopoverClose; Title accepts the shared DialogTitle props. No manual focus trap is needed.

```tsx
<EditorDialog label="Choose a registered value" open={open} onOpenChange={setOpen}
  trigger={<Button>Choose value</Button>}>
  <div className="flex items-center justify-between gap-4">
    <EditorDialogTitle>Choose value</EditorDialogTitle>
    <EditorDialogClose variant="ghost">Close picker</EditorDialogClose>
  </div>
  {choices}
</EditorDialog>
```

Choice handlers can set controlled open false; native Close, Escape and outside dismissal use the same Root state and restore trigger focus. Omitting controlled props preserves native uncontrolled behavior. Read-only Source inspector prose wraps provenance identifiers and diagnostics; it does not introduce a second token editor or compiler path.

For adapters declaring `design.editor`, the Tokens rail presents read-only context and retains Design tabs. Legacy name/value, family and All/Unread/Fixed/Draft filters are omitted because the paired Compiled/Source inspector does not consume them. Adapters without the editor declaration keep the existing token editor and its working filters.
