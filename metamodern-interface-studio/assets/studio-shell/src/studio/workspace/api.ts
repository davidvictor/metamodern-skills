/*
 * The workspace API modules import as @studio/workspace (references/workspace.md): define the module
 * map, read the open module, call its declared operations, guard unsaved changes, and share values
 * between a module's Page, Panel and Details. Public surface, versioned with studio-kit/1.
 */
import * as React from "react"
import { ModuleContext, type ModuleInfo } from "./context"
import { createOperationClient, HOST_UNAVAILABLE, type OperationResult } from "./operations"
import { guards, hostStatus, moduleValues } from "./stores"

export type { ModuleInfo } from "./context"
export type { OperationError, OperationKind, OperationResult } from "./operations"

export type ModuleDefinition = {
  /** The module's page on the Studio surface. */
  Page: React.ComponentType
  /** Filters or lists in the context panel, under the sections. */
  Panel?: React.ComponentType
  /** The Details panel. Without it Details is hidden for the module. */
  Details?: React.ComponentType
}
export type WorkspaceDefinition = { modules: Record<string, ModuleDefinition> }

/** The default export of src/workspace/index.ts. Keys are plain module IDs the adapter declares; any other fails the build. */
export function defineWorkspace(modules: Record<string, ModuleDefinition>): WorkspaceDefinition {
  return { modules }
}

/** The open module: ID, label, sections, the current section, `go(section)` and its declared operations. */
export function useModule(): ModuleInfo {
  const m = React.useContext(ModuleContext)
  if (!m) throw new Error("useModule is only available inside a workspace module")
  return m
}

type OperationState<T> = { status: "idle" | "running" | "done"; result: OperationResult<T> | null }

/** One declared operation: `read(input)` or `write(input, { expectedRevision })`, with its status and last result. */
export function useOperation<T = unknown>(name: string) {
  const { operations, uses } = useModule()
  const [state, setState] = React.useState<OperationState<T>>({ status: "idle", result: null })
  const live = React.useRef(true)
  React.useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const call = React.useMemo(() => createOperationClient({ base: operations, uses, location: window.location.href, fetch: (url, init) => window.fetch(url, init) }), [operations, uses])
  const run = React.useCallback(
    async (kind: "read" | "write", input: unknown, expectedRevision?: string) => {
      setState((s) => ({ status: "running", result: s.result }))
      const result = (await call(name, kind, input, { expectedRevision })) as OperationResult<T>
      if (!result.ok && result.error.code === HOST_UNAVAILABLE) hostStatus.set({ down: result.error.reason })
      if (live.current) setState({ status: "done", result })
      return result
    },
    [call, name]
  )
  const read = React.useCallback((input?: unknown) => run("read", input), [run])
  const write = React.useCallback((input: unknown, options: { expectedRevision?: string } = {}) => run("write", input, options.expectedRevision), [run])
  return { status: state.status, result: state.result, read, write }
}

/** While `dirty`, leaving the module or closing the tab asks first; Esc keeps the edits. Moving between its sections does not ask. */
export function useDirtyGuard(dirty: boolean, message = "Your unsaved changes in this module will be lost.") {
  React.useEffect(() => {
    if (!dirty) return
    const remove = guards.add(message)
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onUnload)
    return () => {
      remove()
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [dirty, message])
}

/** A value shared by the module's Page, Panel and Details, kept until the Studio reloads. */
export function useModuleState<T>(key: string, initial: T) {
  const { id } = useModule()
  const slot = `${id}:${key}`
  const all = React.useSyncExternalStore(moduleValues.subscribe, moduleValues.get)
  const value = (slot in all ? all[slot] : initial) as T
  const set = React.useCallback((next: T) => moduleValues.set({ ...moduleValues.get(), [slot]: next }), [slot])
  return [value, set] as const
}
