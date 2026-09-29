/*
 * The adapter declaration: everything the shell knows about one product.
 * The shell is product-neutral; a Studio differs only by the adapter it loads
 * (src/adapter.ts) and the frame entry that adapter points at. In a real
 * Studio these records are generated from the manifest (manifest v1) and the
 * runtime catalog, with presenter material read from overlays; never hand-copy
 * product facts into shell components.
 */

/** How one capability dimension of a preview behaves. */
export type Mode = "real" | "simulated" | "static" | "unavailable"

/** The fidelity class of a preview, from the skill's adapter contract. */
export type Fidelity = "actual" | "actual-substituted" | "instrumented-native" | "static-capture" | "recreation"

export type CapabilityDimension = "rendering" | "behavior" | "navigation" | "data" | "os"
export type Capability = { mode: Mode; reason: string }

export type Theme = {
  id: string
  label: string
  /** The product ground for this theme; the shell uses it to keep the preview edge visible. */
  appearance: "light" | "dark"
  /** Icon hint. Named product variants use "swatch" and show their label. */
  icon?: "sun" | "moon" | "sun-contrast" | "moon-contrast" | "swatch"
}

export type Profile = { id: string; label: string; w: number; h: number; kind: "desktop" | "laptop" | "tablet" | "phone" }

/** Inspect may drag a live frame to any size in this range. Widths in `snapWidths` attract the edge, as do the profiles' own sizes. */
export type Resizable = { min: { w: number; h: number }; max: { w: number; h: number }; snapWidths?: number[] }

/** A scenario input the adapter declares, such as density, role, clock or condition. A change rebuilds the preview. */
export type ScenarioInput = {
  id: string
  label: string
  control: "select" | "presets"
  options: { id: string; label: string }[]
  /** The value when the scenario designs none and the viewer chose none. Omit when every scenario that uses the input designs its own. */
  default?: string
  /** Why an option is missing or limited, shown with the control. */
  note?: string
  /**
   * Where the control lives. "details" (the default) is for what the scenario is; "dock" is for how a screen is
   * looked at, such as the role it is seen as. A dock input is a lens: Present ignores the viewer's choice and plays
   * each step as designed.
   */
  placement?: "details" | "dock"
  /** Only scenarios that design a value for this input use it (`Scenario.designed`); elsewhere there is no control and no value is sent. */
  scoped?: boolean
  /** Icon for the dock control. */
  icon?: "person" | "density" | "sliders"
}

/** An existing capture with its provenance. A capture proves only the visible state it recorded. */
export type Capture = { src: string; w: number; h: number; digest?: string; recordedAt?: string; source?: string }

export type Scenario = {
  /** Stable semantic ID. Labels, routes and files may change; this does not. */
  id: string
  label: string
  area: string
  surface: string
  state?: string
  /** A variant shown nested under another scenario of the same surface. */
  parent?: string
  description: string
  fixture: { id: string; version: string; provenance: string }
  source: string
  clock: string
  /** stale: source changed since the last evidence. unresolved: a reference is broken. later: not designed yet. */
  status?: "stale" | "unresolved" | "later"
  /** Keyed `${themeId}:${profileId}`. */
  captures?: Partial<Record<string, Capture>>
  /** The value this scenario was designed with for a scenario input, keyed by input ID, such as `{ role: "viewer" }`. */
  designed?: Record<string, string>
  /**
   * The options of a scenario input this scenario can actually render, keyed by input ID, such as
   * `{ density: ["default", "compact"] }`. Only these are offered for it; without an entry every option is.
   */
  supports?: Record<string, string[]>
  /** Independent statuses; the Studio never infers approval. */
  statuses?: { design?: string; delivery?: string; evidence?: string; fingerprint?: string }
}

export type Area = { id: string; label: string }

export type Step = {
  scenario: string
  theme?: string
  profile?: string
  /** Product commands replayed through the frame, in order, before the step is ready. */
  commands?: string[]
  /** A semantic anchor the product exposes (data-studio-anchor). Missing anchors stop the step. */
  anchor?: string
  narration: string
  /** The observable outcome the presenter expects. */
  expect?: string
}

export type Walkthrough = { id: string; name: string; goal: string; illustrative?: boolean; steps: Step[] }

/** A saved pair on one axis: "theme" (default), "profile", or the ID of a scenario input. a and b are option IDs of that axis. */
export type Comparison = { id: string; label: string; scenario?: string; axis?: string; a: string; b: string }

export type TokenFlag = "unread" | "literal" | "coupled"
export type Token = {
  name: string
  family: string
  /** Value per theme ID. */
  values: Record<string, string>
  reads?: number
  flags?: TokenFlag[]
  note?: string
}

export type TokenSet = {
  /** Where the values were read, shown in the table header. */
  source: string
  /** Which two themes the table shows side by side. */
  columns: [string, string]
  /** The product ground each theme's values are drawn on. */
  grounds?: Record<string, string>
  families: { name: string; count: number }[]
  total: number
  tokens: Token[]
}

export type StudioAdapter = {
  id: string
  version: string
  protocol: "studio-preview/1"
  product: {
    name: string
    /** Two letters for the rail mark; shown when the product has no drawn mark. */
    mark: string
    /** The product's own mark as SVG paths, drawn in the tile's foreground colour. Wins over the letters. */
    markSvg?: { viewBox: string; paths: string[] }
    revision: string
    /** Offered as the "product brand" swatch in Studio settings. It tints Studio accents only. */
    brand?: string
    /** Start on the product brand instead of neutral. A viewer's own choice, including Neutral, still wins. */
    brandDefault?: boolean
  }
  target: {
    platform: "web" | "ios" | "android"
    fidelity: Fidelity
    /** Plain label for the preview tab, such as "Actual UI · sample data". */
    label: string
    capabilities: Record<CapabilityDimension, Capability>
  }
  /** URL of the isolated preview document that speaks studio-preview/1. Omit for capture-only Studios. */
  frameEntry?: string
  /** Allowed origin of the frame entry; defaults to this Studio's origin. */
  frameOrigin?: string
  axes: {
    themeLabel: string
    themes: Theme[]
    profiles: Profile[]
    /** Offered only with a live frame. Without it profiles are the only sizes. */
    resizable?: Resizable
    inputs: ScenarioInput[]
    /** Profile a viewer starts on, on every screen size. Without it the first profile opens, and a phone opens on the phone profile. */
    defaultProfile?: string
  }
  areas: Area[]
  scenarios: Scenario[]
  walkthroughs: Walkthrough[]
  comparisons?: Comparison[]
  tokens?: TokenSet
  /** Anything the Studio changes about product rendering, disclosed on every preview. */
  presentationOverrides?: { id: string; label: string }[]
}
