import { isJsonValue } from "../design-runtime"
import { DESIGN_CONTROLLER_VERSION, DESIGN_EDITOR_VERSION, type DesignEditorDeclaration, type DesignEditorLoaders, type DesignEditorModule } from "./types"
export async function loadDesignEditor(declaration: DesignEditorDeclaration, loaders: DesignEditorLoaders): Promise<DesignEditorModule> {
  const capabilities = ["edit", "reset", "history", "inheritance", "diagnostics"]
  if (!isJsonValue(declaration) || !declaration.id?.trim() || !declaration.version?.trim() || !Array.isArray(declaration.slots) || !declaration.slots.length || declaration.slots.some(slot => !["foundation", "component"].includes(slot)) || new Set(declaration.slots).size !== declaration.slots.length || !Array.isArray(declaration.capabilities) || declaration.capabilities.some(capability => !capabilities.includes(capability)) || new Set(declaration.capabilities).size !== declaration.capabilities.length) throw new Error("Invalid design editor descriptor/capabilities")
  if (declaration.schema !== DESIGN_EDITOR_VERSION || declaration.controllerSchema !== DESIGN_CONTROLLER_VERSION) throw new Error("Incompatible design editor interface")
  const loader = Object.hasOwn(loaders, declaration.id) ? loaders[declaration.id] : undefined
  if (typeof loader !== "function") throw new Error(`Design editor ${declaration.id} is not registered locally`)
  const editorModule = await loader()
  if (editorModule.schema !== DESIGN_EDITOR_VERSION || editorModule.id !== declaration.id || editorModule.version !== declaration.version) throw new Error("Design editor module identity/version does not match its declaration")
  if (!Array.isArray(editorModule.capabilities) || declaration.capabilities.some(capability => !editorModule.capabilities.includes(capability))) throw new Error("Design editor is missing a declared capability")
  if (declaration.slots.includes("foundation") && typeof editorModule.Foundation !== "function") throw new Error("Design editor does not provide its declared Foundation panel")
  if (declaration.slots.includes("component") && typeof editorModule.Component !== "function") throw new Error("Design editor does not provide its declared component inspector")
  return editorModule
}
