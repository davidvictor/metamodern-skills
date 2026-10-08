import type { JsonValue } from "./design-runtime"
import type { DesignPreviewIdentity } from "./design-ui/types"
/*
 * studio-preview/1: the only channel between the shell and a preview frame.
 * Every message carries the protocol, the frame instance and, for requests
 * and their answers, a requestId. Receivers validate the origin and the
 * sending window before reading anything else.
 */
import type { FrameDiagnostic, InputValue } from "./types"
export type { FrameDiagnostic } from "./types"

export const PROTOCOL = "studio-preview/1" as const

/** Everything needed to materialize one preview. Stable IDs only, never fixture values. */
export type MountInputs = {
  compiledData?: JsonValue
  direction?: DesignPreviewIdentity
  scenario: string
  theme: string
  profile: string
  values: Record<string, InputValue>
  /** Design controls that require the product to rebuild markup or graphics. */
  design?: Record<string, string | number>
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
export type FrameCapability = "compiled-data" | "registered-stylesheets" | "direction-identity" | "draft-css" | "content-size" | "sync-scroll" | "sync-interaction" | "sync-navigation" | "stage-gestures" | "live-values" | "code"

/**
 * Stage navigation that starts over a frame, for the Studio to apply to its stage. Wheel positions are in the
 * frame's CSS pixels; wheel deltas are in pixels as the person scrolled them; drag movement is in screen pixels.
 * wheel: ⌘ or Ctrl held, or a pinch, zooms; otherwise it is the part of a scroll the page could not use.
 */
export type StageGesture =
  | {
      kind: "wheel"
      zoom: boolean
      dx: number
      dy: number
      x: number
      y: number
    }
  | { kind: "drag"; dx: number; dy: number }
  | { kind: "space"; down: boolean }

/**
 * How a synced target is found in another frame, most stable first: a Studio anchor, a sync ID,
 * an element ID, a test ID, a role with its accessible name (and which match it was), then a DOM path.
 */
export type SyncTarget = {
  anchor?: string
  sync?: string
  id?: string
  testid?: string
  role?: string
  name?: string
  nth?: number
  path?: string
}

/** One person's interaction in the leading frame, replayed in the others. Private values never appear here. */
export type SyncEvent =
  | {
      kind: "scroll"
      region?: string
      anchor?: { target: SyncTarget; offset: number }
      ratio: number
    }
  | { kind: "click"; target: SyncTarget }
  | { kind: "input"; target: SyncTarget; value: string }
  | { kind: "submit"; target: SyncTarget }
  | { kind: "navigate"; location: string }

export type SyncChannelsMessage = {
  scroll: boolean
  interaction: boolean
  navigation: boolean
}

export type AnchorRect = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

export type ReadyPayload = {
  direction?: DesignPreviewIdentity
  fingerprint: string
  appearance: "light" | "dark"
  location: string
  canGoBack: boolean
  anchors: AnchorRect[]
  /** Neutral product measurements for Studio Details; never fixture or person data. */
  diagnostics?: FrameDiagnostic[]
}

type Envelope = { protocol: typeof PROTOCOL; instance: string }

/** shell to frame */
export type ShellBody =
  | { type: "mount"; requestId: string; inputs: MountInputs }
  | { type: "command"; requestId: string; command: string }
  | { type: "product-back"; requestId: string }
  | {
      type: "draft-overrides"
      compiledData?: JsonValue
      direction?: DesignPreviewIdentity
      requestId: string
      tokens: Record<string, string>
      css?: string
      stylesheets?: string[]
    }
  /** Which interactions this frame should report; none until the Studio asks. */
  | { type: "sync"; requestId: string; channels: SyncChannelsMessage }
  /** Repeat another frame's interaction here. The reply says when the target could not be found. */
  | { type: "replay"; requestId: string; event: SyncEvent }
  /** Every resolved value, after a property changed (capability live-values). The frame applies them without rebuilding. */
  | { type: "values"; requestId: string; values: Record<string, InputValue> }
  /** Ask for the code that renders the current state (capability code). */
  | { type: "code-request"; requestId: string }

/** frame to shell */
export type FrameBody =
  | { type: "direction-state"; requestId: string; direction: DesignPreviewIdentity; fingerprint: string }
  | { type: "hello"; capabilities?: FrameCapability[] }
  | ({ type: "ready"; requestId: string } & ReadyPayload)
  | {
      type: "error"
      requestId?: string
      operation: string
      recoverable: boolean
      reason: string
    }
  /** Sent once per runtime, when a person's interaction first changes product state. */
  | { type: "modified" }
  | {
      type: "navigated"
      location: string
      canGoBack: boolean
      anchors: AnchorRect[]
    }
  | { type: "reply"; requestId: string; ok: boolean; reason?: string }
  /** The document's content height in CSS pixels, after ready and whenever it settles at a new value. */
  | { type: "content-size"; height: number }
  /** A person's interaction here, for the Studio to replay in other frames (only for channels the Studio asked for). */
  | { type: "interaction"; event: SyncEvent }
  /** Navigation of the Studio's stage that began over this frame (capability stage-gestures). */
  | { type: "gesture"; gesture: StageGesture }
  /** The answer to code-request: the code for the current values, listing only props that differ from their defaults. */
  | { type: "code"; requestId: string; language: string; text: string }

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
