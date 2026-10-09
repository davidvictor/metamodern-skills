import type { AnnotationCommand, AnnotationContext, AnnotationEvent } from "./types"
export type AnnotationTarget = { id: string; label: string; context: AnnotationContext; available: boolean; send: (command: AnnotationCommand) => void }
const targets = new Map<string, AnnotationTarget>()
const listeners = new Set<() => void>()
const portals = new Map<string, HTMLElement>()
const receivers = new Set<(id: string, event: AnnotationEvent) => void>()
let version = 0
let enabled = false
const changed = () => { version++; listeners.forEach(listener => listener()) }
export const annotationBridge = {
  portal: () => [...portals.values()].at(-1) ?? null,
  setPortal(owner: string, container: HTMLElement | null) {
    if (container) { if (portals.get(owner) === container) return; portals.set(owner, container); changed() }
    else if (portals.delete(owner)) changed()
  },
  enabled: () => enabled,
  setEnabled(value: boolean) { if (enabled !== value) { enabled = value; changed() } },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  snapshot: () => version,
  targets: () => [...targets.values()],
  register(target: AnnotationTarget) { targets.set(target.id, target); changed(); return () => { if (targets.get(target.id) === target) { targets.delete(target.id); changed() } } },
  listen(listener: (id: string, event: AnnotationEvent) => void) { receivers.add(listener); return () => { receivers.delete(listener) } },
  receive(id: string, event: AnnotationEvent) { receivers.forEach(listener => listener(id, event)) },
}
