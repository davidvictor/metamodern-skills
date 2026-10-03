import * as React from "react"
import type { WorkspaceOperationUse } from "../types"

/** The open module as its components see it (useModule). */
export type ModuleInfo = {
  id: string
  label: string
  sections: { id: string; label: string }[]
  /** The open section, or null for a module without sections. */
  section: string | null
  /** Opens another section of this module. Its Page stays mounted, so unsaved changes are kept. */
  go: (section: string) => void
  uses: WorkspaceOperationUse[]
  /** The adapter's operations base URL. */
  operations?: string
}

export const ModuleContext = React.createContext<ModuleInfo | null>(null)
