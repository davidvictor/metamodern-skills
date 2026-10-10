import { validDirectionId, validDirectionPin, validDirectionRevision } from "@/studio/directions"
import { useOptionalDesignEditor, useDesignSnapshot, useDirectionSnapshot } from "@/studio/design-ui/react"
import type { DesignPreviewIdentity } from "@/studio/design-ui/types"
import { host } from "@/studio-host"
import { replaceStudioHash } from "./studio/history"
/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { toast } from "sonner"

import { adapter } from "@/adapter"
import type { FrameDiagnostic, InputValue, Scenario, ScenarioInput, Token } from "@/studio/types"
import type { FrameCapability } from "@/studio/protocol"
import { decodeDesign, designDraft, encodeDesign, mergeDesignValues, parameterAvailable, valuesForTheme, type DesignDraft, type DesignValues, type DesignValuesByTheme } from "@/studio/design"
import { normalizeScenarioInput, RESERVED_LINK_KEYS } from "@/studio/input"
import { appliesTo, axisValues, comparable, editsFromLink, isProperty, keptEdits, linkEdits, propertiesFor, storedEdits, unsettable, usableSaved, withSaved, type Edits, type LinkHold } from "@/studio/properties"
import type { SavedScenario, ScenariosFile } from "@/studio/scenarios"
import { savedComparison } from "@/studio/compare"
import { DEFAULT_SYNC, decodeFrames, encodeFrames, fromPreset, SHELL_PRESETS, validateLayouts, type LayoutsFile, type ResponsiveFrame, type ResponsiveLayout, type SyncChannels } from "@/studio/layouts"
import { applyPresenterOverlay, isPresenterOverlay, type PresenterOverlay, type PresenterWalkthrough, updateOverlay } from "@/studio/presenter-overlay"
import { moduleHash, parseModuleLink } from "@/studio/workspace/link"
import { parseLibraryLink } from "@/studio/library/link"

/** One draft layer, as a preview receives it. */
export type Draft = { compiledData?: import("@/studio/design-runtime").JsonValue; direction?: DesignPreviewIdentity; tokens: Record<string, string>; css: string; stylesheets: string[]; scoped?: Record<string, Record<string, string>>; unavailable?: string }
export const NO_DRAFT: Draft = { tokens: {}, css: "", stylesheets: [] }

export type View = "inspect" | "compare" | "responsive" | "gallery" | "present" | "design"
export type CompareMode = "side" | "split" | "toggle"
/** draftEverywhere: show the design draft in Inspect, Gallery and Compare too. Off by default; Present never shows it. */
export type Options = { controls: "dock" | "toolbar"; details: "docked" | "floating"; railLabels: boolean; draftEverywhere: boolean; map: boolean }
export type PreviewStatus = { status: "loading" | "ready" | "error" | "static" | "empty"; modified: boolean; canGoBack: boolean; location?: string; fingerprint?: string; reason?: string; previous?: boolean; diagnostics?: FrameDiagnostic[]; capabilities?: FrameCapability[] }

export type State = {
  view: View
  panelOpen: boolean
  detailsOpen: boolean
  scenario: string
  theme: string
  profile: string
  /** A dragged Inspect size on top of the profile. The profile still decides input context; this only sets the frame's pixels. */
  size: { w: number; h: number } | null
  values: Record<string, InputValue>
  /** The viewer's property edits, by scenario ID. Kept in this browser; those that travel are also in the link. */
  props: Record<string, Edits>
  /** The scenario whose link said the sender had local text edits this browser does not hold. */
  propsNote: string | null
  /** The scenario a link set edits for, with what this browser had stored for it: kept in storage until the person edits it here. */
  propsHold: LinkHold | null
  /** Saved states from scenarios.json (studio-scenarios/1). */
  savedStates: SavedScenario[]
  zoom: "fit" | number
  /** The scale Inspect is showing the frame at, for the dock's Zoom control to state. */
  scale: number
  /** Bumped by Reset: a fresh runtime is mounted from the same scenario. */
  resetNonce: number
  preview: PreviewStatus
  compare: { axis: string; a: string; b: string; values: string[]; count: 2 | 3 | 4; editable: boolean; mode: CompareMode; split: number; showB: boolean }
  present: { tour: string; step: number; playing: boolean; speed: number; elapsed: number; focus: boolean; playlist: boolean }
  /** Presenter-owned local overlay. It is deliberately separate from generated adapter records. */
  presenter: PresenterOverlay
  tokens: { selected: string; drafts: Record<string, Record<string, string>>; query: string; flag: "all" | "unread" | "literal" | "draft"; family: string | null }
  /** The Responsive view's working layout: where it came from, its frames and settings, and whether it differs from its source. */
  responsive: { layout: string; name: string; frames: ResponsiveFrame[]; arrangement: ResponsiveLayout["arrangement"]; height: ResponsiveLayout["height"]; viewport?: ResponsiveLayout["viewport"]; sync: SyncChannels; dirty: boolean; resetNonce: number }
  /** Layouts saved in this Studio's layouts.json. */
  saved: ResponsiveLayout[]
  /** The dev server's revision of layouts.json as last read or written, sent with a save so it never overwrites a change made elsewhere. */
  layoutsRevision: string | null
  /**
   * Whether the dev server's layouts.json has been read: a save waits for it ("loading"), and is refused while the
   * file is not a valid layouts file ("unreadable", such as a merge conflict) or could not be read ("failed").
   */
  layoutsLoad: "loading" | "ready" | "unreadable" | "failed"
  /** What the Responsive frames' clients can do, for the sync switches. */
  frameCaps: FrameCapability[]
  /** The Design view: which tab, the Adjust values, and whether the stage shows the draft, the product as built, or both. */
  design: { tab: "adjust" | "tokens"; values: DesignValues; valuesByTheme: DesignValuesByTheme; show: "draft" | "built" | "split" }
  gallery: { size: number; source: "captures" | "live"; query: string; hidden: string[]; onlyFlagged: boolean }
  options: Options
  commandOpen: boolean
  shortcutsOpen: boolean
  /** The open workspace module and its section; null shows the view. */
  module: string | null
  section: string | null
  /** The open module's item (useModule().item), carried in its link; changing only it replaces the history entry. */
  item: string | null
  /** Whether the open module has a Details slot, reported by the workspace layer once the module loads. */
  moduleDetails: boolean
  /** The open component library page, and the section a link or On this page asked for; null shows the view or module. */
  library: string | null
  libraryAt: string | null
  mobilePanel: null | "panel" | "details" | "workspace"
}

const A = adapter
// Dock choices travel in links under their input's ID; one on a reserved link key would clash with the Studio's own state, so it is left out of links.
for (const i of A.axes.inputs)
  if (i.placement === "dock" && !isProperty(i) && RESERVED_LINK_KEYS.includes(i.id))
    console.error(`Interface Studio: dock input "${i.id}" uses a reserved link key, so its value is left out of links. Rename it; reserved keys are ${RESERVED_LINK_KEYS.join(", ")}.`)
const OPTIONS_KEY = `studio.${A.id}.options`
const DRAFTS_KEY = `studio.${A.id}.token-drafts`
const DESIGN_KEY = `studio.${A.id}.design-drafts.v1`
const PRESENTER_KEY = `studio.${A.id}.presenter-overlay.v1`
const PRESENT_PREFS_KEY = `studio.${A.id}.presenter-preferences.v1`
/** Written only after the viewer flips the switch, so a changed default reaches everyone who never chose. */
const RAIL_KEY = `studio.${A.id}.rail-labels`
const PROPS_KEY = `studio.${A.id}.property-edits.v1`
const VIEWS: View[] = ["inspect", "compare", "responsive", "gallery", "present", "design"]
/** Properties need a live frame. A Studio that declares none behaves exactly as before they existed. */
export const hasProperties = !!A.frameEntry && A.axes.inputs.some(isProperty)
export const propertyIds = new Set(A.axes.inputs.filter(isProperty).map((i) => i.id))
/**
 * The adapter's own scenarios; saved states from scenarios.json join them in the catalog. Filtered, so a re-run of
 * this module (hot update) never treats an already joined saved state as generated.
 */
const generated = A.scenarios.filter((x) => !x.savedFrom)
/** Puts a scenarios.json list in the catalog, keeping only usable entries, and returns them. */
const joinSaved = (list: unknown) => {
  const usable = usableSaved(generated, list, A.axes.inputs)
  A.scenarios = withSaved(generated, usable)
  return usable
}
/** Saved states bundled into a built Studio; the dev server serves the live file instead. Joined before the link is read, so a link to one resolves. */
const bundledScenarios = host.scenarios as ScenariosFile | undefined
const bundledSaved = hasProperties ? joinSaved(bundledScenarios?.scenarios) : []
export const canSaveScenarios = host.canSave
/** Design shows the Adjust tab when the adapter declares parameters and the Tokens tab when it has a token source. */
export const hasAdjust = !!A.design?.parameters.length || !!A.design?.editor?.slots?.includes("foundation")
export const hasDesign = hasAdjust || !!A.tokens || !!A.design?.editor
/** The Design tab that shows: the chosen one when both exist, else the only one. */
export const designTab = (tab: "adjust" | "tokens") => (!A.tokens && !A.design?.editor ? "adjust" : !hasAdjust ? "tokens" : tab)
const firstScenario = A.scenarios.find((x) => x.status !== "later") ?? A.scenarios[0]
const hasCaptures = A.scenarios.some((x) => Object.keys(x.captures ?? {}).length > 0)

function readJSON<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null
  } catch {
    return null
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* per-viewer convenience only */
  }
}

/** Responsive presets: the adapter's first, then the shell's unless the adapter replaces them. Read only. */
export const PRESETS: ResponsiveLayout[] = [...(A.axes.responsive?.presets ?? []), ...(A.axes.responsive?.replaceShellPresets ? [] : SHELL_PRESETS)].map((p) => fromPreset(p, A.axes.profiles))
const RESPONSIVE_KEY = `studio.${A.id}.responsive`
/** Saved layouts bundled into a built Studio; the dev server serves the live file instead. */
const bundledLayouts = host.layouts as LayoutsFile | undefined
export const layoutsProblems = (data: unknown) => validateLayouts(data)
export const canSaveLayouts = host.canSave
const initialResponsive = (): State["responsive"] => {
  const p = PRESETS[0]
  return { layout: p.id, name: p.name, frames: p.frames, arrangement: p.arrangement, height: p.height, sync: DEFAULT_SYNC, dirty: false, resetNonce: 0 }
}
const profileIds = A.axes.profiles.map((p) => p.id)
/** A canvas viewport in a link: `x_y_zoom`. */
function parseViewport(text: string | null) {
  const m = /^(-?\d+)_(-?\d+)_(\d*\.?\d+)$/.exec(text ?? "")
  return m && +m[3] >= 0.1 && +m[3] <= 4 ? { x: +m[1], y: +m[2], zoom: +m[3] } : undefined
}

/** A link that names a scenario this Studio does not have. It is said out loud, never replaced silently. */
let unresolvedLink: string | null = null

/** Selection lives in the URL as stable IDs only, never fixture values. Property values travel under their input's ID. */
function readHash(stored: Record<string, Edits>): Partial<State> {
  const q = new URLSearchParams(location.hash.slice(1))
  const out: Partial<State> = {}
  const link = parseModuleLink(location.hash, A.workspace)
  if (link.module) Object.assign(out, { module: link.module, section: link.section, item: link.item })
  const lib = parseLibraryLink(location.hash, A.library)
  if (lib.library) Object.assign(out, { library: lib.library, libraryAt: lib.at })
  if (A.design?.directions && q.get("directionA") && q.get("directionB")) {
    const values = [q.get("directionA")!, q.get("directionB")!, q.get("directionC"), q.get("directionD")].filter((v): v is string => !!v).slice(0, 4).map((v, i) => validDirectionPin(v) ? v : `invalid.pin.${i}`)
    out.compare = { ...initial.compare, axis: "direction", a: values[0], b: values[1], values, count: values.length as 2 | 3 | 4 }
  }
  const view = q.get("view")
  if (view && VIEWS.includes(view as View)) out.view = view as View
  // The Design view grew out of Tokens; old links land on its Tokens tab.
  if (view === "tokens" && (A.tokens || A.design?.editor)) out.view = "design"
  const tab = view === "tokens" ? "tokens" : q.get("tab")
  const values = decodeDesign(A, q.get("design"))
  if (tab === "adjust" || tab === "tokens" || Object.keys(values).length) {
    const linkedTheme = q.get("theme") ?? A.axes.themes[0]?.id ?? ""
    const scoped = new Set((A.design?.parameters ?? []).filter((p) => p.themes?.length).map((p) => p.id))
    out.design = { ...initialDesign, ...(tab === "adjust" || tab === "tokens" ? { tab } : {}),
      values: Object.fromEntries(Object.entries(values).filter(([id]) => !scoped.has(id))),
      valuesByTheme: { [linkedTheme]: Object.fromEntries(Object.entries(values).filter(([id]) => scoped.has(id))) },
    }
  }
  const sc = q.get("scenario")
  if (sc && A.scenarios.some((x) => x.id === sc)) out.scenario = sc
  else if (sc) unresolvedLink = sc
  // A link that names a scenario sets its property edits: see editsFromLink.
  if (hasProperties && out.scenario) {
    const { edits, missing } = editsFromLink(A.axes.inputs, A.scenarios.find((x) => x.id === out.scenario), (id) => q.get(id), stored[out.scenario], q.get("edited") === "local")
    out.props = { ...stored, [out.scenario]: edits }
    out.propsHold = { scenario: out.scenario, stored: stored[out.scenario] }
    if (missing) out.propsNote = out.scenario
  }
  const th = q.get("theme")
  if (th && A.axes.themes.some((x) => x.id === th)) out.theme = th
  const pr = q.get("profile")
  if (pr && A.axes.profiles.some((x) => x.id === pr)) out.profile = pr
  // Dock choices travel in the link under the input's own ID.
  const lenses = Object.fromEntries(A.axes.inputs.filter((i) => i.placement === "dock" && !isProperty(i) && !RESERVED_LINK_KEYS.includes(i.id)).flatMap((i) => {
    const v = q.get(i.id)
    const normalized = v === null ? undefined : normalizeScenarioInput(i, A.scenarios.find((x) => x.id === out.scenario), v)
    return normalized === undefined ? [] : [[i.id, normalized]]
  }))
  if (Object.keys(lenses).length) out.values = { ...defaultValues(), ...lenses }
  // Responsive: a layout by ID, frames inline when they differ from it, and its settings.
  const layoutId = q.get("layout")
  const inline = decodeFrames(q.get("frames"), profileIds)
  if (layoutId || inline) {
    const base = [...PRESETS, ...(bundledLayouts?.layouts ?? [])].find((l) => l.id === layoutId) ?? PRESETS[0]
    const sync = q.get("sync")
    out.responsive = {
      ...initialResponsive(),
      layout: base.id,
      name: base.name,
      frames: inline ?? base.frames,
      arrangement: q.get("arrange") === "canvas" ? "canvas" : q.get("arrange") === "row" ? "row" : base.arrangement,
      height: q.get("height") === "full" ? "full" : q.get("height") === "screen" ? "screen" : base.height,
      sync: sync === null ? (base.sync ?? DEFAULT_SYNC) : { scroll: sync.includes("scroll"), interaction: sync.includes("interaction"), navigation: sync.includes("navigation") },
      viewport: parseViewport(q.get("vp")) ?? base.viewport,
      dirty: !!inline,
    }
  }
  const size = /^(\d{2,4})x(\d{2,4})$/.exec(q.get("size") ?? "")
  const lim = A.axes.resizable
  if (size && lim && A.frameEntry) {
    const w = +size[1]
    const h = +size[2]
    const base = A.axes.profiles.find((x) => x.id === (out.profile ?? initial.profile))
    if (w >= lim.min.w && w <= lim.max.w && h >= lim.min.h && h <= lim.max.h && !(base && base.w === w && base.h === h)) out.size = { w, h }
  }
  return out
}

/** The scenario inputs a scenario uses: every unscoped input on its surfaces, and a scoped one only when the scenario designs a value for it. */
export const inputsFor = (sc: Scenario | undefined) => A.axes.inputs.filter((i) => (!i.scoped || sc?.designed?.[i.id] !== undefined) && appliesTo(i, sc))
/** The options of an input a scenario supports (`Scenario.supports`); every option when it declares none. */
export const optionsFor = (input: ScenarioInput, sc: Scenario | undefined) => {
  if (input.control === "range" || input.control === "switch") return []
  const only = sc?.supports?.[input.id]
  const options = input.options ?? []
  return only ? options.filter((o) => only.includes(o.id)) : options
}
/**
 * Scenario inputs a viewer can change on this scenario: those with at least two options it supports. The rest are still
 * sent, at their designed value. Properties are never among them: they have their own section and Compare axis.
 */
export const choosableFor = (sc: Scenario | undefined) =>
  inputsFor(sc).filter((i) =>
    i.readonly || isProperty(i)
      ? false
      : i.control === "range"
        ? Number.isFinite(i.min) && Number.isFinite(i.max) && (i.max ?? 0) > (i.min ?? 0)
        : optionsFor(i, sc).length > 1
  )
/** Whether a scenario can render an option of an input. */
export const supports = (sc: Scenario | undefined, input: string, option: InputValue) => {
  const descriptor = A.axes.inputs.find((candidate) => candidate.id === input)
  return !!descriptor && normalizeScenarioInput(descriptor, sc, option) !== undefined
}
/**
 * The viewer's property edit or choice when this scenario supports it, else the scenario's designed value, else the
 * input's default (an optional property sends nothing until set). Inputs the scenario does not use are left out.
 */
export function resolveValues(sc: Scenario | undefined, values: Record<string, InputValue>, props?: Edits) {
  const out: Record<string, InputValue> = {}
  for (const i of inputsFor(sc)) {
    // An unset optional property sends nothing, as when it was never set.
    if (props?.[i.id] === null) continue
    const pick = props?.[i.id] ?? values[i.id]
    const chosen = pick === undefined ? undefined : normalizeScenarioInput(i, sc, pick)
    const candidate = chosen ?? sc?.designed?.[i.id] ?? (i.optional ? undefined : i.default)
    const v = candidate === undefined ? undefined : normalizeScenarioInput(i, sc, candidate)
    if (v !== undefined) out[i.id] = v
  }
  return out
}
/** The same values with the viewer's dock choices removed, for playing a walkthrough exactly as designed. */
export const withoutLenses = (values: Record<string, InputValue>) => Object.fromEntries(Object.entries(values).filter(([k]) => A.axes.inputs.find((i) => i.id === k)?.placement !== "dock"))
/**
 * The axes Compare can change for a scenario: theme, profile, every input it uses with named values, then its
 * properties with named values (a switch, options, or a number with presets; text never).
 */
export const compareAxes = (sc?: Scenario, draft = false) => [
  { id: "theme", label: A.axes.themeLabel },
  { id: "profile", label: "Profile" },
  ...[...choosableFor(sc), ...(hasProperties ? propertiesFor(A.axes.inputs, sc) : [])].filter(comparable).map((i) => ({ id: i.id, label: i.label })),
  ...(draft ? [{ id: "design", label: "Design" }] : []),
  ...(A.design?.directions ? [{ id: "direction", label: "Directions" }] : []),
]
export const axisOptions = (axis: string, sc?: Scenario): { id: string; label: string }[] => {
  if (axis === "theme") return A.axes.themes.map((t) => ({ id: t.id, label: t.label }))
  if (axis === "profile") return A.axes.profiles.map((p) => ({ id: p.id, label: p.label }))
  if (axis === "design") return [{ id: "built", label: "As built" }, { id: "draft", label: "Draft" }]
  const input = A.axes.inputs.find((i) => i.id === axis)
  if (input?.control === "switch" || input?.control === "range" || input?.control === "number") return axisValues(input)
  return input ? optionsFor(input, sc) : []
}

// Only inputs with a default start with a value; a designed input is left unset until the viewer chooses.
export const defaultValues = (): Record<string, InputValue> => Object.fromEntries(A.axes.inputs.flatMap((i) => (i.default !== undefined && i.placement !== "dock" && !isProperty(i) ? [[i.id, i.default]] : [])))

const initialDesign: State["design"] = { tab: hasAdjust ? "adjust" : "tokens", values: {}, valuesByTheme: {}, show: "draft" }
const firstComparison = A.comparisons?.[0]
/** `values` is the canonical n-up tuple; a/b remain only for older adapters. */
const initialComparison = savedComparison(firstComparison ?? {}, A.axes.themes[0].id, A.axes.themes[A.axes.themes.length - 1].id)

const initial: State = {
  view: "inspect",
  panelOpen: true,
  detailsOpen: true,
  scenario: firstScenario.id,
  theme: A.axes.themes[0].id,
  profile: A.axes.profiles.find((p) => p.id === A.axes.defaultProfile)?.id ?? A.axes.profiles[0].id,
  size: null,
  values: defaultValues(),
  props: {},
  propsNote: null,
  propsHold: null,
  savedStates: bundledSaved,
  zoom: "fit",
  scale: 1,
  resetNonce: 0,
  preview: { status: "loading", modified: false, canGoBack: false },
  compare: { axis: firstComparison?.axis ?? "theme", ...initialComparison, editable: firstComparison?.editable ?? true, mode: "side", split: 50, showB: false },
  present: { tour: A.walkthroughs[0]?.id ?? "", step: 0, playing: false, speed: 1, elapsed: 0, focus: false, playlist: false },
  presenter: { version: 1, tours: {} },
  tokens: { selected: A.tokens?.tokens[0]?.name ?? "", drafts: {}, query: "", flag: "all", family: null },
  design: initialDesign,
  frameCaps: [],
  responsive: initialResponsive(),
  saved: bundledLayouts && !validateLayouts(bundledLayouts).length ? bundledLayouts.layouts : [],
  layoutsRevision: null,
  layoutsLoad: "loading",
  gallery: { size: 240, source: hasCaptures || !A.frameEntry ? "captures" : "live", query: "", hidden: [], onlyFlagged: false },
  options: { controls: "dock", details: "docked", railLabels: true, draftEverywhere: false, map: false },
  commandOpen: false,
  shortcutsOpen: false,
  mobilePanel: null,
  module: null,
  section: null,
  item: null,
  moduleDetails: false,
  library: null,
  libraryAt: null,
}

type Ctx = State & {
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void
  scenarioObj: Scenario
  hasCaptures: boolean
  /** `also` joins the same change, for example a view to show it in. */
  selectScenario: (id: string, also?: Partial<State>) => void
  setTheme: (id: string) => void
  setProfile: (id: string) => void
  /** A dragged or typed Inspect size; null returns to the profile's own size. Nothing is remounted. */
  setSize: (size: { w: number; h: number } | null) => void
  /** null returns the input to the scenario's designed value (or its default). */
  setValue: (id: string, value: InputValue | null) => void
  /** The viewer's property edits on this scenario. */
  edits: Edits
  /** Edits a property of this scenario without a remount; null (or the designed value) returns it to designed (an optional one the scenario does not design is unset); undefined unsets an optional property the scenario designs. */
  setProp: (id: string, value: InputValue | null | undefined) => void
  /** Clears every property edit on this scenario. R does not; this does. */
  resetProps: () => void
  /** Replaces the saved states, and the catalog entries made from them. */
  setSavedStates: (list: SavedScenario[]) => void
  walkthroughs: PresenterWalkthrough[]
  updatePresenter: (tourId: string, patch: Partial<PresenterOverlay["tours"][string]>) => void
  setView: (v: View) => void
  reset: () => void
  step: (d: number) => void
  /** Valid hand-edited token drafts for one theme. */
  draftsFor: (theme: string) => Record<string, string>
  /** What the Adjust values produce for one theme, with what changed and what to watch. */
  designFor: (theme: string) => DesignDraft
  /** The one draft layer sent to a preview: Adjust's values with hand-edited tokens winning, plus draft CSS and font stylesheets. */
  draftFor: (theme: string) => Draft
  directionOptions: { id: string; label: string }[]
  pinnedDirectionFor: (key: string, theme: string) => Draft
  savedDesignFor: (theme: string) => Draft
  /** Whether any draft exists, from Adjust or from Tokens. */
  hasDraft: boolean
  /** The draft for Inspect, Gallery and Compare: only when the viewer turned on draft everywhere. */
  viewDraft: (theme: string) => Draft
  setDesign: (patch: Partial<State["design"]>) => void
  resetDesign: (scope: "direction" | "all") => void
}

const StudioContext = React.createContext<Ctx | null>(null)

/**
 * Set by the workspace layer while a module has unsaved changes. Leaving the module (another module or a view)
 * calls it instead of moving; it asks, and calls `proceed` only when the person leaves. Moving between the
 * module's sections never asks: its Page stays mounted, so nothing is lost.
 */
export const leaveGuard: { ask: ((proceed: () => void) => void) | null } = { ask: null }

export function useStudio() {
  const ctx = React.useContext(StudioContext)
  if (!ctx) throw new Error("useStudio outside provider")
  return ctx
}

export const isColor = (v: string) => /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(v.trim())
export function draftIsValid(token: Token, theme: string, value: string) {
  if (!value) return true
  return isColor(token.values[theme] ?? "") ? CSS.supports("color", value) : value.trim().length > 0
}

function handDrafts(drafts: Record<string, Record<string, string>>, theme: string) {
  const out: Record<string, string> = {}
  for (const [name, byTheme] of Object.entries(drafts)) {
    const token = A.tokens?.tokens.find((t) => t.name === name)
    const v = byTheme[theme]
    if (token && v && draftIsValid(token, theme, v)) out[name] = v.trim()
  }
  return out
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const editor = useOptionalDesignEditor()
  const direction = useDesignSnapshot()
  const lifecycle = useDirectionSnapshot()
  const projection = (theme: string, basis: "saved" | "draft"): Draft => {
    if (lifecycle?.selectionProblem) return { ...NO_DRAFT, unavailable: lifecycle.selectionProblem }
    const projected = editor?.controller?.preview(theme, basis)
    return projected?.output ? { tokens: projected.output.tokens, css: projected.output.css, stylesheets: projected.output.stylesheets, scoped: projected.output.scoped, compiledData: projected.output.data, direction: projected.identity } : NO_DRAFT
  }
  const [state, setState] = React.useState<State>(() => {
    const options = readJSON<Partial<Options>>(OPTIONS_KEY)
    const drafts = readJSON<State["tokens"]["drafts"]>(DRAFTS_KEY)
    const presenter = readJSON<PresenterOverlay>(PRESENTER_KEY)
    const presentationPrefs = readJSON<{ speed?: number; focus?: boolean }>(PRESENT_PREFS_KEY)
    const savedDesign = readJSON<{ version: number; values: DesignValues; valuesByTheme: DesignValuesByTheme }>(DESIGN_KEY)
    const railLabels = readJSON<boolean>(RAIL_KEY)
    const storedRaw = hasProperties ? readJSON<Record<string, unknown>>(PROPS_KEY) : null
    // Stored edits pass the same normalization as a link: a scenario or property that is gone, or a stale value, is dropped.
    const storedProps: Record<string, Edits> = {}
    for (const sc of storedRaw && typeof storedRaw === "object" ? A.scenarios : []) {
      const edits = keptEdits(A.axes.inputs, sc, storedRaw?.[sc.id])
      if (Object.keys(edits).length) storedProps[sc.id] = edits
    }
    const fromLink = readHash(storedProps)
    const kept = readJSON<Partial<State["responsive"]>>(RESPONSIVE_KEY)
    const responsive = fromLink.responsive ?? (kept?.frames?.length ? { ...initialResponsive(), ...kept, resetNonce: 0 } : initialResponsive())
    // Saved values pass the same validation as a link, but every value is kept: shared values serve
    // every theme, so one that equals a parameter's plain default can still differ from a theme's.
    const cleanDesign = (raw: unknown) => raw && typeof raw === "object" && !Array.isArray(raw) ? decodeDesign(A, Object.entries(raw).map(([id, v]) => `${id}:${v}`).join(";")) : {}
    const valuesByTheme = savedDesign?.version === 1 && savedDesign.valuesByTheme && typeof savedDesign.valuesByTheme === "object" && !Array.isArray(savedDesign.valuesByTheme)
      ? Object.fromEntries(Object.entries(savedDesign.valuesByTheme).map(([id, values]) => [id, cleanDesign(values)])) : {}
    const design = { ...initial.design, ...(fromLink.design ?? {}),
      values: { ...(savedDesign?.version === 1 ? cleanDesign(savedDesign.values) : {}), ...(fromLink.design?.values ?? {}) },
      valuesByTheme: { ...valuesByTheme, ...(fromLink.design?.valuesByTheme ?? {}) },
    }
    const present = { ...initial.present,
      speed: presentationPrefs?.speed && [0.75, 1, 1.4].includes(presentationPrefs.speed) ? presentationPrefs.speed : initial.present.speed,
      focus: presentationPrefs?.focus === true,
    }
    return { ...initial, ...fromLink, props: fromLink.props ?? storedProps, present, design, responsive, options: { ...initial.options, ...options, railLabels: railLabels ?? initial.options.railLabels }, tokens: { ...initial.tokens, drafts: drafts ?? {} }, presenter: isPresenterOverlay(presenter) ? presenter : initial.presenter }
  })
  // The state as last rendered, to tell whether a change leaves an open workspace module.
  const current = React.useRef(state)
  React.useLayoutEffect(() => {
    current.current = state
  })
  const set: Ctx["set"] = React.useCallback((patch) => {
    // Applied as an update, so patches queued in one tick each see the state before them. Choosing a view closes an open
    // module or library page; opening a module closes the library page, and opening a library page closes the module.
    const apply = (x: State) => {
      const p = typeof patch === "function" ? patch(x) : patch
      const closes = "view" in p ? { module: null, section: null, item: null, library: null, libraryAt: null } : p.module ? { library: null, libraryAt: null } : p.library ? { module: null, section: null, item: null } : {}
      // An item belongs to one module and section: moving to another clears it unless the same change names one.
      const moved = ("module" in p && p.module !== x.module) || ("section" in p && p.section !== x.section)
      return { ...x, ...p, ...closes, ...(moved && !("item" in p) ? { item: null } : {}) }
    }
    const s = current.current
    if (!s.module || !leaveGuard.ask) return setState(apply)
    // Choosing a view, another module or a library page leaves the open module; with unsaved changes the workspace layer asks first.
    const p = typeof patch === "function" ? patch(s) : patch
    if ("view" in p || ("module" in p && p.module !== s.module) || !!p.library) return leaveGuard.ask(() => setState(apply))
    setState(apply)
  }, [])
  React.useEffect(() => {
    if (unresolvedLink) toast.warning("That link names a scenario this Studio does not have", { description: `${unresolvedLink} is not in the catalog. Showing the first scenario instead.`, duration: 12000 })
    unresolvedLink = null
  }, [])
  const railStart = React.useRef(state.options.railLabels)
  const railChosen = React.useRef(false)
  React.useEffect(() => {
    const { railLabels, ...rest } = state.options
    writeJSON(OPTIONS_KEY, rest)
    if (railLabels !== railStart.current) railChosen.current = true
    if (railChosen.current) writeJSON(RAIL_KEY, railLabels)
  }, [state.options])
  React.useEffect(() => writeJSON(DRAFTS_KEY, state.tokens.drafts), [state.tokens.drafts])
  React.useEffect(() => {
    if (hasProperties) writeJSON(PROPS_KEY, storedEdits(state.props, state.propsHold))
  }, [state.props, state.propsHold])
  React.useEffect(() => writeJSON(PRESENTER_KEY, state.presenter), [state.presenter])
  React.useEffect(() => writeJSON(PRESENT_PREFS_KEY, { speed: state.present.speed, focus: state.present.focus }), [state.present.speed, state.present.focus])
  React.useEffect(() => writeJSON(DESIGN_KEY, { version: 1, values: state.design.values, valuesByTheme: state.design.valuesByTheme }), [state.design.values, state.design.valuesByTheme])
  React.useEffect(() => {
    const writeDirectionIds = (q: URLSearchParams) => {
      if (!editor?.lifecycle || !direction) return
      const requested = new URLSearchParams(location.hash.slice(1))
      q.set("direction", lifecycle?.selectionProblem ? (validDirectionId(requested.get("direction") ?? "") ? requested.get("direction")! : "direction.invalid") : direction.id)
      q.set("revision", lifecycle?.selectionProblem ? (validDirectionRevision(requested.get("revision") ?? "") ? requested.get("revision")! : "0") : String(direction.savedRevision))
      if (state.view === "compare" && state.compare.axis === "direction") state.compare.values.forEach((value, i) => q.set(`direction${String.fromCharCode(65 + i)}`, value))
    }
    // An open workspace module's link names only the module, its section and its item.
    if (state.module) { const q = new URLSearchParams(moduleHash({ module: state.module, section: state.section, item: state.item }).slice(1)); writeDirectionIds(q); return replaceStudioHash(`#${q}`) }
    // An open library page's link names the component, the section asked for, and the theme its previews use.
    if (state.library) {
      const q = new URLSearchParams()
      q.set("library", state.library)
      if (state.libraryAt) q.set("section", state.libraryAt)
      q.set("theme", state.theme)
      writeDirectionIds(q)
      return replaceStudioHash(`#${q}`)
    }
    const q = new URLSearchParams({ view: state.view, scenario: state.scenario, theme: state.theme, profile: state.profile })
    writeDirectionIds(q)
    if (state.size) q.set("size", `${state.size.w}x${state.size.h}`)
    for (const i of A.axes.inputs) if (i.placement === "dock" && !isProperty(i) && !RESERVED_LINK_KEYS.includes(i.id) && state.values[i.id] !== undefined) q.set(i.id, String(state.values[i.id]))
    // Property edits are written only through linkEdits, which leaves out readonly and reserved-key properties.
    if (hasProperties) {
      const { params, local } = linkEdits(A.axes.inputs, A.scenarios.find((x) => x.id === state.scenario), state.props[state.scenario])
      for (const [k, v] of params) q.set(k, v)
      if (local) q.set("edited", "local")
    }
    if (state.view === "design" && hasAdjust && (A.tokens || A.design?.editor)) q.set("tab", state.design.tab)
    if (state.view === "responsive") {
      const r = state.responsive
      q.set("layout", r.layout)
      if (r.dirty) q.set("frames", encodeFrames(r.frames))
      if (r.height === "full") q.set("height", "full")
      if (r.arrangement === "canvas") q.set("arrange", "canvas")
      if (r.arrangement === "canvas" && r.viewport) q.set("vp", `${r.viewport.x}_${r.viewport.y}_${r.viewport.zoom}`)
      const sync = (Object.keys(r.sync) as (keyof SyncChannels)[]).filter((k) => r.sync[k])
      if (sync.length !== 3) q.set("sync", sync.join("-") || "off")
    }
    const design = encodeDesign(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, state.theme), state.theme)
    if (design) q.set("design", design)
    replaceStudioHash(`#${q}`)
  }, [state.view, state.scenario, state.theme, state.profile, state.size, state.values, state.props, state.design.tab, state.design.values, state.design.valuesByTheme, state.responsive, state.module, state.section, state.item, state.library, state.libraryAt, state.compare, direction, editor?.lifecycle, lifecycle?.selectionProblem])
  // Unsaved Responsive edits stay in this browser until saved or reverted.
  React.useEffect(() => {
    const { resetNonce: _, ...keep } = state.responsive
    void _
    writeJSON(RESPONSIVE_KEY, keep)
  }, [state.responsive])
  // In the dev server the live scenarios.json is read too, so a saved state shows after a reload.
  React.useEffect(() => {
    if (!canSaveScenarios || !hasProperties) return
    fetch("__studio/scenarios")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ScenariosFile | null) => {
        if (data) set({ savedStates: joinSaved(data.scenarios) })
      })
      .catch(() => undefined)
  }, [set])
  // In the dev server the live layouts.json is read, so a save shows after a reload too.
  React.useEffect(() => {
    if (!canSaveLayouts) return
    fetch("__studio/layouts")
      .then(async (r) => {
        if (!r.ok) return set({ layoutsLoad: "failed" })
        const layoutsRevision = r.headers.get("x-studio-revision")
        const data: unknown = await r.json().catch(() => null)
        if (r.headers.get("x-studio-unreadable") === "1" || validateLayouts(data).length) return set({ layoutsRevision, layoutsLoad: "unreadable" })
        set({ saved: (data as LayoutsFile).layouts, layoutsRevision, layoutsLoad: "ready" })
      })
      .catch(() => set({ layoutsLoad: "failed" }))
  }, [set])

  const scenarioObj = A.scenarios.find((x) => x.id === state.scenario) ?? firstScenario
  const walkthroughs = React.useMemo(() => applyPresenterOverlay(A.walkthroughs, state.presenter), [state.presenter])
  // Any input change mounts a new runtime; the previous preview stays until the new one is ready.
  const restage = (patch: Partial<State>) => set((s) => ({ ...patch, preview: { ...s.preview, status: "loading", modified: false, canGoBack: false } }))

  const value: Ctx = {
    ...state,
    set,
    scenarioObj,
    hasCaptures,
    selectScenario: (id, also) => restage({ scenario: id, mobilePanel: null, ...also }),
    setTheme: (id) =>
      set((s) => ({
        theme: id,
        preview: { ...s.preview, status: "loading", modified: false, canGoBack: false },
      })),
    setProfile: (id) => restage({ profile: id, size: null }),
    setSize: (size) => set({ size }),
    setValue: (id, v) =>
      set((s) => {
        const values = { ...s.values }
        if (v === null) delete values[id]
        else values[id] = v
        return { values, preview: { ...s.preview, status: "loading", modified: false } }
      }),
    edits: state.props[state.scenario] ?? {},
    setProp: (id, v) =>
      set((s) => {
        // The scenario as of this update, and only its own editable properties: any other ID changes nothing.
        const sc = A.scenarios.find((x) => x.id === s.scenario)
        const input = propertiesFor(A.axes.inputs, sc).find((i) => i.id === id && !i.readonly)
        if (!input) return {}
        const designed = sc?.designed?.[id] ?? (input.optional ? undefined : input.default)
        const edits = { ...s.props[s.scenario] }
        if (v === null || v === designed) delete edits[id]
        else if (v !== undefined) edits[id] = v
        else if (unsettable(input, sc)) edits[id] = null
        return { props: { ...s.props, [s.scenario]: edits }, propsNote: null, propsHold: s.propsHold?.scenario === s.scenario ? null : s.propsHold }
      }),
    resetProps: () => set((s) => ({ props: { ...s.props, [s.scenario]: {} }, propsNote: null, propsHold: s.propsHold?.scenario === s.scenario ? null : s.propsHold })),
    setSavedStates: (list) => set({ savedStates: joinSaved(list) }),
    setView: (v) => set((s) => ({ view: v, panelOpen: s.view === v && !s.module && !s.library ? !s.panelOpen : true })),
    reset: () => {
      set((s) => ({ resetNonce: s.resetNonce + 1, preview: { ...s.preview, status: "loading", modified: false, canGoBack: false } }))
      toast.success("Preview reset", { description: "Product state and navigation restored to the scenario." })
    },
    step: (d) => {
      const list = A.scenarios.filter((x) => x.status !== "later")
      const i = list.findIndex((x) => x.id === scenarioObj.id)
      const next = list[Math.max(0, Math.min(list.length - 1, i + d))]
      if (next && next.id !== scenarioObj.id) restage({ scenario: next.id })
    },
    walkthroughs,
    updatePresenter: (tourId, patch) => set((s) => ({ presenter: updateOverlay(s.presenter, tourId, patch) })),
    draftsFor: (theme) => handDrafts(state.tokens.drafts, theme),
    designFor: (theme) => designDraft(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme), theme),
    directionOptions: lifecycle?.pins.map(p => ({ id: p.key, label: p.label })) ?? [],
    pinnedDirectionFor: (key, theme) => { const p = editor?.lifecycle?.projection(key, theme); return p?.output ? { tokens: p.output.tokens, css: p.output.css, stylesheets: p.output.stylesheets, scoped: p.output.scoped, compiledData: p.output.data, direction: p.identity } : { ...NO_DRAFT, unavailable: p?.reason ?? "Pinned direction is unavailable" } },
    savedDesignFor: (theme) => editor ? projection(theme, "saved") : NO_DRAFT,
    draftFor: (theme) => {
      if (editor) return projection(theme, "draft")
      const d = designDraft(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme), theme)
      return { tokens: { ...d.tokens, ...handDrafts(state.tokens.drafts, theme) }, css: d.css, stylesheets: d.stylesheets, scoped: d.scoped }
    },
    hasDraft: editor ? !!editor.controller?.getSnapshot().dirty : Object.keys(state.tokens.drafts).length > 0 || A.axes.themes.some((theme) => !!encodeDesign(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme.id), theme.id)),
    viewDraft: (theme) => {
      if (editor) return projection(theme, state.view === "present" ? "saved" : "draft")
      if (!state.options.draftEverywhere) return NO_DRAFT
      // A shared value can be a change in another theme yet as built in this one; only this theme's changes count here.
      const d = designDraft(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme), theme)
      if (!Object.keys(state.tokens.drafts).length && !d.changes.length) return NO_DRAFT
      return { tokens: { ...d.tokens, ...handDrafts(state.tokens.drafts, theme) }, css: d.css, stylesheets: d.stylesheets }
    },
    setDesign: (patch) =>
      set((s) => {
        if (!patch.values) return { design: { ...s.design, ...patch } }
        return { design: { ...s.design, ...patch, ...mergeDesignValues(A, s.design.values, s.design.valuesByTheme, s.theme, patch.values) } }
      }),
    resetDesign: (scope) =>
      set((s) => {
        if (scope === "all") return { design: { ...s.design, values: {}, valuesByTheme: {} } }
        const ids = new Set((A.design?.parameters ?? []).filter((p) => parameterAvailable(p, s.theme) && !!p.themes?.length).map((p) => p.id))
        const next = { ...(s.design.valuesByTheme[s.theme] ?? {}) }
        for (const id of ids) delete next[id]
        return { design: { ...s.design, valuesByTheme: { ...s.design.valuesByTheme, [s.theme]: next } } }
      }),
  }
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export const captureFor = (s: Scenario, theme: string, profile: string) => s.captures?.[`${theme}:${profile}`]
export const areaLabel = (id: string) => A.areas.find((a) => a.id === id)?.label ?? id
export const areaCount = (id: string) => A.scenarios.filter((x) => x.area === id).length
