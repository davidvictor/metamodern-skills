/** Build product-owned preview entries as isolated documents, with no Studio stylesheet. */
import { existsSync } from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import config from "../studio.config"
const root = process.cwd()
const inputs = { ...(config.inputs ?? {}), ...(existsSync("example/library/frame.html") ? { library: "example/library/frame.html" } : {}) }
export default defineConfig({
  root, publicDir: false, base: "./", plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(root, "src"), "@studio/design-ui": path.resolve(root, "src/studio/design-ui/api.ts"), "@studio/kit": path.resolve(root, "src/kit/index.ts"), "@studio/library": path.resolve(root, "src/studio/library/api.ts"), "@studio/workspace": path.resolve(root, "src/studio/workspace/api.ts") } },
  build: { outDir: "public", emptyOutDir: false, rolldownOptions: { input: Object.fromEntries(Object.entries(inputs).map(([id, file]) => [id, path.resolve(root, file)])) } },
})
