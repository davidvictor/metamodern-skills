/** Replace the serialized Studio selection without creating a navigation entry. */
export function replaceStudioHash(hash: string) {
  // Effects can rerun when lifecycle snapshots change without changing the link.
  // Compare against the browser, so Back/Forward and deliberate push entries remain authoritative.
  if (location.hash === hash) return
  history.replaceState(null, "", hash)
}
