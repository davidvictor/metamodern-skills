/*
 * Reads a workspace place from a link: `module=` and `section=`. Pure and small, because the core shell
 * reads links with it before any workspace code loads.
 */
import type { WorkspaceDeclaration } from "../types"

export type ModuleLink = { module: string | null; section: string | null; unknown?: string }

/** A section the module lacks falls back to its first; a module the Studio lacks is reported as `unknown`. */
export function parseModuleLink(hash: string, decl: WorkspaceDeclaration | undefined): ModuleLink {
  const q = new URLSearchParams(hash.replace(/^#/, ""))
  const id = q.get("module")
  if (!id) return { module: null, section: null }
  const m = decl?.modules.find((x) => x.id === id)
  if (!m) return { module: null, section: null, unknown: id }
  const section = q.get("section")
  return { module: m.id, section: m.sections?.some((x) => x.id === section) ? section : (m.sections?.[0]?.id ?? null) }
}
