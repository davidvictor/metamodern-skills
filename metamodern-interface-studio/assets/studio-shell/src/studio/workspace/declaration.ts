/*
 * The workspace declaration read as data: which modules exist, why one cannot open, and whether the
 * module file and the adapter agree. Pure (types-only imports), so vite.config.ts and node tests load it.
 */
import type { StudioIcon, WorkspaceDeclaration, WorkspaceOperationUse } from "../types"

export const NO_OPERATIONS = "This Studio declares no operations host (workspace.operations in the adapter), so its modules cannot reach the product."
export const noComponent = (id: string) => `No component for the "${id}" module in src/workspace/index.ts. Add one with defineWorkspace.`

export type ResolvedModule = {
  id: string
  label: string
  icon: StudioIcon
  sections: { id: string; label: string }[]
  uses: WorkspaceOperationUse[]
  /** Why the module cannot open, when it cannot. */
  unavailable?: string
}

/**
 * Modules in declaration order with the first reason each cannot open: a declared reason, then a missing
 * operations host, then a missing component. `defined` is the module IDs src/workspace/index.ts defines,
 * or null before that file has loaded.
 */
export function resolveModules(decl: WorkspaceDeclaration | undefined, defined: string[] | null): ResolvedModule[] {
  if (!decl) return []
  return decl.modules.map((m) => ({
    id: m.id,
    label: m.label,
    icon: m.icon,
    sections: m.sections ?? [],
    uses: m.uses,
    unavailable: m.unavailable ?? (!decl.operations ? NO_OPERATIONS : defined && !defined.includes(m.id) ? noComponent(m.id) : undefined),
  }))
}

/** Module IDs src/workspace/index.ts defines that the adapter does not declare. The build fails on any. */
export function undeclaredDefinitions(decl: WorkspaceDeclaration | undefined, defined: string[]) {
  const declared = new Set((decl?.modules ?? []).map((m) => m.id))
  return defined.filter((id) => !declared.has(id))
}

type AstNode = { type?: string; [key: string]: unknown }
type AstProperty = { type?: string; computed?: boolean; key?: { type?: string; name?: string; value?: unknown } }

/** The parser language for a workspace module map by its extension: TSX, TypeScript, or JavaScript with JSX. */
export function astLang(file: string): "tsx" | "ts" | "jsx" {
  if (/\.tsx$/i.test(file)) return "tsx"
  if (/\.[mc]?ts$/i.test(file)) return "ts"
  return "jsx"
}

/**
 * The module IDs src/workspace/index.ts passes to defineWorkspace, read from its parsed ESTree program
 * (vite.config.ts parses it with parseAst), or why they cannot be read. The build fails on a reason.
 */
export function definedModules(program: unknown): string[] | string {
  const found: { ids: string[] | null; problem: string | null } = { ids: null, problem: null }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || found.problem) return
    if (Array.isArray(node)) return node.forEach(visit)
    const n = node as AstNode & { callee?: { type?: string; name?: string }; arguments?: unknown[] }
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && n.callee.name === "defineWorkspace") {
      if (found.ids) {
        found.problem = "defineWorkspace is called more than once; define every module in one call"
        return
      }
      const arg = n.arguments?.[0] as { type?: string; properties?: AstProperty[] } | undefined
      if (arg?.type !== "ObjectExpression") {
        found.problem = "defineWorkspace takes an object literal of module IDs"
        return
      }
      found.ids = []
      for (const p of arg.properties ?? []) {
        if (p.type !== "Property" || p.computed || !p.key || (p.key.type !== "Identifier" && typeof p.key.value !== "string")) {
          found.problem = "defineWorkspace keys must be plain module IDs, without spreads or computed keys"
          return
        }
        found.ids.push(p.key.type === "Identifier" ? String(p.key.name) : String(p.key.value))
      }
    }
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value)
  }
  visit(program)
  return found.problem ?? found.ids ?? "the file does not call defineWorkspace"
}

const ID = /^[a-z][a-z0-9-]*$/
/** Operation names: lowercase letters, digits, dots and hyphens. operations.ts keeps the same pattern to refuse other names at runtime. */
export const OPERATION = /^[a-z][a-z0-9.-]*$/

/** Problems with the declaration itself. The build fails on any. */
export function workspaceProblems(decl: WorkspaceDeclaration | undefined) {
  if (!decl) return []
  const out: string[] = []
  const modules = new Set<string>()
  for (const m of decl.modules) {
    if (!ID.test(m.id)) out.push(`Module ID "${m.id}" must be lowercase letters, digits and hyphens`)
    if (modules.has(m.id)) out.push(`Module ID "${m.id}" is declared twice`)
    modules.add(m.id)
    const sections = new Set<string>()
    for (const s of m.sections ?? []) {
      if (!ID.test(s.id)) out.push(`Section ID "${m.id}/${s.id}" must be lowercase letters, digits and hyphens`)
      if (sections.has(s.id)) out.push(`Section ID "${m.id}/${s.id}" is declared twice`)
      sections.add(s.id)
    }
    const names = new Set<string>()
    for (const u of m.uses) {
      if (!OPERATION.test(u.name)) out.push(`Operation "${u.name}" in "${m.id}" must be lowercase letters, digits, dots and hyphens`)
      if (names.has(u.name)) out.push(`Operation "${u.name}" is listed twice in "${m.id}"`)
      names.add(u.name)
    }
  }
  return out
}
