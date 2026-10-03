import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs"
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
import { definedModules, undeclaredDefinitions, workspaceProblems } from "./src/studio/workspace/declaration"

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
// files. Only the dev server can write them: same-origin JSON, schema-checked, 256 KB at most, written
// atomically. A built Studio bundles them and cannot save. The contract (GET the file, POST the whole file;
// 403 another origin, 415 not JSON, 413 too large, 400 unreadable, 422 invalid) is in the skill's shell.md,
// so a host other than Vite can implement it.
type SavedFile = { file: string; route: string; schema: string; maxBytes: number; validate: (data: unknown) => string[]; list: string; forbidden: string; tooBig: string }
const savedFile = (o: SavedFile): Plugin => {
  const file = path.resolve(root, o.file)
  return {
    name: `studio-${o.list}`,
    apply: "serve",
    // Last, so its hotUpdate sees every module another plugin added (the import glob adds the store when the file is created).
    enforce: "post",
    configureServer(server) {
      server.middlewares.use(o.route, (req, res) => {
        const send = (code: number, body: unknown) => {
          if (res.writableEnded) return
          res.statusCode = code
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify(body))
        }
        if (req.method === "GET") {
          try {
            return send(200, JSON.parse(readFileSync(file, "utf8")))
          } catch {
            return send(200, { schema: o.schema, [o.list]: [] })
          }
        }
        if (req.method !== "POST") return send(405, { error: "Use GET or POST" })
        const origin = req.headers.origin
        const sameOrigin = (() => {
          try {
            return !!origin && new URL(origin).host === req.headers.host
          } catch {
            return false
          }
        })()
        if (!sameOrigin) return send(403, { error: o.forbidden })
        if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(415, { error: "Send JSON" })
        const chunks: Buffer[] = []
        let size = 0
        req.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > o.maxBytes) {
            send(413, { error: o.tooBig })
            req.destroy()
          } else chunks.push(chunk)
        })
        req.on("end", () => {
          if (res.writableEnded) return
          let data: unknown
          try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf8"))
          } catch {
            return send(400, { error: "Not valid JSON" })
          }
          const problems = o.validate(data)
          if (problems.length) return send(422, { error: `Not a valid ${o.schema} file`, problems })
          const tmp = `${file}.${process.pid}.tmp`
          try {
            writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
            renameSync(tmp, file)
          } catch (e) {
            rmSync(tmp, { force: true })
            return send(500, { error: `Could not write ${o.file}: ${e instanceof Error ? e.message : String(e)}` })
          }
          send(200, { ok: true })
        })
      })
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
const acceptance = variant && variant !== "workspace" ? [{ find: /^@\/adapter$/, replacement: path.resolve(root, variant === "example" ? "src/adapters/example.ts" : "src/adapters/synthetic.ts") }] : []
// The starter's example workspace (VITE_STUDIO_ADAPTER=workspace): its adapter and module map, or with
// VITE_STUDIO_WORKSPACE=orphan a map that defines an undeclared module, which must fail the build.
const exampleWorkspace =
  variant === "workspace"
    ? [
        { find: /^@\/adapter$/, replacement: path.resolve(root, "example/workspace/adapter.ts") },
        { find: /^@\/workspace$/, replacement: path.resolve(root, process.env.VITE_STUDIO_WORKSPACE === "orphan" ? "example/workspace/orphan.ts" : "example/workspace/index.ts") },
      ]
    : []

// The surfaces workspace modules import (references/workspace.md); everything else under src/ is shell internals.
const studioAliases = [
  { find: /^@studio\/kit$/, replacement: path.resolve(root, "src/kit/index.ts") },
  { find: /^@studio\/workspace$/, replacement: path.resolve(root, "src/studio/workspace/api.ts") },
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
    const defined = definedModules(parseAst(readFileSync(file, "utf8"), { lang: file.endsWith(".tsx") ? "tsx" : "ts" }))
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
    if (variant !== "workspace" || !existsSync(mockHostFile)) return
    const { createMockMiddleware } = (await import(pathToFileURL(mockHostFile).href)) as { createMockMiddleware: () => MockMiddleware }
    server.middlewares.use("/__studio/ops", createMockMiddleware())
  },
})

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), title(), layouts(), scenarios(), workspaceFlag(), workspaceCheck(), workspaceMock()],
  build: {
    outDir: path.resolve(root, studio.outDir ?? "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        studio: path.resolve(root, "index.html"),
        ...Object.fromEntries(Object.entries(studio.inputs ?? {}).map(([name, file]) => [name, path.resolve(root, file)])),
        ...(process.env.VITE_STUDIO_ADAPTER ? { example: path.resolve(root, "example/index.html") } : {}),
      },
    },
  },
  resolve: {
    alias: aliases,
  },
})
