## 0.18.4

Read-only Source inspector provenance and diagnostic paragraphs now wrap long hashes within the available pane. Compiled token and intentional code scrolling behavior are unchanged. Opted-in read-only Tokens panels omit legacy search, family and flag controls that do not apply to compiled output. Legacy token consumers retain their existing working filters.

The optional @studio/kit EditorDialog, EditorDialogTitle and EditorDialogClose provide a centered native picker surface. It defaults to a 420px maximum width capped at viewport minus 32px, 20px padding, 16px gap/radius and viewport-bounded vertical scrolling, with a black 18% backdrop and no blur. Supply a visible Title and real Close part; product panels own choices, search, readiness and swatches. Optional open/onOpenChange support controlled choice dismissal; omit them for native uncontrolled state. Existing EditorPopover and ordinary Dialog defaults are unchanged. Protected product panels opt into the new seam explicitly after managed update.

## 0.18.3

Long structured design diagnostics and selection/initialization reasons now wrap inside their existing status/panel bounds. Last-valid output, save eligibility and ordinary short status geometry are unchanged.

Modal EditorPopover panels must render their existing visible close control with the new @studio/kit EditorPopoverClose component. It registers the actual Base UI Close part required for Tab containment while keeping Button styling, position and controlled open/onOpenChange behavior. Replace a plain Close Button in protected product panels after updating; a pure setOpen(false) click handler is redundant. Keep controlled choice handlers that close the picker. Uncontrolled popovers close through the same component. No hidden close button or manual keyboard trap is added; ordinary legacy Popover defaults are unchanged. Managed updates preserve product panels, so that small product-owned replacement is explicit.

## 0.18.2

Long saved and imported direction names now stay within the Directions bar and picker. Names truncate with their full accessible text/title retained; revision/status and actions remain visible, and notices wrap inside the existing scrolling popup. This changes only the opted-in direction manager, with no global Field, legacy menu or preview styling changes. No product migration is needed.

## 0.18.1

Field kind="select" adds optional itemClassName for styling its portaled option rows. Product editor panels can opt into native phone/tablet floors with itemClassName="max-[999px]:min-h-11 pointer-coarse:min-h-11". Omit the prop to preserve existing option geometry. This changes no global menus, trigger sizes or product preview styles. Protected product panels must opt in explicitly after updating; managed updates never rewrite them.

## 0.18.0

Opted-in studio-direction-lifecycle/1 consumers gain named immutable local directions, captured saves, browser draft recovery and independently pinned source/saved/draft comparisons. Product codecs and readiness checks remain in protected src/design-runtime/. Read references/directions.md before opting in; legacy consumers retain their existing behavior. directions.json is product-owned and never replaced by managed updates. studio.config.ts may configure savedFiles.directions as a relative JSON path within the Studio. Generated saved-source exclusions prevent canonical journals and atomic temporary files from causing preview reloads while preserving normal source HMR. Next typecheck/build regenerate official route types and exclude obsolete dev validators when changing between development and static modes.

## 0.19.0

The shell and both framework hosts default to semantic Free icons backed by `@hugeicons/react` and `@hugeicons/core-free-icons`. A receiver may explicitly activate the optional licensed Pro profile through scripts/icon-profile.mjs after its protected registry install. Profile declarations are product owned, lock/2 records the provider, and updates preserve private Pro dependency locks. Pro builds resolve only installed per-glyph ESM Pro imports and show no Free choice; missing configured Pro fails closed. No credentials or paid geometry enter the public skill. Workspace icon slots use the provider-neutral `IconComponent`/`IconProps` types; product rendering stays independent. Existing module icon names and `@studio/kit` imports are preserved.

Input-backed Design parameters may declare `apply: { input: "iconStyle", live: true }`. A frame opts in separately with `updateAppearance(inputs)`, announcing `live-appearance`. Only explicitly declared appearance inputs bypass the mount boundary, and only a supporting frame updates in place. `live-values` alone does not qualify; older clients remount honestly. Refused appearance updates keep the last valid preview and show the reason; handlers must validate before mutating product UI. Refresh copied frame clients to use this capability. `stroke-rounded` names an appearance, not an entitlement. Alternate maps used in tests must be synthetic and labeled test-only.

Live Design enums with multiple declared choices now offer independent Compare axis `appearance:<parameter-id>`; saved pairs use the existing `Comparison.values` tuple and share through reserved `compareAxis`/`compareValues` keys. Per-pane overrides stay in `inputs.design`, preserve other panes and global defaults, and allow duplicate styles. A singleton Free enum has no fake comparison axis. Presentation steps/overlay patches may declare `design` separately from component `values`; unsupported authored styles are diagnosed before playback. Refresh copied clients for live updates, and use 0.19 shell receivers for equivalent shared comparison playback.

Saved-layout initial-load recovery now resolves the originally requested saved layout after the existing validated live read, if the viewer has not changed Responsive state. It restores only layout fields, never appearance, properties or navigation; missing layouts remain disclosed. No new timer, retry or loading gate is introduced.

Host preflight now evaluates adapter imports with the same saved-direction snapshot as the actual build. Undeclared optional workspace/library layers are excluded. Design and Tokens stage/controls load on first use while root/store draft state stays mounted; local failures retain working state. The candidate also retains 0.18.4 native picker Close parts, centered EditorDialog APIs, wrapped Source diagnostics, read-only compiler Tokens controls and direction labels. Startup acceptance counts the complete static script graph against the measured exact 0.18.4 predecessor, preserving the 3 KiB growth budget.

Nothing else to do by hand. Product adapters, saved directions and presenter files remain product owned.

## 0.20.0

Build provenance: an adapter may declare `provenance: { revision, modified?, note? }`, the source revision its build came from. The shell shows `Source <revision> · Shell <version>` in one quiet 12 px line at the foot of the context panel and the phone's Panel drawer (a commit shortened to seven characters, the full value in its title), and says the source is not recorded without it. The shell version comes from `src/studio/build-info.ts` and also stamps annotation capture context, with the source revision when declared. Products that build Studios more than one way (local, offline export, public) should supply the revision to each build; nothing else changes without it.

Local annotations: the host controls are docked in a reserved strip under the top bar instead of floating over the stage, using the shell's checkbox, a styled native Target select and a ghost Feedback button (labels and roles unchanged: the `Annotations` checkbox, the `Annotation target` combobox and `Feedback (n)`). Notices show in the strip. The vendor control is pinned in the strip's end at every width (phones included), and the strip reserves what it draws: 44 px collapsed, its full width while feedback mode is open, or a row of its own on phones, so it never covers preview frames, Details (marked `data-studio-inspector`) or the strip's own controls. Bars that appear above the strip move it with them; in an expanded library preview dialog it keeps its previous placement. A document or preview with no measured size starts no session until it has one, and refusal reasons now name the actual problem; "Saved marker data exceed the session limit" appears only for oversized saved markers. Product scripts that located the annotation checkbox by label should use its role (`getByRole("checkbox", { name: "Annotations" })`), since the shell checkbox pairs a visible control with a hidden input.

Chrome text is never smaller than 12 px: rail labels, phone tab labels, badges, counts and hints moved from 10, 10.5 and 11 px to 12 px, small badges grew from 16 to 20 px, phone tab labels use regular weight and tight tracking so every entry stays whole at 390 px, and the catalogue's group labels and the Present tour label are sentence case.

Nothing else to do by hand. Product adapters and product files remain product owned.

## 0.17.1

DesignPanelProps now supplies review context (scenarioId, readonly scenario options and selectScenario) to Foundation and Component panels. Use it for a Review fixture selector and contextual reach readouts; navigation never edits direction payloads or undo history. Private panels still import only the public kit/design-ui APIs and their own files. Product-owned modules remain protected by managed updates. EditorPopover adds optional open/onOpenChange for controlled Close picker and choice dismissal; existing uncontrolled callers retain their behavior.

## 0.17.0

An optional studio-design-editor/1 declaration loads product-owned panels from protected src/design-ui/. Its registered compiler supplies the authoritative pure model; private panels use @studio/kit and @studio/design-ui. Opted-in previews use the source/confirmed saved basis plus labeled working overlays, and Tokens is readonly. The optional compiled-data frame capability forwards the same JSON snapshot without another resolver. Registered local stylesheets are validated and failures preserve the last valid result. Read references/design-ui.md before opting in. Non-opted consumers retain their legacy behavior. New frame capabilities require the updated frame-client/protocol in product receivers; copied clients must be refreshed to consume compiled data. Canonical saved-direction persistence is not supplied by this editor interface.

## 0.16.1

Next uses its official ESLint plugin and recommended rules, with mixed provider/hook/helper exports allowed. Vite keeps its existing refresh rules. The managed updater adds the Next plugin dependency and preserves product files. Run npm install after a skipped-check update. Nothing else to do by hand.

## 0.16.0

The shell now composes one common UI source with Vite or Next host overlays. Existing lock/1 consumers remain Vite; updates write host-aware lock/2 and preserve product files. New Next consumers use `--create --host next`. Host changes require an explicit migration. Product-owned `src/design-runtime/index.ts` is seeded empty for opt-in data-only design compiler descriptors; legacy designDraft remains unchanged. Nothing else to do by hand.

# Updating this Studio

The shell in this Studio comes from the `metamodern-interface-studio` skill. Bring it up to the newest shell with the skill's updater instead of copying files by hand. First install the skill update, then run, from anywhere:

```bash
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <this-studio>
```

That reports what would change and writes nothing. Add `--apply` to update; it then installs and runs typecheck, lint, build and, when it can, acceptance. The skill's `references/updating.md` explains blocked files and the lock.

The updater never changes product files: `src/adapter.ts`, `studio.config.ts`, the product's adapter, `layouts.json`, `scenarios.json`, and anything that did not come from the starter. It replaces shell files whole, so change the shell in the skill, not here.

Each section below lists what a product does by hand when it updates to that version. The updater prints every section between the Studio's version and the new one.

## 0.6.0

- `studio-shell.lock.json` records the shell version and a fingerprint of every shell file. A Studio made before 0.6.0 has none: run the updater once with `--adopt`, which finds the shell version the Studio came from and lists every shell file that differs from it.
- `studio.config.ts` is new and belongs to the product. It holds the page title, the output folder and any extra pages to build. The updater creates it from the `<title>` in your `index.html` and the `outDir` in your `vite.config.ts`. Check it, and add to `inputs` any page your old `vite.config.ts` built besides the Studio.
- `index.html`, `vite.config.ts` and `tsconfig.app.json` are shell files again. Once their product settings are in `studio.config.ts`, take the shell versions with `--replace`. `index.html` now tells search engines not to index the Studio.
- `src/adapter.ts` only exports the product adapter. The acceptance build reaches its stress and capture-only adapters through `vite.config.ts`, so any `VITE_STUDIO_ADAPTER` branch in `src/adapter.ts` can go.
- Record deliberately deleted starter files with `--removed`, for example `--removed example/ --removed src/adapters/example.ts --removed src/adapters/synthetic.ts --removed scripts/acceptance.mjs`.

## 0.7.0

- The Tokens view is now the Design view, with Adjust and Tokens tabs over one draft layer. Links with `view=tokens` still open the Tokens tab. Nothing to do unless the Studio's own checks name the Tokens rail item; it is now called Design.
- To offer Adjust, add `design.parameters` to the adapter (see `frame-protocol.md` in the skill): typically density with `stops` at the modes the product ships, corner radius, typefaces, a type scale, text size, line height, brand and accent colors and a neutral temperature. Declare only levers that move the product; probe them first.
- Scenarios can declare `supports`, the options of an input they can render. An input the product ships as modes (such as density) fits as a dock lens: `placement: "dock"`, `icon: "density"`, with each scenario's `designed` value and its `supports`.
- The frame client now announces `draft-css` in `hello` and applies draft CSS rules and Google Fonts stylesheets. A preview entry that imports `connectStudioFrame` from the Studio gets this with the update. A product that passes its own `applyTokens` keeps it; CSS and fonts still apply through the default `applyCss` unless it passes its own.
- Save as variant downloads `{ id, kind, label, overrides: { "--token": { light, dark } }, css, stylesheets, design }`. A Studio whose variants folder reads another shape should read this one.

## 0.8.0

- The Responsive view is new: one scenario at several sizes, as a row or on a canvas, with full-page height and sync. It needs nothing to run. To give it the product's own layouts, add `axes.responsive.presets` (and `devices` for Add frame) to the adapter. Layouts the team saves land in `layouts.json` at the Studio root; commit it.
- A preview entry that imports `connectStudioFrame` from the Studio gets full-page height and sync with the update. For better sync, mark nested scrolling regions with `data-studio-scroll`, stable click targets with `data-studio-anchor` or `data-studio-sync`, and fields that must never leave the frame with `data-studio-private`; pass a `navigate(location)` handler so navigation follows directly. A preview that must stay out of sync passes `{ sync: false }`.
- `@xyflow/react` is a new dependency, loaded only when a canvas layout opens.
- The Responsive view takes the 6 key; the rail places it between Compare and Gallery.

## 0.8.1

Nothing to do by hand. `vite.config.ts` passes lint again.

## 0.9.0

- Stage navigation is the same on every stage: scroll pans, ⌘ or Ctrl with the wheel or a pinch zooms at the pointer, Space or a middle drag pans, + and − step. A preview entry that imports `connectStudioFrame` from the Studio gets it over its frames with the update (the frame announces `stage-gestures`). A preview that must keep every wheel and Space press passes `{ gestures: false }`.
- The Responsive row's scale chip and the canvas's own zoom buttons are gone; the dock's zoom control states and sets the zoom everywhere, and Tidy is in the Responsive toolbar. Checks that read `[aria-label="Scale"]`, "Canvas zoom", "Fit view" or "Show at actual size" should read the dock's `Zoom, …` control instead.
- The dock can group what the product ships for how a screen looks into a Design menu. Give each high-contrast theme `contrastOf: "<its standard theme>"` and the dock shows only the standard themes, with Contrast in the menu. Give a dock input `group: "design"` (such as density) to move it into the menu; it is still a lens. Checks that press a `Density, …` button should open the `Design, …` menu instead.
- The frame's outer line in light is now 14% black instead of 60%.

## 0.9.1

- In the Responsive row, dragging a frame's label places the frame where it is dropped instead of reordering; the Frames list still reorders. Checks that dragged a label to reorder should use the list, or the Back to a row icon to return to a flowing row.
- Resize handles hug the frame at every zoom. Nothing to do by hand.

## 0.10.0

- Scenario inputs can declare `control: "range"`, numeric bounds and steps, presets, and time formatting (`time` for minutes or `time-hours` for decimal hours). Values may be strings or finite numbers in the frame protocol; range values are validated and normalized before mounting. Declare the range instead of enumerating every clock value as an option.
- Design parameters can declare `kind: "enum"` or `"range"`, `themes`, `defaultsByTheme`, and `apply.input`. Input-backed adjustments reach the product as `MountInputs.design`; implement that field in the preview's mount handler. Existing token and CSS drafts continue to work. Draft settings are retained independently for each theme or visual variant.
- Walkthrough steps can declare stable `id`, `values`, `duration` and `hidden` fields. `values` materializes the authored scenario inputs; duration is in seconds. Hidden steps remain authored material and are deliberately excluded from playback. Add stable step IDs before importing presenter edits when array order can change.
- Presenter edits are a separate browser overlay with import/export, narration, goals, timing and hidden-step edits. An import does not alter generated adapter material. Product-specific legacy browser exports need a product-owned conversion into the overlay format; a new origin cannot read another origin's storage.
- Saved comparisons can declare `values` for up to four values on one axis, with independent runtimes. Existing `a` and `b` pairs continue to work.
- A frame may supply `diagnostics()` rows through `connectStudioFrame`; the shell displays those measurements and their budgets in Details. Diagnostics are review evidence, not source approval or a universal product budget.

## 0.10.1

- Profiles can declare `frameRadius` in unscaled CSS pixels. Match the outermost shape the preview actually draws: a renderer with a device bezel uses its bezel radius, a bare screen uses its screen radius, and a flat viewport uses 0.
- Phone and tablet boundaries now scale continuously with zoom, without rounding or a minimum radius that changes the shape. Tablets have a separate 28 px default; phone and desktop defaults remain 44 px and 8 px. Declare `frameRadius` whenever a product draws a different shape.
- The same geometry applies in Inspect, Compare, Gallery, Present, Design and Responsive, including empty/capture previews. No product artwork or internal radius is changed by a shell update.

## 0.10.2

Nothing to do by hand, except for a preview entry that copied `frame-client.ts` instead of importing it (see below). Fixes from review of 0.10.1:

- Design values follow `defaultsByTheme`. A shared parameter's value travels in a link when it differs from the as-built default of any theme, so a link made in one theme shows the same value in another; a theme-scoped value travels when it differs from that theme's default. The specimen and the draft shown in each theme compare with that theme's own default. Existing links still open.
- Saved design values equal to a parameter's plain `default` are now restored on reload (0.10.1 dropped them). A draft may therefore reappear in a theme whose `defaultsByTheme` value differs; Reset all clears it.
- A range input whose maximum is not a whole number of steps sends the last step inside the range (max 10, step 4 sends 8, not 12).
- A frame whose `diagnostics()` throws or rejects now reports no diagnostics and still becomes ready. A preview entry that copied `frame-client.ts` instead of importing it should copy it again.
- Compare keeps sides A and B first in a saved set, swaps two sides when one is set to the other's value, and keeps at most four saved values. It shows no more sides than the axis has values, and an axis with fewer than two values is explained instead of loading. `src/studio/compare.ts` is a new shell file.

## 0.11.0

- Scenario inputs can be component properties: `section: "properties"` with `surfaces`, `curated`, `optional`, `readonly` and `note`, and the controls `switch`, `text` (`multiline`, `maxLength`, `shareable`), `number` and `choice`. They appear in Details > Scenario > Properties. A Studio that declares none is unchanged.
- A property ID must not be one of the Studio's link keys (`view`, `scenario`, `theme`, `profile`, `size`, `tab`, `design`, `layout`, `frames`, `height`, `arrange`, `vp`, `sync`, `edited`); such a property gets no row and is rejected with a console error. Rename it.
- `MountInputs.values` may now hold `true` and `false`. A preview entry that only expects strings and numbers should accept booleans for switch properties.
- To change properties without a remount, pass `update(inputs)` to `connectStudioFrame`; the client then announces `live-values`. Without it each property change mounts a new runtime. After an update the fingerprint and diagnostics still describe the mount. To offer the Code tab, pass `code(inputs)` returning `{ language, text }`, listing only props that differ from their defaults.
- Saved states land in `scenarios.json` at the Studio root (`studio-scenarios/1`), a product file written only by the dev server; commit it. Generated scenario IDs must not start with `saved.`. A host other than Vite that serves the Studio implements `__studio/scenarios` (relative to the Studio page, dev builds only) as `shell.md` describes.
- The example gains a Components area with the Task card and its Done state. Checks that counted the example's areas or scenarios should expect them.
- Products whose previews must not carry the viewer's cookies or be able to navigate the Studio can declare `frameIsolation` in the adapter: `sandbox` (the iframe sandbox token list) and `credentialless: true`. Every preview frame gets them; without the declaration frames are unchanged. A sandbox without `allow-same-origin` also needs `frameOrigin: "null"` and the Studio's origin in the frame client's `allowedOrigins` (see `frame-protocol.md`). Do not combine `allow-scripts` and `allow-same-origin` for a frame served from the Studio's own origin: that gives no isolation.
- Every Studio: an empty range value in a link (for example `?clock=`) now reads as unset, so the scenario's designed value shows, where 0.10.2 read it as 0.
- A preview entry whose `update` is asynchronous needs no change: the frame client now runs value updates one at a time, in order, and applies only the newest, so a slow update can no longer leave older values on screen. Copy `frame-client.ts` again if the entry holds a copy.
- Saving a state now reads `scenarios.json` first and writes back every entry it does not change exactly as stored, including entries the Studio skips. A saved state can Clear an optional property it sets, and Save writes the state as it now shows, so an unset property is left out.
- Present mounts a fresh runtime for every step, so two steps on one scenario that differ only in values never share product state.
- Fix: a Design `font` parameter set to a generic family (`system-ui`, `serif`, `ui-monospace` and the like) is no longer quoted into a missing named font, and requests no Google Fonts stylesheet.

## 0.12.0

Nothing to do by hand for a Studio that declares no workspace, apart from checking the visible changes below. Workspace modules are new and optional.

- A product can add its own tools beside the views, declared under `workspace` in the adapter and built in `src/workspace/` from `@studio/kit` (`studio-kit/1`) and `@studio/workspace` (see `references/workspace.md` in the skill). A Studio whose adapter declares no `workspace` builds without any workspace code, provided Vite can load the adapter at build time; otherwise the build warns and keeps the layer (see `references/workspace.md`).
- The updater creates `src/workspace/index.ts`, an empty `defineWorkspace({})`, when it is missing. That file and everything in `src/workspace/` belong to the product; updates never compare or change them. `npm run lint` keeps files there to `@studio/kit`, `@studio/workspace`, React and their own imports.
- A later major kit version is reported as Breaking, and `--apply` writes nothing until `--accept-kit <version>` names it.
- `module` and `section` are now reserved link keys. A component property with either ID is rejected, as for the other link keys; a dock input with either ID keeps working but no longer travels in links, and the console says so. Rename it.
- Saving layouts and states now detects a save made elsewhere. A host other than Vite that implements `__studio/layouts` or `__studio/scenarios` should answer `x-studio-revision` on GET and on a successful POST, and honor `x-studio-expected-revision` on POST with a 409 and `{ ok: false, error: { code: "conflict", reason, recoverable: true }, current: { data, revision } }`, writing nothing, as `shell.md` describes, and answer `x-studio-unreadable: 1` on a GET of a file that is not JSON, so the Studio refuses to save over it. A host without revisions keeps working; its saves stay last writer wins. Layout saves now wait until the page has read `layouts.json` ("Loading layouts…"). The dev server's endpoint moved to `scripts/saved-file.ts`, and `tsconfig.node.json` now includes it.
- `scripts/acceptance.mjs` builds a fourth Studio with the example workspace (`example/workspace/`, removed with `example/`) and measures WS-01 to WS-09, WS-06b and AC-61 to AC-64. The updater skips acceptance, with the reason, when `example/workspace/` is missing. Checks that count the phone bottom bar's buttons should expect a Workspace entry in Details' place when a workspace is declared; Details then moves to the top bar.
- The core shell keeps its floors on tablets and touch screens, which changes how every Studio looks there:
  - On a coarse pointer, at any width, targets are at least 44 px and text fields use 16 px text.
  - The dock wraps onto another row instead of scrolling, so every control stays on screen.
  - On a touch screen whose top bar is narrower than 576 px, the top bar's actions fold behind one trigger, as on a phone. The breadcrumb truncates instead of being overlapped.
  - Present's narration bar lays out by its own width, and Tokens stacks the stage under the table below 1024 px, with values on up to two lines.
  - The phone bottom bar's entries grow with their labels.
- The fidelity badge (static captures and recreations) and Edited leave any top bar narrower than 576 px, touch or not; both remain in Details.
- Keyboard focus draws a 2 px outline in `--ring` on buttons, links, tabs, rows, options, menu items and switches, on desktop too. The light `--ring` and `--sidebar-ring` move from OKLCH lightness 0.708 to 0.556, and a light brand color is lowered to at most 0.5 for the ring and the active rail label. The dark active rail label uses the new `--rail-active` token. A product stylesheet that relied on the old light ring, or that styled the dock's scroll, should be checked.
- Retry on a preview that did not start now mounts it again.
- The update deletes the stray `src/drag2-after.png` and `src/drag2-mid.png`.
- `src/hooks/use-mobile.ts` also exports `useMedia` and `useCoarse`.

## 0.12.1

Nothing to do by hand, unless a product's own checks pin the geometry below. Fixes to the core shell's touch and focus floors:

- On a coarse pointer, stacked controls keep their own 44 px target. Gallery's area checkboxes and its flag switch, Present's Autoplay switch and each Responsive Sync switch sit in 44 px rows (Autoplay's whole row is now its label, so its switch keeps its target beside the panel's edge handle), and each Responsive frame row is 44 px tall, so its Remove button no longer overlaps the next. A Design range's marks move below the thumb's hit area. On every pointer, Present's Autoplay row is now a label without the old `field-label` wrapper, so a click anywhere in the row toggles the switch; otherwise fine pointers are unchanged.
- Keyboard focus in the top bar's breadcrumb and on a tab panel is drawn inside the control, so a clipping ancestor or a scroller no longer cuts it to its corners. The scenario trigger gains 2 px of side padding for it. A slider, whose focus sits on the hidden range input inside its thumb, now draws a 2 px `--ring` outline 2 px outside the thumb (`Highlight` in forced colors); 0.12.0 drew no visible indicator there.
- Studio kit (`studio-kit/1`, no API change): `SaveBar` gives its message its own line above the actions when fewer than 16rem would remain beside them, so on a phone a conflict's message, reason and current value no longer squeeze into a narrow column or run under Use current value. `DataTable` is now positioned, so its visually hidden sort announcement stays inside the module page's scroller; on a short phone a long table no longer scrolls the whole Studio and its top bar. Module code needs no change.
- Acceptance adds AC-65 (each target's reachable area, probed with `elementFromPoint`), AC-66 (each focus stop's rendered change against its perimeter) and WS-10 (the SaveBar conflict and a long DataTable page on a phone). WS-01 now measures the initial chunk against 0.12.0.
- The panel's edge handle and the frames' resize grips stay narrow; `shell.md` records them as equivalent-control allowances, with the top bar's panel toggle, the Size menu and the Responsive width list as their 44 px equivalents.

## 0.12.2

Nothing to do by hand, unless a product's own checks pin the markup below. Fixes to Present and Compare:

- Present's anchor label now reaches 4.5:1 in dark appearance: `--anchor-foreground` is near-black there (white on the lifted dark anchor measured 2.4:1). A product stylesheet that set its own `--anchor` in dark should keep a 4.5:1 pair with `--anchor-foreground`.
- The anchor label is now a sibling of `.anchor-ring` with the class `anchor-label`, placed inside the frame: above the highlight when there is room, below it when not, and inside its top edge when neither fits. It no longer disappears above the frame's top edge on a tablet or phone, and a long name truncates at the frame's edge on the side it grows toward. The label takes no pointer, so its full name stays in its text after a visually hidden "Highlighted:" for assistive technology. A product check that looked for the label as `.anchor-ring span` should look for `.anchor-label`, and one that read its text should expect the hidden prefix.
- In forced colors the highlight is a 2 px `Highlight` outline (box shadows are dropped there, so 0.12.1 drew nothing) and the label a `Canvas` and `CanvasText` pair.
- A Compare side's header is as wide as its preview (at least 60 px, so Reset's target fits): it wraps, a long value name truncates with its full name as its title, and below 7rem its status shows only the dot or icon, with the word kept as its accessible name. On a 768 px tablet side B's header no longer runs off the stage's right edge, and 3-up at 1440 px no longer scrolls the stage sideways.
- Acceptance adds AC-67 (the anchor label's contrast and placement, and the highlight in forced colors) and AC-68 (AA text in Present and Compare, and whole Compare headers with nothing scrolling sideways). WS-01 now measures the initial chunk against 0.12.1.

## 0.13.0

Nothing to do by hand for a Studio that declares no library, apart from the two checks below. Library mode is new and optional.

- A product can add a component library beside the views, declared under `library` in the adapter, with each component's documentation as data in `src/library/` (see `references/library.md` in the skill). A Studio whose adapter declares no `library` builds without any library code, provided Vite can load the adapter at build time.
- The updater creates `src/library/index.ts`, an empty `defineLibrary({})`, when it is missing. That file and everything in `src/library/` belong to the product; updates never compare or change them. `npm run lint` keeps files there to `@studio/library` and their own imports, and to `.ts`, `.js` or `.mjs` (documentation is data, so `.tsx` and `.jsx` are refused).
- `library` is now a reserved link key. A component property with that ID is rejected, as for the other link keys; a dock input with it keeps working but no longer travels in links. Rename it.
- `scripts/acceptance.mjs` builds a fifth Studio with the example library (`example/library/`, removed with `example/`; it also carries the example workspace) and measures LB-01 to LB-10. The updater skips acceptance, with the reason, when `example/library/` is missing. WS-01 and LB-01 now measure the initial chunk against 0.12.2.
- The acceptance focus walk shared by WS-09 and LB-08 skips preview frames, and its target and boundary checks skip inline text references (`data-inline`). Product checks built on copies of those helpers should do the same.

## 0.13.1

Nothing to do by hand, unless a product's own checks pin the rail or Go to order below, or a preview entry copied `frame-client.ts`. A Studio that declares no library keeps its rail and Go to.

- The library's rail item now comes first, above the views, with a divider after it; the workspace modules, when declared, still follow the views after their own divider. The rail reads Library, then Views, then Workspace, and Tab follows that order: from the product mark, Tab reaches Library before Inspect. The item keeps its marker, inset focus ring, label and tooltip. While the library's navigation chunk loads, the rail holds the item's and the divider's places, so the views do not move when it arrives. A product check that expected `nav[aria-label="Library"]` to follow the workspace, or a separator before it, should expect it first with a separator after it.
- Go to (⌘K) lists the library's groups after Scenarios and before Views, in the rail's order. Scenarios stay first, so the entry Go to highlights when it opens is still a scenario.
- On a phone nothing changes: the bottom bar keeps one place entry (Workspace, or Library in a Studio without a workspace), and the Workspace drawer lists the library after its modules.
- Keys typed into a field inside a preview frame stay there. On macOS, Home, End, Page Up and Page Down scroll even inside a text field; when nothing in the frame could take that scroll, the browser handed it to the Studio page around the frame, so on a library page End in a preview's text field scrolled the page to the end, the preview's frame was unmounted and remounted, and focus and anything typed were lost. The frame client (`src/studio/frame-client.ts`, through `keepFieldKeys` in `src/studio/frame-gestures.ts`) now cancels such a scroll on Apple platforms, also with `{ gestures: false }`, and makes Home and End move the caret to the start or end (of the line in a multi-line field). Shift and other modifier combinations are untouched, so Shift+Home and Shift+End select natively; a select or listbox, and any field that is a combobox or has `aria-activedescendant`, keeps every key; a scroll the frame's own page or a scroller in it can take still happens. A preview entry that imports `connectStudioFrame` from the Studio gets this with the update; one that copied `frame-client.ts` should copy both files again. Keys in the shell's own fields were already never Studio shortcuts. The client listens in the bubble phase, after the product's handlers: a key the product cancels or stops is the product's. LB-04 now types End, Home, the page keys and Shift+Home into a Text field preview and checks the page, the caret and the selection, once natively and once with the preview frames told they are on a Mac, so the Apple branch runs on any OS (with a textarea, a field whose product cancels Home, a combobox and an `aria-activedescendant` field).
- `LibrarySlot` takes an optional `fallback`. LB-02 now checks the rail order, the dividers, the Tab order and Go to's group order. WS-01 and LB-01 now measure the initial chunk against 0.13.0.

## 0.13.2

Nothing to do by hand, unless a preview entry copied `frame-client.ts` (copy it and `frame-gestures.ts` again) or a product's own checks pin the acceptance chunk baseline.

- Page Up and Page Down typed into a field inside a preview frame no longer scroll the Studio page around it outside Apple platforms. 0.13.1 kept those keys only on Apple platforms, but Chromium elsewhere (measured on Linux) also scrolls on them from a single-line text field or a number field, and from a textarea or editable region whose selection already reaches that end, collapsed or not (Page Down at the end, Page Up at the start); when nothing in the frame could take that scroll it reached the library page, scrolled it (745 px on a Text field page) and could unmount the preview. The frame client (`keepFieldKeys` in `src/studio/frame-gestures.ts`) now cancels exactly those scrolls on every platform and leaves the caret, the selection and a number field's value where the browser leaves them (Chromium does not move them either). A Page Up or Page Down that moves a textarea's caret stays native, Home and End outside Apple platforms stay native caret moves, and the 0.13.1 rules are unchanged: unmodified keys only, after the product's handlers, never for selects, listboxes, comboboxes or `aria-activedescendant` fields, and a scroll the frame's own page can take still happens. Apple platforms behave as in 0.13.1.
- LB-04 now starts the library page 100 px down, so a Page Up that escapes shows too, and adds a textarea Page Down check to the native run (on Linux the caret moves natively; on a Mac the client cancels the scroll) and a third run with the preview frames told they are on Linux, which records which page keys the client cancels in a field, a number field, a textarea (also with a selection) and a combobox, so the non-Apple branch is checked on any OS. WS-01 and LB-01 now measure the initial chunk against 0.13.1.

## 0.14.0

Nothing to do by hand. A library declared without `sections` lists its groups flat, exactly as in 0.13.2, and a Studio without a library is unchanged.

- The library can declare `sections` (`{ id, label }`), each group then naming its `section`, and a component can name other groups in `alsoIn`, opening the same page from each (see `references/library.md` in the skill). With sections the panel shows each section and group heading as a native button disclosure, inside an h3 or h4, with `aria-expanded`, `aria-controls` and the number of listings beneath it; all are closed at first except the open page's home section and group, which open on every navigation. The viewer's toggles are kept in the browser under `studio.<adapter id>.library-open.v1`.
- Search with sections shows each match's path (Section › Group), opens every branch holding a match and restores the open state when cleared. The breadcrumb reads product, library, home section, home group and component, and Go to lists each component once, under its home section and group.
- An invalid `sections` or `alsoIn` (including a section that holds no groups) fails the build by name, as other library declaration problems do. `libraryProblems`, `groupedComponents` (with a `home` flag), `sectionedComponents` and `homePath` in `src/studio/library/model.ts` are the shell's; product checks built on copies of `groupedComponents` should list a cross-listed component in each of its groups.
- `scripts/acceptance.mjs` builds a sixth Studio with the example library declared with sections (`example/library/sections.ts`, and `example/library/invalid.ts` for the failing build; removed with `example/`) and measures LB-11 to LB-16; LB-08 also walks its panel. `tabWalk` takes an optional start selector. The updater skips acceptance, with the reason, when `example/library/sections.ts` is missing. WS-01 and LB-01 now measure the initial chunk against 0.13.2.

## 0.15.0

Nothing to do by hand. A Studio that uses none of the additions below looks and behaves as in 0.14.0; its initial chunk grows by a few hundred bytes.

- Workspace modules can declare `group`; the rail and the phone's Workspace drawer draw a divider between consecutive modules whose groups differ. Without groups nothing changes.
- A module whose `uses` is empty or omitted is host-free and opens without `workspace.operations`; a workspace of host-free modules may omit `operations`. A module that declares `uses` without an operations base stays unavailable, with a reworded reason ("…and this module calls the product's operations, so it cannot open."). Product checks that matched the old wording ("so its modules cannot reach the product") should match the new one.
- `item` is a new reserved link key. A component property with that ID is rejected, and a dock input with it no longer travels in links, as for the other link keys; rename it. `useModule()` gains `item` and `setItem(id | null)`: the link carries `module=…&section=…&item=…`, a link with an item restores it, changing only the item replaces the history entry, and `go(section)` clears it. Item IDs are up to 128 of `A-Z a-z 0-9 . _ : -`; anything else is dropped with a console error.
- The kit (`studio-kit/1`, additive) gains `SelectList`, a grouped, filterable listbox where selection follows focus (arrows, j and k, Home and End), and `@studio/workspace` gains `useStepKeys(onPrevious, onNext)`, which binds j and k while a module is open and is listed in the keyboard shortcuts.
- A library component can declare `wide: true`: its preview blocks and Code tabs are laid out at up to 1.5 times the text column, centred, within the page's gutters, and never above natural size. Other pages are unchanged.
- A preview frame sandboxed without `allow-same-origin` is now always checked as origin "null", whether or not the adapter declares `frameOrigin: "null"`, and wherever it is served (https included). Before, a workspace module's kit `PreviewFrame` with `src` in such a Studio never became ready, because a module cannot pass the adapter's `frameOrigin`; it now does. Nothing changes for a Studio without that sandbox. `references/verification.md` has a new section, Publishing to a static host, listing what a product sets (sandbox, `allowedOrigins` in the preview entry, CORS on the frame's files, headers, no operations) and the hosted checks.
- `scripts/acceptance.mjs` builds a seventh Studio, the example as published to a static host (`example/static-adapter.ts`, `example/workspace/static.ts` and `catalog.tsx`, `example/library/static.ts` and `button-row.ts`; removed with `example/`), serves it with CORS and the Studio's origin written into its preview pages, and measures WS-11 to WS-15, LB-17 and AC-69. Its `open` helper's appearance and brand init scripts now tolerate opaque frames. The updater skips acceptance, with the reason, when `example/static-adapter.ts` is missing. WS-01 and LB-01 now measure the initial chunk against 0.14.0.
- The example preview entries (`example/main.ts`, `example/library/frame.ts`) read allowed origins from `<meta name="studio-allowed-origins">` when the page carries one; without it they behave as before.
