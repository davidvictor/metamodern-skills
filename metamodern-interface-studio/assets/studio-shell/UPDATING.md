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
- A property ID must not be one of the Studio's link keys (`view`, `scenario`, `theme`, `profile`, `size`, `tab`, `design`, `layout`, `frames`, `height`, `arrange`, `vp`, `sync`, `edited`); such a property is rejected with a console error. Rename it.
- `MountInputs.values` may now hold `true` and `false`. A preview entry that only expects strings and numbers should accept booleans for switch properties.
- To change properties without a remount, pass `update(inputs)` to `connectStudioFrame`; the client then announces `live-values`. Without it each property change mounts a new runtime. After an update the fingerprint and diagnostics still describe the mount. To offer the Code tab, pass `code(inputs)` returning `{ language, text }`, listing only props that differ from their defaults.
- Saved states land in `scenarios.json` at the Studio root (`studio-scenarios/1`), a product file written only by the dev server; commit it. Generated scenario IDs must not start with `saved.`. A host other than Vite that serves the Studio implements `/__studio/scenarios` as `shell.md` describes.
- The example gains a Components area with the Task card and its Done state. Checks that counted the example's areas or scenarios should expect them.
