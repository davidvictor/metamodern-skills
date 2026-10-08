import * as React from "react"
import { adapter } from "@/adapter"
import { designCompilers } from "@/design-runtime"
import { designEditors } from "@/design-ui"
import { createDesignController, type DesignController } from "./controller"
import { loadDesignEditor } from "./loader"
import type { DesignEditorModule, DesignRuntimeModule } from "./types"

type Context = { declaration?: import("./types").DesignEditorDeclaration; controller: DesignController | null; module: DesignEditorModule | null; reason?: string }
const Context = React.createContext<Context | null>(null)
export function DesignEditorProvider({ children }: { children: React.ReactNode }) {
  const declaration = adapter.design?.editor
  const [value, setValue] = React.useState<Context>({ controller: null, module: null })
  React.useEffect(() => {
    if (!declaration) return
    let active = true
    const load = async () => {
      try {
        const compiler = adapter.design?.compiler
        if (!compiler) throw new Error("Design editor needs its declared product compiler")
        const loader = Object.hasOwn(designCompilers, compiler.id) ? designCompilers[compiler.id] : undefined
        if (typeof loader !== "function") throw new Error("Design compiler is not registered locally")
        const [module, runtime] = await Promise.all([loadDesignEditor(declaration, designEditors), loader()])
        if (!runtime.model) throw new Error("Design compiler has no product model")
        const controller = createDesignController({ compiler, runtime: runtime as DesignRuntimeModule, themes: adapter.axes.themes.map(t => t.id), capabilities: declaration.capabilities })
        await controller.start()
        if (active) setValue({ controller, module, declaration })
      } catch (error) { if (active) setValue({ controller: null, module: null, declaration, reason: error instanceof Error ? error.message : String(error) }) }
    }
    void load()
    return () => { active = false }
  }, [declaration])
  return declaration ? <Context.Provider value={value}>{children}</Context.Provider> : children
}
export const useOptionalDesignEditor = () => React.useContext(Context)
export function useDesignController() {
  const context = useOptionalDesignEditor()
  if (!context?.controller) throw new Error(context?.reason ?? "Design editor is not ready")
  return context.controller
}
const noSubscribe = () => () => {}
const none = () => null
export function useDesignSnapshot(controller?: DesignController | null) {
  const context = useOptionalDesignEditor()
  const c = controller ?? context?.controller
  return React.useSyncExternalStore(c?.subscribe ?? noSubscribe, c?.getSnapshot ?? none, c?.getSnapshot ?? none)
}
