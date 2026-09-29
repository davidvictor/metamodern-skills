/*
 * Responsive layouts: frames of one scenario at several sizes, their presets,
 * and the studio-layouts/1 file a Studio saves them in. Pure data, no DOM, so
 * the dev server (vite.config.ts) validates saves with the same rules.
 */

export type FrameKind = "desktop" | "laptop" | "tablet" | "phone"

export type ResponsiveFrame = {
  id: string
  w: number
  h: number
  /** The adapter profile this size counts as: it decides input context. */
  profile: string
  label?: string
  /** Canvas position at 100%, for canvas layouts. */
  x?: number
  y?: number
}

export type SyncChannels = { scroll: boolean; interaction: boolean; navigation: boolean }

export type ResponsiveLayout = {
  id: string
  name: string
  frames: ResponsiveFrame[]
  arrangement: "row" | "canvas"
  /** screen: each frame is its declared height. full: each grows to its content. */
  height: "screen" | "full"
  viewport?: { x: number; y: number; zoom: number }
  sync?: SyncChannels
}

export type LayoutsFile = { schema: "studio-layouts/1"; layouts: ResponsiveLayout[] }

/** At most this many live frames in one layout: each is a running copy of the product. */
export const MAX_FRAMES = 6
/** A full-page frame is cut here and says so. */
export const FULL_PAGE_MAX = 16384
export const LAYOUTS_MAX_BYTES = 256 * 1024
export const DEFAULT_SYNC: SyncChannels = { scroll: true, interaction: true, navigation: true }

/** A preset frame names a kind rather than a profile; the adapter's nearest profile of that kind is used. */
export type PresetFrame = { w: number; h: number; kind: FrameKind; label?: string; /** An adapter profile to count as, instead of the nearest of its kind. */ profile?: string }
export type Preset = { id: string; name: string; frames: PresetFrame[] }

export const SHELL_PRESETS: Preset[] = [
  { id: "phones", name: "Phones", frames: [{ w: 360, h: 780, kind: "phone", label: "Small phone" }, { w: 390, h: 844, kind: "phone", label: "Phone" }, { w: 430, h: 932, kind: "phone", label: "Large phone" }] },
  { id: "phone-tablet-laptop", name: "Phone, tablet, laptop", frames: [{ w: 390, h: 844, kind: "phone" }, { w: 834, h: 1112, kind: "tablet" }, { w: 1280, h: 800, kind: "laptop" }] },
  { id: "desktops", name: "Desktops", frames: [{ w: 1280, h: 800, kind: "desktop", label: "Small desktop" }, { w: 1440, h: 900, kind: "desktop", label: "Desktop" }, { w: 1920, h: 1080, kind: "desktop", label: "Large desktop" }] },
]

/** Sizes offered in Add frame beyond the adapter's profiles. */
export const SHELL_DEVICES: PresetFrame[] = [
  { w: 360, h: 780, kind: "phone", label: "Small phone" },
  { w: 390, h: 844, kind: "phone", label: "Phone" },
  { w: 430, h: 932, kind: "phone", label: "Large phone" },
  { w: 768, h: 1024, kind: "tablet", label: "Small tablet" },
  { w: 834, h: 1112, kind: "tablet", label: "Tablet" },
  { w: 1024, h: 1366, kind: "tablet", label: "Large tablet" },
  { w: 1280, h: 800, kind: "laptop", label: "Laptop" },
  { w: 1440, h: 900, kind: "desktop", label: "Desktop" },
  { w: 1920, h: 1080, kind: "desktop", label: "Large desktop" },
]

type ProfileLike = { id: string; w: number; h: number; kind: FrameKind }

/** The profile a size counts as: the exact profile if one matches, else the nearest width of the same kind, else the nearest width. */
export function nearestProfile(profiles: ProfileLike[], w: number, h: number, kind?: FrameKind) {
  const exact = profiles.find((p) => p.w === w && p.h === h)
  if (exact) return exact
  const pool = kind ? profiles.filter((p) => p.kind === kind) : []
  const from = pool.length ? pool : profiles
  return [...from].sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w))[0]
}

let seq = 0
export const frameId = (w: number, h: number) => `f${w}x${h}-${(seq++).toString(36)}`

export function fromPreset(preset: Preset, profiles: ProfileLike[]): ResponsiveLayout {
  return {
    id: preset.id,
    name: preset.name,
    arrangement: "row",
    height: "screen",
    frames: preset.frames.map((f) => ({ id: frameId(f.w, f.h), w: f.w, h: f.h, profile: profiles.some((p) => p.id === f.profile) ? f.profile! : nearestProfile(profiles, f.w, f.h, f.kind).id, ...(f.label ? { label: f.label } : {}) })),
  }
}

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "layout"

/** Frames in a link: `390x844:phone,834x1112:tablet`. Positions travel too for canvas layouts: `390x844:phone@40.60`. */
export function encodeFrames(frames: ResponsiveFrame[]) {
  return frames.map((f) => `${f.w}x${f.h}:${f.profile}${f.x !== undefined && f.y !== undefined ? `@${Math.round(f.x)}.${Math.round(f.y)}` : ""}`).join(",")
}
export function decodeFrames(text: string | null, profileIds: string[]): ResponsiveFrame[] | null {
  if (!text) return null
  const out: ResponsiveFrame[] = []
  for (const part of text.split(",").slice(0, MAX_FRAMES)) {
    const m = /^(\d{3,4})x(\d{3,5}):([\w.-]+)(?:@(-?\d+)\.(-?\d+))?$/.exec(part)
    if (!m || !profileIds.includes(m[3])) return null
    out.push({ id: frameId(+m[1], +m[2]), w: +m[1], h: +m[2], profile: m[3], ...(m[4] !== undefined ? { x: +m[4], y: +m[5] } : {}) })
  }
  return out.length ? out : null
}

const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v)

/** Validate a studio-layouts/1 document. Returns the problems; an empty list means it is valid. */
export function validateLayouts(data: unknown): string[] {
  const problems: string[] = []
  if (!data || typeof data !== "object") return ["The file is not a JSON object"]
  const d = data as Partial<LayoutsFile>
  if (d.schema !== "studio-layouts/1") problems.push("schema must be studio-layouts/1")
  if (!Array.isArray(d.layouts)) return [...problems, "layouts must be a list"]
  if (d.layouts.length > 100) problems.push("at most 100 layouts")
  const ids = new Set<string>()
  d.layouts.forEach((l, i) => {
    const at = `layouts[${i}]`
    if (!l || typeof l !== "object") return problems.push(`${at} is not an object`)
    if (typeof l.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(l.id)) problems.push(`${at}.id must be lowercase letters, digits and hyphens`)
    else if (ids.has(l.id)) problems.push(`${at}.id ${l.id} is repeated`)
    else ids.add(l.id)
    if (typeof l.name !== "string" || !l.name.trim() || l.name.length > 80) problems.push(`${at}.name must be 1 to 80 characters`)
    if (l.arrangement !== "row" && l.arrangement !== "canvas") problems.push(`${at}.arrangement must be row or canvas`)
    if (l.height !== "screen" && l.height !== "full") problems.push(`${at}.height must be screen or full`)
    if (!Array.isArray(l.frames) || l.frames.length < 1 || l.frames.length > MAX_FRAMES) problems.push(`${at}.frames must hold 1 to ${MAX_FRAMES} frames`)
    else
      l.frames.forEach((f, j) => {
        const fa = `${at}.frames[${j}]`
        if (!f || typeof f !== "object") return problems.push(`${fa} is not an object`)
        if (typeof f.id !== "string" || !f.id) problems.push(`${fa}.id is missing`)
        if (!isInt(f.w, 200, 4000) || !isInt(f.h, 200, 4000)) problems.push(`${fa} size must be whole pixels from 200 to 4000`)
        if (typeof f.profile !== "string" || !f.profile) problems.push(`${fa}.profile is missing`)
        if (f.label !== undefined && (typeof f.label !== "string" || f.label.length > 60)) problems.push(`${fa}.label is too long`)
        if ((f.x !== undefined || f.y !== undefined) && !(isNum(f.x) && isNum(f.y))) problems.push(`${fa} position needs x and y`)
      })
    if (l.viewport !== undefined && !(l.viewport && isNum(l.viewport.x) && isNum(l.viewport.y) && isNum(l.viewport.zoom) && l.viewport.zoom > 0)) problems.push(`${at}.viewport needs x, y and a positive zoom`)
    if (l.sync !== undefined && !(l.sync && ["scroll", "interaction", "navigation"].every((k) => typeof (l.sync as Record<string, unknown>)[k] === "boolean"))) problems.push(`${at}.sync needs scroll, interaction and navigation as true or false`)
  })
  return problems
}
