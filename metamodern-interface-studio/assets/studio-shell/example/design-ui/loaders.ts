import type { DesignEditorLoaders } from "@studio/design-ui"
export const designEditors: DesignEditorLoaders = { fixture: () => import("./index").then(m => m.fixtureEditor) }
