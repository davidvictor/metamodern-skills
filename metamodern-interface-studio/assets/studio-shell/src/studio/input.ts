import type { InputValue, Scenario, ScenarioInput } from "./types"

/**
 * Keys the Studio's own links use. Values travel in links under the input ID, so a property with one of these IDs
 * would overwrite, or be overwritten by, the Studio's own state; such a property is rejected.
 */
export const RESERVED_LINK_KEYS: readonly string[] = ["view", "scenario", "theme", "profile", "size", "tab", "design", "layout", "frames", "height", "arrange", "vp", "sync", "edited", "module", "section"]

const reported = new Set<string>()
/** A property on a reserved link key: inert everywhere (no row, no value), named once in the console. */
export function isReservedProperty(input: ScenarioInput) {
  if (input.section !== "properties" || !RESERVED_LINK_KEYS.includes(input.id)) return false
  if (!reported.has(input.id)) {
    reported.add(input.id)
    console.error(`Interface Studio: property "${input.id}" uses a reserved link key and is ignored. Rename it; reserved keys are ${RESERVED_LINK_KEYS.join(", ")}.`)
  }
  return true
}

/**
 * Validates and normalizes a value before it enters a scenario runtime. Range values travel as numbers and
 * may be rounded to their declared step; switches travel as booleans; text stays within its declared length
 * and lines; a readonly property never takes a value. Link text ("true", "4.5") reads back as what it stands for.
 */
export function normalizeScenarioInput(input: ScenarioInput, scenario: Scenario | undefined, value: InputValue): InputValue | undefined {
  if (isReservedProperty(input)) return undefined
  if (input.readonly) return undefined
  if (input.control === "switch") return value === true || value === "true" ? true : value === false || value === "false" ? false : undefined
  if (input.control === "text") return typeof value === "string" && value.length <= (input.maxLength ?? Infinity) && (!!input.multiline || !/[\r\n]/.test(value)) ? value : undefined
  if (input.control === "range" || input.control === "number") {
    const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
    if (!Number.isFinite(raw) || raw < (input.min ?? -Infinity) || raw > (input.max ?? Infinity)) return undefined
    if (input.control === "number") return raw
    if (input.min === undefined || input.max === undefined) return undefined
    const step = input.step && input.step > 0 ? input.step : 1
    // Decimal steps need a stable transport value without turning an out-of-bounds input into one.
    const stable = (n: number) => Number(n.toFixed(10))
    const snapped = stable(input.min + Math.round((raw - input.min) / step) * step)
    // When the range is not a whole number of steps, rounding up can pass max; take the last step inside it, as a range input does.
    return snapped > input.max ? stable(snapped - step) : snapped
  }
  if (typeof value !== "string" || !input.options?.some((option) => option.id === value)) return undefined
  const supported = scenario?.supports?.[input.id]
  return !supported || supported.includes(value) ? value : undefined
}
