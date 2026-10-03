/*
 * The per-entry rules a saved state must meet, shared by the catalog (which skips an entry that breaks them) and
 * the studio-scenarios/1 validator (which refuses the file). Kept apart from scenarios.ts so the initial Studio
 * chunk carries only these, not the validator. Pure, no DOM.
 */
export const SAVED_PREFIX = "saved."
export const SAVED_ID = /^saved\.[a-z0-9][a-z0-9-]{0,63}$/
/** Text up to 4,000 characters, a finite number, or true or false. */
export const isSavedValue = (v: unknown) => typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 4000)
