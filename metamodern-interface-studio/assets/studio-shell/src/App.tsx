import * as React from "react"
import { ListTreeIcon, InfoIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { adapter } from "@/adapter"
import { designTab, StudioProvider, useStudio } from "@/store"
import { ContextPanel, MobilePanel, Rail, VIEWS } from "@/components/studio/rail-panel"
import { DetailsContent, StageControls, TopBar } from "@/components/studio/chrome"
import { CompareStage, GalleryStage, InspectStage, PresentStage, TokensStage } from "@/components/studio/views"
import { DesignStage } from "@/components/studio/design"
import { ResponsiveStage } from "@/components/studio/responsive"
import { CommandMenu, ShortcutsDialog } from "@/components/studio/command"

function useGlobalKeys() {
  const s = useStudio()
  const ref = React.useRef(s)
  React.useLayoutEffect(() => {
    ref.current = s
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = ref.current
      const t = e.target as HTMLElement | null
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); s.set({ commandOpen: !s.commandOpen }); return }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); s.set({ detailsOpen: !s.detailsOpen }); return }
      // Never steal keys from fields, open dialogs, or a preview frame.
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox'], iframe")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.shiftKey && e.code === "Digit1") { s.set({ zoom: "fit" }); return }
      if (e.shiftKey && e.code === "Digit0") { s.set({ zoom: 100 }); return }
      if (e.key === "/") { e.preventDefault(); s.set({ panelOpen: true }); window.setTimeout(() => (document.querySelector("[data-search]") as HTMLInputElement | null)?.focus(), 60); return }
      if (e.key === "?") { s.set({ shortcutsOpen: true }); return }
      const v = VIEWS.find((x) => x.key === e.key)
      if (v) { s.set({ view: v.id }); return }
      if (s.view === "present") {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); s.set({ present: { ...s.present, step: Math.max(0, s.present.step + (e.key === "ArrowRight" ? 1 : -1)), elapsed: 0 } }); return }
        if (e.key === " ") { e.preventDefault(); s.set({ present: { ...s.present, playing: !s.present.playing } }); return }
        if (e.key === "Escape") { s.set({ view: "inspect", present: { ...s.present, playing: false } }); return }
      }
      if (s.view === "compare" && e.key === " " && !t?.closest("button")) { e.preventDefault(); s.set({ compare: { ...s.compare, showB: !s.compare.showB, mode: s.compare.mode === "side" ? "toggle" : s.compare.mode } }); return }
      if (e.key === "[" || e.key === "]") { s.step(e.key === "]" ? 1 : -1); return }
      if (e.key.toLowerCase() === "r" && s.view === "inspect") s.reset()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

/** Present takes over the stage: remember what opened it and give focus back on exit. */
function usePresentFocus() {
  const view = useStudio().view
  const opener = React.useRef<HTMLElement | null>(null)
  const prev = React.useRef(view)
  React.useEffect(() => {
    if (prev.current !== "present" && view === "present") opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    // Only restore when focus was lost with the player; a click elsewhere keeps its own focus.
    const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected
    if (prev.current === "present" && view !== "present" && lost) {
      const target = opener.current && opener.current.isConnected ? opener.current : document.querySelector<HTMLElement>('[aria-label="Studio"] button[aria-pressed="true"]')
      target?.focus({ preventScroll: true })
    }
    prev.current = view
  }, [view])
}

function StageForView({ narrow }: { narrow?: boolean }) {
  const s = useStudio()
  return (
    <div key={s.view} className="flex min-h-0 min-w-0 flex-1 animate-in fade-in-0 duration-200">
      {s.view === "inspect" && <InspectStage narrow={narrow} />}
      {s.view === "compare" && <CompareStage narrow={narrow} />}
      {s.view === "responsive" && <ResponsiveStage narrow={narrow} />}
      {s.view === "gallery" && <GalleryStage />}
      {s.view === "present" && <PresentStage narrow={narrow} />}
      {s.view === "design" && (designTab(s.design.tab) === "tokens" ? <TokensStage /> : <DesignStage narrow={narrow} />)}
    </div>
  )
}

function Details() {
  const s = useStudio()
  const hidden = s.view === "gallery" || s.view === "present"
  const open = s.detailsOpen && !hidden
  if (s.options.details === "floating")
    return (
      <div className={cn("pointer-events-none absolute top-3 right-3 bottom-20 z-20 w-80 transition-all duration-300 ease-out-quint", open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0")}>
        <aside aria-label="Details" aria-hidden={!open} className={cn("h-full overflow-hidden rounded-xl border bg-popover shadow-[var(--dock-shadow)]", open && "pointer-events-auto")}>
          {open && <DetailsContent onClose={() => s.set({ detailsOpen: false })} />}
        </aside>
      </div>
    )
  return (
    <aside aria-label="Details" aria-hidden={!open} className={cn("panel-slide shrink-0 overflow-hidden border-l bg-background", open ? "w-80 opacity-100" : "w-0 border-l-0 opacity-0")}>
      <div className="h-full w-80">{open && <DetailsContent />}</div>
    </aside>
  )
}

function useWide() {
  const q = "(min-width: 1280px)"
  const [wide, setWide] = React.useState(() => window.matchMedia(q).matches)
  React.useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setWide(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return wide
}

function DesktopShell() {
  const s = useStudio()
  // Below 1280 px only one side panel stays open: the one just opened wins.
  const wide = useWide()
  const prev = React.useRef({ p: s.panelOpen, d: s.detailsOpen })
  React.useEffect(() => {
    if (!wide && s.panelOpen && s.detailsOpen && s.options.details === "docked") {
      if (!prev.current.d) s.set({ panelOpen: false })
      else s.set({ detailsOpen: false })
    }
    prev.current = { p: s.panelOpen, d: s.detailsOpen }
  }, [wide, s.panelOpen, s.detailsOpen, s.options.details, s])
  const railW = s.options.railLabels ? "4.25rem" : "3rem"
  return (
    <SidebarProvider
      open={s.panelOpen}
      onOpenChange={(o) => s.set({ panelOpen: o })}
      style={{ "--sidebar-width": `calc(${railW} + 17rem)`, "--sidebar-width-icon": railW } as React.CSSProperties}
      className="h-svh"
    >
      <Sidebar collapsible="icon" className="overflow-hidden *:data-[sidebar=sidebar]:flex-row">
        <Rail labels={s.options.railLabels} />
        <ContextPanel />
        <SidebarRail aria-label={s.panelOpen ? "Hide panel" : "Show panel"} title={s.panelOpen ? "Hide panel (⌘B)" : "Show panel (⌘B)"} className="after:transition-colors hover:after:bg-sidebar-primary/60" />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <StageForView />
          <Details />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function MobileShell() {
  const s = useStudio()
  // On a phone with no profile chosen, open on the product's phone profile when it exists.
  const once = React.useRef(false)
  React.useEffect(() => {
    if (once.current) return
    once.current = true
    if (adapter.axes.defaultProfile) return
    const phone = adapter.axes.profiles.find((p) => p.kind === "phone")
    if (phone && adapter.axes.profiles.find((p) => p.id === s.profile)?.kind !== "phone") s.setProfile(phone.id)
  }, [s])
  const tabs = VIEWS
  return (
    <SidebarProvider className="h-svh flex-col" open={false}>
      <TopBar mobile />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <StageForView narrow />
      </div>
      {s.view === "inspect" && (
        <div className="flex justify-center border-t bg-background px-2 py-1.5">
          <StageControls variant="toolbar" compact />
        </div>
      )}
      <nav aria-label="Views" className="grid border-t bg-background pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${tabs.length + 2}, minmax(0, 1fr))` }}>
        <button className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground" onClick={() => s.set({ mobilePanel: "panel" })}>
          <ListTreeIcon className="size-5" />Panel
        </button>
        {tabs.map((v) => (
          <button key={v.id} aria-current={s.view === v.id ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors", s.view === v.id && "text-foreground")} onClick={() => s.set({ view: v.id })}>
            <v.icon className="size-5" />{v.label}
          </button>
        ))}
        <button className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground" onClick={() => s.set({ mobilePanel: "details" })}>
          <InfoIcon className="size-5" />Details
        </button>
      </nav>
      <Drawer open={s.mobilePanel !== null} onOpenChange={(o) => !o && s.set({ mobilePanel: null })} showSwipeHandle>
        <DrawerContent className="h-[82svh]">
          <DrawerTitle className="sr-only">{s.mobilePanel === "details" ? "Details" : "Panel"}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{s.mobilePanel === "details" ? <DetailsContent /> : <MobilePanel />}</div>
        </DrawerContent>
      </Drawer>
    </SidebarProvider>
  )
}

function Shell() {
  const mobile = useIsMobile()
  useGlobalKeys()
  usePresentFocus()
  return (
    <TooltipProvider delay={350}>
      {mobile ? <MobileShell /> : <DesktopShell />}
      <CommandMenu />
      <ShortcutsDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

export function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  )
}

export default App
