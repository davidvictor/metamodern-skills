/*
 * Stage navigation that starts inside a preview frame. The browser gives a
 * scroll, pinch or drag over a frame to the frame's page, so without this the
 * Studio's stage could never pan or zoom where a frame covers it. The frame
 * keeps what its page uses and hands the Studio the rest:
 *
 * - ⌘ or Ctrl with the wheel (a trackpad pinch arrives as Ctrl and the wheel):
 *   the stage zooms, and the browser never zooms the whole tab.
 * - A scroll the page cannot use, because the page and every scroller under the
 *   pointer are at their end in that direction: the stage pans by that part.
 * - Space held while focus is in the page but not in a field or control: the
 *   Studio covers its frames so a drag pans.
 * - A middle-button drag: the stage pans.
 *
 * No dependency on the shell or any UI library, like frame-client.ts.
 */
import type { StageGesture } from "./protocol"

/** Where Space belongs to the product: typing, pressing a control, choosing an option. */
const OWNS_SPACE =
  "input, textarea, select, button, a[href], summary, [contenteditable=''], [contenteditable='true'], [role=button], [role=textbox], [role=searchbox], [role=slider], [role=spinbutton], [role=switch], [role=checkbox], [role=radio], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option], [role=combobox], [role=link]"

const hidden = (o: string) => o === "hidden" || o === "clip"

function canTake(start: Element | null, axis: "x" | "y", delta: number) {
  if (!delta) return true
  const room = (el: Element) => {
    const pos = axis === "y" ? el.scrollTop : Math.abs(el.scrollLeft)
    const max = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    return max > 1 && (delta < 0 ? pos > 0.5 : pos < max - 0.5)
  }
  for (let el = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll|overlay)/.test(axis === "y" ? cs.overflowY : cs.overflowX) && room(el)) return true
  }
  const root = document.scrollingElement ?? document.documentElement
  const html = getComputedStyle(document.documentElement)
  const body = document.body ? getComputedStyle(document.body) : html
  const locked = axis === "y" ? hidden(html.overflowY) || hidden(body.overflowY) : hidden(html.overflowX) || hidden(body.overflowX)
  return !locked && room(root)
}

/** Where typing happens: keys pressed here edit the field, so none of them should move anything outside the frame. */
const EDITABLE =
  "input:not([type=button], [type=submit], [type=reset], [type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=image]), textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only'], [role=textbox], [role=searchbox], [role=spinbutton], [role=combobox]"
/** Keys macOS turns into a page scroll even inside a text field (elsewhere they move the caret, so they are left alone). */
const SCROLL_KEYS: Record<string, number> = { Home: -1, PageUp: -1, End: 1, PageDown: 1 }
const apple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/**
 * Keeps keys typed into a field inside the frame. Where Home, End, Page Up or Page Down would scroll and nothing in the
 * frame can take that scroll, the browser hands it to the Studio's page around the frame (a library page, say), which
 * then scrolls this preview away and unmounts it, losing what was typed and the focus. The scroll is cancelled
 * instead; when the frame's page or a scroller in it can take it, the browser scrolls that as usual. Only on Apple
 * platforms, where these keys scroll rather than move the caret; always on, also with gestures off.
 */
export function keepFieldKeys() {
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = SCROLL_KEYS[e.key]
    if (!dir || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !apple()) return
    const t = e.target instanceof Element ? e.target : null
    if (!t?.closest(EDITABLE) || canTake(t, "y", dir)) return
    e.preventDefault()
  }
  window.addEventListener("keydown", onKeyDown)
  return () => window.removeEventListener("keydown", onKeyDown)
}

export function createFrameGestures(send: (g: StageGesture) => void) {
  const onWheel = (e: WheelEvent) => {
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1
    const dx = e.deltaX * k
    const dy = e.deltaY * k
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      send({ kind: "wheel", zoom: true, dx, dy, x: e.clientX, y: e.clientY })
      return
    }
    const target = e.target instanceof Element ? e.target : null
    let px = canTake(target, "x", dx) ? 0 : dx
    let py = canTake(target, "y", dy) ? 0 : dy
    // While the page takes the main direction, a trackpad's sideways drift stays with it.
    if (!py && Math.abs(dx) < Math.abs(dy)) px = 0
    if (!px && Math.abs(dy) < Math.abs(dx)) py = 0
    if (px || py) send({ kind: "wheel", zoom: false, dx: px, dy: py, x: e.clientX, y: e.clientY })
  }

  let space = false
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target instanceof Element ? e.target : null
    if (t?.closest(OWNS_SPACE)) return
    e.preventDefault()
    if (space) return
    space = true
    send({ kind: "space", down: true })
  }
  const release = () => {
    if (!space) return
    space = false
    send({ kind: "space", down: false })
  }
  const onKeyUp = (e: KeyboardEvent) => e.code === "Space" && release()

  // Middle-button drag, in screen pixels so the Studio needs no scale to apply it.
  let last: { x: number; y: number; id: number } | null = null
  const onDown = (e: PointerEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    last = { x: e.screenX, y: e.screenY, id: e.pointerId }
    try {
      document.documentElement.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a nicety: without it the drag ends where the pointer leaves the frame.
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!last || e.pointerId !== last.id) return
    const dx = e.screenX - last.x
    const dy = e.screenY - last.y
    last = { ...last, x: e.screenX, y: e.screenY }
    if (dx || dy) send({ kind: "drag", dx, dy })
  }
  const onUp = (e: PointerEvent) => {
    if (last && e.pointerId === last.id) last = null
  }
  // Some platforms start autoscroll on a middle mousedown; the pan replaces it.
  const onMouseDown = (e: MouseEvent) => e.button === 1 && e.preventDefault()

  window.addEventListener("wheel", onWheel, { passive: false, capture: true })
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", release)
  window.addEventListener("pointerdown", onDown, true)
  window.addEventListener("pointermove", onMove, true)
  window.addEventListener("pointerup", onUp, true)
  window.addEventListener("pointercancel", onUp, true)
  window.addEventListener("mousedown", onMouseDown, true)
  return {
    dispose: () => {
      window.removeEventListener("wheel", onWheel, true)
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", release)
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("pointermove", onMove, true)
      window.removeEventListener("pointerup", onUp, true)
      window.removeEventListener("pointercancel", onUp, true)
      window.removeEventListener("mousedown", onMouseDown, true)
    },
  }
}
