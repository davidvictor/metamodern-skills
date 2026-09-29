/*
 * The Responsive view's free canvas, on React Flow, loaded only when a canvas
 * layout opens. Frames are nodes at their own size; the canvas zoom scales
 * them. Labels sit outside the zoom (NodeToolbar), so they stay readable and
 * are the only drag handle: the product inside a frame keeps its own pointer,
 * wheel and touch. While a drag or pan is in progress a shield covers every
 * frame so the product never swallows it.
 */
import * as React from "react"
import { Background, BackgroundVariant, MiniMap, NodeToolbar, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow, useViewport, type Node, type NodeChange, type NodeProps, type Viewport } from "@xyflow/react"
import "@xyflow/react/dist/base.css"

import { useStudio } from "@/store"
import type { ResponsiveFrame } from "@/studio/layouts"
import type { LiveStatus } from "@/studio/live-preview"
import { StageGestureContext, type StageGestureHandler } from "@/studio/stage-gestures"
import { profileOf } from "./preview"
import { FrameCard } from "./responsive"
import { OWNS_SPACE, useZoomTarget, wheelFactor, type ZoomApi } from "./stage-nav"

const SNAP = 8
const snap = (v: number) => Math.round(v / SNAP) * SNAP
const KIND_ORDER = { phone: 0, tablet: 1, laptop: 2, desktop: 3 }

type FrameData = {
  frame: ResponsiveFrame
  index: number
  count: number
  zoom: number
  status: LiveStatus | null
  onStatus: (id: string, st: LiveStatus | null) => void
  onLabelDown: (e: React.PointerEvent, id: string) => void
  labelRef: (id: string, el: HTMLElement | null) => void
}
type FrameNode = Node<FrameData, "frame">

function FrameNodeView({ data, selected }: NodeProps<FrameNode>) {
  return (
    // No nopan here: Space plus drag pans from anywhere, frames included. The resize handles carry nopan themselves.
    <div className="nodrag nowheel">
      <FrameCard
        canvas
        frame={data.frame}
        index={data.index}
        count={data.count}
        scale={1}
        shownScale={data.zoom}
        selected={selected}
        status={data.status}
        onStatus={data.onStatus}
        dragging={false}
        onDragStart={data.onLabelDown}
        labelRef={(el) => data.labelRef(data.frame.id, el)}
        wrapLabel={(label) => (
          <NodeToolbar isVisible position={Position.Top} align="start" offset={8} className="nodrag nopan">
            {label}
          </NodeToolbar>
        )}
      />
    </div>
  )
}
const nodeTypes = { frame: FrameNodeView }

/** Frames without a position take the one they had in the row; a frame added on the canvas goes to the right of everything there. */
function placeFrames(frames: ResponsiveFrame[], fromRow?: Record<string, { x: number; y: number }>) {
  const out: ResponsiveFrame[] = []
  let right = Math.max(0, ...frames.filter((f) => f.x !== undefined).map((f) => f.x! + f.w + 64))
  for (const f of frames) {
    if (f.x !== undefined && f.y !== undefined) out.push(f)
    else if (fromRow?.[f.id]) out.push({ ...f, x: fromRow[f.id].x, y: fromRow[f.id].y })
    else {
      out.push({ ...f, x: snap(right), y: 0 })
      right += f.w + 64
    }
  }
  return out
}

export type CanvasProps = {
  statuses: Record<string, LiveStatus | null>
  onStatus: (id: string, st: LiveStatus | null) => void
  /** Where the row showed each frame when the viewer switched to the canvas, so nothing jumps. Read once, on opening. */
  rowPlacement?: () => { positions: Record<string, { x: number; y: number }>; viewport: Viewport } | null
  onAnnounce: (text: string) => void
  /** The canvas zoom in percent, for the dock's zoom control. */
  onZoom: (pct: number) => void
  /** Filled with the canvas's Tidy, for the Responsive toolbar. */
  tidyRef: React.MutableRefObject<(() => void) | null>
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

function CanvasInner({ statuses, onStatus, rowPlacement, onAnnounce, onZoom, tidyRef }: CanvasProps) {
  const [placeFromRow] = React.useState(() => rowPlacement?.() ?? null)
  const s = useStudio()
  const r = s.responsive
  const rf = useReactFlow<FrameNode>()
  const setR = React.useCallback((patch: Partial<typeof r>) => s.set((st) => ({ responsive: { ...st.responsive, ...patch, dirty: true } })), [s])
  const zoom = useViewport().zoom
  const [shield, setShield] = React.useState(false)
  // Space held, in the Studio or in a frame: the shield stays up so a drag pans from anywhere.
  const [held, setHeld] = React.useState(false)
  const pane = React.useRef<HTMLDivElement>(null)
  const labels = React.useRef(new Map<string, HTMLElement>())
  const labelRef = React.useCallback((id: string, el: HTMLElement | null) => {
    if (el) labels.current.set(id, el)
    else labels.current.delete(id)
  }, [])

  // Frames without a position take the one they had in the row (or a row laid out here).
  const placed = React.useMemo(() => placeFrames(r.frames, placeFromRow?.positions), [r.frames, placeFromRow])
  React.useEffect(() => {
    if (placed.some((f, i) => f !== r.frames[i])) s.set((st) => ({ responsive: { ...st.responsive, frames: placed } }))
  }, [placed, r.frames, s])

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [nodes, setNodes] = React.useState<FrameNode[]>([])
  const drag = React.useRef<{ ids: string[]; x0: number; y0: number; start: Record<string, { x: number; y: number }>; moved: boolean } | null>(null)

  const onLabelDown = React.useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return
      const ids = selected.has(id) ? [...selected] : [id]
      const f = placed.find((x) => x.id === id)!
      if (e.shiftKey) {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
        onAnnounce(`${next.has(id) ? "Added" : "Removed"} ${f.w} by ${f.h} ${next.has(id) ? "to" : "from"} the selection; ${next.size} selected`)
        return
      }
      if (!selected.has(id)) {
        setSelected(new Set([id]))
        onAnnounce(`Selected ${f.w} by ${f.h}`)
      }
      const start = Object.fromEntries(placed.filter((f) => ids.includes(f.id)).map((f) => [f.id, { x: f.x!, y: f.y! }]))
      drag.current = { ids, x0: e.clientX, y0: e.clientY, start, moved: false }
      const onMove = (ev: PointerEvent) => {
        const d = drag.current
        if (!d) return
        if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return
        d.moved = true
        setShield(true)
        const z = rf.getViewport().zoom
        const dx = (ev.clientX - d.x0) / z
        const dy = (ev.clientY - d.y0) / z
        setNodes((ns) => ns.map((n) => (d.ids.includes(n.id) ? { ...n, position: { x: snap(d.start[n.id].x + dx), y: snap(d.start[n.id].y + dy) } } : n)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        const d = drag.current
        drag.current = null
        setShield(false)
        if (!d?.moved) return
        setNodes((ns) => {
          const at = Object.fromEntries(ns.map((n) => [n.id, n.position]))
          setR({ frames: placed.map((f) => (d.ids.includes(f.id) ? { ...f, x: at[f.id].x, y: at[f.id].y } : f)) })
          return ns
        })
        onAnnounce(`Moved ${d.ids.length === 1 ? "the frame" : `${d.ids.length} frames`}`)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [selected, placed, rf, setR, onAnnounce]
  )

  // Nodes follow the frames; React Flow's measurements and selection stay in local state.
  React.useEffect(() => {
    setNodes((prev) =>
      placed.map((f, i) => {
        const old = prev.find((n) => n.id === f.id)
        return {
          ...(old ?? {}),
          id: f.id,
          type: "frame" as const,
          position: drag.current?.ids.includes(f.id) && old ? old.position : { x: f.x!, y: f.y! },
          draggable: false,
          selectable: true,
          selected: selected.has(f.id),
          data: { frame: f, index: i, count: placed.length, zoom, status: statuses[f.id] ?? null, onStatus, onLabelDown, labelRef },
        }
      })
    )
  }, [placed, selected, zoom, statuses, onStatus, onLabelDown, labelRef])

  const onNodesChange = React.useCallback((changes: NodeChange<FrameNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns))
    const sel = changes.filter((c) => c.type === "select")
    if (sel.length)
      setSelected((cur) => {
        const next = new Set(cur)
        for (const c of sel) {
          if (c.type !== "select") continue
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        }
        return next
      })
  }, [])

  // Arrow keys move the focused frame (or the selection) 8 px, or 64 px with Shift.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, [role=menu]")) return
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    const id = t.closest("[data-frame-caption]")?.getAttribute("data-frame-caption")
    if (!dir || !id || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    const step = e.shiftKey ? 64 : SNAP
    const ids = selected.has(id) ? [...selected] : [id]
    const next = placed.map((f) => (ids.includes(f.id) ? { ...f, x: f.x! + dir[0] * step, y: f.y! + dir[1] * step } : f))
    setR({ frames: next })
    const moved = next.find((f) => f.id === id)!
    onAnnounce(`Moved ${moved.w} by ${moved.h} to ${moved.x}, ${moved.y}`)
    requestAnimationFrame(() => labels.current.get(id)?.focus({ preventScroll: true }))
  }

  const tidy = () => {
    const order = [...placed].sort((a, b) => KIND_ORDER[profileOf(a.profile).kind] - KIND_ORDER[profileOf(b.profile).kind] || placed.indexOf(a) - placed.indexOf(b))
    let x = 0
    const at = Object.fromEntries(order.map((f) => { const p = { x, y: 0 }; x += f.w + 64; return [f.id, p] }))
    setR({ frames: order.map((f) => ({ ...f, ...at[f.id] })) })
    onAnnounce("Tidied into a row, grouped by kind")
    window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 200 }), 50)
  }

  React.useLayoutEffect(() => {
    tidyRef.current = tidy
  })

  React.useEffect(() => {
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
  }, [])

  // A viewport change that is not React Flow's own gesture (keys, the dock, a frame's gesture) is saved once it settles.
  const saveTimer = React.useRef(0)
  const saveViewport = React.useCallback(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const vp = rf.getViewport()
      const before = s.responsive.viewport
      if (!before || Math.abs(before.x - vp.x) > 0.5 || Math.abs(before.y - vp.y) > 0.5 || Math.abs(before.zoom - vp.zoom) > 0.001) setR({ viewport: { x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 } })
    }, 250)
  }, [rf, s.responsive.viewport, setR])
  React.useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  const moveTo = React.useCallback(
    (vp: Viewport) => {
      rf.setViewport(vp)
      saveViewport()
    },
    [rf, saveViewport]
  )
  const zoomAround = React.useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const vp = rf.getViewport()
      const b = pane.current?.getBoundingClientRect()
      if (!b) return
      const x = (cx ?? b.left + b.width / 2) - b.left
      const y = (cy ?? b.top + b.height / 2) - b.top
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor))
      moveTo({ x: x - ((x - vp.x) * z) / vp.zoom, y: y - ((y - vp.y) * z) / vp.zoom, zoom: z })
    },
    [rf, moveTo]
  )

  // ⌘ or Ctrl with the wheel, or a pinch, zooms at the same rate over empty canvas as over a frame.
  React.useEffect(() => {
    const el = pane.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      zoomAround(wheelFactor(e.deltaY * (e.deltaMode === 1 ? 16 : 1)), e.clientX, e.clientY)
    }
    el.addEventListener("wheel", onWheel, { capture: true, passive: false })
    return () => el.removeEventListener("wheel", onWheel, { capture: true })
  }, [zoomAround])

  // Gestures that began over a frame: pan by the part of a scroll the page could not use, zoom around the pointer.
  const onGesture = React.useCallback<StageGestureHandler>(
    (g) => {
      if (g.kind === "space") return setHeld(g.down)
      const vp = rf.getViewport()
      if (g.kind === "drag") return moveTo({ ...vp, x: vp.x + g.dx, y: vp.y + g.dy })
      if (g.zoom) zoomAround(wheelFactor(g.dy), g.x, g.y)
      else moveTo({ ...vp, x: vp.x - g.dx, y: vp.y - g.dy })
    },
    [rf, moveTo, zoomAround]
  )

  const api = React.useMemo<ZoomApi>(
    () => ({
      zoomIn: () => zoomAround(1.25),
      zoomOut: () => zoomAround(0.8),
      fit: () => {
        rf.fitView({ padding: 0.15, duration: 200 })
        window.setTimeout(saveViewport, 220)
      },
      to: (pct: number) => zoomAround(pct / 100 / rf.getViewport().zoom),
    }),
    [rf, zoomAround, saveViewport]
  )
  useZoomTarget(api)
  React.useEffect(() => onZoom(Math.round(zoom * 100)), [zoom, onZoom])

  // A saved layout opens where it was left, and a switch from the row keeps every frame where it was; otherwise the canvas opens with every frame in view.
  const initial = r.viewport ?? placeFromRow?.viewport
  return (
    <StageGestureContext.Provider value={onGesture}>
    <div ref={pane} className="studio-canvas relative size-full" data-shield={shield || held || undefined} onKeyDown={onKeyDown}>
      <ReactFlow<FrameNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        defaultViewport={initial ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!initial}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={[0, 1]}
        selectionKeyCode="Shift"
        snapToGrid
        snapGrid={[SNAP, SNAP]}
        nodesDraggable={false}
        nodesFocusable={false}
        elementsSelectable
        disableKeyboardA11y
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        onMoveStart={() => setShield(true)}
        onMoveEnd={(_, vp) => {
          setShield(false)
          const before = s.responsive.viewport
          if (!before || Math.abs(before.x - vp.x) > 0.5 || Math.abs(before.y - vp.y) > 0.5 || Math.abs(before.zoom - vp.zoom) > 0.001) setR({ viewport: { x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 } })
        }}
        aria-label="Responsive canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} className="text-stage-muted" color="currentColor" />
        {s.options.map && <MiniMap pannable zoomable className="!bg-background/90 rounded-lg border shadow-sm" maskColor="color-mix(in oklch, var(--foreground) 12%, transparent)" nodeColor="var(--muted-foreground)" ariaLabel="Canvas overview" />}
      </ReactFlow>
    </div>
    </StageGestureContext.Provider>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
