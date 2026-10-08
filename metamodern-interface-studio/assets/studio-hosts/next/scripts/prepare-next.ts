/** Explicit build-time resolution. Generated files are shell-owned; product maps stay under src/. */
import { prepareIconProfile } from "./icon-profile.mjs"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseAst } from "vite"
import { astLang, definedModules, undeclaredDefinitions, workspaceProblems } from "../src/studio/workspace/declaration"
import { definedDocs, libraryProblems, undeclaredDocs } from "../src/studio/library/model"
import { ownedSavedFiles, writeSavedSources } from "./saved-sources"
import { savedFileSnapshot } from "./saved-file"
import { DIRECTIONS_MAX_BYTES, validateDirections } from "../src/studio/directions"
const { default: productConfig } = await import(pathToFileURL(path.resolve("studio.config.ts")).href)
const savedPaths = ownedSavedFiles(process.cwd(), productConfig)
writeSavedSources(process.cwd(), Object.values(savedPaths))
const iconProfile = prepareIconProfile(process.cwd())
mkdirSync("public", { recursive: true })
writeFileSync("public/studio-icon-profile.json", JSON.stringify(iconProfile.profile, null, 2) + "\n")
const variant = process.env.STUDIO_ADAPTER ?? process.env.VITE_STUDIO_ADAPTER
const library = ["editor", "library", "sections", "static"].includes(variant ?? "")
const workspace = variant === "workspace" || library
const adapter = variant === "editor" ? "example/design-adapter.ts" : variant === "static" ? "example/static-adapter.ts" : variant === "sections" ? "example/library/sections.ts" : library ? "example/library/adapter.ts" : workspace ? "example/workspace/adapter.ts" : variant === "example" ? "src/adapters/example.ts" : variant ? "src/adapters/synthetic.ts" : "src/adapter.ts"
const workspaceMap = workspace ? variant === "static" ? "example/workspace/static.ts" : "example/workspace/index.ts" : "src/workspace/index.ts"
const libraryMap = library ? variant === "static" ? "example/library/static.ts" : "example/library/index.ts" : "src/library/index.ts"
mkdirSync(".studio-generated", { recursive: true })
const bundled = (name: string) => existsSync(`${name}.json`) ? JSON.parse(readFileSync(`${name}.json`, "utf8")) as unknown : undefined
writeFileSync(".studio-generated/runtime.ts", `export const bundled = ${JSON.stringify({ variant, workspace: true, library: true, scenarios: bundled("scenarios"), layouts: bundled("layouts"), directions: savedFileSnapshot({ file: savedPaths.directions, maxBytes: DIRECTIONS_MAX_BYTES, validate: validateDirections }) })}\n`)
writeFileSync(".studio-generated/selection.json", JSON.stringify({ "@studio/icon-glyphs": "./.studio-generated/icon-glyphs.ts", "@studio/icon-profile": "./.studio-generated/icon-profile.ts", "@/adapter": `./${adapter}`, "@/workspace": `./${workspaceMap}`, "@/library": `./${libraryMap}`, ...(variant === "editor" ? { "@/design-ui": "./example/design-ui/loaders.ts", "@/design-runtime": "./example/design-runtime/loaders.ts" } : {}) }))
const { adapter: declaration } = await import(pathToFileURL(path.resolve(adapter)).href)
const problems = [...workspaceProblems(declaration.workspace), ...libraryProblems(declaration.library)]
if (existsSync(workspaceMap)) {
  const defined = definedModules(parseAst(readFileSync(workspaceMap, "utf8"), { lang: astLang(workspaceMap) }))
  if (typeof defined === "string") problems.push(defined)
  else problems.push(...undeclaredDefinitions(declaration.workspace, defined))
}
if (existsSync(libraryMap)) {
  const defined = definedDocs(parseAst(readFileSync(libraryMap, "utf8"), { lang: astLang(libraryMap) }))
  if (typeof defined === "string") problems.push(defined)
  else problems.push(...undeclaredDocs(declaration.library, defined))
}
if (problems.length) throw new Error(`Invalid Studio declarations: ${problems.join("; ")}`)
// POST routes never reach static exports. Production Node route rejects writes as well.
const route = "app/%5F%5Fstudio/[file]/route.ts"
const routeSource = '// Generated Studio saved-file service.\nexport { GET, POST } from "../../saved-route"\nexport const dynamic = "force-dynamic"\nexport const runtime = "nodejs"\n'
if (existsSync(route) && readFileSync(route, "utf8") !== routeSource) throw new Error(`Product file collides with generated service: ${route}`)
if (process.env.STUDIO_STATIC === "1") rmSync(route, { force: true })
else {
  mkdirSync(path.dirname(route), { recursive: true })
  writeFileSync(route, routeSource)
}
if (variant === "editor") { mkdirSync("public/example/design-runtime", { recursive: true }); cpSync("example/design-runtime/assets.css", "public/example/design-runtime/assets.css") }
const { default: config } = await import(pathToFileURL(path.resolve("studio.config.ts")).href)
// This directory is host-generated preview output (already ignored), never authored product assets.
// Clear prior profile chunks so a Free-to-Pro build cannot redistribute stale Free geometry.
rmSync("public/assets", { recursive: true, force: true })
if (Object.keys(config.inputs ?? {}).length) execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--config", "scripts/preview.vite.ts"], { stdio: "inherit" })
