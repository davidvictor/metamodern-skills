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

const ID = /^[a-z][a-z0-9-]*$/
const OPERATION = /^[a-z][a-z0-9.-]*$/

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
