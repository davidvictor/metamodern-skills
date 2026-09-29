/*
 * studio-preview/1: the only channel between the shell and a preview frame.
 * Every message carries the protocol, the frame instance and, for requests
 * and their answers, a requestId. Receivers validate the origin and the
 * sending window before reading anything else.
 */
export const PROTOCOL = "studio-preview/1" as const

/** Everything needed to materialize one preview. Stable IDs only, never fixture values. */
export type MountInputs = {
  scenario: string
  theme: string
  profile: string
  values: Record<string, string>
  /** Commands replayed in order before the frame reports ready. */
  commands: string[]
  /** Draft token overrides, applied before ready so a remount keeps them. */
  tokens: Record<string, string>
  /** Draft CSS rules, for what tokens cannot reach (such as fonts baked into utility classes). Optional; older frames ignore it. */
  css?: string
  /** Font stylesheets the draft needs. Only https://fonts.googleapis.com/css2 is loaded. */
  stylesheets?: string[]
}

/** What a frame client can do beyond the base protocol, announced in `hello`. */
export type FrameCapability = "draft-css" | "content-size"

export type AnchorRect = { id: string; label: string; x: number; y: number; w: number; h: number }

export type ReadyPayload = {
  fingerprint: string
  appearance: "light" | "dark"
  location: string
  canGoBack: boolean
  anchors: AnchorRect[]
}

type Envelope = { protocol: typeof PROTOCOL; instance: string }

/** shell to frame */
export type ShellBody =
  | { type: "mount"; requestId: string; inputs: MountInputs }
  | { type: "command"; requestId: string; command: string }
  | { type: "product-back"; requestId: string }
  | { type: "draft-overrides"; requestId: string; tokens: Record<string, string>; css?: string; stylesheets?: string[] }

/** frame to shell */
export type FrameBody =
  | { type: "hello"; capabilities?: FrameCapability[] }
  | ({ type: "ready"; requestId: string } & ReadyPayload)
  | { type: "error"; requestId?: string; operation: string; recoverable: boolean; reason: string }
  /** Sent once per runtime, when a person's interaction first changes product state. */
  | { type: "modified" }
  | { type: "navigated"; location: string; canGoBack: boolean; anchors: AnchorRect[] }
  | { type: "reply"; requestId: string; ok: boolean; reason?: string }
  /** The document's content height in CSS pixels, after ready and whenever it settles at a new value. */
  | { type: "content-size"; height: number }

export type ShellMessage = Envelope & ShellBody
export type FrameMessage = Envelope & FrameBody

export function isFrameMessage(data: unknown): data is FrameMessage {
  return !!data && typeof data === "object" && (data as { protocol?: unknown }).protocol === PROTOCOL && typeof (data as { instance?: unknown }).instance === "string"
}

export function isShellMessage(data: unknown): data is ShellMessage {
  return isFrameMessage(data)
}

/** A short, stable digest of resolved inputs, so two sides can prove they held the same inputs. */
export function fingerprint(value: unknown) {
  const stable = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`
    if (v && typeof v === "object")
      return `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
        .join(",")}}`
    return JSON.stringify(v) ?? "null"
  }
  const text = stable(value)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}
