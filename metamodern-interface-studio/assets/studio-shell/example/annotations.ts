/** Portable local-only example. A real adapter supplies its own registered source map. */
import { createAnnotationClient } from "../src/studio/annotations/client"
import type { AnnotationDeclaration } from "../src/studio/annotations/types"
declare const __STUDIO_LOCAL_ANNOTATIONS__: boolean
export const exampleAnnotationClient = typeof __STUDIO_LOCAL_ANNOTATIONS__ !== "undefined" && __STUDIO_LOCAL_ANNOTATIONS__ ? createAnnotationClient({ load: () => import("../src/studio/annotations/runtime") }) : undefined
export const exampleAnnotations: AnnotationDeclaration = {
  id: "example-product", repository: "example/product", defaultEnabled: true,
  resolveSource(context, _annotation, scope) {
    if (context.layer === "studio") return { repository: "example/studio-source", owner: "Studio", confidence: "candidate", paths: ["src/App.tsx"] }
    return { owner: scope === "shared" ? "Shared example component" : "Example composition", confidence: "candidate", paths: [context.page === "library" ? "example/library/frame.ts" : "example/main.ts"] }
  },
}
