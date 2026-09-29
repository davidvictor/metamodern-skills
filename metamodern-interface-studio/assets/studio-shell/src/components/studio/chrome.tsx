import * as React from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  EllipsisIcon,
  CornerUpLeftIcon,
  LinkIcon,
  MonitorCogIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightIcon,
  RotateCcwIcon,
  Rows3Icon,
  UserRoundIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SunIcon,
  ZoomInIcon,
  RefreshCwIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldError } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle, ItemActions } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/components/theme-provider"
import { adapter } from "@/adapter"
import { areaLabel, captureFor, choosableFor, draftIsValid, isColor, optionsFor, resolveValues, supports, useStudio } from "@/store"
import type { CapabilityDimension } from "@/studio/types"
import { FidelityBadge, ProductMark, ProfileIcon, StatusBadge, lookOf, themeIcon } from "./bits"
import { inspectHandle, profileOf } from "./preview"

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    toast("Link copied", { description: "The link holds stable IDs only, never fixture values." })
  } catch {
    toast.error("Couldn't copy the link", { description: "Copy it from the address bar instead." })
  }
}

function Tip({ label, keys, children }: { label: string; keys?: string[]; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label}
        {keys && <KbdGroup>{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</KbdGroup>}
      </TooltipContent>
    </Tooltip>
  )
}

export function StatusNow() {
  const s = useStudio()
  const p = s.preview
  if (s.scenarioObj.status === "later") return <StatusBadge kind="unresolved">Not designed</StatusBadge>
  if (p.status === "empty") return <StatusBadge kind="unresolved">No capture</StatusBadge>
  if (p.status === "error" && !p.previous) return <StatusBadge kind="unresolved">Did not start</StatusBadge>
  if (p.status === "error") return <StatusBadge kind="stale">Showing previous</StatusBadge>
  if (p.status === "loading") return <StatusBadge kind="loading">Loading</StatusBadge>
  if (p.modified) return <StatusBadge kind="modified">Modified</StatusBadge>
  if (p.status === "static") return <StatusBadge kind="ready">Capture</StatusBadge>
  return <StatusBadge kind="ready">Ready</StatusBadge>
}

/**
 * On a phone the header actions fold behind one trigger and slide out to its left, so the title keeps
 * its room. Wider screens show them in place. Folded actions are inert: not focusable, not announced.
 */
function MobileFold({ mobile, open, onOpenChange, children }: { mobile?: boolean; open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  if (!mobile) return <>{children}</>
  return (
    <div className="flex shrink-0 items-center" onKeyDown={(e) => e.key === "Escape" && open && onOpenChange(false)}>
      <div
        id="header-actions"
        inert={!open}
        className={cn("grid transition-[grid-template-columns] duration-300 ease-(--ease-out-quint) motion-reduce:transition-none", open ? "grid-cols-[1fr]" : "grid-cols-[0fr]")}
      >
        <div className={cn("flex min-w-0 items-center gap-0.5 overflow-hidden transition-[opacity,translate] duration-300 ease-(--ease-out-quint) motion-reduce:transition-none", open ? "translate-x-0 p-0.5 opacity-100" : "translate-x-3 opacity-0")}>{children}</div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={open ? "Hide actions" : "More actions"} aria-expanded={open} aria-controls="header-actions" onClick={() => onOpenChange(!open)}>
        {open ? <ChevronRightIcon /> : <EllipsisIcon />}
      </Button>
    </div>
  )
}

export function TopBar({ mobile }: { mobile?: boolean }) {
  const s = useStudio()
  const [more, setMore] = React.useState(false)
  const { theme, setTheme } = useTheme()
  const viewLabel = { inspect: "Inspect", compare: "Compare", gallery: "Gallery", present: "Present", tokens: "Tokens" }[s.view]
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2 md:gap-2 md:px-3">
      {!mobile && (
        <Tip label={s.panelOpen ? "Hide panel" : "Show panel"} keys={["⌘", "B"]}>
          <Button variant="ghost" size="icon-sm" aria-expanded={s.panelOpen} onClick={() => s.set({ panelOpen: !s.panelOpen })} aria-label={s.panelOpen ? "Hide panel" : "Show panel"} className="text-muted-foreground hover:text-foreground">
            {s.panelOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </Button>
        </Tip>
      )}
      {mobile && <span className="flex aspect-square size-7 shrink-0 items-center justify-center rounded-md bg-(--mark-fill,var(--primary)) text-[11px] font-semibold text-(--mark-ink,var(--primary-foreground))"><ProductMark width={17} /></span>}
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden lg:inline-flex">{adapter.product.name}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden lg:inline-flex" />
          <BreadcrumbItem className="hidden sm:inline-flex">{viewLabel}</BreadcrumbItem>
          {(s.view === "inspect" || s.view === "compare") && (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem className="min-w-0">
                <button className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => s.set({ commandOpen: true })}>
                  <BreadcrumbPage className="truncate">{areaLabel(s.scenarioObj.area)}: {s.scenarioObj.label}</BreadcrumbPage>
                  <ChevronDownIcon className="size-3.5 opacity-60" />
                </button>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-1 hidden sm:block" aria-live="polite">
        {s.view === "inspect" && <StatusNow />}
      </div>
      {/* Fidelity lives in Details. It also shows here when the preview is not the real product UI, where misreading it would matter. */}
      {s.view === "inspect" && (lookOf(adapter.target.fidelity) === "static" || lookOf(adapter.target.fidelity) === "recreation") && (
        <FidelityBadge mode={lookOf(adapter.target.fidelity)} className="hidden sm:inline-flex">{adapter.target.label}</FidelityBadge>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!mobile && (
          <Button variant="outline" size="sm" className="hidden w-52 justify-start gap-2 text-muted-foreground xl:inline-flex" onClick={() => s.set({ commandOpen: true })}>
            <SearchIcon />
            <span className="flex-1 text-left">Go to scenario…</span>
            <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
          </Button>
        )}
        <MobileFold mobile={mobile} open={more} onOpenChange={setMore}>
          <Button variant="ghost" size="icon-sm" className={cn(!mobile && "xl:hidden")} aria-label="Go to scenario" onClick={() => { s.set({ commandOpen: true }); setMore(false) }}>
            <SearchIcon />
          </Button>
          <LayoutOptions />
          <DropdownMenu>
            <Tip label="Studio appearance">
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Studio appearance" />}>
                {theme === "dark" ? <MoonIcon /> : theme === "light" ? <SunIcon /> : <MonitorCogIcon />}
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Studio appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v)}>
                  <DropdownMenuRadioItem value="system"><MonitorCogIcon />System</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light"><SunIcon />Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark"><MoonIcon />Dark</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Changes the Studio only. The product’s own theme is set on the stage.</p>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tip label="Copy link to this view">
            <Button variant="ghost" size="icon-sm" aria-label="Copy link" onClick={() => { copyLink(); setMore(false) }}>
              <LinkIcon />
            </Button>
          </Tip>
        </MobileFold>
        {!mobile && (
          <Tip label="Toggle details" keys={["⌘", "."]}>
            <Button variant="ghost" size="icon-sm" aria-pressed={s.detailsOpen} className="aria-pressed:bg-muted" onClick={() => s.set({ detailsOpen: !s.detailsOpen })} aria-label="Toggle details">
              <PanelRightIcon />
            </Button>
          </Tip>
        )}
      </div>
    </header>
  )
}

const BRAND_PRESETS: [string, string][] = [
  ["Indigo", "#4f46e5"],
  ["Blue", "#2563eb"],
  ["Teal", "#0d9488"],
  ["Orange", "#ea580c"],
  ["Rose", "#e11d48"],
]

function BrandColor() {
  const { brand, setBrand } = useTheme()
  const product = adapter.product.brand
  const [draft, setDraft] = React.useState(brand ?? "")
  // Follow outside changes (a swatch, reset) without an effect.
  const [seen, setSeen] = React.useState(brand)
  if (seen !== brand) {
    setSeen(brand)
    setDraft(brand ?? "")
  }
  const valid = !draft || CSS.supports("color", draft)
  const value = brand === null ? "neutral" : product && brand.toLowerCase() === product.toLowerCase() ? "product" : BRAND_PRESETS.find(([, c]) => c === brand)?.[1] ?? "custom"
  const swatch = (c: string) => <span className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]" style={{ background: c }} />
  const item = "size-7 p-0 rounded-full data-[pressed]:ring-2 data-[pressed]:ring-ring data-[pressed]:ring-offset-1 data-[pressed]:ring-offset-popover"
  return (
    <Field data-invalid={!valid || undefined} className="gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel className="text-sm">Brand color</FieldLabel>
        <span className="text-[11px] text-muted-foreground">Studio accents only</span>
      </div>
      <div className="flex items-center gap-1.5">
        <ToggleGroup
          value={[value]}
          onValueChange={(v) => {
            const next = v[0]
            if (!next || next === "custom") return
            setBrand(next === "neutral" ? null : next === "product" && product ? product : next)
          }}
          spacing={1}
          className="gap-1"
          aria-label="Brand color"
        >
          <Tip label="Neutral">
            <ToggleGroupItem value="neutral" aria-label="Neutral" className={item}>{swatch("linear-gradient(135deg, oklch(0.205 0 0) 50%, oklch(0.97 0 0) 50%)")}</ToggleGroupItem>
          </Tip>
          {product && (
            <Tip label={`${adapter.product.name} brand · ${product}`}>
              <ToggleGroupItem value="product" aria-label={`${adapter.product.name} brand`} className={item}>{swatch(product)}</ToggleGroupItem>
            </Tip>
          )}
          {BRAND_PRESETS.map(([n, c]) => (
            <Tip key={c} label={n}>
              <ToggleGroupItem value={c} aria-label={n} className={item}>{swatch(c)}</ToggleGroupItem>
            </Tip>
          ))}
        </ToggleGroup>
      </div>
      <InputGroup className="h-7 font-mono text-xs">
        <InputGroupAddon className="pl-2">
          <label className="relative size-3.5 cursor-pointer overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]" style={{ background: valid && draft ? draft : "transparent" }}>
            <span className="sr-only">Pick a color</span>
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000"} onChange={(e) => { setDraft(e.target.value); setBrand(e.target.value) }} />
          </label>
        </InputGroupAddon>
        <InputGroupInput
          id="brand-custom"
          aria-label="Custom brand color"
          placeholder="Custom: #006279"
          className="text-xs"
          value={draft}
          aria-invalid={!valid}
          onChange={(e) => {
            const v = e.target.value.trim()
            setDraft(e.target.value)
            if (v && CSS.supports("color", v)) setBrand(v)
          }}
          onKeyDown={(e) => e.key === "Escape" && (setDraft(brand ?? ""), e.stopPropagation())}
        />
        {brand && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Back to neutral" onClick={() => setBrand(null)}><RotateCcwIcon /></InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {!valid && <FieldError className="text-xs">Not a color this browser can read.</FieldError>}
    </Field>
  )
}

function LayoutOptions() {
  const s = useStudio()
  const o = s.options
  const setO = (patch: Partial<typeof o>) => s.set({ options: { ...o, ...patch } })
  return (
    <Popover>
      <Tip label="Studio settings">
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Studio settings" />}>
          <SlidersHorizontalIcon />
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="max-h-[calc(100svh-5rem)] w-[22rem] overflow-y-auto">
        <PopoverHeader>
          <PopoverTitle>Studio settings</PopoverTitle>
          <PopoverDescription className="text-xs">Kept in this browser for this Studio. They change the Studio, never the product.</PopoverDescription>
        </PopoverHeader>
        <FieldGroup className="gap-5">
          <BrandColor />
          <Separator />
          <FieldSet>
            <FieldLegend variant="label">Presentation controls</FieldLegend>
            <RadioGroup value={o.controls} onValueChange={(v) => setO({ controls: v as typeof o.controls })}>
              <Label className="flex items-start gap-2 font-normal"><RadioGroupItem value="dock" /><span><b className="font-medium">Floating dock</b><span className="block text-xs text-muted-foreground">Under the preview, where the eye already is</span></span></Label>
              <Label className="flex items-start gap-2 font-normal"><RadioGroupItem value="toolbar" /><span><b className="font-medium">Stage toolbar</b><span className="block text-xs text-muted-foreground">A strip across the top of the stage</span></span></Label>
            </RadioGroup>
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">Details</FieldLegend>
            <RadioGroup value={o.details} onValueChange={(v) => setO({ details: v as typeof o.details })}>
              <Label className="flex items-start gap-2 font-normal"><RadioGroupItem value="docked" /><span><b className="font-medium">Docked panel</b><span className="block text-xs text-muted-foreground">Pushes the stage; nothing covers the preview</span></span></Label>
              <Label className="flex items-start gap-2 font-normal"><RadioGroupItem value="floating" /><span><b className="font-medium">Floating card</b><span className="block text-xs text-muted-foreground">Keeps the grey edge to edge</span></span></Label>
            </RadioGroup>
          </FieldSet>
          <Field orientation="horizontal" className="justify-between">
            <FieldLabel htmlFor="rail-labels" className="font-normal">Labels under rail icons</FieldLabel>
            <Switch id="rail-labels" checked={o.railLabels} onCheckedChange={(v) => setO({ railLabels: v })} />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}

/** Presentation controls: what you look at. Theme, profile, zoom, and the two preview actions. */
/** Which group a profile sits in, by the form factor the adapter gave it. */
const sizeGroup = (kind: "phone" | "tablet" | "laptop" | "desktop") => (kind === "phone" ? "Phone" : kind === "tablet" ? "Tablet" : "Laptop and desktop")

/**
 * One control for the frame's size: the profile list grouped by form factor, and, once the frame has
 * been dragged, a Custom entry with the way back. It replaces a row of profile icons that could not
 * hold this many sizes.
 */
function SizeMenu({ variant, compact }: { variant: "dock" | "toolbar"; compact?: boolean }) {
  const s = useStudio()
  const ax = adapter.axes
  const live = !!adapter.frameEntry
  const base = profileOf(s.profile)
  const shown = s.size ? { ...base, ...s.size, label: "Custom" } : base
  const groups = ["Phone", "Tablet", "Laptop and desktop"]
    .map((g) => [g, ax.profiles.filter((p) => sizeGroup(p.kind) === g).sort((a, b) => a.w - b.w || a.h - b.h)] as const)
    .filter(([, list]) => list.length)
  const available = (id: string) => live || !!captureFor(s.scenarioObj, s.theme, id)
  const dims = `${shown.w} × ${shown.h}`
  return (
    <DropdownMenu>
      <Tip label={s.size ? `Custom size, from ${base.label}` : "Frame size"}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 tabular-nums" aria-label={`Size, ${shown.label}, ${dims}`} />}>
          <ProfileIcon profile={base} />
          {!compact && <span className="hidden max-w-36 truncate sm:inline">{shown.label}</span>}
          <span className="text-muted-foreground">{dims}</span>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side={variant === "dock" ? "top" : "bottom"} align="start" className="w-80">
        <DropdownMenuRadioGroup value={s.size ? "custom" : s.profile} onValueChange={(v) => v !== "custom" && s.setProfile(v as string)}>
          {s.size && (
            <DropdownMenuGroup>
              <DropdownMenuRadioItem value="custom" closeOnClick>
                <ProfileIcon profile={base} />
                Custom
                <DropdownMenuShortcut className="tabular-nums whitespace-nowrap">{dims}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )}
          {groups.map(([group, list], i) => (
            <DropdownMenuGroup key={group}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{group}</DropdownMenuLabel>
              {list.map((p) => {
                return (
                  <DropdownMenuRadioItem key={p.id} value={p.id} disabled={!available(p.id)} closeOnClick>
                    <ProfileIcon profile={p} />
                    {p.label}
                    <DropdownMenuShortcut className="tabular-nums whitespace-nowrap">{p.w} × {p.h}</DropdownMenuShortcut>
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
        {live && ax.resizable && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {s.size ? (
                <>
                  Drag any edge to resize. <button className="rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => s.setSize(null)}>Back to {base.label}</button>
                </>
              ) : (
                "Drag the frame's right or bottom edge in Inspect to set any size."
              )}
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A scenario input that changes how a screen is looked at, such as the role it is seen as, in the dock.
 * The scenario's own value is marked Designed; choosing another overrides it until Reset, and the
 * choice travels in the link. It shows only for scenarios that use the input.
 */
function InputMenu({ id, variant, compact }: { id: string; variant: "dock" | "toolbar"; compact?: boolean }) {
  const s = useStudio()
  const inp = adapter.axes.inputs.find((i) => i.id === id)!
  const designed = s.scenarioObj.designed?.[id] ?? inp.default
  const options = optionsFor(inp, s.scenarioObj)
  // A choice this scenario cannot render (carried from another scenario or a link) does not apply here.
  const chosen = s.values[id] !== undefined && supports(s.scenarioObj, id, s.values[id]) ? s.values[id] : undefined
  const current = chosen ?? designed
  const overridden = chosen !== undefined && chosen !== designed
  const label = inp.options.find((o) => o.id === current)?.label ?? current ?? inp.label
  const Icon = { person: UserRoundIcon, density: Rows3Icon, sliders: SlidersHorizontalIcon }[inp.icon ?? "sliders"]
  return (
    <DropdownMenu>
      <Tip label={overridden ? `${inp.label}: ${label}, changed from ${inp.options.find((o) => o.id === designed)?.label ?? "designed"}` : `${inp.label}: ${label}, as designed`}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="relative gap-1.5" aria-label={`${inp.label}, ${label}${overridden ? ", changed" : ""}`} />}>
          <Icon />
          {!compact && <span className="max-w-32 truncate">{label}</span>}
          {overridden && <span aria-hidden className="size-1.5 rounded-full bg-(--anchor)" />}
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side={variant === "dock" ? "top" : "bottom"} align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{inp.label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={(v) => s.setValue(id, v === designed ? null : (v as string))}>
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
                {o.label}
                {o.id === designed && <DropdownMenuShortcut>Designed</DropdownMenuShortcut>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {overridden && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => s.setValue(id, null)}>
              <RotateCcwIcon /> Back to {inp.options.find((o) => o.id === designed)?.label ?? "designed"}
            </DropdownMenuItem>
          </>
        )}
        {inp.note && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{inp.note}</p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StageControls({ variant, compact }: { variant: "dock" | "toolbar"; compact?: boolean }) {
  const s = useStudio()
  const ax = adapter.axes
  const live = !!adapter.frameEntry
  // Fit names the mode and the percentage names what is shown, so scale is always disclosed.
  const zoomLabel = s.zoom === "fit" ? `Fit · ${Math.round(s.scale * 100)}%` : `${s.zoom}%`
  // A live renderer can show any declared combination; a capture-only Studio can show only what was recorded.
  const available = (theme: string, profile: string) => live || !!captureFor(s.scenarioObj, theme, profile)
  return (
    <div
      role="toolbar"
      aria-label="Preview controls"
      className={cn(
        "flex items-center gap-1",
        variant === "dock" && "pointer-events-auto max-w-full overflow-x-auto rounded-xl border bg-popover/95 p-1 text-popover-foreground shadow-[var(--dock-shadow)] backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        variant === "toolbar" && !compact && "w-full border-b bg-background/95 px-2 py-1 backdrop-blur",
        compact && "w-full justify-between overflow-x-auto"
      )}
    >
      <ToggleGroup value={[s.theme]} onValueChange={(v) => v[0] && s.setTheme(v[0])} size="sm" spacing={0} aria-label={ax.themeLabel}>
        {ax.themes.filter((t) => !compact || !t.icon?.endsWith("contrast")).map((t) => {
          const Icon = themeIcon(t)
          const ok = available(t.id, s.profile)
          const swatch = !t.icon || t.icon === "swatch"
          return (
            <Tip key={t.id} label={ok ? `${ax.themeLabel}: ${t.label}` : `${t.label}: no capture recorded`}>
              <span className="inline-flex">
                <ToggleGroupItem value={t.id} aria-label={t.label} disabled={!ok} className={cn(swatch && "px-2.5 text-xs")}>
                  {swatch ? t.label : <Icon />}
                </ToggleGroupItem>
              </span>
            </Tip>
          )
        })}
      </ToggleGroup>
      <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
      <SizeMenu variant={variant} compact={compact} />
      {choosableFor(s.scenarioObj).filter((i) => i.placement === "dock").map((i) => <InputMenu key={i.id} id={i.id} variant={variant} compact={compact} />)}
      <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1 tabular-nums" aria-label={`Zoom, ${zoomLabel}`} />}>
          <ZoomInIcon /> {zoomLabel}
          <ChevronUpIcon className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side={variant === "dock" ? "top" : "bottom"} className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Preview size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={String(s.zoom)} onValueChange={(v) => s.set({ zoom: v === "fit" ? "fit" : +v })}>
              <DropdownMenuRadioItem value="fit">Fit<DropdownMenuShortcut>⇧1</DropdownMenuShortcut></DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="50">50%</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="75">75%</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="100">100%<DropdownMenuShortcut>⇧0</DropdownMenuShortcut></DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
      <Tip label={!live ? "Product back: unavailable for captures" : s.preview.canGoBack ? "Product back: the preview's own history" : "Product back: no product history yet"}>
        <span className="inline-flex">
          <Button variant="ghost" size="icon-sm" aria-label="Product back" disabled={!s.preview.canGoBack} onClick={() => inspectHandle.current?.back()}>
            <CornerUpLeftIcon />
          </Button>
        </span>
      </Tip>
      <Tip label={live ? "Reset preview" : "Reload capture"} keys={["R"]}>
        <Button variant="ghost" size="icon-sm" aria-label={live ? "Reset preview" : "Reload capture"} onClick={s.reset}>
          <RotateCcwIcon />
        </Button>
      </Tip>
    </div>
  )
}

const DIMENSIONS: [CapabilityDimension, string][] = [
  ["rendering", "Rendering"],
  ["behavior", "Behavior"],
  ["navigation", "Navigation"],
  ["data", "Data"],
  ["os", "Operating system"],
]

/** Details: the summary is always visible; Scenario, Fidelity and Evidence as line tabs. */
export function DetailsContent({ onClose }: { onClose?: () => void }) {
  const s = useStudio()
  if (s.view === "tokens" && adapter.tokens) return <TokenEditor />
  const sc = s.scenarioObj
  const list = adapter.scenarios
  const i = list.findIndex((x) => x.id === sc.id)
  const st = sc.statuses ?? {}
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b p-4">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{i + 1} of {list.length}</span>
          <span>·</span>
          <span className="truncate">{areaLabel(sc.area)}</span>
          <div className="ml-auto flex gap-0.5">
            <Tip label="Previous scenario" keys={["["]}><Button variant="ghost" size="icon-xs" aria-label="Previous scenario" onClick={() => s.step(-1)}><ChevronUpIcon /></Button></Tip>
            <Tip label="Next scenario" keys={["]"]}><Button variant="ghost" size="icon-xs" aria-label="Next scenario" onClick={() => s.step(1)}><ChevronDownIcon /></Button></Tip>
            {onClose && <Button variant="ghost" size="icon-xs" aria-label="Close details" onClick={onClose}><PanelRightIcon /></Button>}
          </div>
        </div>
        <h2 className="font-heading text-base leading-snug font-semibold text-balance">{areaLabel(sc.area)}: {sc.label}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{sc.description}</p>
        <div className="flex flex-wrap gap-1.5">
          <FidelityBadge mode={lookOf(adapter.target.fidelity)}>{adapter.target.label}</FidelityBadge>
          <StatusNow />
          {sc.status === "stale" && <StatusBadge kind="stale">Stale evidence</StatusBadge>}
        </div>
      </div>
      <Tabs defaultValue="scenario" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="w-full justify-start gap-3 border-b px-4">
          <TabsTrigger value="scenario" className="flex-none">Scenario</TabsTrigger>
          <TabsTrigger value="fidelity" className="flex-none">Fidelity</TabsTrigger>
          <TabsTrigger value="evidence" className="flex-none">Evidence</TabsTrigger>
        </TabsList>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="scenario" className="grid gap-5 p-4">
            <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Surface</dt><dd>{sc.surface}</dd>
              {sc.state && (<><dt className="text-muted-foreground">State</dt><dd>{sc.state}</dd></>)}
              <dt className="text-muted-foreground">Fixture</dt><dd>{sc.fixture.id} v{sc.fixture.version}<span className="block text-xs text-muted-foreground">{sc.fixture.provenance}</span></dd>
              <dt className="text-muted-foreground">Clock</dt><dd>{sc.clock}</dd>
              <dt className="text-muted-foreground">Source</dt><dd className="font-mono text-xs break-all">{sc.source}</dd>
              {s.preview.location && (<><dt className="text-muted-foreground">Location</dt><dd className="font-mono text-xs break-all">{s.preview.location}</dd></>)}
            </dl>
            {choosableFor(sc).some((i) => i.placement !== "dock") && (
              <FieldSet>
                <FieldLegend variant="label">Scenario inputs</FieldLegend>
                <FieldDescription className="text-xs">Declared by the {adapter.product.name} adapter. A change rebuilds the preview from the scenario.</FieldDescription>
                <FieldGroup className="gap-4">
                  {choosableFor(sc).filter((i) => i.placement !== "dock").map((inp) =>
                    inp.control === "presets" ? (
                      <Field key={inp.id}>
                        <FieldLabel>{inp.label}</FieldLabel>
                        <ToggleGroup value={[resolveValues(sc, s.values)[inp.id]]} variant="outline" size="sm" spacing={0} className="w-full" onValueChange={(v) => v[0] && s.setValue(inp.id, v[0])} aria-label={inp.label}>
                          {optionsFor(inp, sc).map((o) => <ToggleGroupItem key={o.id} value={o.id} className="flex-1 px-1 text-xs">{o.label}</ToggleGroupItem>)}
                        </ToggleGroup>
                        {inp.note && <FieldDescription className="text-xs">{inp.note}</FieldDescription>}
                      </Field>
                    ) : (
                      <Field key={inp.id}>
                        <FieldLabel>{inp.label}</FieldLabel>
                        <Select value={resolveValues(sc, s.values)[inp.id]} items={Object.fromEntries(optionsFor(inp, sc).map((o) => [o.id, o.label]))} onValueChange={(v) => v && s.setValue(inp.id, v as string)}>
                          <SelectTrigger className="w-full" aria-label={inp.label}><SelectValue /></SelectTrigger>
                          <SelectContent>{optionsFor(inp, sc).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {inp.note && <FieldDescription className="text-xs">{inp.note}</FieldDescription>}
                      </Field>
                    )
                  )}
                </FieldGroup>
              </FieldSet>
            )}
          </TabsContent>
          <TabsContent value="fidelity" className="grid gap-4 p-4">
            <ItemGroup className="gap-1">
              {DIMENSIONS.map(([dim, label]) => {
                const c = adapter.target.capabilities[dim]
                return (
                  <Item key={dim} size="sm" variant="outline" className="py-2">
                    <ItemContent>
                      <ItemTitle className="text-[13px]">{label}</ItemTitle>
                      <ItemDescription className="text-xs">{c.reason}</ItemDescription>
                    </ItemContent>
                    <ItemActions><FidelityBadge mode={c.mode}>{c.mode[0].toUpperCase() + c.mode.slice(1)}</FidelityBadge></ItemActions>
                  </Item>
                )
              })}
            </ItemGroup>
            {adapter.presentationOverrides?.map((o) => (
              <div key={o.id} className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                <b className="font-medium text-foreground">Presentation override:</b> {o.label}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="evidence" className="grid gap-4 p-4">
            <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Design</dt><dd>{st.design ?? "Unknown"}</dd>
              <dt className="text-muted-foreground">Delivery</dt><dd>{st.delivery ?? "Unknown"}</dd>
              <dt className="text-muted-foreground">Evidence</dt><dd>{st.evidence ?? "Unverified"}</dd>
              <dt className="text-muted-foreground">Fingerprint</dt><dd className="font-mono text-xs">{s.preview.fingerprint ?? st.fingerprint ?? "None"}</dd>
              <dt className="text-muted-foreground">Since open</dt><dd>{s.preview.modified ? "Changed by interaction. Reset restores the scenario." : "Unchanged"}</dd>
            </dl>
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => toast("Verification is a separate operation", { description: "Run the verification harness to append evidence." })}>
              <RefreshCwIcon /> Re-check this scenario
            </Button>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

function TokenEditor() {
  const s = useStudio()
  const t = adapter.tokens!
  const tok = t.tokens.find((x) => x.name === s.tokens.selected) ?? t.tokens[0]
  const draft = s.tokens.drafts[tok.name] ?? {}
  const count = Object.keys(s.tokens.drafts).length
  const setDraft = (theme: string, v: string) => {
    const next = { ...s.tokens.drafts, [tok.name]: { ...draft, [theme]: v } }
    if (!v) delete next[tok.name][theme]
    if (!Object.keys(next[tok.name]).length) delete next[tok.name]
    s.set({ tokens: { ...s.tokens, drafts: next } })
  }
  const exportDrafts = async () => {
    const file = JSON.stringify({ adapter: adapter.id, revision: adapter.product.revision, tokens: s.tokens.drafts }, null, 2)
    try {
      await navigator.clipboard.writeText(file)
      toast.success("Variant file copied", { description: "Save it with the Studio's presenter material for review." })
    } catch {
      toast.error("Couldn't copy the variant file")
    }
  }
  const col = (theme: string) => {
    const base = tok.values[theme] ?? ""
    const v = draft[theme] ?? ""
    const valid = draftIsValid(tok, theme, v)
    const locked = tok.flags?.includes("literal")
    return (
      <Field key={theme} data-invalid={!valid || undefined}>
        <FieldLabel htmlFor={`tok-${theme}`}>{adapter.axes.themes.find((x) => x.id === theme)?.label ?? theme}</FieldLabel>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isColor(base) && <span className="size-4 rounded-sm ring-1 ring-border" style={{ background: base }} />}
          <span className="font-mono">Baseline {base || "none"}</span>
        </div>
        <InputGroup className={cn("font-mono", v && valid && "border-info/60 bg-info-surface/40")}>
          {isColor(base) && (
            <InputGroupAddon>
              <span className="size-4 rounded-sm ring-1 ring-border" style={{ background: valid && v ? v : base }} />
            </InputGroupAddon>
          )}
          <InputGroupInput id={`tok-${theme}`} value={v} placeholder="Baseline" disabled={locked} aria-invalid={!valid} onChange={(e) => setDraft(theme, e.target.value)} onKeyDown={(e) => e.key === "Escape" && setDraft(theme, "")} />
          {v && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Back to baseline" onClick={() => setDraft(theme, "")}><RotateCcwIcon /></InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {!valid && <FieldError>Not a color this browser can read. The preview keeps the baseline.</FieldError>}
        {locked && <FieldDescription className="text-xs">Holds fixed values. Edit the tokens it is built from instead.</FieldDescription>}
      </Field>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b p-4">
        <p className="text-xs text-muted-foreground">{tok.family}</p>
        <h2 className="font-mono text-sm font-semibold">{tok.name}</h2>
        <div className="flex flex-wrap gap-1.5">
          {tok.reads != null && <Badge variant="secondary">{tok.reads} reads</Badge>}
          {tok.flags?.includes("unread") && <StatusBadge kind="stale">Nothing reads this</StatusBadge>}
          {tok.flags?.includes("literal") && <Badge variant="outline">Fixed values inside</Badge>}
          {s.tokens.drafts[tok.name] && <StatusBadge kind="draft">In draft</StatusBadge>}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <FieldGroup className="gap-5 p-4">
          {t.columns.map((theme) => col(theme))}
          {tok.note && <p className="rounded-lg bg-warning-surface p-3 text-xs leading-relaxed text-warning">{tok.note}</p>}
        </FieldGroup>
      </ScrollArea>
      <div className="grid gap-2 border-t p-3">
        <p className="text-xs text-muted-foreground">{count} {count === 1 ? "token draft" : "token drafts"} kept in this browser. Drafts never change the product.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={exportDrafts} disabled={!count}>Copy as variant file</Button>
          <Button size="sm" variant="outline" onClick={() => s.set({ tokens: { ...s.tokens, drafts: {} } })} disabled={!count}>Discard drafts</Button>
        </div>
      </div>
    </div>
  )
}
