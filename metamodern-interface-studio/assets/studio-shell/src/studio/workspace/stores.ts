/*
 * Small external stores the workspace layer shares between its lazily loaded parts: whether the
 * operations host answered, values a module shares between its Page, Panel and Details, and the
 * unsaved-changes guards. Pure: no React, no DOM, so node tests load it directly.
 */
export type Store<T> = { get: () => T; set: (value: T) => void; subscribe: (listener: () => void) => () => void }

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Set when a module's read found no host before the host had answered that module and while nothing was unsaved: such a
 * module cannot start, so it shows the reason until Try again. Writes and later reads report a missing host as their own result.
 */
export const hostStatus = createStore<{ down: string | null }>({ down: null })
/**
 * Modules whose operations the host has answered in this Studio session. Before that a missing host makes the module
 * unavailable; after it, a missing host is only the failing operation's result, so an open page and its edits stay.
 */
export const answered = createStore<Record<string, true>>({})
/** Values a module shares between its Page, Panel and Details, keyed `module:key`, kept until the Studio reloads. */
export const moduleValues = createStore<Record<string, unknown>>({})

export type GuardRegistry = {
  /** Registers unsaved changes with the question to ask; returns the removal. */
  add: (message: string) => () => void
  /** The person chose to leave: current guards stop asking until a component registers again. */
  release: () => void
  /** The question to ask before leaving, or null when nothing is unsaved. */
  active: () => string | null
  subscribe: (listener: () => void) => () => void
}

export function createGuardRegistry(): GuardRegistry {
  const entries = new Map<number, { message: string; released: boolean }>()
  const listeners = new Set<() => void>()
  let seq = 0
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    add: (message) => {
      const id = ++seq
      entries.set(id, { message, released: false })
      emit()
      return () => {
        if (entries.delete(id)) emit()
      }
    },
    release: () => {
      for (const entry of entries.values()) entry.released = true
      emit()
    },
    active: () => {
      for (const entry of entries.values()) if (!entry.released) return entry.message
      return null
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The one registry the workspace layer and useDirtyGuard share. */
export const guards = createGuardRegistry()
