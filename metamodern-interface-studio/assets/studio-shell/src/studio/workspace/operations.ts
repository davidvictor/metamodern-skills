/*
 * The one way a workspace module reaches its product: POST {operations}/{name} on the Studio's own
 * origin, for operations the module declared, answered in one envelope. Refusals never send a request.
 * Pure (types-only imports, no DOM globals), so node tests load it directly.
 */
import type { WorkspaceOperationUse } from "../types"

export type OperationKind = "read" | "write"
export type OperationError = { code: string; reason: string; recoverable: boolean }
export type OperationResult<T = unknown> =
  | { ok: true; data: T; revision?: string }
  | { ok: false; error: OperationError; current?: { data: T; revision?: string } }

/** Codes the shell answers with itself. None of them sent a request. */
export const REFUSED = { undeclared: "undeclared", kind: "kind-mismatch", origin: "cross-origin", noHost: "no-host", input: "bad-input" } as const
/** The same pattern as OPERATION in declaration.ts (kept here so this file stays types-only). */
const OPERATION_NAME = /^[a-z][a-z0-9.-]*$/
/** No host answered, or the answer was not JSON. Every module then says so. */
export const HOST_UNAVAILABLE = "host-unavailable"
/** JSON that is not the envelope. */
export const BAD_ENVELOPE = "bad-envelope"
export const hostUnavailable = (base: string) => `No operations host answered at ${base}. Run the Studio with its host, or deploy the host beside the built Studio.`

const refuse = (code: string, reason: string): OperationResult<never> => ({ ok: false, error: { code, reason, recoverable: false } })
const badEnvelope = () => refuse(BAD_ENVELOPE, "The operations host answered with JSON that is not the operation envelope.")

/** Reads a response body as the envelope. Null means it was not JSON at all: no host answered. */
export function parseEnvelope(text: string): OperationResult | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return badEnvelope()
  const b = body as Record<string, unknown>
  if (b.ok === true && "data" in b) return typeof b.revision === "string" ? { ok: true, data: b.data, revision: b.revision } : { ok: true, data: b.data }
  const e = b.error as Record<string, unknown> | null | undefined
  if (b.ok !== false || !e || typeof e !== "object" || typeof e.code !== "string" || typeof e.reason !== "string") return badEnvelope()
  const error = { code: e.code, reason: e.reason, recoverable: e.recoverable === true }
  const c = b.current as Record<string, unknown> | null | undefined
  if (!c || typeof c !== "object" || !("data" in c)) return { ok: false, error }
  return { ok: false, error, current: typeof c.revision === "string" ? { data: c.data, revision: c.revision } : { data: c.data } }
}

export type OperationTransport = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; credentials: "same-origin"; body: string }
) => Promise<{ status: number; text: () => Promise<string> }>

export type OperationClientOptions = {
  /** The adapter's workspace.operations; undefined when none is declared. */
  base: string | undefined
  /** What the module declared. */
  uses: WorkspaceOperationUse[]
  /** The Studio's own address, for the same-origin rule and relative bases. */
  location: string
  fetch: OperationTransport
}

export function createOperationClient(o: OperationClientOptions) {
  return async function call(name: string, kind: OperationKind, input?: unknown, options: { expectedRevision?: string } = {}): Promise<OperationResult> {
    const use = o.uses.find((u) => u.name === name)
    if (!use || !OPERATION_NAME.test(name)) return refuse(REFUSED.undeclared, `${name} is not in this module's uses, so it was not sent.`)
    if (use.kind !== kind) return refuse(REFUSED.kind, `${name} is declared as a ${use.kind} and was called as a ${kind}, so it was not sent.`)
    if (!o.base) return refuse(REFUSED.noHost, "This Studio declares no operations host, so nothing was sent.")
    const notCallable = refuse(REFUSED.origin, `${o.base} is not an address this Studio can call, so nothing was sent.`)
    if (/[?#]/.test(o.base)) return notCallable
    let url: URL
    try {
      url = new URL(`${o.base.replace(/\/+$/, "")}/${encodeURIComponent(name)}`, o.location)
    } catch {
      return notCallable
    }
    if (url.origin === "null" || (url.protocol !== "http:" && url.protocol !== "https:")) return notCallable
    if (url.origin !== new URL(o.location).origin) return refuse(REFUSED.origin, `${url.origin} is not this Studio's origin. Operations are same-origin only, so nothing was sent.`)
    const body = kind === "write" && options.expectedRevision !== undefined ? { input: input ?? null, expectedRevision: options.expectedRevision } : { input: input ?? null }
    let payload: string
    try {
      payload = JSON.stringify(body)
    } catch {
      return refuse(REFUSED.input, `${name} input is not JSON, so it was not sent.`)
    }
    const unavailable: OperationResult = { ok: false, error: { code: HOST_UNAVAILABLE, reason: hostUnavailable(o.base), recoverable: true } }
    try {
      const res = await o.fetch(url.href, { method: "POST", headers: { "content-type": "application/json", "x-studio-operation-kind": kind }, credentials: "same-origin", body: payload })
      return parseEnvelope(await res.text()) ?? unavailable
    } catch {
      return unavailable
    }
  }
}
