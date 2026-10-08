/*
 * The dev server's endpoint for a saved file at the Studio root (layouts.json, scenarios.json), mounted by
 * vite.config.ts; node tests mount it directly, so it imports Node only. GET answers the file; POST replaces the
 * whole file: same-origin JSON only, schema-checked, at most maxBytes, written atomically. 403 another origin,
 * 415 not JSON, 413 too large, 400 unreadable, 422 invalid (the contract is in the skill's shell.md, so another
 * host can implement it).
 *
 * Revisions: GET and a successful POST answer x-studio-revision, a hash of the file as stored ("empty" when there
 * is none). A POST that sends x-studio-expected-revision is written only while the file still has that revision;
 * otherwise 409 with the current file (null when it is not JSON) and its revision, and nothing is written. Without
 * the header a legacy POST writes unconditionally. Journal callers requireRevision (428 when missing), supply
 * an empty journal factory and validateTransition to enforce immutable history. These callers fail closed (500)
 * on filesystem, JSON or schema errors and never substitute empty data for an unreadable current journal. A GET of a file that is not JSON answers the empty
 * file, as before, with x-studio-unreadable: 1, so a Studio refuses to save over it.
 */
import { createHash, randomUUID } from "node:crypto"
import { readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"

export type SavedFileOptions = { file: string; schema: string; list: string; maxBytes: number; validate: (data: unknown) => string[]; forbidden: string; tooBig: string; route?: string; empty?: () => unknown; requireRevision?: boolean; validateTransition?: (previous: unknown, next: unknown) => string[] }

export const EMPTY_REVISION = "empty"
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")

/**
 * The file's revision and contents: the empty file when it is missing, and parsed false when it is not JSON (for
 * example a merge left conflict markers in it), so a conflict never presents an unreadable file as an empty list.
 */
function current(file: string, empty: () => unknown, strict = false) {
  let bytes: Buffer
  try {
    bytes = readFileSync(file)
  } catch (error) {
    if (strict && (error as NodeJS.ErrnoException).code !== "ENOENT") return { revision: undefined, data: null, parsed: false, error: true }
    return { revision: EMPTY_REVISION, data: empty(), parsed: true }
  }
  try {
    return { revision: hash(bytes), data: JSON.parse(bytes.toString("utf8")) as unknown, parsed: true }
  } catch {
    return { revision: hash(bytes), data: null, parsed: false }
  }
}

/** Build/dev bootstrap never imports a product journal as an executable JSON module. */
export function savedFileSnapshot(o: Pick<SavedFileOptions, "file" | "validate" | "maxBytes">): unknown {
  try {
    const bytes = readFileSync(o.file)
    if (bytes.length > o.maxBytes) throw new Error("Journal exceeds its byte budget")
    const data: unknown = JSON.parse(bytes.toString("utf8"))
    if (o.validate(data).length) throw new Error("Invalid journal schema")
    return data
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    return { schema: "studio-saved-file-unavailable/1", error: `Could not read a valid ${path.basename(o.file)}. The original file is preserved.` }
  }
}

/**
 * The request handler for one saved file. `file` is its absolute path; `schema`, `list`, `maxBytes`, `validate`
 * (data => problems), `forbidden` and `tooBig` come from the Studio's settings for that file.
 */
export function savedFileMiddleware(o: SavedFileOptions) {
  const name = path.basename(o.file)
  const empty = o.empty ?? (() => ({ schema: o.schema, [o.list]: [] }))
  const strict = !!o.requireRevision || !!o.validateTransition
  const checked = (validate: () => string[]) => {
    try { return validate() } catch (error) {
      if (!strict) throw error
      return [error instanceof Error ? `Validation failed: ${error.message}` : "Validation failed"]
    }
  }
  const read = () => {
    try { return current(o.file, empty, strict) } catch (error) {
      if (!strict) throw error
      return { revision: undefined, data: null, parsed: false }
    }
  }
  const unreadable = (now: ReturnType<typeof read>) => !now.parsed || (strict && checked(() => o.validate(now.data)).length > 0)
  return (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, body: unknown, revision?: string, unreadable = false) => {
      if (res.writableEnded) return
      res.statusCode = code
      res.setHeader("content-type", "application/json")
      if (revision) res.setHeader("x-studio-revision", revision)
      if (unreadable) res.setHeader("x-studio-unreadable", "1")
      try { res.end(JSON.stringify(body)) } catch (error) {
        if (!strict) throw error
        res.statusCode = 500
        res.setHeader("x-studio-unreadable", "1")
        res.end(JSON.stringify({ error: `Could not serialize ${name}; nothing was written` }))
      }
    }
    const requestPath = (req.url ?? "").split("?")[0]
    if (o.route && requestPath !== o.route && requestPath !== "/" && requestPath !== "") return send(404, { error: "Unknown saved file" })
    if (req.method === "GET") {
      // An unreadable file reads as the empty file, as before revisions, and says so in a header.
      const now = read()
      if (strict && unreadable(now)) return send(500, { error: `Could not read a valid ${name}` }, now.revision, true)
      return send(200, now.parsed ? now.data : empty(), now.revision, !now.parsed)
    }
    if (req.method !== "POST") return send(405, { error: "Use GET or POST" })
    const origin = req.headers.origin
    const sameOrigin = (() => {
      try {
        const protocol = (req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https:" : "http:"
        return !!origin && new URL(origin).origin === `${protocol}//${req.headers.host}`
      } catch {
        return false
      }
    })()
    if (!sameOrigin) return send(403, { error: o.forbidden })
    if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(415, { error: "Send JSON" })
    const expected = req.headers["x-studio-expected-revision"]
    if (o.requireRevision && (typeof expected !== "string" || !expected.trim())) return send(428, { error: "Load the current file revision before saving" })
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > o.maxBytes) {
        send(413, { error: o.tooBig })
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => {
      if (res.writableEnded) return
      let data: unknown
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"))
      } catch {
        return send(400, { error: "Not valid JSON" })
      }
      const problems = checked(() => o.validate(data))
      if (problems.length) return send(422, { error: `Not a valid ${o.schema} file`, problems })
      // Read and written in one synchronous step, so no other save through this server can land between the check and the write.
      const now = read()
      if (strict && unreadable(now)) return send(500, { error: `Could not read a valid ${name}; nothing was written` }, now.revision, true)
      if (typeof expected === "string") {
        if (now.revision !== expected) {
          return send(409, { ok: false, error: { code: "conflict", reason: `${name} changed since you loaded it`, recoverable: true }, current: { data: now.parsed ? now.data : null, revision: now.revision } }, now.revision)
        }
      }
      const transitionProblems = checked(() => o.validateTransition?.(now.data, data) ?? [])
      if (transitionProblems.length) return send(422, { error: "Saved revisions are immutable", problems: transitionProblems })
      let text: string
      try { text = `${JSON.stringify(data, null, 2)}\n` } catch (error) {
        if (!strict) throw error
        return send(422, { error: "Journal could not be serialized; nothing was written" })
      }
      const tmp = `${o.file}.${process.pid}.${randomUUID()}.tmp`
      try {
        if (o.requireRevision) mkdirSync(path.dirname(o.file), { recursive: true })
        writeFileSync(tmp, text)
        renameSync(tmp, o.file)
      } catch (e) {
        try { rmSync(tmp, { force: true }) } catch { /* Preserve the original write failure. */ }
        return send(500, { error: `Could not write ${name}: ${e instanceof Error ? e.message : String(e)}` })
      }
      send(200, { ok: true }, hash(Buffer.from(text, "utf8")))
    })
  }
}

/** Fetch transport for Next development routes, sharing the exact Node middleware transaction. */
export async function savedFileRequest(o: SavedFileOptions, request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const authority = request.headers.get("host") ?? requestUrl.host
  if (request.method === "POST" && request.headers.get("origin") !== `${requestUrl.protocol}//${authority}`) return Response.json({ error: o.forbidden }, { status: 403 })
  // Check the streamed byte budget before buffering; Content-Length is not trusted.
  const body: Buffer[] = []
  if (request.body) {
    const reader = request.body.getReader()
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > o.maxBytes) { await reader.cancel(); return Response.json({ error: o.tooBig }, { status: 413 }) }
      body.push(Buffer.from(part.value))
    }
  }
  const { Readable } = await import("node:stream")
  const req = Readable.from(body) as IncomingMessage
  req.method = request.method
  req.headers = Object.fromEntries(request.headers)
  // Next can normalize request.url to localhost; the incoming Host remains the HTTP authority. Never trust forwarded host.
  req.headers.host = authority
  req.socket = { encrypted: new URL(request.url).protocol === "https:" } as unknown as IncomingMessage["socket"]
  return new Promise(resolve => {
    const headers = new Headers()
    const responseState = {
      writableEnded: false, statusCode: 200,
      setHeader(name: string, value: string) { headers.set(name, value) },
      end(bytes: string) { this.writableEnded = true; resolve(new Response(bytes, { status: this.statusCode, headers })) },
    }
    savedFileMiddleware(o)(req, responseState as unknown as ServerResponse)
  })
}

/** Reserved saved-file routes never accept inherited object properties. */
export function isSavedFileName(file: string): file is "layouts" | "scenarios" | "directions" {
  return file === "layouts" || file === "scenarios" || file === "directions"
}
