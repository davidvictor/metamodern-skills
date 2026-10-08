/** Product settings for a Studio's build, read by vite.config.ts from studio.config.ts. */
export type StudioConfig = {
  /** The page title in the browser tab and in link previews. */
  title: string
  /** Optional product-owned local direction journal path, relative to the Studio root. */
  savedFiles?: { directions?: string }
  /** Where `npm run build` writes, relative to the Studio. Defaults to dist. */
  outDir?: string
  /** Further pages built beside the Studio, such as a preview entry the Studio hosts. Keys name the output; paths are relative to the Studio. */
  inputs?: Record<string, string>
}
