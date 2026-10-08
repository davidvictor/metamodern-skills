/** Product-owned build-time compiler module map. Adapter declarations contain data only. */
import type { DesignCompilerModule } from "../studio/design-runtime"
export const designCompilers: Record<string, () => Promise<DesignCompilerModule>> = {}
