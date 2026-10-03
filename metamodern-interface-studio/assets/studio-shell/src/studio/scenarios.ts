/*
 * Saved states: named scenarios a reviewer saved from property edits, kept in the Studio's
 * scenarios.json (studio-scenarios/1), a product file. Only the dev server writes it, with the
 * same origin, size and schema guards as layouts.json. Pure data, no DOM, so the dev server
 * validates saves with the same rules.
 */
import { isSavedValue as isValue, SAVED_ID as ID, SAVED_PREFIX } from "./saved"
import type { InputValue } from "./types"

export { SAVED_PREFIX }

export type SavedScenario = {
  /** Starts with "saved.", which generated scenario IDs never use, so a save cannot overwrite a generated scenario. */
  id: string
  label: string
  /** The generated scenario it was saved from. The frame renders that scenario with these values. */
  base: string
  /** Property values by input ID: text, finite numbers, or true or false. */
  values: Record<string, InputValue>
  description?: string
}

export type ScenariosFile = { schema: "studio-scenarios/1"; scenarios: SavedScenario[] }

export const SCENARIOS_MAX_BYTES = 256 * 1024

/** A new saved-state ID from its label, unique among the IDs given. */
export function savedId(label: string, taken: string[]) {
  // Cut first, then trim, so the stem never ends in a hyphen.
  const stem = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48).replace(/^-+|-+$/g, "") || "state"
  let id = `${SAVED_PREFIX}${stem}`
  for (let n = 2; taken.includes(id); n++) id = `${SAVED_PREFIX}${stem}-${n}`
  return id
}

/** Validate a studio-scenarios/1 document. Returns the problems; an empty list means it is valid. Pass the generated scenario IDs to refuse overwriting one. */
export function validateScenarios(data: unknown, generated: string[] = []): string[] {
  const problems: string[] = []
  if (!data || typeof data !== "object") return ["The file is not a JSON object"]
  const d = data as Partial<ScenariosFile>
  if (d.schema !== "studio-scenarios/1") problems.push("schema must be studio-scenarios/1")
  if (!Array.isArray(d.scenarios)) return [...problems, "scenarios must be a list"]
  if (d.scenarios.length > 500) problems.push("at most 500 saved scenarios")
  const ids = new Set<string>()
  d.scenarios.forEach((x, i) => {
    const at = `scenarios[${i}]`
    if (!x || typeof x !== "object") return problems.push(`${at} is not an object`)
    if (typeof x.id !== "string" || !ID.test(x.id)) problems.push(`${at}.id must be saved. followed by lowercase letters, digits and hyphens`)
    else if (generated.includes(x.id)) problems.push(`${at}.id ${x.id} is a generated scenario, which cannot be overwritten`)
    else if (ids.has(x.id)) problems.push(`${at}.id ${x.id} is repeated`)
    else ids.add(x.id)
    if (typeof x.label !== "string" || !x.label.trim() || x.label.length > 80) problems.push(`${at}.label must be 1 to 80 characters`)
    if (typeof x.base !== "string" || !x.base || x.base.startsWith(SAVED_PREFIX)) problems.push(`${at}.base must name a generated scenario`)
    if (x.description !== undefined && (typeof x.description !== "string" || x.description.length > 400)) problems.push(`${at}.description must be at most 400 characters`)
    const values: unknown = x.values
    if (!values || typeof values !== "object" || Array.isArray(values)) return problems.push(`${at}.values must be an object`)
    const entries = Object.entries(values)
    if (entries.length > 100) problems.push(`${at}.values holds at most 100 properties`)
    for (const [k, v] of entries) if (!isValue(v)) problems.push(`${at}.values.${k} must be text up to 4,000 characters, a finite number, or true or false`)
  })
  return problems
}
