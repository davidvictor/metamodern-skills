import type { DesignEditorLoaders } from "@studio/design-ui"
export const designEditors: DesignEditorLoaders = { fixture: () => (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("centered") ? import("./centered") : import("./index")).then(m => m.fixtureEditor) }
