/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { toast } from "sonner"

import { adapter } from "@/adapter"
import type { FrameDiagnostic, Scenario, ScenarioInput, Token } from "@/studio/types"
import type { FrameCapability } from "@/studio/protocol"
import { decodeDesign, designDraft, encodeDesign, mergeDesignValues, parameterAvailable, valuesForTheme, type DesignDraft, type DesignValues, type DesignValuesByTheme } from "@/studio/design"
import { normalizeScenarioInput } from "@/studio/input"
import { savedComparison } from "@/studio/compare"
import { DEFAULT_SYNC, decodeFrames, encodeFrames, fromPreset, SHELL_PRESETS, validateLayouts, type LayoutsFile, type ResponsiveFrame, type ResponsiveLayout, type SyncChannels } from "@/studio/layouts"
import { applyPresenterOverlay, isPresenterOverlay, type PresenterOverlay, type PresenterWalkthrough, updateOverlay } from "@/studio/presenter-overlay"

/** One draft layer, as a preview receives it. */
export type Draft = { tokens: Record<string, string>; css: string; stylesheets: string[]; scoped?: Record<string, Record<string, string>> }
export const NO_DRAFT: Draft = { tokens: {}, css: "", stylesheets: [] }

export type View = "inspect" | "compare" | "responsive" | "gallery" | "present" | "design"
export type CompareMode = "side" | "split" | "toggle"
/** draftEverywhere: show the design draft in Inspect, Gallery and Compare too. Off by default; Present never shows it. */
export type Options = { controls: "dock" | "toolbar"; details: "docked" | "floating"; railLabels: boolean; draftEverywhere: boolean; map: boolean }
export type PreviewStatus = { status: "loading" | "ready" | "error" | "static" | "empty"; modified: boolean; canGoBack: boolean; location?: string; fingerprint?: string; reason?: string; previous?: boolean; diagnostics?: FrameDiagnostic[] }

export type State = {
  view: View
  panelOpen: boolean
  detailsOpen: boolean
  scenario: string
  theme: string
  profile: string
  /** A dragged Inspect size on top of the profile. The profile still decides input context; this only sets the frame's pixels. */
  size: { w: number; h: number } | null
  values: Record<string, string | number>
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
  /** What the Responsive frames' clients can do, for the sync switches. */
  frameCaps: FrameCapability[]
  /** The Design view: which tab, the Adjust values, and whether the stage shows the draft, the product as built, or both. */
  design: { tab: "adjust" | "tokens"; values: DesignValues; valuesByTheme: DesignValuesByTheme; show: "draft" | "built" | "split" }
  gallery: { size: number; source: "captures" | "live"; query: string; hidden: string[]; onlyFlagged: boolean }
  options: Options
  commandOpen: boolean
  shortcutsOpen: boolean
  mobilePanel: null | "panel" | "details"
}

const A = adapter
const OPTIONS_KEY = `studio.${A.id}.options`
const DRAFTS_KEY = `studio.${A.id}.token-drafts`
const DESIGN_KEY = `studio.${A.id}.design-drafts.v1`
const PRESENTER_KEY = `studio.${A.id}.presenter-overlay.v1`
const PRESENT_PREFS_KEY = `studio.${A.id}.presenter-preferences.v1`
/** Written only after the viewer flips the switch, so a changed default reaches everyone who never chose. */
const RAIL_KEY = `studio.${A.id}.rail-labels`
const VIEWS: View[] = ["inspect", "compare", "responsive", "gallery", "present", "design"]
/** Design shows the Adjust tab when the adapter declares parameters and the Tokens tab when it has a token source. */
export const hasAdjust = !!A.design?.parameters.length
export const hasDesign = hasAdjust || !!A.tokens
/** The Design tab that shows: the chosen one when both exist, else the only one. */
export const designTab = (tab: "adjust" | "tokens") => (!A.tokens ? "adjust" : !hasAdjust ? "tokens" : tab)
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
const bundledLayouts = Object.values(import.meta.glob("/layouts.json", { eager: true, import: "default" }))[0] as LayoutsFile | undefined
export const layoutsProblems = (data: unknown) => validateLayouts(data)
export const canSaveLayouts = import.meta.env.DEV
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

/** Selection lives in the URL as stable IDs only, never fixture values. */
function readHash(): Partial<State> {
  const q = new URLSearchParams(location.hash.slice(1))
  const out: Partial<State> = {}
  const view = q.get("view")
  if (view && VIEWS.includes(view as View)) out.view = view as View
  // The Design view grew out of Tokens; old links land on its Tokens tab.
  if (view === "tokens" && A.tokens) out.view = "design"
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
  const th = q.get("theme")
  if (th && A.axes.themes.some((x) => x.id === th)) out.theme = th
  const pr = q.get("profile")
  if (pr && A.axes.profiles.some((x) => x.id === pr)) out.profile = pr
  // Dock choices travel in the link under the input's own ID.
  const lenses = Object.fromEntries(A.axes.inputs.filter((i) => i.placement === "dock").flatMap((i) => {
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

/** The scenario inputs a scenario uses: every unscoped input, and a scoped one only when the scenario designs a value for it. */
export const inputsFor = (sc: Scenario | undefined) => A.axes.inputs.filter((i) => !i.scoped || sc?.designed?.[i.id] !== undefined)
/** The options of an input a scenario supports (`Scenario.supports`); every option when it declares none. */
export const optionsFor = (input: ScenarioInput, sc: Scenario | undefined) => {
  if (input.control === "range") return []
  const only = sc?.supports?.[input.id]
  const options = input.options ?? []
  return only ? options.filter((o) => only.includes(o.id)) : options
}
/** Inputs a viewer can change on this scenario: those with at least two options it supports. The rest are still sent, at their designed value. */
export const choosableFor = (sc: Scenario | undefined) =>
  inputsFor(sc).filter((i) =>
    i.control === "range"
      ? Number.isFinite(i.min) && Number.isFinite(i.max) && (i.max ?? 0) > (i.min ?? 0)
      : optionsFor(i, sc).length > 1
  )
/** Whether a scenario can render an option of an input. */
export const supports = (sc: Scenario | undefined, input: string, option: string | number) => {
  const descriptor = A.axes.inputs.find((candidate) => candidate.id === input)
  return !!descriptor && normalizeScenarioInput(descriptor, sc, option) !== undefined
}
/** The viewer's choice when this scenario supports it, else the scenario's designed value, else the input's default. Inputs the scenario does not use are left out. */
export function resolveValues(sc: Scenario | undefined, values: Record<string, string | number>) {
  const out: Record<string, string | number> = {}
  for (const i of inputsFor(sc)) {
    const chosen = values[i.id] === undefined ? undefined : normalizeScenarioInput(i, sc, values[i.id])
    const candidate = chosen ?? sc?.designed?.[i.id] ?? i.default
    const v = candidate === undefined ? undefined : normalizeScenarioInput(i, sc, candidate)
    if (v !== undefined) out[i.id] = v
  }
  return out
}
/** The same values with the viewer's dock choices removed, for playing a walkthrough exactly as designed. */
export const withoutLenses = (values: Record<string, string | number>) => Object.fromEntries(Object.entries(values).filter(([k]) => A.axes.inputs.find((i) => i.id === k)?.placement !== "dock"))
/** The axes Compare can change for a scenario: theme, profile and every scenario input it uses. */
export const compareAxes = (sc?: Scenario, draft = false) => [
  { id: "theme", label: A.axes.themeLabel },
  { id: "profile", label: "Profile" },
  ...choosableFor(sc)
    .filter((i) => i.control !== "range" || !!i.presets?.length)
    .map((i) => ({ id: i.id, label: i.label })),
  ...(draft ? [{ id: "design", label: "Design" }] : []),
]
export const axisOptions = (axis: string, sc?: Scenario): { id: string; label: string }[] => {
  if (axis === "theme") return A.axes.themes.map((t) => ({ id: t.id, label: t.label }))
  if (axis === "profile") return A.axes.profiles.map((p) => ({ id: p.id, label: p.label }))
  if (axis === "design") return [{ id: "built", label: "As built" }, { id: "draft", label: "Draft" }]
  const input = A.axes.inputs.find((i) => i.id === axis)
  if (input?.control === "range") return (input.presets ?? []).map((p) => ({ id: String(p.value), label: p.label }))
  return input ? optionsFor(input, sc) : []
}

// Only inputs with a default start with a value; a designed input is left unset until the viewer chooses.
export const defaultValues = (): Record<string, string | number> => Object.fromEntries(A.axes.inputs.flatMap((i) => (i.default !== undefined && i.placement !== "dock" ? [[i.id, i.default]] : [])))

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
  gallery: { size: 240, source: hasCaptures || !A.frameEntry ? "captures" : "live", query: "", hidden: [], onlyFlagged: false },
  options: { controls: "dock", details: "docked", railLabels: true, draftEverywhere: false, map: false },
  commandOpen: false,
  shortcutsOpen: false,
  mobilePanel: null,
}

type Ctx = State & {
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void
  scenarioObj: Scenario
  hasCaptures: boolean
  selectScenario: (id: string) => void
  setTheme: (id: string) => void
  setProfile: (id: string) => void
  /** A dragged or typed Inspect size; null returns to the profile's own size. Nothing is remounted. */
  setSize: (size: { w: number; h: number } | null) => void
  /** null returns the input to the scenario's designed value (or its default). */
  setValue: (id: string, value: string | number | null) => void
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
  /** Whether any draft exists, from Adjust or from Tokens. */
  hasDraft: boolean
  /** The draft for Inspect, Gallery and Compare: only when the viewer turned on draft everywhere. */
  viewDraft: (theme: string) => Draft
  setDesign: (patch: Partial<State["design"]>) => void
  resetDesign: (scope: "direction" | "all") => void
}

const StudioContext = React.createContext<Ctx | null>(null)

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
  const [state, setState] = React.useState<State>(() => {
    const options = readJSON<Partial<Options>>(OPTIONS_KEY)
    const drafts = readJSON<State["tokens"]["drafts"]>(DRAFTS_KEY)
    const presenter = readJSON<PresenterOverlay>(PRESENTER_KEY)
    const presentationPrefs = readJSON<{ speed?: number; focus?: boolean }>(PRESENT_PREFS_KEY)
    const savedDesign = readJSON<{ version: number; values: DesignValues; valuesByTheme: DesignValuesByTheme }>(DESIGN_KEY)
    const railLabels = readJSON<boolean>(RAIL_KEY)
    const fromLink = readHash()
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
    return { ...initial, ...fromLink, present, design, responsive, options: { ...initial.options, ...options, railLabels: railLabels ?? initial.options.railLabels }, tokens: { ...initial.tokens, drafts: drafts ?? {} }, presenter: isPresenterOverlay(presenter) ? presenter : initial.presenter }
  })
  const set = React.useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) => {
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }))
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
  React.useEffect(() => writeJSON(PRESENTER_KEY, state.presenter), [state.presenter])
  React.useEffect(() => writeJSON(PRESENT_PREFS_KEY, { speed: state.present.speed, focus: state.present.focus }), [state.present.speed, state.present.focus])
  React.useEffect(() => writeJSON(DESIGN_KEY, { version: 1, values: state.design.values, valuesByTheme: state.design.valuesByTheme }), [state.design.values, state.design.valuesByTheme])
  React.useEffect(() => {
    const q = new URLSearchParams({ view: state.view, scenario: state.scenario, theme: state.theme, profile: state.profile })
    if (state.size) q.set("size", `${state.size.w}x${state.size.h}`)
    for (const i of A.axes.inputs) if (i.placement === "dock" && state.values[i.id] !== undefined) q.set(i.id, String(state.values[i.id]))
    if (state.view === "design" && hasAdjust && A.tokens) q.set("tab", state.design.tab)
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
    history.replaceState(null, "", `#${q}`)
  }, [state.view, state.scenario, state.theme, state.profile, state.size, state.values, state.design.tab, state.design.values, state.design.valuesByTheme, state.responsive])
  // Unsaved Responsive edits stay in this browser until saved or reverted.
  React.useEffect(() => {
    const { resetNonce: _, ...keep } = state.responsive
    void _
    writeJSON(RESPONSIVE_KEY, keep)
  }, [state.responsive])
  // In the dev server the live layouts.json is read, so a save shows after a reload too.
  React.useEffect(() => {
    if (!canSaveLayouts) return
    fetch("__studio/layouts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !validateLayouts(data).length) set({ saved: (data as LayoutsFile).layouts })
      })
      .catch(() => undefined)
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
    selectScenario: (id) => restage({ scenario: id, mobilePanel: null }),
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
    setView: (v) => set((s) => ({ view: v, panelOpen: s.view === v ? !s.panelOpen : true })),
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
    draftFor: (theme) => {
      const d = designDraft(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme), theme)
      return { tokens: { ...d.tokens, ...handDrafts(state.tokens.drafts, theme) }, css: d.css, stylesheets: d.stylesheets, scoped: d.scoped }
    },
    hasDraft: Object.keys(state.tokens.drafts).length > 0 || A.axes.themes.some((theme) => !!encodeDesign(A, valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme.id), theme.id)),
    viewDraft: (theme) => {
      const values = valuesForTheme(A, state.design.values, state.design.valuesByTheme, theme)
      if (!state.options.draftEverywhere || (!Object.keys(state.tokens.drafts).length && !encodeDesign(A, values, theme))) return NO_DRAFT
      const d = designDraft(A, values, theme)
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
