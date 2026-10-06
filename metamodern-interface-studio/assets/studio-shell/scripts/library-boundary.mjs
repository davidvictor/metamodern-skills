/*
 * The import boundary for component documentation (references/library.md): files under src/library/, and the
 * starter's example/library/ documentation, import only @studio/library and their own files. Documentation is data,
 * so nothing else (React, the kit, shell internals, other packages) reaches it. eslint.config.js applies the rule;
 * node tests call libraryImportProblem and createLibraryBoundary directly.
 */
import path from "node:path"

const ROOTS = ["src/library", "example/library"]
/** The Studio root: this file lives in its scripts/ folder, wherever ESLint is run from. */
const STUDIO_ROOT = path.resolve(import.meta.dirname, "..")
const NOT_LITERAL = "Documentation may not use an import() whose target is not a string literal: the library boundary cannot check it."
const NO_GLOB = "Documentation may not use import.meta.glob: list each component's loader in src/library/index.ts."

/** Why a documentation file may not import `source`, or null when it may. `cwd` is the Studio root. */
export function libraryImportProblem(filename, source, cwd) {
  if (source === "@studio/library") return null
  const rel = (p) => path.relative(cwd, p).split(path.sep).join("/")
  const file = rel(filename)
  const root = ROOTS.find((r) => file === r || file.startsWith(`${r}/`)) ?? "src/library"
  const target = source.startsWith(".")
    ? rel(path.resolve(path.dirname(filename), source))
    : source.startsWith("@/")
      ? path.posix.normalize(`src/${source.slice(2)}`)
      : source.startsWith("/")
        ? path.posix.normalize(source.slice(1))
        : null
  if (target && (target === root || target.startsWith(`${root}/`))) return null
  return `${source} is outside the library boundary. Documentation imports only @studio/library and its own files under ${root}/.`
}

/** Why a documentation file may not exist as it is named, or null: documentation is data, so .ts, .js or .mjs, never JSX. */
export function libraryFileProblem(filename) {
  return /\.(tsx|jsx)$/.test(filename) ? `${path.basename(filename)} is a JSX file. Documentation is data: write it as .ts or .js against @studio/library, with no components.` : null
}

/** The target when it is written as a string, or null when it is computed. */
const literalSource = (node) => {
  if (!node) return null
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  return null
}

/** The boundary plugin for a Studio rooted at `root`; tests pass their own root. */
export function createLibraryBoundary(root = STUDIO_ROOT) {
  return {
    meta: { name: "studio-library-boundary" },
    rules: {
      files: {
        meta: { type: "problem", docs: { description: "Documentation files are .ts or .js data, never JSX" }, schema: [] },
        create(context) {
          return {
            Program(node) {
              const problem = libraryFileProblem(context.filename)
              if (problem) context.report({ node, message: problem })
            },
          }
        },
      },
      imports: {
        meta: { type: "problem", docs: { description: "Documentation imports only @studio/library and its own files" }, schema: [] },
        create(context) {
          const checkSource = (node, source) => {
            const problem = libraryImportProblem(context.filename, source, root)
            if (problem) context.report({ node, message: problem })
          }
          const check = (node) => {
            if (!node.source) return
            const source = literalSource(node.source)
            if (source === null) return context.report({ node: node.source, message: NOT_LITERAL })
            checkSource(node.source, source)
          }
          const glob = (node) => {
            const c = node.callee
            if (c?.type === "MemberExpression" && !c.computed && c.property?.name === "glob" && c.object?.type === "MetaProperty") context.report({ node, message: NO_GLOB })
          }
          // type T = import("../x").T, in either typescript-eslint shape.
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

export const libraryBoundary = createLibraryBoundary()
