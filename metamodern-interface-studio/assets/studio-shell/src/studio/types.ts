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

/** A scenario input the adapter declares, such as density, clock or condition. A change rebuilds the preview. */
export type ScenarioInput = {
  id: string
  label: string
  control: "select" | "presets"
  options: { id: string; label: string }[]
  default: string
  /** Why an option is missing or limited, shown under the control. */
  note?: string
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

export type Comparison = { id: string; label: string; scenario?: string; a: string; b: string }

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
    /** Two letters for the rail mark. */
    mark: string
    revision: string
    /** Offered as the "product brand" swatch in Studio settings. It tints Studio accents only. */
    brand?: string
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
  axes: { themeLabel: string; themes: Theme[]; profiles: Profile[]; inputs: ScenarioInput[] }
  areas: Area[]
  scenarios: Scenario[]
  walkthroughs: Walkthrough[]
  comparisons?: Comparison[]
  tokens?: TokenSet
  /** Anything the Studio changes about product rendering, disclosed on every preview. */
  presentationOverrides?: { id: string; label: string }[]
}
