# Interface Studio shell

The product-neutral starter for an Interface Studio. It is a complete, running Studio: the grey stage, the icon rail with contextual panels, the five views, the details panel, the command menu, the walkthrough player, the Tokens view and the Studio settings. A synthetic example product runs live inside it so every part can be seen working before a real product is connected.

Read `references/shell.md` and `references/frame-protocol.md` in the `metamodern-interface-studio` skill before changing the shell.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. `npm run build` type checks and builds both the Studio (`index.html`) and the example preview entry (`example/index.html`) into `dist/`. `npm run lint` and `npm run typecheck` run the static checks. `npm run acceptance` measures the shell against the acceptance criteria in `references/shell.md` (it needs Playwright).

## What a product changes

A new Studio changes three things and leaves the shell alone.

| File | Change |
| --- | --- |
| `src/adapter.ts` | Point `adapter` at the product's adapter declaration. This is the only import of product data in the shell. |
| `src/adapters/` | Add the product adapter, generated from the manifest and runtime catalog: product name and mark, target fidelity and capabilities, themes, profiles, scenario inputs, areas, scenarios, walkthroughs, comparisons and tokens. Delete `example.ts` and `synthetic.ts` once the product adapter exists, and reduce `src/adapter.ts` to the product adapter. |
| The product's preview entry | A route or document in the product that renders one scenario in isolation and calls `connectStudioFrame` from `src/studio/frame-client.ts`. Set the adapter's `frameEntry` to its URL. Delete `example/` and its build input in `vite.config.ts`. |

A Studio with no live preview, such as native work with recorded captures only, omits `frameEntry` and supplies `captures` on each scenario. The shell then shows captures, disables what a capture cannot do, and says why.

## Layout of the source

```text
src/
  adapter.ts                 the one product seam
  adapters/example.ts        synthetic example adapter (replace)
  adapters/synthetic.ts      stress and capture-only adapters for the acceptance script
  studio/
    types.ts                 adapter declaration types
    protocol.ts              studio-preview/1 messages
    frame-client.ts          product side of the protocol (framework free)
    live-preview.tsx         preview host: isolated frames, staged swap, timeouts
    virtual-list.tsx         windowed list with one tab stop and type-ahead
  store.tsx                  Studio state, URL selection, per-viewer settings
  App.tsx                    desktop and phone shells, global keys
  components/studio/         rail, panels, top bar, stage controls, views, details, resize handles
  components/ui/             shadcn components (base: Base UI, style: Rhea)
  components/theme-provider.tsx   Studio appearance and brand color
  index.css, studio.css      shadcn tokens plus the Studio extensions
example/                     synthetic example product preview entry (replace)
scripts/acceptance.mjs       measures AC-01 to AC-16 in headless Chromium
```

## Keep these rules

- The shell never renders product UI and never reads product tokens. Previews run in their own frames; captures are images with provenance.
- Product theme and Studio appearance are separate controls. The brand color tints Studio accents only: primary buttons, switches, focus rings, the rail marker and the mark. The stage, preview boundary, status and fidelity colors stay fixed.
- Fidelity is always stated (Details, and the top bar for static captures and recreations) and scale is always disclosed (the Zoom control, or a chip under the frame).
- A broken reference shows as unresolved. Nothing is substituted.
- Modified means a person changed product state. Clicks that change nothing do not count, and the badge is a state, not a count.

## Local edits to generated components

These files differ from `shadcn add` output. Reapply the edits after regenerating them.

| File | Edit |
| --- | --- |
| `src/components/ui/select.tsx` | `alignItemWithTrigger` defaults to `false` so the list opens below its trigger, and the popup uses `p-1` with a 150 ms ease-out. |
| `src/components/ui/sonner.tsx` | Reads the Studio appearance from `theme-provider` instead of `next-themes`. |
| `src/components/ui/scroll-area.tsx` | Unused React import removed. |
| `src/components/ui/slider.tsx` | `aria-label` on the Slider is passed to the thumb input, which is what a screen reader reads. |

The stack is shadcn 4.21 (`base-rhea`, Lucide icons), Base UI 1.8, Tailwind CSS 4, React 19 and Vite 8. The shell uses Geist through `@fontsource-variable/geist`.
