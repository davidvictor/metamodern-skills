import * as React from "react"
import { adapter } from "@/adapter"
import { useStudio } from "@/store"
import { createDesignReviewContext } from "./review"
import { useOptionalDesignEditor, useDesignSnapshot, useDirectionSnapshot } from "./react"
import { Button } from "@/components/ui/button"
import { SidebarContent, SidebarGroup } from "@/components/ui/sidebar"

export function EditorReason() {
  const context = useOptionalDesignEditor()
  const state = useDesignSnapshot()
  const reason = context?.reason ?? (state && state.status !== "pending" ? state.problems.map(p => p.message).join("; ") || "No valid compiled direction" : "Loading design editor and source baseline…")
  return <div role={state?.status === "error" || state?.status === "invalid" || context?.reason ? "alert" : "status"} className="min-w-0 max-w-full p-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">{reason}</div>
}
export function DesignEditorStatus({ compact = false }: { compact?: boolean }) {
  const lifecycle = useDirectionSnapshot()
  const context = useOptionalDesignEditor()
  const state = useDesignSnapshot()
  if (!context || lifecycle?.selectionProblem) return null
  if (!state) return <EditorReason />
  return <div data-design-status className="min-w-0 max-w-full border-b px-3 py-2 text-xs [overflow-wrap:anywhere]" aria-live="polite">
    <p className="font-medium">{state.dirty ? `Draft · revision ${state.draftRevision}` : state.savedRevision ? `Saved · revision ${state.savedRevision}` : "Source baseline"} · {state.status}{state.previewPending ? " · applying previews" : ""}</p>
    {state.status !== "ready" && Object.keys(state.compiled).length > 0 && <p className="text-muted-foreground">Showing last valid revision {state.compiledRevision}</p>}
    {[...state.problems, ...Object.values(state.inputProblems)].map(p => <p key={p.id} role={p.severity === "error" ? "alert" : undefined}>{p.message}</p>)}
    {!compact && <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={!state.canUndo || !context.declaration?.capabilities.includes("history")} onClick={() => context.controller?.undo()}>Undo</Button><Button size="sm" variant="ghost" disabled={!state.canRedo || !context.declaration?.capabilities.includes("history")} onClick={() => context.controller?.redo()}>Redo</Button><Button size="sm" variant="ghost" disabled={!context.declaration?.capabilities.includes("reset")} onClick={() => context.controller?.reset({ basis: "saved" })}>Reset to saved</Button><Button size="sm" variant="ghost" disabled={!context.declaration?.capabilities.includes("reset")} onClick={() => context.controller?.reset({ basis: "original" })}>Reset to source</Button></div>}
  </div>
}
export function FoundationSlot() {
  const lifecycle = useDirectionSnapshot()
  const s = useStudio()
  const review = createDesignReviewContext(s.scenario, adapter.scenarios, id => s.selectScenario(id, { mobilePanel: s.mobilePanel }))
  const context = useOptionalDesignEditor()
  const Panel = context?.declaration?.slots.includes("foundation") ? context.module?.Foundation : undefined
  React.useEffect(() => { context?.controller?.setTarget(undefined) }, [context?.controller])
  if (lifecycle?.selectionProblem) return <p role="alert" className="min-w-0 max-w-full p-4 text-sm [overflow-wrap:anywhere]">{lifecycle.selectionProblem}</p>
  if (context?.declaration && !context.declaration.slots.includes("foundation")) return <SidebarContent><DesignEditorStatus /><p className="p-4 text-sm text-muted-foreground">Foundation panel is not provided by this editor.</p></SidebarContent>
  return <SidebarContent><DesignEditorStatus /><SidebarGroup data-kit className="gap-5 px-3 py-3">{Panel && context?.controller ? <Panel controller={context.controller} review={review} /> : <EditorReason />}</SidebarGroup></SidebarContent>
}
export function ComponentSlot({ component }: { component: string }) {
  const lifecycle = useDirectionSnapshot()
  const s = useStudio()
  const review = createDesignReviewContext(s.scenario, adapter.scenarios, id => s.selectScenario(id, { mobilePanel: s.mobilePanel }))
  const context = useOptionalDesignEditor()
  const Panel = context?.declaration?.slots.includes("component") ? context.module?.Component : undefined
  React.useEffect(() => { context?.controller?.setTarget({ component }) }, [context?.controller, component])
  if (!context || !Panel) return null
  if (lifecycle?.selectionProblem) return <p role="alert" className="min-w-0 max-w-full [overflow-wrap:anywhere]">{lifecycle.selectionProblem}</p>
  return <section aria-label="Treatment" className="grid gap-3 border-t pt-4"><h3 className="text-sm font-medium">Treatment</h3><DesignEditorStatus />{context.controller ? <Panel controller={context.controller} component={component} review={review} /> : <EditorReason />}</section>
}
/** Opt-in tokens inspect the compiler output; they never edit a second interpretation path. */
export function CompiledInspector({ sourceOnly = false }: { sourceOnly?: boolean }) {
  const context = useOptionalDesignEditor()
  const state = useDesignSnapshot()
  const [tab, setTab] = React.useState<"compiled" | "source">(sourceOnly ? "source" : "compiled")
  if (!context || !state) return <EditorReason />
  return <div data-kit className="min-h-0 flex-1 overflow-auto p-4"><DesignEditorStatus /><div className="my-3 flex gap-2"><Button variant={tab === "compiled" ? "secondary" : "ghost"} onClick={() => setTab("compiled")}>Compiled</Button><Button variant={tab === "source" ? "secondary" : "ghost"} onClick={() => setTab("source")}>Source</Button></div>
    {Object.entries(state.compiled).map(([theme, output]) => <section key={theme} className="mb-6"><h2 className="font-heading text-base font-semibold">{theme}</h2><p className="break-all font-mono text-xs text-muted-foreground">Fingerprint {output.fingerprint}</p>{tab === "compiled" ? <dl className="mt-3 grid gap-2">{Object.entries(output.tokens).map(([name, value]) => <div key={name} className="grid grid-cols-2 gap-2 text-xs"><dt className="break-all font-mono">{name}</dt><dd className="break-all font-mono">{value}</dd></div>)}</dl> : <><p className="mt-3 text-xs">Source lock: {output.sourceLockId ?? "Not declared"}</p>{(output.diagnostics ?? []).map(d => <p key={d.id} className="text-xs">{d.label}: {d.message}</p>)}</>}</section>)}
  </div>
}
