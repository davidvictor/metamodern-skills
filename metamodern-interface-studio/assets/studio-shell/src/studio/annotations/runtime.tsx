import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { Agentation, saveAnnotations, type Annotation } from "agentation"
import type { AnnotationRuntimeOptions, RawAnnotation } from "./types"

const ATTRIBUTES = ["data-studio-anchor", "data-studio-component", "data-slot", "data-kit-component", "data-kit-example", "data-test", "data-testid", "data-preview-block"] as const
function ownerAttributes(element: Element | null) {
  const attributes: Record<string, string> = {}
  for (let current = element; current; current = current.parentElement) {
    for (const name of ATTRIBUTES) if (!(name in attributes) && current.hasAttribute(name)) attributes[name] = current.getAttribute(name)!
  }
  return attributes
}
/** This module is loaded only for the selected local document. Never import it from product components. */
export function mountAnnotations(options: AnnotationRuntimeOptions) {
  const container = document.createElement("div")
  container.dataset.studioAnnotationRuntime = options.session.generation
  document.body.append(container)
  const root = createRoot(container)
  const accepted = new Map(options.notes.map(note => [note.id, note]))
  const privateSelector = 'input[type="password"], [data-private], [data-studio-private]'
  let dragStart: { x: number; y: number } | null = null
  let live = true
  let selected: Element | null = null
  // The integration's review/export owns copy and delivery. Vendor settings are deliberately unavailable.
  try { localStorage.setItem("feedback-toolbar-settings", JSON.stringify({ autoClearAfterCopy: false, webhookUrl: "", webhooksEnabled: false, blockInteractions: true, reactEnabled: true, outputDetail: "standard" })) } catch { /* Isolated frames may provide only in-memory storage. */ }
  // Vendor markers expire after seven days; host records do not. Refresh only the seeded marker copy.
  const originals = new Map(options.notes.map(note => [note.id, note]))
  saveAnnotations(location.pathname, options.notes.map(note => ({ ...note, timestamp: Date.now() })) as Annotation[])
  const resetRejected = (reason: string) => {
    options.onMutation({ action: "error", reason })
    queueMicrotask(() => {
      if (!live) return
      flushSync(() => root.render(null))
      saveAnnotations(location.pathname, [...accepted.values()].map(note => ({ ...note, timestamp: Date.now() })) as Annotation[])
      render()
    })
  }
  const guardPrivate = (event: MouseEvent) => {
    const toolbar = document.querySelector("agentation-toolbar")?.shadowRoot
    if (!toolbar?.querySelector('button[aria-label="Exit"]')) return
    if (event.composedPath().some(node => node instanceof Element && (node.tagName === "AGENTATION-TOOLBAR" || node.hasAttribute("data-agentation-portal")))) return
    const element = event.composedPath().find(node => node instanceof Element) as Element | undefined
    const hasPrivate = !!document.querySelector(privateSelector)
    const privateTarget = !!element?.closest(privateSelector) || !!element?.querySelector(privateSelector) || [...(element?.parentElement?.children ?? [])].some(sibling => sibling !== element && (sibling.matches(privateSelector) || !!sibling.querySelector(privateSelector)))
    if (event.type === "mousedown") dragStart = { x: event.clientX, y: event.clientY }
    const area = hasPrivate && dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4
    const multi = hasPrivate && (event.metaKey || event.ctrlKey)
    if (event.type === "mouseup") dragStart = null
    if (!privateTarget && !area && !multi) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type !== "mousemove") resetRejected("Private content cannot be selected. Area and multi-selection are unavailable in a document containing private content.")
  }
  const guardedEvents = ["pointerdown", "mousedown", "mousemove", "mouseup", "click"] as const
  for (const name of guardedEvents) window.addEventListener(name, guardPrivate, true)
  const target = (event: Event) => {
    const path = event.composedPath()
    if (path.some(node => node instanceof Element && (node.tagName === "AGENTATION-TOOLBAR" || node.hasAttribute("data-agentation-portal")))) return
    selected = path.find(node => node instanceof Element) as Element | undefined ?? null
  }
  const restrictSettings = (event: Event) => {
    if (event.composedPath().some(node => node instanceof Element && node.getAttribute("aria-label") === "Settings" && event.composedPath().some(item => item instanceof Element && item.tagName === "AGENTATION-TOOLBAR"))) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  document.addEventListener("pointerdown", target, true)
  document.addEventListener("click", restrictSettings, true)
  const capturedOwners = new Map(options.notes.map(note => [note.id, note.attributes ?? {}]))
  const emit = (annotation: Annotation) => {
    if (options.session.context.layer === "studio" && annotation.frame) { resetRejected("Choose the preview target to annotate product content."); return }
    const regions = [annotation.boundingBox, ...(annotation.elementBoundingBoxes ?? [])].filter((box): box is NonNullable<typeof box> => !!box)
    const containsPrivate = !!selected?.closest(privateSelector) || !!selected?.querySelector(privateSelector) || (annotation.isMultiSelect && [...document.querySelectorAll(privateSelector)].some(element => {
      const rect = element.getBoundingClientRect()
      return regions.some(box => box.x < rect.right && box.x + box.width > rect.left && box.y < rect.bottom && box.y + box.height > rect.top)
    }))
    if (containsPrivate) { resetRejected("Private fields cannot be annotated."); return }
    const attributes = capturedOwners.get(annotation.id) ?? { ...annotation.attributes, ...ownerAttributes(selected), ...options.resolveOwner?.(selected) }
    capturedOwners.set(annotation.id, attributes)
    const safeAnnotation = document.querySelector(privateSelector) ? { ...annotation, nearbyText: undefined, nearbyElements: undefined } : annotation
    const raw: RawAnnotation = { ...safeAnnotation, timestamp: originals.get(annotation.id)?.timestamp ?? annotation.timestamp, attributes }
    accepted.set(raw.id, raw)
    options.onMutation({ action: "upsert", annotation: raw })
  }
  const portalKeys = new WeakMap<HTMLElement, string>()
  let portal: HTMLElement | null = null
  const placeToolbar = () => {
    if (!live || options.session.context.layer !== "studio") return
    const host = document.querySelector<HTMLElement>("agentation-toolbar.studio-host-annotation-toolbar")
    const top = portal?.getBoundingClientRect().top
    // Bottom sheets leave a clear strip above them; keep the host toolbar out of their filter controls.
    if (host && top !== undefined && top >= 84 && top < innerHeight) host.style.setProperty("--studio-annotation-sdk-bottom", `${innerHeight - top + 12}px`)
    else host?.style.removeProperty("--studio-annotation-sdk-bottom")
  }
  const portalResize = options.session.context.layer === "studio" ? new ResizeObserver(placeToolbar) : null
  let clearPortalTransitions = () => {}
  const render = () => {
    if (!live) return
    const overlays = [...document.querySelectorAll<HTMLElement>('[role="dialog"]:not([data-closed]):not([aria-hidden="true"]), [data-studio-annotation-portal]')].filter(el => !el.closest("[data-studio-feedback-review]"))
    portal = overlays.at(-1) ?? null
    portalResize?.disconnect()
    clearPortalTransitions()
    if (portal && options.session.context.layer === "studio") {
      portalResize?.observe(portal)
      const current = portal
      // A transform can start after mount and does not resize the sheet. Remeasure its final position, not an initial animation snapshot.
      const finished = (event: Event) => { if (live && portal === current && event.target === current) placeToolbar() }
      const events = ["transitionend", "transitioncancel", "animationend", "animationcancel"]
      events.forEach(name => current.addEventListener(name, finished))
      clearPortalTransitions = () => events.forEach(name => current.removeEventListener(name, finished))
    }
    // Recreate the host-owned vendor wrapper inside a new focus boundary; moving an inert outside wrapper retains Base UI's marks.
    let portalKey = "body"
    if (portal && options.session.context.layer === "studio") {
      portalKey = portalKeys.get(portal) ?? crypto.randomUUID()
      portalKeys.set(portal, portalKey)
    }
    root.render(<Agentation key={portalKey} className={options.session.context.layer === "studio" ? "studio-host-annotation-toolbar" : undefined} enableKeyboardShortcuts={false} copyToClipboard={false} portalContainer={portal} identifyingAttributes={ATTRIBUTES} onAnnotationAdd={emit} onAnnotationUpdate={emit} onAnnotationDelete={annotation => { accepted.delete(annotation.id); options.onMutation({ action: "delete", id: annotation.id }) }} onAnnotationsClear={() => { accepted.clear(); options.onMutation({ action: "clear" }) }} onCopy={() => options.onMutation({ action: "review" })} onSubmit={() => options.onMutation({ action: "review" })} />)
  }
  const framePointers = new Map<HTMLIFrameElement, string>()
  const isolateFrames = () => {
    if (options.session.context.layer !== "studio") return
    const active = !!document.querySelector("agentation-toolbar")?.shadowRoot?.querySelector('button[aria-label="Exit"]')
    for (const frame of document.querySelectorAll("iframe")) {
      if (active) { if (!framePointers.has(frame)) framePointers.set(frame, frame.style.pointerEvents); frame.style.pointerEvents = "none" }
      else if (framePointers.has(frame)) { frame.style.pointerEvents = framePointers.get(frame)!; framePointers.delete(frame) }
    }
  }
  const observedShadows = new WeakSet<ShadowRoot>()
  const observer = new MutationObserver(() => {
    for (const toolbar of document.querySelectorAll("agentation-toolbar")) {
      const shadow = toolbar.shadowRoot
      if (shadow && !observedShadows.has(shadow)) { observedShadows.add(shadow); observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] }) }
      if (shadow && !shadow.querySelector("[data-studio-restrictions]")) {
        const style = document.createElement("style")
        style.dataset.studioRestrictions = ""
        style.textContent = 'button[aria-label="Settings"], [data-agentation-settings-panel] { display: none !important; } :host(.studio-host-annotation-toolbar) [data-agentation-toolbar]:not([style]) { bottom: var(--studio-annotation-sdk-bottom, 24px) !important; right: var(--studio-annotation-sdk-right, 20px) !important; }'
        shadow.append(style)
      }
    }
    const overlays = [...document.querySelectorAll<HTMLElement>('[role="dialog"]:not([data-closed]):not([aria-hidden="true"]), [data-studio-annotation-portal]')].filter(el => !el.closest("[data-studio-feedback-review]"))
    if ((overlays.at(-1) ?? null) !== portal) render()
    placeToolbar()
    isolateFrames()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-closed", "aria-hidden", "role"] })
  render()
  return () => {
    live = false
    observer.disconnect()
    portalResize?.disconnect()
    clearPortalTransitions()
    for (const name of guardedEvents) window.removeEventListener(name, guardPrivate, true)
    for (const [frame, pointerEvents] of framePointers) frame.style.pointerEvents = pointerEvents
    document.removeEventListener("pointerdown", target, true)
    document.removeEventListener("click", restrictSettings, true)
    // Parent React commits cannot synchronously unmount a second root. The client awaits this cleanup before ack/activation.
    return new Promise<void>(resolve => queueMicrotask(() => { root.unmount(); container.remove(); resolve() }))
  }
}
