import type { DesignCompilerModule } from "../../src/studio/design-runtime"
export const designCompilers: Record<string, () => Promise<DesignCompilerModule>> = { fixture: () => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("provenance") === "long" ? import("./provenance-long") : import("./provenance-short")).then(m => m.modelRuntime) }
