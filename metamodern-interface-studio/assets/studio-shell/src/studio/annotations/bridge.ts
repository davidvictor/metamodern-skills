import type { AnnotationCommand, AnnotationContext, AnnotationEvent } from "./types"
export type AnnotationTarget = { id: string; label: string; context: AnnotationContext; available: boolean; send: (command: AnnotationCommand) => void }
type Entry = { owner: object; target: AnnotationTarget; contextVersion: number }
const targets = new Map<string, Entry>()
const listeners = new Set<() => void>()
const selectedListeners = new Map<() => void, string | null>()
const portals = new Map<string, HTMLElement>()
const receivers = new Set<(id: string, event: AnnotationEvent) => void>()
let version = 0
let enabled = false
const changed = () => { version++; listeners.forEach(listener => listener()); selectedListeners.forEach((_, listener) => listener()) }
const contextChanged = (id: string) => selectedListeners.forEach((selected, listener) => { if (selected === id) listener() })
export const annotationBridge = {
  portal: () => [...portals.values()].at(-1) ?? null,
  setPortal(owner: string, container: HTMLElement | null) {
    if (container) { if (portals.get(owner) === container) return; portals.set(owner, container); changed() }
    else if (portals.delete(owner)) changed()
  },
  enabled: () => enabled,
  setEnabled(value: boolean) { if (enabled !== value) { enabled = value; changed() } },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  subscribeFor(selected: string | null, listener: () => void) { selectedListeners.set(listener, selected); return () => { selectedListeners.delete(listener) } },
  snapshot: () => version,
  snapshotFor: (selected: string | null) => `${version}:${selected ? targets.get(selected)?.contextVersion ?? 0 : 0}`,
  targets: () => [...targets.values()].map(entry => entry.target),
  register(target: AnnotationTarget) {
    const owner = {}
    targets.set(target.id, { owner, target, contextVersion: 1 }); changed()
    return () => { if (targets.get(target.id)?.owner === owner) { targets.delete(target.id); changed() } }
  },
  update(target: AnnotationTarget) {
    const entry = targets.get(target.id)
    if (!entry) return
    const metadataChanged = entry.target.label !== target.label || entry.target.available !== target.available
    const differentContext = JSON.stringify(entry.target.context) !== JSON.stringify(target.context)
    entry.target = target
    if (differentContext) entry.contextVersion++
    if (metadataChanged) changed()
    else if (differentContext) contextChanged(target.id)
  },
  listen(listener: (id: string, event: AnnotationEvent) => void) { receivers.add(listener); return () => { receivers.delete(listener) } },
  receive(id: string, event: AnnotationEvent) { receivers.forEach(listener => listener(id, event)) },
}
