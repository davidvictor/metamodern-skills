/*
 * The import boundary for workspace modules (references/workspace.md): files under src/workspace/, and
 * the starter's example/workspace/, import only @studio/kit, @studio/workspace, React and their own files,
 * so shell internals stay free to change. eslint.config.js applies the rule; node tests call
 * workspaceImportProblem and createWorkspaceBoundary directly.
 */
import path from "node:path"

const ALLOWED = new Set(["react", "react/jsx-runtime", "@studio/kit", "@studio/workspace"])
const ROOTS = ["src/workspace", "example/workspace"]
/** The Studio root: this file lives in its scripts/ folder, wherever ESLint is run from. */
const STUDIO_ROOT = path.resolve(import.meta.dirname, "..")
const NOT_LITERAL = "A workspace module may not use an import() whose target is not a string literal: the workspace boundary cannot check it."

/** Why a workspace file may not import `source`, or null when it may. `cwd` is the Studio root. */
export function workspaceImportProblem(filename, source, cwd) {
  if (ALLOWED.has(source)) return null
  const rel = (p) => path.relative(cwd, p).split(path.sep).join("/")
  const file = rel(filename)
  const root = ROOTS.find((r) => file === r || file.startsWith(`${r}/`)) ?? "src/workspace"
  // Every form is normalized, so "@/workspace/../store" names src/store, not a workspace file. A leading
  // "/" is the Studio root, as Vite reads it.
  const target = source.startsWith(".")
    ? rel(path.resolve(path.dirname(filename), source))
    : source.startsWith("@/")
      ? path.posix.normalize(`src/${source.slice(2)}`)
      : source.startsWith("/")
        ? path.posix.normalize(source.slice(1))
        : null
  if (target && (target === root || target.startsWith(`${root}/`))) return null
  return `${source} is outside the workspace boundary. Workspace modules import only @studio/kit, @studio/workspace, React and their own files under ${root}/.`
}

/** The target when it is written as a string, or null when it is computed. */
const literalSource = (node) => {
  if (!node) return null
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  return null
}

const isGlobCall = (node) => {
  const c = node.callee
  return c?.type === "MemberExpression" && !c.computed && c.property?.name === "glob" && c.object?.type === "MetaProperty" && c.object.meta?.name === "import" && c.object.property?.name === "meta"
}

/** The boundary plugin for a Studio rooted at `root`; tests pass their own root. */
export function createWorkspaceBoundary(root = STUDIO_ROOT) {
  return {
    meta: { name: "studio-workspace-boundary" },
    rules: {
      imports: {
        meta: { type: "problem", docs: { description: "Workspace modules import only @studio/kit, @studio/workspace, React and their own files" }, schema: [] },
        create(context) {
          const checkSource = (node, source) => {
            const problem = workspaceImportProblem(context.filename, source, root)
            if (problem) context.report({ node, message: problem })
          }
          const check = (node) => {
            if (!node.source) return
            const source = literalSource(node.source)
            // Only import() takes a computed target; the boundary cannot check it, so it is refused.
            if (source === null) return context.report({ node: node.source, message: NOT_LITERAL })
            checkSource(node.source, source)
          }
          // import.meta.glob("pattern" | ["pattern", "!negated"], { base }): every pattern stays inside the boundary.
          const glob = (node) => {
            if (!isGlobCall(node)) return
            const [patterns, options] = node.arguments
            const list = patterns?.type === "ArrayExpression" ? patterns.elements : [patterns]
            let base = null
            const baseProp = options?.type === "ObjectExpression" ? options.properties.find((p) => p.type === "Property" && !p.computed && (p.key?.name ?? p.key?.value) === "base") : null
            if (options && options.type !== "ObjectExpression") return context.report({ node: options, message: NOT_LITERAL })
            if (baseProp) {
              base = literalSource(baseProp.value)
              if (base === null) return context.report({ node: baseProp.value, message: NOT_LITERAL })
              checkSource(baseProp.value, base)
            }
            for (const element of list) {
              const pattern = literalSource(element)
              if (pattern === null) {
                context.report({ node: element ?? node, message: NOT_LITERAL })
                continue
              }
              const bare = pattern.replace(/^!/, "")
              checkSource(element, base && !bare.startsWith("/") && !bare.startsWith("@/") ? `${base.replace(/\/+$/, "")}/${bare}` : bare)
            }
          }
          // type T = import("../x").T. typescript-eslint has written the target as argument.literal and as source.
          const importType = (node) => {
            const target = node.source ?? node.argument?.literal ?? node.argument
            const source = literalSource(target)
            if (source === null) return context.report({ node: target ?? node, message: NOT_LITERAL })
            checkSource(target, source)
          }
          return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check, CallExpression: glob, TSImportType: importType }
        },
      },
    },
  }
}

export const workspaceBoundary = createWorkspaceBoundary()
