/** Both supported builders replace this with a literal; the default is inert. */
declare const __STUDIO_LOCAL_ANNOTATIONS__: boolean
export const LOCAL_ANNOTATIONS = typeof __STUDIO_LOCAL_ANNOTATIONS__ !== "undefined" && __STUDIO_LOCAL_ANNOTATIONS__

export const ANNOTATION_LAYOUT_EVENT = "studio-annotation-layout"
/** Only control membership changes notify placement; ordinary renders and context updates stay quiet. */
let pendingLayout = false
export function notifyAnnotationLayout() {
  if (!LOCAL_ANNOTATIONS || pendingLayout) return
  pendingLayout = true
  queueMicrotask(() => { pendingLayout = false; window.dispatchEvent(new Event(ANNOTATION_LAYOUT_EVENT)) })
}
