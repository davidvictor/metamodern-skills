import type { CompileDesignInput, JsonValue } from "../../src/studio/design-runtime"
import type { DesignModel, DesignRuntimeModule } from "@studio/design-ui"
type Values = { scale: number; light: string; dark: string; linked: boolean; asset: string; radius: number | null }
const original: Values = { scale: 1, light: "blue", dark: "blue", linked: true, asset: "loaded", radius: null }
const read = (value: JsonValue) => value as unknown as Values
const model: DesignModel = {
  initial: original as unknown as JsonValue,
  validate(value) { const v = read(value); return Number.isFinite(v.scale) && v.scale >= .5 && v.scale <= 2 ? [] : [{ id: "scale", controlId: "scale", message: "Scale must be 0.5–2", severity: "error" }] },
  edit(value, intent) {
    const v = read(value)
    if (intent.target && intent.target.component !== "button") throw new Error("This fixture has no bound treatment for that component")
    if (intent.controlId === "recipe") return { ...v, scale: intent.value === "compact" ? .8 : 1.4, light: "green", dark: "green" }
    if (intent.controlId === "palette") { const next = { ...v }; for (const theme of v.linked ? ["light", "dark"] : intent.scope.themes) next[theme as "light" | "dark"] = String(intent.value); return next }
    if (intent.controlId === "linked") return { ...v, linked: Boolean(intent.value) }
    if (intent.controlId === "radius") return { ...v, radius: Number(intent.value) }
    return { ...v, [intent.controlId]: intent.value } as unknown as JsonValue
  },
  reset(value, request, bases) { if (request.basis === "inherited") return { ...read(value), radius: null }; return request.basis === "saved" ? bases.saved : bases.original },
  readout(value, context) {
    const v = read(value)
    const palette = context.scope.themes.length > 1 && v.light !== v.dark ? { light: v.light, dark: v.dark } : v[context.scope.themes[0] as "light" | "dark"]
    return { effective: context.controlId === "palette" ? palette : context.controlId === "radius" ? v.radius ?? v.scale * 8 : v[context.controlId as keyof Values] ?? null, inherited: context.controlId === "radius" ? v.scale * 8 : original[context.controlId as keyof Values] ?? null, override: context.controlId === "radius" ? v.radius : null, sourceScope: v.radius !== null && context.controlId === "radius" ? "component" : "foundation", themeScope: context.scope, linked: v.linked, reach: [{ id: "fixture", label: "Synthetic button and task screen", status: context.target && context.target.component !== "button" ? "unavailable" : "supported" }], diagnostics: [] }
  },
}
export const modelRuntime: DesignRuntimeModule = {
  model,
  async compile(input: CompileDesignInput) {
    const v = read(input.direction)
    if (v.asset === "missing") throw new Error("Registered fixture asset is missing; save/export blocked")
    if (v.asset === "pending") await new Promise(resolve => setTimeout(resolve, 300))
    const colors = { blue: input.theme === "dark" ? "#60a5fa" : "#2563eb", green: input.theme === "dark" ? "#34d399" : "#059669" }
    const palette = colors[v[input.theme as "light" | "dark"] as keyof typeof colors] ?? colors.blue
    return { data: input.direction, schema: "studio-compiled-design/1", compiler: { id: "fixture", version: "1" }, sourceLockId: "fixture-source/1", fingerprint: JSON.stringify(v), tokens: { "--ex-row": `${Math.round(48 * v.scale)}px`, "--ex-primary": palette }, css: `button { border-radius: ${v.radius ?? v.scale * 8}px; }`, stylesheets: [v.asset === "frame-missing" ? "/example/design-runtime/missing.css" : "/example/design-runtime/assets.css"] }
  },
}
