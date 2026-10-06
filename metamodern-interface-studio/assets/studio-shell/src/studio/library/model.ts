/*
 * The component library read as data (references/library.md): the declaration's problems, its groups and search,
 * where previews may load from, documentation checks, playground values, and which previews hold a live frame.
 * Pure (types-only imports), so vite.config.ts and node tests load it.
 */
import type { InputValue, LibraryComponent, LibraryDeclaration, LibraryGroup } from "../types"
import type { ComponentDocs, PlaygroundProperty, PreviewGroup } from "./schema"

/** The sections of every component page, in order. `id` is the anchor and the link's `section=` (link.ts lists the same IDs). */
export const SECTIONS = [
  { id: "preview", key: "preview", label: "Preview" },
  { id: "when-to-use", key: "whenToUse", label: "When to use" },
  { id: "when-not-to-use", key: "whenNotToUse", label: "When not to use" },
  { id: "usage", key: "usage", label: "Usage" },
  { id: "examples", key: "examples", label: "Examples" },
  { id: "api", key: "api", label: "API reference" },
  { id: "keyboard", key: "keyboard", label: "Keyboard" },
  { id: "accessibility", key: "accessibility", label: "Accessibility" },
  { id: "motion", key: "motion", label: "Motion" },
  { id: "responsive", key: "responsive", label: "Responsive behavior" },
  { id: "performance", key: "performance", label: "Performance" },
  { id: "notes-for-ai", key: "notesForAI", label: "Notes for AI" },
] as const satisfies readonly { id: string; key: keyof ComponentDocs; label: string }[]
export type SectionId = (typeof SECTIONS)[number]["id"]

export const LIBRARY_LABEL = "Library"
/** Live frames a library page holds at once; the other previews wait as placeholders of their own size. */
export const LIVE_FRAMES = 4
/** The width Phone width switches a preview to, in CSS pixels. */
export const MOBILE_WIDTH = 390
/** How near the viewport a preview mounts its frame, in CSS pixels. */
export const NEAR_PX = 400
export const NO_FRAME = "This Studio has no preview entry (frameEntry in the adapter), so library previews show their code and captures only."
export const noDocs = (id: string) => `No documentation for "${id}" in src/library/index.ts. Add it with defineLibrary.`

const ID = /^[a-z][a-z0-9-]*$/
const PROPERTY = /^[a-z][a-zA-Z0-9]*$/
const MAX_SIDE = 4000
const MAX_TEXT = 500

/** Problems with the declaration itself. The build fails on any. */
export function libraryProblems(decl: LibraryDeclaration | undefined): string[] {
  if (!decl) return []
  const out: string[] = []
  if (!decl.groups.length) out.push("The library declares no groups")
  if (!decl.components.length) out.push("The library declares no components")
  const groups = new Set<string>()
  for (const g of decl.groups) {
    if (!ID.test(g.id)) out.push(`Group ID "${g.id}" must be lowercase letters, digits and hyphens`)
    if (groups.has(g.id)) out.push(`Group ID "${g.id}" is declared twice`)
    if (!g.label.trim()) out.push(`Group "${g.id}" has no label`)
    groups.add(g.id)
  }
  const ids = new Set<string>()
  for (const c of decl.components) {
    if (!ID.test(c.id)) out.push(`Component ID "${c.id}" must be lowercase letters, digits and hyphens`)
    if (ids.has(c.id)) out.push(`Component ID "${c.id}" is declared twice`)
    ids.add(c.id)
    if (!c.label.trim()) out.push(`Component "${c.id}" has no label`)
    if (!groups.has(c.group)) out.push(`Component "${c.id}" names group "${c.group}", which the library does not declare`)
    if (c.summary.length > 200) out.push(`Component "${c.id}" has a summary over 200 characters`)
  }
  return out
}

export type LibraryEntry = LibraryGroup & { components: LibraryComponent[] }
/** Groups in declared order, each with its components (of `list`) in declared order; empty groups are left out. */
export function groupedComponents(decl: LibraryDeclaration | undefined, list: LibraryComponent[] = decl?.components ?? []): LibraryEntry[] {
  if (!decl) return []
  return decl.groups.map((g) => ({ ...g, components: list.filter((c) => c.group === g.id) })).filter((g) => g.components.length > 0)
}

/** Components whose label, ID, summary, keywords or group label contain every word of the query. */
export function filterComponents(decl: LibraryDeclaration | undefined, query: string): LibraryComponent[] {
  if (!decl) return []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return decl.components
  const groupLabel = new Map(decl.groups.map((g) => [g.id, g.label]))
  return decl.components.filter((c) => {
    const text = [c.label, c.id, c.summary, ...(c.keywords ?? []), groupLabel.get(c.group) ?? ""].join(" ").toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** Component IDs src/library/index.ts documents that the adapter does not declare. The build fails on any. */
export function undeclaredDocs(decl: LibraryDeclaration | undefined, defined: string[]) {
  const declared = new Set((decl?.components ?? []).map((c) => c.id))
  return defined.filter((id) => !declared.has(id))
}

type AstNode = { type?: string; [key: string]: unknown }
type AstProperty = { type?: string; computed?: boolean; key?: { type?: string; name?: string; value?: unknown } }

/**
 * The component IDs src/library/index.ts passes to defineLibrary, read from its parsed ESTree program (vite.config.ts
 * parses it with parseAst), or why they cannot be read. The build fails on a reason.
 */
export function definedDocs(program: unknown): string[] | string {
  const found: { ids: string[] | null; problem: string | null } = { ids: null, problem: null }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || found.problem) return
    if (Array.isArray(node)) return node.forEach(visit)
    const n = node as AstNode & { callee?: { type?: string; name?: string }; arguments?: unknown[] }
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && n.callee.name === "defineLibrary") {
      if (found.ids) {
        found.problem = "defineLibrary is called more than once; list every component in one call"
        return
      }
      const arg = n.arguments?.[0] as { type?: string; properties?: AstProperty[] } | undefined
      if (arg?.type !== "ObjectExpression") {
        found.problem = "defineLibrary takes an object literal of component IDs"
        return
      }
      found.ids = []
      for (const p of arg.properties ?? []) {
        if (p.type !== "Property" || p.computed || !p.key || (p.key.type !== "Identifier" && typeof p.key.value !== "string")) {
          found.problem = "defineLibrary keys must be plain component IDs, without spreads or computed keys"
          return
        }
        found.ids.push(p.key.type === "Identifier" ? String(p.key.name) : String(p.key.value))
      }
    }
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value)
  }
  visit(program)
  return found.problem ?? found.ids ?? "the file does not call defineLibrary"
}

export type PreviewSource = { src: string; origin?: string } | { unavailable: string }
/**
 * Where library previews load from: `library.entry`, else `frameEntry`, resolved against the Studio page, and only on
 * the frame entry's own origin (and `frameOrigin` when it names one). Documentation never names a URL, so the origin
 * every frame message is checked against is always the adapter's.
 */
export function previewSource(a: { frameEntry?: string; frameOrigin?: string; library?: LibraryDeclaration }, page: string): PreviewSource {
  if (!a.frameEntry) return { unavailable: NO_FRAME }
  let frame: URL
  let entry: URL
  try {
    frame = new URL(a.frameEntry, page)
    entry = new URL(a.library?.entry ?? a.frameEntry, page)
  } catch {
    return { unavailable: `The library's preview entry ${JSON.stringify(a.library?.entry ?? a.frameEntry)} is not a URL, so no preview loads.` }
  }
  const declared = a.frameOrigin && a.frameOrigin !== "null" ? a.frameOrigin : null
  if (entry.origin !== frame.origin || (declared && entry.origin !== declared) || !/^(https?|file):$/.test(entry.protocol))
    return { unavailable: `The library's preview entry must be on the frame entry's origin (${declared ?? frame.origin}); ${entry.href} is not, so no preview loads.` }
  return { src: entry.href, origin: a.frameOrigin }
}

/** A capture's image URL: on the Studio's own origin, or an inline data image; anything else is refused (null). */
export function captureSource(src: string, page: string): string | null {
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(src)) return src
  try {
    const url = new URL(src, page)
    return url.origin === new URL(page).origin && /^(https?|file):$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/** A playground value as a frame may receive it, or undefined when the property cannot take it. */
export function playgroundValue(p: PlaygroundProperty, value: unknown): InputValue | undefined {
  if (p.kind === "switch") return typeof value === "boolean" ? value : undefined
  if (p.kind === "text") return typeof value === "string" && value.length <= (p.maxLength ?? MAX_TEXT) && !/[\r\n]/.test(value) ? value : undefined
  if (p.kind === "select") return typeof value === "string" && p.options.some((o) => o.id === value) ? value : undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value < (p.min ?? -Infinity) || value > (p.max ?? Infinity)) return undefined
  if (!p.step || p.step <= 0) return value
  const base = p.min ?? 0
  const snapped = Number((base + Math.round((value - base) / p.step) * p.step).toFixed(10))
  // Rounding up can pass max when the range is not a whole number of steps: take the last step inside it.
  return snapped > (p.max ?? Infinity) ? Number((snapped - p.step).toFixed(10)) : snapped
}

/** Every declared property's value for the frame: the person's edit when it is valid, else the default. Nothing else is sent. */
export function playgroundValues(props: PlaygroundProperty[], edits: Record<string, unknown> | undefined): Record<string, InputValue> {
  const out: Record<string, InputValue> = {}
  for (const p of props) {
    const own = edits && Object.prototype.hasOwnProperty.call(edits, p.id) ? playgroundValue(p, edits[p.id]) : undefined
    const value = own ?? playgroundValue(p, p.default)
    if (value !== undefined) out[p.id] = value
  }
  return out
}

/** Problems with a documentation module's default export; the page lists them instead of rendering broken documentation. */
export function docsProblems(docs: unknown): string[] {
  if (!docs || typeof docs !== "object") return ["The documentation module's default export is not an object"]
  const d = docs as ComponentDocs
  if (!d.preview || !Array.isArray(d.preview.groups)) return ["The documentation has no preview (preview.groups)"]
  const out: string[] = []
  const size = (where: string, x: { width: number; height: number; mobileHeight?: number }) => {
    for (const [name, v] of [["width", x.width], ["height", x.height], ["mobileHeight", x.mobileHeight ?? 1]] as const)
      if (!Number.isInteger(v) || v < 1 || v > MAX_SIDE) out.push(`${where}: ${name} must be a whole number of pixels from 1 to ${MAX_SIDE}`)
  }
  const scenario = (where: string, s: unknown) => {
    if (typeof s !== "string" || !s.trim() || s.length > 200 || [...s].some((ch) => ch.charCodeAt(0) < 32)) out.push(`${where}: scenario must be a short string`)
  }
  const ids = new Set<string>()
  const group = (where: string, g: PreviewGroup) => {
    const at = `${where} "${g.id}"`
    if (!ID.test(g.id)) out.push(`${at}: ID must be lowercase letters, digits and hyphens`)
    if (g.id === "playground") out.push(`${at}: the ID is reserved for the playground`)
    if (ids.has(g.id)) out.push(`${at} is listed twice`)
    ids.add(g.id)
    size(at, g)
    if (g.capture) {
      if (!g.capture.alt?.trim()) out.push(`${at}: a capture needs alt text`)
    } else scenario(at, g.scenario)
  }
  for (const g of d.preview.groups) group("Preview group", g)
  for (const g of d.examples?.items ?? []) group("Example", g)
  const pg = d.preview.playground
  if (pg) {
    size("Playground", pg)
    scenario("Playground", pg.scenario)
    const seen = new Set<string>()
    for (const p of pg.properties) {
      if (!PROPERTY.test(p.id)) out.push(`Playground property "${p.id}" must start with a lowercase letter and use only letters and digits`)
      if (seen.has(p.id)) out.push(`Playground property "${p.id}" is listed twice`)
      seen.add(p.id)
      if (playgroundValue(p, p.default) === undefined) out.push(`Playground property "${p.id}": its default is not a value it accepts`)
    }
  }
  return out
}

/** Which previews hold a live frame: near ones only, the playground first, then the nearest, at most `cap`. */
export function pickLive(slots: { id: string; near: boolean; distance: number; pinned?: boolean }[], cap = LIVE_FRAMES): Set<string> {
  const near = slots.filter((s) => s.near).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.distance - b.distance || a.id.localeCompare(b.id))
  return new Set(near.slice(0, Math.max(0, cap)).map((s) => s.id))
}

/** The profile library frames mount with: the adapter's default, else the first that is not a phone, else the first. */
export function libraryProfile(profiles: { id: string; kind?: string }[], preferred?: string) {
  return profiles.find((p) => p.id === preferred)?.id ?? profiles.find((p) => p.kind !== "phone")?.id ?? profiles[0]?.id ?? ""
}
