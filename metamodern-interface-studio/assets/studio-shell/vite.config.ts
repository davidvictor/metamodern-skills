import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The Studio shell (index.html) and the example product's preview entry
// (example/index.html) build side by side. A real product serves its own
// preview entry; remove the example input when the adapter points elsewhere.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        studio: path.resolve(import.meta.dirname, "index.html"),
        example: path.resolve(import.meta.dirname, "example/index.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
