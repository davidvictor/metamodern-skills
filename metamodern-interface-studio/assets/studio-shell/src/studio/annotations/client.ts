import { scheduleAnnotationWork } from "./schedule"
import { validCommand, validMutation } from "./model"
import type { AnnotationClient, AnnotationRuntime, AnnotationRuntimeOptions } from "./types"
export type AnnotationClientOptions = { load: () => Promise<AnnotationRuntime>; resolveOwner?: AnnotationRuntimeOptions["resolveOwner"] }
/** Framework-free, lazy and inert until the guarded frame channel selects this document. */
export function createAnnotationClient(options: AnnotationClientOptions): AnnotationClient {
  let sequence = 0
  let generation: string | null = null
  let dispose: (() => void | Promise<void>) | undefined
  let cleaning: Promise<void> = Promise.resolve()
  let initialization: AbortController | undefined
  const stop = () => { sequence++; generation = null; initialization?.abort(); initialization = undefined; const cleanup = dispose?.(); dispose = undefined; cleaning = Promise.all([cleaning, cleanup]).then(() => undefined); return cleaning }
  return {
    receive(command, emit) {
      if (!validCommand(command)) {
        if (command && typeof command === "object" && "session" in command && command.session && typeof command.session === "object" && "generation" in command.session && "fingerprint" in command.session && typeof command.session.generation === "string" && typeof command.session.fingerprint === "string") emit({ action: "error", generation: command.session.generation, fingerprint: command.session.fingerprint, reason: "Saved marker data exceed the session limit or are invalid. Feedback remains available in host review." })
        return
      }
      if (command.action === "deactivate") { const stopped = command.generation === generation ? stop() : Promise.resolve(); void stopped.then(() => emit({ action: "stopped", generation: command.generation, fingerprint: "revoked" })); return }
      const stopped = stop()
      const version = sequence
      const session = structuredClone(command.session)
      generation = session.generation
      const controller = new AbortController()
      initialization = controller
      void Promise.all([scheduleAnnotationWork(options.load, controller.signal), stopped]).then(([runtime]) => scheduleAnnotationWork(() => {
        if (sequence !== version) return
        dispose = runtime.mountAnnotations({ session, notes: command.notes, resolveOwner: options.resolveOwner, onMutation(mutation) {
          if (sequence !== version) return
          const safe = validMutation(mutation) ? mutation : { action: "error" as const, reason: "Annotation exceeds supported size or is invalid. Shorten it and retry; no comment was truncated." }
          emit({ ...safe, generation: session.generation, fingerprint: session.fingerprint })
        } })
        emit({ action: "ready", generation: session.generation, fingerprint: session.fingerprint })
      }, controller.signal)).catch(error => { if (sequence === version) emit({ action: "error", generation: session.generation, fingerprint: session.fingerprint, reason: String(error).slice(0, 2048) }) })
    },
    dispose: stop,
  }
}
