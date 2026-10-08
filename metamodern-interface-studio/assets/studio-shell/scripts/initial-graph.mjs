/** Measure every statically required initial JS resource, not one arbitrarily split chunk. */
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { gzipSync } from "node:zlib"

export function initialScriptGraph(directory, parseAst) {
  const root = resolve(directory), seen = new Set()
  const local = (specifier, base, html = false) => {
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(specifier) || !html && !/^[./]/.test(specifier)) throw Error(`Unmeasurable initial JavaScript import: ${specifier}`)
    const pathname = decodeURIComponent(specifier.split(/[?#]/)[0])
    const file = pathname.startsWith("/") ? resolve(root, "." + pathname) : resolve(base, pathname)
    const within = relative(root, file)
    if (within === ".." || within.startsWith("../") || isAbsolute(within)) throw Error("Initial JavaScript leaves the build output")
    return file
  }
  const visit = file => {
    if (seen.has(file)) return
    seen.add(file)
    for (const statement of parseAst(readFileSync(file, "utf8")).body) {
      if (!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(statement.type) || !statement.source) continue
      visit(local(statement.source.value, dirname(file)))
    }
  }
  const html = readFileSync(resolve(root, "index.html"), "utf8")
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    if (/^<link/i.test(tag) && !/\brel=["']modulepreload["']/i.test(tag)) continue
    const source = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1]
    if (source && /\.m?js(?:[?#]|$)/.test(source)) visit(local(source, root, true))
  }
  const scripts = [...seen].sort().map(file => {
    const bytes = readFileSync(file)
    return { file: relative(root, file).split("\\").join("/"), gzip: gzipSync(bytes).length, sha256: createHash("sha256").update(bytes).digest("hex") }
  })
  return { scripts, gzip: scripts.reduce((sum, script) => sum + script.gzip, 0) }
}
