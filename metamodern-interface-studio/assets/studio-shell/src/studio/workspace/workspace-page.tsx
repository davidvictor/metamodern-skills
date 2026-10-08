/*
 * The open workspace module, loaded only when a module opens: its page on the Studio surface, its sections
 * and Panel in the context panel, its Details, and the question asked before leaving unsaved changes. Module
 * code is the product's (src/workspace/index.ts), built from the kit. A module's Page stays mounted while
 * the person moves between its sections, so drafts survive a section change.
 */
import * as React from "react"
import { PanelRightIcon } from "@/icons"
import { toast } from "sonner"
import workspace from "@/workspace"
import { adapter } from "@/adapter"
import { leaveGuard, useStudio } from "@/store"
import { SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog, EmptyState, ModulePage } from "@/kit"
import type { ModuleDefinition } from "./api"
import { ModuleContext, type ModuleInfo } from "./context"
import { resolveModules, undeclaredDefinitions } from "./declaration"
import { validItem } from "./link"
import { answered, guards, hostStatus, retryHost } from "./stores"

const defined = Object.keys(workspace.modules)
const modules = resolveModules(adapter.workspace, defined)
const orphans = undeclaredDefinitions(adapter.workspace, defined)
if (orphans.length) {
  // The build fails on this when it can load the adapter; when it cannot, this is where it shows.
  const reason = `src/workspace/index.ts defines ${orphans.join(", ")}, which the adapter does not declare in workspace.modules. Declare it there or remove it; a build fails on this.`
  console.error(reason)
  toast.error("A workspace module is not declared", { id: "studio-undeclared-module", description: reason, duration: Infinity })
}

export type PageProps = { part: "stage" } | { part: "panel" } | { part: "details"; onClose?: () => void }

export function WorkspacePage(props: PageProps) {
  if (props.part === "stage") return <ModuleStage />
  if (props.part === "panel") return <ModulePanel />
  return <ModuleDetails onClose={props.onClose} />
}

/** The open module as its components see it, why it cannot open, and its definition. */
function useOpenModule(): { info: ModuleInfo | null; reason: string | null; hostDown: boolean; def: ModuleDefinition | undefined } {
  const { module, section, item, set } = useStudio()
  const host = React.useSyncExternalStore(hostStatus.subscribe, hostStatus.get)
  const started = React.useSyncExternalStore(answered.subscribe, answered.get)
  const unsaved = React.useSyncExternalStore(guards.subscribe, guards.active)
  const m = modules.find((x) => x.id === module)
  // `uses` is the declaration's own array, so operation clients built from it keep their identity across renders.
  const info = React.useMemo<ModuleInfo | null>(
    () => (m ? { id: m.id, label: m.label, sections: m.sections, section, go: (next) => set({ section: next, item: null }), item, setItem: (next) => set({ item: validItem(next) }), uses: m.uses, operations: adapter.workspace?.operations } : null),
    [m, section, item, set]
  )
  // A missing host stops a module only before the host has answered it, and never while it has unsaved changes:
  // the page is not swapped out under an edit. Otherwise each operation reports it (stores.ts).
  const down = m && !started[m.id] && !unsaved ? (host[m.id] ?? null) : null
  const reason = m?.unavailable ?? down
  return { info, reason, hostDown: !m?.unavailable && !!down, def: m ? workspace.modules[m.id] : undefined }
}

/** A module that throws shows its reason instead of taking the Studio down. */
class ModuleBoundary extends React.Component<{ label: string; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return <EmptyState tone="danger" title={`${this.props.label} stopped`} description={this.state.error.message} action={{ label: "Try again", onClick: () => this.setState({ error: null }) }} />
  }
}

function ModuleStage() {
  const { info, reason, hostDown, def } = useOpenModule()
  const { set, moduleDetails } = useStudio()
  const hasDetails = !!def?.Details && !reason
  React.useEffect(() => {
    if (moduleDetails !== hasDetails) set({ moduleDetails: hasDetails })
  }, [set, hasDetails, moduleDetails])
  if (!info) return null
  const Page = def?.Page
  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-background">
      <ModuleContext.Provider value={info}>
        {reason || !Page ? (
          <ModulePage title={info.label}>
            <EmptyState title={`${info.label} is unavailable`} description={reason ?? ""} action={hostDown ? { label: "Try again", onClick: () => retryHost(info.id) } : undefined} />
          </ModulePage>
        ) : (
          <ModuleBoundary key={info.id} label={info.label}>
            <Page />
          </ModuleBoundary>
        )}
      </ModuleContext.Provider>
      <LeaveGuard />
    </div>
  )
}

/** While a module has unsaved changes, leaving it asks first; Esc and Stay keep the edits. */
function LeaveGuard() {
  const message = React.useSyncExternalStore(guards.subscribe, guards.active)
  const [pending, setPending] = React.useState<(() => void) | null>(null)
  React.useEffect(() => {
    leaveGuard.ask = message ? (proceed) => setPending(() => proceed) : null
    return () => {
      leaveGuard.ask = null
    }
  }, [message])
  return (
    <ConfirmDialog
      open={!!pending}
      title="Leave without saving?"
      description={message ?? undefined}
      confirmLabel="Leave without saving"
      cancelLabel="Stay"
      tone="danger"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const proceed = pending
        guards.release()
        leaveGuard.ask = null
        setPending(null)
        proceed?.()
      }}
    />
  )
}

function ModulePanel() {
  const { info, reason, def } = useOpenModule()
  if (!info) return null
  const Panel = def?.Panel
  return (
    <>
      <SidebarHeader className="gap-1 border-b p-3">
        <div className="flex h-7 items-center">
          <h2 className="text-sm font-semibold text-foreground">{info.label}</h2>
        </div>
        {reason && <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>}
      </SidebarHeader>
      <SidebarContent>
        <ModuleContext.Provider value={info}>
          {info.sections.length > 0 && (
            <nav aria-label="Sections" className="p-2">
              <SidebarMenu>
                {info.sections.map((x) => (
                  <SidebarMenuItem key={x.id}>
                    <SidebarMenuButton isActive={info.section === x.id} aria-current={info.section === x.id ? "page" : undefined} className="pointer-coarse:min-h-11" onClick={() => info.go(x.id)}>
                      {x.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          )}
          {Panel && !reason && (
            <div data-kit className="border-t p-3">
              <ModuleBoundary label={info.label}>
                <Panel />
              </ModuleBoundary>
            </div>
          )}
        </ModuleContext.Provider>
      </SidebarContent>
    </>
  )
}

function ModuleDetails({ onClose }: { onClose?: () => void }) {
  const { info, reason, def } = useOpenModule()
  if (!info) return null
  const Details = def?.Details
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <h2 className="font-heading text-base font-semibold">{info.label}</h2>
        {onClose && (
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close details" onClick={onClose}>
            <PanelRightIcon />
          </Button>
        )}
      </div>
      <div data-kit className="min-h-0 flex-1 overflow-y-auto p-4">
        <ModuleContext.Provider value={info}>
          {Details && !reason ? (
            <ModuleBoundary label={info.label}>
              <Details />
            </ModuleBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{reason ?? `${info.label} has no details.`}</p>
          )}
        </ModuleContext.Provider>
      </div>
    </div>
  )
}
