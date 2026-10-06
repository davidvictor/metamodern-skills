import * as React from "react"
import type { WorkspaceOperationUse } from "../types"

/** The open module as its components see it (useModule). */
export type ModuleInfo = {
  id: string
  label: string
  sections: { id: string; label: string }[]
  /** The open section, or null for a module without sections. */
  section: string | null
  /** Opens another section of this module and clears the item. Its Page stays mounted, so unsaved changes are kept. */
  go: (section: string) => void
  /**
   * The item the module shows, carried in the link as `item=` (up to 128 of A-Z, a-z, 0-9, ".", "_", ":" and "-"), or
   * null. The shell does not check that the item exists; the module does, and can show its own notice.
   */
  item: string | null
  /**
   * Shows another item, or none. It replaces the current history entry instead of adding one, so stepping through
   * many items never fills Back. An ID that is not an item ID is dropped with a console error.
   */
  setItem: (item: string | null) => void
  uses: WorkspaceOperationUse[]
  /** The adapter's operations base URL. */
  operations?: string
}

export const ModuleContext = React.createContext<ModuleInfo | null>(null)
