# Kit contract (contract 3)

Schemas: `canvas-kit/1` (kit.json), `canvas-tokens/1` (tokens.json) and `canvas-markup/1` (markup nodes passed to `mount`). This file is the source for contract 3. Each project builds its kit however it likes; this is what the kit must provide.

Code: [`scripts/kit-contract.mjs`](../scripts/kit-contract.mjs) (validators and the kit.json writer) and [`assets/runtime/support/react-markup.js`](../assets/runtime/support/react-markup.js) (markup nodes to React, and a `mount` to bundle). The [fixture kit](../assets/fixture-kit/src/kit.jsx) is a complete example, built by [`scripts/build-fixture-kit.mjs`](../scripts/build-fixture-kit.mjs).

## Layout

```text
<kit>/
  kit.json                written last, so a live build is never read half-made
  components/bundle.js    classic script; defines window.<namespace>; React 19 inside
  components/bundle.css
  components/index.d.ts
  tokens.json
  inventory.json          optional, project-defined
  fonts/  media/
```

Other files a kit's boards load from `ds/<namespace>/` (such as a second script `components/scenes.js`) are allowed.

## `kit.json`

```json
{
  "schema": "canvas-kit/1",
  "namespace": "Example",
  "version": "<semver or date>",
  "source": { "repo": "owner/name", "commit": "<40 hex>", "dirty": false, "branch": "<name, for a live build>" },
  "inputs": ["<repository path or glob>"],
  "builtAt": "<ISO date-time>",
  "react": "19.x",
  "parts": { "shared": "sha256:...", "components": { "Button": "sha256:...", "Screens.Work": "sha256:...", "sample": "sha256:..." } }
}
```

`parts` is optional (below). `inputs` lists every repository path the kit and its inventory are built from, so a design repository can tell when the source has moved past its pinned kit. A live build sets `dirty` and `branch`. Write it with `writeKitManifest(dir, kit)`, which checks it, writes a temporary file and renames it into place after everything else. `validateKitFolder(dir)` fails when any file in the folder is newer than `kit.json`.

### Part hashes

A kit's bundle is one file, so without help a render check cannot tell which boards a kit change can affect, and checks every board that mounts the kit after each sync. A kit may say it in `parts`:

- `components` maps each kit path a board can name (`Button`, `Screens.Work`, `sample`, `element`) to a hash that changes whenever anything that path runs changes: its module and every module it imports.
- `shared` is a hash that changes whenever anything every board depends on changes: the entry and `mount` code, `Root`, the CSS bundle, tokens and fonts, and anything no part covers.

The render check then keys a board that mounts the kit by `shared` and the parts of the paths it names, so a sync that changes one component re-checks the boards that name it or a part that imports it ([render check](render-check.md#only-what-changed)). A path a board names that has no part keys that board by the whole kit, so a kit may list only the paths it can hash well. `partHashes({metafile, root, shared, components})` in [`scripts/kit-contract.mjs`](../scripts/kit-contract.mjs) computes them from a bundler's module graph (esbuild's `metafile`): each part's roots, followed through their imports, hashed by content; output files listed in `shared` (such as `components/bundle.css`) are hashed as they are. When a CSS bundle is one file for every component, any style change moves `shared`, which is correct: every board loads it.

## The global (`window.<namespace>`)

```ts
interface CanvasKit {
  version: string;
  mount(el: HTMLElement, name: string, props?: Record<string, unknown>): () => void;
  Root: Component<{ theme?: 'light' | 'dark'; contrast?: 'standard' | 'high'; density?: string;
                    inputContext?: 'pointer' | 'touch'; scope?: string; children?: unknown }>;
  Scene: Component<{ id: string; state?: string } & RootProps>;
  scenes: { id: string; title: string; area: string; states: { id: string; label: string }[];
            viewports: ('desktop' | 'phone')[] }[];
  sample: unknown;
  [component: string]: unknown;
}
```

- **Mount names:** `mount` resolves names on the global; a name can be dotted, such as `Screens.Work`. Boards write the full path, `<Ns>.Screens.Work`, and the runtime passes `Screens.Work`.
- **Updates:** calling `mount` again on the same element renders the new props into the same root, so component state survives a change of props.
- **Unmount:** the function `mount` returns removes the component cleanly.
- **Nested markup:** when a board nests markup inside an `<x-import>`, `props.children` holds markup nodes (below), one node as itself or several as an array. `mount` turns them into elements of the kit's own React. Kits get this by bundling the package helper:

  ```js
  const markup = require('<package>/assets/runtime/support/react-markup.js');
  kit.mount = markup.createMount({ React, createRoot, global: kit });
  ```

- **Render check:** every component and scene must mount with no console errors.
- **Stable labels:** each component renders `data-kit-component="<Name>"` on its root.

`validateKitGlobal(window.<namespace>)` checks this shape.

### Markup nodes (`canvas-markup/1`)

| Node | Meaning |
| --- | --- |
| a string or number | text |
| `{$canvas: "element", tag, ns, attrs, children}` | a plain element; `ns` is the SVG namespace or `null`; `attrs` are the board's attribute names with their values (strings, or any value from `{{x}}`, functions for `on...` handlers) |
| `{$canvas: "component", name, props, style}` | a component at a dotted path on `window` (`"Ns.Path"`); `style` asks for a wrapper `<div>` with that style |

`react-markup.js` maps attribute names to React props (`class` to `className`, `tabindex` to `tabIndex`, SVG `stroke-width` to `strokeWidth`, `onclick` with a function to `onClick`, and so on), turns style strings into style objects (custom properties kept), treats HTML boolean attributes as booleans and keeps form fields uncontrolled unless the board gives a change handler.

## Legacy kits

A kit folder without `kit.json` is a legacy kit: an older build that externalizes React 18 and expects `window.React` and `window.ReactDOM` from the page. The board resolver answers its `kit.json` with `{"schema": "canvas-kit/legacy", ...}`; the runtime then loads React 18.3.1 and ReactDOM 18.3.1 (the MIT-licensed UMD production builds in `assets/runtime/support/`, with [their licence](../assets/runtime/support/REACT-LICENSE)) before the kit script, and mounts its components with its own `mount` and `createRoot`. Contract kits never get a page React.

## `tokens.json` (`canvas-tokens/1`)

```json
{
  "schema": "canvas-tokens/1",
  "themes": {
    "light": { "background": { "value": "#ffffff", "usage": "Page background", "source": "src/theme.css" } },
    "dark": { "background": { "value": "#141517" } },
    "light-contrast": {},
    "dark-contrast": {}
  },
  "type": [{ "name": "body", "value": "14px/20px system-ui" }],
  "space": [], "radius": [], "shadow": [], "motion": [], "density": []
}
```

- `light` and `dark` are required; the contrast themes are optional.
- A theme maps each token name to `{value, usage?, source?}` (a `name` inside, when present, equals the key). Every other group is an array of `{name, value, usage?, source?}`.
- Values are resolved, never `var()` or `color-mix()`. `source` is a repository path.

## Watch mode

Watch mode writes the same layout into its output folder, replacing files atomically, with `kit.json` last. The viewer watches each kit's `kit.json` and reloads every open board using that kit.

## Change log

- 2026-10-21: optional `parts` in `kit.json` (package 0.4.0), so a render check after a kit sync re-checks only the boards that use what changed. Kits without it work as before.

- 2026-10-20: first pinned version. MM-01 adds markup nodes in `mount` props, update in place on a second `mount`, the legacy kit rule and the theme map shape of `tokens.json`.
