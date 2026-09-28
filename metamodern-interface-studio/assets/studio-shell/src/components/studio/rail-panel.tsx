import * as React from "react"
import {
  ChevronRightIcon,
  Columns2Icon,
  KeyboardIcon,
  LayoutGridIcon,
  PresentationIcon,
  ScanEyeIcon,
  SearchIcon,
  SwatchBookIcon,
  TriangleAlertIcon,
  CircleDashedIcon,
  CircleAlertIcon,
  BookmarkIcon,
  LockIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { areaCount, captureFor, useStudio, type View } from "@/store"
import type { Scenario } from "@/studio/types"
import { staticProblem } from "./views"

/** Joined filter segments sized to fit a 272 px panel: small type, tight padding, never wider than their column. */
const SEG = "h-7 min-w-0 gap-1 px-1.5 text-xs"

/** The five views. Tokens appears only when the adapter declares a token source. */
export const VIEWS: { id: View; label: string; icon: React.ElementType; key: string }[] = [
  { id: "inspect" as View, label: "Inspect", icon: ScanEyeIcon, key: "1" },
  { id: "compare" as View, label: "Compare", icon: Columns2Icon, key: "2" },
  { id: "gallery" as View, label: "Gallery", icon: LayoutGridIcon, key: "3" },
  { id: "present" as View, label: "Present", icon: PresentationIcon, key: "4" },
  { id: "tokens" as View, label: "Tokens", icon: SwatchBookIcon, key: "5" },
].filter((v) => v.id !== "tokens" || !!adapter.tokens)

/** A rail item: square, full rail width, straight marker on the edge, inset focus ring. */
function RailButton({ label, keyHint, labels, active, onClick, children }: { label: string; keyHint?: string; labels?: boolean; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  const button = (
    <button
      type="button"
      aria-pressed={active}
      aria-label={labels ? undefined : label}
      onClick={onClick}
      className={cn(
        "relative flex w-full shrink-0 items-center justify-center text-sidebar-foreground/65 outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:text-sidebar-foreground focus-visible:shadow-[inset_0_0_0_2px_var(--sidebar-ring)] [&_svg]:size-[18px] [&_svg]:shrink-0",
        labels ? "h-14 flex-col gap-1 text-[10.5px] font-medium" : "h-10",
        active && "bg-sidebar-accent text-sidebar-primary before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-sidebar-primary hover:text-sidebar-primary"
      )}
    >
      {children}
      {labels && <span>{label}</span>}
    </button>
  )
  if (labels) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">
        {label}
        {keyHint && <Kbd>{keyHint}</Kbd>}
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
          <TooltipTrigger render={<div tabIndex={0} className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground outline-none ring-sidebar-ring focus-visible:ring-2" aria-label={`${adapter.product.name} Studio`} />}>
            {adapter.product.mark}
          </TooltipTrigger>
          <TooltipContent side="right">{adapter.product.name} Studio · {adapter.product.revision}</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Views" className="flex flex-col py-1">
          {VIEWS.map((v) => (
            <RailButton key={v.id} label={v.label} keyHint={v.key} labels={labels} active={s.view === v.id} onClick={() => s.setView(v.id)}>
              <v.icon />
            </RailButton>
          ))}
        </nav>
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

function PanelHeader({ title, count, children }: { title: string; count?: React.ReactNode; children?: React.ReactNode }) {
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

function SearchField({ placeholder, value, onChange, id }: { placeholder: string; value: string; onChange: (v: string) => void; id: string }) {
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

function CatalogPanel({ compare }: { compare?: boolean }) {
  const s = useStudio()
  const [q, setQ] = React.useState("")
  const [filter, setFilter] = React.useState<string[]>(["all"])
  const all = adapter.scenarios
  const f = filter[0] ?? "all"
  const flagged = (x: Scenario) => x.status === "unresolved" || x.status === "later"
  const list = all.filter((x) => (!q || `${x.label} ${x.surface} ${x.area} ${x.state ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (f === "all" || (f === "stale" && x.status === "stale") || (f === "unresolved" && flagged(x))))
  const stale = all.filter((x) => x.status === "stale").length
  const unres = all.filter(flagged).length
  // Under 30 scenarios every group starts open; larger catalogs open only the current group.
  const [openAreas, setOpenAreas] = React.useState<Record<string, boolean>>(() => Object.fromEntries(adapter.areas.map((a) => [a.id, all.length <= 30 || a.id === s.scenarioObj.area])))
  const live = !!adapter.frameEntry
  return (
    <>
      <PanelHeader title="Catalog" count={q || f !== "all" ? `${list.length} of ${all.length}` : all.length}>
        <SearchField id="catalog-search" placeholder="Search scenarios" value={q} onChange={setQ} />
        <ToggleGroup value={filter} onValueChange={(v) => setFilter(v.length ? v : ["all"])} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-[1fr_1fr_1.45fr]" aria-label="Filter by status">
          <ToggleGroupItem value="all" className={SEG}>All</ToggleGroupItem>
          <ToggleGroupItem value="stale" className={SEG}>Stale<span className="tabular-nums opacity-55">{stale}</span></ToggleGroupItem>
          <ToggleGroupItem value="unresolved" className={SEG}>Unresolved<span className="tabular-nums opacity-55">{unres}</span></ToggleGroupItem>
        </ToggleGroup>
      </PanelHeader>
      <SidebarContent>
        {compare && !!adapter.comparisons?.length && (
          <SidebarGroup>
            <SidebarGroupLabel>Saved comparisons</SidebarGroupLabel>
            <SidebarMenu>
              {adapter.comparisons.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton size="sm" onClick={() => { s.set({ compare: { ...s.compare, a: c.a, b: c.b } }); if (c.scenario) s.selectScenario(c.scenario) }}>
                    <BookmarkIcon />
                    <span>{c.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        {adapter.areas.map((area) => {
          const items = list.filter((x) => x.area === area.id)
          if (items.length === 0 && (q || f !== "all")) return null
          const open = q || f !== "all" ? true : !!openAreas[area.id]
          return (
            <Collapsible key={area.id} open={open} onOpenChange={(o) => setOpenAreas((m) => ({ ...m, [area.id]: o }))} className="group/collapsible">
              <SidebarGroup className="py-1">
                <SidebarGroupLabel render={<CollapsibleTrigger />} className="group/label w-full text-[11px] tracking-wide uppercase hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <ChevronRightIcon className="mr-1 transition-transform duration-200 group-data-[open]/collapsible:rotate-90" />
                  {area.label}
                  <span className="ml-auto font-normal tracking-normal tabular-nums normal-case opacity-70">{areaCount(area.id)}</span>
                </SidebarGroupLabel>
                <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.filter((x) => !x.parent || !items.some((p) => p.id === x.parent)).map((x) => {
                        const kids = items.filter((k) => k.parent === x.id)
                        return (
                          <SidebarMenuItem key={x.id}>
                            <SidebarMenuButton size="sm" isActive={s.scenarioObj.id === x.id} onClick={() => s.selectScenario(x.id)} className={cn(x.status === "later" && "text-muted-foreground")} title={x.label}>
                              <span>{x.label}</span>
                            </SidebarMenuButton>
                            <StatusMark status={x.status} noCapture={!live && !captureFor(x, s.theme, s.profile)} />
                            {kids.length > 0 && (
                              <SidebarMenuSub>
                                {kids.map((k) => (
                                  <SidebarMenuSubItem key={k.id}>
                                    <SidebarMenuSubButton size="sm" isActive={s.scenarioObj.id === k.id} render={<button type="button" onClick={() => s.selectScenario(k.id)} title={k.label} />}>
                                      <span>{k.label}</span>
                                      {k.status === "stale" && <TriangleAlertIcon className="ml-auto size-3 text-warning" aria-label="Stale" />}
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            )}
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
        {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">No scenario matches. Clear the search or the filter.</p>}
      </SidebarContent>
    </>
  )
}

function StatusMark({ status, noCapture }: { status?: string; noCapture: boolean }) {
  if (status === "stale") return <SidebarMenuBadge className="text-warning" title="Stale: source changed since the last evidence"><TriangleAlertIcon className="size-3.5" /></SidebarMenuBadge>
  if (status === "unresolved") return <SidebarMenuBadge className="text-danger" title="Unresolved: a reference is broken"><CircleAlertIcon className="size-3.5" /></SidebarMenuBadge>
  if (status === "later") return <SidebarMenuBadge className="text-muted-foreground" title="Later: not designed yet"><CircleDashedIcon className="size-3.5" /></SidebarMenuBadge>
  if (noCapture) return <SidebarMenuBadge className="text-muted-foreground/60" title="No capture for this theme and profile"><span className="size-1.5 rounded-full border border-current" /></SidebarMenuBadge>
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
            <Label key={a.id} className="flex items-center gap-2 font-normal">
              <Checkbox checked={!g.hidden.includes(a.id)} onCheckedChange={(v) => setG({ hidden: v ? g.hidden.filter((x) => x !== a.id) : [...g.hidden, a.id] })} />
              <span className="flex-1 truncate">{a.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{areaCount(a.id)}</span>
            </Label>
          ))}
        </div>
        <Separator />
        <Label className="flex items-center justify-between font-normal">
          Only stale, unresolved or later
          <Switch size="sm" checked={g.onlyFlagged} onCheckedChange={(v) => setG({ onlyFlagged: v })} />
        </Label>
      </SidebarContent>
    </>
  )
}

function PresentPanel() {
  const s = useStudio()
  const tours = adapter.walkthroughs
  const tour = tours.find((t) => t.id === s.present.tour) ?? tours[0]
  if (!tour) return <PanelHeader title="Walkthrough" count="none yet" />
  return (
    <>
      <PanelHeader title="Walkthrough" count={`${tour.steps.length} steps`}>
        <Select value={tour.id} items={Object.fromEntries(tours.map((t) => [t.id, t.name]))} onValueChange={(v) => v && s.set({ present: { ...s.present, tour: v as string, step: 0, elapsed: 0, playing: false } })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{tours.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">{tour.goal}</p>
      </PanelHeader>
      <SidebarContent className="p-2">
        <ol className="grid gap-1" aria-label="Steps">
          {tour.steps.map((st, i) => {
            const sc = adapter.scenarios.find((x) => x.id === st.scenario)
            const problem = staticProblem(st)
            const current = i === s.present.step
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => s.set({ present: { ...s.present, step: i, elapsed: 0 } })}
                  aria-current={current ? "step" : undefined}
                  className={cn("group flex w-full gap-2.5 rounded-lg p-2 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring", current && "bg-sidebar-accent")}
                >
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", problem ? "bg-danger-surface text-danger" : current ? "bg-foreground text-background" : i < s.present.step ? "bg-muted-foreground/25" : "bg-muted")}>{problem ? "!" : i + 1}</span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className={cn("line-clamp-3 text-xs leading-snug", problem ? "text-danger" : "text-sidebar-foreground/85")}>{st.narration}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{sc ? sc.label : st.scenario}{st.commands?.length ? ` · ${st.commands.length} ${st.commands.length === 1 ? "command" : "commands"}` : ""}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t p-3">
        <Field orientation="horizontal" className="justify-between">
          <FieldLabel htmlFor="autoplay" className="font-normal">Autoplay</FieldLabel>
          <Switch id="autoplay" size="sm" checked={s.present.playing} onCheckedChange={(v) => s.set({ present: { ...s.present, playing: v } })} />
        </Field>
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

function TokensPanel() {
  const s = useStudio()
  const t = adapter.tokens!
  const drafts = Object.keys(s.tokens.drafts).length
  return (
    <>
      <PanelHeader title="Tokens" count={t.total}>
        <SearchField id="token-search" placeholder="Name or value" value={s.tokens.query} onChange={(v) => s.set({ tokens: { ...s.tokens, query: v } })} />
        <ToggleGroup value={[s.tokens.flag]} onValueChange={(v) => v[0] && s.set({ tokens: { ...s.tokens, flag: v[0] as typeof s.tokens.flag } })} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-4" aria-label="Show">
          <ToggleGroupItem value="all" className={SEG}>All</ToggleGroupItem>
          <ToggleGroupItem value="unread" className={SEG}>Unread</ToggleGroupItem>
          <ToggleGroupItem value="literal" className={SEG}>Fixed</ToggleGroupItem>
          <ToggleGroupItem value="draft" className={SEG}>Draft<span className="tabular-nums opacity-55">{drafts}</span></ToggleGroupItem>
        </ToggleGroup>
      </PanelHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Families</SidebarGroupLabel>
          <SidebarMenu>
            {[{ name: null as string | null, count: t.total }, ...t.families].map((g) => (
              <SidebarMenuItem key={g.name ?? "all"}>
                <SidebarMenuButton size="sm" isActive={s.tokens.family === g.name} aria-pressed={s.tokens.family === g.name} onClick={() => s.set({ tokens: { ...s.tokens, family: g.name } })}>
                  <span>{g.name ?? "All families"}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="tabular-nums">{g.count}</SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <Collapsible className="group/shell mt-auto border-t">
          <SidebarGroup>
            <SidebarGroupLabel render={<CollapsibleTrigger />} className="w-full hover:bg-sidebar-accent">
              <LockIcon className="mr-1" /> This Studio’s own tokens
              <ChevronRightIcon className="ml-auto transition-transform group-data-[open]/shell:rotate-90" />
            </SidebarGroupLabel>
            <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
              <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">Read only. The shell’s tokens never reach a preview, and product tokens never style the shell, even where the names match.</p>
              <ul className="grid gap-1 px-2 pb-2 font-mono text-[11px]">
                {["--stage", "--boundary", "--background", "--foreground", "--success", "--warning"].map((n) => (
                  <li key={n} className="flex items-center gap-2"><span className="size-3 rounded-sm ring-1 ring-border" style={{ background: `var(${n})` }} />{n}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
    </>
  )
}

export function ContextPanel() {
  const s = useStudio()
  return (
    <Sidebar collapsible="none" className="hidden flex-1 md:flex">
      <div key={s.view} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-left-1 duration-200">
        {s.view === "inspect" && <CatalogPanel />}
        {s.view === "compare" && <CatalogPanel compare />}
        {s.view === "gallery" && <GalleryPanel />}
        {s.view === "present" && <PresentPanel />}
        {s.view === "tokens" && adapter.tokens && <TokensPanel />}
      </div>
    </Sidebar>
  )
}

export function MobilePanel() {
  const s = useStudio()
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
      {s.view === "inspect" && <CatalogPanel />}
      {s.view === "compare" && <CatalogPanel compare />}
      {s.view === "gallery" && <GalleryPanel />}
      {s.view === "present" && <PresentPanel />}
      {s.view === "tokens" && adapter.tokens && <TokensPanel />}
    </div>
  )
}
