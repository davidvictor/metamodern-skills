import assert from "node:assert/strict"
import { applyPresenterOverlay, firstVisibleIndex, importedOverlay, isPresenterOverlay, nextVisibleIndex, stepId } from "../src/studio/presenter-overlay.ts"

const base = [{
  id: "tour.weekly",
  name: "Generated name",
  goal: "Generated goal",
  steps: [
    { id: "step.first", scenario: "screen.one", narration: "First" },
    { id: "step.second", scenario: "screen.two", narration: "Second" },
  ],
}]
const overlay = {
  version: 1,
  tours: {
    "tour.weekly": { name: "Presenter name", goal: "Presenter goal", steps: { "step.second": { narration: "Edited", duration: 7, hidden: true, values: { clock: 540 } } } },
    "tour.removed": { name: "Orphan must survive" },
  },
}

assert.equal(isPresenterOverlay(overlay), true, "valid overlays are accepted")
const applied = applyPresenterOverlay(base, overlay)
assert.equal(applied[0].name, "Presenter name")
assert.equal(applied[0].steps[1].narration, "Edited")
assert.equal(applied[0].steps[1].duration, 7, "authored duration remains seconds")
assert.equal(applied[0].steps[1].hidden, true)
assert.deepEqual(applied[0].steps[1].values, { clock: 540 })

const reordered = applyPresenterOverlay([{ ...base[0], steps: [...base[0].steps].reverse() }], overlay)
assert.equal(reordered[0].steps[0].narration, "Edited", "stable IDs retain edits after generated order changes")
assert.equal(stepId(base[0], base[0].steps[1], 1), "step.second")
const serialized = JSON.parse(JSON.stringify(overlay))
assert.deepEqual(serialized.tours["tour.removed"], overlay.tours["tour.removed"], "orphan edits round-trip unchanged")

const invalid = { version: 1, tours: { "tour.weekly": { steps: { "step.second": { duration: -1 } } } } }
assert.equal(isPresenterOverlay(invalid), false, "invalid duration is rejected")
assert.equal(importedOverlay(overlay, invalid), overlay, "invalid imports preserve the old overlay")

const malicious = { version: 1, tours: { "tour.weekly": { steps: { "step.second": { scenario: "screen.admin", commands: ["delete"], id: "replacement", narration: "Attempted override" } } } } }
assert.equal(isPresenterOverlay(malicious), false, "unknown step keys cannot enter an imported overlay")
const sanitized = applyPresenterOverlay(base, malicious)
assert.equal(sanitized[0].steps[1].scenario, "screen.two", "generated scenario identity is never overwritten")
assert.deepEqual(sanitized[0].steps[1].commands, undefined, "generated commands are never overwritten")
assert.equal(sanitized[0].steps[1].id, "step.second", "generated step identity is never overwritten")

const playback = { steps: [{ scenario: "one", narration: "Hidden first", hidden: true }, { scenario: "two", narration: "Visible" }, { scenario: "three", narration: "Hidden last", hidden: true }] }
assert.equal(firstVisibleIndex(playback), 1, "Play All starts at the first visible step")
assert.equal(nextVisibleIndex(playback, 0), 1, "a hidden current step normalizes to the next visible step")
assert.equal(nextVisibleIndex(playback, 1), -1, "no hidden step receives a timer after the final visible step")
assert.equal(firstVisibleIndex({ steps: playback.steps.map((step) => ({ ...step, hidden: true })) }), -1, "all-hidden tours are skipped")
console.log("presenter overlay tests passed")
