import type { Scenario, ScenarioInput } from "./types"

/**
 * Validates and normalizes a value before it enters a scenario runtime. Range values
 * travel as numbers; decimal-hour values may be rounded to their declared step.
 */
export function normalizeScenarioInput(input: ScenarioInput, scenario: Scenario | undefined, value: string | number): string | number | undefined {
  if (input.control === "range") {
    const raw = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(raw) || input.min === undefined || input.max === undefined || raw < input.min || raw > input.max) return undefined
    const step = input.step && input.step > 0 ? input.step : 1
    const normalized = input.min + Math.round((raw - input.min) / step) * step
    // Decimal steps need a stable transport value without turning an out-of-bounds input into one.
    return Number(normalized.toFixed(10))
  }
  if (typeof value !== "string" || !input.options?.some((option) => option.id === value)) return undefined
  const supported = scenario?.supports?.[input.id]
  return !supported || supported.includes(value) ? value : undefined
}
