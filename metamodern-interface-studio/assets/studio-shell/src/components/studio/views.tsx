import * as React from "react"
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns2Icon,
  GripVerticalIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SplitIcon,
  TriangleAlertIcon,
  XIcon,
  ListIcon,
  ImagesIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { adapter } from "@/adapter"
import { areaLabel, captureFor, isColor, useStudio } from "@/store"
import type { LiveStatus } from "@/studio/live-preview"
import type { Step } from "@/studio/types"
import { FidelityBadge, ScaleNote, StatusBadge, lookOf, useFit } from "./bits"
import { StageControls } from "./chrome"
import { ScenarioPreview, inspectHandle, profileOf, themeOf } from "./preview"

function PreviewTab({ theme, profile, scale, extra }: { theme: string; profile: string; scale: number; extra?: React.ReactNode }) {
  const pr = profileOf(profile)
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-lg bg-background/92 px-1.5 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
      <FidelityBadge mode={lookOf(adapter.target.fidelity)} className="h-5">{adapter.target.label}</FidelityBadge>
      <span className="font-medium text-foreground">{adapter.product.name}</span>
      <span>{themeOf(theme).label}</span>
      <span className="opacity-40">·</span>
      <span>{pr.label}</span>
      <span className="opacity-40">·</span>
      <ScaleNote w={pr.w} h={pr.h} scale={scale} />
      {adapter.presentationOverrides?.map((o) => (
        <Badge key={o.id} variant="outline" className="h-5 border-dashed">{o.label}</Badge>
      ))}
      {extra}
    </div>
  )
}

/** The grey stage with its controls in the chosen placement. */
function Stage({ children, controls = true, footer, narrow }: { children: React.ReactNode; controls?: boolean; footer?: React.ReactNode; narrow?: boolean }) {
  const s = useStudio()
  const dock = s.options.controls === "dock"
  if (narrow) controls = false
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {controls && !dock && <StageControls variant="toolbar" />}
      <div className="stage-surface relative flex min-h-0 flex-1 flex-col">{children}</div>
      {controls && dock && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
          <StageControls variant="dock" />
        </div>
      )}
      {footer}
    </div>
  )
}

export function InspectStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const sc = s.scenarioObj
  const pr = profileOf(s.profile)
  const box = React.useRef<HTMLDivElement>(null)
  const dock = s.options.controls === "dock"
  const scale = useFit(box, pr.w, pr.h, s.zoom, narrow ? 32 : 64, narrow)
  const set = s.set
  const onStatus = React.useCallback(
    (st: LiveStatus | null) => {
      if (st) set({ preview: { status: st.status, modified: st.modified, canGoBack: st.canGoBack, location: st.location, fingerprint: st.fingerprint, reason: st.reason, previous: st.previous } })
      else set({ preview: { status: captureFor(sc, s.theme, s.profile) ? "static" : "empty", modified: false, canGoBack: false } })
    },
    [set, sc, s.theme, s.profile]
  )
  return (
    <Stage narrow={narrow}>
      <div ref={box} className={cn("flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto px-4 pt-4", dock && !narrow ? "pb-20" : "pb-4", !narrow && "justify-center")}>
        <PreviewTab theme={s.theme} profile={s.profile} scale={scale} />
        <ScenarioPreview
          ref={inspectHandle}
          scenario={sc.id}
          theme={s.theme}
          profile={s.profile}
          values={s.values}
          resetNonce={s.resetNonce}
          scale={scale}
          label={`${areaLabel(sc.area)}: ${sc.label} preview`}
          onStatus={onStatus}
        />
      </div>
    </Stage>
  )
}

function useSideStatus() {
  const [st, setSt] = React.useState<LiveStatus | null>(null)
  const [nonce, setNonce] = React.useState(0)
  return { st, setSt, nonce, reset: () => setNonce((n) => n + 1) }
}

export function CompareStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const sc = s.scenarioObj
  const pr = profileOf(s.profile)
  const { a, b, mode, split, showB } = s.compare
  const box = React.useRef<HTMLDivElement>(null)
  const effectiveMode = narrow && mode === "side" ? "toggle" : mode
  const sides = effectiveMode === "side" ? 2 : 1
  const scale = useFit(box, pr.w * sides + (sides - 1) * 40, pr.h, "fit", 64)
  const label = (id: string) => themeOf(id).label
  const setC = (patch: Partial<typeof s.compare>) => s.set({ compare: { ...s.compare, ...patch } })
  const A = useSideStatus()
  const B = useSideStatus()
  // Held inputs are read from what both sides actually resolved, not from labels.
  const held = [
    `Scenario: ${areaLabel(sc.area)}: ${sc.label}`,
    `Profile: ${pr.label}`,
    ...adapter.axes.inputs.map((i) => `${i.label}: ${i.options.find((o) => o.id === s.values[i.id])?.label ?? s.values[i.id]}`),
    `Revision: ${adapter.product.revision}`,
  ]
  const diverged = !!A.st?.modified || !!B.st?.modified
  const drag = React.useRef<HTMLDivElement>(null)
  const onDrag = (e: React.PointerEvent) => {
    const el = drag.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setC({ split: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)) })
  }
  const side = (k: "a" | "b", interactive = true) => {
    const x = k === "a" ? A : B
    return (
      <ScenarioPreview
        scenario={sc.id}
        theme={k === "a" ? a : b}
        profile={s.profile}
        values={s.values}
        resetNonce={x.nonce}
        scale={scale}
        interactive={interactive}
        label={`Side ${k.toUpperCase()}: ${label(k === "a" ? a : b)}`}
        onStatus={x.setSt}
      />
    )
  }
  const sideStatus = (st: LiveStatus | null) =>
    !st ? null : st.status === "loading" ? <StatusBadge kind="loading">Loading</StatusBadge> : st.status === "error" ? <StatusBadge kind="unresolved">Did not start</StatusBadge> : st.modified ? <StatusBadge kind="modified">Modified</StatusBadge> : <StatusBadge kind="ready">Ready</StatusBadge>
  return (
    <Stage controls={false}>
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-[var(--dock-shadow)] backdrop-blur-md">
          <Select value="theme" items={{ theme: adapter.axes.themeLabel }}>
            <SelectTrigger size="sm" className="border-0 shadow-none" aria-label="Changing axis"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="theme">{adapter.axes.themeLabel}</SelectItem></SelectContent>
          </Select>
          <Separator orientation="vertical" className="h-5! self-center!" />
          {(["a", "b"] as const).map((k) => (
            <Select key={k} value={s.compare[k]} items={Object.fromEntries(adapter.axes.themes.map((t) => [t.id, t.label]))} onValueChange={(v) => setC({ [k]: v as string })}>
              <SelectTrigger size="sm" className="gap-1 border-0 shadow-none" aria-label={k === "a" ? "Side A" : "Side B"}>
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{k.toUpperCase()}</Badge>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{adapter.axes.themes.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Swap sides" onClick={() => setC({ a: b, b: a })} />}><ArrowLeftRightIcon /></TooltipTrigger>
            <TooltipContent>Swap sides</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-5! self-center!" />
          <ToggleGroup value={[effectiveMode]} onValueChange={(v) => v[0] && setC({ mode: v[0] as typeof mode })} size="sm" spacing={0} aria-label="Comparison mode">
            {!narrow && <ToggleGroupItem value="side" aria-label="Side by side"><Columns2Icon /><span className="hidden xl:inline">Side by side</span></ToggleGroupItem>}
            <ToggleGroupItem value="split" aria-label="Split"><SplitIcon /><span className="hidden xl:inline">Split</span></ToggleGroupItem>
            <ToggleGroupItem value="toggle" aria-label="Flip"><ImagesIcon /><span className="hidden xl:inline">Flip</span></ToggleGroupItem>
          </ToggleGroup>
        </div>
        <HoverCard>
          <HoverCardTrigger render={<Badge variant="outline" className={cn("cursor-default gap-1 bg-background/90 backdrop-blur", diverged && "text-warning")} />}>
            {diverged ? <TriangleAlertIcon /> : <InfoIcon />} {diverged ? "Sides diverged: reset to compare" : `Only ${adapter.axes.themeLabel.toLowerCase()} changes · ${held.length} held`}
          </HoverCardTrigger>
          <HoverCardContent className="w-72 text-xs">
            <p className="mb-2 font-medium">Held equal on both sides</p>
            <ul className="grid gap-1">{held.map((x) => <li key={x} className="flex gap-1.5"><CheckIcon className="mt-0.5 size-3 shrink-0 text-success" />{x}</li>)}</ul>
            <p className="mt-2 text-muted-foreground">Each side is its own runtime. Changing product state on one side marks it modified and the pair diverged until reset.</p>
          </HoverCardContent>
        </HoverCard>
      </div>
      <div ref={box} className="flex min-h-0 flex-1 items-center justify-center gap-10 overflow-hidden p-6">
        {effectiveMode === "side" &&
          (["a", "b"] as const).map((k) => (
            <figure key={k} className="m-0 flex flex-col items-center gap-2">
              <figcaption className="flex items-center gap-1.5 rounded-lg bg-background/92 px-2 py-1 text-xs shadow-sm backdrop-blur">
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{k.toUpperCase()}</Badge>
                <b className="font-medium">{label(k === "a" ? a : b)}</b>
                {sideStatus((k === "a" ? A : B).st)}
                <Button variant="ghost" size="icon-xs" aria-label={`Reset side ${k.toUpperCase()}`} onClick={(k === "a" ? A : B).reset}><RotateCcwIcon /></Button>
              </figcaption>
              {side(k)}
            </figure>
          ))}
        {effectiveMode === "split" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex w-full justify-between text-xs"><Badge className="bg-background/92 text-foreground">A · {label(a)}</Badge><Badge className="bg-background/92 text-foreground">B · {label(b)}</Badge></div>
            <div ref={drag} className="relative touch-none" onPointerMove={(e) => e.buttons === 1 && onDrag(e)} onPointerDown={onDrag}>
              {side("b", false)}
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>{side("a", false)}</div>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Split position"
                aria-valuenow={Math.round(split)}
                aria-valuemin={0}
                aria-valuemax={100}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setC({ split: Math.max(0, split - 5) })
                  if (e.key === "ArrowRight") setC({ split: Math.min(100, split + 5) })
                }}
                className="group absolute inset-y-0 z-10 flex w-0 cursor-ew-resize items-center justify-center outline-none"
                style={{ left: `${split}%` }}
              >
                <span className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
                <span className="relative flex size-7 items-center justify-center rounded-full border bg-background text-foreground shadow-md ring-ring/50 group-focus-visible:ring-3"><GripVerticalIcon className="size-4" /></span>
              </div>
            </div>
          </div>
        )}
        {effectiveMode === "toggle" && (
          <div className="flex flex-col items-center gap-2">
            <ToggleGroup value={[showB ? "b" : "a"]} onValueChange={(v) => v[0] && setC({ showB: v[0] === "b" })} variant="outline" size="sm" spacing={0} className="bg-background/92">
              <ToggleGroupItem value="a">A · {label(a)}</ToggleGroupItem>
              <ToggleGroupItem value="b">B · {label(b)}</ToggleGroupItem>
            </ToggleGroup>
            {/* Both sides stay mounted so a flip is instant and each keeps its own state. */}
            <div className="relative">
              <div className={cn(showB && "invisible")}>{side("a")}</div>
              <div className={cn("absolute inset-0", !showB && "invisible")}>{side("b")}</div>
            </div>
            <p className="text-[11px] text-stage-muted">Press <Kbd>Space</Kbd> to flip between A and B.</p>
          </div>
        )}
      </div>
    </Stage>
  )
}

/** Mounts its child only while near the viewport, so offscreen thumbnails hold no runtime. */
function WhenVisible({ children, className }: { children: (width: number) => React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" })
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    io.observe(el)
    ro.observe(el)
    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [])
  return <div ref={ref} className={className}>{visible && width > 0 ? children(width) : null}</div>
}

export function GalleryStage() {
  const s = useStudio()
  const g = s.gallery
  const pr = profileOf(s.profile)
  const q = g.query.toLowerCase()
  const list = adapter.scenarios.filter((x) => !g.hidden.includes(x.area) && (!q || `${x.label} ${x.surface} ${areaLabel(x.area)}`.toLowerCase().includes(q)) && (!g.onlyFlagged || !!x.status))
  const groups = adapter.areas.map((a) => ({ area: a, items: list.filter((x) => x.area === a.id) })).filter((x) => x.items.length)
  const phone = pr.kind === "phone"
  return (
    <Stage
      controls={false}
      footer={
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div role="toolbar" aria-label="Gallery controls" className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-popover/95 p-1 pl-3 shadow-[var(--dock-shadow)] backdrop-blur-md">
            <span className="text-xs text-muted-foreground">Size</span>
            <div className="w-28 px-1"><Slider min={160} max={400} step={20} value={[g.size]} onValueChange={(v) => s.set({ gallery: { ...g, size: (v as number[])[0] } })} aria-label="Thumbnail size" /></div>
            <Separator orientation="vertical" className="h-5! self-center!" />
            <ToggleGroup value={[g.source]} onValueChange={(v) => v[0] && s.set({ gallery: { ...g, source: v[0] as "captures" | "live" } })} size="sm" spacing={0} aria-label="Thumbnail source">
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <ToggleGroupItem value="captures" disabled={!s.hasCaptures}>Captures</ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{s.hasCaptures ? "Recorded evidence, cheapest to show" : "No captures recorded yet. The verification run records them."}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <ToggleGroupItem value="live" disabled={!adapter.frameEntry}>Live</ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{adapter.frameEntry ? "A runtime per visible thumbnail" : "This Studio has no live preview"}</TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>
        </div>
      }
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-8 p-6 pb-24">
          <p className="text-xs text-stage-muted">
            {list.length} of {adapter.scenarios.length} · {themeOf(s.theme).label} · {pr.label} · {g.source === "live" ? "live, mounted while visible" : "captures from the last verification run"}
          </p>
          {groups.map(({ area, items }) => (
            <section key={area.id} className="grid gap-3" aria-label={area.label}>
              <h2 className="text-sm font-semibold text-stage-foreground">{area.label} <span className="font-normal text-stage-muted tabular-nums">{items.length}</span></h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${phone ? g.size * 0.6 : g.size}px, 1fr))` }}>
                {items.map((x, i) => {
                  const cap = captureFor(x, s.theme, s.profile)
                  return (
                    <button
                      key={x.id}
                      onClick={() => {
                        s.selectScenario(x.id)
                        s.set({ view: "inspect" })
                      }}
                      className="group flex flex-col gap-2 rounded-xl bg-background/95 p-2 text-left shadow-sm ring-1 ring-black/5 transition-all duration-200 ease-out outline-none animate-in fade-in-0 slide-in-from-bottom-1 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}
                    >
                      <div className="relative overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: `${pr.w} / ${pr.h}` }}>
                        {x.status === "later" ? (
                          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">Not designed yet</div>
                        ) : g.source === "captures" ? (
                          cap ? <img src={cap.src} alt="" className="size-full object-cover object-top" /> : <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">No capture</div>
                        ) : (
                          <WhenVisible className="absolute inset-0">
                            {(width) => <ScenarioPreview scenario={x.id} theme={s.theme} profile={s.profile} values={s.values} scale={width / pr.w} interactive={false} label={`${x.label} thumbnail`} className="[&_.preview-ticks]:hidden [&_.preview-frame]:rounded-none! [&_.preview-frame]:shadow-none" />}
                          </WhenVisible>
                        )}
                        <div className="absolute top-1.5 left-1.5">
                          {x.status === "stale" ? <StatusBadge kind="stale">Stale</StatusBadge> : x.status === "unresolved" ? <StatusBadge kind="unresolved">Unresolved</StatusBadge> : g.source === "captures" ? <FidelityBadge mode={cap ? "static" : "unavailable"} className="h-5">{cap ? "Capture" : "None"}</FidelityBadge> : null}
                        </div>
                      </div>
                      <div className="px-1 pb-0.5">
                        <p className="truncate text-[13px] font-medium" title={x.label}>{x.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{x.state ?? x.surface}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {list.length === 0 && <p className="text-sm text-stage-foreground">No scenario matches the gallery filters.</p>}
        </div>
      </ScrollArea>
    </Stage>
  )
}

/** Why a step cannot run, resolved before playback. A broken step is shown, never skipped or replaced. */
export function staticProblem(st: Step) {
  const sc = adapter.scenarios.find((x) => x.id === st.scenario)
  if (!sc) return `Scenario ${st.scenario} is not in the catalog. Nothing was substituted.`
  if (sc.status === "later") return `${sc.surface} is marked Later: it has no designed screen. Nothing was substituted.`
  if (!adapter.frameEntry && st.commands?.length) return "This step runs product commands, and this Studio has no live preview."
  if (!adapter.frameEntry && !captureFor(sc, st.theme ?? adapter.axes.themes[0].id, st.profile ?? adapter.axes.profiles[0].id)) return "No capture exists for this step."
  return null
}

export function PresentStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const tour = adapter.walkthroughs.find((t) => t.id === s.present.tour) ?? adapter.walkthroughs[0]
  const box = React.useRef<HTMLDivElement>(null)
  const [st, setSt] = React.useState<LiveStatus | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const i = tour ? Math.min(s.present.step, tour.steps.length - 1) : 0
  const step = tour?.steps[i]
  const theme = step?.theme ?? s.theme
  const profile = step?.profile ?? s.profile
  const pr = profileOf(profile)
  const scale = useFit(box, pr.w, pr.h, "fit", 48)
  // Runtime problems count too: a failed command or a missing anchor stops the step.
  const problem = !step ? null : staticProblem(step) ?? (st?.status === "error" && !st.previous ? `The step did not run: ${st.reason}` : st?.status === "ready" && step.anchor && !st.anchors.some((a) => a.id === step.anchor) ? `Anchor ${step.anchor} is missing from the preview. Nothing was highlighted in its place.` : null)
  const ready = !problem && (adapter.frameEntry ? st?.status === "ready" : true)
  const explored = !!st?.modified
  const go = (d: number) => tour && s.set({ present: { ...s.present, step: Math.max(0, Math.min(tour.steps.length - 1, i + d)), elapsed: 0 } })
  const secs = step ? Math.round(Math.min(14, Math.max(5, step.narration.split(/\s+/).length * 0.4 + 2.5)) / s.present.speed) : 5
  const set = s.set
  React.useEffect(() => {
    if (explored && s.present.playing) set((x) => ({ present: { ...x.present, playing: false } }))
  }, [explored, s.present.playing, set])
  // Autoplay advances only from a ready, resolved step; a problem stops playback.
  React.useEffect(() => {
    if (!s.present.playing || !tour) return
    if (problem) {
      set((x) => ({ present: { ...x.present, playing: false } }))
      return
    }
    if (!ready) return
    const t = window.setInterval(() => set((x) => {
      const e = x.present.elapsed + 0.1
      if (e < secs) return { present: { ...x.present, elapsed: e } }
      const last = x.present.step + 1 >= tour.steps.length - 1
      return { present: { ...x.present, step: Math.min(tour.steps.length - 1, x.present.step + 1), elapsed: 0, playing: last ? false : x.present.playing } }
    }), 100)
    return () => window.clearInterval(t)
  }, [s.present.playing, i, secs, problem, ready, tour, set])
  if (!tour || !step)
    return (
      <div className="stage-surface flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-sm bg-background">
          <EmptyHeader>
            <EmptyTitle>No walkthrough yet</EmptyTitle>
            <EmptyDescription>Prepare one from an observed task. The first Build includes an initial walkthrough.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="stage-surface relative flex min-h-0 flex-1 flex-col">
        <div ref={box} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
          {!staticProblem(step) && <PreviewTab theme={theme} profile={profile} scale={scale} />}
          {staticProblem(step) ? (
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl bg-background/95 p-6 text-center text-sm shadow-sm">
              <TriangleAlertIcon className="size-5 text-danger" />
              <b>Step {i + 1} cannot run</b>
              <span className="text-muted-foreground">Its references don’t resolve. The Studio shows nothing in its place.</span>
            </div>
          ) : (
            <ScenarioPreview
              key={`${tour.id}:${i}:${nonce}`}
              scenario={step.scenario}
              theme={theme}
              profile={profile}
              values={s.values}
              commands={step.commands}
              anchor={explored ? undefined : step.anchor}
              scale={scale}
              label={`Step ${i + 1} preview`}
              className="animate-in fade-in-0 zoom-in-[0.98] duration-300"
              onStatus={setSt}
            />
          )}
        </div>
      </div>
      <section aria-label="Narration" className="border-t bg-background">
        <div className="seg-track px-4 pt-3" aria-hidden>
          {tour.steps.map((x, j) => (
            <i key={j} data-state={staticProblem(x) || (j === i && problem) ? "unresolved" : j < i ? "done" : j === i ? "current" : "upcoming"} style={j === i ? ({ "--p": `${(s.present.elapsed / secs) * 100}%` } as React.CSSProperties) : undefined} />
          ))}
        </div>
        <div className={cn("grid items-start gap-x-6 gap-y-3 px-4 pt-3 pb-4", narrow ? "grid-cols-1" : "grid-cols-[minmax(160px,1fr)_minmax(0,2.4fr)_auto]")}>
          <div className="grid gap-1">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tour.name} · {i + 1} of {tour.steps.length}</p>
            {!narrow && <p className="text-xs leading-relaxed text-muted-foreground">{tour.goal}</p>}
            {tour.illustrative && <Badge variant="outline" className="w-fit border-dashed text-[10px]">Illustrative tour</Badge>}
          </div>
          <div aria-live="polite" className="grid gap-2">
            {problem ? (
              <Alert variant="destructive" className="animate-in fade-in-0">
                <TriangleAlertIcon />
                <AlertTitle>This step stopped</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
                {i < tour.steps.length - 1 && <AlertAction><Button size="xs" variant="outline" onClick={() => go(1)}>Skip to step {i + 2}</Button></AlertAction>}
              </Alert>
            ) : (
              <p key={i} className={cn("font-heading leading-snug text-pretty animate-in fade-in-0 slide-in-from-bottom-1 duration-300", narrow ? "text-base" : "text-xl")}>{step.narration}</p>
            )}
            {step.expect && !problem && ready && <p className="flex items-center gap-1.5 text-xs text-success"><CheckIcon className="size-3.5" /> Expected: {step.expect}</p>}
            {explored && !problem && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-warning">
                Paused while you explore.
                <Button size="xs" variant="outline" onClick={() => setNonce((n) => n + 1)}>Restore this step</Button>
              </p>
            )}
          </div>
          <div role="group" aria-label="Walkthrough controls" className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Previous step" disabled={i === 0} onClick={() => go(-1)}><ChevronLeftIcon /></Button>
            <Button size="icon" aria-label={s.present.playing ? "Pause" : "Play"} onClick={() => s.set({ present: { ...s.present, playing: !s.present.playing } })} disabled={!!problem}>
              {s.present.playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Next step" disabled={i === tour.steps.length - 1} onClick={() => go(1)}><ChevronRightIcon /></Button>
            {!narrow && <Button variant="ghost" size="icon" aria-label="All steps" onClick={() => s.set({ panelOpen: true })}><ListIcon /></Button>}
            <Button variant="ghost" size="icon" aria-label="Exit walkthrough" onClick={() => s.set({ view: "inspect", present: { ...s.present, playing: false } })}><XIcon /></Button>
          </div>
        </div>
        {!narrow && (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            <Kbd>←</Kbd> <Kbd>→</Kbd> step · <Kbd>Space</Kbd> pause · <Kbd>Esc</Kbd> exit · touching the preview pauses and offers Restore this step.
          </p>
        )}
      </section>
    </div>
  )
}

export function TokensStage() {
  const s = useStudio()
  const t = adapter.tokens!
  const q = s.tokens.query.toLowerCase()
  const family = s.tokens.family
  const familyCount = t.families.find((g) => g.name === family)?.count
  const [ca, cb] = t.columns
  const [showTheme, setShowTheme] = React.useState(ca)
  const [showDraft, setShowDraft] = React.useState(true)
  const drafts = Object.keys(s.tokens.drafts).length
  const rows = t.tokens.filter(
    (x) =>
      (!family || x.family === family) &&
      (!q || `${x.name} ${Object.values(x.values).join(" ")}`.toLowerCase().includes(q)) &&
      (s.tokens.flag === "all" || (s.tokens.flag === "unread" && x.flags?.includes("unread")) || (s.tokens.flag === "literal" && x.flags?.includes("literal")) || (s.tokens.flag === "draft" && !!s.tokens.drafts[x.name]))
  )
  const ground = (theme: string) => t.grounds?.[theme] ?? (themeOf(theme).appearance === "dark" ? "#111111" : "#ffffff")
  const pval = (v: string | undefined, theme: string, draft?: string) => (
    <span className="flex min-w-0 items-center gap-2">
      {v && isColor(v) && (
        <span className="relative flex h-5 w-7 shrink-0 items-center justify-center rounded ring-1 ring-border" style={{ background: ground(theme) }}>
          <span className="size-3 rounded-[3px]" style={{ background: draft && CSS.supports("color", draft) ? draft : v }} />
        </span>
      )}
      <code className={cn("truncate font-mono text-xs", draft && "text-info")} title={v}>{draft ?? v ?? "none"}</code>
    </span>
  )
  const select = (name: string) => s.set({ tokens: { ...s.tokens, selected: name }, detailsOpen: true })
  const box = React.useRef<HTMLDivElement>(null)
  const pr = profileOf(s.profile)
  const scale = useFit(box, pr.w, pr.h, "fit", 40)
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="60" minSize="40">
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
            <span>{family ? `${family} · ` : ""}{rows.length} shown of {familyCount ?? t.total} · read from {t.source} at {adapter.product.revision}</span>
            <span className="ml-auto hidden lg:inline">Product values sit on the product’s own ground</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[42%]">Token</TableHead>
                  <TableHead>{themeOf(ca).label}</TableHead>
                  <TableHead>{themeOf(cb).label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((x) => {
                  const d = s.tokens.drafts[x.name]
                  return (
                    <TableRow key={x.name} data-state={s.tokens.selected === x.name ? "selected" : undefined} className="cursor-pointer" onClick={() => select(x.name)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && select(x.name)}>
                      <TableCell>
                        <div className="grid">
                          <code className="font-mono text-xs font-medium">{x.name}</code>
                          <span className="text-[11px] text-muted-foreground">{x.family}{x.reads != null && ` · ${x.reads} reads`}</span>
                          <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
                            {d && <StatusBadge kind="draft">Draft</StatusBadge>}
                            {x.flags?.includes("unread") && <Badge variant="outline" className="text-warning">Unread</Badge>}
                            {x.flags?.includes("literal") && <Badge variant="outline">Fixed values</Badge>}
                            {x.flags?.includes("coupled") && <Badge variant="outline" className="text-info">Coupled</Badge>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-40">{pval(x.values[ca], ca, d?.[ca])}</TableCell>
                      <TableCell className="max-w-40">{pval(x.values[cb], cb, d?.[cb])}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyTitle className="text-sm">No token matches</EmptyTitle>
                  <EmptyDescription className="text-xs">Clear the search, the flag or the family.</EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" size="sm" onClick={() => s.set({ tokens: { ...s.tokens, family: null, query: "", flag: "all" } })}>Show all tokens</Button>
              </Empty>
            )}
          </ScrollArea>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="40" minSize="25">
        <div className="stage-surface flex h-full min-h-0 flex-col">
          <div ref={box} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg bg-background/92 p-1 text-xs shadow-sm backdrop-blur">
              <ToggleGroup value={[showTheme]} onValueChange={(v) => v[0] && setShowTheme(v[0])} size="sm" spacing={0} aria-label="Preview theme">
                {[ca, cb].map((id) => <ToggleGroupItem key={id} value={id} className="h-6 px-2 text-xs">{themeOf(id).label}</ToggleGroupItem>)}
              </ToggleGroup>
              <Separator orientation="vertical" className="h-4! self-center!" />
              <ToggleGroup value={[showDraft ? "draft" : "baseline"]} onValueChange={(v) => v[0] && setShowDraft(v[0] === "draft")} size="sm" spacing={0} aria-label="Values">
                <ToggleGroupItem value="baseline" className="h-6 px-2 text-xs">Baseline</ToggleGroupItem>
                <ToggleGroupItem value="draft" className="h-6 px-2 text-xs" disabled={!drafts}>Draft{drafts ? ` · ${drafts}` : ""}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <ScenarioPreview scenario={s.scenario} theme={showTheme} profile={s.profile} values={s.values} tokens={showDraft ? s.draftsFor(showTheme) : {}} scale={scale} label="Token preview" />
            <p className="max-w-xs text-center text-[11px] text-stage-muted">Drafts apply to this preview only and stay in this browser. They never change the product.</p>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
