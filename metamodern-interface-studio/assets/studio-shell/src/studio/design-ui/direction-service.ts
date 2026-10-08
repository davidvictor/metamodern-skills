import { isJsonValue, type JsonValue } from "../design-runtime"
import { directionJSON, emptyDirections, latestDirections, savedDirectionKey, validateDirectionEnvelope, validateDirections, validDirectionId, validDirectionRevision, DIRECTIONS_MAX_BYTES, type DirectionsFile, type SavedDirectionEnvelope, type DesignDirectionsDeclaration, type DirectionReceipt, type DirectionPin } from "../directions"
import type { DesignController } from "./controller"
import type { CompiledThemes, DesignRuntimeModule, DesignSnapshot, DesignPreviewIdentity } from "./types"
export type DirectionProjection = { output?: CompiledThemes[string]; identity?: DesignPreviewIdentity; reason?: string }
export type Recovery = { key: string; product: SavedDirectionEnvelope["product"]; payloadSchema: string; lastValidValues?: JsonValue; receipt?: DirectionReceipt; receiptVerified?: boolean; id: string; baseRevision: number; values: JsonValue; inputProblems: DesignSnapshot["inputProblems"]; label?: string }
type FrozenPin = { product?: SavedDirectionEnvelope["product"]; payloadSchema?: string; pin: DirectionPin; values: JsonValue; receipt: DirectionReceipt; compiled?: CompiledThemes; reason?: string }
export type DirectionsState = { journal: DirectionsFile; revision: string | null; load: "loading" | "ready" | "readonly" | "unreadable" | "failed"; saving: boolean; editable: boolean; readiness: "unverified" | "pending" | "ready" | "error"; save: "clean" | "dirty" | "saving" | "saved" | "conflict" | "error"; message?: string; selectionProblem?: string; requested?: { id: string; revision?: number }; draftLabel?: string; recovery?: Recovery; quarantine: { id: string; label: string; raw: string; reason: string }[]; pins: DirectionPin[] }
const clone = <T>(v: T): T => structuredClone(v)
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(freeze) }; return v }
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)
const unique = (prefix: string) => `${prefix}.${crypto.randomUUID()}`
export type DirectionServiceOptions = { declaration: DesignDirectionsDeclaration; controller: DesignController; runtime: DesignRuntimeModule; canSave: boolean; editable?: boolean; bundled?: unknown; storage?: Storage; fetch?: typeof fetch }
function parseInputs(value: unknown): DesignSnapshot["inputProblems"] {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recovery input problems")
  return Object.fromEntries(Object.entries(value).map(([key, problem]) => {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(key) || !problem || typeof problem !== "object" || Array.isArray(problem)) throw new Error("Invalid recovery field")
    const p = problem as Record<string, unknown>
    if (typeof p.message !== "string" || p.message.length > 8000 || (p.raw !== undefined && (typeof p.raw !== "string" || p.raw.length > 8000))) throw new Error("Invalid recovery raw text")
    return [key, { id: `input.${key}`, controlId: key, severity: "error", blocks: ["save", "export"], message: p.message, ...(p.raw === undefined ? {} : { raw: p.raw }) }]
  }))
}
/** Browser/local lifecycle owner. Product payloads are decoded and compiled only by its explicit runtime. */
export class DesignDirectionService {
  private state: DirectionsState = freeze({ journal: emptyDirections(), revision: null, load: "loading", saving: false, editable: true, readiness: "unverified", save: "clean", quarantine: [], pins: [] })
  private listeners = new Set<() => void>()
  private recoveries: Record<string, Recovery> = Object.create(null)
  private frozenPins = new Map<string, FrozenPin>()
  private readinessGeneration = 0
  private journalGeneration = 0
  private selection = 0
  private cachedSelection: { id: string; revision: number } = { id: "direction.source", revision: 0 }
  private lastRecovery = ""
  private workingKeys = new Map<string, string>()
  private ownedRecoveryKeys = new Set<string>()
  private ownedPinKeys = new Set<string>()
  private receipts = new Map<string, DirectionReceipt>()
  private cacheFailed = false
  private cacheReadOnly = false
  private active = true
  private unsubscribe?: () => void
  private readonly cacheKey: string
  private options: DirectionServiceOptions
  constructor(options: DirectionServiceOptions) {
    this.options = options
    this.state = freeze({ ...this.state, editable: options.editable !== false })
    if (options.declaration.schema !== "studio-direction-lifecycle/1" || !options.runtime.directionCodec || !isJsonValue(options.declaration)) throw new Error("Direction lifecycle needs a data-only declaration and explicit product codec")
    this.cacheKey = `studio.directions.${options.declaration.product.id}.recovery/1`
  }
  getSnapshot = () => this.state
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private publish(patch: Partial<DirectionsState>) { if (!this.active) return; this.state = freeze({ ...this.state, ...patch }); this.listeners.forEach(fn => fn()) }
  dispose() { this.active = false; this.unsubscribe?.() }
  private request = (url: string, init?: RequestInit) => (this.options.fetch ?? fetch)(url, init)
  private storageRead(key: string): string | null {
    if (!this.options.storage || this.cacheReadOnly) return null
    try { return this.options.storage.getItem(key) } catch { this.cacheReadOnly = true; this.publish({ message: "Browser recovery is unavailable; your edit stays in memory. Download before closing." }); return null }
  }
  private persist() {
    if (!this.options.storage || this.cacheReadOnly) return
    try {
      for (const [key, recovery] of Object.entries(this.recoveries)) if (this.ownedRecoveryKeys.has(key)) this.options.storage.setItem(`${this.cacheKey}.record.${key}`, JSON.stringify(recovery))
      for (const [key, pin] of this.frozenPins) if (pin.pin.basis === "draft" && this.ownedPinKeys.has(key)) { const { pin: identity, values, receipt, product, payloadSchema } = pin; this.options.storage.setItem(`${this.cacheKey}.pin.${key}`, JSON.stringify({ pin: identity, values, receipt, product, payloadSchema })) }
      this.options.storage.setItem(this.cacheKey, JSON.stringify({ schema: "studio-direction-recovery/2", active: this.cachedSelection, recoveries: this.recoveries, quarantine: this.state.quarantine, pins: [...this.frozenPins.values()].filter(p => p.pin.basis === "draft").map(({ pin, values, receipt, product, payloadSchema }) => ({ pin, values, receipt, product, payloadSchema })) })); this.cacheFailed = false }
    catch { if (!this.cacheFailed) { this.cacheFailed = true; this.publish({ message: "Browser recovery could not be stored. Your current edit remains in memory; download it before closing." }) } }
  }
  private cacheDraft = () => {
    const s = this.options.controller.getSnapshot()
    const signature = directionJSON([s.id, s.savedRevision, s.values, s.status, s.compiledRevision, s.compiledValues, Object.values(s.compiled).map(o => o.fingerprint), s.inputProblems, s.dirty, this.state.draftLabel]); if (signature === this.lastRecovery) return; this.lastRecovery = signature
    if (s.dirty) {
      const priorKey = this.workingKeys.get(s.id); const key = priorKey && !this.storageRead(`${this.cacheKey}.discard.${priorKey}`) ? priorKey : unique("recovery"); this.workingKeys.set(s.id, key); this.ownedRecoveryKeys.add(key)
      const outputs = Object.values(s.compiled)
      const receipt: DirectionReceipt | undefined = outputs.length ? { compiler: outputs[0].compiler, ...(outputs[0].sourceLockId ? { sourceLockId: outputs[0].sourceLockId } : {}), fingerprints: Object.fromEntries(Object.entries(s.compiled).map(([theme, output]) => [theme, output.fingerprint])),  } : undefined
      const receiptKey = directionJSON([s.compiledValues, Object.values(s.compiled).map(o => o.fingerprint)])
      const verified = this.receipts.get(receiptKey)
      this.recoveries[key] = clone({ key, id: s.id, baseRevision: s.savedRevision, product: this.options.declaration.product, payloadSchema: this.options.declaration.payloadSchema, values: s.values, inputProblems: s.inputProblems, label: this.state.draftLabel, lastValidValues: s.compiledValues, receipt: verified ?? receipt, receiptVerified: !!verified })
      if (s.compiledValues !== undefined && outputs.length && !verified) void this.receipt(s.compiledValues, s.compiled, "import").then(value => { const current = this.recoveries[key]; if (!this.active || !current || directionJSON([current.lastValidValues, Object.values(current.receipt?.fingerprints ?? {})]) !== receiptKey) return; current.receipt = clone(value); current.receiptVerified = true; this.persist() }, () => { /* Raw recovery remains; no canonical readiness is claimed. */ })
    } else { const key = this.workingKeys.get(s.id); if (key) this.discardRecord(key); this.workingKeys.delete(s.id) }
    const generation = ++this.readinessGeneration
    if (s.status === "ready" && s.compiledRevision === s.draftRevision && !Object.keys(s.inputProblems).length) {
      const cached = this.receipts.get(directionJSON([s.values, Object.values(s.compiled).map(o => o.fingerprint)]))
      if (cached) this.publish({ readiness: "ready" })
      else {
        this.publish({ readiness: "pending" })
        void this.receipt(s.values, s.compiled, "import").then(() => { if (generation === this.readinessGeneration) this.publish({ readiness: "ready" }) }, error => { if (generation === this.readinessGeneration) this.publish({ readiness: "error", message: `Source/assets unavailable: ${errorText(error)}. Nothing is saved or export-ready.` }) })
      }
    } else this.publish({ readiness: "unverified" })
    this.persist()
    if (!this.state.saving && this.state.save !== "conflict" && this.state.save !== "error") this.publish({ save: s.dirty ? "dirty" : "clean" })
  }
  private readCache() {
    try {
      const raw = this.options.storage?.getItem(this.cacheKey); if (raw && raw.length > 4 * DIRECTIONS_MAX_BYTES) { this.cacheReadOnly = true; this.publish({ message: "Browser recovery exceeds its budget and will not be overwritten." }); return }
      const cache = raw ? JSON.parse(raw) : { schema: "studio-direction-recovery/2", recoveries: {}, pins: [], quarantine: [] }; if (!isJsonValue(cache)) throw new Error("Recovery JSON exceeds depth/complexity limits"); if (cache.schema !== "studio-direction-recovery/2") { this.cacheReadOnly = true; this.publish({ message: "Unsupported browser recovery is preserved without overwriting. Download your new draft before closing.", quarantine: [{ id: unique("recovery"), label: "Unsupported recovery cache", raw: raw ?? "", reason: "Unknown recovery schema" }] }); return }
      if (cache.active && typeof cache.active.id === "string" && Number.isSafeInteger(cache.active.revision) && cache.active.revision >= 0) this.cachedSelection = cache.active
      const records: Record<string, unknown> = { ...(cache.recoveries ?? {}) }
      for (let i = 0; i < (this.options.storage?.length ?? 0); i++) { const key = this.options.storage?.key(i); if (key?.startsWith(`${this.cacheKey}.record.`)) { const record = this.options.storage?.getItem(key); if (record) { const parsed = JSON.parse(record); if (!isJsonValue(parsed)) throw new Error("Invalid recovery record"); records[key.slice(`${this.cacheKey}.record.`.length)] = parsed } } }
      for (const [key, v] of Object.entries(records)) {
        if (this.options.storage?.getItem(`${this.cacheKey}.discard.${key}`)) continue
        const r = v as Recovery
        if (r && r.key === key && typeof r.id === "string" && r.product && typeof r.product.id === "string" && typeof r.product.revision === "string" && typeof r.payloadSchema === "string" && Number.isSafeInteger(r.baseRevision) && isJsonValue(r.values) && r.inputProblems && typeof r.inputProblems === "object") {
          const inputs = parseInputs(r.inputProblems)
          this.recoveries[key] = { ...r, inputProblems: inputs }
        } else throw new Error("Recovery payload metadata is unsupported")
      }
      const quarantine = Array.isArray(cache.quarantine) ? cache.quarantine.filter((q: { raw?: unknown; reason?: unknown; label?: unknown; id?: unknown }) => typeof q.raw === "string" && q.raw.length <= DIRECTIONS_MAX_BYTES && typeof q.reason === "string" && typeof q.label === "string" && typeof q.id === "string").slice(-3) : []
      this.publish({ quarantine })
      const pinRecords = new Map<string, unknown>((cache.pins ?? []).map((p: FrozenPin) => [p.pin?.key, p]))
      for (let i = 0; i < (this.options.storage?.length ?? 0); i++) { const key = this.options.storage?.key(i); if (key?.startsWith(`${this.cacheKey}.pin.`)) { const raw = this.options.storage?.getItem(key); if (raw) { const p = JSON.parse(raw); if (!isJsonValue(p)) throw new Error("Invalid pinned snapshot"); pinRecords.set(key.slice(`${this.cacheKey}.pin.`.length), p) } } }
      for (const item of pinRecords.values()) { const p = item as FrozenPin; if (p?.pin?.basis === "draft" && typeof p.pin.key === "string" && isJsonValue(p.values) && p.receipt) this.frozenPins.set(p.pin.key, p) }
    } catch { this.cacheReadOnly = true; this.publish({ message: "Browser recovery is unreadable and will not be overwritten; canonical saved directions are unchanged." }) }
  }
  async initialize(hash = typeof location === "undefined" ? "" : location.hash) {
    this.readCache(); await this.reload()
    const q = new URLSearchParams(hash.replace(/^#/, "")); const id = q.get("direction"); const rev = q.get("revision")
    const wanted = id ?? this.cachedSelection.id
    if (!validDirectionId(wanted) || rev !== null && !validDirectionRevision(rev)) this.publish({ selectionProblem: "Invalid direction ID/revision; nothing was substituted" })
    else if (wanted !== "direction.source") await this.select(wanted, rev ? Number(rev) : id ? undefined : this.cachedSelection.revision || undefined)
    this.offerRecovery()
    this.unsubscribe = this.options.controller.subscribe(this.cacheDraft)
    this.cacheDraft(); this.refreshPins()
  }
  async reload() {
    if (this.state.saving) return
    const ticket = ++this.journalGeneration
    if (!this.options.canSave) {
      const data = this.options.bundled ?? emptyDirections(); const errors = validateDirections(data)
      this.publish(errors.length ? { load: "unreadable", message: errors.join("; ") } : { load: "readonly", journal: clone(data as DirectionsFile), revision: null })
      this.refreshPins(); void this.retryFailedPins(); return
    }
    try {
      const r = await this.request("/__studio/directions", { cache: "no-store" }); const data = await r.json()
      if (ticket !== this.journalGeneration) return
      if (!r.ok || r.headers.get("x-studio-unreadable") === "1" || validateDirections(data).length) { this.publish({ load: "unreadable", message: "The saved direction journal is unreadable. Nothing will be overwritten." }); return }
      const revision = r.headers.get("x-studio-revision"); if (!revision) throw new Error("Saved-file revision is missing")
      this.publish({ load: "ready", journal: clone(data), revision }); this.refreshPins(); void this.retryFailedPins()
    } catch (e) { if (ticket !== this.journalGeneration) return; this.publish({ load: "failed", message: `Saved directions could not be read: ${errorText(e)}. Nothing will be overwritten.` }) }
  }
  private decode(schema: string, payload: JsonValue, product?: SavedDirectionEnvelope["product"]) {
    if (product && product.id !== this.options.declaration.product.id) throw new Error("This direction belongs to a different product")
    const result = this.options.runtime.directionCodec!.decode({ schema, payload: clone(payload), product })
    if (!result || !isJsonValue(result.payload)) throw new Error(result?.problems?.map(p => p.message).join("; ") || "Unsupported direction payload; original bytes are kept")
    if (product && product.revision !== this.options.declaration.product.revision && !result.migratedFrom) throw new Error("Product revision changed; explicit migration is required")
    return result
  }
  private async receipt(values: JsonValue, compiled: CompiledThemes, purpose: "save" | "adopt" | "compare" | "import"): Promise<DirectionReceipt> {
    const ready = await this.options.runtime.checkDirection?.({ purpose, values: clone(values), compiled })
    if (ready?.problems.some(p => p.severity === "error" || p.blocks?.includes(purpose === "save" ? "save" : "preview"))) throw new Error(ready.problems.map(p => p.message).join("; "))
    if (ready?.basis !== undefined && !isJsonValue(ready.basis)) throw new Error("Product readiness returned non-JSON basis")
    const outputs = Object.values(compiled); if (!outputs.length) throw new Error("No valid compiled direction")
    const receipt = freeze({ compiler: outputs[0].compiler, ...(outputs[0].sourceLockId === undefined ? {} : { sourceLockId: outputs[0].sourceLockId }), fingerprints: Object.fromEntries(Object.entries(compiled).map(([theme, output]) => [theme, output.fingerprint])), ...(ready?.basis === undefined ? {} : { basis: clone(ready.basis) }) })
    this.receipts.set(directionJSON([values, Object.values(compiled).map(o => o.fingerprint)]), receipt)
    return receipt
  }
  private verifyReceipt(expected: DirectionReceipt | undefined, actual: DirectionReceipt) { if (!expected || directionJSON(expected) !== directionJSON(actual)) throw new Error("Saved compiler/source/fingerprint basis is missing or changed. Original revision is kept; import it as a draft to review and save a new direction.") }
  private offerRecovery() { const s = this.options.controller.getSnapshot(); const r = Object.values(this.recoveries).filter(r => r.id === s.id && r.key !== this.workingKeys.get(s.id) && (directionJSON(r.values) !== directionJSON(s.values) || Object.keys(r.inputProblems).length)).at(-1); this.publish({ recovery: r && (directionJSON(r.values) !== directionJSON(s.values) || Object.keys(r.inputProblems).length) ? clone(r) : undefined }) }
  async select(id: string, revision?: number) {
    this.cacheDraft(); const ticket = ++this.selection; this.publish({ requested: { id, revision } })
    try {
      let values: JsonValue; let rev = 0
      if (id === "direction.source") values = this.options.controller.getSnapshot().originalValues
      else {
        const envelope = revision === undefined ? latestDirections(this.state.journal).find(e => e.envelope.id === id && !e.deleted)?.envelope : this.state.journal.revisions.find(e => e.id === id && e.revision === revision)
        if (!envelope) throw new Error(`Saved direction ${id}${revision ? ` revision ${revision}` : ""} is unavailable; nothing was substituted`)
        const decoded = this.decode(envelope.payloadSchema, envelope.payload, envelope.product)
        if (decoded.migratedFrom || directionJSON(decoded.payload) !== directionJSON(envelope.payload)) throw new Error("This saved payload needs migration. Import its envelope to open a labeled draft; the saved revision stays unchanged.")
        values = decoded.payload!; rev = envelope.revision
        const prepared = await this.options.controller.prepareSaved({ id, revision: rev, values })
        const receipt = await this.receipt(values, prepared.compiled, "adopt"); this.verifyReceipt(envelope.receipt, receipt)
        if (ticket !== this.selection) return false
        if (!this.options.controller.adoptSaved(prepared)) throw new Error("Selection was superseded by a newer edit; your edit is kept")
        this.cachedSelection = { id, revision: rev }; this.persist(); this.publish({ selectionProblem: undefined, requested: undefined, draftLabel: undefined, save: "clean", message: undefined }); this.offerRecovery(); return true
      }
      const prepared = await this.options.controller.prepareSaved({ id, revision: rev, values })
      await this.receipt(values, prepared.compiled, "adopt")
      if (ticket !== this.selection) return false
      if (!this.options.controller.adoptSaved(prepared)) throw new Error("Selection was superseded by a newer edit; your edit is kept")
      this.cachedSelection = { id, revision: rev }; this.persist(); this.publish({ selectionProblem: undefined, requested: undefined, draftLabel: undefined, save: "clean", message: undefined }); this.offerRecovery(); return true
    } catch (e) { if (ticket === this.selection) this.publish(errorText(e).includes("superseded") ? { message: errorText(e) } : { selectionProblem: errorText(e), message: errorText(e) }); return false }
  }
  async recover() {
    const r = this.state.recovery; if (!r || r.id !== this.options.controller.getSnapshot().id) { this.offerRecovery(); return false }
    try {
      const decoded = this.decode(r.payloadSchema, r.values, r.product)
      const valid = r.lastValidValues === undefined ? this.options.controller.getSnapshot().compiledValues ?? this.options.controller.getSnapshot().savedValues : this.decode(r.payloadSchema, r.lastValidValues, r.product).payload!
      const prepared = await this.options.controller.prepareDraft(decoded.payload!, valid)
      const receipt = await this.receipt(valid, prepared.compiled, "import"); if (r.receipt && !decoded.migratedFrom) { if (r.receiptVerified === false) { const current = clone(receipt); const previous = clone(r.receipt); delete current.basis; delete previous.basis; this.verifyReceipt(previous, current) } else this.verifyReceipt(r.receipt, receipt) }
      const inputs = { ...r.inputProblems, ...Object.fromEntries(decoded.problems.filter(p => p.controlId && p.severity === "error").map(p => [p.controlId!, p])) }
      // An explicit recovery choice consumes only that offered record. Other edits remain recoverable.
      this.workingKeys.delete(r.id)
      if (!this.options.controller.adoptDraft(prepared, inputs)) throw new Error("Recovery was superseded by a newer edit; original recovery is kept")
      this.discardRecord(r.key)
      this.publish({ recovery: undefined, selectionProblem: undefined, requested: undefined, draftLabel: r.label, message: r.baseRevision !== this.options.controller.getSnapshot().savedRevision ? "Recovered edit used an older saved revision. Keep it as a new direction or explicitly reconcile." : r.receiptVerified === false ? "Recovered raw draft recompiled against current source; prior asset basis was unverified. Nothing is saved." : "Recovered unsaved draft; canonical saved data is unchanged.", save: "dirty" }); this.cacheDraft(); this.offerRecovery(); return true
    } catch (e) { this.quarantine(JSON.stringify(r), "Recovered draft", errorText(e)); return false }
  }
  discardRecovery() { const r = this.state.recovery; if (r) this.discardRecord(r.key); this.publish({ recovery: undefined }); this.offerRecovery(); this.persist() }
  private discardRecord(key: string) {
    delete this.recoveries[key]; this.ownedRecoveryKeys.delete(key)
    if (!this.cacheReadOnly) try { this.options.storage?.setItem(`${this.cacheKey}.discard.${key}`, "1"); this.options.storage?.removeItem(`${this.cacheKey}.record.${key}`) } catch { this.publish({ message: "Recovery discard could not be stored; original recovery remains on this device." }) }
  }
  private quarantine(raw: string, label: string, reason: string) { this.publish({ quarantine: [...this.state.quarantine, { id: unique("recovery"), label, raw: raw.slice(0, DIRECTIONS_MAX_BYTES), reason }].slice(-3), message: reason }); this.persist() }
  importText(raw: string) {
    if (!this.state.editable) { this.publish({ message: "This editor does not declare editing capability" }); return false }
    if (new TextEncoder().encode(raw).length > DIRECTIONS_MAX_BYTES) { this.publish({ message: "Import exceeds the 1 MB limit; keep the original file." }); return false }
    try {
      const value = JSON.parse(raw); if (!isJsonValue(value) || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Import must be a direction or explicitly supported legacy variant")
      let result; let label = "Imported direction"; let importedInputs: DesignSnapshot["inputProblems"] = {}
      if (value.schema === "studio-direction/1") { const errors = validateDirectionEnvelope(value); if (errors.length) throw new Error(errors.join("; ")); const e = value as unknown as SavedDirectionEnvelope; result = this.decode(e.payloadSchema, e.payload, e.product); label = `Imported ${e.label}` }
      else if (value.schema === "studio-direction-draft/1") { if (!value.product || typeof value.product !== "object" || Array.isArray(value.product) || value.product.id !== this.options.declaration.product.id || typeof value.payloadSchema !== "string" || !isJsonValue(value.payload)) throw new Error("Invalid draft recovery envelope"); result = this.decode(value.payloadSchema, value.payload, value.product as unknown as SavedDirectionEnvelope["product"]); label = typeof value.label === "string" ? `Imported ${value.label.slice(0, 140)}` : "Imported draft"; importedInputs = parseInputs(value.inputProblems) }
      else if (value.schema === "studio-variant/1") { result = this.options.runtime.directionCodec!.legacy?.(value); if (!result || !isJsonValue(result.payload)) throw new Error("Legacy variant is not representable by this product; original bytes kept") ; label = "Imported legacy variant" }
      else result = this.decode(String(value.schema ?? ""), value)
      const inputs = Object.fromEntries((result.problems ?? []).filter(p => p.controlId && p.severity === "error").map(p => [p.controlId!, { ...p, id: `input.${p.controlId}`, raw: p.raw, blocks: ["save", "export"] as ("save" | "export")[] }]))
      this.options.controller.replaceDraft(result.payload!, { inputProblems: { ...importedInputs, ...inputs } }); if ((result.problems ?? []).some(p => p.severity === "error")) this.quarantine(raw, "Blocked import original", "Known payload is editable but invalid; exact original bytes retained"); this.publish({ selectionProblem: undefined, requested: undefined, draftLabel: label, save: "dirty", message: result.migratedFrom ? `Migrated ${result.migratedFrom} to a labeled draft. Nothing is saved.` : "Imported as a labeled draft. Nothing is saved." }); this.cacheDraft(); return true
    } catch (e) { this.quarantine(raw, "Rejected import", errorText(e)); return false }
  }
  private async write(journal: DirectionsFile) {
    if (!this.state.editable || !this.options.canSave || this.state.load !== "ready" || !this.state.revision) throw new Error("Canonical saving is unavailable. Download a draft; saved files are read-only or unreadable.")
    const errors = validateDirections(journal); if (errors.length) throw new Error(errors.join("; "))
    ++this.journalGeneration
    const response = await this.request("/__studio/directions", { method: "POST", headers: { "content-type": "application/json", "x-studio-expected-revision": this.state.revision }, body: JSON.stringify(journal) })
    const body = await response.json()
    if (response.status === 409) { const current = body.current; if (current && !validateDirections(current.data).length) this.publish({ journal: clone(current.data), revision: current.revision, save: "conflict", message: "Changed elsewhere. Your draft is kept; load the newer saved direction or keep your draft as a new direction." }); throw new Error("Save conflict: nothing was overwritten") }
    if (!response.ok) throw new Error(body.error?.reason ?? body.error ?? "Saved-file write failed")
    const revision = response.headers.get("x-studio-revision"); if (!revision) { this.publish({ load: "failed", revision: null }); throw new Error("Save acknowledgement has no revision; reload before another write") }
    this.publish({ journal: clone(journal), revision }); this.refreshPins()
  }
  async save(label: string, asNew = false) {
    if (this.state.saving) return false
    let candidate
    try {
      if (this.state.selectionProblem) throw new Error("Choose an available source or saved direction before saving")
      candidate = this.options.controller.captureSave()
      const existing = latestDirections(this.state.journal).find(e => e.envelope.id === candidate!.id)
      const old = existing?.envelope
      if (!asNew && existing?.deleted) throw new Error("Restore this deleted direction or keep the draft as a new direction")
      if (!asNew && old && old.revision !== candidate.baseSavedRevision) { this.publish({ save: "conflict" }); throw new Error("Saved revision changed. Keep this draft as a new direction or load the latest revision.") }
      if (!label.trim() || label.trim().length > 160) throw new Error("Name the direction (1–160 characters)")
      this.publish({ saving: true, save: "saving", message: undefined })
      const receipt = await this.receipt(candidate.values, candidate.compiled, "save")
      const now = new Date().toISOString(); const id = asNew || !old ? unique("direction") : old.id
      const envelope: SavedDirectionEnvelope = { schema: "studio-direction/1", id, label: label.trim(), revision: asNew || !old ? 1 : old.revision + 1, createdAt: asNew || !old ? now : old.createdAt, updatedAt: now, product: clone(this.options.declaration.product), payloadSchema: this.options.declaration.payloadSchema, payload: clone(candidate.values), receipt }
      await this.write({ ...clone(this.state.journal), revisions: [...this.state.journal.revisions, envelope] })
      const current = this.options.controller.getSnapshot()
      if (current.id === candidate.id && current.savedRevision === candidate.baseSavedRevision) this.options.controller.acknowledgeSaved(id, envelope.revision, candidate)
      if (this.options.controller.getSnapshot().id === id) { const key = this.workingKeys.get(candidate.id); if (key && candidate.id !== id) { this.discardRecord(key); this.workingKeys.delete(candidate.id) }; this.cachedSelection = { id, revision: envelope.revision } }
      const dirty = this.options.controller.getSnapshot().dirty
      const active = this.options.controller.getSnapshot().id === id
      this.publish({ save: dirty ? "dirty" : active ? "saved" : "clean", draftLabel: active && !dirty ? undefined : this.state.draftLabel, message: !active ? `Saved ${label} revision ${envelope.revision}; current direction was not changed.` : dirty ? `Saved ${label} revision ${envelope.revision}; newer edits are still unsaved.` : `Saved ${label} revision ${envelope.revision}.` })
      this.cacheDraft(); this.offerRecovery(); this.persist(); return true
    } catch (e) { this.publish({ save: this.state.save === "conflict" ? "conflict" : "error", message: errorText(e) }); return false }
    finally { this.publish({ saving: false }) }
  }
  async rename(id: string, label: string, expectedRevision?: number) {
    const e = latestDirections(this.state.journal).find(e => e.envelope.id === id && !e.deleted)?.envelope
    if (!e || this.state.saving) return false
    if (expectedRevision !== undefined && e.revision !== expectedRevision) { this.publish({ save: "conflict", message: "Viewing a historical revision. Open the latest revision to rename, or duplicate this exact snapshot." }); return false }
    try { const metadata = this.options.controller.getSnapshot().id === id && this.options.controller.getSnapshot().savedRevision === e.revision ? this.options.controller.captureSavedBasis() : undefined; if (!label.trim() || label.trim().length > 160) throw new Error("Name must contain 1–160 characters"); this.publish({ saving: true }); const next = { ...clone(e), label: label.trim(), revision: e.revision + 1, updatedAt: new Date().toISOString() }; await this.write({ ...clone(this.state.journal), revisions: [...this.state.journal.revisions, next] }); if (metadata && this.options.controller.getSnapshot().id === id && this.options.controller.getSnapshot().savedRevision === metadata.baseSavedRevision) this.options.controller.acknowledgeSaved(id, next.revision, metadata); if (this.options.controller.getSnapshot().id === id) this.cachedSelection = { id, revision: next.revision }; this.persist(); this.publish({ message: "Renamed as an immutable revision; payload unchanged." }); return true } catch (error) { this.publish({ save: "error", message: errorText(error) }); return false } finally { this.publish({ saving: false }) }
  }
  async remove(id: string, restore = false) {
    const e = latestDirections(this.state.journal).find(e => e.envelope.id === id)?.envelope; if (!e || this.state.saving) return false
    try { this.publish({ saving: true }); await this.write({ ...clone(this.state.journal), events: [...this.state.journal.events, { id: unique("event"), directionId: id, revision: e.revision, kind: restore ? "restore" : "delete", at: new Date().toISOString() }] }); this.publish({ message: restore ? "Direction restored; all revisions kept." : "Direction moved to recoverable deleted items. All revisions kept." }); return true } catch (error) { this.publish({ save: "error", message: errorText(error) }); return false } finally { this.publish({ saving: false }) }
  }
  async duplicate(id: string, label: string, revision?: number) {
    const e = revision === undefined ? latestDirections(this.state.journal).find(e => e.envelope.id === id)?.envelope : this.state.journal.revisions.find(e => e.id === id && e.revision === revision); if (!e || this.state.saving) return false
    try {
      if (!label.trim() || label.trim().length > 160) throw new Error("Name the duplicate (1–160 characters)")
      this.publish({ saving: true }); const decoded = this.decode(e.payloadSchema, e.payload, e.product)
      const compiled = await this.options.controller.compileSnapshot(decoded.payload!); const receipt = await this.receipt(decoded.payload!, compiled, "save"); this.verifyReceipt(e.receipt, receipt)
      const now = new Date().toISOString(); const next: SavedDirectionEnvelope = { ...clone(e), id: unique("direction"), revision: 1, label: label.trim(), createdAt: now, updatedAt: now, receipt }
      await this.write({ ...clone(this.state.journal), revisions: [...this.state.journal.revisions, next] }); this.publish({ message: "Duplicate saved independently; your current working edit is unchanged." }); return true
    } catch (error) { this.publish({ save: "error", message: errorText(error) }); return false } finally { this.publish({ saving: false }) }
  }
  resetDraft(original = false) { if (!this.state.editable) return; const s = this.options.controller.getSnapshot(); this.options.controller.replaceDraft(original ? s.originalValues : s.savedValues); this.publish({ draftLabel: undefined, message: original ? "Entire direction reset to original source as one unsaved transaction." : "Entire draft reset to saved; canonical history is unchanged.", save: "clean" }); this.cacheDraft() }
  async beginNew() { if (await this.select("direction.source")) this.publish({ draftLabel: "New direction", message: "New direction is not saved. Name and save it explicitly." }) }
  exportSaved(id: string, revision?: number) { const e = revision === undefined ? latestDirections(this.state.journal).find(e => e.envelope.id === id)?.envelope : this.state.journal.revisions.find(e => e.id === id && e.revision === revision); if (!e) throw new Error("Saved revision is unavailable"); return JSON.stringify(e, null, 2) }
  exportDraft() { const s = this.options.controller.getSnapshot(); return JSON.stringify({ schema: "studio-direction-draft/1", product: this.options.declaration.product, payloadSchema: this.options.declaration.payloadSchema, payload: s.values, inputProblems: s.inputProblems, label: this.state.draftLabel ?? "Unsaved draft", base: { id: s.id, revision: s.savedRevision } }, null, 2) }
  private refreshPins() { this.publish({ pins: [{ key: "source", label: "Original source", basis: "source", id: "direction.source", revision: 0 }, ...this.state.journal.revisions.map(e => ({ key: savedDirectionKey(e), label: `${e.label} · saved r${e.revision}`, basis: "saved" as const, id: e.id, revision: e.revision })), ...[...this.frozenPins.values()].filter(p => p.pin.basis === "draft").map(p => p.pin)] }) }
  async pinDraft() { try { if (this.state.selectionProblem) throw new Error("Choose an available direction before pinning"); const c = this.options.controller.captureSave(); const receipt = await this.receipt(c.values, c.compiled, "compare"); const pin: DirectionPin = { key: unique("draft"), id: c.id, revision: c.draftRevision, basis: "draft", label: `${this.state.draftLabel ?? "Working draft"} · pinned draft r${c.draftRevision}` }; this.ownedPinKeys.add(pin.key); this.frozenPins.set(pin.key, { pin, product: clone(this.options.declaration.product), payloadSchema: this.options.declaration.payloadSchema, values: c.values, compiled: c.compiled, receipt }); this.refreshPins(); this.publish({ message: `Pinned working draft revision ${c.draftRevision} independently for Compare.` }); this.persist(); return pin.key } catch (e) { this.publish({ message: errorText(e) }); return undefined } }
  async resolvePin(key: string) {
    const cached = this.frozenPins.get(key); if (cached?.compiled || cached?.reason) return
    const pin = this.state.pins.find(p => p.key === key)
    if (!pin) return
    let values: JsonValue | undefined = cached?.values; let expected: DirectionReceipt | undefined = cached?.receipt
    try {
      if (cached) { if (!cached.product || !cached.payloadSchema) throw new Error("Pinned draft has unsupported product/schema metadata; original snapshot is kept"); const decoded = this.decode(cached.payloadSchema, cached.values, cached.product); if (decoded.migratedFrom || directionJSON(decoded.payload) !== directionJSON(cached.values)) throw new Error("Pinned draft requires migration; immutable original snapshot is kept"); values = decoded.payload! }
      else if (pin.basis === "source") values = this.options.controller.getSnapshot().originalValues
      else { const e = this.state.journal.revisions.find(e => savedDirectionKey(e) === key)!; values = this.decode(e.payloadSchema, e.payload, e.product).payload!; expected = e.receipt }
      const compiled = await this.options.controller.compileSnapshot(values!); const receipt = await this.receipt(values!, compiled, "compare"); if (pin.basis !== "source") this.verifyReceipt(expected, receipt)
      this.frozenPins.set(key, { pin, product: cached?.product, payloadSchema: cached?.payloadSchema, values: clone(values!), receipt, compiled }); this.publish({})
    } catch (e) { this.frozenPins.set(key, cached ? { ...cached, reason: errorText(e) } : { pin, values: values ?? null, receipt: expected ?? { compiler: { id: "unavailable", version: "0" }, fingerprints: {} }, reason: errorText(e) }); this.publish({}) }
  }
  private async retryFailedPins() {
    const keys = [...this.frozenPins.entries()].filter(([, pin]) => pin.reason).map(([key]) => key)
    for (const key of keys) { const pin = this.frozenPins.get(key)!; delete pin.reason; await this.resolvePin(key) }
  }
  projection(key: string, theme: string): DirectionProjection {
    const p = this.frozenPins.get(key); if (!p) return { reason: this.state.pins.some(p => p.key === key) ? "Compiling pinned direction…" : "Pinned direction/revision is unavailable; nothing was substituted" }
    const output = p.compiled?.[theme]; if (!output) return { reason: p.reason ?? "This pin has no compiled output for the selected theme" }
    return { output, identity: { channel: "saved", id: p.pin.id, savedRevision: p.pin.basis === "saved" ? p.pin.revision : 0, draftRevision: p.pin.basis === "draft" ? p.pin.revision : 0, requestedRevision: p.pin.revision, fingerprint: output.fingerprint, sourceLockId: output.sourceLockId, basis: p.pin.basis } }
  }
}
