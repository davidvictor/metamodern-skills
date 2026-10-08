import { CompiledInspector } from "@/studio/design-ui/slots"
import * as React from "react"
import { useDesignDirections, useDirectionSnapshot } from "@/studio/design-ui/react"
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns2Icon,
  GripVerticalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SplitIcon,
  TriangleAlertIcon,
  XIcon,
  ListIcon,
  ImagesIcon,
  PencilIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCoarse, useMedia } from "@/hooks/use-mobile"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { adapter } from "@/adapter"
import { areaLabel, axisOptions, captureFor, compareAxes, isColor, NO_DRAFT, propertyIds, useStudio, withoutLenses } from "@/store"
import { normalizeScenarioInput } from "@/studio/input"
import type { LiveStatus } from "@/studio/live-preview"
import type { Step } from "@/studio/types"
import { FidelityBadge, ScaleChip, StatusBadge, useFit } from "./bits"
import { VirtualList, type VirtualListHandle } from "@/studio/virtual-list"
import { StageControls } from "./chrome"
import { ScenarioPreview, inspectHandle, profileOf, themeOf, useReportStatus } from "./preview"
import { ResizeHandles } from "./resize-handles"
import { StageNav, useStageNav } from "./stage-nav"
import { firstVisibleIndex, importedOverlay, isPresenterOverlay, nextVisibleIndex, stepId, stepSeconds } from "@/studio/presenter-overlay"
import { chooseCompared, comparisonCount, resolveComparison } from "@/studio/compare"

/** The grey stage with its controls in the chosen placement. */
function Stage({ children, controls = true, footer, narrow }: { children: React.ReactNode; controls?: boolean; footer?: React.ReactNode; narrow?: boolean }) {
  const s = useStudio()
  const dock = s.options.controls === "dock"
  if (narrow) controls = false
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {controls && !dock && <StageControls variant="toolbar" />}
      <div className="stage-surface relative flex min-h-0 flex-1 flex-col">
        {children}
        {s.options.draftEverywhere && s.hasDraft && s.view !== "present" && (
          <div className="pointer-events-none absolute top-3 left-3 z-10">
            <StatusBadge kind="draft">Draft design</StatusBadge>
          </div>
        )}
      </div>
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
  const base = profileOf(s.profile)
  const pr = s.size ? { ...base, ...s.size } : base
  const box = React.useRef<HTMLDivElement>(null)
  const dock = s.options.controls === "dock"
  const resizable = !!adapter.axes.resizable && !!adapter.frameEntry && !narrow
  // While an edge is dragged the scale is frozen at what it was, so the handle stays under the pointer.
  const [frozen, setFrozen] = React.useState<{ scale: number } | null>(null)
  const fit = useFit(box, pr.w, pr.h, s.zoom, narrow ? 32 : 64, narrow)
  const scale = frozen?.scale ?? fit
  const set = s.set
  // The dock's Zoom control states the shown scale (set by the navigation), so the stage carries no caption of its own.
  const nav = useStageNav(box, scale)
  const onStatus = React.useCallback(
    (st: LiveStatus | null) => {
      if (st) set({ preview: { status: st.status, modified: st.modified, canGoBack: st.canGoBack, location: st.location, fingerprint: st.fingerprint, reason: st.reason, previous: st.previous, diagnostics: st.diagnostics, capabilities: st.capabilities } })
      else set({ preview: { status: captureFor(sc, s.theme, s.profile) ? "static" : "empty", modified: false, canGoBack: false } })
    },
    [set, sc, s.theme, s.profile]
  )
  const preview = (
    <ScenarioPreview
      ref={inspectHandle}
      scenario={sc.id}
      theme={s.theme}
      profile={s.profile}
      size={resizable ? s.size : null}
      values={s.values}
      props={s.edits}
      draft={s.viewDraft(s.theme)}
      resetNonce={s.resetNonce}
      scale={scale}
      label={`${areaLabel(sc.area)}: ${sc.label} preview`}
      onStatus={onStatus}
    />
  )
  return (
    <Stage narrow={narrow}>
      <StageNav nav={nav}>
      <div ref={box} onPointerDown={nav.onPointerDown} className={cn("flex min-h-0 flex-1 flex-col px-4 pt-4", frozen ? "overflow-hidden select-none" : "overflow-auto", dock && !narrow ? "pb-20" : "pb-4")}>
        <div className={cn("mx-auto flex w-max flex-col items-center gap-3", !narrow && "my-auto")}>
        {resizable ? <ResizeHandles w={pr.w} h={pr.h} scale={scale} onDragChange={setFrozen}>{preview}</ResizeHandles> : preview}
        </div>
      </div>
      </StageNav>
    </Stage>
  )
}

function useSideStatus() {
  const [st, setSt] = React.useState<LiveStatus | null>(null)
  const [nonce, setNonce] = React.useState(0)
  return { st, setSt, nonce, reset: () => setNonce((n) => n + 1) }
}

/**
 * A compared side's header. It takes the width of its preview, never more: as a size container it stays out of the
 * stage's measured width, so a narrow preview wraps the header and truncates the value's name (kept whole as its title).
 * Below 7rem the status shows only its dot or icon (its word stays as its accessible name) and Reset wraps below it;
 * the figure is at least 60 px wide, so Reset's 44 px target always fits inside the header.
 */
function SideCaption({ side, label, status, onReset }: { side: string; label: string; status: React.ReactNode; onReset: () => void }) {
  return (
    <figcaption className="@container flex justify-center self-stretch">
      <span className="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-lg bg-background/92 px-2 py-1 text-xs shadow-sm backdrop-blur">
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{side}</Badge>
          <b className="min-w-0 truncate font-medium" title={label}>{label}</b>
        </span>
        <span className="flex flex-wrap items-center justify-center gap-1.5">
          {status}
          <Button variant="ghost" size="icon-xs" aria-label={`Reset side ${side}`} onClick={onReset}><RotateCcwIcon /></Button>
        </span>
      </span>
    </figcaption>
  )
}

export function CompareStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const sc = s.scenarioObj
  const axes = compareAxes(sc, s.hasDraft)
  const { mode, split, showB } = s.compare
  // A scoped axis (such as Role) that this scenario does not use falls back to the theme axis.
  const fallback = !axes.some((x) => x.id === s.compare.axis)
  const axis = fallback ? "theme" : s.compare.axis
  const directionService = useDesignDirections()
  useDirectionSnapshot()
  const baseOptions = axis === "direction" ? s.directionOptions : axisOptions(axis, sc)
  const options = axis === "direction" ? [...baseOptions, ...s.compare.values.filter(id => !baseOptions.some(o => o.id === id)).map(id => ({ id, label: `Unavailable pin: ${id}` }))] : baseOptions
  const pinnedKeys = axis === "direction" ? s.compare.values.join("|") : ""
  React.useEffect(() => { if (pinnedKeys) for (const key of pinnedKeys.split("|")) void directionService?.resolvePin(key) }, [pinnedKeys, directionService])
  // A saved pair that names an option this scenario cannot render falls back to the first two it can.
  // A saved n-up comparison carries one tuple; A and B lead it, so the selectors and previews agree.
  const saved = s.compare.values.length ? s.compare.values : [s.compare.a, s.compare.b]
  // The count is capped at the values this axis has, so no side is awaited that never mounts.
  const { a, b, compared, count, available } = resolveComparison(
    options.map((o) => o.id),
    saved,
    s.compare.count,
    fallback ? [adapter.axes.themes[0].id, adapter.axes.themes[adapter.axes.themes.length - 1].id] : undefined
  )
  const axisLabel = axes.find((x) => x.id === axis)?.label ?? "This axis"
  const optionLabel = (id: string) => options.find((o) => o.id === id)?.label ?? id
  // Each side is one full set of resolved inputs: everything the viewer chose, except the one axis that changes.
  const pick = (k: "a" | "b") => (k === "a" ? a : b)
  const sideProfile = (k: "a" | "b") => profileOf(axis === "profile" ? pick(k) : s.profile)
  const sideTheme = (k: "a" | "b") => (axis === "theme" ? pick(k) : s.theme)
  const input = axis !== "theme" && axis !== "profile" && axis !== "design" ? adapter.axes.inputs.find((i) => i.id === axis) : undefined
  const axisValue = (value: string) => (input?.control === "range" || input?.control === "number" ? Number(value) : input?.control === "switch" ? value === "true" : value)
  // Every side carries the viewer's property edits. A property axis reaches each side as that side's own property
  // value, any other input as its value; nothing a side shows is written back to the edits.
  const sideInputs = (value: string) =>
    !input ? { values: s.values, props: s.edits } : propertyIds.has(axis) ? { values: s.values, props: { ...s.edits, [axis]: axisValue(value) } } : { values: { ...s.values, [axis]: axisValue(value) }, props: s.edits }
  const pa = sideProfile("a")
  const pb = sideProfile("b")
  const box = React.useRef<HTMLDivElement>(null)
  // Split overlays the sides, which only makes sense at one size.
  const splitOk = axis !== "profile"
  const requested = count > 2 || (mode === "split" && !splitOk) ? "side" : mode
  const effectiveMode = narrow && count === 2 && requested === "side" ? "toggle" : requested
  const sides = effectiveMode === "side" ? 2 : 1
  const fitW = Math.max(pa.w, pb.w)
  const fitH = Math.max(pa.h, pb.h)
  // The 40 px between two sides is fixed, not scaled, so it comes off the box instead of the preview widths; a narrow profile's caption is wider than its frame, so the profile axis leaves room for it.
  const extraProfiles = compared.slice(2).map((value) => profileOf(axis === "profile" ? value : s.profile))
  const nupWidth = [pa, pb, ...extraProfiles].reduce((sum, profile) => sum + profile.w, 0)
  const nupHeight = Math.max(pa.h, pb.h, ...extraProfiles.map((profile) => profile.h))
  const scale = useFit(box, effectiveMode === "side" ? nupWidth : fitW, effectiveMode === "side" ? nupHeight : fitH, s.zoom, 64 + (count - 1) * 40 + (count > 1 && axis === "profile" ? 56 : 0))
  // Space flips the sides here, so panning is by scroll and middle drag.
  const nav = useStageNav(box, scale, { space: false })
  const label = optionLabel
  const setC = (patch: Partial<typeof s.compare>) => s.set({ compare: { ...s.compare, ...patch } })
  const changeAxis = (next: string) => {
    if (next === axis) return
    const opts = next === "direction" ? s.directionOptions : axisOptions(next, sc)
    const current = next === "design" ? "built" : next === "theme" ? s.theme : next === "profile" ? s.profile : (s.edits[next] ?? s.values[next] ?? sc.designed?.[next] ?? adapter.axes.inputs.find((i) => i.id === next)?.default)
    const at = Math.max(0, opts.findIndex((o) => o.id === String(current)))
    // The requested count stays; the new axis shows as many of those sides as it has values.
    const values = Array.from({ length: Math.max(2, Math.min(comparisonCount(s.compare.count), opts.length)) }, (_, index) => opts[(at + index) % opts.length]?.id ?? "")
    setC({ axis: next, a: values[0], b: values[1], values })
  }
  const A = useSideStatus()
  const B = useSideStatus()
  const C = useSideStatus()
  const D = useSideStatus()
  // Details and the top bar read one status: the pair's, so Compare never shows a stale Inspect state.
  const set = s.set
  React.useEffect(() => {
    if (!available) {
      set({ preview: { status: "error", modified: false, canGoBack: false, reason: "This axis has fewer than two values to compare in this scenario" } })
      return
    }
    const sts = [A.st, B.st, ...(count > 2 ? [C.st] : []), ...(count > 3 ? [D.st] : [])]
    const failed = sts.find((x) => x?.status === "error")
    const status = failed ? "error" : sts.some((x) => !x || x.status === "loading") ? "loading" : "ready"
    set({ preview: { status, modified: sts.some((x) => x?.modified), canGoBack: false, reason: failed?.reason } })
  }, [A.st, B.st, C.st, D.st, count, available, set])
  const diverged = !!A.st?.modified || !!B.st?.modified || (count > 2 && !!C.st?.modified) || (count > 3 && !!D.st?.modified)
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
        theme={sideTheme(k)}
        profile={sideProfile(k).id}
        {...sideInputs(pick(k))}
        draft={axis === "direction" ? s.pinnedDirectionFor(pick(k), sideTheme(k)) : axis === "design" ? (pick(k) === "draft" ? s.draftFor(sideTheme(k)) : NO_DRAFT) : s.viewDraft(sideTheme(k))}
        resetNonce={x.nonce}
        scale={scale}
        interactive={interactive}
        label={`Side ${k.toUpperCase()}: ${label(pick(k))}`}
        onStatus={x.setSt}
      />
    )
  }
  const extraSide = (value: string, index: 2 | 3) => {
    const x = index === 2 ? C : D
    const profile = axis === "profile" ? profileOf(value) : profileOf(s.profile)
    const theme = axis === "theme" ? value : s.theme
    return (
      <ScenarioPreview
        scenario={sc.id}
        theme={theme}
        profile={profile.id}
        {...sideInputs(value)}
        draft={axis === "direction" ? s.pinnedDirectionFor(value, theme) : axis === "design" ? (value === "draft" ? s.draftFor(theme) : NO_DRAFT) : s.viewDraft(theme)}
        resetNonce={x.nonce}
        scale={scale}
        label={`Side ${String.fromCharCode(65 + index)}: ${label(value)}`}
        onStatus={x.setSt}
      />
    )
  }
  // In a narrow side header the status keeps its dot or icon and its word becomes its accessible name only.
  const word = (text: string) => <span className="@max-[7rem]:sr-only">{text}</span>
  const sideStatus = (st: LiveStatus | null) =>
    !st ? null : st.status === "loading" ? <StatusBadge kind="loading">{word("Loading")}</StatusBadge> : st.status === "error" ? <StatusBadge kind="unresolved">{word("Did not start")}</StatusBadge> : st.modified ? <StatusBadge kind="modified">{word("Modified")}</StatusBadge> : <StatusBadge kind="ready">{word("Ready")}</StatusBadge>
  return (
    <Stage controls={false}>
      <StageNav nav={nav}>
      {axis === "direction" && <div data-direction-pins className="flex flex-wrap justify-center gap-2 px-3 pt-2 text-xs">{compared.map(key => { const p = s.pinnedDirectionFor(key, s.theme); return <details key={key} className="max-w-xs rounded-lg border bg-popover px-2 py-1"><summary>{optionLabel(key)} · {themeOf(s.theme).label} · {profileOf(s.profile).label}</summary>{p.direction ? <div className="break-all pt-1"><p>{p.direction.basis} · direction {p.direction.id} · saved r{p.direction.savedRevision} · draft r{p.direction.draftRevision}</p><p>Source: {p.direction.sourceLockId ?? "Not declared"}</p><p>Fingerprint: {p.direction.fingerprint}</p></div> : <p role="status">{p.unavailable}</p>}</details> })}</div>}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-[var(--dock-shadow)] backdrop-blur-md">
          <Select value={axis} items={Object.fromEntries(axes.map((x) => [x.id, x.label]))} onValueChange={(v) => v && changeAxis(v as string)} disabled={!s.compare.editable}>
            <SelectTrigger size="sm" className={cn("border-0 shadow-none", axis === "direction" && "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[1000px]:min-h-11 max-[1000px]:min-w-11")} aria-label="Changing axis"><SelectValue /></SelectTrigger>
            <SelectContent>{axes.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}</SelectContent>
          </Select>
          <Separator orientation="vertical" className="h-5! self-center!" />
          {(["a", "b"] as const).map((k) => (
            <Select key={k} value={pick(k)} items={Object.fromEntries(options.map((o) => [o.id, o.label]))} onValueChange={(v) => {
              const values = chooseCompared(compared, k === "a" ? 0 : 1, v as string)
              setC({ axis, a: values[0], b: values[1], values })
            }} disabled={!s.compare.editable}>
              <SelectTrigger size="sm" className="gap-1 border-0 shadow-none" aria-label={k === "a" ? "Side A" : "Side B"}>
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{k.toUpperCase()}</Badge>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id} className={axis === "direction" ? "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[1000px]:min-h-11 max-[1000px]:min-w-11" : undefined}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {compared.slice(2).map((value, index) => {
            const slot = index + 2
            return (
              <Select key={slot} value={value} items={Object.fromEntries(options.map((o) => [o.id, o.label]))} onValueChange={(v) => {
                const values = chooseCompared(compared, slot, v as string)
                setC({ a: values[0], b: values[1], values })
              }} disabled={!s.compare.editable}>
                <SelectTrigger size="sm" className={cn("gap-1 border-0 shadow-none", axis === "direction" && "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[1000px]:min-h-11 max-[1000px]:min-w-11")} aria-label={`Side ${String.fromCharCode(65 + slot)}`}>
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{String.fromCharCode(65 + slot)}</Badge>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            )
          })}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Swap sides" onClick={() => setC({ axis, a: b, b: a, values: [b, a, ...compared.slice(2)] })} />}><ArrowLeftRightIcon /></TooltipTrigger>
            <TooltipContent>Swap sides</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-5! self-center!" />
          <ToggleGroup value={[effectiveMode]} onValueChange={(v) => v[0] && setC({ mode: v[0] as typeof mode })} size="sm" spacing={0} aria-label="Comparison mode">
            {!narrow && <ToggleGroupItem value="side" aria-label="Side by side"><Columns2Icon /><span className="hidden xl:inline">Side by side</span></ToggleGroupItem>}
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <ToggleGroupItem value="split" aria-label="Split" disabled={!splitOk}><SplitIcon /><span className="hidden xl:inline">Split</span></ToggleGroupItem>
              </TooltipTrigger>
              {!splitOk && <TooltipContent>Split overlays the sides, so it needs both at one size. Profiles differ in size; use Side by side or Flip.</TooltipContent>}
            </Tooltip>
            <ToggleGroupItem value="toggle" aria-label="Flip"><ImagesIcon /><span className="hidden xl:inline">Flip</span></ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup value={[String(count)]} onValueChange={(v) => v[0] && setC({ count: Number(v[0]) as 2 | 3 | 4, mode: Number(v[0]) > 2 ? "side" : s.compare.mode })} size="sm" spacing={0} aria-label="Comparison count">
            <ToggleGroupItem value="2">2-up</ToggleGroupItem>
            <ToggleGroupItem value="3" disabled={options.length < 3}>3-up</ToggleGroupItem>
            <ToggleGroupItem value="4" disabled={options.length < 4}>4-up</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {diverged && (
          <Badge variant="outline" className="gap-1.5 bg-background/90 pr-0.5 text-warning backdrop-blur">
            <TriangleAlertIcon /> Sides diverged: reset to compare
            <Button variant="ghost" size="xs" onClick={() => { A.reset(); B.reset(); if (count > 2) C.reset(); if (count > 3) D.reset() }}><RotateCcwIcon /> {count > 2 ? "Reset all" : "Reset both"}</Button>
          </Badge>
        )}
      </div>
      <div ref={box} onPointerDown={nav.onPointerDown} className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
       <div className="mx-auto my-auto flex w-max flex-col items-center gap-3">
       <div className="flex items-center justify-center gap-10">
        {!available && (
          <Empty className="max-w-sm bg-background">
            <EmptyHeader>
              <EmptyTitle>Nothing to compare on this axis</EmptyTitle>
              <EmptyDescription>{axisLabel} has fewer than two values for this scenario. Choose another changing axis.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {available && effectiveMode === "side" &&
          (["a", "b"] as const).map((k) => (
            <figure key={k} className="m-0 flex min-w-15 flex-col items-center gap-2">
              <SideCaption side={k.toUpperCase()} label={label(pick(k))} status={sideStatus((k === "a" ? A : B).st)} onReset={(k === "a" ? A : B).reset} />
              {side(k)}
            </figure>
          ))}
        {available && effectiveMode === "side" && compared.slice(2).map((value, index) => {
          const sideIndex = (index + 2) as 2 | 3
          const state = sideIndex === 2 ? C : D
          return (
            <figure key={`${sideIndex}:${value}`} className="m-0 flex min-w-15 flex-col items-center gap-2">
              <SideCaption side={String.fromCharCode(65 + sideIndex)} label={label(value)} status={sideStatus(state.st)} onReset={state.reset} />
              {extraSide(value, sideIndex)}
            </figure>
          )
        })}
        {available && effectiveMode === "split" && (
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
        {available && effectiveMode === "toggle" && (
          <div className="flex flex-col items-center gap-2">
            <ToggleGroup value={[showB ? "b" : "a"]} onValueChange={(v) => v[0] && setC({ showB: v[0] === "b" })} variant="outline" size="sm" spacing={0} className="bg-background/92">
              <ToggleGroupItem value="a">A · {label(a)}</ToggleGroupItem>
              <ToggleGroupItem value="b">B · {label(b)}</ToggleGroupItem>
            </ToggleGroup>
            {/* Both sides stay mounted so a flip is instant and each keeps its own state. The box takes the larger side. */}
            <div className="relative" style={{ width: Math.round(Math.max(pa.w, pb.w) * scale), height: Math.round(fitH * scale) }}>
              <div className={cn("absolute top-0 left-0", showB && "invisible")}>{side("a")}</div>
              <div className={cn("absolute top-0 left-0", !showB && "invisible")}>{side("b")}</div>
            </div>
            <p className="text-[11px] text-stage-muted">Press <Kbd>Space</Kbd> to flip between A and B.</p>
          </div>
        )}
       </div>
       {axis === "profile" && sides === 2 ? (
         <div className="flex flex-wrap items-center justify-center gap-2"><ScaleChip w={pa.w} h={pa.h} scale={scale} /><ScaleChip w={pb.w} h={pb.h} scale={scale} /></div>
       ) : (
         <ScaleChip w={(showB ? pb : pa).w} h={(showB ? pb : pa).h} scale={scale} />
       )}
       </div>
      </div>
      </StageNav>
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
  // Thumbnails are scaled previews: measure the first card and say so.
  const grid = React.useRef<HTMLDivElement>(null)
  const [thumbPct, setThumbPct] = React.useState<number | null>(null)
  React.useEffect(() => {
    const el = grid.current
    if (!el) return
    const measure = () => {
      const media = el.querySelector<HTMLElement>("[data-thumb]")
      setThumbPct(media ? Math.round((media.clientWidth / pr.w) * 100) : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pr.w, g.size, list.length])
  return (
    <Stage
      controls={false}
      footer={
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div role="toolbar" aria-label="Gallery controls" className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-popover/95 p-1 pl-3 shadow-[var(--dock-shadow)] backdrop-blur-md">
            <span className="text-xs text-muted-foreground">Size</span>
            <div className="w-28 px-1"><Slider min={160} max={400} step={20} value={[g.size]} onValueChange={(v) => { const next = Array.isArray(v) ? v[0] : v; if (Number.isFinite(next)) s.set({ gallery: { ...g, size: next } }) }} aria-label="Thumbnail size" /></div>
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
        <div ref={grid} className="grid gap-8 p-6 pb-24">
          <p className="text-xs text-stage-muted">
            {list.length} of {adapter.scenarios.length} · {themeOf(s.theme).label} · {pr.label} {pr.w} × {pr.h}{thumbPct != null && ` · thumbnails at about ${thumbPct}%`} · {g.source === "live" ? "live, mounted while visible" : "captures from the last verification run"} · a card opens Inspect
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
                      <div data-thumb className="relative overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: `${pr.w} / ${pr.h}` }}>
                        {x.status === "later" ? (
                          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">Not designed yet</div>
                        ) : g.source === "captures" ? (
                          cap ? <img src={cap.src} alt="" className="size-full object-cover object-top" /> : <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">No capture</div>
                        ) : (
                          <WhenVisible className="absolute inset-0">
                            {(width) => <ScenarioPreview scenario={x.id} theme={s.theme} profile={s.profile} values={s.values} draft={s.viewDraft(s.theme)} scale={width / pr.w} interactive={false} label={`${x.label} thumbnail`} className="[&_.preview-ticks]:hidden [&_.preview-frame]:rounded-none! [&_.preview-frame]:shadow-none" />}
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
  for (const [id, value] of Object.entries(st.values ?? {})) {
    const input = adapter.axes.inputs.find((candidate) => candidate.id === id)
    if (!input || (input.scoped && sc.designed?.[id] === undefined) || normalizeScenarioInput(input, sc, value) === undefined) return `The authored input ${id} is not supported by this step. Nothing was substituted.`
  }
  if (sc.status === "later") return `${sc.surface} is marked Later: it has no designed screen. Nothing was substituted.`
  if (!adapter.frameEntry && st.commands?.length) return "This step runs product commands, and this Studio has no live preview."
  if (!adapter.frameEntry && !captureFor(sc, st.theme ?? adapter.axes.themes[0].id, st.profile ?? adapter.axes.profiles[0].id)) return "No capture exists for this step."
  return null
}

const MAX_SEGMENTS = 24

export function PresentStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const priorPanels = React.useRef({ panelOpen: s.panelOpen, detailsOpen: s.detailsOpen })
  const focusActive = React.useRef(false)
  React.useEffect(() => {
    if (s.present.focus && !focusActive.current) {
      priorPanels.current = { panelOpen: s.panelOpen, detailsOpen: s.detailsOpen }
      focusActive.current = true
      s.set({ panelOpen: false, detailsOpen: false })
    } else if (!s.present.focus && focusActive.current) {
      focusActive.current = false
      s.set(priorPanels.current)
    }
  }, [s.present.focus, s.panelOpen, s.detailsOpen, s.set])
  const restorePanels = s.set
  React.useEffect(() => () => { if (focusActive.current) restorePanels(priorPanels.current) }, [restorePanels])
  const tour = s.walkthroughs.find((t) => t.id === s.present.tour) ?? s.walkthroughs[0]
  const box = React.useRef<HTMLDivElement>(null)
  const [st, setSt] = React.useState<LiveStatus | null>(null)
  const [statusKey, setStatusKey] = React.useState("")
  const [nonce, setNonce] = React.useState(0)
  const i = tour ? Math.min(s.present.step, tour.steps.length - 1) : 0
  const step = tour?.steps[i]
  const theme = step?.theme ?? s.theme
  const profile = step?.profile ?? s.profile
  const pr = profileOf(profile)
  const scale = useFit(box, pr.w, pr.h, s.zoom, 48)
  const stepKey = `${tour?.id ?? "none"}:${stepId(tour ?? { id: "none" }, step ?? { scenario: "none", narration: "" }, i)}:${JSON.stringify(step?.values ?? {})}:${nonce}`
  // A frame can report its final status after a new step has mounted. Only the
  // callback from this exact step may affect readiness, anchors, or playback.
  const currentStatus = statusKey === stepKey ? st : null
  // Runtime problems count too: a failed command or a missing anchor stops the step.
  const problem = !step ? null : staticProblem(step) ?? (currentStatus?.status === "error" && !currentStatus.previous ? `The step did not run: ${currentStatus.reason}` : currentStatus?.status === "ready" && step.anchor && !currentStatus.anchors.some((a) => a.id === step.anchor) ? `Anchor ${step.anchor} is missing from the preview. Nothing was highlighted in its place.` : null)
  const ready = !problem && (adapter.frameEntry ? currentStatus?.status === "ready" : true)
  const explored = !!currentStatus?.modified
  const go = (d: number) => tour && s.set({ present: { ...s.present, step: Math.max(0, Math.min(tour.steps.length - 1, i + d)), elapsed: 0 } })
  const authoredSeconds = stepSeconds(step)
  const secs = authoredSeconds / s.present.speed
  const set = s.set
  React.useEffect(() => {
    if (explored && s.present.playing) set((x) => ({ present: { ...x.present, playing: false } }))
  }, [explored, s.present.playing, set])
  // Hidden steps remain reviewable, but playback never gives one a timer. This
  // also catches a presenter hiding the current step while it is playing.
  React.useEffect(() => {
    if (!s.present.playing || !tour || !step?.hidden) return
    const next = nextVisibleIndex(tour, i)
    set((x) => next >= 0 ? { present: { ...x.present, step: next, elapsed: 0 } } : { present: { ...x.present, playing: false, elapsed: 0 } })
  }, [s.present.playing, tour, step?.hidden, i, set])
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
      const next = nextVisibleIndex(tour, x.present.step)
      const last = next < 0
      if (!last) return { present: { ...x.present, step: next, elapsed: 0 } }
      const tourIndex = s.walkthroughs.findIndex((candidate) => candidate.id === tour.id)
      const nextTour = x.present.playlist ? s.walkthroughs.slice(tourIndex + 1).find((candidate) => firstVisibleIndex(candidate) >= 0) : undefined
      return { present: nextTour ? { ...x.present, tour: nextTour.id, step: firstVisibleIndex(nextTour), elapsed: 0 } : { ...x.present, playing: false, playlist: false } }
    }), 100)
    return () => window.clearInterval(t)
  }, [s.present.playing, i, secs, problem, ready, tour, s.walkthroughs, set])
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
        <div ref={box} className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
         <div className="mx-auto my-auto flex w-max flex-col items-center gap-3">
          {staticProblem(step) ? (
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl bg-background/95 p-6 text-center text-sm shadow-sm">
              <TriangleAlertIcon className="size-5 text-danger" />
              <b>Step {i + 1} cannot run</b>
              <span className="text-muted-foreground">Its references don’t resolve. The Studio shows nothing in its place.</span>
            </div>
          ) : (
            <ScenarioPreview
              // Each step, and each edit of a step, mounts a fresh runtime: steps on one scenario that differ only in property values never carry product state over.
              key={`${i}:${stepKey}`}
              scenario={step.scenario}
              theme={theme}
              profile={profile}
              values={{ ...withoutLenses(s.values), ...step.values }}
              commands={step.commands}
              anchor={explored ? undefined : step.anchor}
              scale={scale}
              label={`Step ${i + 1} preview`}
              className="animate-in fade-in-0 zoom-in-[0.98] duration-300"
              onStatus={(next) => { setSt(next); setStatusKey(stepKey) }}
            />
          )}
          {!staticProblem(step) && <ScaleChip w={pr.w} h={pr.h} scale={scale} />}
         </div>
        </div>
      </div>
      <section aria-label="Narration" className="@container border-t bg-background">
        {tour.steps.length <= MAX_SEGMENTS ? (
          <div className="seg-track px-4 pt-3" aria-hidden>
            {tour.steps.map((x, j) => (
              <i key={j} data-state={staticProblem(x) || (j === i && problem) ? "unresolved" : j < i ? "done" : j === i ? "current" : "upcoming"} style={j === i ? ({ "--p": `${(s.present.elapsed / secs) * 100}%` } as React.CSSProperties) : undefined} />
            ))}
          </div>
        ) : (
          // Past 24 steps one bar replaces the segments; broken steps stay visible as marks on it.
          <div className="px-4 pt-3" aria-hidden>
            <div className="relative h-1 rounded-full bg-foreground/15">
              <div className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${((i + s.present.elapsed / secs) / tour.steps.length) * 100}%` }} />
              {tour.steps.map((x, j) => (staticProblem(x) || (j === i && problem) ? <i key={j} className="absolute -top-0.5 h-2 w-0.5 rounded-full bg-danger" style={{ left: `${(j / tour.steps.length) * 100}%` }} /> : null))}
            </div>
          </div>
        )}
        {/* The bar follows its own width, not the window's: one column, then the controls under the text, then three columns, so text and controls never overlap. */}
        <div className={cn("grid items-start gap-x-6 gap-y-3 px-4 pt-3 pb-4", !narrow && "@xl:grid-cols-[minmax(160px,1fr)_minmax(0,2.4fr)] @4xl:grid-cols-[minmax(160px,1fr)_minmax(0,2.4fr)_auto]")}>
          <div className="grid gap-1">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tour.name} · {i + 1} of {tour.steps.length}</p>
            {!narrow && <p className="text-xs leading-relaxed text-muted-foreground">{tour.goal}</p>}
            {tour.illustrative && <Badge variant="outline" className="w-fit border-dashed text-[10px]">Illustrative tour</Badge>}
          </div>
          <div aria-live="polite" className="grid min-w-0 gap-2 break-words">
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
            {step.hidden && <p className="text-xs text-muted-foreground">This step is hidden from autoplay. It remains available here for review.</p>}
          </div>
          <div role="group" aria-label="Walkthrough controls" className={cn("flex flex-wrap items-center gap-1", !narrow && "@xl:col-span-2 @4xl:col-span-1")}>
            <Button variant="outline" size="icon" aria-label="Previous step" disabled={i === 0} onClick={() => go(-1)}><ChevronLeftIcon /></Button>
            <Button size="icon" aria-label={s.present.playing ? "Pause" : "Play"} onClick={() => s.set({ present: { ...s.present, playing: !s.present.playing } })} disabled={!!problem}>
              {s.present.playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button variant="outline" size="sm" aria-label="Play all walkthroughs" onClick={() => {
              const first = s.walkthroughs.find((candidate) => firstVisibleIndex(candidate) >= 0)
              if (first) s.set({ present: { ...s.present, tour: first.id, step: firstVisibleIndex(first), elapsed: 0, playing: true, playlist: true } })
            }}>Play all</Button>
            <Button variant="outline" size="icon" aria-label="Next step" disabled={i === tour.steps.length - 1} onClick={() => go(1)}><ChevronRightIcon /></Button>
            <StepsPopover tour={tour} current={i} onPick={(j) => s.set({ present: { ...s.present, step: j, elapsed: 0 } })} />
            <PresenterEditor key={`${tour.id}:${stepId(tour, step, i)}`} tour={tour} step={step} index={i} />
            <PresenterTransfer />
            <Button variant="ghost" size="sm" aria-label="Focus presentation" aria-pressed={s.present.focus} onClick={() => s.set({ present: { ...s.present, focus: !s.present.focus } })}>Focus</Button>
            <Button variant="ghost" size="icon" aria-label="Exit walkthrough" onClick={() => s.set({ view: "inspect", present: { ...s.present, playing: false, playlist: false } })}><XIcon /></Button>
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

function PresenterTransfer() {
  const s = useStudio()
  const input = React.useRef<HTMLInputElement>(null)
  const exportOverlay = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(s.presenter, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "presenter-overlay.json"
    a.click()
    URL.revokeObjectURL(url)
  }
  const importOverlay = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 512 * 1024) throw new Error("The overlay is larger than 512 KB.")
      const value: unknown = JSON.parse(await file.text())
      if (!isPresenterOverlay(value)) throw new Error("Expected a valid version 1 presenter overlay")
      s.set({ presenter: importedOverlay(s.presenter, value) })
      toast.success("Presenter overlay imported")
    } catch (error) {
      toast.error("Presenter overlay was not imported", { description: error instanceof Error ? error.message : "The file is not valid JSON." })
    }
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Import or export presenter overlay" />}><ArrowLeftRightIcon /></PopoverTrigger>
      <PopoverContent side="top" align="end" className="grid w-64 gap-2 text-xs">
        <p className="text-muted-foreground">Presenter changes are stored locally and can be exchanged as raw JSON without changing generated adapter data.</p>
        <Button size="sm" variant="outline" onClick={exportOverlay}>Export raw JSON</Button>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => {
          const file = event.target.files?.[0]
          // Clear the choice so picking the same file again (after fixing it) imports again.
          event.target.value = ""
          void importOverlay(file)
        }} />
        <Button size="sm" variant="outline" onClick={() => input.current?.click()}>Import raw JSON</Button>
      </PopoverContent>
    </Popover>
  )
}

/** A deliberately small, local editor for presenter-owned material. Generated adapter records stay read-only. */
function PresenterEditor({ tour, step, index }: { tour: { id: string; name: string; goal: string; steps: Step[] }; step: Step; index: number }) {
  const s = useStudio()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(tour.name)
  const [goal, setGoal] = React.useState(tour.goal)
  const [narration, setNarration] = React.useState(step.narration)
  const [seconds, setSeconds] = React.useState(String(step.duration ?? ""))
  // Opening reads the current tour and step, so a rename or an imported overlay since the last edit is never overwritten on Save.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setName(tour.name)
      setGoal(tour.goal)
      setNarration(step.narration)
      setSeconds(String(step.duration ?? ""))
    }
    setOpen(next)
  }
  const save = () => {
    const duration = Number(seconds)
    const id = stepId(tour, step, index)
    const steps = { ...s.presenter.tours[tour.id]?.steps, [id]: { ...s.presenter.tours[tour.id]?.steps?.[id], narration, ...(Number.isFinite(duration) && duration > 0 ? { duration } : {}) } }
    s.updatePresenter(tour.id, { name, goal, steps })
    setOpen(false)
  }
  const setHidden = (hidden: boolean) => {
    const id = stepId(tour, step, index)
    const steps = { ...s.presenter.tours[tour.id]?.steps, [id]: { ...s.presenter.tours[tour.id]?.steps?.[id], hidden } }
    s.updatePresenter(tour.id, { steps })
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Edit walkthrough" />}><PencilIcon /></PopoverTrigger>
      <PopoverContent side="top" align="end" className="grid w-80 gap-3">
        <label className="grid gap-1 text-xs">Walkthrough name<input className="h-8 rounded-md border bg-background px-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1 text-xs">Goal<textarea className="min-h-16 rounded-md border bg-background p-2 text-sm" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
        <label className="grid gap-1 text-xs">Step narration<textarea className="min-h-20 rounded-md border bg-background p-2 text-sm" value={narration} onChange={(e) => setNarration(e.target.value)} /></label>
        <label className="grid gap-1 text-xs">Seconds<input className="h-8 rounded-md border bg-background px-2 text-sm" type="number" min="0.5" step="0.5" placeholder="Automatic" value={seconds} onChange={(e) => setSeconds(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!step.hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide from autoplay</label>
        <Button size="sm" onClick={save}>Save presenter overlay</Button>
      </PopoverContent>
    </Popover>
  )
}

/** Every step of the walkthrough, to jump to one. It lives with the player so it works with the panel closed. */
function StepsPopover({ tour, current, onPick }: { tour: { steps: Step[] }; current: number; onPick: (i: number) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="All steps" />}>
        <ListIcon /> <span className="max-[420px]:sr-only">All steps</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[26rem] max-w-[calc(100vw-1.5rem)] gap-0 p-1">
        <ScrollArea className="max-h-[min(22rem,50svh)]">
          <ol aria-label="All steps" className="grid gap-0.5">
            {tour.steps.map((st, j) => {
              const sc = adapter.scenarios.find((x) => x.id === st.scenario)
              const problem = staticProblem(st)
              return (
                <li key={j}>
                  <button
                    type="button"
                    aria-current={j === current ? "step" : undefined}
                    className={cn("flex w-full gap-2.5 rounded-lg p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", j === current && "bg-muted", problem && "text-danger")}
                    onClick={() => {
                      onPick(j)
                      setOpen(false)
                    }}
                  >
                    <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", problem ? "bg-danger-surface text-danger" : j === current ? "bg-foreground text-background" : j < current ? "bg-muted-foreground/25" : "bg-muted")}>{problem ? "!" : j + 1}</span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="line-clamp-2 text-xs leading-snug">{st.narration}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{sc ? sc.label : st.scenario}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

type TokenRow = { key: string; kind: "family"; name: string; count: number; open: boolean } | { key: string; kind: "token"; token: import("@/studio/types").Token }
const FAMILY_ROW = 32
const TOKEN_ROW = 56
/** Families larger than this start folded, so a huge token set opens as a short list of families. */
const FOLD_OVER = 60

export function TokensStage() { return adapter.design?.editor ? <CompiledInspector /> : <LegacyTokensStage /> }
function LegacyTokensStage() {
  const s = useStudio()
  const t = adapter.tokens!
  const q = s.tokens.query.toLowerCase()
  const family = s.tokens.family
  const familyCount = t.families.find((g) => g.name === family)?.count
  const [ca, cb] = t.columns
  const [showTheme, setShowTheme] = React.useState(ca)
  const [showDraft, setShowDraft] = React.useState(true)
  const [folds, setFolds] = React.useState<Record<string, boolean>>({})
  const drafts = Object.keys(s.tokens.drafts).length
  const matches = React.useMemo(
    () =>
      t.tokens.filter(
        (x) =>
          (!family || x.family === family) &&
          (!q || `${x.name} ${Object.values(x.values).join(" ")}`.toLowerCase().includes(q)) &&
          (s.tokens.flag === "all" || (s.tokens.flag === "unread" && x.flags?.includes("unread")) || (s.tokens.flag === "literal" && x.flags?.includes("literal")) || (s.tokens.flag === "draft" && !!s.tokens.drafts[x.name]))
      ),
    [t.tokens, family, q, s.tokens.flag, s.tokens.drafts]
  )
  const narrowed = !!q || !!family || s.tokens.flag !== "all"
  const rows = React.useMemo(() => {
    const out: TokenRow[] = []
    const names = [...new Set(matches.map((x) => x.family))]
    for (const name of names) {
      const items = matches.filter((x) => x.family === name)
      // An explicit fold wins; otherwise big families fold unless the view is already narrowed.
      const open = folds[name] ?? (narrowed || items.length <= FOLD_OVER)
      out.push({ key: `family:${name}`, kind: "family", name, count: items.length, open })
      if (open) for (const token of items) out.push({ key: token.name, kind: "token", token })
    }
    return out
  }, [matches, folds, narrowed])
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const found = rows.findIndex((r) => r.key === (activeKey ?? s.tokens.selected))
  const active = found >= 0 ? found : 0
  const handle = React.useRef<VirtualListHandle>(null)
  // On a touch screen a family row is a 44 px target. Below 1024 px the stage sits under the table and a token's values take the full width.
  const coarse = useCoarse()
  const stacked = useMedia("(max-width: 1023px)")
  const heightOf = React.useCallback((i: number) => (rows[i].kind === "family" ? (coarse ? 44 : FAMILY_ROW) : TOKEN_ROW), [rows, coarse])
  const ground = (theme: string) => t.grounds?.[theme] ?? (themeOf(theme).appearance === "dark" ? "#111111" : "#ffffff")
  const pval = (v: string | undefined, theme: string, draft?: string) => (
    <span className="flex min-w-0 items-center gap-2">
      {v && isColor(v) && (
        <span className="relative flex h-5 w-7 shrink-0 items-center justify-center rounded ring-1 ring-border" style={{ background: ground(theme) }}>
          <span className="size-3 rounded-[3px]" style={{ background: draft && CSS.supports("color", draft) ? draft : v }} />
        </span>
      )}
      <code className={cn("font-mono text-xs", stacked ? "line-clamp-2 break-all" : "truncate", draft && "text-info")} title={v}>{draft ?? v ?? "none"}</code>
    </span>
  )
  const select = (name: string) => s.set({ tokens: { ...s.tokens, selected: name }, detailsOpen: true })
  const toggleFamily = (name: string, open: boolean) => setFolds((m) => ({ ...m, [name]: !open }))
  const box = React.useRef<HTMLDivElement>(null)
  const pr = profileOf(s.profile)
  const scale = useFit(box, pr.w, pr.h, s.zoom, 40)
  const COLS = stacked ? "grid-cols-2 gap-y-1" : "grid-cols-[minmax(0,42%)_minmax(0,1fr)_minmax(0,1fr)]"
  const report = useReportStatus()
  return (
    <ResizablePanelGroup key={String(stacked)} orientation={stacked ? "vertical" : "horizontal"} className="min-h-0 flex-1">
      <ResizablePanel defaultSize={stacked ? "50" : "60"} minSize="40">
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
            <span>{family ? `${family} · ` : ""}{matches.length} shown of {familyCount ?? t.total} · read from {t.source} at {adapter.product.revision}</span>
            <span className="ml-auto hidden lg:inline">Product values sit on the product’s own ground</span>
          </div>
          <div className={cn("grid border-b py-2 pr-4 pl-4 text-xs font-medium text-muted-foreground [scrollbar-gutter:stable]", COLS)} aria-hidden>
            <span className={cn(stacked && "sr-only")}>Token</span>
            <span>{themeOf(ca).label}</span>
            <span>{themeOf(cb).label}</span>
          </div>
          {rows.length === 0 ? (
            <Empty className="border-0 py-12">
              <EmptyHeader>
                <EmptyTitle className="text-sm">No token matches</EmptyTitle>
                <EmptyDescription className="text-xs">Clear the search, the flag or the family.</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" size="sm" onClick={() => s.set({ tokens: { ...s.tokens, family: null, query: "", flag: "all" } })}>Show all tokens</Button>
            </Empty>
          ) : (
            <VirtualList
              ref={handle}
              role="treegrid"
              aria-label="Tokens"
              aria-rowcount={rows.length}
              className="[scrollbar-gutter:stable]"
              count={rows.length}
              rowHeight={heightOf}
              active={active}
              onActiveChange={(i) => setActiveKey(rows[i].key)}
              label={(i) => { const r = rows[i]; return r.kind === "family" ? r.name : r.token.name.replace(/^-+/, "") }}
              onRowKeyDown={(e, i) => {
                const r = rows[i]
                if (r.kind !== "family") return
                if (e.key === "ArrowRight" && !r.open) { e.preventDefault(); toggleFamily(r.name, r.open) }
                if (e.key === "ArrowLeft" && r.open) { e.preventDefault(); toggleFamily(r.name, r.open) }
              }}
              rowProps={(i) => {
                const r = rows[i]
                if (r.kind === "family")
                  return {
                    role: "row",
                    "aria-rowindex": i + 1,
                    "aria-expanded": r.open,
                    onClick: () => toggleFamily(r.name, r.open),
                    className: "flex cursor-default items-center gap-1.5 border-b bg-muted/40 px-4 text-xs font-medium select-none hover:bg-muted outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]",
                  }
                return {
                  role: "row",
                  "aria-rowindex": i + 1,
                  "aria-selected": s.tokens.selected === r.token.name,
                  onClick: () => select(r.token.name),
                  className: cn("grid cursor-default items-center gap-x-2 border-b px-4 select-none hover:bg-muted/50 outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]", COLS, s.tokens.selected === r.token.name && "bg-muted"),
                }
              }}
            >
              {(i) => {
                const r = rows[i]
                if (r.kind === "family")
                  return (
                    <div role="gridcell" className="flex min-w-0 flex-1 items-center gap-1.5">
                      <ChevronRightIcon className={cn("size-3.5 transition-transform duration-200", r.open && "rotate-90")} />
                      {r.name}
                      <span className="font-normal text-muted-foreground tabular-nums">{r.count}</span>
                      {!r.open && <span className="ml-auto font-normal text-muted-foreground">Folded</span>}
                    </div>
                  )
                const x = r.token
                const d = s.tokens.drafts[x.name]
                return (
                  <>
                    <div className={cn("grid min-w-0 gap-0.5", stacked && "col-span-2 flex items-center gap-2")} role="gridcell">
                      <code className="truncate font-mono text-xs font-medium">{x.name}</code>
                      <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="shrink-0">{x.reads != null ? `${x.reads} reads` : "reads unknown"}</span>
                        {d && <StatusBadge kind="draft">Draft</StatusBadge>}
                        {x.flags?.includes("unread") && <Badge variant="outline" className="h-4 px-1 text-[10px] text-warning">Unread</Badge>}
                        {x.flags?.includes("literal") && <Badge variant="outline" className="h-4 px-1 text-[10px]">Fixed</Badge>}
                        {x.flags?.includes("coupled") && <Badge variant="outline" className="h-4 px-1 text-[10px] text-info">Coupled</Badge>}
                      </span>
                    </div>
                    <div role="gridcell" className="min-w-0">{pval(x.values[ca], ca, d?.[ca])}</div>
                    <div role="gridcell" className="min-w-0">{pval(x.values[cb], cb, d?.[cb])}</div>
                  </>
                )
              }}
            </VirtualList>
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={stacked ? "50" : "40"} minSize="25">
        <div className="stage-surface flex h-full min-h-0 flex-col">
          <div ref={box} className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
           <div className="mx-auto my-auto flex w-max flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg bg-background/92 p-1 text-xs shadow-sm backdrop-blur">
              <ToggleGroup value={[showTheme]} onValueChange={(v) => v[0] && setShowTheme(v[0])} size="sm" spacing={0} aria-label="Preview theme">
                {[ca, cb].map((id) => <ToggleGroupItem key={id} value={id} className="h-6 px-2 text-xs">{themeOf(id).label}</ToggleGroupItem>)}
              </ToggleGroup>
              <Separator orientation="vertical" className="h-4! self-center!" />
              <ToggleGroup value={[showDraft ? "draft" : "baseline"]} onValueChange={(v) => v[0] && setShowDraft(v[0] === "draft")} size="sm" spacing={0} aria-label="Values">
                <ToggleGroupItem value="baseline" className="h-6 px-2 text-xs">Baseline</ToggleGroupItem>
                <ToggleGroupItem value="draft" className="h-6 px-2 text-xs" disabled={!s.hasDraft}>Draft{drafts ? ` · ${drafts}` : ""}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <ScenarioPreview scenario={s.scenario} theme={showTheme} profile={s.profile} values={s.values} draft={showDraft ? s.draftFor(showTheme) : NO_DRAFT} onStatus={report} scale={scale} label="Token preview" />
            <ScaleChip w={pr.w} h={pr.h} scale={scale} />
            <p className="w-0 min-w-full text-center text-[11px] text-stage-muted">One draft layer: Adjust's values, with tokens edited here winning. It applies in the Design view only and never changes the product.</p>
           </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
