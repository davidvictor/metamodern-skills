/** Framework-neutral runtime data. Host overlays resolve optional build inputs and write capabilities. */
export type StudioHost = {
  id: "vite" | "next"
  canSave: boolean
  variant?: string
  scenarios?: unknown
  layouts?: unknown
  directions?: unknown
  workspace: boolean
  library: boolean
}

/** Adapter preflight evaluates host-using data modules without rendering optional layers. */
export const adapterPreflightDefines = (defines: Record<string, string>) => ({ ...defines, __STUDIO_WORKSPACE__: "false", __STUDIO_LIBRARY__: "false" })
