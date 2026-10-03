/*
 * Component properties: scenario inputs in the "properties" section. Named states stay the unit of
 * review; properties edit the selected state without a remount and show as differences from it.
 * Values travel in links under the input's ID, except free text not declared shareable, which stays
 * in the viewer's browser and leaves an edited=local marker. A property whose ID is a reserved link
 * key never travels and gets no row (input normalization rejects it). Saved states (scenarios.json) join the catalog
 * as scenarios derived from the generated one they were saved from. Pure, no DOM.
 */
import { isReservedProperty, normalizeScenarioInput } from "./input"
import { isSavedValue, SAVED_ID } from "./saved"
import type { SavedScenario } from "./scenarios"
import type { InputValue, Scenario, ScenarioInput } from "./types"

/** A viewer's property edits on one scenario, by input ID. */
export type Edits = Record<string, InputValue>

export const isProperty = (i: ScenarioInput) => i.section === "properties"
/** Whether an input applies to a scenario: inputs without `surfaces` apply everywhere. */
export const appliesTo = (i: ScenarioInput, sc: Scenario | undefined) => !i.surfaces || (!!sc && i.surfaces.includes(sc.surface))
/** Free text stays in the viewer's browser unless the input declares it shareable. */
export const travels = (i: ScenarioInput) => i.control !== "text" || !!i.shareable
/** The properties a scenario shows: curated first, then the rest, each in declaration order. A property on a reserved link key is inert and left out. */
export function propertiesFor(inputs: ScenarioInput[], sc: Scenario | undefined) {
  const own = inputs.filter((i) => isProperty(i) && appliesTo(i, sc) && !isReservedProperty(i))
  return [...own.filter((i) => i.curated), ...own.filter((i) => !i.curated)]
}
/** Properties that may appear in or be read from links: not readonly (propertiesFor already leaves out reserved link keys). */
const linkable = (inputs: ScenarioInput[], sc: Scenario | undefined) => propertiesFor(inputs, sc).filter((i) => !i.readonly)

/** A scenario's edits as link parameters, and whether text that stays local was edited (the edited=local marker). */
export function linkEdits(inputs: ScenarioInput[], sc: Scenario | undefined, edits: Edits = {}) {
  const params: [string, string][] = []
  let local = false
  for (const i of linkable(inputs, sc)) {
    const v = edits[i.id] === undefined ? undefined : normalizeScenarioInput(i, sc, edits[i.id])
    if (v === undefined) continue
    if (travels(i)) params.push([i.id, String(v)])
    else local = true
  }
  return { params, local }
}

/**
 * A linked scenario's edits: every value that travels comes from the link; local text is kept from this
 * browser only when the link carries edited=local. `missing` is true when the sender had local edits this
 * browser does not hold, so the designed text shows with a note.
 */
export function editsFromLink(inputs: ScenarioInput[], sc: Scenario | undefined, get: (id: string) => string | null, stored: Edits = {}, local = false) {
  const edits: Edits = {}
  let kept = false
  for (const i of linkable(inputs, sc)) {
    // Stored local text passes the same normalization as a link value, so stale or corrupt storage is dropped.
    const raw = travels(i) ? get(i.id) : local ? stored[i.id] : null
    const v = raw === null || raw === undefined ? undefined : normalizeScenarioInput(i, sc, raw)
    if (v === undefined) continue
    edits[i.id] = v
    if (!travels(i)) kept = true
  }
  return { edits, missing: local && !kept }
}

/** Stored edits a scenario can still use: its own properties, each value normalized; anything else is dropped. */
export function keptEdits(inputs: ScenarioInput[], sc: Scenario | undefined, edits: unknown): Edits {
  const out: Edits = {}
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) return out
  for (const i of propertiesFor(inputs, sc)) {
    const raw = (edits as Record<string, unknown>)[i.id]
    const v = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? normalizeScenarioInput(i, sc, raw) : undefined
    if (v !== undefined) out[i.id] = v
  }
  return out
}

/** A linked scenario whose edits came from the link, and what this browser had stored for it before. */
export type LinkHold = { scenario: string; stored?: Edits }
/**
 * The edits to keep in this browser. A link shows its own state for the scenario it names, but does not erase what
 * this browser stored for that scenario: until the person edits it here, its stored edits are written back unchanged.
 */
export function storedEdits(props: Record<string, Edits>, hold: LinkHold | null) {
  if (!hold) return props
  const out = { ...props }
  if (hold.stored && Object.keys(hold.stored).length) out[hold.scenario] = hold.stored
  else delete out[hold.scenario]
  return out
}

/** Whether Compare can use an input as its axis: named values only. Text never; a range or number only with presets. */
export const comparable = (i: ScenarioInput) => !i.readonly && i.control !== "text" && ((i.control !== "range" && i.control !== "number") || !!i.presets?.length)
/** An input's Compare values: a switch's are Off and On; a range or number offers its presets; an option input offers its options. */
export function axisValues(i: ScenarioInput) {
  if (i.control === "switch") return [{ id: "false", label: "Off" }, { id: "true", label: "On" }]
  if (i.control === "range" || i.control === "number") return (i.presets ?? []).map((p) => ({ id: String(p.value), label: p.label }))
  return (i.options ?? []).map((o) => ({ id: o.id, label: o.label }))
}

/**
 * The saved states a file may add, by the same per-entry rules studio-scenarios/1 validates, so one hand-edited
 * entry is skipped rather than blocking every later save: a saved. ID that is not a generated one and not repeated;
 * a label of 1 to 80 characters; a generated base; and only that base's own property values, each a valid saved
 * value, normalized. A description over 400 characters is dropped. A file cannot add a nameless row or set any
 * other input.
 */
export function usableSaved(generated: Scenario[], saved: unknown, inputs: ScenarioInput[]) {
  const out: SavedScenario[] = []
  for (const x of Array.isArray(saved) ? (saved as Partial<SavedScenario>[]) : []) {
    const base = generated.find((g) => g.id === x?.base)
    const id = x?.id
    if (!base || typeof id !== "string" || !SAVED_ID.test(id) || generated.some((g) => g.id === id) || out.some((o) => o.id === id)) continue
    if (typeof x.label !== "string" || !x.label.trim() || x.label.length > 80 || !x.values || typeof x.values !== "object" || Array.isArray(x.values)) continue
    const values = Object.fromEntries(Object.entries(x.values).filter(([, v]) => isSavedValue(v)))
    out.push({ id, label: x.label, base: base.id, values: keptEdits(inputs, base, values), ...(typeof x.description === "string" && x.description.length <= 400 && { description: x.description }) })
  }
  return out
}

/** The catalog with saved states (checked by usableSaved), each after the last scenario of its base's surface and nested under the base's top scenario. A saved state whose base is gone, or whose ID is taken, is left out. */
export function withSaved(generated: Scenario[], saved: SavedScenario[] = []) {
  const out = [...generated]
  for (const x of saved) {
    const base = generated.find((g) => g.id === x.base)
    if (!base || out.some((g) => g.id === x.id)) continue
    out.splice(out.findLastIndex((g) => g.surface === base.surface) + 1, 0, {
      ...base,
      id: x.id,
      label: x.label,
      state: x.label,
      parent: base.parent ?? base.id,
      description: x.description ?? base.description,
      designed: { ...base.designed, ...x.values },
      savedFrom: base.id,
      status: undefined,
      statuses: undefined,
      captures: undefined,
    })
  }
  return out
}
