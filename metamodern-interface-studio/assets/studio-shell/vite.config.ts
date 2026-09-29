import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import config from "./studio.config"
import type { StudioConfig } from "./src/studio/config"

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

// npm run acceptance builds the stress and capture-only adapters by pointing
// "@/adapter" at the acceptance module; a normal build never includes them.
const acceptance = process.env.VITE_STUDIO_ADAPTER ? [{ find: /^@\/adapter$/, replacement: path.resolve(root, "src/adapters/synthetic.ts") }] : []

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), title()],
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
