# Updating this Studio

The shell in this Studio comes from the `metamodern-interface-studio` skill. Bring it up to the newest shell with the skill's updater instead of copying files by hand. First install the skill update, then run, from anywhere:

```bash
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <this-studio>
```

That reports what would change and writes nothing. Add `--apply` to update; it then installs and runs typecheck, lint, build and, when it can, acceptance. The skill's `references/updating.md` explains blocked files and the lock.

The updater never changes product files: `src/adapter.ts`, `studio.config.ts`, the product's adapter, `layouts.json`, and anything that did not come from the starter. It replaces shell files whole, so change the shell in the skill, not here.

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
