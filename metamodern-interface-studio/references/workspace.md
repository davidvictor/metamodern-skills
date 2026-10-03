# Workspace modules

Read this only when a product asks for its own tools in its Studio, such as environment configuration, a schema explorer, email previews or translations. Nothing else in the skill needs it. A Studio whose adapter declares no `workspace` looks, behaves and loads exactly as one built before workspace modules existed: its build contains no workspace code at all (shell acceptance WS-01).

## Three layers

| Layer | Owner | Rule |
| --- | --- | --- |
| Core shell | Shell, replaced by updates | Unchanged by a workspace. Without a declaration its DOM, bundle and acceptance results are as before. |
| Workspace layer and Studio UI kit | Shell, replaced by updates | Inactive and lazily loaded unless the adapter declares `workspace`. The kit is a versioned public surface, `studio-kit/1`. |
| Modules | Product: `src/workspace/`, never touched by updates | Built only from `@studio/kit` and `@studio/workspace`. Server operations live in the product's host. |

Module code never forks or edits the shell. A module that needs something the kit lacks is a request for the kit, released in this skill.

## Declare modules in the adapter

The adapter stays data. Add `workspace` to it (types in `src/studio/types.ts`):

```ts
workspace: {
  operations: "/api/studio", // the host's operation endpoints, on the Studio's own origin
  modules: [
    {
      id: "environment",
      label: "Environment",
      icon: "server", // the shell's fixed icon set: StudioIcon in src/studio/types.ts
      sections: [{ id: "variables", label: "Variables" }, { id: "secrets", label: "Secrets" }],
      uses: [{ name: "env.read", kind: "read" }, { name: "env.write", kind: "write" }],
    },
  ],
}
```

- Module and section IDs start with a lowercase letter and use lowercase letters, digits and hyphens; operation names may also use dots. IDs must be unique (sections within their module, operation names within their module's `uses`). Links carry module and section IDs, so keep them stable. A build fails on an invalid declaration once `src/workspace/index.ts` defines a module.
- `uses` lists every operation a module may call and whether it reads or writes. Anything else is refused before a request is made.
- `unavailable: "<reason>"` on a module shows the reason instead of the module.
- `operations` is a path on the Studio's own origin, absolute (`/api/studio`) or relative to the Studio page (`./__studio/ops`), over http or https, with no query string or fragment. A base with `?` or `#`, another origin or another scheme is refused without a request.
- Without `operations` every module is unavailable, with that reason. With it, a module whose host does not answer says so; nothing is simulated.
- `module` and `section` are reserved link keys (`RESERVED_LINK_KEYS` in `src/studio/input.ts`). A component property with one of these IDs is rejected, and a dock input with one is left out of links with a console error. Rename it.

## Write modules in `src/workspace/`

`src/workspace/index.ts` belongs to the product, as does every file beside it. The updater creates it, empty (`defineWorkspace({})`), when it is missing and never changes anything in `src/workspace/`. Map each declared module to its components:

```tsx
import { defineWorkspace } from "@studio/workspace"
import { EnvironmentDetails, EnvironmentPage, EnvironmentPanel } from "./environment"

export default defineWorkspace({
  environment: { Page: EnvironmentPage, Panel: EnvironmentPanel, Details: EnvironmentDetails },
})
```

- `Page` is required: the module's page on the Studio surface. `Panel` sits in the context panel under the sections, for filters or lists. `Details` fills the Details panel; without it Details is hidden for the module.
- The build reads the module IDs from the source of `src/workspace/index.ts` itself, so that file calls `defineWorkspace` once, by that name, with an object literal whose keys are plain module IDs (identifiers or strings). No spreads, computed keys, aliases, or a `defineWorkspace` call re-exported from another file; the build fails and says which. The components themselves may come from any file under `src/workspace/`.
- A key the adapter does not declare fails the build with its name. A declared module without a component is unavailable with the reason.
- If Vite cannot load the adapter at build time (for example the adapter imports CSS), the build only warns and keeps the workspace layer, deciding at runtime; an undeclared module is then reported in the Studio with a "A workspace module is not declared" toast instead of failing the build. Keep the adapter loadable by Vite's module runner so both checks run at build time.
- Module files import only `@studio/kit`, `@studio/workspace`, `react`, `react/jsx-runtime` and their own files under `src/workspace/`. The `studio/imports` lint rule (`scripts/workspace-boundary.mjs`) fails `npm run lint` on anything else, including type-only imports, `import("...")` types, `import()` with a target that is not a string literal, and `import.meta.glob` patterns or a `base` outside `src/workspace/`. Other npm packages are outside the boundary too. This keeps shell internals free to change.
- A module that throws shows "<label> stopped" with the error and Try again; the rest of the Studio keeps working.

### The workspace API (`@studio/workspace`)

| Export | Use |
| --- | --- |
| `defineWorkspace(modules)` | The default export of `src/workspace/index.ts`. |
| `useModule()` | The open module: `id`, `label`, `sections`, the current `section` (null without sections), `go(section)`, its `uses` and the `operations` base. |
| `useOperation(name)` | `read(input)` or `write(input, { expectedRevision })` for one declared operation, each resolving to the result, with `status` (`idle`, `running`, `done`) and the last `result`. Only the latest call sets them. |
| `useDirtyGuard(dirty, message?)` | While `dirty`, leaving the module (the rail, view keys, Go to, Back or Forward) or closing the tab asks first; Stay or Esc keeps the edits. Moving between the module's own sections does not ask: the Page stays mounted. |
| `useModuleState(key, initial)` | A value shared by the module's Page, Panel and Details until the Studio reloads. |

Types `ModuleDefinition`, `WorkspaceDefinition`, `ModuleInfo`, `OperationResult`, `OperationError` and `OperationKind` are exported with them.

### The Studio UI kit (`@studio/kit`, `studio-kit/1`)

| Export | For |
| --- | --- |
| `ModulePage` | The page: title, description, actions, busy state, content, and a footer such as `SaveBar`. |
| `Section`, `Toolbar`, `Button` | Headed groups, a labeled row of actions, and the Studio's button. |
| `Field` | `kind: "text"`, `"select"`, `"switch"` or `"secret"` (masked, with Reveal, and ignored by password managers), with label, description and error. |
| `PropertyList` | Label and value pairs. |
| `DataTable` | Rows with sortable columns (announced), an optional filter and windowed rendering with one tab stop for any size. |
| `StatusTile`, `StatusBadge` | A figure with its state; a state in a glyph and a word (`ok`, `warning`, `error`, `info`, `neutral`). |
| `SaveBar` | `clean`, `dirty`, `saving`, `saved`, `conflict` (the current value beside the kept edit, with Use current value and Save mine again) and `error` with Retry. |
| `ConfirmDialog` | A question with a safe default: focus opens on the cancel button, and Esc cancels. |
| `EmptyState` | A reason when there is nothing to show, with an optional action; never a stand-in. |
| `PreviewFrame` | Product output inside a module: a `studio-preview/1` entry, or static HTML such as an email in a sandbox without scripts, always with its fidelity stated. See [frame protocol](frame-protocol.md#product-output-in-workspace-modules). |
| `Icon`, `tokens` | The fixed icon set plus a few action icons, and the shell's tokens as CSS values. |
| `KIT_VERSION` | `"studio-kit/1"`. |

Kit components meet the shell's floors: 44 px targets on coarse pointers, 16 px input text, AA text contrast, a visible focus outline of at least 3:1 (also in forced colors) and no motion under reduced motion, in both Studio appearances. The floors apply inside a `ModulePage` (or `EmptyState`, `PreviewFrame`, `ConfirmDialog`), so build every module page on `ModulePage`.

A kit change that breaks a module is a new major version and a breaking shell release. The updater reports it and applies it only with `--accept-kit <new version>` (see [updating](updating.md#studio-ui-kit-versions)).

## Navigation

Modules follow the views in the rail after a divider, as square items with the views' marker, inset focus ring and labels; a module the declaration makes unavailable (a declared reason, or no operations host) names that reason in the tooltip, while a missing component or a host that does not answer is explained on the module's page. Choosing the open module again shows or hides the panel. The context panel lists the open module's sections, then its Panel. The breadcrumb reads product, module, section. Go to (⌘K) lists modules and sections. Links carry `module=` and `section=` instead of the view and scenario, and opening a module or a section adds a history entry, so Back returns. A link to a section the module lacks opens its first section; a link to a module the Studio lacks opens the Studio as usual with a toast. On a phone the bottom bar's Workspace entry takes Details' place and opens a drawer of modules, listing the sections of a module that has more than one, and Details moves to the top bar (only in a Studio that declares a workspace). A module's page sits on the Studio surface; product output sits on the grey stage only inside a `PreviewFrame`.

## The operation contract

A module reaches the product only through operations served by the product's host.

- Request: `POST {operations}/{name}` on the Studio's own origin, with `content-type: application/json`, `x-studio-operation-kind: read` or `write`, the browser's same-origin credentials, and the body `{ "input": <value or null> }`. A write may add `"expectedRevision": "<revision>"`. An input that cannot be sent as JSON is refused (`bad-input`) without a request.
- Response: `{ "ok": true, "data": <value>, "revision": "<optional>" }`, or `{ "ok": false, "error": { "code": "<code>", "reason": "<safe to show>", "recoverable": <boolean> } }`. The shell reads only the envelope, never the HTTP status, so a host may answer an error with 4xx or 200 alike. JSON that is not the envelope is reported as `bad-envelope`.
- Compare-and-set: when `expectedRevision` is not the current revision, change nothing and answer `{ "ok": false, "error": { "code": "conflict", "reason": "<safe to show>", "recoverable": true }, "current": { "data": <current value>, "revision": "<current>" } }`. The module renders `current.data` into the `current` of SaveBar's `conflict` state, which shows it beside the person's edit; only their choice writes again.
- The shell refuses, without a request: a name the module did not declare, or one outside the name pattern (`undeclared`); a write to an operation declared as a read, or a read of one declared as a write (`kind-mismatch`); and an endpoint on another origin, another scheme or a base with a query or fragment (`cross-origin`). Without an `operations` base it answers `no-host`.
- An answer that is not JSON, or no answer, means no host. When a module's read finds no host before the host has answered that module in this session, and nothing in it is unsaved, that module (and only that one) shows "No operations host answered at <base>" with Try again. Otherwise, including any write, the failure is only that operation's result (`host-unavailable`, recoverable): the open page and its unsaved edits stay, and the module shows the error, for example SaveBar's error with Retry.

## The host's obligations

The shell holds no credentials and runs no privileged code. Everything that protects the product is the host's job.

- Authenticate and authorize every operation on the server. The kind header and a module's `uses` are conveniences for the Studio, not controls.
- Accept only same-origin requests (check `Origin` against the host) with JSON bodies, limit body size, and refuse unknown operation names.
- Validate every input against the operation's own schema. Never take a file path, command, query or URL from the input; map names to fixed, allow-listed targets.
- Keep secrets in the host. Return a secret only when a person asks to see it, never in a list, a log or a link.
- Implement compare-and-set for every write that can race, and record who changed what.
- A host for local development, such as the starter's mock in `example/workspace/mock-host.mjs`, never ships. A published Studio with write operations needs the product's own access control in front of its host; follow [verification](verification.md#publication).

## Build and bundle

A build decides once whether to include the workspace layer: it loads the adapter with Vite's module runner and defines `__STUDIO_WORKSPACE__`. Without a declaration the build has no workspace chunk and the Studio's chunks are those of a Studio before workspaces. With one, the navigation chunk loads with the Studio and module code loads when the first module opens. The dev server, and a build whose adapter Vite cannot load, keep the layer and decide at runtime. A Studio built while its adapter declared no workspace and then run with one that does logs a console error: rebuild it.

## Verify

Shell acceptance WS-01 to WS-09, WS-05b and WS-06b in [shell](shell.md#acceptance-criteria) measure the layer with the starter's synthetic example workspace (`example/workspace/`), also served without its host; `VITE_STUDIO_ADAPTER=workspace npm run dev` runs it with its mock host. A product's own modules and host need the product's own checks: each operation's authorization and validation, conflicts against real data, and the kit floors on the module's pages.

Out of scope: third-party plugins, module code loaded at runtime, a server inside the shell, and moving product UI out of preview frames.
