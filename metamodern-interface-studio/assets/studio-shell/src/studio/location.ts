/** The existing URL serializer publishes only after committing its canonical URL. */
const listeners = new Set<() => void>()
let committed = typeof location === "undefined" ? "" : location.hash
export function committedStudioLocation() { return committed }
export function subscribeStudioLocation(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function replaceStudioLocation(hash: string) {
  history.replaceState(null, "", hash)
  const next = location.hash
  if (next === committed) return
  committed = next
  listeners.forEach(listener => listener())
}
