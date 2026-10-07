/*
 * The core shell's only knowledge of workspace modules: whether the adapter declares a workspace, and lazy
 * slots for the parts that load only then (references/workspace.md). Without a declaration no slot renders
 * and no workspace chunk is requested; a build without one has none.
 */
import * as React from "react"
import { adapter } from "@/adapter"
import type { NavProps } from "./workspace-nav"
import type { PageProps } from "./workspace-page"

/** False in a build whose adapter declares no workspace (vite.config.ts), which then contains no workspace chunk at all. */
import { workspaceEnabled } from "@/studio-host"

export const hasWorkspace = workspaceEnabled && !!adapter.workspace
if (!workspaceEnabled && adapter.workspace) console.error("Interface Studio: this build left the workspace out because the adapter it loaded declared none, but the adapter running now declares one. Rebuild the Studio to show its workspace.")
const never = () => new Promise<never>(() => undefined)
/** The link the Studio opened with, read before the Studio rewrites it, so the workspace can report a module it lacks. */
export const openingLink = typeof location === "undefined" ? "" : location.hash

function failed<P>(e: unknown): { default: React.ComponentType<P> } {
  console.error("The workspace could not load", e)
  return { default: () => null }
}
/** Rail items, the phone entry and drawer, Go to entries, breadcrumb and history: loaded with the Studio when declared. */
export const WorkspaceNav: React.LazyExoticComponent<React.ComponentType<NavProps>> = React.lazy(() => (!workspaceEnabled ? never() : import("./workspace-nav").then((m) => ({ default: m.WorkspaceNav }), failed<NavProps>)))
/** The open module's page, panel and details: loaded when a module opens. */
export const WorkspacePage: React.LazyExoticComponent<React.ComponentType<PageProps>> = React.lazy(() => (!workspaceEnabled ? never() : import("./workspace-page").then((m) => ({ default: m.WorkspacePage }), failed<PageProps>)))

export function Slot({ children }: { children: React.ReactNode }) {
  return hasWorkspace ? <React.Suspense fallback={null}>{children}</React.Suspense> : null
}
