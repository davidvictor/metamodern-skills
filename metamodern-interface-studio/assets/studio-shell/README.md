# Interface Studio shell

The product-neutral starter for an Interface Studio. It is a complete, running Studio: the grey stage, the icon rail with contextual panels, the five views, the details panel, the command menu, the walkthrough player, the Design view (Adjust and Tokens) and the Studio settings. A synthetic example product runs live inside it so every part can be seen working before a real product is connected.

Read `references/shell.md` and `references/frame-protocol.md` in the `metamodern-interface-studio` skill before changing the shell.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. `npm run build` type checks and builds both the Studio (`index.html`) and the example preview entry (`example/index.html`) into `dist/`. `npm run lint` and `npm run typecheck` run the static checks. `npm run acceptance` measures the shell against the acceptance criteria in `references/shell.md` (it needs Playwright).

## What a product changes

A new Studio changes four things (and gains `layouts.json` and `scenarios.json` as the team saves layouts and states) and leaves the shell alone. Create it with the skill's `scripts/update-studio.mjs <dir> --create`, which also writes `studio-shell.lock.json` so later shell releases can reach it (see `UPDATING.md`).

| File | Change |
| --- | --- |
| `src/adapter.ts` | Point `adapter` at the product's adapter declaration. This is the only import of product data in the shell, and a product file: updates never change it. |
| `studio.config.ts` | The page title, the output folder and any extra pages to build. A product file: updates never change it. |
| `layouts.json` | Responsive layouts the team saved from the Studio while it ran with `npm run dev`. A product file, written only by the dev server; commit it to share layouts. |
| `scenarios.json` | Named states the team saved from property edits with Save as scenario while the Studio ran with `npm run dev` (`studio-scenarios/1`). A product file, written only by the dev server; commit it to share them. |
| `src/adapters/` | Add the product adapter, generated from the manifest and runtime catalog: product name and mark, target fidelity and capabilities, themes, profiles, scenario inputs and component properties, areas, scenarios, walkthroughs, comparisons and tokens. The starter's `example.ts` and `synthetic.ts` serve the acceptance suite; keep them with `example/` and `scripts/acceptance.mjs`, or delete all four together and record them as removed with the updater. |
| The product's preview entry | A route or document in the product that renders one scenario in isolation and calls `connectStudioFrame` from `src/studio/frame-client.ts`. Set the adapter's `frameEntry` to its URL. Import `connectStudioFrame` from the Studio rather than copying it, so shell updates reach it. Remove the example from `inputs` in `studio.config.ts` when `example/` goes. |

A Studio with no live preview, such as native work with recorded captures only, omits `frameEntry` and supplies `captures` on each scenario. The shell then shows captures, disables what a capture cannot do, and says why.

## Layout of the source

```text
studio.config.ts             product settings: title, output folder, extra pages (product file)
studio-shell.lock.json       shell version and file fingerprints, written by the updater
UPDATING.md                  what to do by hand for each shell version
src/
  adapter.ts                 the one product seam (product file)
  adapters/example.ts        synthetic example adapter (replace)
  adapters/synthetic.ts      stress and capture-only adapters for the acceptance script
  studio/
    types.ts                 adapter declaration types
    protocol.ts              studio-preview/1 messages
    frame-client.ts          product side of the protocol (framework free)
    live-preview.tsx         preview host: isolated frames, staged swap, timeouts
    virtual-list.tsx         windowed list with one tab stop and type-ahead
    config.ts                the studio.config.ts type
    design.ts                the Design view's draft: parameters to tokens, CSS and fonts; variant and token diff files
    layouts.ts               Responsive layouts, presets and the studio-layouts/1 file
    properties.ts            component properties: where they apply, links, Compare axes, saved states in the catalog
    scenarios.ts             saved states and the studio-scenarios/1 file
    saved.ts                 saved-state ID and value rules that properties.ts and scenarios.ts share
    frame-sync.ts            Responsive sync inside a preview frame (framework free)
  store.tsx                  Studio state, URL selection, per-viewer settings
  App.tsx                    desktop and phone shells, global keys
  components/studio/         rail, panels, top bar, stage controls, views, Responsive view and canvas, Design view, details, Properties (loaded on demand), resize handles
  components/ui/             shadcn components (base: Base UI, style: Rhea)
  components/theme-provider.tsx   Studio appearance and brand color
  index.css, studio.css      shadcn tokens plus the Studio extensions
example/                     synthetic example product preview entry (replace)
scripts/acceptance.mjs       measures AC-01 to AC-60 in headless Chromium
```

## Keep these rules

- The shell never renders product UI and never reads product tokens. Previews run in their own frames; captures are images with provenance.
- Product theme and Studio appearance are separate controls. The brand color tints Studio accents only: primary buttons, switches, focus rings, the rail marker and the mark. The stage, preview boundary, status and fidelity colors stay fixed.
- Fidelity is always stated (Details, and the top bar for static captures and recreations) and scale is always disclosed (the Zoom control, or a chip under the frame).
- A broken reference shows as unresolved. Nothing is substituted.
- Modified means a person changed product state. Clicks that change nothing do not count, and the badge is a state, not a count.
- Edited means the viewer changed properties of the selected state. It is separate from Modified, and R keeps it; Reset (n) in Properties clears it.

## Local edits to generated components

These files differ from `shadcn add` output. Reapply the edits after regenerating them.

| File | Edit |
| --- | --- |
| `src/components/ui/select.tsx` | `alignItemWithTrigger` defaults to `false` so the list opens below its trigger, and the popup uses `p-1` with a 150 ms ease-out. |
| `src/components/ui/sonner.tsx` | Reads the Studio appearance from `theme-provider` instead of `next-themes`. |
| `src/components/ui/scroll-area.tsx` | Unused React import removed. |
| `src/components/ui/slider.tsx` | `aria-label` on the Slider is passed to the thumb input, which is what a screen reader reads. |

The stack is shadcn 4.21 (`base-rhea`, Lucide icons), Base UI 1.8, Tailwind CSS 4, React 19 and Vite 8. The shell uses Geist through `@fontsource-variable/geist`.
