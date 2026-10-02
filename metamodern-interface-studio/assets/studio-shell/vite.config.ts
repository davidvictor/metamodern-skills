import { readFileSync, renameSync, writeFileSync } from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import config from "./studio.config"
import type { StudioConfig } from "./src/studio/config"
import { LAYOUTS_MAX_BYTES, validateLayouts } from "./src/studio/layouts"
import { SCENARIOS_MAX_BYTES, validateScenarios } from "./src/studio/scenarios"

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
          writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
          renameSync(tmp, file)
          send(200, { ok: true })
        })
      })
    },
    // Saving must not reload the Studio.
    handleHotUpdate({ file: changed }) {
      if (path.resolve(changed) === file) return []
    },
  }
}
const layouts = () => savedFile({ file: "layouts.json", route: "/__studio/layouts", schema: "studio-layouts/1", maxBytes: LAYOUTS_MAX_BYTES, validate: validateLayouts, list: "layouts", forbidden: "Only this Studio can save its layouts", tooBig: "Layouts are limited to 256 KB" })
const scenarios = () => savedFile({ file: "scenarios.json", route: "/__studio/scenarios", schema: "studio-scenarios/1", maxBytes: SCENARIOS_MAX_BYTES, validate: (data) => validateScenarios(data), list: "scenarios", forbidden: "Only this Studio can save its scenarios", tooBig: "Saved scenarios are limited to 256 KB" })

// npm run acceptance builds the stress and capture-only adapters by pointing
// "@/adapter" at the acceptance module; a normal build never includes them.
const acceptance = process.env.VITE_STUDIO_ADAPTER ? [{ find: /^@\/adapter$/, replacement: path.resolve(root, process.env.VITE_STUDIO_ADAPTER === "example" ? "src/adapters/example.ts" : "src/adapters/synthetic.ts") }] : []

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), title(), layouts(), scenarios()],
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
    alias: [...acceptance, { find: "@", replacement: path.resolve(root, "./src") }],
  },
})
