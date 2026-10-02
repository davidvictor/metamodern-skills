/*
 * Component properties: scenario inputs in the "properties" section. Named states stay the unit of
 * review; properties edit the selected state without a remount and show as differences from it.
 * Values travel in links under the input's ID, except free text not declared shareable, which stays
 * in the viewer's browser and leaves an edited=local marker. A property whose ID is a reserved link
 * key never travels (input normalization rejects it). Saved states (scenarios.json) join the catalog
 * as scenarios derived from the generated one they were saved from. Pure, no DOM.
 */
import { normalizeScenarioInput, RESERVED_LINK_KEYS } from "./input"
import type { SavedScenario } from "./scenarios"
import type { InputValue, Scenario, ScenarioInput } from "./types"

/** A viewer's property edits on one scenario, by input ID. */
export type Edits = Record<string, InputValue>

export const isProperty = (i: ScenarioInput) => i.section === "properties"
/** Whether an input applies to a scenario: inputs without `surfaces` apply everywhere. */
export const appliesTo = (i: ScenarioInput, sc: Scenario | undefined) => !i.surfaces || (!!sc && i.surfaces.includes(sc.surface))
/** Free text stays in the viewer's browser unless the input declares it shareable. */
export const travels = (i: ScenarioInput) => i.control !== "text" || !!i.shareable
/** The properties a scenario shows: curated first, then the rest, each in declaration order. */
export function propertiesFor(inputs: ScenarioInput[], sc: Scenario | undefined) {
  const own = inputs.filter((i) => isProperty(i) && appliesTo(i, sc))
  return [...own.filter((i) => i.curated), ...own.filter((i) => !i.curated)]
}
/** Properties that may appear in or be read from links: not readonly, and not on a key the Studio's own links use. */
const linkable = (inputs: ScenarioInput[], sc: Scenario | undefined) => propertiesFor(inputs, sc).filter((i) => !i.readonly && !RESERVED_LINK_KEYS.includes(i.id))

/** A scenario's edits as link parameters, and whether text that stays local was edited (the edited=local marker). */
export function linkEdits(inputs: ScenarioInput[], sc: Scenario | undefined, edits: Edits = {}) {
  const params: [string, string][] = []
  let local = false
  for (const i of linkable(inputs, sc)) {
    if (edits[i.id] === undefined) continue
    if (travels(i)) params.push([i.id, String(edits[i.id])])
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
    const raw = travels(i) ? get(i.id) : null
    const v = travels(i) ? (raw === null ? undefined : normalizeScenarioInput(i, sc, raw)) : local ? stored[i.id] : undefined
    if (v === undefined) continue
    edits[i.id] = v
    if (!travels(i)) kept = true
  }
  return { edits, missing: local && !kept }
}

/** Whether Compare can use an input as its axis: named values only. Text never; a range or number only with presets. */
export const comparable = (i: ScenarioInput) => !i.readonly && i.control !== "text" && ((i.control !== "range" && i.control !== "number") || !!i.presets?.length)
/** An input's Compare values: a switch's are Off and On; a range or number offers its presets; an option input offers its options. */
export function axisValues(i: ScenarioInput) {
  if (i.control === "switch") return [{ id: "false", label: "Off" }, { id: "true", label: "On" }]
  if (i.control === "range" || i.control === "number") return (i.presets ?? []).map((p) => ({ id: String(p.value), label: p.label }))
  return (i.options ?? []).map((o) => ({ id: o.id, label: o.label }))
}

/** The catalog with saved states, each after the last scenario of its base's surface and nested under the base's top scenario. A saved state whose base is gone, or whose ID is taken, is left out. */
export function withSaved(generated: Scenario[], saved: SavedScenario[] = []) {
  const out = [...generated]
  for (const x of saved) {
    const base = generated.find((g) => g.id === x?.base)
    if (!base || typeof x.id !== "string" || out.some((g) => g.id === x.id) || !x.values || typeof x.values !== "object") continue
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
