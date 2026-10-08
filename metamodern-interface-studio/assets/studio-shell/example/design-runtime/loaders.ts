import type { DesignCompilerModule } from "../../src/studio/design-runtime"
export const designCompilers: Record<string, () => Promise<DesignCompilerModule>> = { fixture: () => import("./index").then(m => m.modelRuntime) }
