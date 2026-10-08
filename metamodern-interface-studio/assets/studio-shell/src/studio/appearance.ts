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
