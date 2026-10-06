/*
 * Reads a workspace place from a link: `module=`, `section=` and `item=`. Pure and small, because the core shell
 * reads links with it before any workspace code loads.
 */
import type { WorkspaceDeclaration } from "../types"

export type ModuleLink = { module: string | null; section: string | null; item: string | null; unknown?: string }

/** An item ID a link may carry: up to 128 letters, digits, dots, underscores, colons and hyphens. The module decides what it names. */
export const ITEM_ID = /^[A-Za-z0-9._:-]{1,128}$/

/** The item when it is a valid ID; anything else is dropped with a console error, never carried. */
export function validItem(item: string | null | undefined): string | null {
  if (item === null || item === undefined || item === "") return null
  if (ITEM_ID.test(item)) return item
  console.error(`Interface Studio: workspace item ${JSON.stringify(item.slice(0, 160))} is not an item ID (up to 128 of A-Z, a-z, 0-9, ".", "_", ":" and "-"), so it was dropped from the link.`)
  return null
}

/** A section the module lacks falls back to its first; a module the Studio lacks is reported as `unknown`. */
export function parseModuleLink(hash: string, decl: WorkspaceDeclaration | undefined): ModuleLink {
  const q = new URLSearchParams(hash.replace(/^#/, ""))
  const id = q.get("module")
  if (!id) return { module: null, section: null, item: null }
  const m = decl?.modules.find((x) => x.id === id)
  if (!m) return { module: null, section: null, item: null, unknown: id }
  const section = q.get("section")
  return { module: m.id, section: m.sections?.some((x) => x.id === section) ? section : (m.sections?.[0]?.id ?? null), item: validItem(q.get("item")) }
}

/** The link of a workspace place: the module, its section and the item, in that order. */
export function moduleHash(place: { module: string; section: string | null; item: string | null }) {
  const q = new URLSearchParams()
  q.set("module", place.module)
  if (place.section) q.set("section", place.section)
  if (place.item) q.set("item", place.item)
  return `#${q}`
}
