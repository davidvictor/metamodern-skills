/*
 * The import boundary for workspace modules (references/workspace.md): files under src/workspace/, and
 * the starter's example/workspace/, import only @studio/kit, @studio/workspace, React and their own files,
 * so shell internals stay free to change. eslint.config.js applies the rule; node tests call
 * workspaceImportProblem directly.
 */
import path from "node:path"

const ALLOWED = new Set(["react", "react/jsx-runtime", "@studio/kit", "@studio/workspace"])
const ROOTS = ["src/workspace", "example/workspace"]

/** Why a workspace file may not import `source`, or null when it may. `cwd` is the Studio root. */
export function workspaceImportProblem(filename, source, cwd) {
  if (ALLOWED.has(source)) return null
  const rel = (p) => path.relative(cwd, p).split(path.sep).join("/")
  const file = rel(filename)
  const root = ROOTS.find((r) => file === r || file.startsWith(`${r}/`)) ?? "src/workspace"
  // Both forms are normalized, so "@/workspace/../store" names src/store, not a workspace file.
  const target = source.startsWith(".") ? rel(path.resolve(path.dirname(filename), source)) : source.startsWith("@/") ? path.posix.normalize(`src/${source.slice(2)}`) : null
  if (target && (target === root || target.startsWith(`${root}/`))) return null
  return `${source} is outside the workspace boundary. Workspace modules import only @studio/kit, @studio/workspace, React and their own files under ${root}/.`
}

/** The import target when it is written as a string, or null when it is computed. */
const literalSource = (node) => {
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  return null
}

export const workspaceBoundary = {
  meta: { name: "studio-workspace-boundary" },
  rules: {
    imports: {
      meta: { type: "problem", docs: { description: "Workspace modules import only @studio/kit, @studio/workspace, React and their own files" }, schema: [] },
      create(context) {
        const check = (node) => {
          if (!node.source) return
          const source = literalSource(node.source)
          if (source === null) {
            // Only import() takes a computed target; the boundary cannot be checked, so it is refused.
            context.report({ node: node.source, message: "A workspace module may not use an import() whose target is not a string literal: the workspace boundary cannot check it." })
            return
          }
          const problem = workspaceImportProblem(context.filename, source, context.cwd)
          if (problem) context.report({ node: node.source, message: problem })
        }
        return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check }
      },
    },
  },
}
