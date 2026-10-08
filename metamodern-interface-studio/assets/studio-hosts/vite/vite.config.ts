import { cpSync, existsSync, mkdirSync, readFileSync } from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, parseAst, runnerImport, type Plugin } from "vite"

import config from "./studio.config"
import type { StudioConfig } from "./src/studio/config"
import { LAYOUTS_MAX_BYTES, validateLayouts } from "./src/studio/layouts"
import { SCENARIOS_MAX_BYTES, validateScenarios } from "./src/studio/scenarios"
import type { IncomingMessage, ServerResponse } from "http"
import { pathToFileURL } from "url"
import type { StudioAdapter } from "./src/studio/types"
import { savedFileMiddleware } from "./scripts/saved-file"
import { astLang, definedModules, undeclaredDefinitions, workspaceProblems } from "./src/studio/workspace/declaration"
import { definedDocs, libraryProblems, undeclaredDocs } from "./src/studio/library/model"

// Shell owned: product settings come from studio.config.ts, so an update can
// replace this file. The Studio (index.html) builds with any extra pages the
// config names, such as the example product's preview entry.
const studio: StudioConfig = config
const root = import.meta.dirname
const html = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

const title = (): Plugin => ({
  name: "studio-title",
  transformIndexHtml: (page, ctx) => (path.resolve(ctx.filename) === path.resolve(root, "index.html") ? page.replace(/<title>[^<]*<\/title>/, `<title>${html(studio.title)}</title>`) : page),
})

// Saved Responsive layouts (layouts.json) and saved states (scenarios.json) live at the Studio root, product
// files. Only the dev server can write them, through scripts/saved-file.ts: same-origin JSON, schema-checked,
// 256 KB at most, written atomically, with a revision so a save never overwrites a change made elsewhere. A built
// Studio bundles them and cannot save. The contract is in the skill's shell.md, so a host other than Vite can implement it.
type SavedFile = { file: string; route: string; schema: string; maxBytes: number; validate: (data: unknown) => string[]; list: string; forbidden: string; tooBig: string }
const savedFile = (o: SavedFile): Plugin => {
  const file = path.resolve(root, o.file)
  return {
    name: `studio-${o.list}`,
    apply: "serve",
    // Last, so its hotUpdate sees every module another plugin added (the import glob adds the store when the file is created).
    enforce: "post",
    configureServer(server) {
      server.middlewares.use(o.route, savedFileMiddleware({ ...o, file }))
    },
    // Saving must not reload or re-run the Studio: not when the file changes, and not when the first save creates it
    // (the bundled-file import glob would otherwise re-execute the store) or it is deleted. The affected modules are
    // invalidated instead, so the next page load reads the file as it now is.
    hotUpdate({ file: changed, modules }) {
      if (path.resolve(changed) !== file) return
      for (const m of modules) this.environment.moduleGraph.invalidateModule(m)
      return []
    },
  }
}
const layouts = () => savedFile({ file: "layouts.json", route: "/__studio/layouts", schema: "studio-layouts/1", maxBytes: LAYOUTS_MAX_BYTES, validate: validateLayouts, list: "layouts", forbidden: "Only this Studio can save its layouts", tooBig: "Layouts are limited to 256 KB" })
const scenarios = () => savedFile({ file: "scenarios.json", route: "/__studio/scenarios", schema: "studio-scenarios/1", maxBytes: SCENARIOS_MAX_BYTES, validate: (data) => validateScenarios(data), list: "scenarios", forbidden: "Only this Studio can save its scenarios", tooBig: "Saved scenarios are limited to 256 KB" })

// npm run acceptance builds the stress and capture-only adapters by pointing
// "@/adapter" at the acceptance module; a normal build never includes them.
const variant = process.env.VITE_STUDIO_ADAPTER
// The static build (VITE_STUDIO_ADAPTER=static) is the example as published to a static host: opaque frames, a
// workspace without operations, module groups and a wide library component (example/static-adapter.ts).
const withLibrary = variant === "editor" || variant === "library" || variant === "sections" || variant === "static"
const acceptance = variant && variant !== "workspace" && !withLibrary ? [{ find: /^@\/adapter$/, replacement: path.resolve(root, variant === "example" ? "src/adapters/example.ts" : "src/adapters/synthetic.ts") }] : []
// The starter's example workspace (VITE_STUDIO_ADAPTER=workspace): its adapter and module map, or with
// VITE_STUDIO_WORKSPACE=orphan a map that defines an undeclared module, which must fail the build. The example
// library (VITE_STUDIO_ADAPTER=library) carries the same workspace and adds its documentation map; the same library
// declared with sections (VITE_STUDIO_ADAPTER=sections) does too, or with VITE_STUDIO_LIBRARY=invalid a declaration
// that must fail the build.
const libraryAdapterFile = variant === "editor" ? "example/design-adapter.ts" : variant === "static" ? "example/static-adapter.ts" : variant === "sections" ? (process.env.VITE_STUDIO_LIBRARY === "invalid" ? "example/library/invalid.ts" : "example/library/sections.ts") : "example/library/adapter.ts"
const workspaceFile = variant === "static" ? "example/workspace/static.ts" : process.env.VITE_STUDIO_WORKSPACE === "orphan" ? "example/workspace/orphan.ts" : "example/workspace/index.ts"
const exampleWorkspace =
  variant === "workspace" || withLibrary
    ? [
        { find: /^@\/adapter$/, replacement: path.resolve(root, withLibrary ? libraryAdapterFile : "example/workspace/adapter.ts") },
        { find: /^@\/workspace$/, replacement: path.resolve(root, workspaceFile) },
        ...(withLibrary ? [{ find: /^@\/library$/, replacement: path.resolve(root, variant === "static" ? "example/library/static.ts" : "example/library/index.ts") }] : []),
      ]
    : []

// The surfaces workspace modules and library documentation import (references/workspace.md, references/library.md);
// everything else under src/ is shell internals.
const studioAliases = [
  ...(variant === "editor" ? [{ find: /^@\/design-ui$/, replacement: path.resolve(root, "example/design-ui/loaders.ts") }, { find: /^@\/design-runtime$/, replacement: path.resolve(root, "example/design-runtime/loaders.ts") }] : []),
  { find: /^@studio\/design-ui$/, replacement: path.resolve(root, "src/studio/design-ui/api.ts") },
  { find: /^@studio\/kit$/, replacement: path.resolve(root, "src/kit/index.ts") },
  { find: /^@studio\/workspace$/, replacement: path.resolve(root, "src/studio/workspace/api.ts") },
  { find: /^@studio\/library$/, replacement: path.resolve(root, "src/studio/library/api.ts") },
]
const aliases = [...exampleWorkspace, ...acceptance, ...studioAliases, { find: "@", replacement: path.resolve(root, "./src") }]

// The adapter as a build sees it, loaded once with Vite's module runner, or why it could not be loaded (for example it imports CSS).
let builtAdapter: Promise<{ adapter: StudioAdapter } | { error: string }> | undefined
const loadAdapter = () =>
  (builtAdapter ??= runnerImport<{ adapter: StudioAdapter }>("@/adapter", { configFile: false, root, logLevel: "error", resolve: { alias: aliases } }).then(
    (r) => ({ adapter: r.module.adapter }),
    (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })
  ))

// A build of a Studio whose adapter declares no workspace leaves the workspace layer out entirely
// (__STUDIO_WORKSPACE__ false), so its chunks are exactly those of a Studio before workspaces. The dev
// server, and a build whose adapter cannot be loaded, keep it and decide at runtime.
const workspaceFlag = (): Plugin => ({
  name: "studio-workspace-flag",
  async config(_, env) {
    const loaded = env.command === "build" ? await loadAdapter() : null
    if (loaded && "error" in loaded) console.warn(`Interface Studio: could not load the adapter to tell whether it declares a workspace, so the build keeps the workspace layer: ${loaded.error}`)
    return { define: { __STUDIO_WORKSPACE__: JSON.stringify(!loaded || "error" in loaded || !!loaded.adapter.workspace) } }
  },
})

// A module file that defines a module the adapter does not declare fails the build with its name, as
// does an invalid declaration (references/workspace.md). Skipped when the file defines no modules.
// When Vite cannot load the adapter (for example it imports CSS) the check only warns; the Studio then
// reports the undeclared module at runtime.
const workspaceCheck = (): Plugin => ({
  name: "studio-workspace-check",
  apply: "build",
  async buildStart() {
    const file = (await this.resolve("@/workspace"))?.id
    if (!file) return
    const rel = path.relative(root, file)
    const defined = definedModules(parseAst(readFileSync(file, "utf8"), { lang: astLang(file) }))
    if (typeof defined === "string") return this.error(`${rel}: ${defined}`)
    if (!defined.length) return
    const loaded = await loadAdapter()
    if ("error" in loaded) return this.warn(`Could not load the adapter to check ${rel}: ${loaded.error}`)
    const { adapter } = loaded
    const problems = workspaceProblems(adapter.workspace)
    if (problems.length) return this.error(`The adapter's workspace declaration is invalid:\n  ${problems.join("\n  ")}`)
    const orphans = undeclaredDefinitions(adapter.workspace, defined)
    if (orphans.length) this.error(`${rel} defines ${orphans.map((id) => `"${id}"`).join(", ")}, which the adapter does not declare in workspace.modules. Declare it there or remove it.`)
  },
})

// The component library, as the workspace above (references/library.md): a build whose adapter declares no library
// leaves the library layer out entirely (__STUDIO_LIBRARY__ false); the dev server and an unloadable adapter keep it.
const libraryFlag = (): Plugin => ({
  name: "studio-library-flag",
  async config(_, env) {
    const loaded = env.command === "build" ? await loadAdapter() : null
    if (loaded && "error" in loaded) console.warn(`Interface Studio: could not load the adapter to tell whether it declares a library, so the build keeps the library layer: ${loaded.error}`)
    return { define: { __STUDIO_LIBRARY__: JSON.stringify(!loaded || "error" in loaded || !!loaded.adapter.library) } }
  },
})

// An invalid library declaration, or a documentation map that names a component the adapter does not declare, fails
// the build with what is wrong. When Vite cannot load the adapter the check only warns.
const libraryCheck = (): Plugin => ({
  name: "studio-library-check",
  apply: "build",
  async buildStart() {
    const loaded = await loadAdapter()
    if ("error" in loaded) return this.warn(`Could not load the adapter to check the library: ${loaded.error}`)
    const decl = loaded.adapter.library
    if (!decl) return
    const problems = libraryProblems(decl)
    if (problems.length) return this.error(`The adapter's library declaration is invalid:\n  ${problems.join("\n  ")}`)
    const file = (await this.resolve("@/library"))?.id
    if (!file) return this.error("The adapter declares a library, but src/library/index.ts is missing. The skill's update-studio.mjs creates it.")
    const rel = path.relative(root, file)
    const defined = definedDocs(parseAst(readFileSync(file, "utf8"), { lang: astLang(file) }))
    if (typeof defined === "string") return this.error(`${rel}: ${defined}`)
    const orphans = undeclaredDocs(decl, defined)
    if (orphans.length) this.error(`${rel} documents ${orphans.map((id) => `"${id}"`).join(", ")}, which the adapter does not declare in library.components. Declare it there or remove it.`)
  },
})

// The example workspace's operations, served by the dev server only while it runs that example. A real
// Studio's operations live in the product's host (references/workspace.md); none ships in a build. The
// mock applies the same guard as the endpoints above: same-origin JSON POSTs of 64 KB at most. It is loaded
// once when the server starts, so an edit to mock-host.mjs needs a full restart of the dev server process.
const mockHostFile = path.resolve(root, "example/workspace/mock-host.mjs")
type MockMiddleware = (req: IncomingMessage, res: ServerResponse) => void
const workspaceMock = (): Plugin => ({
  name: "studio-workspace-mock",
  apply: "serve",
  async configureServer(server) {
    if ((variant !== "workspace" && !withLibrary) || variant === "static" || !existsSync(mockHostFile)) return
    const { createMockMiddleware } = (await import(pathToFileURL(mockHostFile).href)) as { createMockMiddleware: () => MockMiddleware }
    server.middlewares.use("/__studio/ops", createMockMiddleware())
  },
})

const editorFixtureAssets = (): Plugin => ({
  name: "studio-editor-fixture-assets", apply: "build",
  writeBundle(output) {
    if (variant !== "editor") return
    const target = path.resolve(output.dir ?? path.resolve(root, studio.outDir ?? "dist"), "example/design-runtime")
    mkdirSync(target, { recursive: true })
    cpSync(path.resolve(root, "example/design-runtime/assets.css"), path.join(target, "assets.css"))
  },
})
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), title(), layouts(), scenarios(), workspaceFlag(), workspaceCheck(), libraryFlag(), libraryCheck(), workspaceMock(), editorFixtureAssets()],
  build: {
    outDir: path.resolve(root, studio.outDir ?? "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        studio: path.resolve(root, "index.html"),
        ...Object.fromEntries(Object.entries(studio.inputs ?? {}).map(([name, file]) => [name, path.resolve(root, file)])),
        ...(process.env.VITE_STUDIO_ADAPTER ? { example: path.resolve(root, "example/index.html") } : {}),
        // The example library's preview entry, built only with the example library.
        ...(withLibrary ? { "example-library": path.resolve(root, "example/library/frame.html") } : {}),
      },
    },
  },
  resolve: {
    alias: aliases,
  },
})
