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
  // A reserved strip under the top bar: the controls take their own row, never a floating layer over the stage, previews or
  // inspector. Its end (pr-16 until measured) is kept for the vendor control, which the host pins there; the host then
  // reserves what the control draws, or a row of its own on phones while feedback mode is open (annotationStripPlacement).
  return Annotations && adapter.annotations && page ? <div data-studio-annotation-dock aria-label="Local annotations" role="region" className="flex min-h-13 shrink-0 items-center gap-3 border-b bg-background py-1 pr-16 pl-3"><React.Suspense fallback={null}><Annotations page={page} /></React.Suspense></div> : null
}
