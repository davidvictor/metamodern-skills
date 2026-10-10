import * as React from "react"
import { adapter } from "@/adapter"
import { useStudio } from "@/store"
import { eligibleAnnotationPage } from "./model"
declare const __STUDIO_LOCAL_ANNOTATIONS__: boolean
const Annotations = typeof __STUDIO_LOCAL_ANNOTATIONS__ !== "undefined" && __STUDIO_LOCAL_ANNOTATIONS__ ? React.lazy(() => import("./host").then(module => ({ default: React.memo(module.Annotations) }))) : null
/** Eligibility is the actual page: Library wins over a workspace module, which wins over the saved view. */
export function AnnotationSlot() {
  const state = useStudio()
  const page = eligibleAnnotationPage(state)
  // A reserved strip under the top bar: the controls take their own row, never a floating layer over the stage or inspector.
  return Annotations && adapter.annotations && page ? <div data-studio-annotation-dock aria-label="Local annotations" role="region" className="flex min-h-10 shrink-0 items-center gap-3 border-b bg-background px-3 py-1"><React.Suspense fallback={null}><Annotations page={page} /></React.Suspense></div> : null
}
