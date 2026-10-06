# Component library

Read this only when a product asks for a component library in its Studio: one documentation page per component, with live, grouped previews and a property playground. Nothing else in the skill needs it. A Studio whose adapter declares no `library` looks, behaves and loads exactly as one built before library mode existed: its build contains no library code at all (shell acceptance LB-01).

## Three layers

| Layer | Owner | Rule |
| --- | --- | --- |
| Core shell | Shell, replaced by updates | Unchanged by a library. Without a declaration its DOM, bundle and acceptance results are as before. |
| Library layer | Shell, replaced by updates | Inactive and lazily loaded unless the adapter declares `library`. It renders every page and owns no product content. |
| Documentation | Product: `src/library/`, never touched by updates | Data only, typed by `@studio/library` (`studio-library/1`). |

Screens and layouts stay in the views. The library is for components; which components move there, and whether they also stay in the views, is product data.

## Declare the library in the adapter

The adapter stays data. Add `library` to it (types in `src/studio/types.ts`):

```ts
library: {
  label: "Library", // optional: the rail item and breadcrumb
  icon: "layers", // optional: the shell's fixed icon set, StudioIcon in src/studio/types.ts
  entry: "http://[::1]:3123/kit-frame", // optional: the preview entry for library frames; defaults to frameEntry
  groups: [{ id: "buttons", label: "Buttons" }, { id: "text-fields", label: "Text fields" }],
  components: [
    { id: "button", label: "Button", group: "buttons", summary: "Starts an action with one press.", keywords: ["action", "submit"] },
  ],
}
```

- Group and component IDs start with a lowercase letter and use lowercase letters, digits and hyphens, unique within their list. Links carry the component ID as `library=`, so keep it stable.
- Groups, and components within a group, appear in the order declared: the product's own taxonomy.
- `summary` is one sentence of at most 200 characters, shown under the title. Search matches the label, ID, summary, keywords and group.
- A build fails on an invalid declaration and on documentation for a component the adapter does not declare. A declared component without documentation opens to the reason.
- `library` is a reserved link key (`RESERVED_LINK_KEYS` in `src/studio/input.ts`); a component property or dock input with that ID is rejected or left out of links. Rename it.
- The index is all the adapter carries. Keep each component's documentation in `src/library/`, so a library of hundreds of components adds only its index to the Studio's first load.

## Write documentation in `src/library/`

`src/library/index.ts` belongs to the product, as does every file beside it. The updater creates it, empty (`defineLibrary({})`), when it is missing and never changes anything in `src/library/`. Map each component to a loader of its documentation module, so a page's text loads only when the page opens:

```ts
import { defineLibrary } from "@studio/library"

export default defineLibrary({
  button: () => import("./button"),
  "text-field": () => import("./text-field"),
})
```

The build reads the IDs from this file's source: one `defineLibrary` call with an object literal of plain keys, without spreads or computed keys. A documentation module's default export satisfies `ComponentDocs`:

```ts
import type { ComponentDocs } from "@studio/library"

export default {
  source: { name: "Source UI", version: "2.4.0", notice: "Adapted from the Source UI 2.4.0 documentation, MIT License." },
  preview: {
    playground: {
      scenario: "kit:button:playground",
      width: 560,
      height: 160,
      properties: [{ id: "variant", label: "Variant", kind: "select", default: "primary", options: [{ id: "primary", label: "Primary" }, { id: "danger", label: "Danger" }] }],
    },
    groups: [{ id: "styles", label: "Styles", scenario: "kit:button:styles", width: 560, height: 120, code: { language: "tsx", code: "<Button>Save</Button>" } }],
  },
  whenToUse: { body: [{ kind: "list", items: ["To start an action on the current page."] }] },
  accessibility: { adjusted: "Touch targets are at least 44 px here", body: [{ kind: "paragraph", text: "The label is the accessible name." }] },
} satisfies ComponentDocs
```

Documentation is data. Files under `src/library/` import only `@studio/library` and their own files; the `library/imports` lint rule (`scripts/library-boundary.mjs`) fails `npm run lint` on anything else, including React, the kit, shell internals, other packages, an `import()` whose target is not a string, and `import.meta.glob`. Documentation files are `.ts`, `.js` or `.mjs`; the `library/files` rule refuses `.tsx` and `.jsx`, so no component reaches the documentation. Generate documentation files, or write them by hand; both use the same schema.

### Sections

Every page shows the same sections in this order. A section missing from a module shows "Not documented yet." in its place, so a gap is visible.

| Key | Heading | Content |
| --- | --- | --- |
| `preview` | Preview | The playground, then each preview group. |
| `whenToUse` | When to use | `{ body }` |
| `whenNotToUse` | When not to use | `{ body }`, usually naming alternatives with component references. |
| `usage` | Usage | `{ body }` with code. |
| `examples` | Examples | `{ intro?, items }`: each item is a preview group. |
| `api` | API reference | `{ props: { name, type, default?, required?, description }[], notes? }`, drawn as a table. |
| `keyboard` | Keyboard | `{ body }` |
| `accessibility` | Accessibility | `{ body }` |
| `motion` | Motion | `{ body }` |
| `responsive` | Responsive behavior | `{ body }` |
| `performance` | Performance | `{ body }` |
| `notesForAI` | Notes for AI | `{ body }` |

A body is rich text as data: blocks of `paragraph`, `list` (with `ordered`), `code` (`language`, `code`, optional `title`), `table` (`columns` and `rows` of `cells`) and `callout` (`tone` `note` or `warning`). Text is a string or a list of runs: strings, `{ code }`, `{ strong }`, `{ em }`, `{ kbd }`, and `{ component, text? }`, a reference that opens that component's page. A reference to a component the library does not declare is a documentation problem, and is drawn as plain text if it is ever shown. Nothing is ever rendered as HTML.

The page checks every module before it renders it: a shape it cannot read (a missing list, a property without options, an unknown block or property kind, text that is neither a string nor a list of runs) opens the page to the list of problems instead of an error. A fault while rendering stays in its part (the page, On this page or the playground), which shows the reason; the rest of the Studio keeps working.

### Provenance and product adjustments

When documentation is adapted from another library, `source` names it with its version, and its `notice` appears at the page's foot. Mark every section, block, list item, table row, API row, preview group or example the product changed with `adjusted: "<why>"`: the page shows "Adjusted for <product>: <why>" as visible text, never only as a tooltip. Hand-written documentation has no `source`.

### Previews and the playground

- A preview group renders a set of variants (styles, sizes, states) together in one frame, never one frame per variant. Give its natural `width` and `height` in CSS pixels (1 to 4000) and, when it lays out taller at phone width, `mobileHeight`.
- `scenario` is the product's own string, passed to the frame unchanged (such as `kit:<component>:<example>`). The shell never parses it.
- A group may instead be a static capture: `capture: { src, alt }`, an image on the Studio's own origin or an inline data image, shown labelled Static capture. Use it for a state a live preview cannot hold and for exports without a preview entry.
- The playground's `properties` are `text` (with `maxLength`, default 500), `select` (with `options`), `switch` and `number` (with `min`, `max`, `step`), each with a valid `default`, sent to the frame under their IDs as `values`. Property IDs start with a lowercase letter and use letters and digits. The Studio validates every edit against its property and sends only declared properties; an edit a property cannot take shows why and the frame keeps the default. Edits last until the Studio reloads and do not travel in links.

## The preview entry

Library previews are ordinary studio-preview/1 frames mounted by the same host as every view (see [frame protocol](frame-protocol.md#component-library-previews)): `frameIsolation`, exact origin, window and instance checks, the ready limit and Retry. Write one preview entry for the library, or let the product's `frameEntry` render library scenarios too:

- `mount` renders the scenario at its natural size, centred, with every variant of the group laid out by the entry itself. `inputs.values` holds the playground's values for the playground and nothing for other groups; map a `select` option ID to the value it stands for inside the frame, and validate every value again at this boundary. Throw for a scenario the entry cannot render.
- Pass `update` so playground changes apply in place (`live-values`); without it each change mounts a new runtime.
- Pass `code` so the playground's Code tab shows the code for the current values; other groups show their declared `code`.
- Phone width resizes the frame element to 390 px without a remount, so lay out from the frame's own viewport.

`library.entry` is resolved against the Studio page, as `frameEntry` is, and must be on the frame entry's origin (and `frameOrigin` when it names one); otherwise no preview loads and each says why. Documentation never names a URL, so the origin every message is checked against is always the adapter's.

## Navigation and page

The rail shows the library first, as one item above the views with a divider after it (the workspace modules, when the Studio has them, still follow the views after their own divider), with the views' marker, focus ring and label and its tooltip; Tab and the visual order agree, so Tab from the product mark reaches the library before the views. Choosing it opens the last component viewed or the first. The context panel lists the components under their groups with search (`/` focuses it). The breadcrumb reads product, library, group, component, and Go to (⌘K) lists the components by group, after Scenarios and before the views, in the rail's order; Scenarios stay first, so the entry Go to highlights when it opens is still a scenario. Links carry `library=`, `section=` when a link or On this page names a section, and `theme=`. Opening another component adds a history entry, so Back returns; choosing an On this page entry only replaces the link. Leaving a workspace module with unsaved changes for the library asks first. On a phone the Workspace drawer lists the library after its modules (or, in a Studio without a workspace, the library takes Details' place in the bottom bar); the Panel drawer holds the component list and the top bar's Details holds the sidebar.

The page is one centred documentation column on the Studio surface. Details holds On this page (the sections as buttons, the one on screen marked), the playground with Reset (a number keeps what is typed and sends only a value it accepts), and the product theme with Contrast when themes pair with high-contrast versions; they drive every preview. Each preview has Preview and Code tabs, Phone width and Expand. A page keeps at most 4 frames live (`LIVE_FRAMES`), the playground first and then the nearest, mounting within 400 px of the viewport and unmounting beyond it; the nearest are measured again as the page scrolls or resizes, so a swap happens as previews pass and a page never holds a fifth frame; a preview without a frame keeps its size, and an expanded preview releases the page's frames while it is open.

## Offline export

Documentation is part of the Studio build, so a built Studio served from files renders every page with no dev server or host. Previews need a preview entry in the export. To include the library in an offline export, the product provides:

1. In its offline adapter, the same `library` declaration with `entry` pointing at an offline preview document bundled beside the Studio page, on the same origin as the offline `frameEntry` and under the same isolation (for an opaque file document, `frameOrigin: "null"` and a sandbox without `allow-same-origin`).
2. That document's script and styles in the export.
3. Captures for any group that cannot run offline.

Without a preview entry, live groups show the reason and their code.

## Verify

Shell acceptance LB-01 to LB-10 in [shell](shell.md#acceptance-criteria) measure the library with the starter's synthetic example (`example/library/`, which also carries the example workspace); `VITE_STUDIO_ADAPTER=library npm run dev` runs it. A product's own library needs the product's checks: its preview entry's validation of scenarios and values, its documentation's accuracy and its components' floors.

Out of scope: editing documentation in the Studio, playground values in links, and documentation code that runs in the Studio.
