/*
 * The product side of studio-preview/1. A product's preview entry (a route,
 * page or recreation document that renders one scenario in isolation) calls
 * connectStudioFrame once. This file has no dependency on the shell or on any
 * UI library; copy it into the product's preview entry or import it from here.
 *
 * The frame never trusts a message it did not expect: it answers only its
 * parent window, only from an allowed origin, and only for its own instance.
 */
import { PROTOCOL, fingerprint, isShellMessage, type AnchorRect, type FrameBody, type MountInputs } from "./protocol"

export type FrameHandlers = {
  /** Materialize the scenario from scratch: state, navigation, theme, profile and inputs. */
  mount: (inputs: MountInputs) => Promise<{ appearance: "light" | "dark"; location: string }> | { appearance: "light" | "dark"; location: string }
  /** Run one product command through the application's own path. Throw for an unsupported command. */
  command?: (id: string) => Promise<void> | void
  /** Product back inside the preview's own history. Return false when there is nowhere to go. */
  back?: () => boolean
  canGoBack?: () => boolean
  location?: () => string
  /** Apply draft token overrides. Defaults to custom properties on the root element. */
  applyTokens?: (tokens: Record<string, string>) => void
  /** Apply draft CSS rules and font stylesheets. Defaults to one style element and allowlisted links in the head. */
  applyCss?: (css: string, stylesheets: string[]) => void
  /** Resolve when the rendering is settled: fonts, required assets, controlled async work. */
  settle?: () => Promise<void>
  /** Digest of the resolved inputs and the resulting state and navigation. Defaults to the inputs alone. */
  fingerprint?: (inputs: MountInputs) => Promise<string> | string
}

export type FrameOptions = { allowedOrigins?: string[] }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export function readAnchors(): AnchorRect[] {
  return [...document.querySelectorAll<HTMLElement>("[data-studio-anchor]")].flatMap((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return []
    const label = el.dataset.studioAnchorLabel ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? el.dataset.studioAnchor!
    return [{ id: el.dataset.studioAnchor!, label, x: r.left, y: r.top, w: r.width, h: r.height }]
  })
}

/** Draft fonts load only from Google Fonts' stylesheet API; its CSS then loads files from fonts.gstatic.com. */
const FONT_STYLESHEET = "https://fonts.googleapis.com/css2?"
function defaultApplyCss(css: string, stylesheets: string[]) {
  let style = document.getElementById("studio-draft-css") as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = "studio-draft-css"
    document.head.append(style)
  }
  style.textContent = css
  const wanted = stylesheets.filter((url) => url.startsWith(FONT_STYLESHEET))
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-studio-draft]")) if (!wanted.includes(link.href)) link.remove()
  for (const url of wanted) {
    if (document.querySelector(`link[data-studio-draft][href="${CSS.escape(url)}"]`)) continue
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: url, crossOrigin: "anonymous" }))
    document.head.lastElementChild!.setAttribute("data-studio-draft", "")
  }
}

let applied: string[] = []
function defaultApplyTokens(tokens: Record<string, string>) {
  const root = document.documentElement.style
  for (const name of applied) if (!(name in tokens)) root.removeProperty(name)
  for (const [name, value] of Object.entries(tokens)) root.setProperty(name, value)
  applied = Object.keys(tokens)
}

export function connectStudioFrame(handlers: FrameHandlers, options: FrameOptions = {}) {
  const allowed = options.allowedOrigins ?? [location.origin]
  const instance = window.name
  if (window.parent === window || !instance) return { notifyNavigated: () => undefined, markModified: () => undefined, disconnect: () => undefined }

  const parentOrigin = document.referrer ? new URL(document.referrer).origin : allowed[0]
  const post = (message: FrameBody) => window.parent.postMessage({ protocol: PROTOCOL, instance, ...message }, allowed.includes(parentOrigin) ? parentOrigin : allowed[0])
  const applyTokens = handlers.applyTokens ?? defaultApplyTokens
  const applyCss = handlers.applyCss ?? defaultApplyCss
  const settle = handlers.settle ?? (async () => { await document.fonts?.ready; await nextFrame() })
  const state = () => ({ location: handlers.location?.() ?? location.pathname, canGoBack: handlers.canGoBack?.() ?? false, anchors: readAnchors() })

  // Modified means a person changed product state, not that they clicked. A trusted
  // pointer or key event arms a short window; only a DOM change or product
  // navigation inside it marks the runtime modified, once. Studio-issued mounts
  // and commands never arm it.
  let modified = false
  let armedAt = 0
  const markModified = () => {
    if (modified) return
    modified = true
    post({ type: "modified" })
  }
  const onUser = (e: Event) => {
    if (e.isTrusted && !modified) armedAt = performance.now()
  }
  const armed = () => armedAt > 0 && performance.now() - armedAt < 1500
  const observer = new MutationObserver(() => {
    if (armed()) markModified()
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
  // Capture phase, so product handlers that stop propagation still arm the window.
  window.addEventListener("pointerdown", onUser, true)
  window.addEventListener("keydown", onUser, true)

  const onMessage = async (e: MessageEvent) => {
    if (e.source !== window.parent || !allowed.includes(e.origin) || !isShellMessage(e.data) || e.data.instance !== instance) return
    const m = e.data
    try {
      if (m.type === "mount") {
        applyTokens(m.inputs.tokens)
        applyCss(m.inputs.css ?? "", m.inputs.stylesheets ?? [])
        const { appearance } = await handlers.mount(m.inputs)
        for (const id of m.inputs.commands) {
          if (!handlers.command) throw new Error(`This preview has no commands; cannot run "${id}"`)
          await handlers.command(id)
        }
        await settle()
        post({ type: "ready", requestId: m.requestId, fingerprint: handlers.fingerprint ? await handlers.fingerprint(m.inputs) : fingerprint(m.inputs), appearance, ...state() })
      } else if (m.type === "command") {
        if (!handlers.command) throw new Error("This preview has no commands")
        await handlers.command(m.command)
        await nextFrame()
        post({ type: "reply", requestId: m.requestId, ok: true })
        post({ type: "navigated", ...state() })
      } else if (m.type === "product-back") {
        const ok = handlers.back?.() ?? false
        await nextFrame()
        post({ type: "reply", requestId: m.requestId, ok, reason: ok ? undefined : "No product history in this preview" })
        post({ type: "navigated", ...state() })
      } else if (m.type === "draft-overrides") {
        applyTokens(m.tokens)
        applyCss(m.css ?? "", m.stylesheets ?? [])
        await nextFrame()
        post({ type: "reply", requestId: m.requestId, ok: true })
      }
    } catch (err) {
      post({ type: "error", requestId: m.requestId, operation: m.type, recoverable: true, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  window.addEventListener("message", onMessage)
  post({ type: "hello", capabilities: ["draft-css"] })

  return {
    /** Call after product navigation the Studio did not ask for, so it can update location and anchors. */
    notifyNavigated: () => {
      if (armed()) markModified()
      post({ type: "navigated", ...state() })
    },
    /** For state changes the DOM does not show, such as canvas or media. */
    markModified,
    disconnect: () => {
      observer.disconnect()
      window.removeEventListener("message", onMessage)
      window.removeEventListener("pointerdown", onUser, true)
      window.removeEventListener("keydown", onUser, true)
    },
  }
}
