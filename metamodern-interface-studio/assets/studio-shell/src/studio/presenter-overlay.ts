import type { Step, Walkthrough } from "./types"

/**
 * Presenter changes are a viewer-local overlay. Generated adapter records remain
 * untouched, so a regenerated catalog can be reconciled without losing notes.
 */
export type PresenterStep = Step & {
  id?: string
  values?: Record<string, string | number>
  duration?: number
  hidden?: boolean
}
export type PresenterWalkthrough = Omit<Walkthrough, "steps"> & { steps: PresenterStep[] }
export type PresenterOverlay = {
  version: 1
  tours: Record<string, {
    name?: string
    goal?: string
    steps?: Record<string, Partial<Pick<PresenterStep, "narration" | "duration" | "hidden" | "values">>>
  }>
}

/** Validate untrusted JSON before replacing a viewer's saved overlay. Unknown tour and
 * step IDs are intentionally retained for a later catalog reconciliation. */
export function isPresenterOverlay(value: unknown): value is PresenterOverlay {
  if (!value || typeof value !== "object") return false
  const overlay = value as { version?: unknown; tours?: unknown }
  if (overlay.version !== 1 || !overlay.tours || typeof overlay.tours !== "object" || Array.isArray(overlay.tours)) return false
  return Object.values(overlay.tours as Record<string, unknown>).every((tour) => {
    if (!tour || typeof tour !== "object" || Array.isArray(tour)) return false
    const item = tour as { name?: unknown; goal?: unknown; steps?: unknown }
    if (!Object.keys(item).every((key) => key === "name" || key === "goal" || key === "steps")) return false
    if (item.name !== undefined && typeof item.name !== "string") return false
    if (item.goal !== undefined && typeof item.goal !== "string") return false
    if (item.steps === undefined) return true
    if (!item.steps || typeof item.steps !== "object" || Array.isArray(item.steps)) return false
    return Object.values(item.steps as Record<string, unknown>).every((step) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return false
      const patch = step as { narration?: unknown; duration?: unknown; hidden?: unknown; values?: unknown }
      if (!Object.keys(patch).every((key) => key === "narration" || key === "duration" || key === "hidden" || key === "values")) return false
      return (patch.narration === undefined || typeof patch.narration === "string") &&
        (patch.duration === undefined || (typeof patch.duration === "number" && Number.isFinite(patch.duration) && patch.duration > 0)) &&
        (patch.hidden === undefined || typeof patch.hidden === "boolean") &&
        (patch.values === undefined || (typeof patch.values === "object" && patch.values !== null && !Array.isArray(patch.values) && Object.values(patch.values as Record<string, unknown>).every((v) => typeof v === "string" || typeof v === "number")))
    })
  })
}

/** Import callers can validate first, then atomically retain the current overlay on failure. */
export function importedOverlay(current: PresenterOverlay, candidate: unknown): PresenterOverlay {
  return isPresenterOverlay(candidate) ? candidate : current
}

/** Playback selection is explicit so hidden presenter steps are never timed. */
export const firstVisibleIndex = (tour: Pick<Walkthrough, "steps">) => tour.steps.findIndex((step) => !step.hidden)
export const nextVisibleIndex = (tour: Pick<Walkthrough, "steps">, after: number) => tour.steps.findIndex((step, index) => index > after && !step.hidden)

export const stepId = (tour: Pick<Walkthrough, "id">, step: PresenterStep, index: number) => step.id ?? `${tour.id}:${index + 1}`

export function applyPresenterOverlay(tours: Walkthrough[], overlay: PresenterOverlay | null | undefined): PresenterWalkthrough[] {
  if (!overlay || overlay.version !== 1) return tours as PresenterWalkthrough[]
  return tours.map((tour) => {
    const patch = overlay.tours[tour.id]
    if (!patch) return tour as PresenterWalkthrough
    return {
      ...tour,
      name: patch.name ?? tour.name,
      goal: patch.goal ?? tour.goal,
      steps: tour.steps.map((step, index) => {
        const change = patch.steps?.[stepId(tour, step, index)]
        // Never spread imported JSON into generated scenario identity or commands.
        return { ...step, ...(change?.narration !== undefined ? { narration: change.narration } : {}), ...(change?.duration !== undefined ? { duration: change.duration } : {}), ...(change?.hidden !== undefined ? { hidden: change.hidden } : {}), ...(change?.values !== undefined ? { values: change.values } : {}) }
      }),
    }
  })
}

export function updateOverlay(overlay: PresenterOverlay, tourId: string, patch: Partial<PresenterOverlay["tours"][string]>): PresenterOverlay {
  return { ...overlay, tours: { ...overlay.tours, [tourId]: { ...overlay.tours[tourId], ...patch } } }
}
