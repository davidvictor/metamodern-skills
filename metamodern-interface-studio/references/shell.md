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
| Rail | 48 px, always visible above phone width, never collapses. The product mark (the adapter's `product.markSvg` paths, drawn in white on a solid brand tile in both appearances, else its two letters), then the five views as square, full-width items with tooltips and number keys, then Go to and Keyboard shortcuts at the foot. The active view has a straight 2 px brand marker on the left edge and a filled background; focus is an inset square ring. No rounded rail items. |
| Context panel | 272 px beside the rail, content follows the view: catalog for Inspect and Compare, filters for Gallery, the step list for Present, families for Tokens. Clicking the active view again hides it. It has no close button of its own. The catalog and step list are windowed lists with one tab stop, so size does not change their cost. |
| Panel toggle | One control: the button at the left of the top bar, whose icon shows what it will do, plus ⌘B and the full-height sidebar edge. Never two controls for the same action side by side. |
| Top bar | Panel toggle, breadcrumb (product, view, scenario; the scenario opens Go to), live status, then Go to, Studio settings, Studio appearance, Copy link and the Details toggle. On a phone the four actions fold behind one trigger that slides them out to its left (inert while folded, Esc or a choice folds them), and the product mark's tile stays square. |
| Stage | A neutral grey surface with a faint 24 px grid: lighter than the Studio in light appearance, darker in dark. The preview sits centered with nothing drawn above it. Fidelity is stated in Details (summary and Fidelity tab); a static capture or recreation also shows its fidelity badge in the top bar. Scale is stated by the dock's Zoom control ("Fit · 54%"), and by a size chip under the frame in views without a dock. |
| Dock | Floating under the preview: theme, size, zoom, Product back, Reset. These change how the scenario is viewed, not what it is. |
| Details | 320 px on the right, docked, pushing the stage. Summary always visible, then Scenario, Fidelity and Evidence as line tabs. Scenario inputs live here because they change what the scenario is. In Tokens it becomes the token editor. |

Below 1280 px only one side panel stays open: the one just opened wins. Below 768 px the rail becomes a bottom bar with Panel, the five views and Details; the panel and Details open as swipeable drawers; the dock becomes a full-width strip; fit means fit to width and the stage scrolls; a phone profile opens by default when the product declares one, unless the adapter names a `defaultProfile`, which opens on every screen size.

Per-viewer layout settings live in Studio settings: presentation controls as a dock or a stage toolbar, Details docked or floating, labels under rail icons. Defaults are dock, docked and labels under the rail icons on desktop. Switch to the toolbar when a product declares more than four presentation axes.

## Views

| View | Contract |
| --- | --- |
| Inspect | One scenario in its own runtime with live status, reset, product back and scenario inputs. With a live frame and `axes.resizable`, the frame has right, bottom and corner drag handles: the edge follows the pointer, a size readout names a profile it lands on, edges are drawn to profile sizes and adapter breakpoints unless Shift is held, the scale is frozen during the drag and refits on release, and the frame is never remounted. The handles are also sliders (arrow keys 1 px, Shift 10 px), a double-click returns to the profile's size, and the size travels in the link as `size=WxH`. Releasing on exactly a profile's size selects that profile. |
| Compare | One changing axis, two sides, each its own runtime. The axis is Theme, Profile or any scenario input the adapter declares; each side carries every other input the viewer chose. Side by side, Split (a handle on the seam, arrow keys in 5% steps; disabled with a reason on the Profile axis, where the sides differ in size) and Flip (Space). Nothing is shown while the pair is healthy; interacting with one side shows a warning with Reset both, until the sides match again. Details and the status follow the pair (Loading, Ready, Modified), never a previous view's state. Saved comparisons name their axis. |
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
| Size | DropdownMenu with a radio group, grouped by profile kind (Phone, Tablet, Laptop and desktop), plus a Custom entry after a drag | Dock | The trigger shows the profile's icon, name and pixel size. Choosing a profile closes the menu. Every surface that takes a profile (Compare's Profile axis, Present steps, Gallery, the link) reads the same adapter list, so a profile added to the catalog appears everywhere. |
| Zoom | DropdownMenu with a radio group | Dock | The trigger shows the current value. ⇧1 fit, ⇧0 actual size. |
| All steps | Popover with a list of the walkthrough's steps | Present player | Any step can be chosen, with problem steps marked. It works with the side panel closed and on a phone. |
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
| `--stage` | The grey surround: light in light appearance, dark in dark. Its text and the corner ticks keep 4.5:1 and 3:1 against it in both, and the two keylines keep any product edge at 3:1 whichever it is. |
| `--boundary-inner`, `--boundary`, `--tick` | Two keylines and corner ticks. In light appearance the keylines are white then dark and any product edge reaches 3:1 against one of them. In dark appearance the inner keyline is a faint white hairline (a solid white ring read as a heavy border): the corner ticks carry the 3:1 boundary and the hairline keeps a near-black or stage-matching product edge from being lost. |
| `--anchor` | Walkthrough highlight, drawn by the shell over the frame with the anchor's name. |
| `--success`, `--warning`, `--info`, `--danger` and their `-surface` pairs | Ready, modified or stale, draft or simulated, unresolved or failed. |
| `--fidelity-static` | Static captures. |
| `--dock-shadow`, `--ease-out-quint` | Floating surfaces and panel motion. |

Shell tokens never reach a preview, and product tokens never style the shell, even where names match. Product theme and Studio appearance are independent. Anything the Studio changes about product rendering, such as a forced font, is an adapter-declared presentation override listed in Details under Fidelity.

## Brand color

Neutral by default; an adapter can start on its product brand with `product.brandDefault`, and a viewer's own choice, including Neutral, still wins and is remembered. Studio settings offers the product's brand (from the adapter), five presets and any CSS color. It sets `--primary`, `--ring`, `--sidebar-primary` and `--sidebar-ring` with a foreground chosen for 4.5:1 contrast; in dark appearance the color is lifted to at least OKLCH lightness 0.72. It tints primary buttons, switches, focus rings, the rail marker and the mark. The stage, preview boundary, status and fidelity colors never change. It is stored per viewer and per Studio.

## Motion

Use the motion shadcn and Base UI ship, tuned for the Studio, and turn all of it off under reduced motion. Panels animate width over about 200 ms; Details pushes over 220 ms on the quint ease; a staged preview keeps the previous frame on screen with a "Staging new preview" badge and swaps only on ready; popovers fade and zoom from their trigger; a walkthrough step fades in from 98% scale; Gallery cards stagger by 30 ms and lift 2 px on hover; phone drawers follow the finger.

## Status and modified state

Status reads from the preview runtime: Loading, Ready, Capture, No capture, Did not start (with Retry), Showing previous settings (after a failed or timed-out change), Not designed, and Modified. Modified means a person changed product state in that runtime. Clicks and keys that change nothing do not count. It is a state, never a count of actions, and Reset clears it.

## Check the shell

`npm run acceptance` in the starter builds the Studio three ways (the example product, a stress adapter with 1,000 scenarios, 1,000 tokens and a 40-step walkthrough with four broken steps, and a capture-only adapter), serves them locally and measures AC-01 to AC-16 in headless Chromium. It needs Playwright (`npm i -D playwright` and `npx playwright install chromium`, or `PLAYWRIGHT_MODULE` pointing at an existing install). It prints each result, writes `acceptance-report.json` and exits non-zero on a failure. `ONLY=AC-03,AC-10` runs a subset. The stress and capture adapters build only when `VITE_STUDIO_ADAPTER` is set, and drop out of a normal build.

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
| AC-08 | For two to four sides the resolved inputs differ only in the named axis; interacting with one side changes no other side's state; more than four hands off to Gallery. | Met for two sides, on the Theme, Profile and each scenario-input axis, with Details following the pair. More than two sides and the Gallery hand-off are not built. |
| AC-09 | A static capture shows the static badge, disables product actions, back and live theme with a reason, and shows provenance. A missing capture is unavailable, never a substitute. | Met in a capture-only build. |
| AC-10 | With near-white, near-black, mid-grey, loud and shell-matching products in both Studio appearances, the frame is never lost: in light the frame edge reaches 3:1 against the product edge; in dark it reaches 1.3:1 (a deliberate hairline) and the four corner ticks reach 3:1 against the stage; and Details states the fidelity. | See the report: worst light and dark edge contrast across ten fixtures, and tick contrast, measured from screenshot pixels. |
| AC-11 | Whenever a preview is not at 100%, it states the rendered size and shown percentage (in Inspect the dock's Size and Zoom controls, elsewhere a chip under the frame), and 100% is one action away. | Met in Inspect, Compare, Present and Tokens. Gallery states its thumbnail scale and a card opens Inspect, where 100% is one action away. |
| AC-12 | The Gallery size control resizes the thumbnails under a pointer drag and under the keyboard, and its thumb stays visible. | Met: a drag enlarged the thumbnails, the keyboard shrank them, the thumb never hid. |
| AC-13 | The Size menu offers every adapter profile with its pixel size, and each mounts a frame of exactly that size. With `axes.resizable`, dragging the right edge or the bottom edge, or using the arrow keys on a handle, changes the live frame's size without reloading it, an edge within a few pixels of a profile size lands on it, releasing on a profile's size selects that profile, the size survives a reload through the link, and a double-click returns to the profile's size. | Met: all profiles mounted at their sizes; a drag, snap, landing on a profile, a reload and a reset all held with the same document alive. |
| AC-14 | In the walkthrough player, All steps lists every step and chooses one, with the side panel closed. | Met: the list held every step and the chosen step played. |
| AC-15 | On a phone the header actions fold behind one trigger and are inert while folded; opened, every action sits inside the screen with the title still readable, Esc folds them, and the product mark's tile stays square. | Met at 390 px with emulated touch. |
| AC-16 | The rail names its views under the icons by default on desktop, including for a viewer whose stored options predate the default; a viewer who turned the labels off keeps them off. | Met. |
