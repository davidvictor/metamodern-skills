/*
 * Example adapter: a synthetic task app that ships with the starter so the
 * shell runs end to end before a product is connected. Everything here is
 * illustrative. Replace this file (and example/) with the product's adapter;
 * do not extend it with product facts.
 */
import type { Scenario, ScenarioInput, StudioAdapter, Token } from "@/studio/types"

const fixture = { id: "example-tasks", version: "1", provenance: "Synthetic, written for the starter" }
const src = "example/main.ts"
const clock = "Fixed: Tuesday, 10:00"

const t = (name: string, family: string, light: string, dark: string, extra: Partial<Token> = {}): Token => ({ name, family, values: { light, dark }, ...extra })
const tokens: Token[] = [
  t("--ex-primary", "Brand and action", "#0f766e", "#2dd4bf", { reads: 9 }),
  t("--ex-primary-ink", "Brand and action", "#ffffff", "#042f2e", { reads: 4 }),
  t("--ex-accent", "Brand and action", "#ccfbf1", "#134e4a", { reads: 3 }),
  t("--ex-ground", "Surfaces and ink", "#fafaf9", "#0c0a09", { reads: 6 }),
  t("--ex-surface", "Surfaces and ink", "#ffffff", "#1c1917", { reads: 11 }),
  t("--ex-ink", "Surfaces and ink", "#1c1917", "#f5f5f4", { reads: 21 }),
  t("--ex-ink-muted", "Surfaces and ink", "#57534e", "#a8a29e", { reads: 14 }),
  t("--ex-line", "Edges", "#e7e5e4", "#292524", { reads: 8 }),
  t("--ex-focus", "Edges", "0 0 0 3px rgb(15 118 110 / 35%)", "0 0 0 3px rgb(45 212 191 / 40%)", { reads: 5, flags: ["literal"], note: "Holds the primary color as fixed values, so it does not follow a draft of --ex-primary." }),
  t("--ex-danger", "Status", "#b91c1c", "#f87171", { reads: 3 }),
  t("--ex-warning", "Status", "#a16207", "#facc15", { reads: 0, flags: ["unread"] }),
  t("--ex-done", "Status", "#15803d", "#4ade80", { reads: 2 }),
  t("--ex-radius", "Radius and density", "10px", "10px", { reads: 12 }),
  t("--ex-row", "Radius and density", "48px", "48px", { reads: 4 }),
  t("--ex-space", "Radius and density", "16px", "16px", { reads: 7 }),
  t("--ex-text", "Type", "15px", "15px", { reads: 1 }),
  t("--ex-title", "Type", "24px", "24px", { reads: 1 }),
  t("--ex-leading", "Type", "1.45", "1.45", { reads: 1 }),
  t("--ex-font", "Type", 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', { reads: 1 }),
]
const families = [...new Set(tokens.map((x) => x.family))].map((name) => ({ name, count: tokens.filter((x) => x.family === name).length }))

// The Task card's properties: one of each kind, for the starter and its acceptance suite. They apply to the Task card surface only.
const cardProperties: ScenarioInput[] = [
  { id: "title", label: "Title", control: "text", curated: true, shareable: true, maxLength: 120, default: "Draft the quarterly plan" },
  { id: "done", label: "Done", control: "switch", curated: true, default: false },
  { id: "assignee", label: "Assignee", control: "choice", options: [{ id: "nobody", label: "Nobody" }, { id: "sam", label: "Sam Example" }, { id: "long", label: "A very long name" }], default: "sam", note: "The frame maps each option to a sample person." },
  { id: "note", label: "Note", control: "text", multiline: true, maxLength: 500, optional: true, default: "" },
  { id: "estimate", label: "Estimate (hours)", control: "number", min: 0, max: 40, step: 0.5, presets: [{ value: 1, label: "1 h" }, { value: 4, label: "4 h" }], optional: true, default: 2 },
  { id: "onOpen", label: "On open", control: "text", readonly: true, note: "Handled by the sample data" },
].map((i) => ({ ...i, section: "properties", surfaces: ["Task card"] }) as ScenarioInput)

export const exampleAdapter: StudioAdapter = {
  id: "example-tasks",
  version: "0.1.0",
  protocol: "studio-preview/1",
  product: { name: "Example Tasks", mark: "Ex", revision: "starter example", brand: "#0f766e" },
  target: {
    platform: "web",
    fidelity: "recreation",
    label: "Illustrative example",
    capabilities: {
      rendering: { mode: "real", reason: "Rendered live in its own frame" },
      behavior: { mode: "simulated", reason: "A few scripted commands; no backend" },
      navigation: { mode: "simulated", reason: "In-memory history per preview" },
      data: { mode: "simulated", reason: "Synthetic fixture" },
      os: { mode: "unavailable", reason: "Browser preview" },
    },
  },
  frameEntry: "./example/index.html",
  axes: {
    themeLabel: "Theme",
    themes: [
      { id: "light", label: "Light", appearance: "light", icon: "sun" },
      { id: "dark", label: "Dark", appearance: "dark", icon: "moon" },
      // High-contrast versions: the dock shows Light and Dark, and Contrast sits in its Design menu.
      { id: "light-contrast", label: "Light, high contrast", appearance: "light", icon: "sun-contrast", contrastOf: "light" },
      { id: "dark-contrast", label: "Dark, high contrast", appearance: "dark", icon: "moon-contrast", contrastOf: "dark" },
    ],
    profiles: [
      { id: "desktop", label: "Desktop", w: 1280, h: 800, kind: "desktop" },
      { id: "tablet", label: "Tablet", w: 834, h: 1112, kind: "tablet" },
      { id: "phone", label: "Phone", w: 390, h: 844, kind: "phone" },
    ],
    resizable: { min: { w: 280, h: 320 }, max: { w: 2560, h: 1600 }, snapWidths: [640, 768, 1024, 1280] },
    // The product's own Responsive layout, shown before the shell's presets, and one extra device for Add frame.
    responsive: {
      presets: [{ id: "task-sizes", name: "Task list sizes", frames: [{ w: 390, h: 844, kind: "phone", profile: "phone" }, { w: 834, h: 1112, kind: "tablet", profile: "tablet" }, { w: 1280, h: 800, kind: "desktop", profile: "desktop" }] }],
      devices: [{ w: 1180, h: 820, kind: "tablet", label: "Tablet, landscape" }],
    },
    inputs: [
      { id: "density", label: "Density", control: "presets", options: [{ id: "comfortable", label: "Comfortable" }, { id: "compact", label: "Compact" }], default: "comfortable", placement: "dock", group: "design", icon: "density", note: "The densities the product ships. Sign in has only Comfortable." },
      { id: "role", label: "Role", control: "select", options: [{ id: "owner", label: "Owner" }, { id: "viewer", label: "Viewer" }], placement: "dock", scoped: true, icon: "person", note: "Viewers see tasks without New task." },
      ...cardProperties,
    ],
  },
  areas: [
    { id: "tasks", label: "Tasks" },
    { id: "task", label: "Task detail" },
    { id: "account", label: "Account" },
    { id: "reports", label: "Reports" },
    { id: "help", label: "Help" },
    { id: "components", label: "Components" },
  ],
  // Task screens are designed for an owner; the role lens applies to them only.
  scenarios: ([
    { id: "tasks.list", label: "Today", area: "tasks", surface: "Task list", description: "Today's tasks, open first. New task is the page's one primary action.", fixture, source: src, clock, statuses: { design: "Unknown", delivery: "Unknown", evidence: "Unverified" } },
    { id: "tasks.list.empty", label: "First use", parent: "tasks.list", area: "tasks", surface: "Task list", state: "No tasks yet", description: "The list before anything exists.", fixture, source: src, clock },
    { id: "tasks.list.loading", label: "Loading", parent: "tasks.list", area: "tasks", surface: "Task list", state: "Loading", description: "The list while rows load. Loading is held, not timed.", fixture, source: src, clock },
    { id: "tasks.list.failed", label: "Failed to load", parent: "tasks.list", area: "tasks", surface: "Task list", state: "Error", description: "The list when loading fails, with Retry.", fixture, source: src, clock, status: "stale" },
    { id: "tasks.new", label: "New task", area: "tasks", surface: "New task dialog", state: "Dialog open", description: "The form for a new task over the list.", fixture, source: src, clock },
    { id: "task.detail", label: "Task", area: "task", surface: "Task detail", description: "One task with its notes and history.", fixture, source: src, clock },
    { id: "account.settings", label: "Settings", area: "account", surface: "Settings", description: "Name, notifications and appearance.", fixture, source: src, clock },
    { id: "account.sign-in", label: "Sign in", area: "account", surface: "Sign in", description: "The sign-in page. It ships at one density.", fixture, source: src, clock, supports: { density: ["comfortable"] } },
    { id: "help.guide", label: "Getting started", area: "help", surface: "Guide", description: "A long page that scrolls as a document: sections with anchors, a scrolling notes box and a short form. Used by the Responsive view.", fixture, source: src, clock },
    { id: "help.welcome", label: "Welcome", area: "help", surface: "Welcome", description: "A first-run page whose hero fills the window (100vh), so it has no full-page height of its own.", fixture, source: src, clock },
    { id: "components.task-card", label: "Task card", area: "components", surface: "Task card", description: "One task as a card. Its properties are editable in Details.", fixture, source: src, clock },
    { id: "components.task-card.done", label: "Done", parent: "components.task-card", area: "components", surface: "Task card", state: "Done", description: "A finished task.", fixture, source: src, clock, designed: { done: true } },
    { id: "reports.overview", label: "Overview", area: "reports", surface: "Reports", description: "Not designed yet.", fixture, source: src, clock, status: "later" },
  ] as Scenario[]).map((x) => (x.area === "tasks" || x.area === "task" ? { ...x, designed: { role: "owner" } } : x)),
  walkthroughs: [
    {
      id: "add-a-task",
      name: "Add a task",
      goal: "How a person adds a task and where it lands. Illustrative: the example app is synthetic.",
      illustrative: true,
      steps: [
        { scenario: "tasks.list", anchor: "new-task", narration: "The list opens on today's work. New task is the page's one primary action.", expect: "New task button is present" },
        { scenario: "tasks.list", commands: ["open-new-task"], anchor: "title-field", narration: "New task opens a short form. Only the title is required.", expect: "The dialog is open" },
        { scenario: "tasks.list", commands: ["open-new-task", "fill-title"], anchor: "save-task", narration: "With a title typed, Save becomes available. Nothing is saved yet.", expect: "Save is enabled" },
        { scenario: "tasks.list", commands: ["open-new-task", "fill-title", "save-task"], anchor: "first-task", narration: "Saving closes the dialog. The new task lands at the top of today's list.", expect: "The new task is first" },
        { scenario: "tasks.archive", narration: "Archived tasks keep what was finished last week." },
      ],
    },
  ],
  // Design parameters for the Adjust tab. The stops are the densities the example ships.
  design: {
    parameters: [
      {
        id: "density",
        label: "Density",
        kind: "scale",
        default: 1,
        min: 0.7,
        max: 1.3,
        step: 0.01,
        stops: [
          { at: 0.8, label: "Compact", values: { "--ex-row": "38px", "--ex-space": "12px" } },
          { at: 1, label: "Comfortable", values: { "--ex-row": "48px", "--ex-space": "16px" } },
        ],
        // --ex-space is read under .app in this example, as some products read density tokens under a wrapper; --ex-nav is not in the token source.
        apply: { scale: ["--ex-row", "--ex-space", "--ex-nav"], floor: { "--ex-row": 32 }, scope: { ":root .app": ["--ex-space"] }, base: { "--ex-nav": "220px" } },
        note: "Marks sit at the densities the product ships; anything between is exploration.",
      },
      { id: "radius", label: "Corner radius", kind: "scale", default: 1, min: 0, max: 2, step: 0.05, apply: { scale: ["--ex-radius"] } },
      { id: "body-font", label: "Typeface", kind: "font", default: "system-ui", options: ["Inter", "IBM Plex Sans", "Source Serif 4", "Georgia"], apply: { set: ["--ex-font"] }, note: "Google Fonts only; the font loads in the preview frame." },
      { id: "type-scale", label: "Type scale", kind: "ratio", default: 1.6, min: 1.2, max: 2, step: 0.01, apply: { steps: { "--ex-title": 1 }, warnBelow: { "--ex-title": 18 } } },
      { id: "text-size", label: "Text size", kind: "scale", default: 1, min: 0.75, max: 1.25, step: 0.01, apply: { scale: ["--ex-text", "--ex-title"], warnBelow: { "--ex-text": 12 } }, wontFollow: ["the 12 px tab labels"] },
      { id: "leading", label: "Line height", kind: "scale", default: 1, min: 0.85, max: 1.3, step: 0.01, apply: { scale: ["--ex-leading"], unitless: true } },
      { id: "neutral", label: "Neutral temperature", kind: "temperature", default: 0, min: -1, max: 1, step: 0.05, apply: { set: ["--ex-ground", "--ex-surface", "--ex-line"] }, note: "Tints the grounds and lines toward warm or cool." },
      { id: "primary", label: "Primary color", kind: "color", default: "#0f766e", apply: { set: ["--ex-primary"], derive: { "--ex-accent": "color-mix(in oklch, $value 18%, white)" }, contrast: { against: ["--ex-primary-ink"], min: 4.5 } }, note: "Contrast is checked against the text on primary buttons." },
      { id: "accent", label: "Accent color", kind: "color", default: "#ccfbf1", note: "Set after Primary, so it wins over the accent Primary derives.", apply: { set: ["--ex-accent"], contrast: { against: ["--ex-ink"], min: 4.5 } } },
    ],
  },
  comparisons: [{ id: "list-light-dark", label: "Today in Light and Dark", scenario: "tasks.list", a: "light", b: "dark" }],
  tokens: { source: "example/product.css", columns: ["light", "dark"], grounds: { light: "#fafaf9", dark: "#0c0a09" }, families, total: tokens.length, tokens },
}

// The shell acceptance build always uses the example, even in an adopted product Studio.
export { exampleAdapter as adapter }
