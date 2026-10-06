/*
 * The example library's preview entry: one document that renders a component's variant group, example or playground
 * for a scenario `<component>:<example>`, applying playground values in place. A product writes its own entry, with
 * its own scenario strings; the contract is studio-preview/1 (see references/library.md). Remove with example/.
 */
import { connectStudioFrame } from "../../src/studio/frame-client"
import type { MountInputs } from "../../src/studio/protocol"

type Values = MountInputs["values"]
type ButtonProps = { label: string; variant: string; size: string; disabled: boolean }

const app = document.getElementById("app")!
/** For the starter's acceptance script only: how many times this document mounted, and the values it last applied. */
const testing = window as unknown as { __libMounts?: number; __libValues?: Values }
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const VARIANTS: Record<string, string> = { primary: "", secondary: "ghost", danger: "danger" }
const SIZES: Record<string, string> = { small: "sm", medium: "", large: "lg" }
const DEFAULTS: ButtonProps = { label: "Save changes", variant: "primary", size: "medium", disabled: false }
const ICON = '<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
const title = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Playground values as the button's props; anything the frame does not know falls back to the default. */
const fromValues = (v: Values): ButtonProps => ({
  label: typeof v.label === "string" && v.label.length <= 80 ? v.label : DEFAULTS.label,
  variant: typeof v.variant === "string" && v.variant in VARIANTS ? v.variant : DEFAULTS.variant,
  size: typeof v.size === "string" && v.size in SIZES ? v.size : DEFAULTS.size,
  disabled: v.disabled === true,
})
const button = (b: ButtonProps, icon = "") => `<button type="button" data-sample data-variant="${b.variant}" class="btn ${VARIANTS[b.variant]} ${SIZES[b.size]}"${b.disabled ? " disabled" : ""}>${icon}${esc(b.label)}</button>`
const field = (value: string, placeholder: string, error?: string, disabled = false) =>
  `<label class="lib-field" data-sample><span>Title</span><input value="${esc(value)}" placeholder="${esc(placeholder)}"${error ? ' aria-invalid="true"' : ""}${disabled ? " disabled" : ""} />${error ? `<small>${esc(error)}</small>` : ""}</label>`
/** The JSX for the current playground values, listing only props that differ from the defaults. */
const buttonCode = (b: ButtonProps) => {
  const props = [b.variant !== DEFAULTS.variant && ` variant="${b.variant}"`, b.size !== DEFAULTS.size && ` size="${b.size}"`, b.disabled && " disabled"].filter(Boolean).join("")
  return `<Button${props}>${b.label}</Button>`
}

const SCENES: Record<string, (v: Values) => string> = {
  "button:playground": (v) => button(fromValues(v)),
  "button:styles": () => Object.keys(VARIANTS).map((variant) => button({ ...DEFAULTS, variant, label: title(variant) })).join(""),
  "button:sizes": () => Object.keys(SIZES).map((size) => button({ ...DEFAULTS, size, label: title(size) })).join(""),
  "button:states": () => `${button({ ...DEFAULTS, label: "Default" })}${button({ ...DEFAULTS, label: "Disabled", disabled: true })}<button type="button" data-sample class="btn" aria-busy="true" disabled><span class="spin" aria-hidden="true"></span>Saving</button>`,
  "button:with-icon": () => button({ ...DEFAULTS, label: "New task" }, ICON),
  "button:in-a-row": () => `<div class="row">${button({ ...DEFAULTS, variant: "secondary", label: "Cancel" })}${button(DEFAULTS)}</div>`,
  "icon-button:sizes": () => ["sm", "", "lg"].map((size) => `<button type="button" data-sample class="icon-btn ${size}" aria-label="Add">${ICON}</button>`).join(""),
  "text-field:empty": () => field("", "What needs doing?"),
  "text-field:filled": () => field("Draft the quarterly plan", ""),
  "text-field:with-error": () => field("", "What needs doing?", "Add a title"),
  "text-field:disabled": () => field("Locked", "", undefined, true),
  "text-field:long-value": () => field("Draft the quarterly plan, review it with the team and send it to finance before Friday", ""),
  "text-field:short-width": () => `<div class="narrow">${field("Short", "")}</div>`,
  "text-field:states": () => `${field("", "What needs doing?")}${field("Draft the quarterly plan", "")}${field("", "What needs doing?", "Add a title")}${field("Locked", "", undefined, true)}`,
}

let scenario = "button:styles"
const render = (values: Values) => {
  app.innerHTML = `<div class="lib">${SCENES[scenario](values)}</div>`
}

/**
 * A frame sandboxed without allow-same-origin runs at an opaque origin, so it cannot default to its own origin: the page
 * names the Studio's origin in `<meta name="studio-allowed-origins">` (a static host writes it into the page; the
 * acceptance suite's static build does). Without it the frame keeps the default, its own origin.
 */
const allowedOrigins = document.querySelector<HTMLMetaElement>('meta[name="studio-allowed-origins"]')?.content.split(/\s+/).filter(Boolean)
connectStudioFrame({
  mount: (inputs) => {
    if (!SCENES[inputs.scenario]) throw new Error(`${inputs.scenario} has no preview in the example library`)
    document.documentElement.dataset.theme = inputs.theme
    scenario = inputs.scenario
    render(inputs.values)
    testing.__libMounts = (testing.__libMounts ?? 0) + 1
    testing.__libValues = inputs.values
    return { appearance: inputs.theme.startsWith("dark") ? "dark" : "light", location: `/${inputs.scenario}` }
  },
  // Playground values change in place: the document is not rebuilt.
  update: (inputs) => {
    render(inputs.values)
    testing.__libValues = inputs.values
  },
  code: (inputs) => ({ language: "tsx", text: buttonCode(fromValues(inputs.values)) }),
}, allowedOrigins?.length ? { allowedOrigins } : {})

// Opened directly, outside the Studio: show the button styles.
if (window.parent === window) render({})
