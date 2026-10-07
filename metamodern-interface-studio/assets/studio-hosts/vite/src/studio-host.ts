import type { StudioHost } from "./studio/host"
declare const __STUDIO_WORKSPACE__: boolean
declare const __STUDIO_LIBRARY__: boolean
export const host: StudioHost = {
  id: "vite",
  canSave: import.meta.env.DEV,
  variant: import.meta.env.VITE_STUDIO_ADAPTER,
  scenarios: Object.values(import.meta.glob("/scenarios.json", { eager: true, import: "default" }))[0],
  layouts: Object.values(import.meta.glob("/layouts.json", { eager: true, import: "default" }))[0],
  workspace: __STUDIO_WORKSPACE__,
  library: __STUDIO_LIBRARY__,
}

export const workspaceEnabled = __STUDIO_WORKSPACE__
export const libraryEnabled = __STUDIO_LIBRARY__
