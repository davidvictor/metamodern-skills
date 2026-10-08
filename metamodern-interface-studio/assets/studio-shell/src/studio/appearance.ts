import type { MountInputs } from "./protocol"
import type { StudioAdapter } from "./types"

/** Only explicitly declared input-backed parameters can bypass a mount boundary. */
export function liveAppearanceIds(adapter: Pick<StudioAdapter, "design">) {
  return [...new Set((adapter.design?.parameters ?? []).flatMap((p) => p.apply.live === true && p.apply.input ? [p.apply.input] : []))]
}
export function appearanceKey(inputs: Pick<MountInputs, "values" | "design">, ids: string[]) {
  return JSON.stringify(ids.map((id) => [id, inputs.values[id] ?? null, inputs.design?.[id] ?? null]))
}
export function withoutAppearance<T>(values: Record<string, T>, ids: string[]) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => !ids.includes(id)))
}
/** Values retain their existing primitive transport; appearance never admits objects, functions or non-finite numbers. */
export function validInputRecord(value: unknown, design = false): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.entries(value).every(([key, v]) => !["__proto__", "constructor", "prototype"].includes(key) && (typeof v === "string" || typeof v === "number" && Number.isFinite(v) || !design && typeof v === "boolean"))
}

export function validAppearanceIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length <= 100 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 100 && !["__proto__", "constructor", "prototype"].includes(id))
}
export function appearanceFields<T>(values: Record<string, T>, ids: string[]) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => ids.includes(id)))
}

/** Stale enum intent is disclosed while decoding falls back to the product default. */
export function staleDesignEnums(adapter: Pick<StudioAdapter, "design">, values: unknown): string[] {
  if (!values || typeof values !== "object" || Array.isArray(values)) return []
  return (adapter.design?.parameters ?? []).filter(p => p.kind === "enum" && Object.hasOwn(values, p.id) && !(p.choices ?? p.options?.map(id => ({ id })) ?? []).some(choice => choice.id === (values as Record<string, unknown>)[p.id])).map(p => p.label)
}

/** Stable namespaced axes avoid collisions with component/scenario input IDs. */
export function appearanceParameters(adapter: Pick<StudioAdapter, "design">, theme?: string) {
  return (adapter.design?.parameters ?? []).filter(p => p.kind === "enum" && p.apply.live === true && p.apply.input && (!p.themes?.length || !theme || p.themes.includes(theme))).map(p => ({
    id: `appearance:${p.id}`, label: p.label, parameter: p, input: p.apply.input!,
    choices: [...new Map((p.choices ?? p.options?.map(id => ({ id, label: id })) ?? []).filter(choice => typeof choice.id === "string" && choice.id.length > 0 && choice.id.length <= 100).map(choice => [choice.id, choice])).values()],
  }))
}
export function comparableAppearances(adapter: Pick<StudioAdapter, "design">, theme?: string) {
  return appearanceParameters(adapter, theme).filter(p => p.choices.length > 1)
}
export function appearanceDefault(adapter: Pick<StudioAdapter, "axes">, item: ReturnType<typeof appearanceParameters>[number], theme?: string) {
  const p = item.parameter, base = adapter.axes.themes.find(t => t.id === theme)?.contrastOf
  const value = String((theme ? p.defaultsByTheme?.[theme] ?? (base ? p.defaultsByTheme?.[base] : undefined) : undefined) ?? p.default)
  return item.choices.some(choice => choice.id === value) ? value : item.choices[0]?.id ?? ""
}
/** Per-preview overrides cannot replace tokens, ordinary design parameters or component properties. */
export function appearanceOverrides(adapter: Pick<StudioAdapter, "design" | "axes">, overrides: unknown, theme?: string) {
  const inputs: Record<string, string> = {}, invalid: string[] = []
  if (overrides === undefined) return { inputs, invalid }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return { inputs, invalid: ["appearance"] }
  const parameters = appearanceParameters(adapter, theme)
  for (const [id, value] of Object.entries(overrides)) {
    const item = parameters.find(p => p.input === id)
    if (!item) { invalid.push(id); continue }
    if (typeof value === "string" && item.choices.some(choice => choice.id === value)) inputs[id] = value
    else { inputs[id] = appearanceDefault(adapter, item, theme); invalid.push(id) }
  }
  return { inputs, invalid }
}
/** Only appearance comparisons use these new share keys; malformed/stale links disclose fallback. */
export function readAppearanceComparison(adapter: Pick<StudioAdapter, "design" | "axes">, axis: string | null, text: string | null, theme?: string) {
  if (!axis && !text) return { comparison: undefined, notice: undefined }
  const item = comparableAppearances(adapter, theme).find(p => p.id === axis)
  if (!item) return { comparison: undefined, notice: "This appearance comparison is unavailable; showing the default comparison." }
  let raw: unknown
  try { if (!text || text.length > 4096) throw Error(); raw = JSON.parse(text) } catch { return { comparison: undefined, notice: "The appearance comparison link is invalid; showing the default comparison." } }
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4 || !raw.every(value => typeof value === "string" && value.length <= 100)) return { comparison: undefined, notice: "The appearance comparison link is invalid; showing the default comparison." }
  const fallback = appearanceDefault(adapter, item, theme)
  const invalid = raw.some(value => !item.choices.some(choice => choice.id === value))
  const values = raw.map(value => item.choices.some(choice => choice.id === value) ? value : fallback)
  return { comparison: { axis: item.id, a: values[0], b: values[1], values, count: values.length as 2 | 3 | 4 }, notice: invalid ? `${item.label}: unavailable comparison appearance; restored the product default.` : undefined }
}
