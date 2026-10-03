/*
 * The example workspace's operations host, for `VITE_STUDIO_ADAPTER=workspace npm run dev` and the
 * acceptance suite. It keeps synthetic settings in memory and implements the operation contract in the
 * skill's references/workspace.md: same-origin JSON POSTs, one envelope and compare-and-set writes. A real
 * host lives in the product, authorizes and validates every call and holds its own credentials. Remove with example/.
 */
const MAX_BYTES = 64 * 1024
const REGIONS = ["eu", "us", "ap"]
const HISTORY_LIMIT = 50

/** A fresh host with its own state; returns the handler for one operation request. */
export function createMockHost() {
  let revision = 1
  let settings = { siteName: "Example Tasks", region: "eu", maintenance: false, apiKey: "example-key-not-a-secret-0000" }
  const history = [{ at: "2026-10-01T09:00:00.000Z", field: "siteName", by: "Studio" }]
  const data = () => ({ settings: { ...settings }, history: [...history] })
  const problem = (patch) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return "Send the changed settings as an object"
    for (const [key, value] of Object.entries(patch)) {
      if (key === "siteName") {
        if (typeof value !== "string" || !value.trim() || value.length > 80) return "Site name needs 1 to 80 characters"
      } else if (key === "region") {
        if (!REGIONS.includes(value)) return "Region must be eu, us or ap"
      } else if (key === "maintenance") {
        if (typeof value !== "boolean") return "Maintenance mode is on or off"
      } else if (key === "apiKey") {
        if (typeof value !== "string" || value.length > 200) return "The API key is at most 200 characters"
      } else return `There is no setting named ${key}`
    }
    return null
  }
  return function handle(req, res, name) {
    const send = (status, body) => {
      if (res.writableEnded) return
      res.statusCode = status
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(body))
    }
    const fail = (status, code, reason, recoverable = false, extra = {}) => send(status, { ok: false, error: { code, reason, recoverable }, ...extra })
    if (req.method !== "POST") return fail(405, "method", "Operations take POST")
    let sameOrigin = false
    try {
      sameOrigin = !!req.headers.origin && new URL(req.headers.origin).host === req.headers.host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return fail(403, "origin", "Only this Studio can call its operations")
    if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return fail(415, "content-type", "Send JSON")
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        fail(413, "too-large", "Operation bodies are limited to 64 KB")
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => {
      if (res.writableEnded) return
      let body
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
      } catch {
        return fail(400, "json", "Not valid JSON")
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "json", "Send the operation as a JSON object")
      if (name === "site.read") return send(200, { ok: true, data: data(), revision: String(revision) })
      if (name === "site.write") {
        if (req.headers["x-studio-operation-kind"] !== "write") return fail(400, "kind", "site.write is a write")
        if (body.expectedRevision !== undefined && body.expectedRevision !== String(revision)) return fail(409, "conflict", `Revision ${revision} is current; this edit started from revision ${body.expectedRevision}.`, true, { current: { data: data(), revision: String(revision) } })
        const reason = problem(body.input)
        if (reason) return fail(422, "invalid", reason)
        // Nothing to change: answer with what is stored, without a new revision.
        if (!Object.keys(body.input).length) return send(200, { ok: true, data: data(), revision: String(revision) })
        const by = typeof req.headers["x-example-actor"] === "string" ? req.headers["x-example-actor"] : "Studio"
        for (const field of Object.keys(body.input)) history.unshift({ at: new Date().toISOString(), field, by })
        history.splice(HISTORY_LIMIT)
        settings = { ...settings, ...body.input }
        revision++
        return send(200, { ok: true, data: data(), revision: String(revision) })
      }
      return fail(404, "unknown-operation", `This host has no operation named ${name}`)
    })
  }
}

/** The operation name from a request URL below the mount point (`/site.read?x` is `site.read`); a malformed escape names nothing. */
export function operationName(url = "") {
  try {
    return decodeURIComponent(url.replace(/^\//, "").split("?")[0])
  } catch {
    return ""
  }
}

/** Connect-style middleware for a fresh host, mounted at `/__studio/ops` (the mount strips that prefix from `req.url`). */
export function createMockMiddleware() {
  const handle = createMockHost()
  return (req, res) => handle(req, res, operationName(req.url))
}
