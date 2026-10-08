import type { AnnotationClient } from "./annotations/types"
import type { JsonValue } from "./design-runtime"
import type { DesignPreviewIdentity } from "./design-ui/types"
/*
 * The product side of studio-preview/1. A product's preview entry (a route,
 * page or recreation document that renders one scenario in isolation) calls
 * connectStudioFrame once. This file has no dependency on the shell or on any
 * UI library; copy it into the product's preview entry or import it from here.
 *
 * The frame never trusts a message it did not expect: it answers only its
 * parent window, only from an allowed origin, and only for its own instance.
 */
import { PROTOCOL, fingerprint, isShellMessage, type AnchorRect, type FrameBody, type FrameCapability, type FrameDiagnostic, type MountInputs } from "./protocol"
import { appearanceFields, withoutAppearance, validAppearanceIds, validInputRecord } from "./appearance"
import { createFrameSync } from "./frame-sync"
import { createFrameGestures, keepFieldKeys } from "./frame-gestures"

export type FrameHandlers = {
  /** Optional lazy annotation client, compiled out by nonlocal preview builders. */
  annotations?: AnnotationClient
  /** Product consumes the same opaque compiled snapshot as exports; validate before mutating, reject atomically. */
  applyCompiled?: (data: JsonValue | undefined, direction: DesignPreviewIdentity | undefined) => void | Promise<void>
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
  applyCss?: (css: string, stylesheets: string[]) => void | Promise<void>
  /** Resolve when the rendering is settled: fonts, required assets, controlled async work. */
  settle?: () => Promise<void>
  /** Go to a product location, for navigation sync between frames. Without it navigation follows only through synced clicks. */
  navigate?: (location: string) => void
  /** Digest of the resolved inputs and the resulting state and navigation. Defaults to the inputs alone. */
  fingerprint?: (inputs: MountInputs) => Promise<string> | string
  /** Neutral measurements shown in Studio Details after the preview settles. */
  diagnostics?: (inputs: MountInputs) => Promise<FrameDiagnostic[]> | FrameDiagnostic[]
  /**
   * Apply changed property values to the mounted scenario without rebuilding it (capability live-values). Receives the
   * mounted inputs with the new values; product state and navigation stay. Without it every change mounts a new runtime.
   */
  update?: (inputs: MountInputs) => Promise<void> | void
  /** Explicit appearance opt-in. Validate before changing the mounted UI; reject to preserve its last valid state. */
  updateAppearance?: (inputs: MountInputs) => Promise<void> | void
  /** The code that renders the current values, listing only props that differ from their defaults (capability code). */
  code?: (inputs: MountInputs) => Promise<{ language: string; text: string }> | { language: string; text: string }
}

/**
 * sync: false keeps this preview out of scroll, click, typing and navigation sync.
 * gestures: false keeps every scroll, pinch and Space press in the page, so the Studio's stage cannot pan or zoom over it.
 */
export type FrameOptions = {
  allowedOrigins?: string[]
  /** Exact same-origin stylesheet roster owned by the product frame; remote module/style discovery is forbidden. */
  registeredStylesheets?: readonly string[]
  sync?: boolean
  gestures?: boolean
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export function readAnchors(): AnchorRect[] {
  return [...document.querySelectorAll<HTMLElement>("[data-studio-anchor]")].flatMap((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return []
    const label = el.dataset.studioAnchorLabel ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? el.dataset.studioAnchor!
    return [
      {
        id: el.dataset.studioAnchor!,
        label,
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      },
    ]
  })
}

/** Draft fonts load only from Google Fonts' stylesheet API; its CSS then loads files from fonts.gstatic.com. */
const FONT_STYLESHEET = "https://fonts.googleapis.com/css2?"
export function allowedFrameStylesheet(value: string, page: string, registered: readonly string[] = []): string | null {
  if (value.startsWith(FONT_STYLESHEET)) return value
  try {
    const url = new URL(value, page)
    if (url.origin !== new URL(page).origin || !/^(https?|file):$/.test(url.protocol)) return null
    return registered.some(entry => new URL(entry, page).href === url.href) ? url.href : null
  } catch { return null }
}
/** Load registered assets before any opt-in compiled state is changed. Legacy stylesheet filtering stays intact. */
async function ensureStylesheets(stylesheets: string[], registered: readonly string[]) {
  const staged: HTMLLinkElement[] = []
  try { await Promise.all(stylesheets.map(async value => {
    const url = allowedFrameStylesheet(value, location.href, registered)
    if (!url) throw new Error(`Stylesheet is not registered for this frame: ${value}`)
    let link = [...document.querySelectorAll<HTMLLinkElement>("link[data-studio-draft]")].find(l => l.href === url)
    if (!link?.dataset.studioLoaded) {
      const response = await fetch(url, { headers: { accept: "text/css" }, cache: "no-store" })
      const content = await response.text()
      if (!response.ok || !/^text\/css(?:;|$)/i.test(response.headers.get("content-type") ?? "") || /^\s*(?:<!doctype|<html)/i.test(content)) throw new Error(`Registered stylesheet is missing or is not CSS: ${value}`)
    }
    if (link?.dataset.studioLoaded === "true") return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.href = url; link.dataset.studioDraft = ""; link.media = "not all"; staged.push(link) }
      const loaded = link
      const timer = setTimeout(() => failed(), 15000)
      const cleanup = () => { clearTimeout(timer); loaded.removeEventListener("load", success); loaded.removeEventListener("error", failed) }
      const success = () => { cleanup(); loaded.dataset.studioLoaded = "true"; resolve() }
      const failed = () => { cleanup(); loaded.remove(); reject(new Error(`Registered stylesheet failed to load: ${value}`)) }
      loaded.addEventListener("load", success, { once: true }); loaded.addEventListener("error", failed, { once: true })
      if (!loaded.isConnected) document.head.append(loaded)
    })
  })) } catch (error) { for (const link of staged) link.remove(); throw error }
}
function defaultApplyCss(css: string, stylesheets: string[], registered: readonly string[] = []) {
  let style = document.getElementById("studio-draft-css") as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = "studio-draft-css"
    document.head.append(style)
  }
  style.textContent = css
  const wanted = stylesheets.flatMap(url => { const allowed = allowedFrameStylesheet(url, location.href, registered); return allowed ? [allowed] : [] })
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-studio-draft]")) if (!wanted.includes(link.href)) link.remove()
  for (const url of wanted) {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-studio-draft][href="${CSS.escape(url)}"]`)
    if (existing) { existing.media = "all"; continue }
    document.head.append(
      Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href: url,
        crossOrigin: "anonymous",
      })
    )
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

/** Diagnostics are optional measurements: a handler that throws or rejects reports none and never blocks ready. */
export async function readDiagnostics(handlers: Pick<FrameHandlers, "diagnostics">, inputs: MountInputs) {
  try {
    return handlers.diagnostics ? await handlers.diagnostics(inputs) : undefined
  } catch {
    return undefined
  }
}

export function connectStudioFrame(handlers: FrameHandlers, options: FrameOptions = {}) {
  const allowed = options.allowedOrigins ?? [location.origin]
  const instance = window.name
  if (window.parent === window || !instance)
    return {
      notifyNavigated: () => undefined,
      markModified: () => undefined,
      disconnect: () => undefined,
    }

  const parentOrigin = document.referrer ? new URL(document.referrer).origin : allowed[0]
  const post = (message: FrameBody) => window.parent.postMessage({ protocol: PROTOCOL, instance, ...message }, allowed.includes(parentOrigin) ? parentOrigin : allowed[0])
  const applyTokens = handlers.applyTokens ?? defaultApplyTokens
  const applyCss = handlers.applyCss ?? ((css: string, stylesheets: string[]) => defaultApplyCss(css, stylesheets, options.registeredStylesheets))
  const settle =
    handlers.settle ??
    (async () => {
      await document.fonts?.ready
      await nextFrame()
    })
  const state = () => ({
    location: handlers.location?.() ?? location.pathname,
    canGoBack: handlers.canGoBack?.() ?? false,
    anchors: readAnchors(),
  })

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
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  // Capture phase, so product handlers that stop propagation still arm the window.
  window.addEventListener("pointerdown", onUser, true)
  window.addEventListener("keydown", onUser, true)

  // The inputs this runtime was mounted with, and any property values applied since.
  let draftWork: Promise<void> = Promise.resolve()
  let current: MountInputs | null = null
  // Values updates run one at a time, in arrival order, and only the newest is applied: an update that a newer
  // values message superseded is skipped, or its result ignored, so a slow handler never leaves stale props.
  const valuesSeq = { values: 0, appearance: 0 }
  let updating: Promise<unknown> = Promise.resolve()
  const onMessage = async (e: MessageEvent) => {
    if (e.source !== window.parent || !allowed.includes(e.origin) || !isShellMessage(e.data) || e.data.instance !== instance) return
    const m = e.data
    try {
      if (m.type === "annotations") {
        handlers.annotations?.receive(m.command, event => post({ type: "annotations", event }))
      } else if (m.type === "mount") {
        current = m.inputs
        if (m.inputs.direction && !handlers.applyCss) await ensureStylesheets(m.inputs.stylesheets ?? [], options.registeredStylesheets ?? [])
        await handlers.applyCompiled?.(m.inputs.compiledData, m.inputs.direction)
        applyTokens(m.inputs.tokens)
        await applyCss(m.inputs.css ?? "", m.inputs.stylesheets ?? [])
        const { appearance } = await handlers.mount(m.inputs)
        for (const id of m.inputs.commands) {
          if (!handlers.command) throw new Error(`This preview has no commands; cannot run "${id}"`)
          await handlers.command(id)
        }
        await settle()
        post({
          type: "ready",
          requestId: m.requestId,
          direction: m.inputs.direction,
          fingerprint: handlers.fingerprint ? await handlers.fingerprint(m.inputs) : fingerprint(m.inputs),
          diagnostics: await readDiagnostics(handlers, m.inputs),
          appearance,
          ...state(),
        })
        mountedOnce = true
        lastHeight = 0
        reportSize()
      } else if (m.type === "command") {
        if (!handlers.command) throw new Error("This preview has no commands")
        await handlers.command(m.command)
        await nextFrame()
        post({ type: "reply", requestId: m.requestId, ok: true })
        post({ type: "navigated", ...state() })
      } else if (m.type === "product-back") {
        const ok = handlers.back?.() ?? false
        await nextFrame()
        post({
          type: "reply",
          requestId: m.requestId,
          ok,
          reason: ok ? undefined : "No product history in this preview",
        })
        post({ type: "navigated", ...state() })
      } else if (m.type === "sync") {
        if (options.sync !== false) sync.setChannels(m.channels)
        post({
          type: "reply",
          requestId: m.requestId,
          ok: options.sync !== false,
          reason: options.sync === false ? "This preview is kept out of sync" : undefined,
        })
      } else if (m.type === "replay") {
        const result = options.sync === false ? { ok: false, reason: "This preview is kept out of sync" } : sync.replay(m.event)
        await nextFrame()
        post({ type: "reply", requestId: m.requestId, ...result })
      } else if (m.type === "values") {
        if (m.channel !== undefined && m.channel !== "appearance" || !validInputRecord(m.values) || m.design !== undefined && !validInputRecord(m.design, true) || m.appearanceIds !== undefined && !validAppearanceIds(m.appearanceIds) || m.channel === "appearance" && !m.appearanceIds?.length) throw new Error("Invalid live input payload")
        const update = m.channel === "appearance" ? handlers.updateAppearance : handlers.update
        if (!update || !current) throw new Error("This preview cannot change values in place")
        const channel = m.channel === "appearance" ? "appearance" : "values"
        const seq = ++valuesSeq[channel]
        const run = updating.then(async () => {
          if (seq !== valuesSeq[channel] || !current) return false
          const ids = m.appearanceIds ?? []
          const next = { ...current,
            values: channel === "appearance" ? { ...current.values, ...appearanceFields(m.values, ids) } : { ...m.values, ...appearanceFields(current.values, ids) },
            design: channel === "appearance" ? { ...withoutAppearance(current.design ?? {}, ids), ...appearanceFields(m.design ?? {}, ids) } : current.design,
          }
          // A Studio change, not a person's: it must not mark the runtime modified.
          armedAt = 0
          try {
            await update(next)
            // Draft work can finish while a handler awaits. Commit only this channel's owned fields.
            current = { ...current, values: next.values, ...(channel === "appearance" ? { design: next.design } : {}) }
          } catch (err) {
            // A superseded update's failure does not matter: the newest values are applied next.
            if (seq === valuesSeq[channel]) throw err
          }
          await settle()
          return seq === valuesSeq[channel]
        })
        updating = run.catch(() => undefined)
        // The reply only settles this request; a superseded one reports nothing about the runtime.
        const newest = await run
        post({ type: "reply", requestId: m.requestId, ok: true, ...(newest && m.channel === "appearance" && current ? { fingerprint: await (handlers.fingerprint?.(current) ?? fingerprint(current)) } : {}) })
        if (newest) post({ type: "navigated", ...state() })
      } else if (m.type === "code-request") {
        // After any values update in flight, so the code describes the newest values.
        await updating
        if (!handlers.code || !current) throw new Error("This preview has no code to show")
        const { language, text } = await handlers.code(current)
        post({ type: "code", requestId: m.requestId, language: String(language), text: String(text) })
      } else if (m.type === "draft-overrides") {
        const apply = async () => {
          const previous = current
          try {
            if (m.direction && !handlers.applyCss) await ensureStylesheets(m.stylesheets ?? [], options.registeredStylesheets ?? [])
            await handlers.applyCompiled?.(m.compiledData, m.direction)
            await applyCss(m.css ?? "", m.stylesheets ?? [])
            applyTokens(m.tokens)
            current = current ? { ...current, tokens: m.tokens, css: m.css, stylesheets: m.stylesheets, direction: m.direction, compiledData: m.compiledData } : null
            await settle()
            post({ type: "reply", requestId: m.requestId, ok: true })
            if (m.direction && current) post({ type: "direction-state", requestId: m.requestId, direction: m.direction, fingerprint: handlers.fingerprint ? await handlers.fingerprint(current) : fingerprint(current) })
          } catch (error) {
            let restored = true
            if (previous) {
              try { await handlers.applyCompiled?.(previous.compiledData, previous.direction) } catch { restored = false }
              try { await applyCss(previous.css ?? "", previous.stylesheets ?? []) } catch { restored = false }
              try { applyTokens(previous.tokens) } catch { restored = false }
              current = restored && current ? { ...current, tokens: previous.tokens, css: previous.css, stylesheets: previous.stylesheets, direction: previous.direction, compiledData: previous.compiledData } : null
            }
            if (!restored) throw Object.assign(new Error("Frame could not restore its previous compiled snapshot; Retry rematerializes it"), { frameUnavailable: true })
            throw error
          }

        }
        const work = draftWork.then(apply)
        draftWork = work.catch(() => undefined)
        await work

      }
    } catch (err) {
      post({
        type: "error",
        requestId: m.requestId,
        operation: m.type,
        recoverable: !(err && typeof err === "object" && "frameUnavailable" in err),
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  window.addEventListener("message", onMessage)
  // Content height, for full-page frames: after ready and whenever it settles at a new value.
  let lastHeight = 0
  let sizeFrame = 0
  let mountedOnce = false
  const reportSize = () => {
    if (!mountedOnce) return
    cancelAnimationFrame(sizeFrame)
    sizeFrame = requestAnimationFrame(() => {
      const height = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
      if (Math.abs(height - lastHeight) < 1) return
      lastHeight = height
      post({ type: "content-size", height })
    })
  }
  const sizes = new ResizeObserver(reportSize)
  sizes.observe(document.documentElement)
  if (document.body) sizes.observe(document.body)
  const sizeChanges = new MutationObserver(reportSize)
  sizeChanges.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
  })

  // Sync: report a person's interactions when the Studio asks, and replay other frames' here.
  const sync = createFrameSync((event) => post({ type: "interaction", event }), {
    navigate: handlers.navigate,
    location: () => state().location,
    arm: () => (armedAt = performance.now()),
  })
  const syncCaps: FrameCapability[] = options.sync === false ? [] : ["sync-scroll", "sync-interaction", ...(handlers.navigate ? (["sync-navigation"] as const) : [])]

  // Stage navigation that starts over this frame: the part of a scroll the page cannot use, zoom, Space and middle drag.
  const gestures = options.gestures === false ? null : createFrameGestures((gesture) => post({ type: "gesture", gesture }))
  // Home, End and the page keys typed in a field never scroll the Studio around the frame.
  const releaseFieldKeys = keepFieldKeys()

  post({
    type: "hello",
    capabilities: [...(handlers.annotations ? ["annotations" as const] : []), ...(handlers.applyCompiled ? ["compiled-data" as const] : []), ...(options.registeredStylesheets?.length ? ["registered-stylesheets" as const] : []), "direction-identity", "draft-css", "content-size", ...syncCaps, ...(gestures ? (["stage-gestures"] as const) : []), ...(handlers.update ? (["live-values"] as const) : []), ...(handlers.updateAppearance ? (["live-appearance"] as const) : []), ...(handlers.code ? (["code"] as const) : [])],
  })

  return {
    /** Call after product navigation the Studio did not ask for, so it can update location and anchors. */
    notifyNavigated: () => {
      if (armed()) markModified()
      const now = state()
      post({ type: "navigated", ...now })
      sync.navigated(now.location)
    },
    /** For state changes the DOM does not show, such as canvas or media. */
    markModified,
    disconnect: () => {
      handlers.annotations?.dispose()
      sync.dispose()
      gestures?.dispose()
      releaseFieldKeys()
      observer.disconnect()
      sizes.disconnect()
      sizeChanges.disconnect()
      window.removeEventListener("message", onMessage)
      window.removeEventListener("pointerdown", onUser, true)
      window.removeEventListener("keydown", onUser, true)
    },
  }
}
