/*
 * The preview host: one isolated frame per runtime, driven only through
 * studio-preview/1. Changing inputs mounts a new frame behind the current one
 * and swaps only when it reports ready; a failure or timeout keeps the
 * previous preview and says so. Disposal is removal from the document.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { StageGestureContext } from "./stage-gestures"
import { PROTOCOL, isFrameMessage, type AnchorRect, type FrameCapability, type FrameMessage, type MountInputs, type ShellBody, type SyncChannelsMessage, type SyncEvent } from "./protocol"

export const READY_TIMEOUT_MS = 20000

export type LiveStatus = {
  status: "loading" | "ready" | "error"
  /** A person changed product state in this runtime. Clicks that change nothing do not count. */
  modified: boolean
  canGoBack: boolean
  location?: string
  fingerprint?: string
  appearance?: "light" | "dark"
  reason?: string
  /** An error or timeout left the previous preview on screen. */
  previous?: boolean
  /** What the frame client announced, such as draft-css. */
  capabilities: FrameCapability[]
  /** The document's content height, when the frame client reports it. */
  contentHeight?: number
  anchors: AnchorRect[]
}

export type LivePreviewHandle = {
  back: () => void
  command: (id: string) => void
  /** Replay another frame's interaction here; resolves with the frame's answer, or a timeout. */
  replay: (event: SyncEvent) => Promise<{ ok: boolean; reason?: string }>
}

/** Sync for a preview that is one of several: which channels it reports, and where its interactions go. */
export type PreviewSync = { channels: SyncChannelsMessage; onInteraction: (event: SyncEvent) => void }

type Runtime = { instance: string; key: string; requestId: string; inputs: MountInputs; phase: "loading" | "ready" | "error"; ready?: FrameMessage & { type: "ready" }; modified: boolean; capabilities?: FrameCapability[]; contentHeight?: number }
/** The draft a preview shows: token values, CSS rules and font stylesheets. */
export type PreviewDraft = { tokens: Record<string, string>; css: string; stylesheets: string[] }
const draftKey = (d: { tokens: Record<string, string>; css?: string; stylesheets?: string[] }) => JSON.stringify({ tokens: d.tokens, css: d.css ?? "", stylesheets: d.stylesheets ?? [] })

let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

type Props = {
  src: string
  origin?: string
  inputs: Omit<MountInputs, "tokens" | "css" | "stylesheets">
  /** Changing the key mounts a fresh runtime (Reset bumps it). Drafts never remount. */
  mountKey: string
  draft: PreviewDraft
  w: number
  h: number
  scale: number
  label: string
  interactive?: boolean
  onStatus?: (s: LiveStatus) => void
  sync?: PreviewSync
}

export const LivePreview = React.forwardRef<LivePreviewHandle, Props>(function LivePreview({ src, origin, inputs, mountKey, draft, w, h, scale, label, interactive = true, onStatus, sync }, ref) {
  const [runtimes, setRuntimes] = React.useState<Runtime[]>([])
  const frames = React.useRef(new Map<string, HTMLIFrameElement>())
  const gesture = React.useContext(StageGestureContext)
  const latest = React.useRef({ draft, onStatus, inputs, sync, gesture })
  latest.current = { draft, onStatus, inputs, sync, gesture }
  const replies = React.useRef(new Map<string, (r: { ok: boolean; reason?: string }) => void>())
  const expectedOrigin = origin ?? (location.origin === "null" ? "null" : new URL(src, location.href).origin)

  const post = React.useCallback((instance: string, message: ShellBody) => {
    frames.current.get(instance)?.contentWindow?.postMessage({ protocol: PROTOCOL, instance, ...message }, expectedOrigin === "null" ? "*" : expectedOrigin)
  }, [expectedOrigin])

  const failure = React.useRef<{ instance: string; reason: string } | null>(null)
  const runtimesRef = React.useRef<Runtime[]>([])
  runtimesRef.current = runtimes

  // A new key stages a new runtime next to the current one.
  React.useEffect(() => {
    const rt: Runtime = { instance: uid("pv"), key: mountKey, requestId: uid("mount"), inputs: { ...latest.current.inputs, ...latest.current.draft }, phase: "loading", modified: false }
    setRuntimes((list) => [...list.filter((r) => r.phase === "ready").slice(-1), rt])
    const timer = window.setTimeout(() => {
      failure.current = { instance: rt.instance, reason: `No ready signal within ${READY_TIMEOUT_MS / 1000} s` }
      setRuntimes((list) => list.map((r) => (r.instance === rt.instance && r.phase === "loading" ? { ...r, phase: "error" } : r)))
    }, READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [mountKey])

  React.useEffect(() => {
    const update = (instance: string, patch: (r: Runtime) => Partial<Runtime>) => setRuntimes((list) => list.map((r) => (r.instance === instance ? { ...r, ...patch(r) } : r)))
    const onMessage = (e: MessageEvent) => {
      if (!isFrameMessage(e.data)) return
      const m = e.data
      const el = frames.current.get(m.instance)
      if (!el || e.source !== el.contentWindow || (expectedOrigin !== "null" && e.origin !== expectedOrigin)) return
      const rt = runtimesRef.current.find((r) => r.instance === m.instance)
      if (!rt) return
      if (m.type === "hello") {
        update(rt.instance, () => ({ capabilities: m.capabilities ?? [] }))
        post(rt.instance, { type: "mount", requestId: rt.requestId, inputs: rt.inputs })
      }
      else if (m.type === "ready") {
        if (m.requestId !== rt.requestId) return // a late answer to an older request
        // Product code that focuses a field during mount must not take the keyboard from the Studio.
        if (document.activeElement === el) el.blur()
        // The new runtime is on screen: dispose every older one.
        setRuntimes((list) => {
          const at = list.findIndex((r) => r.instance === rt.instance)
          return list.slice(at).map((r) => (r.instance === rt.instance ? { ...r, phase: "ready", ready: m } : r))
        })
      } else if (m.type === "error" && (!m.requestId || m.requestId === rt.requestId) && rt.phase === "loading") {
        failure.current = { instance: rt.instance, reason: m.reason }
        update(rt.instance, () => ({ phase: "error" }))
      } else if (m.type === "modified") update(rt.instance, () => ({ modified: true }))
      else if (m.type === "content-size") update(rt.instance, () => ({ contentHeight: m.height }))
      else if (m.type === "interaction") {
        // Only the runtime on screen leads; a staged one is not seen by anyone.
        if (rt.phase === "ready") latest.current.sync?.onInteraction(m.event)
      } else if (m.type === "gesture") {
        // Stage navigation that began over the frame on screen; a wheel position moves into the Studio's coordinates.
        const g = m.gesture
        const on = latest.current.gesture
        if (!on || rt.phase !== "ready" || !g || typeof g !== "object") return
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-4000, Math.min(4000, v)) : 0)
        if (g.kind === "space") on({ kind: "space", down: !!g.down })
        else if (g.kind === "drag") on({ kind: "drag", dx: num(g.dx), dy: num(g.dy) })
        else if (g.kind === "wheel") {
          const r = el.getBoundingClientRect()
          const k = el.offsetWidth ? r.width / el.offsetWidth : 1
          on({ kind: "wheel", zoom: !!g.zoom, dx: num(g.dx), dy: num(g.dy), x: r.left + num(g.x) * k, y: r.top + num(g.y) * k })
        }
      } else if (m.type === "reply") {
        const done = replies.current.get(m.requestId)
        if (done) {
          replies.current.delete(m.requestId)
          done({ ok: m.ok, reason: m.reason })
        }
      }
      else if (m.type === "navigated") update(rt.instance, (r) => (r.ready ? { ready: { ...r.ready, location: m.location, canGoBack: m.canGoBack, anchors: m.anchors } } : {}))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [expectedOrigin, post])

  const current = [...runtimes].reverse().find((r) => r.phase === "ready")
  const newest = runtimes[runtimes.length - 1]

  // Live drafts go to the runtime on screen without a remount. Compare with what that
  // runtime last received, not with what it mounted with: returning to the mounted values
  // (discarding a draft) must reach the frame too.
  const key = draftKey(draft)
  const sent = React.useRef(new Map<string, string>())
  React.useEffect(() => {
    if (!current) return
    const last = sent.current.get(current.instance) ?? draftKey(current.inputs)
    if (last === key) return
    sent.current.set(current.instance, key)
    post(current.instance, { type: "draft-overrides", requestId: uid("draft"), ...(JSON.parse(key) as PreviewDraft) })
  }, [key, current, post])

  // The runtime on screen reports only the channels asked for; a new runtime is told again.
  const channelKey = sync ? JSON.stringify(sync.channels) : ""
  React.useEffect(() => {
    if (!current || !channelKey) return
    post(current.instance, { type: "sync", requestId: uid("sync"), channels: JSON.parse(channelKey) })
  }, [channelKey, current, post])

  React.useImperativeHandle(ref, () => ({
    back: () => current && post(current.instance, { type: "product-back", requestId: uid("back") }),
    command: (id) => current && post(current.instance, { type: "command", requestId: uid("cmd"), command: id }),
    replay: (event) =>
      new Promise((resolve) => {
        if (!current) return resolve({ ok: false, reason: "This preview is not ready" })
        const requestId = uid("replay")
        const timer = window.setTimeout(() => {
          replies.current.delete(requestId)
          resolve({ ok: false, reason: "The preview did not answer" })
        }, 3000)
        replies.current.set(requestId, (r) => {
          window.clearTimeout(timer)
          resolve(r)
        })
        post(current.instance, { type: "replay", requestId, event })
      }),
  }), [current, post])

  const status: LiveStatus = React.useMemo(() => {
    const failed = newest?.phase === "error"
    const reason = failed && failure.current?.instance === newest.instance ? failure.current.reason : undefined
    return {
      status: newest?.phase ?? "loading",
      modified: current?.modified ?? false,
      canGoBack: current?.ready?.canGoBack ?? false,
      location: current?.ready?.location,
      fingerprint: current?.ready?.fingerprint,
      appearance: current?.ready?.appearance,
      reason,
      previous: failed && !!current,
      anchors: current?.ready?.anchors ?? [],
      capabilities: current?.capabilities ?? newest?.capabilities ?? [],
      contentHeight: current?.contentHeight,
    }
  }, [newest, current])
  const statusKey = JSON.stringify(status)
  React.useEffect(() => latest.current.onStatus?.(JSON.parse(statusKey)), [statusKey])

  return (
    <>
      {runtimes.map((r) => (
        <iframe
          key={r.instance}
          ref={(el) => {
            if (el) frames.current.set(r.instance, el)
            else frames.current.delete(r.instance)
          }}
          name={r.instance}
          src={src}
          title={label}
          tabIndex={interactive ? undefined : -1}
          aria-hidden={r !== current || !interactive || undefined}
          className={cn("absolute top-0 left-0 origin-top-left border-0 bg-transparent transition-opacity duration-150", r === current ? "opacity-100" : "pointer-events-none opacity-0", !interactive && "pointer-events-none")}
          style={{ width: w, height: h, transform: `scale(${scale})` }}
        />
      ))}
    </>
  )
})
