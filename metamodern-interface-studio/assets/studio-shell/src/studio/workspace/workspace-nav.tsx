/*
 * The workspace's place in the Studio's navigation, loaded with the Studio only when the adapter declares a
 * workspace: rail items after the views, the phone's Workspace entry, drawer and Details button, Go to entries,
 * the breadcrumb, and history for Back. Module code loads separately, when a module opens (workspace-page.tsx).
 */
import * as React from "react"
import { BoxesIcon, InfoIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { adapter } from "@/adapter"
import { leaveGuard, useStudio, type State } from "@/store"
import { RailButton, VIEWS } from "@/components/studio/rail-panel"
import { Button } from "@/components/ui/button"
import { BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { Icon } from "@/kit/icons"
import { resolveModules, type ResolvedModule } from "./declaration"
import { parseModuleLink } from "./link"
import { openingLink } from "./slots"

// Without the module file: only reasons the declaration gives (a declared reason, no operations host). A
// missing component is reported by the module's own page when it opens.
const modules = resolveModules(adapter.workspace, null)
const RING = "outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--sidebar-ring)]"

/** Opens a module at a section, its first when none is named. Details stay hidden until the new module reports them. */
const openPatch = (m: ResolvedModule, open: string | null, section?: string): Partial<State> => ({
  module: m.id,
  section: section ?? m.sections[0]?.id ?? null,
  ...(open !== m.id ? { moduleDetails: false } : {}),
  panelOpen: true,
  mobilePanel: null,
})

export type NavProps = { part: "rail"; labels: boolean } | { part: "commands"; onDone: () => void } | { part: "tab" | "drawer" | "crumbs" | "details-button" | "runtime" }

export function WorkspaceNav(props: NavProps) {
  switch (props.part) {
    case "rail":
      return <RailItems labels={props.labels} />
    case "commands":
      return <Commands onDone={props.onDone} />
    case "tab":
      return <Tab />
    case "drawer":
      return <ModuleDrawer />
    case "crumbs":
      return <Crumbs />
    case "details-button":
      return <DetailsButton />
    case "runtime":
      return <Runtime />
  }
}

/** After the views: a divider, then the modules as square items with the views' marker, focus ring and labels. */
function RailItems({ labels }: { labels: boolean }) {
  const s = useStudio()
  return (
    <>
      <div role="separator" aria-orientation="horizontal" className="mx-2 my-1 h-px shrink-0 bg-sidebar-border" />
      <nav aria-label="Workspace" className="flex flex-col py-1">
        {modules.map((m) => (
          <RailButton key={m.id} label={m.label} labels={labels} active={s.module === m.id} hint={m.unavailable} onClick={() => s.set(s.module === m.id ? { panelOpen: !s.panelOpen } : openPatch(m, s.module))}>
            <Icon name={m.icon} />
          </RailButton>
        ))}
      </nav>
    </>
  )
}

function Commands({ onDone }: { onDone: () => void }) {
  const s = useStudio()
  const open = (m: ResolvedModule, section?: string) => () => {
    onDone()
    s.set(openPatch(m, s.module, section))
  }
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Workspace">
        {modules.flatMap((m) => [
          <CommandItem key={m.id} value={`workspace ${m.label} ${m.id}`} onSelect={open(m)}>
            <Icon name={m.icon} />
            {m.label}
            {m.unavailable && <span className="text-muted-foreground">Unavailable</span>}
          </CommandItem>,
          ...m.sections.map((x) => (
            <CommandItem key={`${m.id}/${x.id}`} value={`workspace ${m.label} ${x.label} ${m.id} ${x.id}`} onSelect={open(m, x.id)}>
              <Icon name={m.icon} />
              {x.label}
              <span className="text-muted-foreground">{m.label}</span>
            </CommandItem>
          )),
        ])}
      </CommandGroup>
    </>
  )
}

/** The phone's bottom bar entry, in Details' place; Details moves to the top bar. */
function Tab() {
  const s = useStudio()
  return (
    <button aria-current={s.module ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors", s.module && "text-foreground")} onClick={() => s.set({ mobilePanel: "workspace" })}>
      <BoxesIcon className="size-5" />
      Workspace
    </button>
  )
}

function ModuleDrawer() {
  const s = useStudio()
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar p-3 text-sidebar-foreground">
      <h2 className="px-1 pb-2 text-sm font-semibold">Workspace</h2>
      <ul className="grid gap-1">
        {modules.map((m) => (
          <li key={m.id} className="grid gap-0.5">
            <button aria-current={s.module === m.id ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-sidebar-accent", RING, s.module === m.id && "bg-sidebar-accent")} onClick={() => s.set(openPatch(m, s.module))}>
              <Icon name={m.icon} className="size-5 shrink-0" />
              <span className="grid min-w-0">
                <span className="truncate">{m.label}</span>
                {m.unavailable && <span className="truncate text-xs font-normal text-muted-foreground">{m.unavailable}</span>}
              </span>
            </button>
            {m.sections.length > 1 && (
              <ul className="grid gap-0.5 pl-11">
                {m.sections.map((x) => (
                  <li key={x.id}>
                    <button aria-current={s.module === m.id && s.section === x.id ? "page" : undefined} className={cn("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-sidebar-accent", RING, s.module === m.id && s.section === x.id && "font-medium")} onClick={() => s.set(openPatch(m, s.module, x.id))}>
                      {x.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Product, then module, then section. */
function Crumbs() {
  const s = useStudio()
  const m = modules.find((x) => x.id === s.module)
  const section = m?.sections.find((x) => x.id === s.section)
  if (!m) return null
  return (
    <>
      <BreadcrumbItem className={cn("min-w-0", section && "hidden sm:inline-flex")}>{section ? m.label : <BreadcrumbPage className="truncate">{m.label}</BreadcrumbPage>}</BreadcrumbItem>
      {section && (
        <>
          <BreadcrumbSeparator className="hidden sm:inline-flex" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{section.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      )}
    </>
  )
}

/** The phone's Details, in the top bar: for a view, or for a module that has Details. */
function DetailsButton() {
  const s = useStudio()
  if (s.module && !s.moduleDetails) return null
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Details" onClick={() => s.set({ mobilePanel: "details" })}>
      <InfoIcon />
    </Button>
  )
}

/**
 * Opening or leaving a module or section adds a history entry, so Back returns. Back out of a module with
 * unsaved changes asks first; Back between the open module's sections never asks (its Page stays mounted).
 */
function Runtime() {
  const { set, module, section } = useStudio()
  const shown = React.useRef({ module, section })
  const fromHistory = React.useRef(false)
  React.useEffect(() => {
    if (module === shown.current.module && section === shown.current.section) return
    shown.current = { module, section }
    // Keep the place being left as its own entry; the Studio then writes the new place over the top one.
    if (fromHistory.current) fromHistory.current = false
    else history.pushState(null, "", location.href)
  }, [module, section])
  React.useEffect(() => {
    const link = parseModuleLink(openingLink, adapter.workspace)
    if (link.unknown) toast.warning("That link names a workspace module this Studio does not have", { id: "studio-unknown-module", description: `${link.unknown} is not declared in this Studio's workspace.`, duration: 12000 })
    let skip = false
    const onPop = () => {
      if (skip) {
        skip = false
        return
      }
      const at = shown.current
      const to = parseModuleLink(location.hash, adapter.workspace)
      // Between two view entries: views keep no history of their own.
      if (to.module === at.module && (!to.module || to.section === at.section)) return
      const view = VIEWS.find((v) => v.id === new URLSearchParams(location.hash.slice(1)).get("view"))?.id
      const patch: Partial<State> = to.module ? { module: to.module, section: to.section, ...(to.module !== at.module ? { moduleDetails: false } : {}) } : { module: null, section: null, ...(view ? { view } : {}) }
      const go = () => {
        fromHistory.current = true
        set(patch)
      }
      if (!leaveGuard.ask || to.module === at.module) return go()
      // Unsaved changes: return to the module's entry until the person decides.
      skip = true
      history.forward()
      leaveGuard.ask(go)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [set])
  return null
}
