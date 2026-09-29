/*
 * The Design view's draft: turns the adapter's design parameters and a viewer's
 * values into draft token values, draft CSS and font stylesheets, and says what
 * changed and what to watch. Pure data in, data out; the preview frame applies
 * the result through the draft channel of studio-preview/1.
 */
import type { DesignParameter, StudioAdapter } from "./types"

export type DesignValues = Record<string, number | string>
export type DesignChange = { param: DesignParameter; tokens: string[]; css: boolean; missing: string[] }
export type DesignWarning = { param: string; text: string }
export type DesignDraft = {
  tokens: Record<string, string>
  css: string
  stylesheets: string[]
  changes: DesignChange[]
  warnings: DesignWarning[]
  /** Tokens that hold fixed values and so do not follow a color change. */
  literal: string[]
}

/** Fonts every browser has; they need no stylesheet. */
export const LOCAL_FONTS = ["system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Courier New"]
const FONT_HOST = "https://fonts.googleapis.com/css2"

const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
const matcher = (patterns: string[] = []) => {
  const res = patterns.map((p) => new RegExp(`^${escape(p).replace(/\*/g, ".*")}$`))
  return (name: string) => res.some((r) => r.test(name))
}
const round = (n: number, unit: string) => (unit === "px" || unit === "" ? Math.round(n * 100) / 100 : Math.round(n * 1000) / 1000)
const LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/g
const NUMBER = /(^|[\s,(])(-?\d*\.?\d+)(?=$|[\s,)])/g

/** Multiply every length (and, when asked, every bare number) in a CSS value. */
export function scaleValue(value: string, factor: number, unitless = false) {
  let out = value.replace(LENGTH, (_, n: string, unit: string) => `${round(Number(n) * factor, unit)}${unit}`)
  if (unitless) out = out.replace(NUMBER, (_, pre: string, n: string) => `${pre}${round(Number(n) * factor, "")}`)
  return out
}

/** The first length in a value, in px (rem and em at 16 px). */
export function toPx(value: string): number | null {
  const m = /(-?\d*\.?\d+)(px|rem|em)\b/.exec(value)
  return m ? Number(m[1]) * (m[2] === "px" ? 1 : 16) : null
}
const setPx = (value: string, px: number) => value.replace(/(-?\d*\.?\d+)(px|rem|em)\b/, `${px}px`)

/** Interpolate two values of the same shape, length by length. */
function lerp(a: string, b: string, t: number) {
  const bs = [...b.matchAll(LENGTH)].map((m) => Number(m[1]) * (m[2] === "px" ? 1 : 16))
  let i = 0
  const out = a.replace(LENGTH, (_, n: string, unit: string) => {
    const from = Number(n) * (unit === "px" ? 1 : 16)
    const to = bs[i++]
    if (to === undefined) return `${n}${unit}`
    const px = from + (to - from) * t
    return unit === "px" ? `${round(px, "px")}px` : `${round(px / 16, unit)}${unit}`
  })
  return i === bs.length ? out : t < 0.5 ? a : b
}

/** A token's value for a theme: that theme's, else the first column's, else any. */
export function baseValue(adapter: StudioAdapter, name: string, theme: string) {
  const token = adapter.tokens?.tokens.find((x) => x.name === name)
  if (!token) return undefined
  return token.values[theme] ?? token.values[adapter.tokens!.columns[0]] ?? Object.values(token.values)[0]
}

export const isDefault = (p: DesignParameter, v: number | string | undefined) => v === undefined || String(v) === String(p.default)

/** A Google Fonts stylesheet for a family, or nothing for a font the browser already has. */
export function fontStylesheet(name: string) {
  if (LOCAL_FONTS.some((f) => f.toLowerCase() === name.toLowerCase())) return null
  return `${FONT_HOST}?family=${encodeURIComponent(name).replace(/%20/g, "+")}&display=swap`
}
export const allowedStylesheet = (url: string) => url.startsWith(`${FONT_HOST}?`)

/** Relative luminance contrast between two CSS colors, read through a canvas so any color syntax works. */
let ctx: CanvasRenderingContext2D | null = null
function rgb(color: string): [number, number, number] | null {
  if (typeof document === "undefined") return null
  ctx ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true })
  if (!ctx || !CSS.supports("color", color)) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = "#000"
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}
export function contrast(a: string, b: string) {
  const ca = rgb(a)
  const cb = rgb(b)
  if (!ca || !cb) return null
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const [hi, lo] = [lum(ca), lum(cb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Every token name a parameter may touch: the adapter's tokens plus any a stop or rule names. */
function tokenNames(adapter: StudioAdapter, p: DesignParameter) {
  const names = new Set(adapter.tokens?.tokens.map((x) => x.name) ?? [])
  for (const st of p.stops ?? []) for (const n of Object.keys(st.values ?? {})) names.add(n)
  for (const n of Object.keys(p.apply.steps ?? {})) names.add(n)
  for (const n of p.apply.set ?? []) names.add(n)
  return [...names]
}

/** The draft the current values produce for one theme. Parameters at their defaults produce nothing. */
export function designDraft(adapter: StudioAdapter, values: DesignValues, theme: string): DesignDraft {
  const out: DesignDraft = { tokens: {}, css: "", stylesheets: [], changes: [], warnings: [], literal: [] }
  const css: string[] = []
  for (const p of adapter.design?.parameters ?? []) {
    const v = values[p.id]
    if (isDefault(p, v)) continue
    const change: DesignChange = { param: p, tokens: [], css: false, missing: [] }
    const excluded = matcher(p.apply.exclude)
    const floors = Object.entries(p.apply.floor ?? {}).map(([k, px]) => [matcher([k]), px] as const)
    const warns = Object.entries(p.apply.warnBelow ?? {}).map(([k, px]) => [matcher([k]), px] as const)
    // Parameters compose in declaration order: a later one scales what an earlier one produced.
    const current = (name: string) => out.tokens[name] ?? baseValue(adapter, name, theme)
    const put = (name: string, value: string | undefined) => {
      if (value === undefined) return
      let next = value
      const floor = floors.find(([m]) => m(name))?.[1]
      const px = toPx(next)
      if (floor !== undefined && px !== null && px < floor) next = setPx(next, floor)
      const warn = warns.find(([m]) => m(name))?.[1]
      const after = toPx(next)
      if (warn !== undefined && after !== null && after < warn) out.warnings.push({ param: p.id, text: `${name} is ${after}px, under ${warn}px` })
      if (next !== baseValue(adapter, name, theme)) {
        out.tokens[name] = next
        change.tokens.push(name)
      } else delete out.tokens[name]
    }

    if (p.kind === "scale") {
      const x = Number(v)
      const d = Number(p.default)
      const scaled = matcher(p.apply.scale)
      const marks = (p.stops ?? []).filter((st) => st.values).sort((a, b) => a.at - b.at)
      for (const name of tokenNames(adapter, p)) {
        const withValue = marks.filter((st) => st.values![name] !== undefined)
        if (excluded(name) || (!scaled(name) && !withValue.length)) continue
        if (withValue.length) {
          const lo = [...withValue].reverse().find((st) => st.at <= x)
          const hi = withValue.find((st) => st.at >= x)
          if (lo && hi && lo !== hi) put(name, lerp(lo.values![name], hi.values![name], (x - lo.at) / (hi.at - lo.at)))
          else if (lo && hi) put(name, lo.values![name])
          else if (lo) put(name, scaleValue(lo.values![name], x / lo.at, p.apply.unitless))
          else if (hi) put(name, scaleValue(hi.values![name], x / hi.at, p.apply.unitless))
          continue
        }
        const base = current(name)
        if (base === undefined) change.missing.push(name)
        else put(name, scaleValue(base, x / d, p.apply.unitless))
      }
      for (const name of p.apply.scale ?? []) if (!name.includes("*") && baseValue(adapter, name, theme) === undefined && !marks.some((st) => st.values![name])) change.missing.push(name)
    } else if (p.kind === "ratio") {
      const factor = Number(v) / Number(p.default)
      for (const [name, step] of Object.entries(p.apply.steps ?? {})) {
        const base = current(name)
        if (base === undefined) change.missing.push(name)
        else if (step !== 0) put(name, scaleValue(base, factor ** step, p.apply.unitless))
      }
    } else if (p.kind === "font") {
      const name = String(v).trim()
      const family = `"${name.replace(/"/g, "")}"`
      for (const token of p.apply.set ?? []) {
        const base = baseValue(adapter, token, theme)
        put(token, base ? `${family}, ${base}` : `${family}, sans-serif`)
      }
      const sheet = fontStylesheet(name)
      if (sheet && !out.stylesheets.includes(sheet)) out.stylesheets.push(sheet)
    } else if (p.kind === "temperature") {
      const x = Math.max(-1, Math.min(1, Number(v)))
      const toward = x > 0 ? "#ff9a3c" : "#3c8cff"
      const pct = Math.round(Math.abs(x) * (p.apply.amount ?? 12) * 10) / 10
      for (const token of p.apply.set ?? []) {
        const base = current(token)
        if (base === undefined) change.missing.push(token)
        else put(token, `color-mix(in oklch, ${base}, ${toward} ${pct}%)`)
      }
    } else if (p.kind === "color") {
      const color = String(v).trim()
      if (!CSS.supports("color", color)) {
        out.warnings.push({ param: p.id, text: `${color} is not a CSS color` })
        continue
      }
      for (const token of p.apply.set ?? []) put(token, color)
      for (const [token, expr] of Object.entries(p.apply.derive ?? {})) put(token, expr.replaceAll("$value", color))
      for (const against of p.apply.contrast?.against ?? []) {
        const ground = out.tokens[against] ?? baseValue(adapter, against, theme)
        const ratio = ground ? contrast(color, ground) : null
        if (ratio !== null && ratio < p.apply.contrast!.min) out.warnings.push({ param: p.id, text: `${ratio.toFixed(1)}:1 against ${against}, under ${p.apply.contrast!.min}:1` })
      }
      for (const x of adapter.tokens?.tokens ?? []) if (x.flags?.includes("literal") && !out.literal.includes(x.name)) out.literal.push(x.name)
    }

    if (p.apply.css) {
      const value = p.kind === "font" ? `"${String(v).replace(/"/g, "")}"` : String(v)
      css.push(p.apply.css.replaceAll("$value", value))
      change.css = true
    }
    out.changes.push(change)
  }
  out.css = css.join("\n")
  return out
}

/** Design values in a link: `density:0.9;body-font:Inter`. Only non-default values travel. */
export function encodeDesign(adapter: StudioAdapter, values: DesignValues) {
  return (adapter.design?.parameters ?? [])
    .filter((p) => !isDefault(p, values[p.id]))
    .map((p) => `${p.id}:${values[p.id]}`)
    .join(";")
}
export function decodeDesign(adapter: StudioAdapter, text: string | null): DesignValues {
  const out: DesignValues = {}
  for (const part of (text ?? "").split(";")) {
    const i = part.indexOf(":")
    if (i < 1) continue
    const p = adapter.design?.parameters.find((x) => x.id === part.slice(0, i))
    const raw = part.slice(i + 1)
    if (!p) continue
    if (p.kind === "scale" || p.kind === "ratio" || p.kind === "temperature") {
      const n = Number(raw)
      if (Number.isFinite(n) && (p.min === undefined || n >= p.min) && (p.max === undefined || n <= p.max)) out[p.id] = n
    } else if (raw.trim()) out[p.id] = raw.trim()
  }
  return out
}
