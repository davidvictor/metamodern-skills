/*
 * Stage navigation, the same on every stage that shows frames at a scale
 * (Inspect, Compare, Design, the Responsive row; the Responsive canvas applies
 * the same gestures to its own viewport):
 *
 * - Scroll or a two-finger swipe pans. Over a frame the page scrolls first and
 *   the stage takes what the page cannot use (frame-gestures.ts).
 * - ⌘ or Ctrl with the wheel, or a pinch, zooms around the pointer, over frames too.
 * - Space and a drag, or a middle-button drag, pans. While Space is held a
 *   shield covers the frames so the drag reaches the stage.
 * - + and − step the zoom around the stage's centre; ⇧1 fits and ⇧0 is 100%.
 */
import * as React from "react"

import { useStudio } from "@/store"
import { StageGestureContext, type StageGestureHandler } from "@/studio/stage-gestures"

/** What the dock's zoom control and the zoom keys act on: the stage on screen. */
export type ZoomApi = { zoomIn: () => void; zoomOut: () => void; fit: () => void; to: (pct: number) => void }
export const zoomTarget: { current: ZoomApi | null } = { current: null }
export function useZoomTarget(api: ZoomApi | null) {
  React.useEffect(() => {
    if (!api) return
    zoomTarget.current = api
    return () => {
      if (zoomTarget.current === api) zoomTarget.current = null
    }
  }, [api])
}

export const ZOOM_MIN = 10
export const ZOOM_MAX = 400
const STEPS = [10, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400]
export const clampZoom = (pct: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pct))
/** The next step up or down from a percentage that may sit between steps. */
export function stepZoom(pct: number, dir: 1 | -1) {
  if (dir > 0) return STEPS.find((x) => x > pct + 0.5) ?? ZOOM_MAX
  return [...STEPS].reverse().find((x) => x < pct - 0.5) ?? ZOOM_MIN
}
/** A wheel or pinch delta as a zoom factor: a pinch moves a few percent per event, a notched wheel about a quarter. */
export const wheelFactor = (dy: number) => Math.exp(-Math.max(-25, Math.min(25, dy)) * 0.01)

/** Where Space and the pointer belong to a control rather than the stage. */
export const OWNS_SPACE = "input, textarea, select, button, a[href], [contenteditable=''], [contenteditable='true'], [role=menu], [role=menuitem], [role=listbox], [role=option], [role=slider], [role=dialog], [role=combobox]"

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** One line for the zoom menu, so the gestures are discoverable without a tour. */
export function navigationHint(space = true) {
  return `Scroll to pan · ${isMac ? "⌘" : "Ctrl"} scroll or pinch to zoom · ${space ? "Space or middle drag" : "Middle drag"} to pan`
}

/**
 * Navigation for a stage that scrolls natively. `boxRef` is the scroller; its first child is the content,
 * whose position under the pointer stays put while the zoom changes.
 */
export function useStageNav(boxRef: React.RefObject<HTMLElement | null>, scale: number, { space = true, enabled = true }: { space?: boolean; enabled?: boolean } = {}) {
  const set = useStudio().set
  const [held, setHeld] = React.useState(false)
  const [panning, setPanning] = React.useState(false)
  const shown = React.useRef(scale)
  const want = React.useRef<number | null>(null)
  const anchor = React.useRef<{ el: Element; fx: number; fy: number; cx: number; cy: number; at: number } | null>(null)

  // The dock's zoom control reads the scale on screen.
  React.useEffect(() => {
    if (enabled) set({ scale })
  }, [set, scale, enabled])

  // After a zoom, scroll so the point that was under the pointer is under it again.
  React.useLayoutEffect(() => {
    shown.current = scale
    want.current = null
    const a = anchor.current
    const el = boxRef.current
    anchor.current = null
    const content = a?.el.isConnected ? a.el.getBoundingClientRect() : undefined
    if (!a || !el || !content || performance.now() - a.at > 1000) return
    el.scrollBy(content.left + a.fx * content.width - a.cx, content.top + a.fy * content.height - a.cy)
  }, [scale, boxRef])

  const zoomTo = React.useCallback(
    (pct: number, cx?: number, cy?: number) => {
      const el = boxRef.current
      if (!el) return
      const from = want.current ?? shown.current * 100
      const next = Math.round(clampZoom(pct) * 10) / 10
      if (Math.abs(next - from) < 0.05) return
      const b = el.getBoundingClientRect()
      const x = cx ?? b.left + b.width / 2
      const y = cy ?? b.top + b.height / 2
      // Anchor to the frame under the point (gaps and labels between frames do not scale), else to the whole content.
      const frames = [...el.querySelectorAll(".preview-frame")]
      const target = frames.find((f) => { const r = f.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom }) ?? frames[0] ?? el.firstElementChild
      const content = target?.getBoundingClientRect()
      if (!anchor.current && target && content && content.width && content.height) anchor.current = { el: target, fx: (x - content.left) / content.width, fy: (y - content.top) / content.height, cx: x, cy: y, at: performance.now() }
      want.current = next
      set({ zoom: next })
    },
    [boxRef, set]
  )
  const zoomBy = React.useCallback((factor: number, cx?: number, cy?: number) => zoomTo((want.current ?? shown.current * 100) * factor, cx, cy), [zoomTo])

  const api = React.useMemo<ZoomApi>(
    () => ({
      zoomIn: () => zoomTo(stepZoom(want.current ?? shown.current * 100, 1)),
      zoomOut: () => zoomTo(stepZoom(want.current ?? shown.current * 100, -1)),
      fit: () => set({ zoom: "fit" }),
      to: (pct: number) => zoomTo(pct),
    }),
    [zoomTo, set]
  )
  useZoomTarget(enabled ? api : null)

  // ⌘ or Ctrl with the wheel, or a pinch, over the stage itself.
  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomBy(wheelFactor(e.deltaY * (e.deltaMode === 1 ? 16 : 1)), e.clientX, e.clientY)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [boxRef, zoomBy])

  // Space held in the Studio (a frame reports its own).
  React.useEffect(() => {
    if (!space || !enabled) return
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.(OWNS_SPACE)) return
      e.preventDefault()
      setHeld(true)
    }
    const up = (e: KeyboardEvent) => e.code === "Space" && setHeld(false)
    const blur = () => setHeld(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", blur)
    }
  }, [space, enabled])

  const startPan = React.useCallback(
    (e: React.PointerEvent) => {
      const el = boxRef.current
      if (!el || !(e.button === 1 || (e.button === 0 && held))) return
      e.preventDefault()
      let x = e.clientX
      let y = e.clientY
      setPanning(true)
      const move = (ev: PointerEvent) => {
        el.scrollBy(x - ev.clientX, y - ev.clientY)
        x = ev.clientX
        y = ev.clientY
      }
      const end = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", end)
        window.removeEventListener("pointercancel", end)
        setPanning(false)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", end)
      window.addEventListener("pointercancel", end)
    },
    [boxRef, held]
  )

  const onGesture = React.useCallback<StageGestureHandler>(
    (g) => {
      const el = boxRef.current
      if (!el) return
      if (g.kind === "space") return space && setHeld(g.down)
      if (g.kind === "drag") return el.scrollBy(-g.dx, -g.dy)
      if (g.zoom) zoomBy(wheelFactor(g.dy), g.x, g.y)
      else el.scrollBy(g.dx, g.dy)
    },
    [boxRef, space, zoomBy]
  )

  // The shield takes the wheel natively, so ⌘ or Ctrl never reaches the browser's own page zoom.
  const shieldRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault()
          if (e.ctrlKey || e.metaKey) zoomBy(wheelFactor(e.deltaY), e.clientX, e.clientY)
          else boxRef.current?.scrollBy(e.deltaX, e.deltaY)
        },
        { passive: false }
      )
    },
    [boxRef, zoomBy]
  )
  const shield =
    held || panning ? (
      <div ref={shieldRef} aria-hidden data-stage-shield className={panning ? "absolute inset-0 z-20 cursor-grabbing" : "absolute inset-0 z-20 cursor-grab"} onPointerDown={startPan} />
    ) : null

  return { onGesture, shield, onPointerDown: startPan, zoomBy }
}

/** Wraps a native stage: frames inside send their gestures here, and the shield covers them while Space is held. */
export function StageNav({ nav, children }: { nav: ReturnType<typeof useStageNav>; children: React.ReactNode }) {
  return (
    <StageGestureContext.Provider value={nav.onGesture}>
      {children}
      {nav.shield}
    </StageGestureContext.Provider>
  )
}
