# Board language and board messages (contract 2)

Board language version 1. This file is the source for contract 2. The runtime that runs it is [`assets/runtime/support.js`](../assets/runtime/support.js), written from scratch from the boards themselves: no hosted canvas runtime was opened or copied. The fixture boards in [`assets/fixture-project`](../assets/fixture-project/canvases/fixture/project/canvas.json) use every construct and control shape below.

## What existing boards use

Counted on 2026-10-20 across two sets of existing boards that must run unchanged:

- **Set A:** 8 boards from an earlier kit trial (a five-board starter canvas and a three-option exploration).
- **Set B:** 1,279 boards in 12 canvases of one design repository.

| Construct | Set A uses (boards) | Set B uses (boards) |
| --- | --- | --- |
| `<x-dc>` board root | 8 (8) | 1,279 (1,279) |
| `<helmet>` head content, only `<style>` inside | 8 (8) | 1,279 (1,279) |
| `<x-import component-from-global-scope>` | 149 (8) | 7,786 (434) |
| `<dc-import name>` another board of the same project | 0 | 1,906 (174) |
| `<sc-if value>` | 2 (1) | 688 (18) |
| `<sc-for list as>` | 11 (7) | 165 (15) |
| `{{name}}` | 52 | 8,472 |
| `{{a.b}}` | 46 | 901 |
| `{{ literal }}` (`true`, `false`, numbers) | 3 | 688 |
| `<script type="text/x-dc" data-dc-script data-props>` with `class Component extends DCLogic` | 8 (8) | 1,279 (1,279) |

No board uses any other expression, an `else` construct, a script inside `<x-dc>`, or `{{}}` inside a stylesheet.

**Head loads.** Every board loads `./support.js` first. After it come, in any mix: relative stylesheets (1,799 uses), the kit's `ds/<ns>/components/bundle.css` and `bundle.js` (733 and 746 boards), and a second kit pair `ds/<ns>/components/scenes.css` and `scenes.js` (217 boards). 520 boards load no kit at all. Kit folders are named in lowercase (`ds/<namespace in lowercase>/`).

**Attribute forms on `<x-import>`.** Literal strings (15,733), a whole `{{value}}` (7,172), a whole `{{ literal }}` (3), and text mixed with values (4). Names are kebab-case (`default-value`, `on-change`, `title-hidden`), plus `class`, `style` (6), `aria-*` and `data-*`. No bare attribute appears; the contract's rule that a bare attribute means `true` still holds.

**Attribute forms on `<dc-import>`.** Literal strings (14,696), empty values (483, such as `words=""`) and whole values (69), always with `hint-size`.

**Plain markup.** HTML and SVG elements with literal attributes; values in `class`, `style`, `src`, `fill` and other attributes; SVG with camelCase attributes (`viewBox`, `pathLength`, `preserveAspectRatio`); camelCase event attributes on plain elements (`onClick` 45, `onPointerDown`, `onPointerUp`, `onPointerLeave`) whose value is a function from `renderVals()`; images whose `src` is a value inside a loop.

**Logic.** `renderVals()` (every board), `this.props` (198 boards), `this.state` and `this.setState` with an object, an updater or a callback (6 boards), `constructor(p) { super(p) }`, `componentDidMount`, `componentDidUpdate(prevProps)`, `componentWillUnmount`, own helper methods, timers, `window.<namespace>` sample data, and functions returned from `renderVals()` used as event handlers.

### Control shapes in `data-props`

| Shape | Set A | Set B |
| --- | --- | --- |
| `{"editor": "enum", "options": [strings], "default": string}` | 23 | 52 |
| the same with `"section": string` | 0 | 200 |
| `{"editor": "boolean", "default": boolean}` | 1 | 4 |
| the same with `"section"` | 0 | 2 |
| `{"editor": "int", "default": number, "min": number, "max": number, "section"}` | 0 | 4 |
| `{"editor": "text", "default": string, "section"}` | 0 | 3 |
| `"$preview": {"width": number, "height": number}` | 8 | 1,279 |

Every enum default is one of its options. A `<dc-import>` may still pass a value outside the imported board's options; it is kept as given.

## Behaviour

**Document.** `support.js` runs first and takes over the rest of the document (it writes a `<plaintext>` element), so the board source is read as inert text: nothing in it loads or runs until the runtime decides. It then loads the head in order, waiting for each stylesheet and script. Before the first file from `ds/<folder>/` it reads `ds/<folder>/kit.json`; for a legacy kit (contract 3) it first loads React 18.3.1, ReactDOM 18.3.1 and `react-markup.js` from `support/`. Each file loads once per page. `<helmet>` children go into the head after the head's own content. Attributes on `<html>` and `<body>` are kept.

**`{{ }}` values.** An expression is a name, a dotted path, `true`, `false`, `null`, a number or a quoted string. Names resolve against the board's current props, overridden by the values `renderVals()` returns; inside `<sc-for>` the loop variable and `$index` are added. An attribute or text that is only `{{x}}` keeps the value's type (an object, a function, a number); mixed with text, values become strings, and `null`, `undefined` and booleans become empty. A missing path is `undefined`.

**Text.** Whitespace follows JSX: a run of whitespace that contains a line break is dropped, lines are trimmed where they meet a line break, and text on one line keeps its spaces. Booleans, `null` and `undefined` render nothing.

**`<x-import component-from-global-scope="Ns.Path" ...>`.** Mounts the component at that dotted path on `window` (any depth, such as `Ns.Screens.Work`). Attributes become props: kebab-case to camelCase, `class` to `className`, `for` to `htmlFor`, `aria-*` and `data-*` as written, `hint-*` ignored. A literal stays a string, an empty or bare attribute is `true`, and a whole value keeps its type. `style` does not become a prop: it places a wrapper `<div>` with that style around the component. Content becomes `children`: one child is passed as itself, several as an array, and leading and trailing whitespace at the edges is trimmed.

**Mounting.** Markup outside any component is drawn as plain DOM by the runtime and patched in place on each render. Each outermost `<x-import>` gets a host element (`<x-import data-canvas-import="Ns.Path" style="display: contents">`, or the wrapper `<div>`) and is mounted with the kit's `mount(host, "Path", props)` (contract 3), with nested markup as markup nodes in `props.children`. Mounting the same host again updates it in place. A legacy kit is mounted by the runtime's own `mount` on the page's React 18. A component that is missing or fails shows an error in its host and logs a console error.

**`<dc-import name="X" ...>`.** Renders the board `X.dc.html` from the same `project/` folder inline, with its own logic and `data-props`. Its head and `<helmet>` load once. Attributes become its props (kebab-case to camelCase, `hint-*` ignored), over its defaults, converted by its control types: `int` and number editors read numbers, `boolean` reads `""` and `"true"` as `true` and `"false"` as `false`, and other editors keep strings. Each imported board keeps its own instance and state for as long as it stays in place.

**`<sc-for list="{{items}}" as="item">`.** Repeats its content for each item of an array (or each value of an object), adding `item` and `$index`. `hint-placeholder-count` is ignored.

**`<sc-if value="{{x}}">`.** Renders its content when the value is truthy. `hint-placeholder-val` is ignored. It also works inside `<svg>`.

**Logic.** The class is compiled once per board file with `DCLogic` in scope. `DCLogic` gives `this.props`, `this.state` (`{}` until set), `setState(objectOrUpdater, callback?)`, which applies at once and renders in the next microtask (callbacks run after that render), and `forceUpdate(callback?)`. After a render, new instances get `componentDidMount()`, kept ones `componentDidUpdate(prevProps, prevState)`, and removed ones `componentWillUnmount()`, innermost first.

**Props.** A board's props start as its `data-props` defaults, then the `canvas-props` query value of its link (JSON), then `canvas:set-props` messages.

**Events.** A function value on a plain element's `on...` attribute becomes that event's listener (`onClick` is read as `click`); a non-function value on an `on...` attribute is ignored.

## Stable labels

Comments attach to elements by the first label found, in this order (the label forms are in [comments.md](comments.md#stable-labels)):

1. `data-canvas-id`, which builder scripts put on the sections and elements they generate;
2. `data-kit-component="<Name>"` plus its position among siblings, which kit components render on their root;
3. `data-test` or `data-testid`;
4. a CSS path, as the last resort.

## Messages between board and viewer

Messages go over `postMessage` on the board's own origin, and the runtime accepts only messages from its parent window on that origin. Every message is `{type, board, ...}`, where `board` is the file name without `.dc.html`.

| Direction | Type | Payload |
| --- | --- | --- |
| board to viewer | `canvas:ready` | `{props: <data-props schema>, values, kit: {mode, ref, version}}`, sent once every mounted component has drawn |
| viewer to board | `canvas:set-props` | `{values}` |
| board to viewer | `canvas:props-changed` | `{values}`, every current value, after `canvas:set-props` |
| viewer to board | `canvas:motion` | `{rate: 1, 0.25 or 0, replay?: true}`; `0` pauses. Applied to every Web Animation (CSS animations and transitions included, also ones that start later, and ones a script starts with `element.animate()`) as `playbackRate`, as the `--canvas-motion-rate` CSS variable, and to the board's JavaScript clock: `performance.now()`, `requestAnimationFrame` timestamps and timers with a delay (`setTimeout`, `setInterval`) run at the rate (0 freezes them) and stay continuous when it changes, so spring, frame and timer-driven motion slows and pauses too. Timers with no delay stay immediate and `Date.now()` stays real. `replay` draws the board afresh so entrance motion runs again. |
| viewer to board | `canvas:pick` | `{enabled}`: turns element picking on or off. While on, the element under the pointer is outlined and pointer presses never reach the board. |
| board to viewer | `canvas:picked` | `{label, labelKind, elementPath, element, rect, nearbyText, text, identity?, reactComponents?}`, sent when a press is released within 5 px of where it started (a longer drag is the viewer's area). `rect` is in board pixels from the board's top left, at any zoom. `text` is the element's own text; `identity` is there when neither a unique label of its own nor words of its own identify the element ([comments.md](comments.md#identification)). |
| viewer to board | `canvas:locate` | `{label, labelKind, elementPath, text?, identity?}`, used to re-attach comments; `text` and `identity` tell apart neighbours a counted label could point at |
| board to viewer | `canvas:located` | `{rect}` or `{missing: true}`, one answer per `canvas:locate`, in the order asked |

`kit.mode` is `live` when the board's link carries `canvas-kit=live:<name>`, else `pinned`; `kit.ref` is the live name or `kit.json`'s `source.commit`; `kit.version` is `kit.json`'s `version` (`null` for a legacy kit). Picking and locating (runtime 0.0.3) are described with comments in [comments.md](comments.md): the label forms, and how `canvas:locate` uses the recorded text.

## Runtime extension point

`window.__canvasRuntime` exposes `version`, `language` (1), `board`, `motion` (`{rate}`), `clock` (`now()`, the board's scaled clock), `ready` (a promise that resolves when `canvas:ready` is sent), `props`, `schema`, `kit`, `on(type, handler)` (handlers receive every accepted `canvas:*` message of that type), `post(type, payload)`, `render()`, and from 0.0.3 `describe(element)` (what `canvas:picked` sends for an element) and `locate({label, labelKind, elementPath, text, identity})` (the element a label names now, or null).

## Change log

- 2026-10-20: first pinned version, with the catalogue above. MM-01 adds the `style` wrapper rule, `dc-import` type conversion, JSX whitespace, `canvas-props` and `canvas-kit` link values, and the extension point.
- 2026-10-20: MM-02 (runtime 0.0.2) extends `canvas:motion` to the board's JavaScript clock (`performance.now()`, `requestAnimationFrame` timestamps, timers with a delay) and to animations started with `element.animate()`, so frame-driven springs replay, slow and pause with CSS motion. The message is unchanged.
- 2026-10-20: MM-03 (runtime 0.0.3) implements `canvas:pick`, `canvas:picked`, `canvas:locate` and `canvas:located`. Additions, accepted before any consumer: `canvas:picked` carries `text` (the element's own text) and `canvas:locate` accepts it, so a label that counts its way to an element (`[n]`, `nth-of-type`) is never re-attached to a neighbour after a board is regenerated. Picking happens on pointer release, because a disabled control gets no click event.
- 2026-10-20: MM-03 after review: `canvas:picked` carries `identity` for an element with neither its own unique label nor words of its own, and `canvas:locate` accepts it (identification in [comments.md](comments.md#identification)); anything ambiguous is missing (the comment shows as moved). It replaces a `fingerprint` field that was never released.
