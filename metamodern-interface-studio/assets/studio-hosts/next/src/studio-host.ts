import type { StudioHost } from "./studio/host"
import { bundled } from "../.studio-generated/runtime"
export const host: StudioHost = { id: "next", canSave: process.env.NODE_ENV === "development", ...bundled }

export const workspaceEnabled = bundled.workspace
export const libraryEnabled = bundled.library

/** Resolve live development saved-state links before the browser-owned store imports and reads location.hash. */
export async function initializeHost() {
  if (!host.canSave) return
  const [scenarios, layouts] = await Promise.all(["scenarios", "layouts"].map(async name => {
    try {
      const response = await fetch(`/__studio/${name}`, { cache: "no-store" })
      return response.ok ? await response.json() as unknown : undefined
    } catch { return undefined }
  }))
  host.scenarios = scenarios
  host.layouts = layouts
}
