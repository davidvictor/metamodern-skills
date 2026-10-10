import { useDesignSnapshot } from "@/studio/design-ui/react"
import { FoundationSlot } from "@/studio/design-ui/slots"
/*
 * The Design view's Adjust tab: parameters in the context panel, and a stage
 * that shows the product as built, the draft, or both. The draft is
 * exploration; it is always labeled and never reaches Present.
 */
import * as React from "react"
import { DownloadIcon, EyeIcon, ResetIcon, TriangleAlertIcon } from "@/icons"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { SidebarContent, SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { adapter } from "@/adapter"
import { NO_DRAFT, useStudio } from "@/store"
import { allowedStylesheet, baseValue, download, encodeDesign, fontFamilyValue, isDefault, parameterAvailable, parameterDefault, tokenDiff, toPx, valuesForTheme, variantFile } from "@/studio/design"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import type { DesignParameter } from "@/studio/types"
import { ScaleChip, StatusBadge, useFit } from "./bits"
import { ScenarioPreview, sizedProfile, useReportStatus } from "./preview"
import { StageNav, useStageNav } from "./stage-nav"

const params = (theme?: string) => (adapter.design?.parameters ?? []).filter((p) => parameterAvailable(p, theme))
const currentDesignValues = (s: ReturnType<typeof useStudio>) => valuesForTheme(adapter, s.design.values, s.design.valuesByTheme, s.theme)
const readout = (p: DesignParameter, v: number | string) =>
  p.kind === "scale" ? `${Number(v).toFixed(2)}×` : p.kind === "ratio" ? Number(v).toFixed(3) : p.kind === "temperature" ? (Number(v) === 0 ? "Neutral" : `${Number(v) > 0 ? "Warm" : "Cool"} ${Math.abs(Number(v)).toFixed(2)}`) : String(v)

function ScaleControl({ p }: { p: DesignParameter }) {
  const s = useStudio()
  const defaultValue = parameterDefault(adapter, p, s.theme)
  const v = Number(currentDesignValues(s)[p.id] ?? defaultValue)
  const min = p.min ?? (p.kind === "temperature" ? -1 : 0.5)
  const max = p.max ?? (p.kind === "temperature" ? 1 : 2)
  const step = p.step ?? 0.01
  const places = (String(step).split(".")[1] ?? "").length
  const set = (n: number) =>
    s.setDesign({
      values: {
        ...currentDesignValues(s),
        [p.id]: Number((Math.round(n / step) * step).toFixed(places)),
      },
    })
  const pct = (at: number) => ((at - min) / (max - min)) * 100
  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={`design-${p.id}`} className="flex-1">
          {p.label}
        </FieldLabel>
        <output className={cn("font-mono text-xs tabular-nums", !isDefault(p, currentDesignValues(s)[p.id], defaultValue) && "text-info")} aria-live="polite">
          {readout(p, v)}
        </output>
      </div>
      <Slider
        id={`design-${p.id}`}
        min={min}
        max={max}
        step={step}
        value={[v]}
        onValueChange={(x) => {
          const n = Array.isArray(x) ? x[0] : x
          if (Number.isFinite(n)) set(n)
        }}
        aria-label={p.label}
        aria-valuetext={readout(p, v)}
      />
      {!!p.stops?.length && (
        <div className="relative h-5 pointer-coarse:mt-4 pointer-coarse:h-11" aria-label={`${p.label} marks`}>
          {p.stops.map((st) => (
            <button
              key={st.label}
              type="button"
              className={cn(
                "absolute -translate-x-1/2 rounded px-1 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                Math.abs(v - st.at) < step / 2 && "font-medium text-foreground"
              )}
              style={{ left: `${Math.min(92, Math.max(8, pct(st.at)))}%` }}
              onClick={() => set(st.at)}
              aria-label={`${p.label} ${st.label}, ${readout(p, st.at)}`}
            >
              <span aria-hidden className="absolute -top-1.5 left-1/2 h-1.5 w-px bg-current pointer-coarse:top-2" />
              {st.label}
            </button>
          ))}
        </div>
      )}
      {p.note && <FieldDescription className="text-xs">{p.note}</FieldDescription>}
    </Field>
  )
}

function FontControl({ p }: { p: DesignParameter }) {
  const s = useStudio()
  const v = String(currentDesignValues(s)[p.id] ?? parameterDefault(adapter, p, s.theme))
  const [text, setText] = React.useState(v)
  const [shown, setShown] = React.useState(v)
  if (shown !== v) {
    setShown(v)
    setText(v)
  }
  const set = (name: string) => name.trim() && s.setDesign({ values: { ...currentDesignValues(s), [p.id]: name.trim() } })
  const choices = [...new Set([String(parameterDefault(adapter, p, s.theme)), ...(p.options ?? [])])]
  return (
    <Field>
      <FieldLabel htmlFor={`design-${p.id}`}>{p.label}</FieldLabel>
      <Select value={choices.includes(v) ? v : null} items={Object.fromEntries(choices.map((c) => [c, c]))} onValueChange={(x) => x && set(x as string)}>
        <SelectTrigger className="w-full" aria-label={`${p.label} typeface`}>
          <SelectValue placeholder="Another font" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              <span style={{ fontFamily: fontFamilyValue(c) }}>{c}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={`design-${p.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== v && set(text)}
        onKeyDown={(e) => e.key === "Enter" && set(text)}
        placeholder="Any Google Font name"
        className="h-8 text-xs"
        aria-label={`${p.label}, any Google Font name`}
      />
      {p.note && <FieldDescription className="text-xs">{p.note}</FieldDescription>}
    </Field>
  )
}

function ColorControl({ p }: { p: DesignParameter }) {
  const s = useStudio()
  const v = String(currentDesignValues(s)[p.id] ?? parameterDefault(adapter, p, s.theme))
  const [text, setText] = React.useState(v)
  const [shown, setShown] = React.useState(v)
  if (shown !== v) {
    setShown(v)
    setText(v)
  }
  const set = (c: string) => c.trim() && s.setDesign({ values: { ...currentDesignValues(s), [p.id]: c.trim() } })
  const hex = /^#[0-9a-f]{6}$/i.test(v) ? v : undefined
  return (
    <Field>
      <FieldLabel htmlFor={`design-${p.id}`}>{p.label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input type="color" value={hex ?? "#000000"} onChange={(e) => set(e.target.value)} aria-label={`${p.label} picker`} className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
        <Input id={`design-${p.id}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== v && set(text)} onKeyDown={(e) => e.key === "Enter" && set(text)} className="h-8 font-mono text-xs" aria-invalid={!CSS.supports("color", text)} />
      </div>
      {p.note && <FieldDescription className="text-xs">{p.note}</FieldDescription>}
    </Field>
  )
}

/** A categorical design control that reaches a frame through `apply.input` when its graphics rerender. */
function EnumControl({ p }: { p: DesignParameter }) {
  const s = useStudio()
  const fallback = parameterDefault(adapter, p, s.theme)
  const value = String(currentDesignValues(s)[p.id] ?? fallback)
  const choices = p.choices ?? p.options?.map((id) => ({ id, label: id })) ?? []
  return (
    <Field>
      <FieldLabel htmlFor={`design-${p.id}`}>{p.label}</FieldLabel>
      {choices.length <= 1 ? <p id={`design-${p.id}`} className="text-sm text-muted-foreground">{choices[0]?.label ?? value}</p> : <Select value={value} items={Object.fromEntries(choices.map((c) => [c.id, c.label]))} onValueChange={(v) => v && s.setDesign({ values: { ...currentDesignValues(s), [p.id]: String(v) } })}>
        <SelectTrigger id={`design-${p.id}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>}
      {p.note && <FieldDescription className="text-xs">{p.note}</FieldDescription>}
    </Field>
  )
}

/** Where the draft goes: beyond this view (per viewer), into a variant file, or out as a token diff. */
function ShareDraft() {
  const s = useStudio()
  const [label, setLabel] = React.useState("Draft")
  const design = encodeDesign(adapter, currentDesignValues(s), s.theme)
  return (
    <SidebarGroup className="gap-3 border-t px-3 py-3">
      <Field orientation="horizontal">
        <Switch id="draft-everywhere" checked={s.options.draftEverywhere} onCheckedChange={(v) => s.set({ options: { ...s.options, draftEverywhere: v } })} />
        <FieldLabel htmlFor="draft-everywhere" className="text-xs font-normal">
          Show the draft in Inspect, Gallery and Compare
        </FieldLabel>
      </Field>
      <FieldDescription className="-mt-2 text-xs">For you only, and always labeled. Present never shows a draft.</FieldDescription>
      <Field>
        <FieldLabel htmlFor="variant-name" className="text-xs">
          Save as a variant
        </FieldLabel>
        <div className="flex gap-2">
          <Input id="variant-name" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs" />
          <Button
            size="sm"
            disabled={!s.hasDraft || !label.trim()}
            onClick={() => {
              const f = variantFile(adapter, label.trim(), s.draftFor, design)
              download(f.name, f.text)
              toast.success(`Saved ${f.name}`, {
                description: "Commit it to the Studio's variants folder to make it a Token variant. It records no decision.",
              })
            }}
          >
            <DownloadIcon /> Save
          </Button>
        </div>
      </Field>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">Export the draft for review</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={!s.hasDraft} onClick={() => download("draft-tokens.css", tokenDiff(adapter, s.draftFor, design).css, "text/css")}>
            CSS
          </Button>
          <Button variant="outline" size="sm" className="flex-1" disabled={!s.hasDraft} onClick={() => download("draft-tokens.json", tokenDiff(adapter, s.draftFor, design).json)}>
            JSON
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">A token diff for the design system team: a proposal, never a decision.</span>
      </div>
    </SidebarGroup>
  )
}

/** Adjust: the parameters, then what the current values change and what to watch. */
export function AdjustPanel() { return adapter.design?.editor ? <FoundationSlot /> : <LegacyAdjustPanel /> }
function LegacyAdjustPanel() {
  const s = useStudio()
  const d = s.designFor(s.theme)
  const changed = params(s.theme).some((p) => !isDefault(p, currentDesignValues(s)[p.id], parameterDefault(adapter, p, s.theme)))
  const labelOf = (id: string) => params(s.theme).find((p) => p.id === id)?.label ?? id
  return (
    <SidebarContent>
      <SidebarGroup className="gap-5 px-3 py-3">
        {params(s.theme).map((p) => (p.kind === "font" ? <FontControl key={p.id} p={p} /> : p.kind === "color" ? <ColorControl key={p.id} p={p} /> : p.kind === "enum" ? <EnumControl key={p.id} p={p} /> : <ScaleControl key={p.id} p={p} />))}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={!changed} onClick={() => s.resetDesign("direction")}>
            <ResetIcon /> Reset Direction
          </Button>
          <Button variant="outline" size="sm" disabled={!s.hasDraft} onClick={() => s.resetDesign("all")}>
            <ResetIcon /> Reset All
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const text = adapter.axes.themes
              .map((theme) => `${theme.label}\n${params(theme.id).map((p) => `${p.label}: ${s.design.valuesByTheme[theme.id]?.[p.id] ?? s.design.values[p.id] ?? parameterDefault(adapter, p, theme.id)}`).join("\n")}`)
              .join("\n\n")
            try {
              await navigator.clipboard.writeText(text)
              toast.success("Copied settings")
            } catch {
              toast.error("Couldn't copy settings")
            }
          }}
        >
          <DownloadIcon /> Copy Settings
        </Button>
      </SidebarGroup>
      <ShareDraft />
      <SidebarGroup className="border-t">
        <SidebarGroupLabel>What changes</SidebarGroupLabel>
        <ul className="grid gap-2 px-2 pb-2 text-xs" aria-label="What changes">
          {!d.changes.length && <li className="text-muted-foreground">Nothing yet. The preview is the product as built.</li>}
          {d.changes.map((c) => (
            <li key={c.param.id} className="grid gap-0.5">
              <span>
                <span className="font-medium">
                  {c.param.label} {readout(c.param, currentDesignValues(s)[c.param.id]!)}
                </span>{" "}
                changes {c.tokens.length} {c.tokens.length === 1 ? "token" : "tokens"}
                {c.css ? " and adds a CSS rule" : ""}
              </span>
              {!!c.tokens.length && (
                <code className="truncate font-mono text-xs text-muted-foreground" title={c.tokens.join(", ")}>
                  {c.tokens.slice(0, 4).join(", ")}
                  {c.tokens.length > 4 ? `, +${c.tokens.length - 4}` : ""}
                </code>
              )}
              {!!c.missing.length && <span className="text-warning">Not in the token source: {c.missing.join(", ")}</span>}
            </li>
          ))}
          {d.warnings.map((w, i) => (
            <li key={i} className="flex gap-1.5 text-warning">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
              <span>
                {labelOf(w.param)}: {w.text}
              </span>
            </li>
          ))}
          {!!d.literal.length && (
            <li className="text-muted-foreground">
              Won’t follow: <code className="font-mono text-xs">{d.literal.join(", ")}</code>
            </li>
          )}
        </ul>
      </SidebarGroup>
    </SidebarContent>
  )
}

/**
 * The type specimen beside the screen: each typeface the draft sets, and each size on the type scale,
 * drawn in this Studio from the same draft values. Fonts load from Google Fonts only.
 */
/** Whether the draft changes type in a theme: a typeface, the type scale, or a size the specimen shows. */
function typeChanged(values: Record<string, number | string>, theme: string) {
  return params(theme).some((p) => !isDefault(p, values[p.id], parameterDefault(adapter, p, theme)) && (p.kind === "font" || p.kind === "ratio" || (p.kind === "scale" && (p.apply.scale ?? []).some((n) => params(theme).some((q) => q.kind === "ratio" && n in (q.apply.steps ?? {}))))))
}

function Specimen() {
  const s = useStudio()
  const values = currentDesignValues(s)
  const d = s.designFor(s.theme)
  const fonts = params().filter((p) => p.kind === "font")
  const sized = params()
    .filter((p) => p.kind === "ratio")
    .flatMap((p) =>
      Object.entries(p.apply.steps ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)
    )
  const base = params()
    .filter((p) => p.kind === "scale" && (p.apply.scale ?? []).some((n) => sized.includes(n)))
    .flatMap((p) => (p.apply.scale ?? []).filter((n) => !sized.includes(n) && !n.includes("*")))
  const sizes = [...new Set([...sized, ...base])]
  const family = fonts.map((p) => String(values[p.id] ?? parameterDefault(adapter, p, s.theme)))[0]
  React.useEffect(() => {
    const links = d.stylesheets.filter(allowedStylesheet).map((href) => {
      const link = Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href,
      })
      link.dataset.specimen = ""
      document.head.append(link)
      return link
    })
    return () => links.forEach((l) => l.remove())
  }, [d.stylesheets])
  if ((!fonts.length && !sizes.length) || !typeChanged(values, s.theme)) return null
  const value = (name: string) => d.tokens[name] ?? baseValue(adapter, name, s.theme)
  return (
    <aside className="w-60 shrink-0 rounded-xl border bg-background p-4 text-foreground shadow-sm" aria-label="Type specimen">
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">Type specimen</h3>
      {fonts.map((p) => {
        const name = String(values[p.id] ?? parameterDefault(adapter, p, s.theme))
        return (
          <div key={p.id} className="mb-3 grid gap-1">
            <span className="text-xs text-muted-foreground">
              {p.label} · {name}
            </span>
            <p className="text-lg leading-snug" style={{ fontFamily: `${fontFamilyValue(name)}, system-ui` }}>
              Pack my box with five dozen liquor jugs
            </p>
          </div>
        )
      })}
      {!!sizes.length && (
        <ul className="grid gap-2 border-t pt-3">
          {sizes.map((name) => {
            const v = value(name)
            const px = v ? toPx(v) : null
            return (
              <li key={name} className="grid gap-0.5">
                <span className={cn("font-mono text-xs text-muted-foreground", d.tokens[name] && "text-info")}>
                  {name} {v ?? "not in the token source"}
                </span>
                {px !== null && (
                  <span
                    className="truncate leading-tight"
                    style={{
                      fontSize: Math.min(px, 40),
                      fontFamily: family ? `${fontFamilyValue(family)}, system-ui` : undefined,
                    }}
                  >
                    Aa Quarterly plan
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

/** Adjust's stage: the product as built, the draft, or both side by side, at one scale. */
export function DesignStage({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  const direction = useDesignSnapshot()
  const basisLabel = adapter.design?.editor ? direction?.savedRevision ? "Saved basis" : "Source baseline" : "As built"
  const [peek, setPeek] = React.useState(false)
  const report = useReportStatus()
  const show = narrow && s.design.show === "split" ? "draft" : s.design.show
  const draft = s.draftFor(s.theme)
  const values = currentDesignValues(s)
  const pr = sizedProfile(s.profile, null)
  const box = React.useRef<HTMLDivElement>(null)
  const sides = show === "split" ? 2 : 1
  const specimen = !narrow && typeChanged(values, s.theme)
  const scale = useFit(box, pr.w * sides, pr.h, s.zoom, 64 + (sides - 1) * 32 + (specimen ? 272 : 0))
  const nav = useStageNav(box, scale)
  const peekOn = {
    onPointerDown: () => setPeek(true),
    onPointerUp: () => setPeek(false),
    onPointerLeave: () => setPeek(false),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), setPeek(true)),
    onKeyUp: () => setPeek(false),
    onBlur: () => setPeek(false),
  }
  const one = (kind: "draft" | "built") => adapter.design?.editor && (kind === "built" || peek) && !s.savedDesignFor(s.theme).direction ? <p role="alert" className="text-sm text-stage-muted">No validated source or confirmed saved basis is available.</p> : (
    <div className="relative flex flex-col items-center gap-2">
      {kind === "draft" && s.hasDraft && !peek ? <StatusBadge kind="draft">Draft design</StatusBadge> : <span className="text-xs font-medium text-stage-muted">{basisLabel}</span>}
      <ScenarioPreview
        scenario={s.scenario}
        theme={s.theme}
        profile={s.profile}
        values={s.values}
        draft={kind === "draft" && !peek ? draft : NO_DRAFT}
        scale={scale}
        label={adapter.design?.editor ? kind === "draft" && s.hasDraft && !peek ? "Draft design preview" : `${basisLabel} preview` : kind === "draft" ? "Draft design preview" : "As built preview"}
        onStatus={kind === show || (show === "split" && kind === "draft") ? report : undefined}
      />
    </div>
  )
  return (
    <div className="stage-surface relative flex min-h-0 min-w-0 flex-1 flex-col">
      <StageNav nav={nav}>
        <div className="flex flex-wrap items-center justify-center gap-1.5 p-3">
          <ToggleGroup value={[show]} onValueChange={(v) => v[0] && s.setDesign({ show: v[0] as typeof s.design.show })} size="sm" spacing={0} variant="outline" className="bg-background" aria-label="Show">
            <ToggleGroupItem value="built" className="h-7 px-2.5 text-xs">
              {basisLabel}
            </ToggleGroupItem>
            <ToggleGroupItem value="draft" className="h-7 px-2.5 text-xs">
              Draft
            </ToggleGroupItem>
            {!narrow && (
              <ToggleGroupItem value="split" className="h-7 px-2.5 text-xs">
                Side by side
              </ToggleGroupItem>
            )}
          </ToggleGroup>
          {show === "draft" && s.hasDraft && (
            <Button variant="outline" size="sm" className="h-7 bg-background text-xs" aria-pressed={peek} {...peekOn}>
              <EyeIcon /> Hold to see as built
            </Button>
          )}
        </div>
        <div ref={box} onPointerDown={nav.onPointerDown} className="flex min-h-0 flex-1 overflow-auto px-4 pb-4">
          <div className="m-auto flex w-max flex-col items-center gap-3">
            <div className="flex items-start gap-8">
              {show === "split" ? (
                <>
                  {one("built")}
                  {one("draft")}
                </>
              ) : (
                one(show)
              )}
              {!narrow && <Specimen />}
            </div>
            <ScaleChip w={pr.w} h={pr.h} scale={scale} />
            <p className="w-0 min-w-full text-center text-xs text-stage-muted">{adapter.design?.directions ? "Working changes preview in the review views. Present uses the confirmed saved or source basis. Named directions are saved locally; browser recovery stays unsaved. Links carry IDs only." : adapter.design?.editor ? "Working changes preview in the review views. Present uses the confirmed saved or source basis. Direction payloads stay out of links; this editor does not implement persistence." : "A draft is exploration. It shows here only, travels in the link, and never changes the product or a walkthrough."}</p>
          </div>
        </div>
      </StageNav>
    </div>
  )
}
