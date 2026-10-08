import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { StudioConfig } from "../src/studio/config"
export function ownedSavedFiles(root: string, config: Partial<StudioConfig> = {}) {
  const configured = config.savedFiles?.directions ?? "directions.json"
  if (!/^[a-zA-Z0-9._ /-]+\.json$/.test(configured) || path.isAbsolute(configured)) throw new Error("Saved directions path must be a portable relative JSON path inside this Studio")
  const directions = path.resolve(root, configured)
  const relative = path.relative(root, directions)
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("Saved directions path cannot leave this Studio")
  return { directions, layouts: path.resolve(root, "layouts.json"), scenarios: path.resolve(root, "scenarios.json") }
}
/** Mirrors the transport's basename.PID.UUID.tmp family; never suppresses unrelated JSON/source files. */
export const savedTempGlob = (file: string) => `${file}.[0-9]*.????????-????-????-????-????????????.tmp`
/** Tailwind's scanner must not treat user state or atomic-write artifacts as CSS source/HMR dependencies. */
export function writeSavedSources(root: string, files: readonly string[]) {
  const dir = path.resolve(root, ".studio-generated"), file = path.join(dir, "saved-sources.css")
  const marker = "/* studio-saved-sources/1: generated data exclusions */"
  const rules = files.flatMap(file => { const relative = path.relative(dir, file).split(path.sep).join("/"); return [relative, savedTempGlob(relative)].map(pattern => `@source not ${JSON.stringify(pattern)};`) })
  const content = `${marker}\n${rules.join("\n")}\n`
  if (existsSync(file)) { const previous = readFileSync(file, "utf8"); if (!previous.startsWith(marker)) throw new Error("Product file collides with generated saved-sources.css"); if (previous === content) return file }
  mkdirSync(dir, { recursive: true }); writeFileSync(file, content); return file
}
