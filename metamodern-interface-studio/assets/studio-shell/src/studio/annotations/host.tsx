import { committedStudioLocation, subscribeStudioLocation } from "../location"
import { createPortal } from "react-dom"
import * as React from "react"
import { adapter } from "@/adapter"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { fingerprint } from "../protocol"
import { annotationBridge } from "./bridge"
import { feedbackMarkdown, annotationHydration, validEvent, validRecord } from "./model"
import { createAnnotationClient } from "./client"
import type { AnnotationContext, AnnotationEvent, AnnotationScope, AnnotationSession, FeedbackRecord } from "./types"
const declaration = adapter.annotations!
const storageKey = `studio-feedback/1:${declaration.id}:${location.origin}`
const preferenceKey = `${storageKey}:enabled`
let memory: FeedbackRecord[] | undefined
function initialNotes() { if (memory) return memory; try { const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); return Array.isArray(value) ? value.filter(validRecord) : [] } catch { return [] } }
function initialEnabled() { try { const saved = localStorage.getItem(preferenceKey); return saved === null ? declaration.defaultEnabled === true : saved === "true" } catch { return declaration.defaultEnabled === true } }
const noSubscription = () => () => undefined
export function Annotations({ page }: { page: "library" | "inspect" }) {
  const [enabled, setEnabled] = React.useState(initialEnabled)
  const [notes, setNotes] = React.useState<FeedbackRecord[]>(initialNotes)
  const notesRef = React.useRef(notes)
  const [selected, setSelected] = React.useState("studio")
  const [review, setReview] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [active, setActive] = React.useState("")
  const [viewport, setViewport] = React.useState(() => ({ width: innerWidth, height: innerHeight, scale: 1 }))
  React.useEffect(() => { const resized = () => setViewport({ width: innerWidth, height: innerHeight, scale: 1 }); addEventListener("resize", resized); return () => removeEventListener("resize", resized) }, [])
  const observedTarget = enabled ? selected : null
  const subscribe = React.useCallback((listener: () => void) => annotationBridge.subscribeFor(observedTarget, listener), [observedTarget])
  const snapshot = React.useCallback(() => annotationBridge.snapshotFor(observedTarget), [observedTarget])
  React.useSyncExternalStore(subscribe, snapshot)
  const studioLocation = React.useSyncExternalStore(enabled && selected === "studio" ? subscribeStudioLocation : noSubscription, committedStudioLocation)
  const portalContainer = annotationBridge.portal()
  const targets = annotationBridge.targets()
  const target = targets.find(value => value.id === selected)
  const context: AnnotationContext = selected === "studio" ? { layer: "studio", page, viewport, location: studioLocation, revision: adapter.product.revision, shellVersion: "0.19.1" } : target?.context ?? { layer: "preview", page, viewport: { width: 1, height: 1, scale: 1 }, shellVersion: "0.19.1" }
  const contextKey = fingerprint(context)
  const sessionRef = React.useRef<AnnotationSession | null>(null)
  const selectedRef = React.useRef(selected)
  React.useLayoutEffect(() => { selectedRef.current = selected }, [selected])
  const hostClient = React.useMemo(() => createAnnotationClient({ load: () => import("./runtime") }), [])
  const pendingStop = React.useRef<{ id: string; generation: string; done: () => void } | null>(null)
  const persist = React.useCallback((next: FeedbackRecord[]) => {
    setNotes(next)
    notesRef.current = next
    memory = next
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { setNotice("Feedback is held in memory. Copy it before closing this tab; browser storage is unavailable.") }
  }, [])
  const receive = React.useCallback((id: string, event: AnnotationEvent) => {
    if (!validEvent(event)) { setNotice("Annotation exceeds the supported size or has invalid data. Shorten it and retry; no comment was truncated."); return }
    const session = sessionRef.current
    if (event.action === "stopped") { const pending = pendingStop.current; if (pending?.id === id && pending.generation === event.generation) pending.done(); return }
    if (!session || id !== selectedRef.current || event.generation !== session.generation || event.fingerprint !== session.fingerprint) return
    if (event.action === "ready") { setActive(id); return }
    if (event.action === "review") { setReview(true); return }
    if (event.action === "error") { setNotice(event.reason); return }
    const same = (note: FeedbackRecord) => note.session.fingerprint === session.fingerprint && note.session.context.layer === session.context.layer
    if (event.action === "clear") { persist(notesRef.current.filter(note => !same(note))); return }
    if (event.action === "delete") { persist(notesRef.current.filter(note => !(same(note) && note.annotation.id === event.id))); return }
    const raw = event.annotation
    const key = `${declaration.id}:${location.origin}:${session.context.layer}:${session.context.scenario ?? "studio"}:${session.context.component ?? ""}:${session.context.block ?? ""}:${session.fingerprint}:${raw.id}`
    const previous = notesRef.current.find(note => note.key === key)
    const scope: AnnotationScope = previous?.scope ?? (session.context.layer === "studio" ? "studio" : "example")
    let source: FeedbackRecord["source"]
    try { source = declaration.resolveSource(session.context, raw, scope) } catch { source = { owner: "Unresolved", confidence: "unresolved", paths: [] } }
    const note: FeedbackRecord = { schema: "studio-feedback/1", key, capturedAt: previous?.capturedAt ?? new Date().toISOString(), product: declaration.id, repository: source.repository ?? declaration.repository, origin: location.origin, session: structuredClone(session), scope, source, annotation: raw }
    if (!validRecord(note)) { setNotice("This note and its capture context exceed the storage limit. Shorten the note and retry; nothing was truncated."); return }
    persist([...notesRef.current.filter(value => value.key !== key), note])
  }, [persist])
  React.useEffect(() => annotationBridge.listen(receive), [receive])
  React.useEffect(() => { annotationBridge.setEnabled(enabled); return () => annotationBridge.setEnabled(false) }, [enabled])
  // Serialize revocation acknowledgements. A delayed import can never revive a previous generation.
  const chain = React.useRef(Promise.resolve())
  React.useEffect(() => {
    const snapshot = structuredClone(context)
    const previous = sessionRef.current
    const oldTarget = selected === "studio" ? undefined : target
    let cancel = false
    chain.current = chain.current.then(async () => {
      if (cancel || !enabled || review || (selected !== "studio" && !target?.available)) return
      const session = { generation: crypto.randomUUID(), fingerprint: contextKey, context: snapshot }
      sessionRef.current = session
      const matching = notesRef.current.filter(note => note.session.fingerprint === session.fingerprint && note.session.context.layer === snapshot.layer).map(note => note.annotation)
      const { command, omitted } = annotationHydration(session, matching)
      if (omitted) setNotice(`${omitted} saved notes exceed the marker-session limit. All notes remain available in feedback review and export.`)
      if (selected === "studio") hostClient.receive(command, event => receive("studio", event))
      else target!.send(command)
    })
    return () => {
      cancel = true
      const session = sessionRef.current ?? previous
      sessionRef.current = null
      setActive("")
      if (!session) return
      if (snapshot.layer === "studio") chain.current = chain.current.then(() => hostClient.dispose())
      else if (oldTarget) {
        chain.current = chain.current.then(() => new Promise<void>(resolve => {
          // A removed frame is synchronously disposed by its owner. A live frame must acknowledge revocation.
          if (!annotationBridge.targets().some(value => value.id === oldTarget.id)) { resolve(); return }
          const release = annotationBridge.subscribe(() => { if (!annotationBridge.targets().some(value => value.id === oldTarget.id)) pendingStop.current?.done() })
          pendingStop.current = { id: oldTarget.id, generation: session.generation, done: () => { release(); pendingStop.current = null; resolve() } }
          oldTarget.send({ action: "deactivate", generation: session.generation })
        }))
      }
    }
  // Context is immutable throughout each acknowledged session; every material change revokes it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selected, contextKey, target?.id, target?.available, review, hostClient, receive])
  React.useEffect(() => () => { void hostClient.dispose() }, [hostClient])
  const markdown = feedbackMarkdown(notes)
  const changeScope = (key: string, scope: AnnotationScope) => persist(notesRef.current.map(note => { if (note.key !== key) return note; const source = declaration.resolveSource(note.session.context, note.annotation, scope); return { ...note, scope, source, repository: source.repository ?? declaration.repository } }))
  const recoveryNotice = notice && <p role="status" className={review ? "rounded border bg-muted p-3 text-sm" : "fixed bottom-32 left-4 z-50 max-w-sm rounded border bg-background p-3 text-sm"}>{notice}<button onClick={() => setNotice("")} className="ml-2 underline">Dismiss</button></p>
  return <>
    {createPortal(<div data-studio-annotations data-annotation-active={active} className="fixed right-4 bottom-16 z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-lg border bg-background p-2 text-xs shadow-sm">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); try { localStorage.setItem(preferenceKey, String(event.target.checked)) } catch { setNotice("The annotation preference cannot be saved in this browser.") } }} />Annotations</label>
      {enabled && <label>Target <select aria-label="Annotation target" className="min-h-11 rounded border bg-background px-2 text-base" value={selected} onChange={event => setSelected(event.target.value)}><option value="studio">Studio</option>{selected !== "studio" && !target && <option value={selected} disabled>Selected preview unavailable — choose a target</option>}{targets.map(value => <option key={value.id} value={value.id} disabled={!value.available}>{value.label}{!value.available ? " — waiting for a settled supported preview" : ""}</option>)}</select></label>}
      <Button variant="outline" onClick={() => setReview(true)}>Feedback ({notes.length})</Button>
      {selected !== "studio" && !target && <span role="status">Choose an available preview. Library previews must be expanded.</span>}
    </div>, portalContainer ?? document.body)}
    {!review && recoveryNotice}
    <Dialog open={review} onOpenChange={setReview}><DialogContent data-studio-feedback-review className="max-h-[90svh] overflow-auto sm:max-w-3xl"><DialogTitle>Local Studio feedback</DialogTitle><DialogDescription>Check the target, requested scope and source confidence before copying. Captured context stays unchanged.</DialogDescription>
      {review && recoveryNotice}
      {notes.map(note => <section key={note.key} className="grid gap-2 rounded border p-3"><p className="font-medium">{note.session.context.layer === "studio" ? "Studio" : note.session.context.scenario} · {note.annotation.element}</p><p className="whitespace-pre-wrap">{note.annotation.comment}</p><label>Change scope <select aria-label={`Change scope for ${note.annotation.element}`} className="min-h-11 rounded border bg-background px-2 text-base" value={note.scope} onChange={event => changeScope(note.key, event.target.value as AnnotationScope)}>{note.session.context.layer === "studio" ? <option value="studio">Studio</option> : <><option value="example">This example / composition</option><option value="shared">Shared component</option></>}</select></label><p>{note.source.confidence}: {note.source.paths.join(", ") || "Source unresolved; inspect before editing"}</p><Button variant="ghost" onClick={() => persist(notesRef.current.filter(value => value.key !== note.key))}>Delete note</Button></section>)}
      <Button onClick={async () => { try { await navigator.clipboard.writeText(markdown); setNotice("Feedback copied.") } catch { setNotice("Clipboard unavailable. Select and copy the feedback below.") } }}>Copy feedback</Button>
      <textarea aria-label="Combined feedback Markdown" readOnly value={markdown} className="min-h-48 w-full rounded border p-3 font-mono text-base" />
    </DialogContent></Dialog>
  </>
}
