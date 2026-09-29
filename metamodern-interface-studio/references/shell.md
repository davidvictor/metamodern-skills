# Studio shell

Read this for Build, and for any Update or Verify that touches the Studio's own interface. The shell is the Studio's own product: a calibrated grey stage, an icon rail with contextual panels, and five views. It has its own visual language, separate from every product it presents, and it never renders product UI itself. Previews reach it only through the [frame protocol](frame-protocol.md) or as recorded captures.

The starter in [assets/studio-shell](../assets/studio-shell/README.md) implements everything below and runs a synthetic example product live. Start every new Studio from it rather than from a blank project or from another product's Studio.

## Start a Studio

1. Inspect the application first (see [SKILL.md](../SKILL.md)). Decide the target, fidelity and preview strategy before copying anything.
2. Copy `assets/studio-shell/` into the location the user chose for the Studio. A folder inside the product repository, such as `studio/`, keeps the adapter next to the source it describes; a separate repository needs pinned source imports as described in [manifest.md](manifest.md). Do not copy `node_modules` or `dist`.
3. Run `npm install` and `npm run dev` and confirm the example runs before changing anything. This separates shell problems from integration problems.
4. Write the product adapter in `src/adapters/`, generated from the manifest and runtime catalog, and point `src/adapter.ts` at it. The adapter is data: IDs, labels, axes, capabilities, scenarios, walkthroughs and tokens. It never contains rendering code.
5. Build the product's preview entry with `connectStudioFrame` and set the adapter's `frameEntry`, or supply captures for a capture-only Studio. Follow [web.md](web.md) or [native.md](native.md) for the boundary.
6. Delete `src/adapters/example.ts`, `src/adapters/synthetic.ts`, `example/` and the example input in `vite.config.ts`, and reduce `src/adapter.ts` to the product adapter. Keep `scripts/acceptance.mjs` and point its example-specific checks at the product (see Check the shell).
7. Verify with the acceptance criteria below and [verification.md](verification.md).

Change shell components only to fix a shell defect or to meet a criterion here. Product needs belong in the adapter: an extra scenario input, a named variant axis, a presentation override. If a product seems to need a shell change, record why in the Studio's notes and keep the change product-neutral.

## Layout

| Region | Rule |
| --- | --- |
| Rail | 48 px, always visible above phone width, never collapses. The Studio mark, then the five views as square, full-width items with tooltips and number keys, then Go to and Keyboard shortcuts at the foot. The active view has a straight 2 px brand marker on the left edge and a filled background; focus is an inset square ring. No rounded rail items. |
| Context panel | 272 px beside the rail, content follows the view: catalog for Inspect and Compare, filters for Gallery, the step list for Present, families for Tokens. Clicking the active view again hides it. It has no close button of its own. The catalog and step list are windowed lists with one tab stop, so size does not change their cost. |
| Panel toggle | One control: the button at the left of the top bar, whose icon shows what it will do, plus ⌘B and the full-height sidebar edge. Never two controls for the same action side by side. |
| Top bar | Panel toggle, breadcrumb (product, view, scenario; the scenario opens Go to), live status, then Go to, Studio settings, Studio appearance, Copy link and the Details toggle. |
| Stage | The fixed grey surface with a faint 24 px grid. The preview sits centered with its tab above it. |
| Preview tab | Fidelity badge, product, theme, profile, rendered size and shown scale, plus any presentation override. Present on every preview in every view. |
| Dock | Floating under the preview: theme, profile, zoom, Product back, Reset. These change how the scenario is viewed, not what it is. |
| Details | 320 px on the right, docked, pushing the stage. Summary always visible, then Scenario, Fidelity and Evidence as line tabs. Scenario inputs live here because they change what the scenario is. In Tokens it becomes the token editor. |

Below 1280 px only one side panel stays open: the one just opened wins. Below 768 px the rail becomes a bottom bar with Panel, the five views and Details; the panel and Details open as swipeable drawers; the dock becomes a full-width strip; fit means fit to width and the stage scrolls; a phone profile opens by default when the product declares one.

Per-viewer layout settings live in Studio settings: presentation controls as a dock or a stage toolbar, Details docked or floating, labels under rail icons. Defaults are dock, docked and icons only. Switch to the toolbar when a product declares more than four presentation axes.

## Views

| View | Contract |
| --- | --- |
| Inspect | One scenario in its own runtime with live status, reset, product back and scenario inputs. |
| Compare | One changing axis, two sides, each its own runtime. Side by side, Split (a handle on the seam, arrow keys in 5% steps) and Flip (Space). Held inputs listed from what both sides resolved. Interacting with one side marks the pair diverged until reset. |
| Gallery | Grouped by area with search, area filters and a flagged-only switch. Captures when recorded; live thumbnails mount only while near the viewport and are not interactive. A card opens its declared scenario in Inspect. |
| Present | The walkthrough player from [presentation.md](presentation.md). Steps replay their commands through the frame before ready. A missing scenario, a Later surface, a failed command or a missing anchor stops the step with the reason and a Skip action; nothing is substituted. Up to 24 steps show as progress segments; beyond that one bar with marks for broken steps, a step count, and an All steps list. Touching the preview pauses and offers Restore this step. Exit returns focus to what opened Present. |
| Tokens | Shown only when the adapter declares a token source. The table lists product tokens only, both theme columns, each value drawn on the product's own ground, with family, flag and search filters. It is a windowed grid grouped by family; families over 60 tokens start folded unless the view is already narrowed. Drafts are edited one token at a time in Details, validated, kept per viewer, and applied live to the side preview only. Export copies a variant file; drafts never change the product. |

The skill's four required views remain Inspect, Compare, Gallery and Present. Tokens is the fifth view when the product has a token source.

## Controls

Choose controls by what they do and where the eye is.

| Control | Component | Where | Rule |
| --- | --- | --- | --- |
| Views | Square rail button, Tooltip, Kbd | Rail | Keys 1 to 5. |
| Theme or variant | ToggleGroup, icons or text for named variants | Dock | Every option visible. Disabled with a reason when the Studio cannot show it. |
| Profile | ToggleGroup with device icons | Dock | Becomes a Select beyond four profiles. |
| Zoom | DropdownMenu with a radio group | Dock | The trigger shows the current value. ⇧1 fit, ⇧0 actual size. |
| Product back, Reset | Icon Button with tooltip and key | Dock, right end | Back disabled until the preview has product history. R resets; a toast confirms. |
| Scenario inputs | Select, or ToggleGroup for presets | Details | Declared by the adapter. A change stages a new preview. |
| Catalog search | InputGroup with a / hint | Panel header | / focuses, Esc clears, the count becomes "n of N". |
| Status filter | Joined outline ToggleGroup on a fixed grid | Panel header | All, Stale, Unresolved with counts. Columns sized so labels never spill out of the panel. |
| Catalog tree | Windowed `role="tree"` (`VirtualList`) | Panel | One tab stop with a roving row. Up, Down, Home, End, PageUp and PageDown move; Right and Left open, close and step between group and scenario; letters type ahead and are consumed so they do not trigger Studio shortcuts. All groups open under 30 scenarios; otherwise only the current group. Searching opens every match. |
| Go to | CommandDialog | Anywhere | ⌘K. Scenarios, views, actions, walkthroughs. |
| Brand color | One row of round swatch toggles, a compact InputGroup, FieldError | Studio settings | See below. |
| Studio appearance | DropdownMenu radio | Top bar | System, Light, Dark. Never changes the product theme. |
| Status and fidelity | Badge | Everywhere | A glyph and a word carry the state; color repeats it. |
| Nothing to show | Empty | Inside the frame | A reason, never a stand-in. |

Every Select opens below its trigger (`alignItemWithTrigger` off) so the list never covers the field. Separators inside toolbars are centered at 20 px, never stretched to the top.

## Tokens of the shell

The shell uses shadcn's semantic tokens (background, foreground, muted, border, ring, sidebar) and adds a small set in `src/studio.css`.

| Token | Role |
| --- | --- |
| `--stage` | The grey surround, identical in both Studio appearances. |
| `--boundary-inner`, `--boundary`, `--tick` | Two keylines (white, then dark) and corner ticks. Any product edge color reaches 3:1 against one of them, so a near-white, near-black, mid-grey or loud product keeps a visible edge. |
| `--anchor` | Walkthrough highlight, drawn by the shell over the frame with the anchor's name. |
| `--success`, `--warning`, `--info`, `--danger` and their `-surface` pairs | Ready, modified or stale, draft or simulated, unresolved or failed. |
| `--fidelity-static` | Static captures. |
| `--dock-shadow`, `--ease-out-quint` | Floating surfaces and panel motion. |

Shell tokens never reach a preview, and product tokens never style the shell, even where names match. Product theme and Studio appearance are independent. Anything the Studio changes about product rendering, such as a forced font, is an adapter-declared presentation override shown on the preview tab.

## Brand color

Neutral by default. Studio settings offers the product's brand (from the adapter), five presets and any CSS color. It sets `--primary`, `--ring`, `--sidebar-primary` and `--sidebar-ring` with a foreground chosen for 4.5:1 contrast; in dark appearance the color is lifted to at least OKLCH lightness 0.72. It tints primary buttons, switches, focus rings, the rail marker and the mark. The stage, preview boundary, status and fidelity colors never change. It is stored per viewer and per Studio.

## Motion

Use the motion shadcn and Base UI ship, tuned for the Studio, and turn all of it off under reduced motion. Panels animate width over about 200 ms; Details pushes over 220 ms on the quint ease; a staged preview keeps the previous frame on screen with a "Staging new preview" badge and swaps only on ready; popovers fade and zoom from their trigger; a walkthrough step fades in from 98% scale; Gallery cards stagger by 30 ms and lift 2 px on hover; phone drawers follow the finger.

## Status and modified state

Status reads from the preview runtime: Loading, Ready, Capture, No capture, Did not start (with Retry), Showing previous settings (after a failed or timed-out change), Not designed, and Modified. Modified means a person changed product state in that runtime. Clicks and keys that change nothing do not count. It is a state, never a count of actions, and Reset clears it.

## Check the shell

`npm run acceptance` in the starter builds the Studio three ways (the example product, a stress adapter with 1,000 scenarios, 1,000 tokens and a 40-step walkthrough with four broken steps, and a capture-only adapter), serves them locally and measures AC-01 to AC-11 in headless Chromium. It needs Playwright (`npm i -D playwright` and `npx playwright install chromium`, or `PLAYWRIGHT_MODULE` pointing at an existing install). It prints each result, writes `acceptance-report.json` and exits non-zero on a failure. `ONLY=AC-03,AC-10` runs a subset. The stress and capture adapters build only when `VITE_STUDIO_ADAPTER` is set, and drop out of a normal build.

Run it after any change to the shell. Before connecting a product, run it unchanged to prove the shell; after connecting, replace the example-specific selectors (the New task button, the example scenario names) with the product's own and keep the rest. A product Studio can also run the shell checks against its own adapter.

## Acceptance criteria

These come from stress cases observed in real Studios and projected for larger products. The last column is the starter's measured result from `npm run acceptance` with the example and stress adapters, not a claim about a product.

| ID | Criterion | Starter result |
| --- | --- | --- |
| AC-01 | With 1,000 scenarios in 12 areas the catalog is one tab stop with arrow keys and type-ahead inside it, search updates within 100 ms, and at most 200 rows are in the DOM. | Met: one tab stop, 37 rows in the DOM, search in about 20 ms. |
| AC-02 | At every width from 360 to 1600 px, selecting a scenario leaves the preview's top edge in the viewport; only the catalog scrolls. | Met at nine widths from 360 to 1600 px. |
| AC-03 | At 360 to 430 px no view scrolls the page horizontally, measured on the document and on every region wider than the viewport. | Met for all five views at 360, 390 and 430 px. |
| AC-04 | Below 768 px the panel and Details open from the bottom bar as drawers that trap focus, close with Esc, a button or a swipe, and return focus. Targets are at least 44 px on coarse pointers. | Met with emulated touch: focus inside, Esc closes, focus returns, no target under 44 px. Swipe and real devices are not covered. |
| AC-05 | With 1,000 tokens, groups over 60 fold, at most 200 rows render, every theme's value shows on the product ground, invalid drafts never reach the preview and say why. | Met: the largest family folds, 23 rows in the DOM, an invalid draft shows its reason and leaves the preview unchanged. |
| AC-06 | A walkthrough with a missing scenario, a removed surface, a missing anchor and an unsupported command shows each in the step list and progress line and stops at it with the reason. | Met for all four. |
| AC-07 | A 40-step walkthrough shows a count and an All steps list instead of 40 targets; keys work outside the preview; touching the preview pauses; Exit restores selection and focus. | Met: no segments, 17 rows in the DOM, one tab stop, Restore works, focus returns to the opener. |
| AC-08 | For two to four sides the resolved inputs differ only in the named axis; interacting with one side changes no other side's state; more than four hands off to Gallery. | Met for two sides. More than two sides and the Gallery hand-off are not built. |
| AC-09 | A static capture shows the static badge, disables product actions, back and live theme with a reason, and shows provenance. A missing capture is unavailable, never a substitute. | Met in a capture-only build. |
| AC-10 | With near-white, near-black, mid-grey, loud and shell-matching products in both Studio appearances, the frame edge reaches 3:1 against the product edge and the tab states fidelity, product, theme and profile. | Met: worst 3.8:1 across ten fixtures, measured from screenshot pixels. |
| AC-11 | Whenever a preview is not at 100%, it states the rendered size and shown percentage, and 100% is one action away. | Met in Inspect, Compare, Present and Tokens. Gallery states its thumbnail scale and a card opens Inspect, where 100% is one action away. |
