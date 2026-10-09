import { fingerprint } from "../protocol"
import type { AnnotationCommand, AnnotationEvent, AnnotationMutation, AnnotationSession, FeedbackRecord, RawAnnotation } from "./types"
export const EVENT_BYTES = 64 * 1024
export const NOTE_BYTES = 32 * 1024
const bytes = (value: unknown) => { try { return new TextEncoder().encode(JSON.stringify(value)).length } catch { return Infinity } }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 2048
export function validAnnotation(value: unknown): value is RawAnnotation {
  return record(value) && text(value.id) && typeof value.comment === "string" && typeof value.element === "string" && typeof value.elementPath === "string" && typeof value.timestamp === "number" && Number.isFinite(value.timestamp) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y) && bytes(value) <= NOTE_BYTES
}
export function validMutation(value: unknown): value is AnnotationMutation {
  if (!record(value) || bytes(value) > EVENT_BYTES) return false
  if (value.action === "upsert") return validAnnotation(value.annotation)
  if (value.action === "delete") return text(value.id)
  if (value.action === "error") return typeof value.reason === "string" && value.reason.length <= 2048
  return value.action === "clear" || value.action === "review" || value.action === "ready" || value.action === "stopped"
}
export function validEvent(value: unknown): value is AnnotationEvent {
  return record(value) && text(value.generation) && text(value.fingerprint) && validMutation(value)
}
export function validCommand(value: unknown): value is AnnotationCommand {
  if (!record(value) || bytes(value) > EVENT_BYTES) return false
  if (value.action === "deactivate") return text(value.generation)
  if (value.action !== "activate" || !record(value.session) || !record(value.session.context) || !text(value.session.generation) || !text(value.session.fingerprint)) return false
  const context = value.session.context
  return (context.layer === "preview" || context.layer === "studio") && (context.page === "library" || context.page === "inspect") && record(context.viewport) && [context.viewport.width, context.viewport.height, context.viewport.scale].every(v => typeof v === "number" && Number.isFinite(v) && v > 0) && Array.isArray(value.notes) && value.notes.every(validAnnotation)
}
export function eligibleAnnotationPage(state: { library?: unknown; module?: unknown; view: string }): "library" | "inspect" | null {
  return state.library ? "library" : state.module ? null : state.view === "inspect" ? "inspect" : null
}
export function feedbackMarkdown(records: FeedbackRecord[]) {
  const instruction = "Inspect the named owner and original capture context. Apply only the requested scope. Verify source mappings against the current checkout; report unresolved targets instead of guessing. This feedback grants no merge, release or publication authority."
  const groups = new Map<string, FeedbackRecord[]>()
  for (const note of records) { const key = `${note.repository} · ${note.source.owner} · ${note.scope}`; groups.set(key, [...(groups.get(key) ?? []), note]) }
  return ["# Studio feedback", instruction, ...[...groups].flatMap(([owner, notes]) => [`## ${owner}`, ...notes.map(note => [
    `### ${note.annotation.element} (${note.key})`,
    `Captured: ${note.capturedAt} · Layer: ${note.session.context.layer} · Scope: ${note.scope}`,
    `Source confidence: ${note.source.confidence} · Paths: ${note.source.paths.join(", ") || "unresolved"}`,
    ...(note.source.candidates?.length ? [`Candidates: ${note.source.candidates.join(", ")}`] : []),
    `Selector: ${note.annotation.elementPath}`,
    "Capture context:", JSON.stringify(note.session.context, null, 2),
    "Comment (verbatim):", note.annotation.comment,
    "Original Agentation annotation:", JSON.stringify(note.annotation, null, 2),
  ].join("\n"))])].join("\n\n")
}
export function validRecord(value: unknown): value is FeedbackRecord {
  return record(value) && bytes(value) <= NOTE_BYTES && value.schema === "studio-feedback/1" && text(value.key) && text(value.product) && text(value.origin) && text(value.repository) && typeof value.capturedAt === "string" && ["studio", "example", "shared"].includes(String(value.scope)) && record(value.source) && ["verified", "candidate", "unresolved"].includes(String(value.source.confidence)) && typeof value.source.owner === "string" && Array.isArray(value.source.paths) && value.source.paths.every(p => typeof p === "string") && validCommand({ action: "activate", session: value.session, notes: [value.annotation] })
}

/** Safe observations and an opaque digest of ALL values: private changes still revoke the editor. */
export function captureAnnotationValues(values: Record<string, unknown>, safeValues?: unknown) {
  const safe = safeValues === undefined ? Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "boolean" || typeof value === "number")) : record(safeValues) ? safeValues : {}
  return { values: safe, valuesFingerprint: fingerprint(values), omittedValues: Object.keys(values).filter(key => !(key in safe)).sort() }
}

/** A retained prior specimen or rejected/in-flight update cannot claim incoming capture inputs. */
export function annotationPreviewSettled(state: { current?: string; newest?: string; currentKey?: string; requestedKey: string; error: boolean; values: string; acknowledgedValues: string; appearance: string; acknowledgedAppearance: string; draft: string; acknowledgedDraft: string }) {
  return !!state.current && state.current === state.newest && state.currentKey === state.requestedKey && !state.error && state.values === state.acknowledgedValues && state.appearance === state.acknowledgedAppearance && state.draft === state.acknowledgedDraft
}

export function annotationHydration(session: AnnotationSession, notes: RawAnnotation[]) {
  const command: AnnotationCommand & { action: "activate" } = { action: "activate", session, notes: [] }
  for (const note of notes) { if (bytes({ ...command, notes: [...command.notes, note] }) <= EVENT_BYTES) command.notes.push(note) }
  return { command, omitted: notes.length - command.notes.length }
}

export function safeAnnotationDesign(values: Record<string, unknown> | undefined, parameters: { id: string; kind: string; choices?: { id: string }[]; options?: string[]; apply: { input?: string } }[] = []) {
  const result: Record<string, number | string> = {}
  for (const parameter of parameters) {
    const id = parameter.apply.input ?? parameter.id
    const value = values?.[id]
    if (typeof value === "number" && Number.isFinite(value)) result[id] = value
    else if (parameter.kind === "enum" && typeof value === "string" && (parameter.choices?.some(choice => choice.id === value) || parameter.options?.includes(value))) result[id] = value
    else if (parameter.kind === "color" && typeof value === "string" && /^(?:#[0-9a-f]{3,8}|(?:oklch|oklab|rgb|hsl)\([\d.%+\s/-]+\))$/i.test(value)) result[id] = value
  }
  return result
}

export function safeAnnotationTokens(tokens: Record<string, string>) {
  return Object.fromEntries(Object.entries(tokens).filter(([name, value]) => /^--[a-z0-9-]+$/i.test(name) && value.length <= 200 && /^(?:#[0-9a-f]{3,8}|[+-]?[\d.]+(?:px|rem|em|%|s|ms)?|(?:oklch|oklab|rgb|rgba|hsl|hsla)\([\d.%+\s/,()-]+\)|var\(--[a-z0-9-]+\))$/i.test(value)))
}

/** Host controls sit above the wrapped Studio dock; child runtimes keep vendor positioning. */
export function annotationHostBottom(height: number, dockTop: number | null) {
  return dockTop === null ? 24 : Math.max(24, height - dockTop + 12)
}
