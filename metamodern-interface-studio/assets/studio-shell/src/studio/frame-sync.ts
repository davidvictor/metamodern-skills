/*
 * Sync inside a preview frame: report a person's scrolling, clicks, typing and
 * navigation when the Studio asks, and replay other frames' interactions here.
 * Framework free, like the frame client that uses it.
 *
 * Loops cannot start: only trusted input is reported, replays are synthetic
 * (untrusted), and a scroll is reported only when a person's input in this
 * frame came after the last replay here. Password fields, file inputs and anything inside
 * [data-studio-private] are never reported; their values never leave the frame.
 */
import type { SyncChannelsMessage, SyncEvent, SyncTarget } from "./protocol"

const INTERACTIVE = "button, a, input, select, textarea, label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=option], [data-studio-anchor], [data-studio-sync]"
const USER_WINDOW_MS = 1000

const cssEscape = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"))

function implicitRole(el: Element) {
  const explicit = el.getAttribute("role")
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (tag === "button" || tag === "summary") return "button"
  if (tag === "a" && el.hasAttribute("href")) return "link"
  if (tag === "select") return "combobox"
  if (tag === "textarea") return "textbox"
  if (tag === "input") {
    const type = (el as HTMLInputElement).type
    return type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : type === "button" || type === "submit" || type === "reset" ? "button" : "textbox"
  }
  return tag
}

function accessibleName(el: Element) {
  const label = el.getAttribute("aria-label")
  if (label) return label.trim()
  const by = el.getAttribute("aria-labelledby")
  if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const own = el.id ? document.querySelector(`label[for="${cssEscape(el.id)}"]`) : null
    const wrap = own ?? el.closest("label")
    if (wrap) return (wrap.textContent ?? "").trim().slice(0, 80)
    return el.getAttribute("placeholder") ?? el.name ?? ""
  }
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
}

function domPath(el: Element) {
  const parts: string[] = []
  for (let node: Element | null = el; node && node !== document.body && node.parentElement; node = node.parentElement) {
    const i = [...node.parentElement.children].indexOf(node) + 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${i})`)
  }
  return `body > ${parts.join(" > ")}`
}

const roleMatches = (role: string, name: string) => [...document.querySelectorAll(INTERACTIVE + ", h1, h2, h3, [role]")].filter((e) => implicitRole(e) === role && accessibleName(e) === name)

/** Describe an element by every key another frame might find it with. */
export function describe(el: Element): SyncTarget {
  const t: SyncTarget = {}
  const anchor = el.closest("[data-studio-anchor]")
  if (anchor && anchor === el) t.anchor = anchor.getAttribute("data-studio-anchor")!
  const sync = el.getAttribute("data-studio-sync")
  if (sync) t.sync = sync
  if (el.id) t.id = el.id
  const testid = el.getAttribute("data-testid")
  if (testid) t.testid = testid
  const role = implicitRole(el)
  const name = accessibleName(el)
  if (name) {
    t.role = role
    t.name = name
    const nth = roleMatches(role, name).indexOf(el)
    if (nth > 0) t.nth = nth
  }
  t.path = domPath(el)
  return t
}

/** Find a described element, in the order the protocol fixes. Nothing is guessed beyond it. */
export function resolve(t: SyncTarget): Element | null {
  const q = (sel: string) => {
    try {
      return document.querySelector(sel)
    } catch {
      return null
    }
  }
  if (t.anchor) {
    const el = q(`[data-studio-anchor="${cssEscape(t.anchor)}"]`)
    if (el) return el
  }
  if (t.sync) {
    const el = q(`[data-studio-sync="${cssEscape(t.sync)}"]`)
    if (el) return el
  }
  if (t.id) {
    const el = document.getElementById(t.id)
    if (el) return el
  }
  if (t.testid) {
    const el = q(`[data-testid="${cssEscape(t.testid)}"]`)
    if (el) return el
  }
  if (t.role && t.name) {
    const list = roleMatches(t.role, t.name)
    if (list.length) return list[Math.min(t.nth ?? 0, list.length - 1)]
  }
  if (t.path) return q(t.path)
  return null
}

export const nameOf = (t: SyncTarget) => (t.anchor ? `anchor ${t.anchor}` : t.name ? `${t.role} “${t.name}”` : t.id ? `#${t.id}` : (t.path ?? "an element"))

function isPrivate(el: Element) {
  if (el.closest("[data-studio-private]")) return true
  if (el instanceof HTMLInputElement && (el.type === "password" || el.type === "file")) return true
  return false
}

function scrollerOf(region?: string): { el: Element | null; top: () => number; max: () => number; to: (y: number) => void; box: () => { top: number; height: number } } | null {
  if (!region) {
    const doc = document.scrollingElement ?? document.documentElement
    return { el: null, top: () => doc.scrollTop, max: () => doc.scrollHeight - innerHeight, to: (y) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), box: () => ({ top: 0, height: innerHeight }) }
  }
  const el = document.querySelector(`[data-studio-scroll="${cssEscape(region)}"]`)
  if (!el) return null
  return { el, top: () => el.scrollTop, max: () => el.scrollHeight - el.clientHeight, to: (y) => (el.scrollTop = y), box: () => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height } } }
}

/** The anchored element at the top of a scroller's view, and how far through it the top edge is. */
function anchorAtTop(region?: string) {
  const s = scrollerOf(region)
  if (!s) return undefined
  const box = s.box()
  const scope = s.el ?? document
  const anchors = [...scope.querySelectorAll("[data-studio-anchor]")].map((el) => ({ el, r: el.getBoundingClientRect() })).filter((a) => a.r.height > 0)
  const at = anchors.filter((a) => a.r.top <= box.top + 1 && a.r.bottom > box.top).pop() ?? anchors.find((a) => a.r.top > box.top)
  if (!at) return undefined
  return { target: { anchor: at.el.getAttribute("data-studio-anchor")! }, offset: (box.top - at.r.top) / at.r.height }
}

function dispatchClick(el: Element) {
  const r = el.getBoundingClientRect()
  const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }
  el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }))
  el.dispatchEvent(new MouseEvent("mousedown", init))
  if (el instanceof HTMLElement) el.focus({ preventScroll: true })
  el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }))
  el.dispatchEvent(new MouseEvent("mouseup", init))
  // click() runs default actions (links, labels, checkboxes, submit buttons) the way a person's click does.
  ;(el as HTMLElement).click()
}

function setValue(el: Element, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
    // The native setter, so frameworks that track the value (React) see the change.
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    el.textContent = value
    el.dispatchEvent(new InputEvent("input", { bubbles: true }))
    return true
  }
  return false
}

export type FrameSync = {
  setChannels: (c: SyncChannelsMessage) => void
  replay: (e: SyncEvent) => { ok: boolean; reason?: string }
  /** Product navigation the Studio did not ask for: reported when a person caused it. */
  navigated: (location: string) => void
  dispose: () => void
}

export function createFrameSync(post: (e: SyncEvent) => void, opts: { navigate?: (location: string) => void; location: () => string; arm: () => void }): FrameSync {
  let channels: SyncChannelsMessage = { scroll: false, interaction: false, navigation: false }
  let userAt = 0
  let replayAt = 0
  let lastClickAt = 0
  const now = () => performance.now()
  const byUser = () => now() - userAt < USER_WINDOW_MS && userAt > replayAt
  const onUser = (e: Event) => {
    if (e.isTrusted) userAt = now()
  }
  const userEvents = ["pointerdown", "keydown", "wheel", "touchstart", "touchmove"]
  for (const t of userEvents) window.addEventListener(t, onUser, { capture: true, passive: true })

  // One throttle per scroller, so the page and a region scrolled together are both reported.
  const scrollFrames = new Map<string, number>()
  const onScroll = (e: Event) => {
    if (!channels.scroll || !byUser()) return
    const target = e.target
    const region = target instanceof Element ? (target.getAttribute("data-studio-scroll") ?? undefined) : undefined
    if (target instanceof Element && !region) return
    const key = region ?? ""
    cancelAnimationFrame(scrollFrames.get(key) ?? 0)
    scrollFrames.set(key, requestAnimationFrame(() => {
      const s = scrollerOf(region)
      if (!s) return
      const max = s.max()
      post({ kind: "scroll", ...(region ? { region } : {}), anchor: region ? undefined : anchorAtTop(), ratio: max > 0 ? s.top() / max : 0 })
    }))
  }
  const onClick = (e: MouseEvent) => {
    if (!channels.interaction || !e.isTrusted) return
    const el = (e.target as Element | null)?.closest(INTERACTIVE) ?? (e.target as Element | null)
    // A label's click reaches its control as a click of its own, which is the one reported.
    if (!el || isPrivate(el) || el.tagName === "LABEL") return
    // A click into a text field only moves the caret; typing is synced as values.
    if ((el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset"].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
    lastClickAt = now()
    post({ kind: "click", target: describe(el) })
  }
  const sendValue = (el: Element) => {
    if (!channels.interaction || isPrivate(el)) return
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return
    const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.value : el instanceof HTMLElement && el.isContentEditable ? (el.textContent ?? "") : null
    if (value === null) return
    post({ kind: "input", target: describe(el), value })
  }
  const onInput = (e: Event) => {
    const ie = e as InputEvent
    if (!e.isTrusted || ie.isComposing) return
    if (e.target instanceof Element) sendValue(e.target)
  }
  // A composition a person started (IME) is reported once, when it ends, with its final text.
  let composing = false
  const onCompositionStart = (e: Event) => {
    if (e.isTrusted) composing = true
  }
  const onCompositionEnd = (e: Event) => {
    if (!composing) return
    composing = false
    if (e.target instanceof Element) sendValue(e.target)
  }
  const onSubmit = (e: Event) => {
    if (!channels.interaction || !e.isTrusted || now() - lastClickAt < 400) return
    if (e.target instanceof HTMLFormElement && !isPrivate(e.target)) post({ kind: "submit", target: describe(e.target) })
  }
  document.addEventListener("scroll", onScroll, { capture: true, passive: true })
  document.addEventListener("click", onClick, true)
  document.addEventListener("input", onInput, true)
  document.addEventListener("compositionstart", onCompositionStart, true)
  document.addEventListener("compositionend", onCompositionEnd, true)
  document.addEventListener("submit", onSubmit, true)

  return {
    setChannels: (c) => {
      channels = { ...c, navigation: c.navigation && !!opts.navigate }
    },
    navigated: (location) => {
      if (channels.navigation && byUser()) post({ kind: "navigate", location })
    },
    replay: (e) => {
      replayAt = now()
      if (e.kind === "scroll") {
        const s = scrollerOf(e.region)
        if (!s) return { ok: false, reason: `No scrolling region “${e.region}” here` }
        const anchored = e.anchor ? resolve(e.anchor.target) : null
        if (anchored && !e.region) {
          const r = anchored.getBoundingClientRect()
          s.to(s.top() + r.top + e.anchor!.offset * r.height)
        } else s.to(e.ratio * Math.max(0, s.max()))
        return { ok: true }
      }
      if (e.kind === "navigate") {
        if (!opts.navigate) return { ok: false, reason: "This preview cannot navigate on request" }
        if (opts.location() !== e.location) {
          userAt = now()
          opts.navigate(e.location)
        }
        return { ok: true }
      }
      const el = resolve(e.target)
      if (!el) return { ok: false, reason: `No ${nameOf(e.target)} here` }
      // A replay that changes product state marks this runtime Modified, as a person's input would.
      opts.arm()
      if (e.kind === "click") dispatchClick(el)
      else if (e.kind === "input") {
        if (isPrivate(el)) return { ok: false, reason: "That field is private here" }
        if (!setValue(el, e.value)) return { ok: false, reason: `${nameOf(e.target)} does not take text here` }
      } else if (e.kind === "submit") {
        if (el instanceof HTMLFormElement) el.requestSubmit()
        else return { ok: false, reason: `${nameOf(e.target)} is not a form here` }
      }
      return { ok: true }
    },
    dispose: () => {
      for (const t of userEvents) window.removeEventListener(t, onUser, true)
      document.removeEventListener("scroll", onScroll, true)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("input", onInput, true)
      document.removeEventListener("compositionstart", onCompositionStart, true)
      document.removeEventListener("compositionend", onCompositionEnd, true)
      document.removeEventListener("submit", onSubmit, true)
    },
  }
}
