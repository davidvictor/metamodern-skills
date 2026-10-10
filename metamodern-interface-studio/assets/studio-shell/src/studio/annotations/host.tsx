import { ANNOTATION_LAYOUT_EVENT } from "./capability"
import { committedStudioLocation, subscribeStudioLocation } from "../location"
import { createPortal } from "react-dom"
import * as React from "react"
import { adapter } from "@/adapter"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { SHELL_VERSION } from "../build-info"
import { fingerprint } from "../protocol"
import { annotationBridge } from "./bridge"
import { feedbackMarkdown, annotationHydration, annotationHostBottom, annotationStripPlacement, ANNOTATION_SDK_SIZE_EVENT, invalidCommandReason, measurableViewport, validCommand, validEvent, validRecord } from "./model"
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
  // A restored or background tab can start at 0 x 0; resize and visibility changes deliver its real size.
  React.useEffect(() => { const resized = () => setViewport(previous => previous.width === innerWidth && previous.height === innerHeight ? previous : { width: innerWidth, height: innerHeight, scale: 1 }); addEventListener("resize", resized); document.addEventListener("visibilitychange", resized); resized(); return () => { removeEventListener("resize", resized); document.removeEventListener("visibilitychange", resized) } }, [])
  const observedTarget = enabled ? selected : null
  const subscribe = React.useCallback((listener: () => void) => annotationBridge.subscribeFor(observedTarget, listener), [observedTarget])
  const snapshot = React.useCallback(() => annotationBridge.snapshotFor(observedTarget), [observedTarget])
  React.useSyncExternalStore(subscribe, snapshot)
  const studioLocation = React.useSyncExternalStore(enabled && selected === "studio" ? subscribeStudioLocation : noSubscription, committedStudioLocation)
  const portalContainer = annotationBridge.portal()
  // The vendor control sits inside the reserved strip, which reserves what it draws (its end, or a row of its own on
  // phones while feedback mode is open), so it never covers previews, the inspector or the strip's own controls.
  // Without the strip (an expanded preview dialog owns the controls) it keeps clear of the wrapped Studio dock.
  // Positioning is DOM-only: strip, sibling or dock geometry changes never touch the annotation session.
  React.useLayoutEffect(() => {
    const observer = new ResizeObserver(() => place())
    const siblings = new MutationObserver(() => rebind())
    let occupied: HTMLElement[] = []
    let strip: HTMLElement | null = null
    let control: { width: number; height: number } | undefined
    const place = () => {
      const box = strip?.getBoundingClientRect()
      const placement = strip && box && box.width > 0 && box.height > 0 ? annotationStripPlacement(innerWidth, innerHeight, box, control) : null
      if (strip && placement) {
        strip.style.paddingRight = `${placement.reserveRight}px`
        strip.style.paddingBottom = `${placement.reserveBottom}px`
        strip.dataset.annotationControl = placement.mode
        document.documentElement.style.setProperty("--studio-annotation-sdk-bottom", `${placement.bottom}px`)
        document.documentElement.style.setProperty("--studio-annotation-sdk-right", `${placement.right}px`)
        return
      }
      const boxes = occupied.map(element => element.getBoundingClientRect()).filter(value => value.width > 0 && value.height > 0)
      const top = boxes.length ? Math.min(...boxes.map(value => value.top)) : null
      document.documentElement.style.setProperty("--studio-annotation-sdk-bottom", `${annotationHostBottom(innerHeight, top)}px`)
      document.documentElement.style.removeProperty("--studio-annotation-sdk-right")
    }
    const rebind = () => {
      observer.disconnect()
      siblings.disconnect()
      strip = portalContainer ? null : document.querySelector<HTMLElement>("[data-studio-annotation-dock]")
      occupied = portalContainer || strip ? [] : [...document.querySelectorAll<HTMLElement>('[data-studio-preview-controls="dock"], [data-studio-bottom-controls], [data-studio-bottom-navigation]')]
      // Bars above the strip (direction manager, editor status) move it without resizing it: watch them, and their arrival.
      const above = strip?.parentElement ? [...strip.parentElement.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== strip && !!(element.compareDocumentPosition(strip!) & Node.DOCUMENT_POSITION_FOLLOWING)) : []
      if (strip?.parentElement) siblings.observe(strip.parentElement, { childList: true })
      ;[...occupied, ...above, ...(strip ? [strip] : [])].forEach(element => observer.observe(element))
      place()
    }
    const sized = (event: Event) => { control = (event as CustomEvent<{ width: number; height: number } | null>).detail ?? undefined; place() }
    addEventListener(ANNOTATION_LAYOUT_EVENT, rebind)
    addEventListener(ANNOTATION_SDK_SIZE_EVENT, sized)
    rebind()
    return () => {
      observer.disconnect(); siblings.disconnect(); removeEventListener(ANNOTATION_LAYOUT_EVENT, rebind); removeEventListener(ANNOTATION_SDK_SIZE_EVENT, sized)
      if (strip) { strip.style.removeProperty("padding-right"); strip.style.removeProperty("padding-bottom"); delete strip.dataset.annotationControl }
      document.documentElement.style.removeProperty("--studio-annotation-sdk-bottom"); document.documentElement.style.removeProperty("--studio-annotation-sdk-right")
    }
  }, [page, viewport.width, viewport.height, portalContainer])
  const targets = annotationBridge.targets()
  const target = targets.find(value => value.id === selected)
  const context: AnnotationContext = selected === "studio" ? { layer: "studio", page, viewport, location: studioLocation, revision: adapter.product.revision, ...(adapter.provenance ? { source: adapter.provenance.revision } : {}), shellVersion: SHELL_VERSION } : target?.context ?? { layer: "preview", page, viewport: { width: 1, height: 1, scale: 1 }, shellVersion: SHELL_VERSION }
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
      // An unmeasured document (a restored or background tab at 0 x 0) waits for its real size instead of starting an invalid session.
      if (cancel || !enabled || review || (selected !== "studio" && !target?.available) || !measurableViewport(snapshot.viewport)) return
      const session = { generation: crypto.randomUUID(), fingerprint: contextKey, context: snapshot }
      const matching = notesRef.current.filter(note => note.session.fingerprint === session.fingerprint && note.session.context.layer === snapshot.layer).map(note => note.annotation)
      const { command, omitted } = annotationHydration(session, matching)
      // Never send what a client must refuse; say what is wrong instead of blaming saved notes.
      if (!validCommand(command)) { setNotice(invalidCommandReason(command)); return }
      sessionRef.current = session
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
  const recoveryNotice = notice && <p role="status" className={review ? "rounded-md border bg-muted p-3 text-sm" : "flex min-w-0 basis-full items-baseline gap-2 text-sm text-muted-foreground"}><span className={review ? undefined : "min-w-0"}>{notice}</span><button type="button" onClick={() => setNotice("")} className="ml-2 shrink-0 rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Dismiss</button></p>
  const toggle = (value: boolean) => { setEnabled(value); try { localStorage.setItem(preferenceKey, String(value)) } catch { setNotice("The annotation preference cannot be saved in this browser.") } }
  const controls = <>
    <label className="flex shrink-0 items-center gap-2 text-sm pointer-coarse:min-h-11"><Checkbox checked={enabled} onCheckedChange={value => toggle(value === true)} />Annotations</label>
    {enabled && <label className="flex min-w-16 flex-1 basis-0 items-center gap-2 text-sm text-muted-foreground sm:flex-none sm:basis-auto"><span className="max-sm:sr-only">Target</span> <select aria-label="Annotation target" className="h-8 w-full min-w-0 max-w-64 truncate sm:w-auto rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 pointer-coarse:min-h-11 pointer-coarse:text-base" value={selected} onChange={event => setSelected(event.target.value)}><option value="studio">Studio</option>{selected !== "studio" && !target && <option value={selected} disabled>Selected preview unavailable — choose a target</option>}{targets.map(value => <option key={value.id} value={value.id} disabled={!value.available}>{value.label}{!value.available ? " — waiting for a settled supported preview" : ""}</option>)}</select></label>}
    <Button variant="ghost" size="sm" className="ml-auto shrink-0 pointer-coarse:min-h-11" onClick={() => setReview(true)}>Feedback ({notes.length})</Button>
    {selected !== "studio" && !target && <span role="status" className="basis-full text-sm text-muted-foreground">Choose an available preview. Library previews must be expanded.</span>}
    {!review && recoveryNotice}
  </>
  // Docked in the reserved Studio strip; an expanded preview dialog takes the controls inside its own focus boundary.
  const bar = <div data-studio-annotations data-annotation-active={active} style={portalContainer ? { bottom: "calc(var(--studio-annotation-sdk-bottom, 24px) + 72px)" } : undefined} className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3", portalContainer ? "fixed right-4 z-50 max-w-[calc(100vw-2rem)] rounded-xl border bg-background p-2 shadow-sm" : "flex-1")}>{controls}</div>
  return <>
    {portalContainer ? createPortal(bar, portalContainer) : bar}
    <Dialog open={review} onOpenChange={setReview}><DialogContent data-studio-feedback-review className="max-h-[90svh] overflow-auto sm:max-w-3xl"><DialogTitle>Local Studio feedback</DialogTitle><DialogDescription>Check the target, requested scope and source confidence before copying. Captured context stays unchanged.</DialogDescription>
      {review && recoveryNotice}
      {notes.map(note => <section key={note.key} className="grid gap-2 rounded border p-3"><p className="font-medium">{note.session.context.layer === "studio" ? "Studio" : note.session.context.scenario} · {note.annotation.element}</p><p className="whitespace-pre-wrap">{note.annotation.comment}</p><label>Change scope <select aria-label={`Change scope for ${note.annotation.element}`} className="min-h-11 rounded border bg-background px-2 text-base" value={note.scope} onChange={event => changeScope(note.key, event.target.value as AnnotationScope)}>{note.session.context.layer === "studio" ? <option value="studio">Studio</option> : <><option value="example">This example / composition</option><option value="shared">Shared component</option></>}</select></label><p>{note.source.confidence}: {note.source.paths.join(", ") || "Source unresolved; inspect before editing"}</p><Button variant="ghost" onClick={() => persist(notesRef.current.filter(value => value.key !== note.key))}>Delete note</Button></section>)}
      <Button onClick={async () => { try { await navigator.clipboard.writeText(markdown); setNotice("Feedback copied.") } catch { setNotice("Clipboard unavailable. Select and copy the feedback below.") } }}>Copy feedback</Button>
      <textarea aria-label="Combined feedback Markdown" readOnly value={markdown} className="min-h-48 w-full rounded border p-3 font-mono text-base" />
    </DialogContent></Dialog>
  </>
}
