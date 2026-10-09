/** Yield committed UI a paint opportunity before optional third-party initialization. */
type AnnotationTimer = ReturnType<typeof globalThis.setTimeout>
export type AnnotationTaskHost = {
  requestAnimationFrame?: (callback: () => void) => number
  cancelAnimationFrame?: (id: number) => void
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
  scheduler?: { postTask: (callback: () => void, options: { priority: "background"; signal: AbortSignal }) => Promise<void> }
  setTimeout?: (callback: () => void, delay: number) => AnnotationTimer
  clearTimeout?: (id: AnnotationTimer) => void
}
export const ANNOTATION_IDLE_TIMEOUT_MS = 500
const abortError = () => new DOMException("Annotation initialization was revoked", "AbortError")
export function scheduleAnnotationWork<T>(work: () => T | Promise<T>, signal: AbortSignal, host: AnnotationTaskHost = globalThis) {
  if (signal.aborted) return Promise.reject<T>(abortError())
  // Non-browser clients have no paint lifecycle; keep the framework-free connector usable in tests/tools.
  if (!host.requestAnimationFrame) { try { return Promise.resolve(work()) } catch (error) { return Promise.reject<T>(error) } }
  return new Promise<T>((resolve, reject) => {
    let frame: number | undefined
    let idle: number | undefined
    let timer: AnnotationTimer | undefined
    let task: AbortController | undefined
    let finished = false
    const cleanup = () => {
      if (frame !== undefined) host.cancelAnimationFrame?.(frame)
      if (idle !== undefined) host.cancelIdleCallback?.(idle)
      if (timer !== undefined) { if (host.clearTimeout) host.clearTimeout(timer); else clearTimeout(timer) }
      task?.abort()
      signal.removeEventListener("abort", revoked)
    }
    const failed = (error: unknown) => { if (finished) return; finished = true; cleanup(); reject(error) }
    const revoked = () => failed(abortError())
    const run = () => {
      if (finished) return
      if (signal.aborted) { revoked(); return }
      finished = true
      cleanup()
      try { Promise.resolve(work()).then(resolve, reject) } catch (error) { reject(error) }
    }
    const later = (delay: number) => host.setTimeout ? host.setTimeout(run, delay) : setTimeout(run, delay)
    const background = () => {
      frame = undefined
      if (signal.aborted) { revoked(); return }
      try {
        if (host.requestIdleCallback) idle = host.requestIdleCallback(run, { timeout: ANNOTATION_IDLE_TIMEOUT_MS })
        else if (host.scheduler) {
          task = new AbortController()
          timer = later(ANNOTATION_IDLE_TIMEOUT_MS)
          void host.scheduler.postTask(run, { priority: "background", signal: task.signal }).catch(failed)
        } else timer = later(0)
      } catch (error) { failed(error) }
    }
    signal.addEventListener("abort", revoked, { once: true })
    frame = host.requestAnimationFrame!(() => { frame = host.requestAnimationFrame!(background) })
  })
}
