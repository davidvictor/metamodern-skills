# Adapter declaration and frame protocol

Read this when connecting a product to the [shell](shell.md), or when a preview does not start. It makes the [adapter contract](adapters.md) concrete for the starter: one data declaration the shell reads, and one message protocol between the shell and each preview runtime. The shell imports no product code, and the product imports no shell code except the small, framework-free frame client.

## The adapter declaration

`src/adapter.ts` exports one `StudioAdapter` (types in `src/studio/types.ts`). Generate it from the manifest and runtime catalog; do not hand-copy product facts into shell components.

| Field | Contents |
| --- | --- |
| `id`, `version`, `protocol` | Stable Studio identity, adapter version, and `"studio-preview/1"`. |
| `product` | Name, a two-letter mark, an optional `markSvg` (`viewBox` and path data, drawn in the tile's foreground color instead of the letters), the source revision, an optional brand color offered in Studio settings, and `brandDefault` to start on it instead of neutral. |
| `target` | Platform, fidelity class (`actual`, `actual-substituted`, `instrumented-native`, `static-capture`, `recreation`), the label shown in Details (and in the top bar for static captures and recreations), and a mode with a reason for each of rendering, behavior, navigation, data and operating system. |
| `frameEntry`, `frameOrigin` | URL of the product's isolated preview document, and its origin when it differs from the Studio's. Omit `frameEntry` for a capture-only Studio. |
| `axes` | The theme axis label and values (each with the appearance of its product ground, and for a high-contrast theme `contrastOf`, the theme it is the contrast version of: the dock then shows the standard themes and offers Contrast in its Design menu), profiles with pixel sizes and a kind (`phone`, `tablet`, `laptop` or `desktop`, which groups and icons the Size menu), scenario inputs with options, an optional default, `placement` (`details` or `dock`), `group: "design"` for a dock input that belongs in the dock's Design menu (such as density), `scoped` and an `icon` (`person`, `density` or `sliders`), an optional `defaultProfile` that opens on every screen size, an optional `resizable` (`min`, `max` and `snapWidths`) that lets Inspect and the Responsive view drag a live frame to any size in that range, and an optional `responsive` with the product's own `presets` (frames by size and kind, or a named profile), `replaceShellPresets`, and extra `devices` for Add frame. |
| `areas`, `scenarios` | Stable IDs, labels, surface and state, optional parent for nested variants, fixture ID, version and provenance, source, clock, status (`stale`, `unresolved`, `later`), optional captures keyed `theme:profile`, `designed` values for scenario inputs (such as `{ role: "viewer" }`), `supports` listing the options of an input the scenario can render (such as `{ density: ["default", "compact"] }`; only those are offered, and an input with one supported option shows no control), and independent design, delivery and evidence statuses. |
| `walkthroughs` | Steps with a scenario, optional theme and profile, product commands to replay, an optional anchor, narration and the expected outcome. |
| `comparisons` | Saved pairs on one axis: `theme` (the default), `profile`, or a scenario input's ID, with the two option IDs. |
| `tokens` | Optional: source, the two theme columns, product grounds, families with counts, total, and tokens with values per theme, read counts and flags (`unread`, `literal`, `coupled`). |
| `design` | Optional parameters for the Design view's Adjust tab: `scale` (multiplies lengths in the tokens it names or globs, with optional `stops` at the modes the product ships, whose `values` the slider interpolates, `floor`, `exclude`, `unitless` and `warnBelow`), `ratio` (a type scale over tokens with their `steps`), `font` (a typeface set into tokens and, where utilities bake fonts in, a `css` rule; Google Fonts only), `color` (`set`, `derive` expressions using `$value`, and `contrast` against the product's own tokens) and `temperature` (tints neutral tokens warm or cool). Parameters that touch the same token compose in declaration order. Any parameter may also give `scope` (tokens the product reads under a selector, such as a density wrapper; their values go out as a CSS rule), `base` (values for tokens outside the token source, such as a framework's `--spacing`), `wontFollow` (what it cannot reach, listed for the viewer), and for `derive` one expression per theme ID. Declare only levers a probe showed move the product. |
| `presentationOverrides` | Anything the Studio changes about product rendering, listed in Details under Fidelity. |

Selection is stored in the URL hash as stable IDs only: view, scenario, theme and profile, plus dock choices, the Design tab and Design values (`design=density:0.9;body-font:Inter`), and for Responsive the layout ID with any unsaved frames (`frames=390x844:phone,834x1112:tablet@480.0`), `height=full`, `arrange=canvas`, the canvas viewport (`vp=x_y_zoom`) and the sync channels when not all are on. Never put fixture values in it.

## studio-preview/1

Every message is a plain object with `protocol: "studio-preview/1"` and the frame `instance`. Requests and their answers carry a `requestId`. The shell names each frame with its instance, so the frame reads its own instance from `window.name`.

| Direction | Message | Meaning |
| --- | --- | --- |
| frame to shell | `hello { capabilities }` | The frame loaded and can receive a mount. `capabilities` lists what the frame client supports beyond the base protocol: `draft-css` (draft CSS rules and font stylesheets), `content-size` (full-page height), `sync-scroll`, `sync-interaction` and `sync-navigation` (Responsive sync; navigation only with a `navigate` handler), and `stage-gestures` (stage navigation that starts over the frame). An older frame sends fewer or none, and the shell says what it cannot do. |
| shell to frame | `mount { inputs }` | Materialize one scenario from scratch: scenario, theme, profile, input values, commands to replay, draft tokens, and optional draft `css` and `stylesheets`. |
| frame to shell | `ready { fingerprint, appearance, location, canGoBack, anchors }` | State, navigation and commands are applied and rendering has settled. The fingerprint is a digest of the resolved inputs, or of whatever the product's optional `fingerprint` handler returns (a product frame can add the visible text and location, as the scenario contract asks). |
| frame to shell | `error { operation, recoverable, reason }` | A mount or operation failed. The reason is safe to show; it never contains fixture secrets. |
| shell to frame | `command { command }` | Run one product command through the application's own path. |
| shell to frame | `product-back` | Go back in the preview's own history. |
| shell to frame | `draft-overrides { tokens, css, stylesheets }` | Apply the draft without a remount: token values, and optionally CSS rules for what tokens cannot reach and font stylesheets. The frame client loads stylesheets only from `https://fonts.googleapis.com/css2`. A frame without `draft-css` ignores the extra fields, and the preview says the fonts did not apply. |
| frame to shell | `reply { ok, reason }` | The answer to a command, back or draft request. |
| frame to shell | `navigated { location, canGoBack, anchors }` | Product navigation or overlay state changed. |
| frame to shell | `modified` | Sent once per runtime, when a person first changes product state. |
| frame to shell | `content-size { height }` | The document's content height, after ready and whenever it settles at a new value. The Responsive view grows full-page frames to it. |
| shell to frame | `sync { channels }` | Which interactions to report (`scroll`, `interaction`, `navigation`). A frame reports nothing until asked. |
| frame to shell | `interaction { event }` | A person's scroll, click, typed value, form submit or navigation, for the shell to replay in the other frames of a Responsive layout. |
| shell to frame | `replay { event }` | Repeat another frame's interaction here. The reply says when a target could not be found; nothing is clicked in its place. |
| frame to shell | `gesture { gesture }` | Stage navigation that began over the frame: `wheel { zoom, dx, dy, x, y }` (with ⌘, Ctrl or a pinch it zooms; otherwise it is only the part of a scroll the page could not use), `drag { dx, dy }` for a middle-button drag in screen pixels, and `space { down }` while Space is held outside a field or control. The shell applies it to the stage around the frame. |

Both sides check the message's origin and sending window before reading anything else. The shell accepts messages only from its own frame elements at the declared frame origin; the frame accepts messages only from its parent at an allowed origin and only for its own instance. A late `ready` for an older request is ignored.

## Lifecycle in the shell

The preview host (`src/studio/live-preview.tsx`) mounts one frame per runtime. Any input change mounts a new frame behind the current one and swaps only when the new one reports ready, then removes the old frame. If the new frame reports an error, or sends no ready signal within 20 seconds, the previous preview stays on screen marked "Showing previous settings" with the reason; with no previous preview the frame shows the error and Retry. Reset mounts a fresh runtime from the same scenario. `mount` carries resolved values: the viewer's choice, else the scenario's designed value, else the input's default; an input the scenario does not use is not sent. Dragging the Inspect frame does not mount anything: the shell changes the frame element's width and height, so the product must lay itself out from its own viewport (CSS breakpoints, `matchMedia`, `resize` events) and must not take its size from the `mount` message. The profile ID still decides input context. Draft tokens never remount. Each Compare side and each Gallery thumbnail is its own runtime; Gallery thumbnails exist only while near the viewport. If product code focuses a field during mount, the host returns keyboard focus to the Studio so its shortcuts keep working.

## The product side

The product adds one preview entry: a route, page or recreation document that renders a single scenario in isolation, with fixtures injected at its existing seams. It calls `connectStudioFrame` from `src/studio/frame-client.ts` once. Copy that file into the product or import it; it has no dependencies.

```ts
const frame = connectStudioFrame({
  mount: (inputs) => ({ appearance: "light", location: "/tasks" }),
  command: (id) => runProductCommand(id),
  back: () => productHistory.back(),
  canGoBack: () => productHistory.length > 1,
  location: () => currentRoute(),
})
```

- `mount` builds the scenario from scratch and returns the appearance of the product ground and its location. Throw for a scenario the entry cannot render.
- `command` runs the application's own action. Throw for an unknown command; the step that needed it stops with the reason.
- Mark semantic anchors in product markup with `data-studio-anchor="id"` and, where the text is not a good name, `data-studio-anchor-label`. The client reports visible anchors with their rectangles; the shell draws the highlight on its own layer.
- Call `frame.notifyNavigated()` after product navigation or overlay changes the Studio did not request.
- Draft tokens default to custom properties on the root element. Pass `applyTokens` when the product's tokens live elsewhere.
- For Responsive sync, the client reports only trusted input and replays with synthetic events, so loops cannot start. It finds a target by `data-studio-anchor`, then `data-studio-sync`, the element ID, `data-testid`, role and accessible name, then a DOM path; add `data-studio-sync="id"` where none of those is stable across layouts. Mark nested scrolling regions with `data-studio-scroll="id"`. Password fields, file inputs and anything inside `data-studio-private` are never reported. Pass `navigate(location)` so product navigation can follow directly; without it navigation follows only through synced clicks. Pass `{ sync: false }` as the second argument to keep a preview out of sync.
- Stage navigation works over the frame by default: the client keeps every scroll the page can use and hands the Studio the rest, turns ⌘ or Ctrl with the wheel and pinches into stage zoom (so the browser never zooms the tab), and reports Space held and middle-button drags. Space is left to fields and controls. Pass `{ gestures: false }` to keep every wheel, pinch and Space press in the page.
- `settle` defaults to fonts plus two animation frames. Pass one that waits for required assets and controlled asynchronous work, so ready means ready.
- Modified is detected for you: a trusted pointer or key event arms a short window, and only a DOM change or product navigation inside it marks the runtime modified, once. Studio mounts and commands never arm it. Call `frame.markModified()` for state the DOM does not show, such as a canvas.

Opened outside the Studio, the preview entry should still render a default scenario so developers can load it directly.

## Capture-only Studios

Omit `frameEntry` and supply `captures` on scenarios with their provenance. The shell shows the capture, labels it static, disables product back and product commands, disables theme and profile values with no recorded capture, and shows an explicit empty state for a missing combination. A walkthrough step that needs commands stops with the reason. A native instrumented stream that is not a web page needs its own host behind the same handle contract; keep the declaration and the shell unchanged.
