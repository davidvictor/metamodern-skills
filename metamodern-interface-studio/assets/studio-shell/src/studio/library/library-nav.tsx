/*
 * The component library's place in the Studio's navigation, loaded with the Studio only when the adapter declares a
 * library: its rail item first, above the views, with a divider after it; Go to entries by group, after Scenarios and
 * before the views; the breadcrumb, the phone entries and Details button, and history for Back. Pages load separately,
 * when the library opens (library-page.tsx).
 */
import * as React from "react"
import { InfoIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { adapter } from "@/adapter"
import { leaveGuard, useStudio, type State } from "@/store"
import { RailButton, VIEWS } from "@/components/studio/rail-panel"
import { Button } from "@/components/ui/button"
import { BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { Icon } from "@/kit/icons"
import { groupedComponents, homePath, LIBRARY_LABEL, libraryProblems } from "./model"
import { parseLibraryLink } from "./link"
import { openingLibraryLink } from "./slots"

const decl = adapter.library ?? { groups: [], components: [] }
const LABEL = decl.label ?? LIBRARY_LABEL
const ICON = decl.icon ?? "layers"
/** Each component once, under its home group: Go to and the rail's first page. */
const groups = groupedComponents(decl, decl.components, true)
const sectionLabel = new Map((decl.sections ?? []).map((x) => [x.id, x.label]))
/** A group's place in Go to: the section and the group with sections, else the group. */
const placeOf = (g: { label: string; section?: string }) => (g.section && sectionLabel.has(g.section) ? `${sectionLabel.get(g.section)} › ${g.label}` : g.label)
const first = groups[0]?.components[0]?.id ?? null
/** The component viewed last, so the rail returns to it. */
let last: string | null = null
const RING = "outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--sidebar-ring)]"
const TAB = "flex min-w-11 flex-auto flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors"

/** Opens a component's page, at a section when one is named. */
const openPatch = (id: string | null, at: string | null = null): Partial<State> => ({ library: id, libraryAt: at, panelOpen: true, mobilePanel: null })

export type NavProps = { part: "rail"; labels: boolean } | { part: "commands"; onDone: () => void } | { part: "tab" | "drawer-entry" | "crumbs" | "details-button" | "runtime" }

export function LibraryNav(props: NavProps) {
  switch (props.part) {
    case "rail":
      return <RailItem labels={props.labels} />
    case "commands":
      return <Commands onDone={props.onDone} />
    case "tab":
      return <Tab />
    case "drawer-entry":
      return <DrawerEntry />
    case "crumbs":
      return <Crumbs />
    case "details-button":
      return <DetailsButton />
    case "runtime":
      return <Runtime />
  }
}

/** First in the rail, above the views: the library as one square item with the views' marker, focus ring and label, then a divider. */
function RailItem({ labels }: { labels: boolean }) {
  const s = useStudio()
  return (
    <>
      <nav aria-label={LABEL} className="flex flex-col py-1">
        <RailButton label={LABEL} labels={labels} active={!!s.library} onClick={() => s.set(s.library ? { panelOpen: !s.panelOpen } : openPatch(last ?? first))}>
          <Icon name={ICON} />
        </RailButton>
      </nav>
      <div role="separator" aria-orientation="horizontal" className="mx-2 my-1 h-px shrink-0 bg-sidebar-border" />
    </>
  )
}

/**
 * One Go to group per library group, in the declared order, each after a separator (Go to places them after Scenarios).
 * With sections a group's heading names its section too; a cross-listed component appears once, under its home group.
 */
function Commands({ onDone }: { onDone: () => void }) {
  const s = useStudio()
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.id}>
          <CommandSeparator />
          <CommandGroup heading={`${LABEL}: ${placeOf(g)}`}>
            {g.components.map((c) => (
              <CommandItem
                key={c.id}
                value={`library ${LABEL} ${placeOf(g)} ${c.label} ${c.id} ${(c.keywords ?? []).join(" ")}`}
                onSelect={() => {
                  onDone()
                  s.set(openPatch(c.id))
                }}
              >
                <Icon name={ICON} />
                {c.label}
                <span className="text-muted-foreground">{placeOf(g)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </React.Fragment>
      ))}
    </>
  )
}

/** The phone's bottom bar entry, in Details' place, in a Studio without a workspace: opens the library and its component list. */
function Tab() {
  const s = useStudio()
  return (
    <button aria-current={s.library ? "page" : undefined} className={cn(TAB, s.library && "text-foreground")} onClick={() => s.set({ ...openPatch(s.library ?? last ?? first), mobilePanel: "panel" })}>
      <Icon name={ICON} className="size-5" />
      <span className="max-w-full truncate">{LABEL}</span>
    </button>
  )
}

/** In a Studio with a workspace, the library's entry in the phone's Workspace drawer, after its modules. */
function DrawerEntry() {
  const s = useStudio()
  return (
    <div className="mt-3 border-t pt-3">
      <button aria-current={s.library ? "page" : undefined} className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-sidebar-accent", RING, s.library && "bg-sidebar-accent")} onClick={() => s.set({ ...openPatch(s.library ?? last ?? first), mobilePanel: "panel" })}>
        <Icon name={ICON} className="size-5 shrink-0" />
        {LABEL}
      </button>
    </div>
  )
}

/** Product, then the library, the component's home section (with sections) and group, and the component. */
function Crumbs() {
  const s = useStudio()
  const { section: x, group: g, component: c } = homePath(decl, s.library)
  return (
    <>
      <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
        <span className="truncate">{LABEL}</span>
      </BreadcrumbItem>
      {x && (
        <>
          <BreadcrumbSeparator className="hidden md:inline-flex" />
          <BreadcrumbItem className="hidden min-w-0 md:inline-flex">
            <span className="truncate">{x.label}</span>
          </BreadcrumbItem>
        </>
      )}
      {g && (
        <>
          <BreadcrumbSeparator className="hidden md:inline-flex" />
          <BreadcrumbItem className="hidden min-w-0 md:inline-flex">
            <span className="truncate">{g.label}</span>
          </BreadcrumbItem>
        </>
      )}
      {c && (
        <>
          <BreadcrumbSeparator className="hidden sm:inline-flex" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      )}
    </>
  )
}

/** The phone's Details in the top bar, in a Studio without a workspace (the workspace's own button serves otherwise). */
function DetailsButton() {
  const s = useStudio()
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Details" onClick={() => s.set({ mobilePanel: "details" })}>
      <InfoIcon />
    </Button>
  )
}

/**
 * Opening another component adds a history entry, so Back returns; an outline choice only replaces the link. When the
 * same change also opens or leaves a workspace module, the workspace adds the entry instead, so there is only one.
 * Back out of a module with unsaved changes is the workspace's to ask about; it replays the step when the person leaves.
 */
function Runtime() {
  const { set, library, module } = useStudio()
  const shown = React.useRef({ library, module })
  const fromHistory = React.useRef(false)
  React.useEffect(() => {
    const before = shown.current
    shown.current = { library, module }
    if (library === before.library) return
    if (library) last = library
    if (fromHistory.current) {
      fromHistory.current = false
      return
    }
    if (module !== before.module) return
    // Keep the place being left as its own entry; the Studio then writes the new place over the top one.
    history.pushState(null, "", location.href)
  }, [library, module])
  React.useEffect(() => {
    const problems = libraryProblems(adapter.library)
    if (problems.length) {
      console.error(`Interface Studio: the library declaration is invalid:\n  ${problems.join("\n  ")}`)
      toast.error("The component library declaration is invalid", { id: "studio-library-invalid", description: problems.join(" "), duration: Infinity })
    }
    const link = parseLibraryLink(openingLibraryLink, adapter.library)
    if (link.unknown) toast.warning("That link names a component this Studio's library does not have", { id: "studio-unknown-component", description: `${link.unknown} is not declared in this Studio's library.`, duration: 12000 })
    const onPop = () => {
      if (leaveGuard.ask) return
      const at = shown.current.library
      const to = parseLibraryLink(location.hash, adapter.library)
      if (to.library === at) return
      const q = new URLSearchParams(location.hash.slice(1))
      const view = VIEWS.find((v) => v.id === q.get("view"))?.id
      fromHistory.current = true
      set(to.library ? { library: to.library, libraryAt: to.at } : q.get("module") ? { library: null, libraryAt: null } : { library: null, libraryAt: null, ...(view ? { view } : {}) })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [set])
  return null
}
