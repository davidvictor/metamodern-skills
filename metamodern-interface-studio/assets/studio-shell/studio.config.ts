/*
 * This Studio's product settings. The file belongs to the product: the shell
 * update (scripts/update-studio.mjs in the skill) creates it once and never
 * changes it. Everything the build needs to know about the product lives here,
 * so the shell's own files stay unedited and can be replaced by an update.
 */
import type { StudioConfig } from "./src/studio/config"

export default {
  title: "Interface Studio",
  outDir: "dist",
  // The example product's preview entry. Remove it with example/ once the adapter points at the product.
  inputs: { example: "example/index.html" },
} satisfies StudioConfig
