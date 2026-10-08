import type { ComponentType } from "react"
import type { CompiledDesign, DesignCompilerDescriptor, DesignCompilerModule, JsonValue } from "../design-runtime"
import type { DesignController } from "./controller"

export const DESIGN_EDITOR_VERSION = "studio-design-editor/1" as const
export const DESIGN_CONTROLLER_VERSION = "studio-design-controller/1" as const
export type DesignEditorDeclaration = {
  schema: typeof DESIGN_EDITOR_VERSION
  id: string
  version: string
  controllerSchema: typeof DESIGN_CONTROLLER_VERSION
  slots: ("foundation" | "component")[]
  capabilities: ("edit" | "reset" | "history" | "inheritance" | "diagnostics")[]
}
/** Semantic product identity, never a CSS selector. The private model validates exact supported tuples. */
export type DesignTarget = { component: string; variant?: string; part?: string; state?: string; property?: string }
export type DesignScope = { themes: readonly string[] }
export type DesignEdit = { controlId: string; value: JsonValue; scope: DesignScope; target?: DesignTarget; kind?: string }
export type DesignReset = { basis: "inherited" | "saved" | "original"; controlId?: string; scope: DesignScope; target?: DesignTarget }
export type DesignProblem = { id: string; message: string; raw?: string; controlId?: string; severity: "warning" | "error"; blocks?: ("preview" | "save" | "export")[] }
export type DesignReadout = {
  effective: JsonValue; inherited: JsonValue; override: JsonValue | null
  sourceScope: string; themeScope: DesignScope; linked: boolean
  reach: { id: string; label: string; status: "supported" | "partial" | "unavailable"; reason?: string }[]
  diagnostics: DesignProblem[]
}
/** Product-owned pure semantics. Panels emit intents; only this model changes canonical payloads. */
export type DesignModel = {
  initial: JsonValue
  validate(values: JsonValue): DesignProblem[]
  edit(values: JsonValue, intent: DesignEdit): JsonValue
  reset(values: JsonValue, request: DesignReset, bases: { saved: JsonValue; original: JsonValue }): JsonValue
  readout(values: JsonValue, context: { controlId: string; scope: DesignScope; target?: DesignTarget }): DesignReadout
}
export type DesignRuntimeModule = DesignCompilerModule & { model: DesignModel }
/** Review navigation is UI context only, never direction data or controller history. */
export type DesignReviewContext = {
  readonly scenarioId: string
  readonly scenarios: readonly { readonly id: string; readonly label: string }[]
  selectScenario(id: string): void
}
export type DesignPanelProps = { controller: DesignController; component?: string; review: DesignReviewContext }
export type DesignEditorModule = {
  capabilities: DesignEditorDeclaration["capabilities"]
  schema: typeof DESIGN_EDITOR_VERSION; id: string; version: string
  Foundation?: ComponentType<DesignPanelProps>
  Component?: ComponentType<DesignPanelProps>
}
export type DesignEditorLoaders = Record<string, () => Promise<DesignEditorModule>>
export type CompiledThemes = Readonly<Record<string, CompiledDesign>>
export type DesignPreviewIdentity = {
  channel: "working" | "saved"
  id: string; savedRevision: number; draftRevision: number; requestedRevision: number
  fingerprint: string; sourceLockId?: string; basis: "source" | "saved" | "draft" | "last-valid"
}
export type DesignSnapshot = {
  id: string; savedRevision: number; draftRevision: number; compiledRevision: number; inputEpoch: number
  values: JsonValue; savedValues: JsonValue; originalValues: JsonValue
  scope: DesignScope; target?: DesignTarget
  status: "pending" | "ready" | "invalid" | "error"
  problems: readonly DesignProblem[]; inputProblems: Readonly<Record<string, DesignProblem>>
  compiled: CompiledThemes; savedCompiled: CompiledThemes
  dirty: boolean; previewPending: boolean; canUndo: boolean; canRedo: boolean; canSave: boolean; canExport: boolean
}
export type DesignSaveCandidate = { readonly id: string; readonly baseSavedRevision: number; readonly draftRevision: number; readonly values: JsonValue; readonly compiled: CompiledThemes }
export type DesignControllerOptions = { capabilities?: DesignEditorDeclaration["capabilities"]; compiler: DesignCompilerDescriptor; runtime: DesignRuntimeModule; themes: readonly string[]; id?: string; savedRevision?: number }
