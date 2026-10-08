import type { DesignModel } from "./design-ui/types"
/** Generic opt-in compiler contract; private implementation and rich Design panels belong to the product. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type DesignCompilerDescriptor = {
  schema: "studio-design-compiler/1"
  id: string
  version: string
  sourceLockId?: string
  inputSchema: string
  outputSchema: "studio-compiled-design/1"
}
export const COMPILED_DATA_MAX_BYTES = 256 * 1024
export type CompiledDesign = {
  /** Opaque product snapshot. Shell transport and generic exporters never interpret it. */
  data?: JsonValue
  schema: "studio-compiled-design/1"
  compiler: { id: string; version: string }
  fingerprint: string
  sourceLockId?: string
  tokens: Record<string, string>
  scoped?: Record<string, Record<string, string>>
  css: string
  stylesheets: string[]
  diagnostics?: { id: string; label: string; status: "ok" | "warning" | "error"; message: string }[]
}
export type CompileDesignInput = { direction: JsonValue; theme: string; sourceLockId?: string }
export type DesignCompilerModule = { model?: DesignModel; compile(input: CompileDesignInput): CompiledDesign | Promise<CompiledDesign> }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const strings = (value: unknown) => record(value) && Object.values(value).every(v => typeof v === "string")
function dataOnly(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || !value || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value) ? value.every(v => dataOnly(v, seen)) : record(value) && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(v => dataOnly(v, seen))
  seen.delete(value)
  return valid
}
export function validateCompiledDesign(descriptor: DesignCompilerDescriptor, value: unknown): string[] {
  if (!dataOnly(value) || !record(value)) return ["Compiled design must contain JSON data only"]
  const problems: string[] = []
  if (value.data !== undefined && new TextEncoder().encode(JSON.stringify(value.data)).byteLength > COMPILED_DATA_MAX_BYTES) problems.push("Compiled data exceeds 256 KB")
  if (value.schema !== descriptor.outputSchema) problems.push("Compiled design schema does not match the descriptor")
  if (!record(value.compiler) || value.compiler.id !== descriptor.id || value.compiler.version !== descriptor.version) problems.push("Compiler identity does not match the descriptor")
  if (descriptor.sourceLockId && value.sourceLockId !== descriptor.sourceLockId) problems.push("Source lock does not match the descriptor")
  if (typeof value.fingerprint !== "string" || !value.fingerprint.trim()) problems.push("Compiled fingerprint is required")
  if (!strings(value.tokens)) problems.push("Compiled tokens must be string values")
  if (value.scoped !== undefined && (!record(value.scoped) || !Object.values(value.scoped).every(strings))) problems.push("Scoped tokens must be string maps")
  if (typeof value.css !== "string") problems.push("Compiled CSS must be a string")
  if (!Array.isArray(value.stylesheets) || !value.stylesheets.every(v => typeof v === "string")) problems.push("Stylesheets must be string URLs")
  if (value.diagnostics !== undefined && (!Array.isArray(value.diagnostics) || !value.diagnostics.every(v => record(v) && ["id", "label", "message"].every(k => typeof v[k] === "string") && ["ok", "warning", "error"].includes(String(v.status))))) problems.push("Diagnostics are invalid")
  return problems
}

/** Load only an explicitly registered product compiler; mismatched source/identity fails closed. */
export async function compileDesign(descriptor: DesignCompilerDescriptor, loaders: Record<string, () => Promise<DesignCompilerModule>>, input: CompileDesignInput): Promise<CompiledDesign> {
  if (!dataOnly(descriptor) || descriptor.schema !== "studio-design-compiler/1" || !descriptor.id || !descriptor.version || !descriptor.inputSchema || descriptor.outputSchema !== "studio-compiled-design/1") throw new Error("Invalid compiler descriptor")
  if (!dataOnly(input.direction)) throw new Error("Direction must contain JSON data only")
  if (descriptor.sourceLockId && input.sourceLockId !== descriptor.sourceLockId) throw new Error("Direction source lock does not match compiler")
  const load = Object.hasOwn(loaders, descriptor.id) ? loaders[descriptor.id] : undefined
  if (typeof load !== "function") throw new Error(`No product compiler registered for ${descriptor.id}`)
  const compilerModule = await load()
  const compiled = await compilerModule.compile(input)
  const problems = validateCompiledDesign(descriptor, compiled)
  if (problems.length) throw new Error(problems.join("; "))
  return compiled
}

export const isJsonValue = dataOnly
