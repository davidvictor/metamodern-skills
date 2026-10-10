import { LazyRegionBoundary } from "./bits"
import * as React from "react"
import { MonitorSmartphoneIcon, NextIcon, ColumnsIcon, KeyboardIcon, LayoutGridIcon, PresentationIcon, ScanEyeIcon, SearchIcon, SwatchBookIcon, TriangleAlertIcon, CircleDashedIcon, CircleAlertIcon, BookmarkIcon } from "@/icons"
import { cn } from "@/lib/utils"
import { useCoarse } from "@/hooks/use-mobile"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenuButton } from "@/components/ui/sidebar"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Field, FieldLabel } from "@/components/ui/field"
import { adapter } from "@/adapter"
import { areaCount, captureFor, hasAdjust, hasDesign, useStudio, type View } from "@/store"
import { ResponsivePanel } from "./responsive"
import type { Scenario } from "@/studio/types"
import { VirtualList, type VirtualListHandle } from "@/studio/virtual-list"
import { savedComparison } from "@/studio/compare"
import { ProductMark } from "./bits"
import { staticProblem } from "./views"
import { Slot, WorkspaceNav, WorkspacePage } from "@/studio/workspace/slots"
import { LibraryNav, LibraryPage, LibrarySlot } from "@/studio/library/slots"
import { provenanceSummary } from "@/studio/build-info"

const TokensPanel = React.lazy(() => import("./design-tokens").then(module => ({ default: module.TokensPanel })))
const AdjustPanel = React.lazy(() => import("./design").then(module => ({ default: module.AdjustPanel })))


/** Joined filter segments sized to fit a 272 px panel: small type, tight padding, never wider than their column. */
const SEG = "h-7 min-w-0 gap-1 px-1.5 text-xs"


/** The five views. Design appears only when the adapter declares design parameters or a token source. */
export const VIEWS: { id: View; label: string; icon: React.ElementType; key: string }[] = [
  { id: "inspect" as View, label: "Inspect", icon: ScanEyeIcon, key: "1" },
  { id: "compare" as View, label: "Compare", icon: ColumnsIcon, key: "2" },
  { id: "responsive" as View, label: "Responsive", icon: MonitorSmartphoneIcon, key: "6" },
  { id: "gallery" as View, label: "Gallery", icon: LayoutGridIcon, key: "3" },
  { id: "present" as View, label: "Present", icon: PresentationIcon, key: "4" },
  { id: "design" as View, label: "Design", icon: SwatchBookIcon, key: "5" },
].filter((v) => v.id !== "design" || hasDesign)


/** A rail item: square, full rail width, straight marker on the edge, inset focus ring. A hint (why a workspace module cannot open) shows in its tooltip. */
export function RailButton({ label, keyHint, labels, active, hint, onClick, children }: { label: string; keyHint?: string; labels?: boolean; active?: boolean; hint?: string; onClick: () => void; children: React.ReactNode }) {
  const button = (
    <button
      type="button"
      aria-pressed={active}
      aria-label={labels ? undefined : label}
      onClick={onClick}
      className={cn(
        "relative flex w-full shrink-0 items-center justify-center text-sidebar-foreground/65 outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:text-sidebar-foreground focus-visible:shadow-[inset_0_0_0_2px_var(--sidebar-ring)] [&_svg]:size-[18px] [&_svg]:shrink-0",
        labels ? "h-14 flex-col gap-1 text-xs font-medium" : "h-10",
        active && "bg-sidebar-accent text-(--rail-active) before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-sidebar-primary hover:text-(--rail-active)"
      )}
    >
      {children}
      {labels && <span>{label}</span>}
    </button>
  )
  if (labels && !hint) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" className={cn(hint && "max-w-64 flex-col items-start")}>
        {hint ? (
          <>
            <span className="font-medium">{label}</span>
            <span>{hint}</span>
          </>
        ) : (
          <>
            {label}
            {keyHint && <Kbd>{keyHint}</Kbd>}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}


export function Rail({ labels }: { labels: boolean }) {
  const s = useStudio()
  return (
    <Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r" aria-label="Studio">
      <SidebarHeader className="items-center">
        <Tooltip>
          <TooltipTrigger render={<div tabIndex={0} role="img" className="flex size-8 items-center justify-center rounded-lg bg-(--mark-fill,var(--sidebar-primary)) text-xs font-semibold text-(--mark-ink,var(--sidebar-primary-foreground)) outline-none ring-sidebar-ring focus-visible:ring-2" aria-label={`${adapter.product.name} Studio`} />}>
            <ProductMark width={19} decorative />
          </TooltipTrigger>
          <TooltipContent side="right">{adapter.product.name} Studio · {adapter.product.revision}</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        {/* The library comes first, above the views, with a divider after it. While its chunk loads, two blocks the size of
            the item and the divider hold their places in the same gaps, so the views do not move when it arrives. */}
        <LibrarySlot
          fallback={
            <>
              <div aria-hidden className={cn("shrink-0", labels ? "h-16" : "h-12")} />
              <div aria-hidden className="mx-2 my-1 h-px shrink-0" />
            </>
          }
        >
          <LibraryNav part="rail" labels={labels} />
        </LibrarySlot>
        <nav aria-label="Views" className="flex flex-col py-1">
          {VIEWS.map((v) => (
            <RailButton key={v.id} label={v.label} keyHint={v.key} labels={labels} active={!s.module && !s.library && s.view === v.id} onClick={() => s.setView(v.id)}>
              <v.icon />
            </RailButton>
          ))}
        </nav>
        <Slot>
          <WorkspaceNav part="rail" labels={labels} />
        </Slot>
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0 pb-2">
        <RailButton label="Go to scenario" keyHint="⌘K" onClick={() => s.set({ commandOpen: true })}>
          <SearchIcon />
        </RailButton>
        <RailButton label="Keyboard shortcuts" keyHint="?" onClick={() => s.set({ shortcutsOpen: true })}>
          <KeyboardIcon />
        </RailButton>
      </SidebarFooter>
    </Sidebar>
  )
}


export function PanelHeader({ title, count, children }: { title: string; count?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <SidebarHeader className="gap-3 border-b p-3">
      <div className="flex h-7 items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count != null && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
      </div>
      {children}
    </SidebarHeader>
  )
}


export function SearchField({ placeholder, value, onChange, id }: { placeholder: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <InputGroup className="h-8 bg-background">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput id={id} data-search placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onChange("")} />
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  )
}


type CatalogRow =
  | { key: string; kind: "area"; areaId: string; label: string; count: number; open: boolean }
  | { key: string; kind: "scenario"; sc: Scenario; level: 1 | 2; parent: string }


const STEP_ROW = 84

const AREA_ROW = 30

const SCENARIO_ROW = 32

const RING = "outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--sidebar-ring)]"


function CatalogPanel({ compare }: { compare?: boolean }) {
  const s = useStudio()
  const [q, setQ] = React.useState("")
  const [filter, setFilter] = React.useState<string[]>(["all"])
  const all = adapter.scenarios
  const f = filter[0] ?? "all"
  const filtering = !!q || f !== "all"
  const flagged = (x: Scenario) => x.status === "unresolved" || x.status === "later"
  const list = React.useMemo(
    () => all.filter((x) => (!q || `${x.label} ${x.surface} ${x.area} ${x.state ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (f === "all" || (f === "stale" && x.status === "stale") || (f === "unresolved" && flagged(x)))),
    [all, q, f]
  )
  const stale = all.filter((x) => x.status === "stale").length
  const unres = all.filter(flagged).length
  // Under 30 scenarios every group starts open; larger catalogs open only the current group.
  const [openAreas, setOpenAreas] = React.useState<Record<string, boolean>>(() => Object.fromEntries(adapter.areas.map((a) => [a.id, all.length <= 30 || a.id === s.scenarioObj.area])))
  // A scenario chosen elsewhere (Go to, Gallery) opens its group. Adjusted during render, not in an effect.
  const [seen, setSeen] = React.useState(s.scenarioObj.id)
  if (seen !== s.scenarioObj.id) {
    setSeen(s.scenarioObj.id)
    if (!openAreas[s.scenarioObj.area]) setOpenAreas({ ...openAreas, [s.scenarioObj.area]: true })
  }
  const live = !!adapter.frameEntry
  const rows = React.useMemo(() => {
    const out: CatalogRow[] = []
    for (const area of adapter.areas) {
      const items = list.filter((x) => x.area === area.id)
      if (items.length === 0 && filtering) continue
      const open = filtering ? true : !!openAreas[area.id]
      out.push({ key: `area:${area.id}`, kind: "area", areaId: area.id, label: area.label, count: filtering ? items.length : areaCount(area.id), open })
      if (!open) continue
      const ids = new Set(items.map((x) => x.id))
      for (const x of items.filter((x) => !x.parent || !ids.has(x.parent))) {
        out.push({ key: x.id, kind: "scenario", sc: x, level: 1, parent: `area:${area.id}` })
        for (const k of items.filter((k) => k.parent === x.id)) out.push({ key: k.id, kind: "scenario", sc: k, level: 2, parent: x.id })
      }
    }
    return out
  }, [list, openAreas, filtering])
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const found = rows.findIndex((r) => r.key === (activeKey ?? s.scenarioObj.id))
  const active = found >= 0 ? found : 0
  const handle = React.useRef<VirtualListHandle>(null)
  // On a touch screen every row is a 44 px target.
  const coarse = useCoarse()
  const heightOf = React.useCallback((i: number) => (coarse ? 44 : rows[i].kind === "area" ? AREA_ROW : SCENARIO_ROW), [rows, coarse])
  const toggle = (areaId: string) => setOpenAreas((m) => ({ ...m, [areaId]: !m[areaId] }))
  const reveal = rows.findIndex((r) => r.key === s.scenarioObj.id)
  return (
    <>
      <PanelHeader title="Catalog" count={filtering ? `${list.length} of ${all.length}` : all.length}>
        <SearchField id="catalog-search" placeholder="Search scenarios" value={q} onChange={setQ} />
        <ToggleGroup value={filter} onValueChange={(v) => setFilter(v.length ? v : ["all"])} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-[1fr_1fr_1.45fr]" aria-label="Filter by status">
          <ToggleGroupItem value="all" className={SEG}>All</ToggleGroupItem>
          <ToggleGroupItem value="stale" className={SEG}>Stale<span className="tabular-nums opacity-55">{stale}</span></ToggleGroupItem>
          <ToggleGroupItem value="unresolved" className={SEG}>Unresolved<span className="tabular-nums opacity-55">{unres}</span></ToggleGroupItem>
        </ToggleGroup>
      </PanelHeader>
      {compare && !!adapter.comparisons?.length && (
        <div className="border-b p-2">
          <p className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/70">Saved comparisons</p>
          {adapter.comparisons.map((c) => (
            <SidebarMenuButton key={c.id} size="sm" onClick={() => {
              s.set({ compare: { ...s.compare, axis: c.axis ?? "theme", ...savedComparison(c, s.compare.a, s.compare.b), editable: c.editable ?? true } })
              if (c.scenario) s.selectScenario(c.scenario)
            }}>
              <BookmarkIcon />
              <span>{c.label}</span>
            </SidebarMenuButton>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No scenario matches. Clear the search or the filter.</p>
      ) : (
        <VirtualList
          ref={handle}
          role="tree"
          aria-label="Scenarios"
          className="px-2 py-1"
          count={rows.length}
          rowHeight={heightOf}
          active={active}
          onActiveChange={(i) => setActiveKey(rows[i].key)}
          reveal={reveal}
          label={(i) => { const r = rows[i]; return r.kind === "area" ? r.label : r.sc.label }}
          onRowKeyDown={(e, i) => {
            const r = rows[i]
            if (e.key === "ArrowRight" && r.kind === "area") {
              e.preventDefault()
              if (!r.open) toggle(r.areaId)
              else if (rows[i + 1]?.kind === "scenario") handle.current?.focusIndex(i + 1)
            } else if (e.key === "ArrowLeft") {
              e.preventDefault()
              if (r.kind === "area" && r.open && !filtering) toggle(r.areaId)
              else if (r.kind === "scenario") handle.current?.focusIndex(rows.findIndex((x) => x.key === r.parent))
            }
          }}
          rowProps={(i) => {
            const r = rows[i]
            if (r.kind === "area")
              return {
                role: "treeitem",
                "aria-level": 1,
                "aria-expanded": r.open,
                onClick: () => !filtering && toggle(r.areaId),
                className: cn("flex items-center gap-1 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 select-none hover:bg-sidebar-accent", RING),
              }
            const selected = s.scenarioObj.id === r.sc.id
            return {
              role: "treeitem",
              "aria-level": r.level + 1,
              "aria-selected": selected,
              title: r.sc.label,
              onClick: () => s.selectScenario(r.sc.id),
              className: cn("flex cursor-default items-center gap-2 rounded-md pr-2 text-[13px] select-none hover:bg-sidebar-accent", r.level === 1 ? "pl-2" : "pl-6", r.sc.status === "later" && "text-muted-foreground", selected && "bg-sidebar-accent font-medium text-sidebar-accent-foreground", RING),
            }
          }}
        >
          {(i) => {
            const r = rows[i]
            if (r.kind === "area")
              return (
                <>
                  <NextIcon className={cn("size-3.5 shrink-0 transition-transform duration-200", r.open && "rotate-90")} />
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto font-normal tracking-normal tabular-nums normal-case">{r.count}</span>
                </>
              )
            return (
              <>
                <span className="truncate">{r.sc.label}</span>
                {r.sc.savedFrom && <span className="ml-auto shrink-0 text-xs text-muted-foreground">Saved</span>}
                <RowMark status={r.sc.status} noCapture={!live && !captureFor(r.sc, s.theme, s.profile)} />
              </>
            )
          }}
        </VirtualList>
      )}
    </>
  )
}


function RowMark({ status, noCapture }: { status?: string; noCapture: boolean }) {
  if (status === "stale") return <TriangleAlertIcon className="ml-auto size-3.5 shrink-0 text-warning" aria-label="Stale: source changed since the last evidence" />
  if (status === "unresolved") return <CircleAlertIcon className="ml-auto size-3.5 shrink-0 text-danger" aria-label="Unresolved: a reference is broken" />
  if (status === "later") return <CircleDashedIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-label="Later: not designed yet" />
  if (noCapture) return <span className="ml-auto size-1.5 shrink-0 rounded-full border border-muted-foreground/60" role="img" aria-label="No capture for this theme and profile" />
  return null
}


function GalleryPanel() {
  const s = useStudio()
  const g = s.gallery
  const setG = (patch: Partial<typeof g>) => s.set({ gallery: { ...g, ...patch } })
  return (
    <>
      <PanelHeader title="Filter gallery" count={adapter.scenarios.length}>
        <SearchField id="gallery-search" placeholder="Search scenarios" value={g.query} onChange={(v) => setG({ query: v })} />
      </PanelHeader>
      <SidebarContent className="gap-4 p-3">
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Areas</p>
          {adapter.areas.map((a) => (
            <Label key={a.id} className="flex items-center gap-2 font-normal pointer-coarse:min-h-11">
              <Checkbox checked={!g.hidden.includes(a.id)} onCheckedChange={(v) => setG({ hidden: v ? g.hidden.filter((x) => x !== a.id) : [...g.hidden, a.id] })} />
              <span className="flex-1 truncate">{a.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{areaCount(a.id)}</span>
            </Label>
          ))}
        </div>
        <Separator />
        <Label className="flex items-center justify-between font-normal pointer-coarse:min-h-11">
          Only stale, unresolved or later
          <Switch size="sm" checked={g.onlyFlagged} onCheckedChange={(v) => setG({ onlyFlagged: v })} />
        </Label>
      </SidebarContent>
    </>
  )
}


function PresentPanel() {
  const s = useStudio()
  const tours = s.walkthroughs
  const tour = tours.find((t) => t.id === s.present.tour) ?? tours[0]
  if (!tour) return <PanelHeader title="Walkthrough" count="none yet" />
  return (
    <>
      <PanelHeader title="Walkthrough" count={`${tour.steps.length} steps`}>
        <Select value={tour.id} items={Object.fromEntries(tours.map((t) => [t.id, t.name]))} onValueChange={(v) => v && s.set({ present: { ...s.present, tour: v as string, step: 0, elapsed: 0, playing: false, playlist: false } })}>
          <SelectTrigger className="w-full" aria-label="Walkthrough"><SelectValue /></SelectTrigger>
          <SelectContent>{tours.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">{tour.goal}</p>
      </PanelHeader>
      <VirtualList
        role="list"
        aria-label="Steps"
        className="p-2"
        count={tour.steps.length}
        rowHeight={STEP_ROW}
        active={s.present.step}
        onActiveChange={(i) => s.set({ present: { ...s.present, step: i, elapsed: 0 } })}
        reveal={s.present.step}
        label={(i) => tour.steps[i].narration}
        rowProps={(i) => {
          const st = tour.steps[i]
          const problem = staticProblem(st, s.theme)
          return {
            role: "listitem",
            "aria-current": i === s.present.step ? "step" : undefined,
            onClick: () => s.set({ present: { ...s.present, step: i, elapsed: 0 } }),
            className: cn("flex cursor-default gap-2.5 rounded-lg p-2 text-left transition-colors select-none hover:bg-sidebar-accent", RING, i === s.present.step && "bg-sidebar-accent", problem && "text-danger"),
          }
        }}
      >
        {(i) => {
          const st = tour.steps[i]
          const sc = adapter.scenarios.find((x) => x.id === st.scenario)
          const problem = staticProblem(st, s.theme)
          const current = i === s.present.step
          return (
            <>
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums", problem ? "bg-danger-surface text-danger" : current ? "bg-foreground text-background" : i < s.present.step ? "bg-muted-foreground/25" : "bg-muted")}>{problem ? "!" : i + 1}</span>
              <span className="grid min-w-0 gap-0.5 self-start">
                <span className={cn("line-clamp-3 text-xs leading-snug", problem ? "text-danger" : "text-sidebar-foreground/85")}>{st.narration}</span>
                <span className="truncate text-xs text-muted-foreground">{sc ? sc.label : st.scenario}{st.commands?.length ? ` · ${st.commands.length} ${st.commands.length === 1 ? "command" : "commands"}` : ""}</span>
              </span>
            </>
          )
        }}
      </VirtualList>
      <SidebarFooter className="gap-3 border-t p-3">
        {/* The whole row is the label, so the switch keeps its target beside the panel's edge handle. */}
        <Label className="flex items-center justify-between font-normal pointer-coarse:min-h-11">
          Autoplay
          <Switch id="autoplay" size="sm" checked={s.present.playing} onCheckedChange={(v) => s.set({ present: { ...s.present, playing: v } })} />
        </Label>
        <Field orientation="horizontal" className="justify-between">
          <FieldLabel className="font-normal">Pace</FieldLabel>
          <ToggleGroup value={[String(s.present.speed)]} onValueChange={(v) => v[0] && s.set({ present: { ...s.present, speed: +v[0] } })} size="sm" variant="outline" spacing={0}>
            <ToggleGroupItem value="0.75">Slow</ToggleGroupItem>
            <ToggleGroupItem value="1">Normal</ToggleGroupItem>
            <ToggleGroupItem value="1.4">Fast</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </SidebarFooter>
    </>
  )
}


function ResponsiveSide() {
  const s = useStudio()
  return (
    <>
      <PanelHeader title="Responsive" count={s.responsive.frames.length} />
      <ResponsivePanel />
    </>
  )
}


/** Design: Adjust and Tokens over one draft layer; a tab shows only when the adapter supplies it. */
function DesignPanel() {
  const s = useStudio()
  const both = hasAdjust && !!adapter.tokens
  const tab = !adapter.tokens ? "adjust" : !hasAdjust ? "tokens" : s.design.tab
  const tabs = both && (
    <ToggleGroup value={[tab]} onValueChange={(v) => v[0] && s.setDesign({ tab: v[0] as "adjust" | "tokens" })} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-2" aria-label="Design tab">
      <ToggleGroupItem value="adjust" className="h-7 text-xs">Adjust</ToggleGroupItem>
      <ToggleGroupItem value="tokens" className="h-7 text-xs">Tokens</ToggleGroupItem>
    </ToggleGroup>
  )
  return (
    <>
      <PanelHeader title={both || tab === "adjust" ? "Design" : "Tokens"} count={!both && tab === "tokens" && !adapter.design?.editor ? adapter.tokens?.total : undefined}>{tabs}</PanelHeader>
      {tab === "tokens" ? <LazyRegionBoundary key="tokens" label="Token controls"><React.Suspense fallback={<p role="status" className="p-3 text-sm text-muted-foreground">Loading token controls</p>}><TokensPanel /></React.Suspense></LazyRegionBoundary> : <LazyRegionBoundary key="adjust" label="Adjustments"><React.Suspense fallback={<p role="status" className="p-3 text-sm text-muted-foreground">Loading adjustments</p>}><AdjustPanel /></React.Suspense></LazyRegionBoundary>}
    </>
  )
}



/** Where this build came from: the product's source revision and the shell version, quiet at the foot of the panel. */
export function BuildStamp() {
  const p = provenanceSummary(adapter.provenance)
  return (
    <p data-studio-provenance title={p.description} className="flex min-w-0 shrink-0 items-center border-t px-3 py-2 text-xs leading-4 text-muted-foreground">
      <span className="truncate">
        Source <span className={cn(p.commit && "font-mono")}>{p.source}</span> · Shell {p.shell}
      </span>
    </p>
  )
}


export function ContextPanel() {
  const s = useStudio()
  return (
    <Sidebar collapsible="none" className="hidden flex-1 md:flex">
      <div key={s.library ? "library" : s.module ? "module" : s.view} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-left-1 duration-200">
        {s.library ? (
          <LibrarySlot>
            <LibraryPage part="panel" />
          </LibrarySlot>
        ) : s.module ? (
          <Slot>
            <WorkspacePage part="panel" />
          </Slot>
        ) : (
          <>
            {s.view === "inspect" && <CatalogPanel />}
            {s.view === "compare" && <CatalogPanel compare />}
            {s.view === "gallery" && <GalleryPanel />}
            {s.view === "present" && <PresentPanel />}
            {s.view === "design" && <DesignPanel />}
            {s.view === "responsive" && <ResponsiveSide />}
          </>
        )}
      </div>
      <BuildStamp />
    </Sidebar>
  )
}


export function MobilePanel() {
  const s = useStudio()
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
      {s.library ? (
        <LibrarySlot>
          <LibraryPage part="panel" />
        </LibrarySlot>
      ) : s.module ? (
        <Slot>
          <WorkspacePage part="panel" />
        </Slot>
      ) : (
        <>
          {s.view === "inspect" && <CatalogPanel />}
          {s.view === "compare" && <CatalogPanel compare />}
          {s.view === "gallery" && <GalleryPanel />}
          {s.view === "present" && <PresentPanel />}
          {s.view === "design" && <DesignPanel />}
          {s.view === "responsive" && <ResponsiveSide />}
        </>
      )}
      <BuildStamp />
    </div>
  )
}