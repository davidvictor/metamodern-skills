import path from "node:path"
import { savedFileRequest, isSavedFileName } from "../scripts/saved-file"
import { LAYOUTS_MAX_BYTES, validateLayouts } from "../src/studio/layouts"
import { SCENARIOS_MAX_BYTES, validateScenarios } from "../src/studio/scenarios"
const files = {
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
  return savedFileRequest({ ...options, file: path.resolve(`${file}.json`), forbidden: `Only this Studio can save its ${file}`, tooBig: "Saved files are limited to 256 KB" }, request)
}
export const GET = serve
export const POST = serve
