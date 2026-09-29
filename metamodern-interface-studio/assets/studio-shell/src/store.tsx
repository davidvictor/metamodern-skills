/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { toast } from "sonner"

import { adapter } from "@/adapter"
import type { Scenario, Token } from "@/studio/types"

export type View = "inspect" | "compare" | "gallery" | "present" | "tokens"
export type CompareMode = "side" | "split" | "toggle"
export type Options = { controls: "dock" | "toolbar"; details: "docked" | "floating"; railLabels: boolean }
export type PreviewStatus = { status: "loading" | "ready" | "error" | "static" | "empty"; modified: boolean; canGoBack: boolean; location?: string; fingerprint?: string; reason?: string; previous?: boolean }

type State = {
  view: View
  panelOpen: boolean
  detailsOpen: boolean
  scenario: string
  theme: string
  profile: string
  /** A dragged Inspect size on top of the profile. The profile still decides input context; this only sets the frame's pixels. */
  size: { w: number; h: number } | null
  values: Record<string, string>
  zoom: "fit" | number
  /** Bumped by Reset: a fresh runtime is mounted from the same scenario. */
  resetNonce: number
  preview: PreviewStatus
  compare: { axis: string; a: string; b: string; mode: CompareMode; split: number; showB: boolean }
  present: { tour: string; step: number; playing: boolean; speed: number; elapsed: number }
  tokens: { selected: string; drafts: Record<string, Record<string, string>>; query: string; flag: "all" | "unread" | "literal" | "draft"; family: string | null }
  gallery: { size: number; source: "captures" | "live"; query: string; hidden: string[]; onlyFlagged: boolean }
  options: Options
  commandOpen: boolean
  shortcutsOpen: boolean
  mobilePanel: null | "panel" | "details"
}

const A = adapter
const OPTIONS_KEY = `studio.${A.id}.options`
const DRAFTS_KEY = `studio.${A.id}.token-drafts`
const VIEWS: View[] = ["inspect", "compare", "gallery", "present", "tokens"]
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

/** A link that names a scenario this Studio does not have. It is said out loud, never replaced silently. */
let unresolvedLink: string | null = null

/** Selection lives in the URL as stable IDs only, never fixture values. */
function readHash(): Partial<State> {
  const q = new URLSearchParams(location.hash.slice(1))
  const out: Partial<State> = {}
  const view = q.get("view") as View | null
  if (view && VIEWS.includes(view)) out.view = view
  const sc = q.get("scenario")
  if (sc && A.scenarios.some((x) => x.id === sc)) out.scenario = sc
  else if (sc) unresolvedLink = sc
  const th = q.get("theme")
  if (th && A.axes.themes.some((x) => x.id === th)) out.theme = th
  const pr = q.get("profile")
  if (pr && A.axes.profiles.some((x) => x.id === pr)) out.profile = pr
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

/** The axes Compare can change: theme, profile and every scenario input. */
export const compareAxes = () => [{ id: "theme", label: A.axes.themeLabel }, { id: "profile", label: "Profile" }, ...A.axes.inputs.map((i) => ({ id: i.id, label: i.label }))]
export const axisOptions = (axis: string): { id: string; label: string }[] =>
  axis === "theme" ? A.axes.themes.map((t) => ({ id: t.id, label: t.label })) : axis === "profile" ? A.axes.profiles.map((p) => ({ id: p.id, label: p.label })) : (A.axes.inputs.find((i) => i.id === axis)?.options ?? [])

export const defaultValues = () => Object.fromEntries(A.axes.inputs.map((i) => [i.id, i.default]))

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
  resetNonce: 0,
  preview: { status: "loading", modified: false, canGoBack: false },
  compare: { axis: A.comparisons?.[0]?.axis ?? "theme", a: A.comparisons?.[0]?.a ?? A.axes.themes[0].id, b: A.comparisons?.[0]?.b ?? A.axes.themes[A.axes.themes.length - 1].id, mode: "side", split: 50, showB: false },
  present: { tour: A.walkthroughs[0]?.id ?? "", step: 0, playing: false, speed: 1, elapsed: 0 },
  tokens: { selected: A.tokens?.tokens[0]?.name ?? "", drafts: {}, query: "", flag: "all", family: null },
  gallery: { size: 240, source: hasCaptures || !A.frameEntry ? "captures" : "live", query: "", hidden: [], onlyFlagged: false },
  options: { controls: "dock", details: "docked", railLabels: false },
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
  setValue: (id: string, value: string) => void
  setView: (v: View) => void
  reset: () => void
  step: (d: number) => void
  /** Valid draft values for one theme, the only drafts ever sent to a preview. */
  draftsFor: (theme: string) => Record<string, string>
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

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(() => {
    const options = readJSON<Partial<Options>>(OPTIONS_KEY)
    const drafts = readJSON<State["tokens"]["drafts"]>(DRAFTS_KEY)
    return { ...initial, ...readHash(), options: { ...initial.options, ...options }, tokens: { ...initial.tokens, drafts: drafts ?? {} } }
  })
  const set = React.useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) => {
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }))
  }, [])
  React.useEffect(() => {
    if (unresolvedLink) toast.warning("That link names a scenario this Studio does not have", { description: `${unresolvedLink} is not in the catalog. Showing the first scenario instead.`, duration: 12000 })
    unresolvedLink = null
  }, [])
  React.useEffect(() => writeJSON(OPTIONS_KEY, state.options), [state.options])
  React.useEffect(() => writeJSON(DRAFTS_KEY, state.tokens.drafts), [state.tokens.drafts])
  React.useEffect(() => {
    const q = new URLSearchParams({ view: state.view, scenario: state.scenario, theme: state.theme, profile: state.profile })
    if (state.size) q.set("size", `${state.size.w}x${state.size.h}`)
    history.replaceState(null, "", `#${q}`)
  }, [state.view, state.scenario, state.theme, state.profile, state.size])

  const scenarioObj = A.scenarios.find((x) => x.id === state.scenario) ?? firstScenario
  // Any input change mounts a new runtime; the previous preview stays until the new one is ready.
  const restage = (patch: Partial<State>) => set((s) => ({ ...patch, preview: { ...s.preview, status: "loading", modified: false, canGoBack: false } }))

  const value: Ctx = {
    ...state,
    set,
    scenarioObj,
    hasCaptures,
    selectScenario: (id) => restage({ scenario: id, mobilePanel: null }),
    setTheme: (id) => restage({ theme: id }),
    setProfile: (id) => restage({ profile: id, size: null }),
    setSize: (size) => set({ size }),
    setValue: (id, v) => set((s) => ({ values: { ...s.values, [id]: v }, preview: { ...s.preview, status: "loading", modified: false } })),
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
    draftsFor: (theme) => {
      const out: Record<string, string> = {}
      for (const [name, byTheme] of Object.entries(state.tokens.drafts)) {
        const token = A.tokens?.tokens.find((t) => t.name === name)
        const v = byTheme[theme]
        if (token && v && draftIsValid(token, theme, v)) out[name] = v.trim()
      }
      return out
    },
  }
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export const captureFor = (s: Scenario, theme: string, profile: string) => s.captures?.[`${theme}:${profile}`]
export const areaLabel = (id: string) => A.areas.find((a) => a.id === id)?.label ?? id
export const areaCount = (id: string) => A.scenarios.filter((x) => x.area === id).length
