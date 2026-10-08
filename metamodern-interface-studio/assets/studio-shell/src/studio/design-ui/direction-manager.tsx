import * as React from "react"
import { Button, Field, SaveBar, EditorPopover, EditorPopoverClose } from "@/kit"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { latestDirections } from "../directions"
import { useDesignDirections, useDirectionSnapshot, useDesignSnapshot } from "./react"
const NATIVE = "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[1000px]:min-h-11 max-[1000px]:min-w-11"
const NATIVE_FORM = "pointer-coarse:[&_textarea]:text-base! max-[1000px]:[&_button]:min-h-11 max-[1000px]:[&_button]:min-w-11 max-[1000px]:[&_input]:min-h-11 max-[1000px]:[&_input]:text-base! max-[1000px]:[&_textarea]:text-base!"
type DirectionOption = { id: string; label: string; detail?: string; disabled?: boolean }
const optionText = (option: DirectionOption) => `${option.label}${option.detail ? ` · ${option.detail}` : ""}`
function DirectionPicker({ value, options, onChange }: { value: string; options: DirectionOption[]; onChange(value: string): void }) {
  const id = React.useId()
  const selected = options.find(option => option.id === value)
  const content = (option: DirectionOption) => <><span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>{option.detail && <span data-direction-revision className="shrink-0 whitespace-nowrap">· {option.detail}</span>}</>
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1"><label htmlFor={id}>Open direction</label><Select value={value} items={Object.fromEntries(options.map(o => [o.id, optionText(o)]))} onValueChange={v => v && onChange(String(v))}><SelectTrigger id={id} className={`${NATIVE} w-fit min-w-0 max-w-full`} title={selected && optionText(selected)}><SelectValue className="min-w-0 overflow-hidden">{selected && content(selected)}</SelectValue></SelectTrigger><SelectContent data-kit className="max-w-(--available-width)">{options.map(o => <SelectItem key={o.id} value={o.id} disabled={o.disabled} title={optionText(o)} className={`${NATIVE} min-w-0 [&>:first-child]:min-w-0 [&>:first-child]:shrink`}>{content(o)}</SelectItem>)}</SelectContent></Select></div>
}
function download(name: string, text: string) { const url = URL.createObjectURL(new Blob([text], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
export function DirectionManager() {
  const service = useDesignDirections(); const state = useDirectionSnapshot(); const design = useDesignSnapshot()
  const [open, setOpen] = React.useState(false); const [name, setName] = React.useState(""); const [raw, setRaw] = React.useState("")
  if (!service || !state || !design) return null
  const head = state.journal.revisions.find(e => e.id === design.id && e.revision === design.savedRevision)
  const requested = state.selectionProblem && state.requested ? state.journal.revisions.filter(e => e.id === state.requested!.id && (state.requested!.revision === undefined || e.revision === state.requested!.revision)).at(-1) : undefined
  const label = state.draftLabel ?? head?.label ?? "Original source"
  const selected = design.savedRevision ? `${design.id}@${design.savedRevision}` : "direction.source"
  const items = latestDirections(state.journal)
  const activeDeleted = items.find(e => e.envelope.id === design.id)?.deleted ?? false
  const canWrite = state.editable && state.load === "ready" && !state.saving
  const save = () => void service.save(name.trim() || head?.label || state.draftLabel || "New direction")
  const bar = state.save === "conflict" ? { kind: "conflict" as const, reason: state.message ?? "Changed elsewhere", current: <span>Latest file retained. Keep your edit as a new direction or load a saved revision.</span> } : state.save === "error" ? { kind: "error" as const, reason: state.message ?? "Not saved", recoverable: true } : state.save === "saving" ? { kind: "saving" as const } : design.dirty ? { kind: "dirty" as const } : state.save === "saved" ? { kind: "saved" as const } : { kind: "clean" as const }
  return <div data-direction-lifecycle data-kit className={`min-w-0 max-w-full border-b bg-background text-xs [overflow-wrap:anywhere] ${NATIVE_FORM}`}>
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
      <span data-direction-identity className="inline-flex min-w-0 max-w-full items-center gap-1 font-medium">{state.selectionProblem ? "Direction unavailable" : <><span className="min-w-0 truncate" title={label}>{label}</span><span className="shrink-0 whitespace-nowrap">{activeDeleted ? "· deleted (recoverable) " : ""}· {design.savedRevision ? `saved r${design.savedRevision}` : "source"}{design.dirty ? " + unsaved draft" : ""}</span></>}</span>
      <EditorPopover label="Named directions" open={open} onOpenChange={setOpen} trigger={<Button className={NATIVE} size="sm" variant="outline">Directions</Button>}>
        <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 [overflow-wrap:anywhere] ${NATIVE_FORM}`}>
        <DirectionPicker value={selected} options={[{ id: "direction.source", label: "Original source" }, ...(activeDeleted && head ? [{ id: selected, label: `${head.label} · deleted (view only)`, detail: `r${head.revision}`, disabled: true }] : []), ...items.filter(e => !e.deleted).map(({ envelope: e }) => ({ id: `${e.id}@${e.revision}`, label: e.label, detail: `r${e.revision}` }))]} onChange={value => { if (value === "direction.source") void service.select(value); else { const [id, revision] = value.split("@"); void service.select(id, Number(revision)) } }} />
        {state.message && <p role={state.save === "error" || state.save === "conflict" ? "alert" : "status"}>{state.message}</p>}
        <Field kind="text" label="Direction name" value={name} placeholder={head?.label ?? state.draftLabel ?? "New direction"} onChange={setName} />
        <div className="flex flex-wrap gap-2">
          <Button className={NATIVE} disabled={state.saving || !state.editable} onClick={() => void service.beginNew()}>New direction</Button>
          <Button className={NATIVE} disabled={!canWrite || !design.canSave || state.readiness !== "ready" || activeDeleted} onClick={save}>Save direction</Button>
          <Button className={NATIVE} disabled={!canWrite || !design.canSave || state.readiness !== "ready"} onClick={() => void service.save(name.trim() || "New direction", true)}>Save as new</Button>
          <Button className={NATIVE} disabled={!canWrite || !head || activeDeleted || !name.trim()} onClick={() => void service.rename(head!.id, name, head!.revision)}>Rename</Button>
          <Button className={NATIVE} disabled={!canWrite || !head} onClick={() => void service.duplicate(head!.id, name.trim() || `${head!.label} copy`, head!.revision)}>Duplicate</Button>
          <Button className={NATIVE} disabled={!canWrite || !head || activeDeleted} onClick={() => void service.remove(head!.id)}>Delete recoverably</Button>
        </div>
        <p className="text-muted-foreground">Save writes the whole validated direction, paired themes and treatments. Fixture selection and preview interactions are excluded.</p>
        {requested && <><Button className={NATIVE} variant="outline" onClick={() => download(`${requested.id}-r${requested.revision}.json`, service.exportSaved(requested.id, requested.revision))}>Download requested revision</Button><Button className={NATIVE} onClick={() => service.importText(service.exportSaved(requested.id, requested.revision))}>Open requested as unsaved draft</Button></>}
        <Button className={NATIVE} variant="outline" disabled={!head} onClick={() => download(`${head!.id}-r${head!.revision}.json`, service.exportSaved(head!.id, head!.revision))}>Download saved</Button>
        <Button className={NATIVE} variant="outline" onClick={() => download("unsaved-direction.json", service.exportDraft())}>Download draft recovery</Button>
        <label className="grid gap-1">Import direction or legacy variant<textarea className="min-h-24 rounded-lg border bg-background p-2" aria-label="Import direction JSON" value={raw} onChange={e => setRaw(e.target.value)} /></label>
        <Button className={NATIVE} disabled={!raw.trim() || !state.editable} onClick={() => { if (service.importText(raw)) { setRaw(""); setOpen(false) } }}>Import as draft</Button>
        {items.filter(e => e.deleted).map(({ envelope: e }) => <div key={e.id} className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate" title={`${e.label} · deleted, revisions kept`}>{e.label} · deleted, revisions kept</span><Button className={`${NATIVE} min-w-0 max-w-[50%]`} title={`Restore ${e.label}`} disabled={!canWrite} onClick={() => void service.remove(e.id, true)}><span className="truncate">Restore {e.label}</span></Button></div>)}
        {state.quarantine.map(q => <div key={q.id} className="grid gap-1"><p role="alert">{q.label}: {q.reason}</p><Button className={NATIVE} variant="outline" onClick={() => download("rejected-direction.txt", q.raw)}>Download original bytes</Button></div>)}
        <EditorPopoverClose className={NATIVE}>Close directions</EditorPopoverClose>
        </div>
      </EditorPopover>
      <Button className={NATIVE} size="sm" variant="ghost" disabled={!design.canExport || state.readiness !== "ready"} onClick={() => void service.pinDraft()}>Pin working draft</Button>
      <Button className={NATIVE} size="sm" variant="ghost" disabled={state.saving} onClick={() => void service.reload()}>Refresh saved directions</Button>
      {state.readiness !== "ready" && <span>{state.readiness === "pending" ? "Checking source/assets…" : state.readiness === "error" ? "Source/assets unavailable" : "Source readiness waits for a valid draft"}</span>}
      {state.load !== "ready" && <span>{state.load === "readonly" ? "Read-only review · draft recovery/download available" : `Saved files ${state.load}`}</span>}
    </div>
    {state.message && <p role={state.save === "error" || state.save === "conflict" || state.selectionProblem ? "alert" : "status"} className="px-3 pb-2">{state.message}</p>}
    {state.recovery && <div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2"><span>Unsaved browser draft available{state.recovery.baseRevision !== design.savedRevision ? " from an older saved revision" : ""}.</span><Button className={NATIVE} size="sm" onClick={() => service.recover()}>Recover draft</Button><Button className={NATIVE} size="sm" variant="outline" onClick={() => service.discardRecovery()}>Discard recovery</Button></div>}
    {state.load === "ready" && <SaveBar state={bar} onSave={save} onDiscard={() => { if (state.save === "conflict") void service.select(design.id); else service.resetDraft() }} onRetry={() => state.save === "conflict" ? void service.save(name.trim() || head?.label || "Recovered direction", true) : save()} disabled={!design.canSave || state.readiness !== "ready"} conflictSaveLabel="Keep as new direction" conflictDiscardLabel="Load latest saved" />}
  </div>
}
