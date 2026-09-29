/*
 * The preview host: one isolated frame per runtime, driven only through
 * studio-preview/1. Changing inputs mounts a new frame behind the current one
 * and swaps only when it reports ready; a failure or timeout keeps the
 * previous preview and says so. Disposal is removal from the document.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { PROTOCOL, isFrameMessage, type AnchorRect, type FrameMessage, type MountInputs, type ShellBody } from "./protocol"

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
  anchors: AnchorRect[]
}

export type LivePreviewHandle = { back: () => void; command: (id: string) => void }

type Runtime = { instance: string; key: string; requestId: string; inputs: MountInputs; phase: "loading" | "ready" | "error"; ready?: FrameMessage & { type: "ready" }; modified: boolean }

let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

type Props = {
  src: string
  origin?: string
  inputs: Omit<MountInputs, "tokens">
  /** Changing the key mounts a fresh runtime (Reset bumps it). Token drafts never remount. */
  mountKey: string
  tokens: Record<string, string>
  w: number
  h: number
  scale: number
  label: string
  interactive?: boolean
  onStatus?: (s: LiveStatus) => void
}

export const LivePreview = React.forwardRef<LivePreviewHandle, Props>(function LivePreview({ src, origin, inputs, mountKey, tokens, w, h, scale, label, interactive = true, onStatus }, ref) {
  const [runtimes, setRuntimes] = React.useState<Runtime[]>([])
  const frames = React.useRef(new Map<string, HTMLIFrameElement>())
  const latest = React.useRef({ tokens, onStatus, inputs })
  latest.current = { tokens, onStatus, inputs }
  const expectedOrigin = origin ?? (location.origin === "null" ? "null" : new URL(src, location.href).origin)

  const post = React.useCallback((instance: string, message: ShellBody) => {
    frames.current.get(instance)?.contentWindow?.postMessage({ protocol: PROTOCOL, instance, ...message }, expectedOrigin === "null" ? "*" : expectedOrigin)
  }, [expectedOrigin])

  const failure = React.useRef<{ instance: string; reason: string } | null>(null)
  const runtimesRef = React.useRef<Runtime[]>([])
  runtimesRef.current = runtimes

  // A new key stages a new runtime next to the current one.
  React.useEffect(() => {
    const rt: Runtime = { instance: uid("pv"), key: mountKey, requestId: uid("mount"), inputs: { ...latest.current.inputs, tokens: latest.current.tokens }, phase: "loading", modified: false }
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
      if (m.type === "hello") post(rt.instance, { type: "mount", requestId: rt.requestId, inputs: rt.inputs })
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
      else if (m.type === "navigated") update(rt.instance, (r) => (r.ready ? { ready: { ...r.ready, location: m.location, canGoBack: m.canGoBack, anchors: m.anchors } } : {}))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [expectedOrigin, post])

  const current = [...runtimes].reverse().find((r) => r.phase === "ready")
  const newest = runtimes[runtimes.length - 1]

  // Live token drafts go to the runtime on screen without a remount. Compare with what that
  // runtime last received, not with what it mounted with: returning to the mounted values
  // (discarding a draft) must reach the frame too.
  const tokenKey = JSON.stringify(tokens)
  const sentTokens = React.useRef(new Map<string, string>())
  React.useEffect(() => {
    if (!current) return
    const last = sentTokens.current.get(current.instance) ?? JSON.stringify(current.inputs.tokens)
    if (last === tokenKey) return
    sentTokens.current.set(current.instance, tokenKey)
    post(current.instance, { type: "draft-overrides", requestId: uid("tokens"), tokens: JSON.parse(tokenKey) })
  }, [tokenKey, current, post])

  React.useImperativeHandle(ref, () => ({
    back: () => current && post(current.instance, { type: "product-back", requestId: uid("back") }),
    command: (id) => current && post(current.instance, { type: "command", requestId: uid("cmd"), command: id }),
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
