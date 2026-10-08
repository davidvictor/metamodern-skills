/** Product-neutral transport and durable feedback. Source authority stays in the host adapter. */
export type RawAnnotation = { id: string; comment: string; element: string; elementPath: string; timestamp: number; x: number; y: number; attributes?: Record<string, string>; [key: string]: unknown }
export type AnnotationScope = "studio" | "example" | "shared"
export type AnnotationContext = {
  layer: "studio" | "preview"
  page: "library" | "inspect"
  scenario?: string
  component?: string
  example?: string
  block?: string
  theme?: string
  profile?: string
  values?: unknown
  valuesFingerprint?: string
  omittedValues?: string[]
  omittedContext?: string[]
  design?: unknown
  draft?: unknown
  viewport: { width: number; height: number; scale: number }
  originalViewport?: { width: number; height: number }
  location?: string
  revision?: string
  shellVersion: string
}
export type AnnotationSource = { repository?: string; confidence: "verified" | "candidate" | "unresolved"; owner: string; paths: string[]; candidates?: string[] }
export type AnnotationDeclaration = {
  id: string
  repository: string
  defaultEnabled?: boolean
  safeValues?: (context: AnnotationContext) => unknown
  resolveSource: (context: AnnotationContext, annotation: RawAnnotation, scope: AnnotationScope) => AnnotationSource
}
export type AnnotationSession = { generation: string; fingerprint: string; context: AnnotationContext }
export type AnnotationMutation =
  | { action: "upsert"; annotation: RawAnnotation }
  | { action: "delete"; id: string }
  | { action: "clear" }
  | { action: "review" }
  | { action: "ready" }
  | { action: "stopped" }
  | { action: "error"; reason: string }
export type AnnotationEvent = AnnotationMutation & { generation: string; fingerprint: string }
export type AnnotationCommand = { action: "activate"; session: AnnotationSession; notes: RawAnnotation[] } | { action: "deactivate"; generation: string }
export type AnnotationClient = { receive: (command: unknown, emit: (event: AnnotationEvent) => void) => void; dispose: () => void | Promise<void> }
export type AnnotationRuntimeOptions = { session: AnnotationSession; notes: RawAnnotation[]; onMutation: (event: AnnotationMutation) => void; resolveOwner?: (element: Element | null) => Record<string, string> | undefined }
export type AnnotationRuntime = { mountAnnotations: (options: AnnotationRuntimeOptions) => () => void | Promise<void> }
export type FeedbackRecord = { schema: "studio-feedback/1"; key: string; capturedAt: string; product: string; origin: string; repository: string; session: AnnotationSession; scope: AnnotationScope; source: AnnotationSource; annotation: RawAnnotation }
