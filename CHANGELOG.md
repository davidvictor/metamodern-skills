# Changelog

## 1.16.1 — 2026-10-06

- Interface Studio 0.13.1 moves the component library to the top of the rail: its item now comes first, above the views, with a divider after it, and the workspace modules still follow the views after theirs. The item keeps its marker, inset focus ring, label and tooltip, Tab follows the new order, and the rail holds the item's place while it loads so the views do not shift. Go to lists the library's groups after Scenarios and before Views, so Scenarios stay first and the highlighted entry is still a scenario. The phone layout is unchanged: one place entry in the bottom bar, and the library after the modules in the Workspace drawer. A Studio without a library is unchanged.
- Keys typed into a field inside a preview frame stay there: on macOS, End (and Home and the page keys) in a library preview's text field scrolled the library page to its end, which unmounted and remounted the preview and lost its focus and text. On Apple platforms the frame client now cancels a scroll from those keys in a text field when nothing in the frame can take it, and makes Home and End caret moves; Shift+Home and Shift+End still select natively, and selects and listboxes keep their keys. LB-04 checks the page, caret and selection on every platform.
- LB-02 now checks the rail order, its dividers, the Tab order and Go to's group order. WS-01 and LB-01 measure the initial chunk against 0.13.0.

## 1.16.0 — 2026-10-06

- Interface Studio 0.13.0: library mode. A product can give its Studio a component library: one item below a second divider in the rail (after the workspace modules), and one documentation page per component with a centred documentation column of twelve fixed sections (Preview, When to use, When not to use, Usage, Examples, API reference, Keyboard, Accessibility, Motion, Responsive behavior, Performance, Notes for AI), live preview groups with Preview and Code tabs, Phone width and an expanded view, and a sidebar with On this page, a property playground and the preview theme. The adapter declares only the index (`library` with groups and components); each component's documentation is data in `src/library/`, a product folder the updater seeds with an empty `defineLibrary({})` and never changes, typed by `@studio/library` (`studio-library/1`) and loaded when its page opens. A Studio that declares no library looks, behaves and loads as before, and its build has no library chunk.
- Previews load only from the adapter's `library.entry` (or `frameEntry`) on the frame entry's origin, with `frameIsolation` and the usual origin, window and instance checks; documentation names scenarios and values, never a URL. One frame renders a whole preview group; a page keeps at most four frames live, mounting near the viewport. Playground values are validated against their declared properties and change in place for frames with `live-values`. Provenance and "Adjusted for <product>" marks are shown as text; code is highlighted as text with Copy. Groups may be static captures, so libraries work in offline exports.
- Links carry `library=`, `section=` and `theme=`; `library` is now a reserved link key. Go to lists components by group, the breadcrumb reads product, library, group and component, and Back steps between components. Acceptance adds LB-01 to LB-10 with a synthetic example library, and WS-01 and LB-01 measure the initial chunk against 0.12.2.

## 1.15.2 — 2026-10-04

- Interface Studio 0.12.2 fixes Present and Compare. Present's anchor label reaches 4.5:1 in dark appearance (it measured 2.4:1), stays whole inside the frame (above the highlight, below it, or inside its top edge, whichever fits) instead of disappearing above a tablet or phone frame, and in forced colors the highlight is drawn as a system-color outline. A Compare side's header is never wider than its preview, so on a tablet side B's header no longer runs off the stage.
- Acceptance adds AC-67 and AC-68, which measure the anchor label and highlight, AA text across Present and Compare, and whole Compare headers at 390, 768 and 1440 px in both appearances. WS-01 measures against 0.12.1.

## 1.15.1 — 2026-10-03

- Interface Studio 0.12.1 fixes core-shell shortfalls against its own touch and focus floors. On coarse pointers, stacked switches and checkboxes (Gallery areas, Present Autoplay, Responsive Sync) and the Responsive frame list's Remove buttons each keep their own 44 by 44 px target instead of sharing or losing hit area to a neighbour or the panel's edge handle, and a Design range's marks clear its thumb. Keyboard focus in the top bar's breadcrumb and on tab panels is drawn inside, so it is no longer cut to its corners, and a focused slider now outlines its thumb.
- Studio kit fixes, with no API change: on a phone the SaveBar's conflict message takes its own line instead of running under its actions, and a DataTable's hidden sort announcement stays inside the module page's scroller, so a long table no longer scrolls the whole Studio and its top bar away. Acceptance adds WS-10 for both.
- Acceptance adds AC-65, which probes each target's reachable area with `elementFromPoint`, and AC-66, which compares each focus stop's rendered pixels against its perimeter, at 390, 768 and 1440 px in both appearances. WS-01 measures against 0.12.0. The panel's edge handle and the resize grips are documented as equivalent-control allowances.

## 1.15.0 — 2026-10-03

- Interface Studio 0.12.0: workspace modules. A product can add its own tools beside the views, such as environment configuration, a schema explorer, email previews or translations, built from the shell's own components. The adapter declares them as data (`workspace.operations` and `workspace.modules` with icons, sections and the operations each may call); module code lives in `src/workspace/index.ts`, a product file the updater creates empty when it is missing and never changes. A declared module without a component opens to its reason, and a component the adapter does not declare fails the build by name. A Studio that declares no workspace looks, behaves and loads as before, and its build has no workspace chunk.
- The Studio UI kit `studio-kit/1` (`@studio/kit`): ModulePage, Section, Toolbar, Button, Field (text, select, switch, secret with reveal), PropertyList, DataTable (sort, filter, windowed), StatusTile, StatusBadge, SaveBar, ConfirmDialog, EmptyState and PreviewFrame (with the Studio's frame isolation, lifecycle and Retry), with icons and tokens, meeting the shell's target, text, contrast, focus, motion and forced-color floors in both appearances. `@studio/workspace` gives modules `defineWorkspace`, `useModule`, `useOperation` (same-origin JSON POSTs to declared operations, one envelope, compare-and-set with the current value on conflict), `useDirtyGuard` and `useModuleState`; lint keeps module code to these two surfaces, React and its own files. Without an operations host each module says why it is unavailable and nothing is simulated (a missing host stops only the module whose read found none); once a module has loaded, a lost host fails only that operation, so the open page and its unsaved edits stay.
- Modules follow the views in the rail after a divider, list their sections in the context panel, appear in the breadcrumb and Go to, travel in links as `module=` and `section=` (now reserved link keys), and add Back history; leaving unsaved changes asks first. On phones a Workspace entry opens a drawer of modules, and Details moves to the top bar when a workspace is declared. The updater seeds `src/workspace/`, reports a major kit change as Breaking and applies it only with `--accept-kit`.
- Saved layouts and states detect a save made elsewhere: `__studio/layouts` and `__studio/scenarios` answer `x-studio-revision`, a save sends `x-studio-expected-revision`, and a stale save gets 409 with the current file and writes nothing. The Studio loads the latest list, keeps the person's unsaved edits and says so. Layout saves wait until the page has read `layouts.json`, and neither list is saved over a file that is not valid (a GET of a file that is not JSON answers `x-studio-unreadable: 1`). Hosts and clients without the headers keep working as before.
- The core shell keeps its floors on tablets and touch screens: Present's narration bar lays out by its own width, the top bar truncates its breadcrumb and folds its actions on a narrow touch bar, the dock wraps instead of scrolling, Tokens stacks its stage under the table below 1024 px, and coarse pointers get 44 px targets and 16 px text fields at any width. Keyboard focus draws a 2 px outline at 3:1 or more in both appearances, including with a pale brand color (light `--ring` is now OKLCH 0.556), and the dark active rail label reaches 4.5:1. Retry in a preview that did not start mounts it again, and the stray `src/drag2-*.png` debug images are removed.
- Acceptance adds AC-61 to AC-64 and WS-01 to WS-09 (with WS-05b and WS-06b), using a synthetic example workspace and mock host. The initial Studio chunk's 3 KB gzipped budget is now per release, measured by WS-01 against 0.11.0.

## 1.14.0 — 2026-10-02

- Interface Studio 0.11.0: component properties. A scenario input with `section: "properties"` edits the selected named state from Details > Scenario > Properties without a remount: `switch`, `text` (`multiline`, `maxLength`, `shareable`), `number` and `choice` controls, `surfaces`, `curated` rows first with the rest under a collapsed All properties, `optional` rows with Set and Clear, and `readonly` rows with a note. A changed row shows Back to designed. Edits show as Edited · n properties, separate from Modified; R keeps them and Reset (n) in Properties clears them. A property ID that is one of the Studio's own link keys (`view`, `scenario`, `size` and the like) gets no row and is named in the console. A Studio that declares no properties is unchanged.
- `studio-preview/1` values may be booleans. Frames gain two optional capabilities: `live-values` (an `update` handler applies `values` in place; older frames, and frames whose update fails, are remounted) and `code` (`code-request` answered by `code`, shown with Copy in a Code tab beside a properties-bearing scenario in Inspect).
- Links carry property values under their input ID; free text travels only when `shareable`, otherwise the link says `edited=local`. Save as scenario writes named states to `scenarios.json` (`studio-scenarios/1`) through the dev server's guarded endpoint; saved states join the catalog marked Saved and can be saved again, renamed, duplicated and deleted, and a built Studio offers Copy as JSON. A switch, select, choice, or number or range with presets can be the Compare axis; Responsive frames carry the edits. Acceptance adds AC-53 to AC-60.
- Adapters can declare `frameIsolation` (`sandbox`, `credentialless`) for every preview frame, and a Design font set to a generic family (`system-ui`, `serif` and the like) is no longer quoted and requests no web font.
- For every Studio, an empty range value in a link (such as `?clock=`) now reads as unset rather than 0. The frame client applies value updates in order and only the newest. Saving a state rewrites only the entries it changes and keeps every other entry in `scenarios.json` as stored. Present mounts each step afresh.

## 1.13.1 — 2026-10-02

- Interface Studio 0.10.2 fixes review findings in 0.10.1. Design values follow each theme's own default: a shared value travels in a link whenever it differs from any theme's default, so the link shows the same design in every theme, and the type specimen and per-theme drafts no longer treat a theme's as-built value as a change. Saved values equal to the plain default are kept after a reload.
- Present no longer fails on a walkthrough with no steps. The presenter editor shows current names and narration each time it opens, the overlay import accepts the same file twice, and playlist playback follows walkthrough edits.
- Compare keeps sides A and B consistent with their selectors, swaps two sides instead of showing one value twice, keeps at most four saved values, and shows no more sides than an axis has values; an axis with fewer than two values is explained instead of loading. A range input never sends a value above its maximum, and a frame whose diagnostics fail still becomes ready.

## 1.13.0 — 2026-10-02

- Interface Studio 0.10.0: scenario inputs can be numeric ranges with bounds, steps, named marks and time formatting, and values reach the frame as strings or finite numbers. Design parameters can be `enum` or `range`, scoped to themes with `defaultsByTheme`, and sent to a live frame through `apply.input` (`MountInputs.design`); drafts are kept per theme or visual variant.
- Walkthrough steps take stable `id`, `values`, `duration` and `hidden`. Presenter edits (narration, goals, timing, hidden steps) are a browser overlay with import and export that never alters generated adapter material. Saved comparisons can hold up to four `values` on one axis. Frames can report `diagnostics()` rows, shown with their budgets in Details as review evidence.
- Interface Studio 0.10.1: profiles declare `frameRadius`, and phone and tablet boundaries scale continuously with zoom in every view (tablets default to 28 px; phones 44 px and desktops 8 px as before). A presentation can omit the optional fidelity badge in the top bar; fidelity stays in Details.

## 1.12.0 — 2026-09-30

- Add Plan, Execute, Fix and Review Development as four focused skills. They translate conversational direction into outcome briefs and appropriately sized, normally sequential delivery worktrees while preserving project-required tests, independent review, resource isolation and release authority.
- Initiate Engineering 0.1.2 hands prepared tasks into the development method without another initiation pass. The four helpers can be used independently and load only the operation needed.

## 1.11.1 — 2026-09-29

- Interface Studio 0.9.1: frames in the Responsive row drag. A label drag places the frame where it is dropped (it follows the pointer, the others stay, its page is not reloaded), the zoom holds while the stage grows to reach every frame, and the places are kept in the viewer's browser and the link. Alt and an arrow on a label moves it 8 px (64 with Shift); the Frames list still reorders. An icon in the Responsive toolbar puts the frames back in a row.
- Resize handles hug each frame rather than its label column, and keep their size on screen: grips follow the frame's size (12 to 40 px) and on the canvas are counter-scaled against the zoom. Acceptance rewrites AC-22 and adds AC-52.

## 1.11.0 — 2026-09-29

- Interface Studio 0.9.0: one stage navigation in Inspect, Compare, Design and Responsive. Scroll pans, and over a frame the page scrolls first and hands the stage what it cannot use; ⌘ or Ctrl with the wheel, or a pinch, zooms at the pointer over frames too (10% to 400%), without the browser zooming the tab; Space and a drag, or a middle drag, pans; + and − step. `studio-preview/1` gains the `stage-gestures` capability and a `gesture` message; `{ gestures: false }` opts a preview out.
- The dock's zoom control is the one zoom everywhere: Zoom in and out, Fit, 50%, 100%, Show map on the canvas, and a line naming the gestures. The Responsive scale chip and the canvas zoom chip and buttons are gone; Tidy moved to the Responsive toolbar; the minimap is off until asked for.
- A Design menu in the dock holds Contrast and the `design` group of lenses (such as density), with a way into the Design view. Themes pair with high-contrast versions through `contrastOf`; the dock then shows only the standard themes. Token values for a contrast theme without its own column come from its standard theme.
- The frame's outer line in light drops from 60% to 14% black; the corner ticks still carry the edge at 3:1. Acceptance adds AC-49 to AC-51; AC-10, 11, 19, 34 and 43 follow the new controls.

## 1.10.1 — 2026-09-29

- Interface Studio 0.8.1: `vite.config.ts` passes `npm run lint` (a useless assignment in the layouts endpoint). Found by the shell updater's checks on a real Studio.

## 1.10.0 — 2026-09-29

- Interface Studio 0.8.0: the Responsive view shows one scenario at several sizes, each frame its own runtime. Presets (the adapter's, then Phones; Phone, tablet, laptop; Desktops) and layouts saved in the Studio's `layouts.json` (`studio-layouts/1`, written only by the dev server: same-origin, schema-checked, 256 KB, atomic; a published Studio reads it). Frames are added from profiles, devices or a typed size, removed, reordered by pointer or Alt and an arrow, resized with the Inspect handles, reset and opened in Inspect; at most six. Unsaved edits stay per viewer and travel in the link.
- Row shows frames at one shared scale; Full page grows each to its content through a new `content-size` message, detects pages that size themselves to the window, and cuts at 16,384 px. Canvas (React Flow 12, code split) places frames freely with pan, zoom from 10% to 200%, labels outside the zoom as the only drag handle, a shield so the product keeps its own wheel and clicks, 8 px snapping, keys, multi-select, Tidy, a minimap and a saved viewport.
- Sync repeats scrolling, clicks and typing, and navigation across frames, all on for a new layout. `studio-preview/1` gains capabilities and `sync`, `interaction` and `replay` messages; the frame client reports only trusted input and replays synthetically, so loops cannot start; targets resolve by anchor, sync ID, ID, test ID, role and name, then path, and a follower that cannot resolve says Out of sync. Typing sends final values, IME included; password, file and `data-studio-private` fields are never sent. An optional `navigate` handler lets navigation follow directly; `{ sync: false }` keeps a preview out.
- The Design view's type specimen now appears only when a type setting changes. Acceptance adds AC-18 to AC-42; all forty-eight criteria are measured by `npm run acceptance`.

## 1.9.0 — 2026-09-29

- Interface Studio 0.7.0: the Tokens view grows into the Design view, with Adjust and Tokens tabs over one draft layer (a hand-edited token wins over what Adjust generates; old `view=tokens` links open the Tokens tab). Adapters declare `design.parameters` of five kinds: `scale` with marks at the modes a product ships (the slider interpolates their token values), floors, exclusions and size warnings; `ratio` for a type scale; `font` from Google Fonts only; `color` with derived tokens and contrast warnings against the product's own tokens; and `temperature` for neutrals. Parameters that touch the same token compose in order. Any parameter can write tokens a product reads under a wrapper as a scoped rule (`scope`), supply values for tokens outside the token source (`base`, such as a framework's `--spacing`), derive per theme, and list what it cannot reach (`wontFollow`). These came from probing a real product, where density tokens are shadowed by a wrapper and font tokens do not reach utility classes. The stage shows As built, Draft or both, with a Draft design badge, hold to see as built, and a type specimen; values travel in the link; a list says what changes, what is missing and what will not follow.
- A per-viewer switch, off by default, shows the draft in Inspect, Gallery and Compare, always badged, and Compare gains a Design axis; Present never shows a draft. Save as variant downloads token overrides per appearance for a Studio's variants folder, and Export downloads the draft as a CSS or JSON token diff.
- Scenarios declare `supports`, the options of an input they can render, so a product's shipped modes (such as density) work as a dock lens that never offers a mode the screen ignores. The example's density becomes a lens.
- `studio-preview/1` stays compatible: `hello` announces `capabilities` (`draft-css`), and `mount` and `draft-overrides` carry optional `css` and `stylesheets`, which the frame client applies (fonts only from `fonts.googleapis.com`). A preview whose frame client predates it says the fonts did not apply.
- Acceptance adds AC-43 to AC-48. The package test now checks that no file in the skill names a client.

## 1.8.0 — 2026-09-29

- Interface Studio 0.6.0: Studios in use can take new shell releases. `scripts/update-studio.mjs` creates a Studio from the starter (`--create`) with a `studio-shell.lock.json` of shell file fingerprints, then reports and applies updates: unedited shell files are replaced, added or deleted; product files (`src/adapter.ts`, `studio.config.ts`, the product adapter, `layouts.json`, anything not from the starter) are never written; a local edit to a shell file blocks until it is replaced or kept with a reason; optional starter files deleted on purpose stay deleted; `package.json` is merged by rule; and an applied update runs install, typecheck, lint, build and, when it can, acceptance. Studios made from 0.2.0 to 0.5.0 are adopted with `--adopt` against `assets/studio-shell.releases.json`, the fingerprints of every released shell.
- The starter separates product settings from shell files: a new product-owned `studio.config.ts` sets the title, output folder and extra pages; `vite.config.ts` reads it and reaches the acceptance adapters itself, so `src/adapter.ts` is one export; `index.html` asks search engines not to index a Studio; `UPDATING.md` lists what a product does by hand per version. New guide `references/updating.md`. Tested by UP-01 to UP-10 in `tests/interface-studio-update.test.mjs`, and by adopting a copy of a real product Studio made from 0.5.0.

## 1.7.0 — 2026-09-29

- Interface Studio 0.5.0: scenario inputs can be dock lenses. An input with `placement: "dock"` (such as Role) sits in the dock with its icon and current value; the scenario's own value (`Scenario.designed`) is marked Designed, another choice shows a dot and offers Back, and the choice travels in the link. `scoped` inputs apply only to scenarios that design a value, so their control, their Compare axis and their value are absent elsewhere. The shell sends resolved values to the frame. Present ignores dock choices and plays every step as designed.
- The shell guide now says product development chrome inside a preview (a development strip, a role picker, catalogue links) is replaced in the frame build and declared as a presentation override, never edited in product source. The example's role is a scoped dock lens. Acceptance adds AC-17; all seventeen pass for the starter.

## 1.6.1 — 2026-09-29

- Interface Studio 0.4.1: remove the caption above the preview. It repeated the dock and Details. Fidelity is stated in Details (and in the top bar for static captures and recreations), Inspect's Zoom control states the shown scale ("Fit · 54%") beside the Size control's pixels, and other views keep a size chip under the frame.
- Labels under the rail icons are on by default on desktop; only a viewer's explicit choice is stored, so older stored options do not keep them off. Acceptance grows to AC-01 to AC-16 and AC-10, AC-11 and the walkthrough-exit focus check follow the new layout. All sixteen pass for the starter.

## 1.6.0 — 2026-09-29

- Interface Studio 0.4.0: profiles become a range of sizes. The dock's profile icons become one Size menu grouped by profile kind (phone, tablet, laptop, desktop), and with a live frame and `axes.resizable` Inspect's frame can be dragged by its right edge, bottom edge or corner to any size. Edges snap to profile sizes and adapter breakpoints, the scale is frozen during a drag, a readout names the profile a drag lands on, the size travels in the link, the handles are keyboard sliders, and a double-click returns to the profile. The frame is resized in place, so a product must lay itself out from its own viewport.
- Fix the Gallery size slider under a pointer drag (Base UI passes a number, not an array). Compare gains Profile and scenario-input axes and reports the pair's state instead of a stale Loading. Add `axes.defaultProfile`, `product.brandDefault` and an optional `product.markSvg` drawn on a solid brand tile.
- The walkthrough player's All steps opens a step list that works with the side panel closed. On a phone the header actions fold behind one trigger that slides them out, and the mark's tile stays square. In dark appearance the frame's inner keyline is a faint hairline; corner ticks carry the 3:1 boundary.
- Acceptance grows to AC-01 to AC-15 (AC-10 now measures light and dark separately, and adds AC-12 Gallery zoom, AC-13 size and resize, AC-14 All steps, AC-15 phone header). All fifteen pass for the starter; swipe, real devices, more than two Compare sides, and real-product integration remain unverified.

## 1.5.0 — 2026-09-28

- Interface Studio 0.3.0: the shell starter now meets its own scale criteria. The catalog and walkthrough step list are windowed lists with one tab stop, arrow keys and type-ahead; the token grid is windowed and folds families over 60; walkthroughs past 24 steps use one progress bar with marks for broken steps and an All steps list.
- Every preview states its size and percentage with a Fit or 100% action; the frame edge uses two keylines so any product edge stays visible; controls reach 44 px on coarse pointers; Exit returns focus to what opened Present.
- Add `npm run acceptance`, a Playwright script that builds the starter with a 1,000-scenario stress adapter and a capture-only adapter and measures AC-01 to AC-11. All eleven pass for the starter; swipe, real devices, more than two Compare sides, and real-product integration remain unverified.

## 1.4.0 — 2026-09-28

- Add a product-neutral Studio shell starter to Interface Studio 0.2.0 in `assets/studio-shell`: a grey review stage, icon rail with contextual panels, and Inspect, Compare, Gallery, Present, and Tokens views on shadcn 4.21 (Base UI, Rhea style).
- Connect products through one adapter declaration and the studio-preview/1 frame protocol, with a framework-free client for the product's preview entry, staged swaps, timeouts, isolated runtimes per preview, live token drafts, and walkthrough command replay with anchors.
- Add a Studio brand color that tints only Studio accents, and treat Modified as a state set by real product changes rather than a count of clicks.
- Add the shell and frame protocol references, shell acceptance criteria with the starter's current status, and a synthetic example product. Real-application integration, native runtime, hosted publication, and user acceptance remain unverified.

## 1.3.0 — 2026-09-28

- Add Interface Studio 0.1.0 for Inspect, Build, Update, Verify, Prepare, and Publish workflows around existing application interfaces.
- Define portable manifest, presenter ownership, deterministic scenario, target fidelity, update reconciliation, presentation, and verification contracts.
- Add a read-only manifest validator with 12 regression tests and document installation and usage for Codex and Claude Code.
- Validate the method in an isolated synthetic web example; native runtime, real-application integration, hosted publication, and user acceptance remain unverified.

## 1.2.0 — 2026-09-26

- Add Prompt Learn mode for explicit local knowledge saving, research, correction, inspection, and removal.
- Discover relevant personal and project references outside installed packages, preserving knowledge across supported updates and reinstalls.
- Document scope, provenance, conflict handling, backup/sharing, and Codex-only project installation.
- Add installer preservation coverage and independent save/retrieval checks. Writing remains at 0.1.3.

## 1.1.0 — 2026-09-26

- Expand Prompt to version 1.1.0 with eight source-backed domain references: UI design, front-end development, back-end/API design, domain and data modeling, automotive design, automotive engineering, copywriting, and marketing.
- Add selective domain routing and connections between interface behavior, APIs, data rules, vehicle design/engineering, and marketing/copy.
- Preserve the four existing prompt modes and their scope boundaries. Writing remains at version 0.1.3.
- Add domain evaluation cases and package-discovery checks.

## 1.0.0 — 2026-09-26

First public release of the 13 Metamodern skills.

- Publish one canonical collection with independent package versions and selective Codex/Claude Code installation.
- Include Prompt's Clarify, Expand, Combine, and Prepare modes plus Review, Focus, Split, and Shorten.
- Replace personal authority and private source assumptions with the requesting user's own project context and approvals.
- Keep client examples, private design-file identifiers, account-specific consent, and third-party paid works outside this release.
- Add package validation, isolated installer regression coverage, writing-preservation checks, and GitHub CI.

The Agency repository consumes this collection as a pinned submodule. The earlier Articulate Intent and Expand Intent packages are replaced by `metamodern-shape-prompt`; see the README for migration and update commands.
