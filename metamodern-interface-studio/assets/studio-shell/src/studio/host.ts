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
