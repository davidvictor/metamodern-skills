/*
 * The Responsive view: one scenario at several sizes, each frame its own live
 * runtime, at one shared scale so relative sizes are true. Layouts come from
 * presets (read only) or the Studio's layouts.json; edits stay in this browser
 * until saved. Frames are reordered, resized, added and removed here.
 */
import * as React from "react"
import { toast } from "sonner"
import { ChevronDownIcon, EllipsisIcon, GripVerticalIcon, PlusIcon, RotateCcwIcon, SaveIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { adapter } from "@/adapter"
import { canSaveLayouts, captureFor, PRESETS, useStudio } from "@/store"
import { FULL_PAGE_MAX, frameId, MAX_FRAMES, nearestProfile, SHELL_DEVICES, slug, type PresetFrame, type ResponsiveFrame, type ResponsiveLayout } from "@/studio/layouts"
import type { LiveStatus } from "@/studio/live-preview"
import { PreviewFrame, StatusBadge } from "./bits"
import { profileOf, ScenarioPreview } from "./preview"
import { ResizeHandles } from "./resize-handles"
import { StageControls } from "./chrome"

const GAP = 32
const LABEL_H = 36
const MIN_COLUMN = 148
const FLOOR = 0.2
const kindLabel = { phone: "Phone", tablet: "Tablet", laptop: "Laptop", desktop: "Desktop" }

/** Why a size cannot be a frame here, or nothing when it can. */
export function sizeProblem(w: number, h: number) {
  if (adapter.axes.profiles.some((p) => p.w === w && p.h === h)) return null
  if (!adapter.frameEntry) return "A Studio of captures shows only its recorded sizes"
  const lim = adapter.axes.resizable
  if (!lim) return "This product's previews come only in its profiles' sizes"
  if (w < lim.min.w || w > lim.max.w || h < lim.min.h || h > lim.max.h) return `Outside the sizes this product supports (${lim.min.w} × ${lim.min.h} to ${lim.max.w} × ${lim.max.h})`
  return null
}

const Canvas = React.lazy(() => import("./canvas"))

function useResponsive() {
  const s = useStudio()
  const r = s.responsive
  const set = (patch: Partial<typeof r>, dirty = true) => s.set((st) => ({ responsive: { ...st.responsive, ...patch, dirty: dirty || st.responsive.dirty } }))
  const all = [...PRESETS, ...s.saved]
  const isSaved = s.saved.some((l) => l.id === r.layout)
  const toLayout = (id: string, name: string): ResponsiveLayout => ({ id, name, frames: r.frames, arrangement: r.arrangement, height: r.height, ...(r.viewport ? { viewport: r.viewport } : {}), sync: r.sync })
  const persist = async (next: ResponsiveLayout[]) => {
    const res = await fetch("__studio/layouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schema: "studio-layouts/1", layouts: next }) })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `The Studio refused the save (${res.status})`)
    }
    s.set({ saved: next })
  }
  const open = (layout: ResponsiveLayout) => {
    const before = r
    s.set({ responsive: { layout: layout.id, name: layout.name, frames: layout.frames.map((f) => ({ ...f })), arrangement: layout.arrangement, height: layout.height, viewport: layout.viewport, sync: layout.sync ?? before.sync, dirty: false, resetNonce: before.resetNonce } })
    if (before.dirty) toast(`Unsaved changes to ${before.name} were set aside`, { action: { label: "Undo", onClick: () => s.set({ responsive: before }) } })
  }
  /** Row keeps the canvas order, read left to right, then top to bottom. */
  const arrange = (a: "row" | "canvas") => {
    if (a === r.arrangement) return
    if (a === "row") set({ arrangement: "row", frames: [...r.frames].sort((x, y) => (x.x ?? 0) - (y.x ?? 0) || (x.y ?? 0) - (y.y ?? 0)) })
    // Each frame starts where it sits in the row, at the row's scale.
    else set({ arrangement: "canvas", viewport: undefined, frames: r.frames.map(({ x: _x, y: _y, ...f }) => (void _x, void _y, f)) })
  }
  return { s, r, set, all, isSaved, toLayout, persist, open, arrange }
}

/* ---------------- panel ---------------- */

function SaveAs({ trigger, title, initial, onSave }: { trigger: React.ReactElement; title: string; initial: string; onSave: (name: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSave(name.trim())
      setOpen(false)
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(initial) }}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-64">
        <Field>
          <FieldLabel htmlFor="layout-name">{title}</FieldLabel>
          <Input id="layout-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        </Field>
        <Button size="sm" className="mt-3 w-full" disabled={busy || !name.trim()} onClick={submit}>Save</Button>
      </PopoverContent>
    </Popover>
  )
}

/** The working layout's actions: save, save as, rename, duplicate, delete, revert. */
export function LayoutActions() {
  const { s, r, isSaved, toLayout, persist, open, all } = useResponsive()
  const why = canSaveLayouts ? undefined : "Saving needs the local Studio (npm run dev). A published Studio reads its saved layouts but cannot change them."
  const unique = (name: string) => {
    let id = slug(name)
    for (let n = 2; all.some((l) => l.id === id); n++) id = `${slug(name)}-${n}`
    return id
  }
  const saveAs = async (name: string) => {
    const layout = toLayout(unique(name), name)
    await persist([...s.saved, layout])
    s.set({ responsive: { ...r, layout: layout.id, name, dirty: false } })
    toast.success(`Saved ${name}`, { description: "In this Studio's layouts.json. Commit it to share." })
  }
  const save = async () => {
    try {
      await persist(s.saved.map((l) => (l.id === r.layout ? toLayout(l.id, l.name) : l)))
      s.set({ responsive: { ...r, dirty: false } })
      toast.success(`Saved ${r.name}`)
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : String(e) })
    }
  }
  const rename = async (name: string) => {
    await persist(s.saved.map((l) => (l.id === r.layout ? { ...l, name } : l)))
    s.set({ responsive: { ...r, name } })
  }
  const remove = async () => {
    if (!window.confirm(`Delete the saved layout ${r.name}? This changes layouts.json.`)) return
    try {
      await persist(s.saved.filter((l) => l.id !== r.layout))
      open(PRESETS[0])
      toast.success(`Deleted ${r.name}`)
    } catch (e) {
      toast.error("Not deleted", { description: e instanceof Error ? e.message : String(e) })
    }
  }
  const revert = () => {
    const source = all.find((l) => l.id === r.layout)
    if (source) s.set({ responsive: { ...r, frames: source.frames.map((f) => ({ ...f })), arrangement: source.arrangement, height: source.height, viewport: source.viewport, sync: source.sync ?? r.sync, dirty: false } })
  }
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium" title={r.name}>{r.name}</span>
        {!isSaved && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Preset</Badge>}
        {r.dirty && <StatusBadge kind="draft">Unsaved</StatusBadge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {isSaved && (
          <Button size="sm" variant="outline" disabled={!canSaveLayouts || !r.dirty} title={why} onClick={save}>
            <SaveIcon /> Save
          </Button>
        )}
        <SaveAs title="Save as a new layout" initial={isSaved ? `${r.name} copy` : `${r.name} (mine)`} onSave={saveAs} trigger={<Button size="sm" variant={isSaved ? "ghost" : "outline"} disabled={!canSaveLayouts} title={why}>{isSaved ? "Save as" : <><SaveIcon /> Save as</>}</Button>} />
        {r.dirty && (
          <Button size="sm" variant="ghost" onClick={revert}>
            <RotateCcwIcon /> Revert
          </Button>
        )}
        {isSaved && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More layout actions" />}>
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={!canSaveLayouts} onClick={() => { const name = window.prompt("Rename the layout", r.name)?.trim(); if (name) rename(name).catch((e) => toast.error("Not renamed", { description: String(e) })) }}>Rename</DropdownMenuItem>
              <DropdownMenuItem disabled={!canSaveLayouts} onClick={() => saveAs(`${r.name} copy`).catch((e) => toast.error("Not duplicated", { description: String(e) }))}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!canSaveLayouts} onClick={remove}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {!canSaveLayouts && <p className="text-[11px] text-muted-foreground">{why}</p>}
    </div>
  )
}

/** Height, and the frame list with keyboard and pointer reordering. */
export function ResponsivePanel() {
  const { s, r, set, open, arrange } = useResponsive()
  const rows = React.useRef(new Map<string, HTMLElement>())
  const [said, setSaid] = React.useState("")
  const [focus, setFocus] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (focus) rows.current.get(focus)?.focus()
  }, [focus, r.frames])
  const move = (id: string, by: number) => {
    const i = r.frames.findIndex((f) => f.id === id)
    const j = Math.max(0, Math.min(r.frames.length - 1, i + by))
    if (i === j) return
    const next = [...r.frames]
    const [f] = next.splice(i, 1)
    next.splice(j, 0, f)
    set({ frames: next })
    setFocus(id)
    setSaid(`Moved ${f.w} by ${f.h} to position ${j + 1} of ${next.length}`)
  }
  const drag = React.useRef<{ id: string; y: number } | null>(null)
  return (
    <SidebarContent>
      <SidebarGroup className="gap-3 px-3 pt-3">
        <LayoutActions />
        <ToggleGroup value={[r.height]} onValueChange={(v) => v[0] && set({ height: v[0] as "screen" | "full" })} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-2" aria-label="Frame height">
          <ToggleGroupItem value="screen" className="h-7 text-xs">Screen</ToggleGroupItem>
          <ToggleGroupItem value="full" className="h-7 text-xs">Full page</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup value={[r.arrangement]} onValueChange={(v) => v[0] && arrange(v[0] as "row" | "canvas")} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-2" aria-label="Arrangement">
          <ToggleGroupItem value="row" className="h-7 text-xs">Row</ToggleGroupItem>
          <ToggleGroupItem value="canvas" className="h-7 text-xs">Canvas</ToggleGroupItem>
        </ToggleGroup>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          Frames <span className="ml-auto tabular-nums">{r.frames.length} of {MAX_FRAMES}</span>
        </SidebarGroupLabel>
        <ul className="grid gap-1 px-2" aria-label="Frames" onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const target = [...rows.current.entries()].find(([id, el]) => { const b = el.getBoundingClientRect(); return id !== d.id && e.clientY > b.top && e.clientY < b.bottom })
          if (target) move(d.id, r.frames.findIndex((f) => f.id === target[0]) - r.frames.findIndex((f) => f.id === d.id))
        }} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          {r.frames.map((f, i) => (
            <li key={f.id}
              ref={(el) => { if (el) rows.current.set(f.id, el); else rows.current.delete(f.id) }}
              tabIndex={0}
              aria-label={`${f.w} by ${f.h}, ${profileOf(f.profile).label}, position ${i + 1} of ${r.frames.length}. Alt and an arrow key move it.`}
              onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(f.id, e.key === "ArrowUp" ? -1 : 1) } }}
              className="flex h-9 items-center gap-1.5 rounded-md px-1.5 text-xs outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
              <GripVerticalIcon className="size-3.5 shrink-0 cursor-grab text-muted-foreground" onPointerDown={(e) => { e.preventDefault(); drag.current = { id: f.id, y: e.clientY } }} aria-hidden />
              <span className="tabular-nums">{f.w} × {f.h}</span>
              <span className="min-w-0 truncate text-muted-foreground">{f.label ?? profileOf(f.profile).label}</span>
              <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Remove ${f.w} by ${f.h}`} disabled={r.frames.length === 1} title={r.frames.length === 1 ? "A layout keeps at least one frame" : undefined} onClick={() => removeFrame(set, r.frames, f.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 px-2 pt-2"><AddFrame /><CustomSize /></div>
        <p className="sr-only" aria-live="polite">{said}</p>
      </SidebarGroup>
      <SidebarGroup className="border-t">
        <SidebarGroupLabel>Presets</SidebarGroupLabel>
        <SidebarMenu>
          {PRESETS.map((l) => (
            <SidebarMenuItem key={l.id}>
              <SidebarMenuButton size="sm" isActive={r.layout === l.id} onClick={() => open(l)}>
                <span className="truncate">{l.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{l.frames.length}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarGroupLabel className="mt-2">Saved in this Studio</SidebarGroupLabel>
        {!s.saved.length && <p className="px-2 pb-2 text-xs text-muted-foreground">None yet. Save as keeps a layout in layouts.json.</p>}
        <SidebarMenu>
          {s.saved.map((l) => (
            <SidebarMenuItem key={l.id}>
              <SidebarMenuButton size="sm" isActive={r.layout === l.id} onClick={() => open(l)}>
                <span className="truncate">{l.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{l.frames.length}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  )
}

function removeFrame(set: (p: { frames: ResponsiveFrame[] }) => void, frames: ResponsiveFrame[], id: string) {
  if (frames.length === 1) return
  set({ frames: frames.filter((f) => f.id !== id) })
}

function useAddFrame() {
  const { r, set } = useResponsive()
  const full = r.frames.length >= MAX_FRAMES
  const add = (w: number, h: number, kind?: PresetFrame["kind"], label?: string, profile?: string) => {
    if (full) return toast.error(`A layout holds at most ${MAX_FRAMES} frames`, { description: "Each frame is a running copy of the product. Remove one first." })
    const problem = sizeProblem(w, h)
    if (problem) return toast.error(`${w} × ${h} can't be a frame here`, { description: problem })
    const p = profile ?? nearestProfile(adapter.axes.profiles, w, h, kind).id
    set({ frames: [...r.frames, { id: frameId(w, h), w, h, profile: p, ...(label ? { label } : {}) }] })
  }
  return { full, add }
}

/** A typed size, in the panel: text fields do not belong inside a menu. */
export function CustomSize() {
  const { full, add } = useAddFrame()
  const [w, setW] = React.useState("1024")
  const [h, setH] = React.useState("768")
  const typed = sizeProblem(Number(w), Number(h))
  const valid = /^\d{3,4}$/.test(w) && /^\d{3,4}$/.test(h)
  return (
    <div className="grid gap-1.5" id="custom-size">
      <span className="text-xs font-medium">Custom size</span>
      <div className="flex items-center gap-1.5">
        <Input aria-label="Custom width" value={w} onChange={(e) => setW(e.target.value)} className="h-7 w-20 text-xs tabular-nums" inputMode="numeric" />
        <span className="text-xs text-muted-foreground">×</span>
        <Input aria-label="Custom height" value={h} onChange={(e) => setH(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && add(Number(w), Number(h))} className="h-7 w-20 text-xs tabular-nums" inputMode="numeric" />
        <Button size="sm" className="h-7" disabled={!valid || full} onClick={() => add(Number(w), Number(h))}>Add</Button>
      </div>
      {valid && typed && <span className="text-[11px] text-muted-foreground">{typed}</span>}
    </div>
  )
}

/** Add a frame from the adapter's profiles, devices and the shell's device list; Custom size opens the panel's fields. */
export function AddFrame({ compact }: { compact?: boolean }) {
  const { s } = useResponsive()
  const { full, add } = useAddFrame()
  const custom = () => {
    s.set({ panelOpen: true, mobilePanel: s.mobilePanel ? "panel" : null })
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Custom width"]')?.focus(), 80)
  }
  const devices = [...(adapter.axes.responsive?.devices ?? []), ...SHELL_DEVICES].filter((d, i, list) => list.findIndex((x) => x.w === d.w && x.h === d.h) === i && !adapter.axes.profiles.some((p) => p.w === d.w && p.h === d.h))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" className={cn(!compact && "w-full")} disabled={full} title={full ? `A layout holds at most ${MAX_FRAMES} frames` : undefined} />}>
        <PlusIcon /> Add frame {!compact && <ChevronDownIcon className="ml-auto" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Profiles</DropdownMenuLabel>
          {adapter.axes.profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => add(p.w, p.h, p.kind, undefined, p.id)}>
              {p.label}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{p.w} × {p.h}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Devices</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            {devices.map((d) => {
              const problem = sizeProblem(d.w, d.h)
              return (
                <DropdownMenuItem key={`${d.w}x${d.h}`} disabled={!!problem} title={problem ?? undefined} onClick={() => add(d.w, d.h, d.kind, d.label, d.profile)}>
                  {d.label ?? kindLabel[d.kind]}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{d.w} × {d.h}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={custom}>Custom size…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ---------------- stage ---------------- */

/** One scale for the whole row: the largest that fits every column and the tallest frame, never above 100%. */
function rowScale(frames: { w: number; h: number }[], boxW: number, boxH: number, widthOnly: boolean) {
  const gaps = GAP * (frames.length - 1)
  const fits = (k: number) => frames.reduce((t, f) => t + Math.max(f.w * k, MIN_COLUMN), 0) + gaps <= boxW
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  const maxH = Math.max(...frames.map((f) => f.h))
  const k = widthOnly ? lo : Math.min(lo, (boxH - LABEL_H) / maxH)
  return Math.max(FLOOR, Math.min(1, k))
}

/** For loop detection: the frame height before the last change, the height the content was measured at, and that content. */
type Tracked = { prevFrameH: number; frameH: number; contentH: number; tracking: number }

export function FrameCard({ frame, index, count, scale, shownScale, canvas, wrapLabel, selected, narrow, onStatus, status, dragging, onDragStart, labelRef }: {
  frame: ResponsiveFrame
  index: number
  count: number
  /** The scale the preview renders at. On the canvas this is 1 and the canvas zoom scales it. */
  scale: number
  /** The scale on screen, for the resize handles; defaults to `scale`. */
  shownScale?: number
  /** On the canvas: the frame is exactly its size, and the label is placed by the canvas so it never scales. */
  canvas?: boolean
  wrapLabel?: (label: React.ReactNode) => React.ReactNode
  selected?: boolean
  narrow?: boolean
  onStatus: (id: string, st: LiveStatus | null) => void
  status: LiveStatus | null
  dragging: boolean
  onDragStart: (e: React.PointerEvent, id: string) => void
  labelRef: (el: HTMLElement | null) => void
}) {
  const { s, r, set } = useResponsive()
  const sc = s.scenarioObj
  const prof = profileOf(frame.profile)
  const live = !!adapter.frameEntry
  const [nonce, setNonce] = React.useState(0)
  const [frozen, setFrozen] = React.useState<{ scale: number } | null>(null)
  const shown = canvas ? scale : (frozen?.scale ?? scale)
  const onScreen = canvas ? (shownScale ?? 1) : shown
  // Full page: the frame follows the content, unless the page sizes itself to the frame.
  const track = React.useRef<Tracked>({ prevFrameH: frame.h, frameH: frame.h, contentH: 0, tracking: 0 })
  const full = r.height === "full"
  // A detected loop belongs to this scenario, theme and frame in full-page mode; anything else starts fresh.
  const loopKey = `${full}:${s.scenario}:${s.theme}:${frame.id}:${frame.h}:${r.resetNonce}`
  const [loopAt, setLoopAt] = React.useState<string | null>(null)
  const loop = loopAt === loopKey
  const canMeasure = live && status?.capabilities.includes("content-size")
  let h = frame.h
  let cut = false
  let note: string | undefined
  if (full && live) {
    const c = status?.contentHeight
    if (!canMeasure) note = "This preview's frame client does not report its height; showing the screen height."
    else if (loop) note = "This page sizes itself to the window (100vh or script), so it has no full-page height; showing the screen height."
    else if (c) {
      h = Math.max(frame.h, Math.min(c, FULL_PAGE_MAX))
      cut = c > FULL_PAGE_MAX
    }
  }
  React.useEffect(() => {
    track.current = { prevFrameH: frame.h, frameH: frame.h, contentH: 0, tracking: 0 }
  }, [loopKey, frame.h])
  React.useEffect(() => {
    if (!full || !live) {
      track.current = { prevFrameH: frame.h, frameH: frame.h, contentH: 0, tracking: 0 }
      return
    }
    const t = track.current
    const c = status?.contentHeight
    if (!c || loop || c === t.contentH) return
    // The content grew by exactly what the frame grew before it was measured: the page tracks the window.
    const frameGrowth = t.frameH - t.prevFrameH
    const contentGrowth = c - t.contentH
    t.tracking = t.contentH && frameGrowth > 0 && Math.abs(contentGrowth - frameGrowth) <= 2 ? t.tracking + 1 : 0
    t.prevFrameH = t.frameH
    t.frameH = Math.max(frame.h, Math.min(c, FULL_PAGE_MAX))
    t.contentH = c
    if (t.tracking >= 2) setLoopAt(loopKey)
  }, [full, live, status?.contentHeight, frame.h, loop, loopKey])
  const capture = !live && sc ? captureFor(sc, s.theme, frame.profile) : undefined
  const unavailable = !live && (!capture || capture.w !== frame.w || capture.h !== frame.h)
  const problem = sizeProblem(frame.w, frame.h)
  const setFrame = (patch: Partial<ResponsiveFrame>) => set({ frames: r.frames.map((f) => (f.id === frame.id ? { ...f, ...patch } : f)) })
  const w = Math.round(frame.w * shown)
  const stateBadge = !status ? null : status.status === "loading" ? <StatusBadge kind="loading">Loading</StatusBadge> : status.status === "error" ? <StatusBadge kind="unresolved">Did not start</StatusBadge> : status.modified ? <StatusBadge kind="modified">Modified</StatusBadge> : null
  const preview =
    problem || unavailable ? (
      <PreviewFrame w={frame.w} h={frame.h} scale={shown} phone={prof.kind === "phone"} empty={{ title: `No ${live ? "preview" : "capture"} at ${frame.w} × ${frame.h}`, description: problem ?? `This Studio shows recorded captures only, and ${prof.label} in this theme was ${capture ? `recorded at ${capture.w} × ${capture.h}` : "never recorded"}. Nothing is substituted.` }} />
    ) : (
      <ScenarioPreview
        scenario={s.scenario}
        theme={s.theme}
        profile={frame.profile}
        size={{ w: frame.w, h }}
        values={s.values}
        draft={s.viewDraft(s.theme)}
        resetNonce={r.resetNonce * 1000 + nonce}
        scale={shown}
        label={`${frame.w} × ${frame.h} preview`}
        onStatus={(st) => onStatus(frame.id, st)}
      />
    )
  const label = (
      <figcaption className={cn("flex h-7 min-w-0 items-center gap-1 rounded-lg bg-background/92 pr-0.5 pl-1 text-xs shadow-sm backdrop-blur", canvas && "w-max", selected && "ring-2 ring-(--anchor)")} style={canvas ? { maxWidth: Math.max(frame.w * (shownScale ?? 1), 132) } : undefined} data-frame-caption={frame.id}>
        <button
          ref={labelRef}
          type="button"
          className="flex min-w-0 flex-1 cursor-grab items-center gap-1 rounded px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={`${frame.w} by ${frame.h}, counts as ${prof.label}, frame ${index + 1} of ${count}. Drag, or Alt and an arrow key, to move it.`}
          onPointerDown={(e) => onDragStart(e, frame.id)}
          data-frame-label
        >
          <GripVerticalIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium tabular-nums whitespace-nowrap">{frame.w} × {frame.h}</span>
          <span className="min-w-0 truncate text-muted-foreground">{frame.label ?? (prof.w === frame.w && prof.h === frame.h ? prof.label : `counts as ${prof.label}`)}</span>
        </button>
        {full && live && !note && <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">Full page</Badge>}
        {stateBadge}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${frame.w} by ${frame.h} frame actions`} />}>
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Counts as {prof.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={frame.profile} onValueChange={(v) => setFrame({ profile: v as string })}>
                  {adapter.axes.profiles.map((p) => <DropdownMenuRadioItem key={p.id} value={p.id}>{p.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => setNonce((n) => n + 1)}><RotateCcwIcon /> Reset this frame</DropdownMenuItem>
            <DropdownMenuItem onClick={() => s.set({ view: "inspect", profile: frame.profile, size: prof.w === frame.w && prof.h === frame.h ? null : { w: frame.w, h: frame.h }, preview: { ...s.preview, status: "loading" } })}>Open in Inspect at this size</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={count === 1} onClick={() => removeFrame(set, r.frames, frame.id)}><XIcon /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </figcaption>
  )
  return (
    <figure className={cn("m-0 flex shrink-0 flex-col gap-2 transition-opacity", dragging && "opacity-60")} style={{ width: canvas ? frame.w : narrow ? w : Math.max(w, MIN_COLUMN) }} data-frame={frame.id}>
      {wrapLabel ? wrapLabel(label) : label}
      {adapter.axes.resizable && live && !problem && !narrow ? (
        <ResizeHandles
          w={frame.w}
          h={h}
          scale={onScreen}
          onDragChange={setFrozen}
          control={{ profile: frame.profile, centred: false, label: `${frame.w} by ${frame.h} frame`, setSize: (size) => setFrame(size ?? { w: prof.w, h: prof.h }), setProfile: (id) => { const p = profileOf(id); setFrame({ profile: id, w: p.w, h: p.h }) } }}
        >
          {preview}
        </ResizeHandles>
      ) : (
        preview
      )}
      {(note || cut) && <p className="text-[11px] leading-snug text-stage-muted" style={{ width: canvas ? frame.w : Math.max(w, MIN_COLUMN), fontSize: canvas ? 11 / (shownScale ?? 1) : undefined }}>{note ?? `Cut at ${FULL_PAGE_MAX.toLocaleString()} px; the page is ${status?.contentHeight?.toLocaleString()} px tall.`}</p>}
    </figure>
  )
}

export function ResponsiveStage({ narrow }: { narrow?: boolean }) {
  const { s, r, set, arrange } = useResponsive()
  const onCanvas = r.arrangement === "canvas" && !narrow
  const box = React.useRef<HTMLDivElement>(null)
  const [dims, setDims] = React.useState({ w: 1200, h: 800 })
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth - 48, h: el.clientHeight - 48 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [statuses, setStatuses] = React.useState<Record<string, LiveStatus | null>>({})
  const onStatus = React.useCallback((id: string, st: LiveStatus | null) => setStatuses((m) => (JSON.stringify(m[id]) === JSON.stringify(st) ? m : { ...m, [id]: st })), [])
  // Details and the header read one status for the set of frames.
  const setStudio = s.set
  const live = r.frames.map((f) => statuses[f.id]).filter(Boolean) as LiveStatus[]
  const summary = !adapter.frameEntry ? "static" : live.some((x) => x.status === "loading") || live.length < r.frames.length ? "loading" : live.some((x) => x.status === "error") ? "error" : "ready"
  const anyModified = live.some((x) => x.modified)
  React.useEffect(() => setStudio({ preview: { status: summary, modified: anyModified, canGoBack: false } }), [setStudio, summary, anyModified])

  // Where the row shows each frame, so switching to the canvas moves nothing.
  const lastRow = React.useRef<{ positions: Record<string, { x: number; y: number }>; viewport: { x: number; y: number; zoom: number } } | null>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el || onCanvas) return
    const b = el.getBoundingClientRect()
    const rects = r.frames.map((f) => [f.id, el.querySelector(`[data-frame="${f.id}"] .preview-frame`)?.getBoundingClientRect()] as const)
    const first = rects[0]?.[1]
    if (!first) return
    const k = first.width / r.frames[0].w
    lastRow.current = {
      positions: Object.fromEntries(rects.filter(([, rc]) => rc).map(([id, rc]) => [id, { x: (rc!.left - first.left) / k, y: (rc!.top - first.top) / k }])),
      viewport: { x: first.left - b.left, y: first.top - b.top, zoom: k },
    }
  })
  const widest = Math.max(...r.frames.map((f) => f.w))
  const fit = narrow ? Math.max(0.05, Math.min(1, dims.w / widest)) : rowScale(r.frames, dims.w, dims.h, r.height === "full")
  const scale = s.zoom === "fit" ? fit : s.zoom / 100
  const ready = live.filter((x) => x.status === "ready").length

  // Reorder by dragging a frame's label across its neighbours.
  const labels = React.useRef(new Map<string, HTMLElement>())
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [said, setSaid] = React.useState("")
  const [refocus, setRefocus] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (refocus) labels.current.get(refocus)?.focus({ preventScroll: true })
  }, [refocus, r.frames])
  const moveTo = (id: string, to: number) => {
    const i = r.frames.findIndex((f) => f.id === id)
    const j = Math.max(0, Math.min(r.frames.length - 1, to))
    if (i === j || i < 0) return
    const next = [...r.frames]
    const [f] = next.splice(i, 1)
    next.splice(j, 0, f)
    set({ frames: next })
    setSaid(`Moved ${f.w} by ${f.h} to position ${j + 1} of ${next.length}`)
    setRefocus(id)
  }
  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      moved = true
      setDragging(id)
      const others = [...document.querySelectorAll<HTMLElement>("[data-frame]")]
      const over = others.find((el) => {
        const b = el.getBoundingClientRect()
        return el.dataset.frame !== id && (narrow ? ev.clientY > b.top && ev.clientY < b.bottom : ev.clientX > b.left && ev.clientX < b.right)
      })
      if (over) moveTo(id, r.frames.findIndex((f) => f.id === over.dataset.frame))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setDragging(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-frame]")
    if (!el || !e.altKey || !(e.target as HTMLElement).hasAttribute("data-frame-label")) return
    const back = narrow ? "ArrowUp" : "ArrowLeft"
    const fwd = narrow ? "ArrowDown" : "ArrowRight"
    if (e.key !== back && e.key !== fwd) return
    e.preventDefault()
    const i = r.frames.findIndex((f) => f.id === el.dataset.frame)
    moveTo(el.dataset.frame!, i + (e.key === back ? -1 : 1))
  }

  return (
    <div className="stage-surface relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-3">
        <div role="toolbar" aria-label="Responsive controls" className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-[var(--dock-shadow)] backdrop-blur-md">
          <span className="px-2 text-xs font-medium">{r.name}{r.dirty ? " · unsaved" : ""}</span>
          <ToggleGroup value={[r.height]} onValueChange={(v) => v[0] && set({ height: v[0] as "screen" | "full" })} size="sm" spacing={0} aria-label="Frame height">
            <ToggleGroupItem value="screen" className="text-xs">Screen</ToggleGroupItem>
            <ToggleGroupItem value="full" className="text-xs">Full page</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup value={[r.arrangement]} onValueChange={(v) => v[0] && arrange(v[0] as "row" | "canvas")} size="sm" spacing={0} aria-label="Arrangement">
            <ToggleGroupItem value="row" className="text-xs">Row</ToggleGroupItem>
            <ToggleGroupItem value="canvas" className="text-xs" disabled={narrow}>Canvas</ToggleGroupItem>
          </ToggleGroup>
          <AddFrame compact />
          <Button variant="ghost" size="sm" onClick={() => set({ resetNonce: r.resetNonce + 1 }, false)}><RotateCcwIcon /> Reset all</Button>
        </div>
      </div>
      {r.arrangement === "canvas" && narrow && <p className="px-4 pt-2 text-center text-xs text-stage-muted">This layout is a canvas. The canvas opens on wider screens; here its frames stack.</p>}
      {onCanvas ? (
        <div ref={box} className="relative min-h-0 flex-1">
          <React.Suspense fallback={<p className="p-6 text-center text-xs text-stage-muted">Opening the canvas…</p>}>
            <Canvas statuses={statuses} onStatus={onStatus} rowPlacement={() => lastRow.current} onAnnounce={setSaid} />
          </React.Suspense>
        </div>
      ) : (
      <div ref={box} className="flex min-h-0 flex-1 overflow-auto p-6" onKeyDown={onKey}>
        <div className={cn("m-auto flex w-max items-start", narrow ? "flex-col" : "flex-row")} style={{ gap: GAP }}>
          {r.frames.map((f, i) => (
            <FrameCard key={f.id} frame={f} index={i} count={r.frames.length} scale={scale} narrow={narrow} status={statuses[f.id] ?? null} onStatus={onStatus} dragging={dragging === f.id} onDragStart={start} labelRef={(el) => { if (el) labels.current.set(f.id, el); else labels.current.delete(f.id) }} />
          ))}
        </div>
      </div>
      )}
      <div className="pointer-events-none flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
        {!narrow && <StageControls variant="dock" lookOnly noZoom={onCanvas} />}
        {!onCanvas && <span className="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-background/92 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur" aria-label="Scale">
          <span className="tabular-nums">{r.frames.length} frames{adapter.frameEntry ? ` · ${ready} ready` : ""} · one scale, {Math.abs(scale - 1) < 0.005 ? "actual size" : `${Math.round(scale * 100)}%`}</span>
          <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs" onClick={() => s.set({ zoom: Math.abs(scale - 1) < 0.005 ? "fit" : 100 })} aria-label={Math.abs(scale - 1) < 0.005 ? "Fit to the stage" : "Show at actual size"}>
            {Math.abs(scale - 1) < 0.005 ? "Fit" : "100%"}
          </Button>
        </span>}
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  )
}
