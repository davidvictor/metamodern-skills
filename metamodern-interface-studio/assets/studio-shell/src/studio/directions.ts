import { isJsonValue, type JsonValue } from "./design-runtime"
import type { DesignProblem } from "./design-ui/types"
export const DIRECTIONS_MAX_BYTES = 1024 * 1024
export const DIRECTION_PAYLOAD_MAX_BYTES = 256 * 1024
export type DirectionProduct = { id: string; revision: string }
export type DirectionReceipt = { compiler: { id: string; version: string }; sourceLockId?: string; fingerprints: Record<string, string>; basis?: JsonValue }
export type DirectionReadiness = { problems: DesignProblem[]; basis?: JsonValue }
export type SavedDirectionEnvelope = { schema: "studio-direction/1"; id: string; label: string; revision: number; createdAt: string; updatedAt: string; product: DirectionProduct; payloadSchema: string; payload: JsonValue; receipt?: DirectionReceipt }
export type DirectionEvent = { id: string; directionId: string; revision: number; kind: "delete" | "restore"; at: string }
export type DirectionsFile = { schema: "studio-directions/1"; revisions: SavedDirectionEnvelope[]; events: DirectionEvent[] }
export type DesignDirectionsDeclaration = { schema: "studio-direction-lifecycle/1"; product: DirectionProduct; payloadSchema: string }
export type DecodedDirection = { payload?: JsonValue; problems: DesignProblem[]; migratedFrom?: string }
/** Product-owned pure decoding/migration. No loader paths or executable adapter data. */
export type DirectionCodec = { decode(input: { schema: string; payload: JsonValue; product?: DirectionProduct }): DecodedDirection; legacy?(variant: JsonValue): DecodedDirection }
export const emptyDirections = (): DirectionsFile => ({ schema: "studio-directions/1", revisions: [], events: [] })
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown, max = 160): v is string => typeof v === "string" && !!v.trim() && v.length <= max
const id = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9.-]{0,95}$/.test(v)
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v))
export function validateDirectionEnvelope(v: unknown): string[] {
  if (!object(v) || v.schema !== "studio-direction/1") return ["Expected studio-direction/1 envelope"]
  const p: string[] = []
  if (!id(v.id) || v.id === "direction.source" || !text(v.label)) p.push("Invalid direction ID or label")
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1) p.push("Invalid direction revision")
  if (!date(v.createdAt) || !date(v.updatedAt) || Date.parse(String(v.updatedAt)) < Date.parse(String(v.createdAt))) p.push("Invalid direction timestamps")
  if (!object(v.product) || !text(v.product.id) || !text(v.product.revision) || !text(v.payloadSchema)) p.push("Invalid product identity or payload schema")
  if (!isJsonValue(v.payload) || new TextEncoder().encode(JSON.stringify(v.payload)).length > DIRECTION_PAYLOAD_MAX_BYTES) p.push("Payload must be bounded JSON data")
  if (v.receipt !== undefined && (!object(v.receipt) || !object(v.receipt.compiler) || !text(v.receipt.compiler.id) || !text(v.receipt.compiler.version) || !object(v.receipt.fingerprints) || !Object.keys(v.receipt.fingerprints).length || !Object.values(v.receipt.fingerprints).every(x => text(x, 4096)) || (v.receipt.sourceLockId !== undefined && !text(v.receipt.sourceLockId)) || (v.receipt.basis !== undefined && !isJsonValue(v.receipt.basis)))) p.push("Invalid compiled basis receipt")
  return p
}
/** Stable equality protects immutable payloads without depending on object-key order. */
export function directionJSON(value: unknown): string { return JSON.stringify(value, (_, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v) }
export function validateDirections(value: unknown): string[] {
  if (!object(value) || value.schema !== "studio-directions/1" || !Array.isArray(value.revisions) || !Array.isArray(value.events)) return ["Expected studio-directions/1 journal"]
  if (Object.keys(value).some(k => !["schema", "revisions", "events"].includes(k))) return ["Unsupported direction journal metadata"]
  if (!isJsonValue(value) || new TextEncoder().encode(JSON.stringify(value)).length > DIRECTIONS_MAX_BYTES) return ["Direction journal exceeds its JSON budget"]
  const problems: string[] = []; const heads = new Map<string, SavedDirectionEnvelope>(); const keys = new Set<string>()
  for (const v of value.revisions) {
    const p = validateDirectionEnvelope(v); if (p.length) { problems.push(...p); continue }
    const e = v as SavedDirectionEnvelope; const key = `${e.id}@${e.revision}`; const old = heads.get(e.id)
    if (keys.has(key)) problems.push("Duplicate direction revision")
    if (e.revision !== (old?.revision ?? 0) + 1) problems.push("Direction revisions must be contiguous and ordered")
    if (old && (e.createdAt !== old.createdAt || directionJSON(e.product) !== directionJSON(old.product) || Date.parse(e.updatedAt) < Date.parse(old.updatedAt))) problems.push("Direction identity/creation time is immutable")
    keys.add(key); heads.set(e.id, e)
  }
  const events = new Set<string>()
  for (const e of value.events) {
    if (!object(e) || !id(e.id) || events.has(e.id) || !id(e.directionId) || !Number.isSafeInteger(e.revision) || !keys.has(`${e.directionId}@${e.revision}`) || !["delete", "restore"].includes(String(e.kind)) || !date(e.at)) problems.push("Invalid or duplicate recoverable deletion event")
    else events.add(e.id)
  }
  return problems
}
export function validateDirectionTransition(previous: unknown, next: unknown): string[] {
  const problems = [...validateDirections(previous), ...validateDirections(next)]; if (problems.length) return problems
  const a = previous as DirectionsFile; const b = next as DirectionsFile
  if (a.revisions.length > b.revisions.length || a.events.length > b.events.length || a.revisions.some((r, i) => directionJSON(r) !== directionJSON(b.revisions[i])) || a.events.some((r, i) => directionJSON(r) !== directionJSON(b.events[i]))) return ["Saved revisions and deletion history are immutable; append a new revision/event"]
  return []
}
export function latestDirections(journal: DirectionsFile) {
  const heads = new Map<string, SavedDirectionEnvelope>(); for (const e of journal.revisions) heads.set(e.id, e)
  return [...heads.values()].map(envelope => ({ envelope, deleted: journal.events.filter(e => e.directionId === envelope.id).at(-1)?.kind === "delete" }))
}
export type DirectionPin = { key: string; label: string; basis: "source" | "saved" | "draft"; id: string; revision: number }
export const savedDirectionKey = (e: Pick<SavedDirectionEnvelope, "id" | "revision">) => `${e.id}@${e.revision}`

export const validDirectionId = (value: string) => /^[a-z][a-z0-9.-]{0,95}$/.test(value)
export const validDirectionPin = (value: string) => value === "source" || /^draft\.[a-z0-9-]{1,80}$/.test(value) || /^[a-z][a-z0-9.-]{0,95}@[1-9][0-9]{0,14}$/.test(value)

export const validDirectionRevision = (value: string) => /^(0|[1-9][0-9]{0,14})$/.test(value)

export const DIRECTION_LINK_KEYS = ["direction", "revision", "directionA", "directionB", "directionC", "directionD"] as const
