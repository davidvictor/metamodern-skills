import * as React from "react"
import { NextIcon, LockIcon } from "@/icons"
import { cn } from "@/lib/utils"
import { useCoarse, useMedia } from "@/hooks/use-mobile"
import { SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { adapter } from "@/adapter"
import { VirtualList, type VirtualListHandle } from "@/studio/virtual-list"
import { CompiledInspector } from "@/studio/design-ui/slots"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { isColor, NO_DRAFT, useStudio } from "@/store"
import { ScaleChip, StatusBadge, useFit } from "./bits"
import { ScenarioPreview, profileOf, themeOf, useReportStatus } from "./preview"
import { SearchField } from "./rail-panel"

const SEG = "h-7 min-w-0 gap-1 px-1.5 text-xs"
export function TokensPanel() {
  const s = useStudio()
  const t = adapter.tokens!
  const drafts = Object.keys(s.tokens.drafts).length
  return (
    <>
      <div className="grid gap-2 border-b px-3 pb-3">
        <SearchField id="token-search" placeholder="Name or value" value={s.tokens.query} onChange={(v) => s.set({ tokens: { ...s.tokens, query: v } })} />
        <ToggleGroup value={[s.tokens.flag]} onValueChange={(v) => v[0] && s.set({ tokens: { ...s.tokens, flag: v[0] as typeof s.tokens.flag } })} variant="outline" size="sm" spacing={0} className="grid w-full grid-cols-4" aria-label="Show">
          <ToggleGroupItem value="all" className={SEG}>All</ToggleGroupItem>
          <ToggleGroupItem value="unread" className={SEG}>Unread</ToggleGroupItem>
          <ToggleGroupItem value="literal" className={SEG}>Fixed</ToggleGroupItem>
          <ToggleGroupItem value="draft" className={SEG}>Draft<span className="tabular-nums opacity-55">{drafts}</span></ToggleGroupItem>
        </ToggleGroup>
      </div>
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
              <NextIcon className="ml-auto transition-transform group-data-[open]/shell:rotate-90" />
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
                      <NextIcon className={cn("size-3.5 transition-transform duration-200", r.open && "rotate-90")} />
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
