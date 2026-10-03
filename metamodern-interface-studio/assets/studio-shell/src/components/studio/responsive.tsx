/*
 * The Responsive view: one scenario at several sizes, each frame its own live
 * runtime, at one shared scale so relative sizes are true. Layouts come from
 * presets (read only) or the Studio's layouts.json; edits stay in this browser
 * until saved. Frames are reordered, resized, added and removed here.
 */
import * as React from "react"
import { toast } from "sonner"
import { ChevronDownIcon, EllipsisIcon, GripVerticalIcon, LayoutGridIcon, PlusIcon, Undo2Icon, RotateCcwIcon, SaveIcon, XIcon } from "lucide-react"
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
import { canSaveLayouts, captureFor, PRESETS, useStudio, type State } from "@/store"
import { FULL_PAGE_MAX, frameId, MAX_FRAMES, nearestProfile, SHELL_DEVICES, slug, validateLayouts, type PresetFrame, type ResponsiveFrame, type ResponsiveLayout, type SyncChannels } from "@/studio/layouts"
import type { LivePreviewHandle, LiveStatus } from "@/studio/live-preview"
import type { SyncEvent } from "@/studio/protocol"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PreviewFrame, StatusBadge } from "./bits"
import { profileOf, ScenarioPreview } from "./preview"
import { ResizeHandles } from "./resize-handles"
import { StageControls } from "./chrome"
import { StageNav, useStageNav } from "./stage-nav"

const GAP = 32
const LABEL_H = 36
const MIN_COLUMN = 148
const FLOOR = 0.2
/** Placed frames snap to 8 px at 100%, as on the canvas. */
const SNAP = 8
const snap = (v: number) => Math.round(v / SNAP) * SNAP
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

/**
 * Sync between the frames of a layout: each frame registers its preview, reports its interactions,
 * and shows when it could not follow. The Studio relays only between frames of this layout.
 */
type SyncState = {
  channels: SyncChannels
  register: (id: string, handle: LivePreviewHandle | null) => void
  interaction: (from: string, event: SyncEvent) => void
  out: Record<string, string>
}
const SyncContext = React.createContext<SyncState | null>(null)

/** Why the dev server's layouts cannot be saved yet, by how far layouts.json has been read. */
const NOT_SAVABLE: Record<Exclude<State["layoutsLoad"], "ready">, string> = {
  loading: "Loading layouts…",
  unreadable: "layouts.json is not a valid layouts file (a merge conflict, say). Fix or remove it, then reload the Studio to save.",
  failed: "The saved layouts could not be read. Reload the Studio to save.",
}
const channelOf = (e: SyncEvent): keyof SyncChannels => (e.kind === "scroll" ? "scroll" : e.kind === "navigate" ? "navigation" : "interaction")
const capOf = { scroll: "sync-scroll", interaction: "sync-interaction", navigation: "sync-navigation" } as const

function useResponsive() {
  const s = useStudio()
  const r = s.responsive
  const set = (patch: Partial<typeof r>, dirty = true) => s.set((st) => ({ responsive: { ...st.responsive, ...patch, dirty: dirty || st.responsive.dirty } }))
  const all = [...PRESETS, ...s.saved]
  const isSaved = s.saved.some((l) => l.id === r.layout)
  const toLayout = (id: string, name: string): ResponsiveLayout => ({ id, name, frames: r.frames, arrangement: r.arrangement, height: r.height, ...(r.viewport ? { viewport: r.viewport } : {}), sync: r.sync })
  /*
   * Sent with the revision of layouts.json this page last read or wrote. When the file changed elsewhere since, the
   * dev server writes nothing and answers the file as it now is: the list shows that, the working layout keeps its
   * unsaved edits, and the person is told.
   */
  const blocked = !canSaveLayouts ? "Saving needs the local Studio (npm run dev). A published Studio reads its saved layouts but cannot change them." : s.layoutsLoad === "ready" ? null : NOT_SAVABLE[s.layoutsLoad]
  const persist = async (next: ResponsiveLayout[]) => {
    // Until the page has read layouts.json (and its revision) a save could overwrite a change it never saw.
    if (blocked) throw new Error(blocked)
    const revision = s.layoutsRevision
    const res = await fetch("__studio/layouts", { method: "POST", headers: { "content-type": "application/json", ...(revision ? { "x-studio-expected-revision": revision } : {}) }, body: JSON.stringify({ schema: "studio-layouts/1", layouts: next }) })
    const body = res.ok ? null : await res.json().catch(() => ({}))
    if (res.status === 409) {
      // data is null when layouts.json no longer reads as JSON (a merge conflict, say): the list stays as it is.
      const latest = body?.current
      const readable = !!latest && !validateLayouts(latest.data).length
      if (latest && typeof latest.revision === "string") s.set(readable ? { saved: latest.data.layouts, layoutsRevision: latest.revision } : { layoutsRevision: latest.revision, layoutsLoad: "unreadable" })
      throw new Error(readable ? "Saved layouts changed elsewhere. The latest is loaded; your change was not saved." : "layouts.json changed elsewhere and is not a valid layouts file. Your change was not saved.")
    }
    if (!res.ok) throw new Error(body.error ?? `The Studio refused the save (${res.status})`)
    s.set({ saved: next, layoutsRevision: res.headers.get("x-studio-revision") })
  }
  const open = (layout: ResponsiveLayout) => {
    const before = r
    s.set({ responsive: { layout: layout.id, name: layout.name, frames: layout.frames.map((f) => ({ ...f })), arrangement: layout.arrangement, height: layout.height, viewport: layout.viewport, sync: layout.sync ?? before.sync, dirty: false, resetNonce: before.resetNonce } })
    if (before.dirty) toast(`Unsaved changes to ${before.name} were set aside`, { action: { label: "Undo", onClick: () => s.set({ responsive: before }) } })
  }
  /** Row keeps the canvas order, read left to right, then top to bottom, as a clean row. */
  const arrange = (a: "row" | "canvas") => {
    if (a === r.arrangement) return
    if (a === "row") set({ arrangement: "row", frames: [...r.frames].sort((x, y) => (x.x ?? 0) - (y.x ?? 0) || (x.y ?? 0) - (y.y ?? 0)).map(({ x: _x, y: _y, ...f }) => (void _x, void _y, f)) })
    // Each frame starts where it sits in the row, at the row's scale.
    else set({ arrangement: "canvas", viewport: undefined, frames: r.frames.map(({ x: _x, y: _y, ...f }) => (void _x, void _y, f)) })
  }
  return { s, r, set, all, isSaved, toLayout, persist, blocked, open, arrange }
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
  const { s, r, isSaved, toLayout, persist, blocked, open, all } = useResponsive()
  const why = blocked ?? undefined
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
  // One save at a time: a second click would otherwise be refused against the first one's write.
  const [saving, setSaving] = React.useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await persist(s.saved.map((l) => (l.id === r.layout ? toLayout(l.id, l.name) : l)))
      s.set({ responsive: { ...r, dirty: false } })
      toast.success(`Saved ${r.name}`)
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
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
          <Button size="sm" variant="outline" disabled={!!why || !r.dirty || saving} title={why} onClick={save}>
            <SaveIcon /> Save
          </Button>
        )}
        <SaveAs title="Save as a new layout" initial={isSaved ? `${r.name} copy` : `${r.name} (mine)`} onSave={saveAs} trigger={<Button size="sm" variant={isSaved ? "ghost" : "outline"} disabled={!!why} title={why}>{isSaved ? "Save as" : <><SaveIcon /> Save as</>}</Button>} />
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
              <DropdownMenuItem disabled={!!why} onClick={() => { const name = window.prompt("Rename the layout", r.name)?.trim(); if (name) rename(name).catch((e) => toast.error("Not renamed", { description: e instanceof Error ? e.message : String(e) })) }}>Rename</DropdownMenuItem>
              <DropdownMenuItem disabled={!!why} onClick={() => saveAs(`${r.name} copy`).catch((e) => toast.error("Not duplicated", { description: e instanceof Error ? e.message : String(e) }))}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!!why} onClick={remove}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {why && <p className="text-[11px] text-muted-foreground">{why}</p>}
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
      <SyncSwitches />
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

/** Scroll, clicks and typing, and navigation follow across frames; all on for a new layout. */
function SyncSwitches() {
  const { s, r, set } = useResponsive()
  const nav = s.frameCaps.includes("sync-navigation")
  const all = r.sync.scroll || r.sync.interaction || r.sync.navigation
  const row = (key: keyof SyncChannels, label: string, note?: string) => (
    <Field orientation="horizontal" className="items-start">
      <Switch id={`sync-${key}`} checked={r.sync[key]} onCheckedChange={(v) => set({ sync: { ...r.sync, [key]: v } })} />
      <div className="grid gap-0.5">
        <FieldLabel htmlFor={`sync-${key}`} className="text-xs font-normal">{label}</FieldLabel>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>
    </Field>
  )
  return (
    <SidebarGroup className="gap-2 border-t px-3 py-3">
      <div className="flex items-center">
        <span className="text-xs font-medium">Sync</span>
        <Button variant="ghost" size="xs" className="ml-auto h-6 text-xs" onClick={() => set({ sync: all ? { scroll: false, interaction: false, navigation: false } : { scroll: true, interaction: true, navigation: true } })}>{all ? "All sync off" : "All sync on"}</Button>
      </div>
      {row("scroll", "Scroll")}
      {row("interaction", "Clicks and typing", "Passwords, files and private fields are never sent.")}
      {row("navigation", "Navigation", nav || !s.frameCaps.length ? undefined : "Unavailable here: this product's preview cannot navigate on request, so navigation follows only through synced clicks.")}
    </SidebarGroup>
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
  const syncCtx = React.useContext(SyncContext)
  const anySync = !!syncCtx && (syncCtx.channels.scroll || syncCtx.channels.interaction || syncCtx.channels.navigation)
  const missing = anySync && live && status?.status === "ready" ? (Object.keys(capOf) as (keyof SyncChannels)[]).filter((k) => syncCtx!.channels[k] && k !== "navigation" && !status.capabilities.includes(capOf[k])) : []
  const syncBadge = syncCtx?.out[frame.id] ? (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" role="status" aria-label={`Out of sync: ${syncCtx.out[frame.id]}`} />}><StatusBadge kind="unresolved">Out of sync</StatusBadge></TooltipTrigger>
      <TooltipContent>{syncCtx.out[frame.id]}. Reset all brings every frame back together.</TooltipContent>
    </Tooltip>
  ) : missing.length ? (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" role="status" aria-label={`Not synced: this preview's ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not followed`} />}><Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px] text-warning">Not synced</Badge></TooltipTrigger>
      <TooltipContent>This preview does not take part in sync: its frame client predates sync, or the product keeps it out. Its {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} not followed. If it predates sync, update the Studio so the preview entry picks up the new frame client.</TooltipContent>
    </Tooltip>
  ) : null
  const register = syncCtx?.register
  const handleRef = React.useCallback((h: LivePreviewHandle | null) => register?.(frame.id, h), [register, frame.id])
  const onInteraction = React.useCallback((e: SyncEvent) => syncCtx?.interaction(frame.id, e), [syncCtx, frame.id])
  const stateBadge = !status ? null : status.status === "loading" ? <StatusBadge kind="loading">Loading</StatusBadge> : status.status === "error" ? <StatusBadge kind="unresolved">Did not start</StatusBadge> : status.modified ? <StatusBadge kind="modified">Modified</StatusBadge> : null
  const preview =
    problem || unavailable ? (
      <PreviewFrame w={frame.w} h={frame.h} scale={shown} profile={prof} empty={{ title: `No ${live ? "preview" : "capture"} at ${frame.w} × ${frame.h}`, description: problem ?? `This Studio shows recorded captures only, and ${prof.label} in this theme was ${capture ? `recorded at ${capture.w} × ${capture.h}` : "never recorded"}. Nothing is substituted.` }} />
    ) : (
      <ScenarioPreview
        ref={handleRef}
        sync={syncCtx ? { channels: syncCtx.channels, onInteraction } : undefined}
        scenario={s.scenario}
        theme={s.theme}
        profile={frame.profile}
        size={{ w: frame.w, h }}
        values={s.values}
        props={s.edits}
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
        {syncBadge}
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
    <figure className={cn("m-0 flex shrink-0 flex-col gap-2 transition-opacity", dragging && "opacity-80")} style={{ width: canvas ? frame.w : narrow ? w : Math.max(w, MIN_COLUMN) }} data-frame={frame.id}>
      {wrapLabel ? wrapLabel(label) : label}
      {adapter.axes.resizable && live && !problem && !narrow ? (
        <ResizeHandles
          w={frame.w}
          h={h}
          scale={onScreen}
          zoomed={canvas}
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
  // Sync: relay each interaction to every other frame that can follow it; say which could not.
  const handles = React.useRef(new Map<string, LivePreviewHandle>())
  const [out, setOut] = React.useState<{ key: string; frames: Record<string, string> }>({ key: "", frames: {} })
  const outKey = `${s.scenario}:${s.theme}:${r.resetNonce}:${r.frames.map((f) => f.id).join()}`
  const outNow = React.useMemo(() => (out.key === outKey ? out.frames : {}), [out, outKey])
  const statusesRef = React.useRef(statuses)
  React.useLayoutEffect(() => {
    statusesRef.current = statuses
  })
  const sync = React.useMemo<SyncState>(
    () => ({
      channels: r.sync,
      out: outNow,
      register: (id, h) => {
        if (h) handles.current.set(id, h)
        else handles.current.delete(id)
      },
      interaction: (from, event) => {
        const channel = channelOf(event)
        if (!r.sync[channel]) return
        for (const f of r.frames) {
          if (f.id === from) continue
          const st = statusesRef.current[f.id]
          const h = handles.current.get(f.id)
          if (!h || !st || st.status !== "ready" || !st.capabilities.includes(capOf[channel])) continue
          h.replay(event).then((res) => {
            if (!res.ok) setOut((o) => ({ key: outKey, frames: { ...(o.key === outKey ? o.frames : {}), [f.id]: res.reason ?? "It could not follow" } }))
          })
        }
      },
    }),
    [r.sync, r.frames, outNow, outKey]
  )
  const setStudioCaps = s.set
  const caps = [...new Set(Object.values(statuses).flatMap((x) => x?.capabilities ?? []))].sort().join()
  React.useEffect(() => setStudioCaps({ frameCaps: caps ? (caps.split(",") as State["frameCaps"]) : [] }), [setStudioCaps, caps])

  // A row whose frames were dragged holds them where they were dropped (x, y at 100%); a clean row flows.
  const placed = !narrow && !onCanvas && r.frames.some((f) => f.x !== undefined)
  const widest = Math.max(...r.frames.map((f) => f.w))
  const fit = narrow
    ? Math.max(0.05, Math.min(1, dims.w / widest))
    : placed
      ? Math.max(FLOOR, Math.min(1, dims.w / Math.max(...r.frames.map((f) => (f.x ?? 0) + f.w)), r.height === "full" ? 9 : (dims.h - LABEL_H) / Math.max(...r.frames.map((f) => (f.y ?? 0) + f.h))))
      : rowScale(r.frames, dims.w, dims.h, r.height === "full")
  const scale = s.zoom === "fit" ? fit : s.zoom / 100
  const nav = useStageNav(box, scale, { enabled: !onCanvas })
  const [canvasPct, setCanvasPct] = React.useState(100)
  const tidy = React.useRef<(() => void) | null>(null)

  // Drag a frame by its label to place it anywhere; on a phone, where frames stack, dragging reorders.
  const labels = React.useRef(new Map<string, HTMLElement>())
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [drag, setDrag] = React.useState<{ id: string; x: number; y: number } | null>(null)
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
  /** Every frame's place at 100% (its label's top-left), read from where it sits on the stage now, so placing moves nothing. */
  const readPlaces = () => {
    const el = box.current!
    const b = el.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const ox = b.left + pad - el.scrollLeft
    const oy = b.top + pad - el.scrollTop
    return Object.fromEntries(
      r.frames.map((f) => {
        const at = el.querySelector(`[data-frame="${f.id}"]`)?.getBoundingClientRect()
        return [f.id, { x: snap(Math.max(0, (at?.left ?? ox) - ox) / scale), y: snap(Math.max(0, (at?.top ?? oy) - oy) / scale) }]
      })
    )
  }
  /** Commit places. A frame dragged past the top or left edge shifts every frame back into view, and the stage scrolls by the shift so nothing jumps. */
  const commit = (places: Record<string, { x: number; y: number }>, announce: string) => {
    const minX = Math.min(0, ...Object.values(places).map((p) => p.x))
    const minY = Math.min(0, ...Object.values(places).map((p) => p.y))
    set({ frames: r.frames.map((f) => ({ ...f, x: places[f.id].x - minX, y: places[f.id].y - minY })) })
    if (minX || minY) requestAnimationFrame(() => box.current?.scrollBy(-minX * scale, -minY * scale))
    setSaid(announce)
  }
  const scaleRef = React.useRef(scale)
  React.useLayoutEffect(() => {
    scaleRef.current = scale
  })
  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    // The pointer stays with the label, so a release over a frame's page still ends the drag here.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Without capture the frames' pointer shield below still keeps the page from taking the release.
    }
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    let base: Record<string, { x: number; y: number }> | null = null
    let at = { x: 0, y: 0 }
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      moved = true
      setDragging(id)
      if (narrow) {
        const over = [...document.querySelectorAll<HTMLElement>("[data-frame]")].find((el) => {
          const b = el.getBoundingClientRect()
          return el.dataset.frame !== id && ev.clientY > b.top && ev.clientY < b.bottom
        })
        if (over) moveTo(id, r.frames.findIndex((f) => f.id === over.dataset.frame))
        return
      }
      // The first move turns a flowing row into placed frames exactly where they are, and holds the zoom
      // where it is: Fit would shrink everything as the frames spread, so the stage grows and scrolls instead.
      if (!base) {
        if (s.zoom === "fit") s.set({ zoom: Math.round(scaleRef.current * 1000) / 10 })
        base = placed ? Object.fromEntries(r.frames.map((f) => [f.id, { x: f.x ?? 0, y: f.y ?? 0 }])) : readPlaces()
        if (!placed) set({ frames: r.frames.map((f) => ({ ...f, ...base![f.id] })) })
      }
      const k = scaleRef.current
      at = { x: snap(base[id].x + (ev.clientX - x0) / k), y: snap(base[id].y + (ev.clientY - y0) / k) }
      setDrag({ id, ...at })
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      setDragging(null)
      setDrag(null)
      if (!moved || narrow || !base) return
      const f = r.frames.find((x) => x.id === id)!
      commit({ ...base, [id]: at }, `Moved ${f.w} by ${f.h}`)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-frame]")
    if (!el || !e.altKey || !(e.target as HTMLElement).hasAttribute("data-frame-label")) return
    const id = el.dataset.frame!
    if (!narrow) {
      // Alt and an arrow moves the frame 8 px at 100%, or 64 with Shift.
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!dir) return
      e.preventDefault()
      const places = placed ? Object.fromEntries(r.frames.map((f) => [f.id, { x: f.x ?? 0, y: f.y ?? 0 }])) : readPlaces()
      const step = e.shiftKey ? 64 : SNAP
      const f = r.frames.find((x) => x.id === id)!
      commit({ ...places, [id]: { x: places[id].x + dir[0] * step, y: places[id].y + dir[1] * step } }, `Moved ${f.w} by ${f.h} to ${places[id].x + dir[0] * step}, ${places[id].y + dir[1] * step}`)
      setRefocus(id)
      return
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    const i = r.frames.findIndex((f) => f.id === id)
    moveTo(id, i + (e.key === "ArrowUp" ? -1 : 1))
  }
  // A placed row's content starts at the stage's top-left and is as large as its frames reach, so the stage scrolls to every one.
  const content = React.useRef<HTMLDivElement>(null)
  const [extent, setExtent] = React.useState({ w: 0, h: 0 })
  React.useLayoutEffect(() => {
    const el = content.current
    if (!el || !placed) return
    const measure = () => {
      const kids = [...el.children] as HTMLElement[]
      const w = Math.ceil(Math.max(0, ...kids.map((c) => c.offsetLeft + c.offsetWidth)))
      const h = Math.ceil(Math.max(0, ...kids.map((c) => c.offsetTop + c.offsetHeight)))
      setExtent((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    // Full-page frames grow after they load; the content grows with them.
    const ro = new ResizeObserver(measure)
    for (const c of el.children) ro.observe(c)
    return () => ro.disconnect()
  }, [placed, r.frames, scale, drag])
  const placeOf = (f: ResponsiveFrame) => (drag?.id === f.id ? drag : { x: f.x ?? 0, y: f.y ?? 0 })
  const backToRow = () => {
    set({ frames: [...r.frames].sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0)).map(({ x: _x, y: _y, ...f }) => (void _x, void _y, f)) })
    setSaid("Frames back in a row")
  }

  return (
    <SyncContext.Provider value={sync}>
    <div className="stage-surface relative flex min-h-0 min-w-0 flex-1 flex-col">
      <StageNav nav={nav}>
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
          {placed && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Back to a row" onClick={backToRow} />}><Undo2Icon /></TooltipTrigger>
              <TooltipContent>Back to a row: undo where frames were dragged</TooltipContent>
            </Tooltip>
          )}
          {onCanvas && <Button variant="ghost" size="sm" aria-label="Tidy" title="Tidy into a row, grouped by kind" onClick={() => tidy.current?.()}><LayoutGridIcon /><span className="hidden xl:inline">Tidy</span></Button>}
          <Button variant="ghost" size="sm" aria-label="Reset all" title="Reset all frames" onClick={() => set({ resetNonce: r.resetNonce + 1 }, false)}><RotateCcwIcon /><span className={cn(onCanvas && "hidden xl:inline")}>Reset all</span></Button>
        </div>
      </div>
      {r.arrangement === "canvas" && narrow && <p className="px-4 pt-2 text-center text-xs text-stage-muted">This layout is a canvas. The canvas opens on wider screens; here its frames stack.</p>}
      {onCanvas ? (
        <div ref={box} className="relative min-h-0 flex-1">
          <React.Suspense fallback={<p className="p-6 text-center text-xs text-stage-muted">Opening the canvas…</p>}>
            <Canvas statuses={statuses} onStatus={onStatus} rowPlacement={() => lastRow.current} onAnnounce={setSaid} onZoom={setCanvasPct} tidyRef={tidy} />
          </React.Suspense>
        </div>
      ) : (
      <div ref={box} className="flex min-h-0 flex-1 overflow-auto p-6" onKeyDown={onKey} onPointerDown={nav.onPointerDown}>
        {/* One structure for a flowing and a placed row, so placing frames never remounts them. */}
        <div ref={content} className={cn(dragging && "[&_iframe]:pointer-events-none", placed ? "relative shrink-0" : cn("m-auto flex w-max items-start", narrow ? "flex-col" : "flex-row"))} style={placed ? { width: extent.w, height: extent.h } : { gap: GAP }}>
          {r.frames.map((f, i) => (
            <div key={f.id} className={cn(placed && "absolute", placed && dragging === f.id && "z-10")} style={placed ? { left: placeOf(f).x * scale, top: placeOf(f).y * scale } : undefined}>
              <FrameCard frame={f} index={i} count={r.frames.length} scale={scale} narrow={narrow} status={statuses[f.id] ?? null} onStatus={onStatus} dragging={dragging === f.id} onDragStart={start} labelRef={(el) => { if (el) labels.current.set(f.id, el); else labels.current.delete(f.id) }} />
            </div>
          ))}
        </div>
      </div>
      )}
      <div className="pointer-events-none flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
        {!narrow && <StageControls variant="dock" lookOnly canvasZoom={onCanvas ? canvasPct : undefined} />}
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>
      </StageNav>
    </div>
    </SyncContext.Provider>
  )
}
