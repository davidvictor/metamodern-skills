/*
 * The workspace API modules import as @studio/workspace (references/workspace.md): define the module
 * map, read the open module, call its declared operations, guard unsaved changes, and share values
 * between a module's Page, Panel and Details. Public surface, versioned with studio-kit/1.
 */
import * as React from "react"
import { ModuleContext, type ModuleInfo } from "./context"
import { createOperationClient, HOST_UNAVAILABLE, REFUSED, type OperationResult } from "./operations"
import { answered, guards, hostStatus, moduleValues, stepKeys } from "./stores"

/** Codes the shell answers itself; such a result says nothing about the host. */
const SHELL_CODES = new Set<string>(Object.values(REFUSED))

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

/** The open module: ID, label, sections, the current section, `go(section)`, the item and `setItem(id)`, and its declared operations. */
export function useModule(): ModuleInfo {
  const m = React.useContext(ModuleContext)
  if (!m) throw new Error("useModule is only available inside a workspace module")
  return m
}

type OperationState<T> = { status: "idle" | "running" | "done"; result: OperationResult<T> | null }

/** One declared operation: `read(input)` or `write(input, { expectedRevision })`, with its status and last result. */
export function useOperation<T = unknown>(name: string) {
  const { id: moduleId, operations, uses } = useModule()
  const [state, setState] = React.useState<OperationState<T>>({ status: "idle", result: null })
  const live = React.useRef(true)
  // Only the latest call sets status and result, so an earlier, slower answer cannot replace it.
  const seq = React.useRef(0)
  React.useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const call = React.useMemo(() => createOperationClient({ base: operations, uses, location: window.location.href, fetch: (url, init) => window.fetch(url, init) }), [operations, uses])
  const run = React.useCallback(
    async (kind: "read" | "write", input: unknown, expectedRevision?: string) => {
      const id = ++seq.current
      setState((s) => ({ status: "running", result: s.result }))
      const result = (await call(name, kind, input, { expectedRevision })) as OperationResult<T>
      // Only a read before the host has answered this module, with nothing unsaved, means the module cannot start.
      // Any other failure (a write, a later read) is this operation's own result: the page, its edit and its guard
      // stay, and the module shows it (SaveBar's error with Retry).
      if (!result.ok && result.error.code === HOST_UNAVAILABLE) {
        if (kind === "read" && !answered.get()[moduleId] && !guards.active()) hostStatus.set({ ...hostStatus.get(), [moduleId]: result.error.reason })
      } else if ((result.ok || !SHELL_CODES.has(result.error.code)) && !answered.get()[moduleId]) answered.set({ ...answered.get(), [moduleId]: true })
      if (live.current && id === seq.current) setState({ status: "done", result })
      return result
    },
    [call, name, moduleId]
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

/** Where j and k type or move something themselves: fields, editable regions, and an open dialog. */
const KEEPS_KEYS = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role^='menuitem'], [role='dialog'], [role='alertdialog']"

/**
 * Steps the module's selection with the keyboard: `j` calls `onNext` and `k` calls `onPrevious`, without modifiers,
 * while the module is open. Ignored while focus is in a field or an editable region, while a dialog is open, and for a
 * key another handler already used (`preventDefault`), such as a SelectList, which moves its own selection on j and k.
 * The Studio's keyboard shortcuts list names the keys while a module binds them.
 */
export function useStepKeys(onPrevious: () => void, onNext: () => void) {
  useModule()
  const latest = React.useRef({ onPrevious, onNext })
  React.useLayoutEffect(() => {
    latest.current = { onPrevious, onNext }
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || (e.key !== "j" && e.key !== "k")) return
      const target = e.target instanceof Element ? e.target : null
      const dialogOpen = [...document.querySelectorAll("[role='dialog'], [role='alertdialog']")].some((d) => d.checkVisibility())
      if (target?.closest(KEEPS_KEYS) || dialogOpen) return
      e.preventDefault()
      if (e.key === "j") latest.current.onNext()
      else latest.current.onPrevious()
    }
    window.addEventListener("keydown", onKey)
    stepKeys.set(stepKeys.get() + 1)
    return () => {
      window.removeEventListener("keydown", onKey)
      stepKeys.set(stepKeys.get() - 1)
    }
  }, [])
}
