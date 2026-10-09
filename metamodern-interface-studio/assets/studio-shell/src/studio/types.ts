import type { AnnotationDeclaration } from "./annotations/types"
import type { DesignDirectionsDeclaration } from "./directions"
import type { DesignEditorDeclaration } from "./design-ui/types"
/*
 * The adapter declaration: everything the shell knows about one product.
 * The shell is product-neutral; a Studio differs only by the adapter it loads
 * (src/adapter.ts) and the frame entry that adapter points at. In a real
 * Studio these records are generated from the manifest (manifest v1) and the
 * runtime catalog, with presenter material read from overlays; never hand-copy
 * product facts into shell components.
 */

import type { DesignCompilerDescriptor } from "./design-runtime"
import type { Preset, PresetFrame } from "./layouts"

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
  /**
   * The theme this is the high-contrast version of. When themes declare it, the dock shows only the standard
   * themes and offers Contrast in its Design menu; without it every theme is its own button.
   */
  contrastOf?: string
}

export type Profile = {
  id: string
  label: string
  w: number
  h: number
  kind: "desktop" | "laptop" | "tablet" | "phone"
  /** Outer preview/device radius in unscaled CSS pixels. Use 0 for a flat viewport. */
  frameRadius?: number
}

/** Inspect may drag a live frame to any size in this range. Widths in `snapWidths` attract the edge, as do the profiles' own sizes. */
export type Resizable = {
  min: { w: number; h: number }
  max: { w: number; h: number }
  snapWidths?: number[]
}

/** A value a scenario input takes: an option ID, a number, text, or a switch's state. Never an object, node or function. */
export type InputValue = string | number | boolean

/**
 * A scenario input the adapter declares, such as density, role, clock or condition. A change rebuilds the preview.
 * An input in the "properties" section is a component property instead: it edits the selected state without a remount.
 */
export type ScenarioInput = {
  /** Values travel in links under this ID. A property may not use a key the Studio's own links use (`RESERVED_LINK_KEYS` in input.ts). */
  id: string
  label: string
  /**
   * select, presets and range as before. switch is a boolean; text a string (`multiline`, `maxLength`); number a plain
   * field with optional `min`, `max` and `step`; choice names options that stand for values the frame owns, and sends only the option ID.
   */
  control: "select" | "presets" | "range" | "switch" | "text" | "number" | "choice"
  /** Select, preset and choice options. Range inputs may omit these and declare numeric bounds instead. */
  options?: { id: string; label: string }[]
  /** Inclusive numeric bounds for a range input (required) or a number input (optional). */
  min?: number
  max?: number
  step?: number
  /** Named marks for a range or number. Values travel as numbers, not labels. A number with presets can be a Compare axis. */
  presets?: { value: number; label: string }[]
  /** A presentation hint understood by the shell: `time` is minutes after midnight; `time-hours` is decimal 24-hour time. */
  format?: "time" | "time-hours"
  /** The value when the scenario designs none and the viewer chose none. Omit when every scenario that uses the input designs its own. For an optional property, the product default shown greyed. */
  default?: InputValue
  /** Why an option is missing or limited, shown with the control. */
  note?: string
  /**
   * Where the control lives. "details" (the default) is for what the scenario is; "dock" is for how a screen is
   * looked at, such as the role it is seen as. A dock input is a lens: Present ignores the viewer's choice and plays
   * each step as designed.
   */
  placement?: "details" | "dock"
  /** A dock input in the "design" group sits in the dock's Design menu, with contrast, instead of as its own control. It is still a lens. */
  group?: "design"
  /** Only scenarios that design a value for this input use it (`Scenario.designed`); elsewhere there is no control and no value is sent. */
  scoped?: boolean
  /** Icon for the dock control. */
  icon?: "person" | "density" | "sliders"
  /** "properties": a component property, shown in Details > Scenario > Properties and never in the dock. */
  section?: "properties"
  /** The surfaces (`Scenario.surface`) the input applies to. Elsewhere it has no control and sends no value. */
  surfaces?: string[]
  /** Shown in the top group of Properties; every other property sits under a collapsed All properties. */
  curated?: boolean
  /** Unset by default: the row shows the product default greyed with Set, and no value is sent until it is set. */
  optional?: boolean
  /** Text only: the value may travel in links. Other text stays in the viewer's browser. */
  shareable?: boolean
  /** A property the Studio cannot edit, such as a function. It is listed with its note and sends no value. */
  readonly?: boolean
  /** Text only: a multi-line field. */
  multiline?: boolean
  /** Text only: the most characters accepted. */
  maxLength?: number
}

/** An existing capture with its provenance. A capture proves only the visible state it recorded. */
export type Capture = {
  src: string
  w: number
  h: number
  digest?: string
  recordedAt?: string
  source?: string
}

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
  designed?: Record<string, InputValue>
  /**
   * The options of a scenario input this scenario can actually render, keyed by input ID, such as
   * `{ density: ["default", "compact"] }`. Only these are offered for it; without an entry every option is.
   */
  supports?: Record<string, Array<string | number>>
  /** A saved state (scenarios.json): the generated scenario it was saved from. The frame renders that one with `designed`. */
  savedFrom?: string
  /** Independent statuses; the Studio never infers approval. */
  statuses?: {
    design?: string
    delivery?: string
    evidence?: string
    fingerprint?: string
  }
}

export type Area = { id: string; label: string }

export type Step = {
  /** Stable identity for presenter annotations. Omit only for older generated walkthroughs. */
  id?: string
  scenario: string
  theme?: string
  profile?: string
  /** Product commands replayed through the frame, in order, before the step is ready. */
  commands?: string[]
  /** Scenario input values for this step. They supplement the scenario's designed values. */
  values?: Record<string, string | number>
  /** Authored live appearance inputs, separate from scenario/component values. */
  design?: Record<string, string | number>
  /** Optional playback duration in seconds. The presenter can still advance manually. */
  duration?: number
  /** Keep this step in the authored sequence without showing it in a public walkthrough. */
  hidden?: boolean
  /** A semantic anchor the product exposes (data-studio-anchor). Missing anchors stop the step. */
  anchor?: string
  narration: string
  /** The observable outcome the presenter expects. */
  expect?: string
}

export type Walkthrough = {
  id: string
  name: string
  goal: string
  illustrative?: boolean
  steps: Step[]
}

/** A saved pair on one axis: "theme" (default), "profile", the ID of a scenario input, or `appearance:<parameter-id>` for a comparable live Design enum. a and b are option IDs of that axis. */
export type Comparison = {
  id: string
  label: string
  scenario?: string
  axis?: string
  /** Legacy two-way fallback when `values` is absent. */
  a?: string
  b?: string
  /** The complete ordered n-up tuple. Legacy `a` and `b` remain a two-way fallback. */
  values?: string[]
  /** Lets a presenter change the saved pair in the Studio without changing generated material. */
  editable?: boolean
}

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

/**
 * One control of the Design view's Adjust tab. The shell turns its value into draft token values and,
 * for what tokens cannot reach, draft CSS; products differ only in what they declare. A draft is
 * exploration, always labeled, never the product.
 */
export type DesignParameter = {
  id: string
  label: string
  /**
   * scale: multiplies lengths. ratio: a type scale ratio. font: a typeface. color: a color.
   * temperature: from cool (-1) to warm (1), mixed into neutral tokens.
   */
  kind: "scale" | "ratio" | "font" | "color" | "temperature" | "enum" | "range"
  /** The value the product is built with: a number for scale and ratio, a font name or color for font and color. */
  default: number | string
  /** The themes where this parameter is available. It is absent elsewhere rather than silently applied. */
  themes?: string[]
  /** Product-as-built values by theme, used in place of `default` where declared. */
  defaultsByTheme?: Record<string, number | string>
  min?: number
  max?: number
  step?: number
  /**
   * Marks on a scale, such as the densities the product ships. With `values`, the tokens at that mark:
   * between two marks the slider interpolates them, beyond the ends it scales from the nearest mark.
   */
  stops?: { at: number; label: string; values?: Record<string, string> }[]
  /** font: a curated list; any Google Font name is also accepted. */
  options?: string[]
  /** Labeled values for categorical controls. `options` remains for backwards-compatible font lists. */
  choices?: { id: string; label: string }[]
  apply: {
    /** Send this parameter's raw value to a live frame; useful when changing product markup, not just tokens. */
    input?: string
    /** In-place appearance update, only when the frame explicitly announces live-appearance. */
    live?: boolean
    /** scale: token names or globs (`--space-*`) whose lengths follow the value. */
    scale?: string[]
    /** ratio: type tokens and their step on the scale (0 for the base size, 1 for one step up, -1 for one down). */
    steps?: Record<string, number>
    /** font and color: tokens set to the value. temperature: the neutral tokens it tints. */
    set?: string[]
    /**
     * color: tokens derived from the value, each a CSS expression using $value, such as
     * `color-mix(in oklch, $value 12%, white)`, or one expression per theme ID when the relation differs by theme.
     */
    derive?: Record<string, string | Record<string, string>>
    /**
     * Tokens the product reads under a selector rather than the root, keyed by selector, such as
     * `{ ":root [data-density]": ["--control-height"] }`. Their draft values go out as a CSS rule.
     */
    scope?: Record<string, string[]>
    /** Values for tokens outside the token source, such as a framework's own `--spacing`. */
    base?: Record<string, string>
    /** CSS rules using $value, for what tokens cannot reach, such as fonts baked into utility classes. */
    css?: string
    /** scale and ratio: also scale bare numbers, such as unitless line heights. */
    unitless?: boolean
    /** Token names or globs a glob matched that must not follow. */
    exclude?: string[]
    /** Smallest value in px a token may take after scaling, such as 44 for a touch target. */
    floor?: Record<string, number>
    /** Warn when a token ends below this size in px, such as 12 for text. */
    warnBelow?: Record<string, number>
    /** temperature: the most a neutral is mixed toward warm or cool, in percent. Defaults to 12. */
    amount?: number
    /** color: tokens the value must stay readable against, with the least contrast ratio. */
    contrast?: { against: string[]; min: number }
  }
  /** Shown under the control, such as which modes the product ships. */
  note?: string
  /** What this parameter cannot reach, listed as "won't follow", such as fixed sizes or literal colors inside shadows. */
  wontFollow?: string[]
}

/** A neutral, product-supplied rendering measurement for the Details panel. */
export type FrameDiagnostic = {
  id: string
  label: string
  value: string | number
  budget?: number
  unit?: string
  status?: "ok" | "warning" | "error" | "info"
  note?: string
}

/** The fixed icon set workspace modules choose from; the kit draws them (src/kit/icons.tsx). */
export type StudioIcon =
  | "activity"
  | "boxes"
  | "database"
  | "file-text"
  | "flag"
  | "globe"
  | "key"
  | "languages"
  | "layers"
  | "mail"
  | "plug"
  | "server"
  | "settings"
  | "shield"
  | "table"
  | "terminal"
  | "users"
  | "wrench"

/** An operation a workspace module may call, and whether it reads or writes. Anything a module did not declare is refused before a request. */
export type WorkspaceOperationUse = { name: string; kind: "read" | "write" }

export type WorkspaceModuleDeclaration = {
  /** Stable ID: lowercase letters, digits and hyphens. Links carry it as `module=`. */
  id: string
  label: string
  icon: StudioIcon
  /** Listed in the context panel and Go to; links carry the ID as `section=`. */
  sections?: { id: string; label: string }[]
  /**
   * Same ID rules as `id`. The rail and the phone's Workspace drawer draw a divider between two consecutive modules
   * whose groups differ (a module without one counts as its own group). Without groups nothing changes.
   */
  group?: string
  /**
   * Operation names this module may call; anything else is refused. Empty or omitted, the module is host-free: it
   * calls nothing, so it opens without `workspace.operations` (for example in a Studio published as static files).
   */
  uses?: WorkspaceOperationUse[]
  /** A reason, shown instead of the module. */
  unavailable?: string
}

/** Product workspace tools beside the views (the skill's references/workspace.md). Data only: module code lives in src/workspace/index.ts. */
export type WorkspaceDeclaration = {
  /** Same-origin base URL of the host's operation endpoints. Without it every module that declares `uses` is unavailable with the reason; host-free modules still open. */
  operations?: string
  modules: WorkspaceModuleDeclaration[]
}

/** A top-level section of the component library, holding groups (references/library.md). */
export type LibrarySection = { id: string; label: string }

/** A group of the component library, in the product's own taxonomy (references/library.md). */
export type LibraryGroup = {
  id: string
  label: string
  /** The ID of one of the library's sections. Required when the library declares sections, refused when it does not. */
  section?: string
}

/** A component in the library's index. Its documentation is a product module in src/library/, loaded when its page opens. */
export type LibraryComponent = {
  /** Stable ID: lowercase letters, digits and hyphens. Links carry it as `library=`. */
  id: string
  label: string
  /** The ID of one of the library's groups: the component's home, which the breadcrumb and Go to use. */
  group: string
  /** Other groups that also list the component, each opening the same page. Never the home group. */
  alsoIn?: string[]
  /** One sentence, shown under the title and searched; at most 200 characters. */
  summary: string
  /** More words search finds it by. */
  keywords?: string[]
  /**
   * Lays every preview block on the component's page out wider than the text column: up to 1.5 times its width, centred
   * on it and within the page's gutters. Previews still fit their box and never show above their natural size.
   */
  wide?: boolean
}

/** A component library beside the views, declared as data (references/library.md). Documentation lives in src/library/index.ts. */
export type LibraryDeclaration = {
  /** The rail item's and the breadcrumb's name. Defaults to "Library". */
  label?: string
  /** From the shell's fixed icon set. Defaults to "layers". */
  icon?: StudioIcon
  /**
   * The preview entry for library frames, resolved against the Studio page like `frameEntry` and refused unless it is
   * on the frame entry's origin. Defaults to `frameEntry`; without either, previews show their code and captures only.
   */
  entry?: string
  /**
   * Optional top level: with sections the panel nests groups under them, and each section and group is a disclosure.
   * Without them the panel lists the groups flat, as before.
   */
  sections?: LibrarySection[]
  /** In the order the panel and Go to list them (within each section when there are sections). */
  groups: LibraryGroup[]
  /** In the order each group lists them. */
  components: LibraryComponent[]
}

export type StudioAdapter = {
  /** Explicit local-only annotation capability; omitted adapters stay inert. */
  annotations?: AnnotationDeclaration
  id: string
  version: string
  protocol: "studio-preview/1"
  product: {
    name: string
    /** Two letters for the rail mark; shown when the product has no drawn mark. */
    mark: string
    /** The product's own mark as SVG paths, drawn in the tile's foreground color. Wins over the letters. */
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
    /** Fidelity stays in Details; a presentation may hide the optional top-bar badge. */
    showFidelityInToolbar?: boolean
    capabilities: Record<CapabilityDimension, Capability>
  }
  /** URL of the isolated preview document that speaks studio-preview/1. Omit for capture-only Studios. */
  frameEntry?: string
  /** Allowed origin of the frame entry; defaults to this Studio's origin. */
  frameOrigin?: string
  /**
   * Isolation for every preview frame the Studio creates (Inspect, Compare, Responsive, Gallery, Present, Design).
   * `sandbox` is the iframe sandbox token list, such as "allow-scripts allow-forms"; omitted, frames get no sandbox
   * attribute. "allow-scripts allow-same-origin" on a frame served from the Studio's own origin isolates nothing (the
   * frame can remove its own sandbox); add allow-same-origin only for a frame entry on a separate origin. `credentialless: true` loads frames without the viewer's cookies where the browser
   * supports it (Chromium; others ignore it, so do not rely on it alone).
   */
  frameIsolation?: { credentialless?: boolean; sandbox?: string }
  axes: {
    themeLabel: string
    themes: Theme[]
    profiles: Profile[]
    /** Offered only with a live frame. Without it profiles are the only sizes. */
    resizable?: Resizable
    inputs: ScenarioInput[]
    /** The Responsive view: product layouts shown before the shell's presets, and sizes offered in Add frame. */
    responsive?: {
      presets?: Preset[]
      replaceShellPresets?: boolean
      devices?: PresetFrame[]
    }
    /** Profile a viewer starts on, on every screen size. Without it the first profile opens, and a phone opens on the phone profile. */
    defaultProfile?: string
  }
  areas: Area[]
  scenarios: Scenario[]
  walkthroughs: Walkthrough[]
  comparisons?: Comparison[]
  tokens?: TokenSet
  /** Parameters for the Design view's Adjust tab. Without them (and without tokens) there is no Design view. */
  design?: { parameters: DesignParameter[]; compiler?: DesignCompilerDescriptor; editor?: DesignEditorDeclaration; directions?: DesignDirectionsDeclaration }
  /** Anything the Studio changes about product rendering, disclosed on every preview. */
  presentationOverrides?: { id: string; label: string }[]
  /** Product workspace tools beside the views, declared as data (references/workspace.md). Without it the Studio has no workspace. */
  workspace?: WorkspaceDeclaration
  /** A component library with one documentation page per component (references/library.md). Without it the Studio has no library. */
  library?: LibraryDeclaration
}
