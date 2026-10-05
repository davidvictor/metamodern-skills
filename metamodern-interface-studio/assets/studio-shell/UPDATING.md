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
- The anchor label is now a sibling of `.anchor-ring` with the class `anchor-label`, placed inside the frame: above the highlight when there is room, below it when not, and inside its top edge when neither fits. It no longer disappears above the frame's top edge on a tablet or phone, and it truncates to the frame's width with its full name as its title. A product check that looked for the label as `.anchor-ring span` should look for `.anchor-label`.
- In forced colors the highlight is a 2 px `Highlight` outline (box shadows are dropped there, so 0.12.1 drew nothing) and the label a `Canvas` and `CanvasText` pair.
- A Compare side's header is never wider than its preview: it wraps, and a long value name truncates with its full name as its title. On a 768 px tablet side B's header no longer runs off the stage's right edge, and 3-up at 1440 px no longer scrolls the stage sideways.
- Acceptance adds AC-67 (the anchor label's contrast and placement, and the highlight in forced colors) and AC-68 (AA text in Present and Compare, and whole Compare headers with nothing scrolling sideways). WS-01 now measures the initial chunk against 0.12.1.
