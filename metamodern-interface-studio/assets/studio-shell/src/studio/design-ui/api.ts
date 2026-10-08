/** studio-design-editor/1: the only controller interface product panels import. */
export { DESIGN_EDITOR_VERSION, DESIGN_CONTROLLER_VERSION } from "./types"
export type { DesignEditorDeclaration, DesignEditorModule, DesignEditorLoaders, DesignPanelProps, DesignModel, DesignRuntimeModule, DesignTarget, DesignScope, DesignEdit, DesignReset, DesignReadout, DesignProblem, DesignSnapshot, DesignPreviewIdentity, DesignSaveCandidate, CompiledThemes } from "./types"
export { createDesignController, DesignController } from "./controller"
export { useDesignController, useDesignSnapshot } from "./react"
export { loadDesignEditor } from "./loader"
