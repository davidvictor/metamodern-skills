import * as React from "react"
import { DIRECTION_LINK_KEYS } from "../directions"
import { host } from "@/studio-host"
import { DesignDirectionService } from "./direction-service"
import { adapter } from "@/adapter"
import { designCompilers } from "@/design-runtime"
import { designEditors } from "@/design-ui"
import { createDesignController, type DesignController } from "./controller"
import { loadDesignEditor } from "./loader"
import type { DesignEditorModule, DesignRuntimeModule } from "./types"

type Context = { declaration?: import("./types").DesignEditorDeclaration; controller: DesignController | null; module: DesignEditorModule | null; reason?: string; lifecycle?: DesignDirectionService }
const Context = React.createContext<Context | null>(null)
export function DesignEditorProvider({ children }: { children: React.ReactNode }) {
  const declaration = adapter.design?.editor
  const [value, setValue] = React.useState<Context>({ controller: null, module: null })
  React.useEffect(() => {
    if (!declaration) return
    let active = true
    let lifecycle: DesignDirectionService | undefined
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
        if (adapter.design?.directions) {
          const reserved = adapter.axes.inputs.filter(i => (DIRECTION_LINK_KEYS as readonly string[]).includes(i.id)); if (reserved.length) throw new Error(`Direction lifecycle uses reserved link keys: ${reserved.map(i => i.id).join(", ")}. Rename those review inputs before opting in.`)
          let storage: Storage | undefined; try { storage = window.localStorage } catch { /* browser recovery may be unavailable */ }
          lifecycle = new DesignDirectionService({ declaration: adapter.design.directions, controller, runtime: runtime as DesignRuntimeModule, canSave: host.canSave, editable: declaration.capabilities.includes("edit"), bundled: host.directions, storage })
          await lifecycle.initialize()
        }
        if (active) setValue({ controller, module, declaration, lifecycle })
        else lifecycle?.dispose()
      } catch (error) { if (active) setValue({ controller: null, module: null, declaration, reason: error instanceof Error ? error.message : String(error) }) }
    }
    void load()
    return () => { active = false; lifecycle?.dispose() }
  }, [declaration])
  // A named-direction link must hydrate before the shared store can read/rewrite its URL.
  if (adapter.design?.directions && !value.controller) return <div role={value.reason ? "alert" : "status"} className="min-w-0 max-w-full p-4 text-sm [overflow-wrap:anywhere]">{value.reason ?? "Loading saved direction and recovery…"}</div>
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

export function useDesignDirections() { return useOptionalDesignEditor()?.lifecycle }
export function useDirectionSnapshot() { const service = useDesignDirections(); return React.useSyncExternalStore(service?.subscribe ?? noSubscribe, service?.getSnapshot ?? none, service?.getSnapshot ?? none) }
