/*
 * The Responsive view's free canvas, on React Flow, loaded only when a canvas
 * layout opens. Frames are nodes at their own size; the canvas zoom scales
 * them. Labels sit outside the zoom (NodeToolbar), so they stay readable and
 * are the only drag handle: the product inside a frame keeps its own pointer,
 * wheel and touch. While a drag or pan is in progress a shield covers every
 * frame so the product never swallows it.
 */
import * as React from "react"
import { Background, BackgroundVariant, Controls, MiniMap, NodeToolbar, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow, type Node, type NodeChange, type NodeProps, type Viewport } from "@xyflow/react"
import "@xyflow/react/dist/base.css"
import { LayoutGridIcon, Maximize2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useStudio } from "@/store"
import type { ResponsiveFrame } from "@/studio/layouts"
import type { LiveStatus } from "@/studio/live-preview"
import { profileOf } from "./preview"
import { FrameCard } from "./responsive"

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
}

function CanvasInner({ statuses, onStatus, rowPlacement, onAnnounce }: CanvasProps) {
  const [placeFromRow] = React.useState(() => rowPlacement?.() ?? null)
  const s = useStudio()
  const r = s.responsive
  const rf = useReactFlow<FrameNode>()
  const setR = React.useCallback((patch: Partial<typeof r>) => s.set((st) => ({ responsive: { ...st.responsive, ...patch, dirty: true } })), [s])
  const [zoom, setZoom] = React.useState(r.viewport?.zoom ?? placeFromRow?.viewport.zoom ?? 1)
  const [shield, setShield] = React.useState(false)
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
    if (e.key === "+" || e.key === "=") return e.preventDefault(), rf.zoomIn({ duration: 0 })
    if (e.key === "-") return e.preventDefault(), rf.zoomOut({ duration: 0 })
    if (e.shiftKey && e.key === "!") return e.preventDefault(), rf.fitView({ padding: 0.15, duration: 200 })
    if (e.shiftKey && e.key === ")") return e.preventDefault(), rf.zoomTo(1, { duration: 200 })
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

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input, textarea, button, [role=menu]")) setShield(true)
    }
    const up = (e: KeyboardEvent) => e.code === "Space" && setShield(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  const initial = r.viewport ?? placeFromRow?.viewport
  const pct = Math.round(zoom * 100)
  return (
    <div className="studio-canvas relative size-full" data-shield={shield || undefined} onKeyDown={onKeyDown}>
      <ReactFlow<FrameNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        defaultViewport={initial ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!initial}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag
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
        onMove={(_, vp) => setZoom(vp.zoom)}
        onMoveEnd={(_, vp) => {
          setShield(false)
          setZoom(vp.zoom)
          const before = s.responsive.viewport
          if (!before || Math.abs(before.x - vp.x) > 0.5 || Math.abs(before.y - vp.y) > 0.5 || Math.abs(before.zoom - vp.zoom) > 0.001) setR({ viewport: { x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 } })
        }}
        aria-label="Responsive canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} className="text-stage-muted" color="currentColor" />
        <MiniMap pannable zoomable className="!bg-background/90 rounded-lg border shadow-sm" maskColor="color-mix(in oklch, var(--foreground) 12%, transparent)" nodeColor="var(--muted-foreground)" ariaLabel="Canvas overview" />
        <Controls showInteractive={false} className="overflow-hidden rounded-lg border bg-background shadow-sm [&_button]:border-b [&_button]:bg-background [&_button]:text-foreground [&_svg]:fill-current" />
      </ReactFlow>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-background/92 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur" aria-label="Canvas zoom">
          <span className="tabular-nums">Canvas {pct === 100 ? "at actual size" : `${pct}%`}</span>
          <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs" onClick={() => rf.fitView({ padding: 0.15, duration: 200 })}><Maximize2Icon /> Fit view</Button>
          <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs" onClick={() => rf.zoomTo(1, { duration: 200 })}>100%</Button>
          <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs" onClick={tidy}><LayoutGridIcon /> Tidy</Button>
        </span>
      </div>
    </div>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
