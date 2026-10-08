import type { DesignReviewContext } from "./types"

/** Only known reviewable scenarios can navigate; product data and editor history are untouched. */
export function createDesignReviewContext(scenarioId: string, scenarios: readonly { id: string; label: string; status?: string }[], select: (id: string) => void): DesignReviewContext {
  const options = Object.freeze(scenarios.filter(s => s.status !== "later").map(({ id, label }) => Object.freeze({ id, label })))
  return Object.freeze({ scenarioId, scenarios: options, selectScenario(id: string) { if (id !== scenarioId && options.some(s => s.id === id)) select(id) } })
}
