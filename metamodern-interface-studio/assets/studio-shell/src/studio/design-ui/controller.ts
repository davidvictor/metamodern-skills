import { compileDesign, isJsonValue, type JsonValue } from "../design-runtime"
import type { CompiledThemes, DesignControllerOptions, DesignEdit, DesignPreviewIdentity, DesignProblem, DesignReadout, DesignReset, DesignScope, DesignSnapshot, DesignTarget, DesignSaveCandidate } from "./types"
const copy = <T>(value: T): T => structuredClone(value)
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child) }
  return value
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const problem = (error: unknown): DesignProblem => ({ id: "design-runtime", message: error instanceof Error ? error.message : String(error), severity: "error", blocks: ["preview", "save", "export"] })

/** Framework-neutral controller. JSON history, product semantics, and compiler output remain separate. */
export class DesignController {
  private state: DesignSnapshot
  private listeners = new Set<() => void>()
  private captures = new WeakSet<DesignSaveCandidate>()
  private applied: { compiled: CompiledThemes; revision: number } | null = null
  private beforeApplied: { compiled: CompiledThemes; revision: number } | null = null
  private previews = new Map<string, { theme: string; channel: "working" | "saved"; revision?: number; fingerprint?: string; identityId?: string; savedRevision?: number }>()
  private past: JsonValue[] = []
  private future: JsonValue[] = []
  private gesture: { values: JsonValue; inputProblems: DesignSnapshot["inputProblems"] } | null = null
  private generation = 0
  private work: Promise<void> = Promise.resolve()
  private readonly options: DesignControllerOptions
  constructor(options: DesignControllerOptions) {
    this.options = options
    const model = options.runtime.model
    if (!model || ![model.validate, model.edit, model.reset, model.readout].every(fn => typeof fn === "function")) throw new Error("Compiler has no compatible product design model")
    if (!isJsonValue(model.initial) || !options.themes.length) throw new Error("Design model needs JSON initial values and declared themes")
    const initial = copy(model.initial)
    this.state = freeze({ id: options.id ?? "direction.source", savedRevision: options.savedRevision ?? 0, draftRevision: 0, compiledRevision: 0, inputEpoch: 0, values: initial, savedValues: copy(initial), originalValues: copy(initial), scope: { themes: [...options.themes] }, status: "pending", problems: [], inputProblems: {}, compiled: {}, savedCompiled: {}, dirty: false, previewPending: false, canUndo: false, canRedo: false, canSave: false, canExport: false })
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<DesignSnapshot>) {
    const next = { ...this.state, ...patch }
    const consumers = [...this.previews.values()].filter(p => p.channel === "working")
    const previewPending = consumers.some(p => p.identityId !== next.id || p.savedRevision !== next.savedRevision || p.revision !== next.compiledRevision || p.fingerprint !== next.compiled[p.theme]?.fingerprint)
    const ready = next.status === "ready" && next.compiledRevision === next.draftRevision && !previewPending && !Object.keys(next.inputProblems).length && !this.gesture
    const blocks = (kind: "save" | "export") => next.problems.some(p => p.severity === "error" || p.blocks?.includes(kind))
    this.state = freeze({ ...next, dirty: !same(next.values, next.savedValues) || !!Object.keys(next.inputProblems).length, previewPending, canUndo: this.allowed("history") && this.past.length > 0, canRedo: this.allowed("history") && this.future.length > 0, canSave: this.allowed("edit") && ready && !blocks("save"), canExport: ready && !blocks("export") })
    for (const listener of this.listeners) listener()
  }
  private compile(initial = false) {
    const generation = ++this.generation
    const revision = this.state.draftRevision
    const values = this.state.values
    let problems: DesignProblem[]
    try { problems = this.options.runtime.model.validate(values) } catch (error) { problems = [problem(error)] }
    if (problems.some(p => p.severity === "error" || p.blocks?.includes("preview")) || Object.keys(this.state.inputProblems).length) {
      this.publish({ status: "invalid", problems }); this.work = Promise.resolve(); return
    }
    this.publish({ status: "pending", problems })
    const loads = { [this.options.compiler.id]: async () => this.options.runtime }
    this.work = Promise.all(this.options.themes.map(async theme => [theme, await compileDesign(this.options.compiler, loads, { direction: values, theme, sourceLockId: this.options.compiler.sourceLockId })] as const)).then(entries => {
      if (generation !== this.generation || revision !== this.state.draftRevision) return
      const outputs = copy(Object.fromEntries(entries))
      const failed = entries.flatMap(([, output]) => (output.diagnostics ?? []).filter(d => d.status === "error").map(d => ({ id: d.id, message: d.message, severity: "error" as const, blocks: ["preview", "save", "export"] as ("preview" | "save" | "export")[] })))
      if (failed.length) { this.publish({ status: "error", problems: [...problems, ...failed] }); return }
      this.publish({ status: "ready", compiled: outputs, compiledRevision: revision, ...(initial && same(values, this.state.savedValues) ? { savedCompiled: outputs } : {}) })
    }, error => { if (generation === this.generation && revision === this.state.draftRevision) this.publish({ status: "error", problems: [problem(error)] }) })
  }
  start = async () => { this.compile(true); await this.work }
  settled = async () => { await this.work }
  setScope(scope: DesignScope) {
    if (!scope.themes.length || scope.themes.some(theme => !this.options.themes.includes(theme))) throw new Error("Unknown design theme scope")
    this.publish({ scope: copy(scope) })
  }
  setTarget(target?: DesignTarget) { this.publish({ target: target ? copy(target) : undefined }) }
  readout(controlId: string): DesignReadout { return freeze(copy(this.options.runtime.model.readout(this.state.values, { controlId, scope: this.state.scope, target: this.state.target }))) }
  private allowed(capability: "edit" | "reset" | "history" | "inheritance" | "diagnostics") { return !this.options.capabilities || this.options.capabilities.includes(capability) }
  private require(capability: "edit" | "reset" | "history" | "inheritance" | "diagnostics") { if (this.allowed(capability)) return true; this.publish({ problems: [...this.state.problems, { id: `capability.${capability}`, message: `${capability} capability is not declared`, severity: "warning" }] }); return false }
  beginGesture() { if (!this.require("edit")) return; if (this.gesture !== null) return; this.gesture = { values: copy(this.state.values), inputProblems: copy(this.state.inputProblems) }; this.publish({}) }
  commitGesture() {
    if (this.gesture === null) return
    if (this.allowed("history") && !same(this.gesture.values, this.state.values)) { this.past.push(this.gesture.values); this.future = [] }
    this.gesture = null; this.publish({})
  }
  cancelGesture() {
    if (this.gesture === null) return
    const values = this.gesture.values; const inputs = this.gesture.inputProblems; this.gesture = null; this.replace(values, false, inputs, true)
  }
  private replace(values: JsonValue, history = true, inputProblems = this.state.inputProblems, resetInputs = false) {
    if (!isJsonValue(values)) { ++this.generation; this.publish({ status: "invalid", problems: [problem("Model produced non-JSON values")] }); return }
    if (this.allowed("history") && history && this.gesture === null && !same(values, this.state.values)) { this.past.push(copy(this.state.values)); this.future = [] }
    this.publish({ status: "pending", values: copy(values), draftRevision: this.state.draftRevision + 1, inputProblems, inputEpoch: this.state.inputEpoch + (resetInputs ? 1 : 0) }); this.compile()
  }
  edit(intent: Omit<DesignEdit, "scope"> & { scope?: DesignScope }) {
    if (!this.require("edit")) return
    try { const inputs = { ...this.state.inputProblems }; delete inputs[intent.controlId]; this.replace(this.options.runtime.model.edit(this.state.values, { ...intent, scope: intent.scope ?? this.state.scope, target: intent.target ?? this.state.target }), true, inputs) }
    catch (error) { ++this.generation; this.publish({ status: "invalid", problems: [problem(error)] }) }
  }
  reset(request: Omit<DesignReset, "scope"> & { scope?: DesignScope }) {
    if (!this.require("reset") || request.basis === "inherited" && !this.require("inheritance")) return
    try { const inputs = request.controlId ? { ...this.state.inputProblems } : {}; if (request.controlId) delete inputs[request.controlId]; this.replace(this.options.runtime.model.reset(this.state.values, { ...request, scope: request.scope ?? this.state.scope, target: request.target ?? this.state.target }, { saved: this.state.savedValues, original: this.state.originalValues }), true, inputs, true) }
    catch (error) { ++this.generation; this.publish({ status: "invalid", problems: [problem(error)] }) }
  }
  inputProblem(controlId: string, message: string, raw?: string) {
    ++this.generation
    this.publish({ status: "invalid", inputProblems: { ...this.state.inputProblems, [controlId]: { id: `input.${controlId}`, controlId, raw, message: raw ? `${message}: ${raw}` : message, severity: "error", blocks: ["save", "export"] } } })
  }
  clearInputProblem(controlId: string) { const next = { ...this.state.inputProblems }; delete next[controlId]; this.publish({ status: "pending", inputProblems: next, inputEpoch: this.state.inputEpoch + 1 }); this.compile() }
  undo() { if (!this.require("history")) return; if (this.gesture !== null) this.cancelGesture(); const value = this.past.pop(); if (value !== undefined) { this.future.push(copy(this.state.values)); this.replace(value, false, {}, true) } }
  redo() { if (!this.require("history")) return; const value = this.future.pop(); if (value !== undefined) { this.past.push(copy(this.state.values)); this.replace(value, false, {}, true) } }
  /** Immutable candidate held by a persistence owner while its confirmed write is in flight. */
  captureSave(): DesignSaveCandidate {
    if (!this.state.canSave) throw new Error("Current direction is not ready to save")
    const candidate = freeze(copy({ id: this.state.id, baseSavedRevision: this.state.savedRevision, draftRevision: this.state.draftRevision, values: this.state.values, compiled: this.state.compiled }))
    this.captures.add(candidate)
    return candidate
  }
  /** Confirmation names captured A; a newer working B stays dirty. This is not a persistence service. */
  acknowledgeSaved(id: string, revision: number, candidate: DesignSaveCandidate) {
    if (!id.trim() || !this.captures.has(candidate) || candidate.id !== this.state.id || candidate.baseSavedRevision !== this.state.savedRevision || !Number.isInteger(revision) || revision <= this.state.savedRevision) throw new Error("Cannot acknowledge an unknown or stale saved candidate")
    this.captures.delete(candidate)
    this.publish({ id, savedRevision: revision, savedValues: candidate.values, savedCompiled: candidate.compiled })
  }
  /** Latest frame rejection restores the whole prior pair; stale failures cannot replace newer edits. */
  reportPreviewFailure(identity: DesignPreviewIdentity, message: string) {
    if (identity.id !== this.state.id || identity.requestedRevision !== this.state.draftRevision || !Object.values(this.state.compiled).some(output => output.fingerprint === identity.fingerprint)) return
    ++this.generation
    const accepted = this.applied?.revision === identity.draftRevision ? this.beforeApplied : this.applied
    this.applied = accepted
    this.publish({ status: "error", compiled: accepted?.compiled ?? {}, compiledRevision: accepted?.revision ?? 0, problems: [problem(message)] })
  }
  registerPreview(id: string, theme: string, channel: "working" | "saved") { const existing = this.previews.get(id); if (existing?.theme === theme && existing.channel === channel) return; this.previews.set(id, { theme, channel }); this.publish({}) }
  unregisterPreview(id: string) { if (this.previews.delete(id)) this.publish({}) }
  confirmPreview(id: string, identity: DesignPreviewIdentity) {
    const consumer = this.previews.get(id)
    if (!consumer || consumer.channel !== "working" || identity.channel !== "working" || identity.id !== this.state.id || identity.draftRevision !== this.state.compiledRevision || identity.fingerprint !== this.state.compiled[consumer.theme]?.fingerprint) return
    this.previews.set(id, { ...consumer, revision: identity.draftRevision, fingerprint: identity.fingerprint, identityId: identity.id, savedRevision: identity.savedRevision })
    const working = [...this.previews.values()].filter(p => p.channel === "working")
    if (this.state.status === "ready" && working.every(p => p.identityId === this.state.id && p.savedRevision === this.state.savedRevision && p.revision === this.state.compiledRevision && p.fingerprint === this.state.compiled[p.theme]?.fingerprint) && this.applied?.revision !== this.state.compiledRevision) { this.beforeApplied = this.applied; this.applied = { compiled: this.state.compiled, revision: this.state.compiledRevision } }
    this.publish({})
  }
  retry() { this.compile(!Object.keys(this.state.savedCompiled).length) }
  preview(theme: string, basis: "saved" | "draft" = "draft"): { output?: CompiledThemes[string]; identity?: DesignPreviewIdentity } {
    const output = (basis === "saved" ? this.state.savedCompiled : this.state.compiled)[theme]
    if (!output) return {}
    return { output, identity: { channel: basis === "saved" ? "saved" : "working", id: this.state.id, savedRevision: this.state.savedRevision, draftRevision: basis === "saved" ? 0 : this.state.compiledRevision, requestedRevision: this.state.draftRevision, fingerprint: output.fingerprint, sourceLockId: output.sourceLockId, basis: basis === "saved" ? this.state.savedRevision ? "saved" : "source" : this.state.status === "ready" ? this.state.dirty ? "draft" : this.state.savedRevision ? "saved" : "source" : "last-valid" } }
  }
}
export const createDesignController = (options: DesignControllerOptions) => new DesignController(options)
