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
  return Annotations && adapter.annotations && page ? <React.Suspense fallback={null}><Annotations page={page} /></React.Suspense> : null
}
