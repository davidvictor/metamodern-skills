/*
 * Reads a library place from a link: `library=` and `section=`. Pure and small, because the core shell reads links
 * with it before any library code loads.
 */
import type { LibraryDeclaration } from "../types"

/** The page sections a link may name, in order (model.ts lists them with their labels). */
export const SECTION_IDS = ["preview", "when-to-use", "when-not-to-use", "usage", "examples", "api", "keyboard", "accessibility", "motion", "responsive", "performance", "notes-for-ai"] as const

export type LibraryLink = { library: string | null; at: string | null; unknown?: string }

/** A module link wins; a section the page lacks is dropped; a component the library lacks is reported as `unknown`. */
export function parseLibraryLink(hash: string, decl: LibraryDeclaration | undefined): LibraryLink {
  const q = new URLSearchParams(hash.replace(/^#/, ""))
  const id = q.get("library")
  if (!id || q.get("module")) return { library: null, at: null }
  if (!decl?.components.some((c) => c.id === id)) return { library: null, at: null, unknown: id }
  const at = q.get("section")
  return { library: id, at: at && (SECTION_IDS as readonly string[]).includes(at) ? at : null }
}
