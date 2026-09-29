import { readFileSync, renameSync, writeFileSync } from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import config from "./studio.config"
import type { StudioConfig } from "./src/studio/config"
import { LAYOUTS_MAX_BYTES, validateLayouts } from "./src/studio/layouts"

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

// Saved Responsive layouts live in layouts.json at the Studio root, a product file. Only the dev
// server can write it: same-origin JSON, schema-checked, 256 KB at most, written atomically.
// A built Studio bundles the file and cannot save.
const layoutsFile = path.resolve(root, "layouts.json")
const layouts = (): Plugin => ({
  name: "studio-layouts",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__studio/layouts", (req, res) => {
      const send = (code: number, body: unknown) => {
        if (res.writableEnded) return
        res.statusCode = code
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify(body))
      }
      if (req.method === "GET") {
        try {
          return send(200, JSON.parse(readFileSync(layoutsFile, "utf8")))
        } catch {
          return send(200, { schema: "studio-layouts/1", layouts: [] })
        }
      }
      if (req.method !== "POST") return send(405, { error: "Use GET or POST" })
      const origin = req.headers.origin
      let sameOrigin = false
      try {
        sameOrigin = !!origin && new URL(origin).host === req.headers.host
      } catch {
        sameOrigin = false
      }
      if (!sameOrigin) return send(403, { error: "Only this Studio can save its layouts" })
      if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(415, { error: "Send JSON" })
      const chunks: Buffer[] = []
      let size = 0
      req.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > LAYOUTS_MAX_BYTES) {
          send(413, { error: "Layouts are limited to 256 KB" })
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
        const problems = validateLayouts(data)
        if (problems.length) return send(422, { error: "Not a valid studio-layouts/1 file", problems })
        const tmp = `${layoutsFile}.${process.pid}.tmp`
        writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
        renameSync(tmp, layoutsFile)
        send(200, { ok: true })
      })
    })
  },
  // Saving must not reload the Studio.
  handleHotUpdate({ file }) {
    if (path.resolve(file) === layoutsFile) return []
  },
})

// npm run acceptance builds the stress and capture-only adapters by pointing
// "@/adapter" at the acceptance module; a normal build never includes them.
const acceptance = process.env.VITE_STUDIO_ADAPTER ? [{ find: /^@\/adapter$/, replacement: path.resolve(root, "src/adapters/synthetic.ts") }] : []

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), title(), layouts()],
  build: {
    outDir: path.resolve(root, studio.outDir ?? "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        studio: path.resolve(root, "index.html"),
        ...Object.fromEntries(Object.entries(studio.inputs ?? {}).map(([name, file]) => [name, path.resolve(root, file)])),
      },
    },
  },
  resolve: {
    alias: [...acceptance, { find: "@", replacement: path.resolve(root, "./src") }],
  },
})
