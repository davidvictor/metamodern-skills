/*
 * The component library read as data (references/library.md): the declaration's problems, its groups and search,
 * where previews may load from, documentation checks, playground values, and which previews hold a live frame.
 * Pure (types-only imports), so vite.config.ts and node tests load it.
 */
import type { InputValue, LibraryComponent, LibraryDeclaration, LibraryGroup, LibrarySection } from "../types"
import type { ComponentDocs, PlaygroundProperty } from "./schema"

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
  const sections = new Set<string>()
  if (decl.sections !== undefined) {
    if (!Array.isArray(decl.sections) || !decl.sections.length) out.push("The library declares sections but lists none; leave sections out for a flat list")
    for (const x of Array.isArray(decl.sections) ? decl.sections : []) {
      if (!ID.test(x.id)) out.push(`Section ID "${x.id}" must be lowercase letters, digits and hyphens`)
      if (sections.has(x.id)) out.push(`Section ID "${x.id}" is declared twice`)
      if (typeof x.label !== "string" || !x.label.trim()) out.push(`Section "${x.id}" has no label`)
      sections.add(x.id)
    }
  }
  const groups = new Set<string>()
  for (const g of decl.groups) {
    if (!ID.test(g.id)) out.push(`Group ID "${g.id}" must be lowercase letters, digits and hyphens`)
    if (groups.has(g.id)) out.push(`Group ID "${g.id}" is declared twice`)
    if (!g.label.trim()) out.push(`Group "${g.id}" has no label`)
    if (decl.sections === undefined) {
      if (g.section !== undefined) out.push(`Group "${g.id}" names section "${g.section}", but the library declares no sections`)
    } else if (g.section === undefined) out.push(`Group "${g.id}" names no section; when the library declares sections every group needs one`)
    else if (!sections.has(g.section)) out.push(`Group "${g.id}" names section "${g.section}", which the library does not declare`)
    groups.add(g.id)
  }
  for (const x of sections) if (!decl.groups.some((g) => g.section === x)) out.push(`Section "${x}" holds no groups`)
  const ids = new Set<string>()
  for (const c of decl.components) {
    if (!ID.test(c.id)) out.push(`Component ID "${c.id}" must be lowercase letters, digits and hyphens`)
    if (ids.has(c.id)) out.push(`Component ID "${c.id}" is declared twice`)
    ids.add(c.id)
    if (!c.label.trim()) out.push(`Component "${c.id}" has no label`)
    if (!groups.has(c.group)) out.push(`Component "${c.id}" names group "${c.group}", which the library does not declare`)
    if (c.summary.length > 200) out.push(`Component "${c.id}" has a summary over 200 characters`)
    if (c.wide !== undefined && typeof c.wide !== "boolean") out.push(`Component "${c.id}": wide must be true or false`)
    if (c.alsoIn === undefined) continue
    if (!Array.isArray(c.alsoIn)) {
      out.push(`Component "${c.id}": alsoIn must be a list of group IDs`)
      continue
    }
    const also = new Set<string>()
    for (const g of c.alsoIn) {
      if (g === c.group) out.push(`Component "${c.id}" lists its home group "${g}" in alsoIn`)
      else if (!groups.has(g)) out.push(`Component "${c.id}" is also listed in group "${g}", which the library does not declare`)
      if (also.has(g)) out.push(`Component "${c.id}" lists group "${g}" in alsoIn twice`)
      also.add(g)
    }
  }
  return out
}

const listedIn = (c: LibraryComponent, group: string) => c.group === group || (Array.isArray(c.alsoIn) && c.alsoIn.includes(group))

export type LibraryEntry = LibraryGroup & { components: LibraryComponent[] }
/**
 * Groups in declared order (sections first, when there are sections), each with its components (of `list`) in declared
 * order, a cross-listed component in each group it names; empty groups are left out. With `home`, only home groups.
 */
export function groupedComponents(decl: LibraryDeclaration | undefined, list: LibraryComponent[] = decl?.components ?? [], home = false): LibraryEntry[] {
  if (!decl) return []
  const order = decl.sections?.length ? decl.sections.flatMap((x) => decl.groups.filter((g) => g.section === x.id)) : decl.groups
  return order.map((g) => ({ ...g, components: list.filter((c) => (home ? c.group === g.id : listedIn(c, g.id))) })).filter((g) => g.components.length > 0)
}

export type LibraryBranch = LibrarySection & { groups: LibraryEntry[] }
/** With sections: each section in declared order with its non-empty groups (as groupedComponents); empty sections are left out. Null without sections. */
export function sectionedComponents(decl: LibraryDeclaration | undefined, list: LibraryComponent[] = decl?.components ?? []): LibraryBranch[] | null {
  if (!decl?.sections?.length) return null
  const groups = groupedComponents(decl, list)
  return decl.sections.map((x) => ({ ...x, groups: groups.filter((g) => g.section === x.id) })).filter((x) => x.groups.length > 0)
}

/** A component's home: its section (with sections), its group and itself, for the breadcrumb and Go to. */
export function homePath(decl: LibraryDeclaration | undefined, id: string | null) {
  const component = decl?.components.find((c) => c.id === id)
  const group = component && decl?.groups.find((g) => g.id === component.group)
  const section = group && decl?.sections?.find((x) => x.id === group.section)
  return { section, group, component }
}

/** Components whose label, ID, summary, keywords, or the labels of the groups listing it and their sections, contain every word of the query. */
export function filterComponents(decl: LibraryDeclaration | undefined, query: string): LibraryComponent[] {
  if (!decl) return []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return decl.components
  const sectionLabel = new Map((decl.sections ?? []).map((x) => [x.id, x.label]))
  const groupLabels = new Map(decl.groups.map((g) => [g.id, [g.label, g.section ? (sectionLabel.get(g.section) ?? "") : ""]]))
  return decl.components.filter((c) => {
    const text = [c.label, c.id, c.summary, ...(c.keywords ?? []), ...[c.group, ...(Array.isArray(c.alsoIn) ? c.alsoIn : [])].flatMap((g) => groupLabels.get(g) ?? [])].join(" ").toLowerCase()
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

type Loose = Record<string, unknown>
const isObj = (x: unknown): x is Loose => !!x && typeof x === "object" && !Array.isArray(x)
const INLINE_KEYS = ["code", "strong", "em", "kbd"] as const
const KINDS = new Set(["text", "select", "switch", "number"])

/**
 * Problems with a documentation module's default export; the page lists them instead of rendering broken documentation.
 * Never throws: every nested shape is checked before it is read. With `declared`, an inline reference to a component the
 * library does not declare is a problem too (the page would otherwise draw a reference that opens nothing).
 */
export function docsProblems(docs: unknown, declared?: readonly string[]): string[] {
  try {
    return checkDocs(docs, declared)
  } catch (e) {
    return [`The documentation could not be checked: ${e instanceof Error ? e.message : String(e)}`]
  }
}

function checkDocs(docs: unknown, declared?: readonly string[]): string[] {
  if (!isObj(docs)) return ["The documentation module's default export is not an object"]
  const d = docs as Loose
  const preview = d.preview
  if (!isObj(preview) || !Array.isArray(preview.groups)) return ["The documentation has no preview (preview.groups)"]
  const out: string[] = []
  const known = declared ? new Set(declared) : null
  const str = (v: unknown) => typeof v === "string"
  const optStr = (where: string, name: string, v: unknown) => {
    if (v !== undefined && !str(v)) out.push(`${where}: ${name} must be a string`)
  }
  const text = (where: string, t: unknown) => {
    if (str(t)) return
    if (!Array.isArray(t)) return void out.push(`${where}: text must be a string or a list of inline runs`)
    for (const r of t) {
      if (str(r)) continue
      if (!isObj(r)) {
        out.push(`${where}: an inline run must be a string or an object`)
        continue
      }
      if ("component" in r) {
        if (!str(r.component) || !ID.test(r.component as string)) out.push(`${where}: a component reference needs a component ID`)
        else if (known && !known.has(r.component as string)) out.push(`${where}: refers to component "${r.component}", which the library does not declare`)
        optStr(where, "a reference's text", r.text)
        continue
      }
      const key = INLINE_KEYS.find((k) => k in r)
      if (!key || !str(r[key])) out.push(`${where}: an inline run must be one of code, strong, em, kbd or component with a string value`)
    }
  }
  const rich = (where: string, blocks: unknown) => {
    if (blocks === undefined) return
    if (!Array.isArray(blocks)) return void out.push(`${where}: rich text must be a list of blocks`)
    blocks.forEach((b, i) => {
      const at = `${where}, block ${i + 1}`
      if (!isObj(b)) return void out.push(`${at}: a block must be an object`)
      optStr(at, "adjusted", b.adjusted)
      switch (b.kind) {
        case "paragraph":
          return text(at, b.text)
        case "callout":
          if (b.tone !== "note" && b.tone !== "warning") out.push(`${at}: a callout's tone must be note or warning`)
          return text(at, b.text)
        case "code":
          if (!str(b.language) || !str(b.code)) out.push(`${at}: code needs a language and code as strings`)
          return optStr(at, "title", b.title)
        case "list":
          if (!Array.isArray(b.items)) return void out.push(`${at}: a list needs items`)
          for (const item of b.items) {
            if (isObj(item)) {
              text(at, item.text)
              optStr(at, "adjusted", item.adjusted)
            } else text(at, item)
          }
          return
        case "table":
          if (!Array.isArray(b.columns) || !b.columns.every(str)) out.push(`${at}: a table needs columns as strings`)
          if (!Array.isArray(b.rows)) return void out.push(`${at}: a table needs rows`)
          for (const row of b.rows) {
            if (!isObj(row) || !Array.isArray(row.cells)) {
              out.push(`${at}: each row needs cells`)
              continue
            }
            for (const cell of row.cells) text(at, cell)
            optStr(at, "adjusted", row.adjusted)
          }
          return
        default:
          out.push(`${at}: unknown block kind ${JSON.stringify(b.kind)}`)
      }
    })
  }
  const code = (where: string, c: unknown) => {
    if (c !== undefined && (!isObj(c) || !str(c.language) || !str(c.code))) out.push(`${where}: code needs a language and code as strings`)
  }
  const size = (where: string, x: Loose) => {
    for (const [name, v] of [["width", x.width], ["height", x.height], ["mobileHeight", x.mobileHeight ?? 1]] as const)
      if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > MAX_SIDE) out.push(`${where}: ${name} must be a whole number of pixels from 1 to ${MAX_SIDE}`)
  }
  const scenario = (where: string, s: unknown) => {
    if (typeof s !== "string" || !s.trim() || s.length > 200 || [...s].some((ch) => ch.charCodeAt(0) < 32)) out.push(`${where}: scenario must be a short string`)
  }
  const ids = new Set<string>()
  const group = (where: string, g: unknown, i: number) => {
    if (!isObj(g)) return void out.push(`${where} ${i + 1} is not an object`)
    const at = `${where} "${String(g.id)}"`
    if (!str(g.id) || !ID.test(g.id as string)) out.push(`${at}: ID must be lowercase letters, digits and hyphens`)
    if (g.id === "playground") out.push(`${at}: the ID is reserved for the playground`)
    if (str(g.id) && ids.has(g.id as string)) out.push(`${at} is listed twice`)
    if (str(g.id)) ids.add(g.id as string)
    if (!str(g.label)) out.push(`${at}: label must be a string`)
    optStr(at, "adjusted", g.adjusted)
    if (g.description !== undefined) text(at, g.description)
    code(at, g.code)
    size(at, g)
    if (g.capture !== undefined) {
      if (!isObj(g.capture) || !str(g.capture.src)) out.push(`${at}: a capture needs an image src`)
      else if (!str(g.capture.alt) || !(g.capture.alt as string).trim()) out.push(`${at}: a capture needs alt text`)
    } else scenario(at, g.scenario)
  }
  preview.groups.forEach((g, i) => group("Preview group", g, i))
  optStr("Preview", "adjusted", preview.adjusted)
  const examples = d.examples
  if (examples !== undefined) {
    if (!isObj(examples) || !Array.isArray(examples.items)) out.push("Examples: items must be a list of preview groups")
    else {
      examples.items.forEach((g, i) => group("Example", g, i))
      rich("Examples intro", examples.intro)
      optStr("Examples", "adjusted", examples.adjusted)
    }
  }
  const pg = preview.playground
  if (pg !== undefined) {
    if (!isObj(pg)) out.push("Playground: must be an object")
    else {
      size("Playground", pg)
      scenario("Playground", pg.scenario)
      code("Playground", pg.code)
      if (!Array.isArray(pg.properties)) out.push("Playground: properties must be a list")
      else {
        const seen = new Set<string>()
        for (const raw of pg.properties) {
          if (!isObj(raw)) {
            out.push("Playground: each property must be an object")
            continue
          }
          const id = String(raw.id)
          if (!str(raw.id) || !PROPERTY.test(id)) out.push(`Playground property "${id}" must start with a lowercase letter and use only letters and digits`)
          if (seen.has(id)) out.push(`Playground property "${id}" is listed twice`)
          seen.add(id)
          if (!str(raw.label)) out.push(`Playground property "${id}": label must be a string`)
          optStr(`Playground property "${id}"`, "description", raw.description)
          if (!KINDS.has(raw.kind as string)) {
            out.push(`Playground property "${id}": kind must be text, select, switch or number`)
            continue
          }
          if (raw.kind === "select" && (!Array.isArray(raw.options) || !raw.options.length || !raw.options.every((o) => isObj(o) && str(o.id) && str(o.label)))) {
            out.push(`Playground property "${id}": a select needs options, each with an ID and a label`)
            continue
          }
          if (raw.kind === "number" && (["min", "max", "step"] as const).some((k) => raw[k] !== undefined && !Number.isFinite(raw[k]))) {
            out.push(`Playground property "${id}": min, max and step must be numbers`)
            continue
          }
          if (raw.kind === "text" && raw.maxLength !== undefined && !(Number.isInteger(raw.maxLength) && (raw.maxLength as number) >= 0)) {
            out.push(`Playground property "${id}": maxLength must be a whole number`)
            continue
          }
          if (playgroundValue(raw as PlaygroundProperty, raw.default) === undefined) out.push(`Playground property "${id}": its default is not a value it accepts`)
        }
      }
    }
  }
  const api = d.api
  if (api !== undefined) {
    if (!isObj(api) || !Array.isArray(api.props)) out.push("API reference: props must be a list")
    else {
      api.props.forEach((row, i) => {
        if (!isObj(row) || !str(row.name) || !str(row.type)) return void out.push(`API reference, row ${i + 1}: needs a name and a type as strings`)
        optStr(`API reference "${row.name}"`, "default", row.default)
        optStr(`API reference "${row.name}"`, "adjusted", row.adjusted)
        text(`API reference "${row.name}"`, row.description)
      })
      rich("API reference notes", api.notes)
      optStr("API reference", "adjusted", api.adjusted)
    }
  }
  if (d.source !== undefined && (!isObj(d.source) || !str(d.source.name) || !str(d.source.version) || !str(d.source.notice))) out.push("Source: needs a name, version and notice as strings")
  for (const s of SECTIONS) {
    if (s.key === "preview" || s.key === "examples" || s.key === "api") continue
    const section = d[s.key]
    if (section === undefined) continue
    if (!isObj(section) || !Array.isArray(section.body)) {
      out.push(`${s.label}: needs a body of rich text`)
      continue
    }
    optStr(s.label, "adjusted", section.adjusted)
    rich(s.label, section.body)
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
