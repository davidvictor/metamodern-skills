import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { adapter } from "@/adapter"
import { useStudio } from "@/store"
import { profileOf } from "./preview"

type Edge = "e" | "s" | "se"

/** How close, in displayed pixels, the dragged edge must come to a known width or height to be drawn to it. */
const SNAP_PX = 8

const nearest = (v: number, list: number[], tol: number) => {
  let best: number | null = null
  for (const x of list) if (Math.abs(x - v) <= tol && (best === null || Math.abs(x - v) < Math.abs(best - v))) best = x
  return best
}

/**
 * Drag handles on the right edge, the bottom edge and the corner of the Inspect frame.
 *
 * The frame stays centred, so an edge follows the pointer by changing that dimension by twice the
 * distance from the frame's centre. The displayed scale is frozen while dragging (`onDragChange`),
 * so the handle does not slide out from under the pointer as Fit recomputes; it refits on release.
 * The frame is never remounted: the product just sees its window change size.
 *
 * Widths and heights are drawn to the profiles' own sizes (and the adapter's breakpoints) unless
 * Shift is held. Releasing on exactly a profile's size selects that profile.
 *
 * The handles hug the frame, not the column around it, and keep a constant size on screen: the grips
 * shrink with a small frame (30% of its edge, 12 to 40 px), and inside a zoomed layer (`zoomed`, the
 * Responsive canvas) they are counter-scaled so the zoom does not shrink or grow them.
 */
/** Who owns the size: Inspect's store by default, or a Responsive frame. `centred` frames grow both ways from their centre. */
export type ResizeControl = { profile: string; setSize: (size: { w: number; h: number } | null) => void; setProfile: (id: string) => void; centred: boolean; label?: string }

export function ResizeHandles({ w, h, scale, zoomed, onDragChange, control, children }: { w: number; h: number; scale: number; zoomed?: boolean; onDragChange: (frozen: { scale: number } | null) => void; control?: ResizeControl; children: React.ReactNode }) {
  const store = useStudio()
  const s: ResizeControl = control ?? { profile: store.profile, setSize: store.setSize, setProfile: store.setProfile, centred: true }
  const lim = adapter.axes.resizable!
  const base = profileOf(s.profile)
  const wrap = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ edge: Edge; cx: number; cy: number; left: number; top: number; gx: number; gy: number; scale: number; next: { w: number; h: number }; frame: number } | null>(null)
  const [active, setActive] = React.useState<Edge | null>(null)
  const [readout, setReadout] = React.useState<{ w: number; h: number; name?: string } | null>(null)

  const widths = React.useMemo(() => [...new Set([...adapter.axes.profiles.map((p) => p.w), ...(lim.snapWidths ?? [])])], [lim.snapWidths])
  const heights = React.useMemo(() => [...new Set(adapter.axes.profiles.map((p) => p.h))], [])
  React.useEffect(() => {
    if (!active) return
    document.body.style.cursor = active === "e" ? "ew-resize" : active === "s" ? "ns-resize" : "nwse-resize"
    return () => {
      document.body.style.cursor = ""
    }
  }, [active])
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)))
  const presetAt = (pw: number, ph: number) => {
    const same = adapter.axes.profiles.filter((p) => p.w === pw && p.h === ph)
    return same.find((p) => p.id === s.profile) ?? same[0]
  }
  const apply = (nw: number, nh: number) => {
    const size = { w: clamp(nw, lim.min.w, lim.max.w), h: clamp(nh, lim.min.h, lim.max.h) }
    s.setSize(size.w === base.w && size.h === base.h ? null : size)
    return size
  }

  const begin = (e: React.PointerEvent<HTMLElement>) => {
    const edge = e.currentTarget.dataset.edge as Edge
    if (e.button !== 0 || !wrap.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = wrap.current.getBoundingClientRect()
    // gx/gy: where inside the handle it was grabbed, so the edge does not jump to the pointer.
    drag.current = { edge, cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, top: r.top, gx: e.clientX - r.right, gy: e.clientY - r.bottom, scale, next: { w, h }, frame: 0 }
    setActive(edge)
    onDragChange({ scale })
  }
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const { clientX, clientY, shiftKey } = e
    if (d.frame) cancelAnimationFrame(d.frame)
    d.frame = requestAnimationFrame(() => {
      // A centred frame grows both ways, so an edge moves half as far as the size changes.
      const k = s.centred ? 2 : 1
      const x0 = s.centred ? d.cx : d.left
      const y0 = s.centred ? d.cy : d.top
      let nw = d.edge === "s" ? d.next.w : clamp((k * (clientX - d.gx - x0)) / d.scale, lim.min.w, lim.max.w)
      let nh = d.edge === "e" ? d.next.h : clamp((k * (clientY - d.gy - y0)) / d.scale, lim.min.h, lim.max.h)
      if (!shiftKey) {
        const tol = (k * SNAP_PX) / d.scale
        if (d.edge !== "s") nw = nearest(nw, widths, tol) ?? nw
        if (d.edge !== "e") nh = nearest(nh, heights, tol) ?? nh
      }
      const size = apply(nw, nh)
      d.next = size
      setReadout({ ...size, name: presetAt(size.w, size.h)?.label })
    })
  }
  const end = () => {
    const d = drag.current
    if (!d) return
    cancelAnimationFrame(d.frame)
    drag.current = null
    // Landing exactly on a profile's size selects it, so the toolbar names it and its input context applies.
    const hit = presetAt(d.next.w, d.next.h)
    if (hit && hit.id !== s.profile) s.setProfile(hit.id)
    else if (hit) s.setSize(null)
    setActive(null)
    setReadout(null)
    onDragChange(null)
  }
  const nudge = (axis: "w" | "h") => (e: React.KeyboardEvent<HTMLElement>) => {
    const dir = axis === "w" ? (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const step = (e.shiftKey ? 10 : 1) * dir
    apply(axis === "w" ? w + step : w, axis === "h" ? h + step : h)
  }
  const reset = () => s.setSize(null)

  const grip = "bg-[color-mix(in_oklch,var(--stage-foreground)_38%,transparent)] transition-colors group-hover:bg-[color-mix(in_oklch,var(--stage-foreground)_80%,transparent)] group-focus-visible:bg-(--stage-foreground) group-data-[active=true]:bg-(--anchor)"
  const common = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onDoubleClick: reset }
  // Screen pixels to the handles' own pixels, and grip lengths that follow the frame's size on screen.
  const k = zoomed ? 1 / scale : 1
  const hit = 20 * k
  const inset = 6 * k
  const thick = 4 * k
  const along = (edge: number) => Math.max(12, Math.min(40, edge * scale * 0.3)) * k

  return (
    <div ref={wrap} className="relative w-fit">
      {children}
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${s.label ?? "Frame"} width`}
        aria-orientation="horizontal"
        aria-valuemin={lim.min.w}
        aria-valuemax={lim.max.w}
        aria-valuenow={w}
        aria-valuetext={`${w} pixels`}
        title="Drag to resize. Double-click to return to the profile's size."
        data-active={active === "e" || active === "se"}
        className="nopan nodrag group absolute inset-y-0 flex cursor-ew-resize touch-none items-center outline-none"
        style={{ right: -hit, width: hit, paddingLeft: inset }}
        {...common}
        data-edge="e"
        onPointerDown={begin}
        onKeyDown={nudge("w")}
      >
        <i className={cn("rounded-full group-focus-visible:ring-2 group-focus-visible:ring-ring", grip)} style={{ height: along(h), width: thick }} />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${s.label ?? "Frame"} height`}
        aria-orientation="vertical"
        aria-valuemin={lim.min.h}
        aria-valuemax={lim.max.h}
        aria-valuenow={h}
        aria-valuetext={`${h} pixels`}
        title="Drag to resize. Double-click to return to the profile's size."
        data-active={active === "s" || active === "se"}
        className="nopan nodrag group absolute inset-x-0 flex cursor-ns-resize touch-none justify-center outline-none"
        style={{ bottom: -hit, height: hit, paddingTop: inset }}
        {...common}
        data-edge="s"
        onPointerDown={begin}
        onKeyDown={nudge("h")}
      >
        <i className={cn("rounded-full group-focus-visible:ring-2 group-focus-visible:ring-ring", grip)} style={{ width: along(w), height: thick }} />
      </div>
      <div
        aria-hidden
        data-active={active === "se"}
        className="nopan nodrag group absolute flex cursor-nwse-resize touch-none items-start justify-start"
        style={{ right: -hit, bottom: -hit, width: hit, height: hit, paddingTop: inset, paddingLeft: inset }}
        {...common}
        data-edge="se"
        onPointerDown={begin}
      >
        <i className={cn("rounded-full", grip)} style={{ width: inset, height: inset }} />
      </div>
      {readout && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <Badge className="h-6 gap-1.5 px-2.5 text-xs tabular-nums shadow-md" style={zoomed ? { transform: `scale(${k})` } : undefined}>
            {readout.w} × {readout.h}
            {readout.name && <span className="opacity-70">· {readout.name}</span>}
          </Badge>
        </div>
      )}
    </div>
  )
}
