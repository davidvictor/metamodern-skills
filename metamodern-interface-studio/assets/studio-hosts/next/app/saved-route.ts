import path from "node:path"
import config from "../studio.config"
import { ownedSavedFiles } from "../scripts/saved-sources"
import { savedFileRequest, isSavedFileName } from "../scripts/saved-file"
import { LAYOUTS_MAX_BYTES, validateLayouts } from "../src/studio/layouts"
import { SCENARIOS_MAX_BYTES, validateScenarios } from "../src/studio/scenarios"
import { DIRECTIONS_MAX_BYTES, validateDirections, validateDirectionTransition } from "../src/studio/directions"
const files = {
  directions: { schema: "studio-directions/1", list: "revisions", maxBytes: DIRECTIONS_MAX_BYTES, validate: validateDirections, validateTransition: validateDirectionTransition, requireRevision: true, empty: () => ({ schema: "studio-directions/1", revisions: [], events: [] }) },
  layouts: { schema: "studio-layouts/1", list: "layouts", maxBytes: LAYOUTS_MAX_BYTES, validate: validateLayouts },
  scenarios: { schema: "studio-scenarios/1", list: "scenarios", maxBytes: SCENARIOS_MAX_BYTES, validate: validateScenarios },
}
type Context = { params: Promise<{ file: string }> }
async function serve(request: Request, context: Context) {
  const { file } = await context.params
  if (!isSavedFileName(file)) return Response.json({ error: "Unknown saved file" }, { status: 404 })
  // Local development only: deployed writes are neither offered nor treated as durable.
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Saved files are read-only in review builds" }, { status: 405 })
  const options = files[file]
  return savedFileRequest({ ...options, file: file === "directions" ? ownedSavedFiles(process.cwd(), config).directions : path.resolve(`${file}.json`), forbidden: `Only this Studio can save its ${file}`, tooBig: file === "directions" ? "Saved directions are limited to 1 MB" : "Saved files are limited to 256 KB" }, request)
}
export const GET = serve
export const POST = serve
