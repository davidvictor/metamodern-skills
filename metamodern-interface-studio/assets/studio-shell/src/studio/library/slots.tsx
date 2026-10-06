/*
 * The core shell's only knowledge of the component library: whether the adapter declares one, and lazy slots for the
 * parts that load only then (references/library.md). Without a declaration no slot renders and no library chunk is
 * requested; a build without one has none.
 */
import * as React from "react"
import { adapter } from "@/adapter"
import type { NavProps } from "./library-nav"
import type { PageProps } from "./library-page"

/** False in a build whose adapter declares no library (vite.config.ts), which then contains no library chunk at all. */
declare const __STUDIO_LIBRARY__: boolean

export const hasLibrary = __STUDIO_LIBRARY__ && !!adapter.library
if (!__STUDIO_LIBRARY__ && adapter.library) console.error("Interface Studio: this build left the component library out because the adapter it loaded declared none, but the adapter running now declares one. Rebuild the Studio to show its library.")
const never = () => new Promise<never>(() => undefined)
/** The link the Studio opened with, read before the Studio rewrites it, so the library can name a component it lacks. */
export const openingLibraryLink = location.hash

function failed<P>(e: unknown): { default: React.ComponentType<P> } {
  console.error("The component library could not load", e)
  return { default: () => null }
}
/** The rail group, Go to entries, breadcrumb, phone entries and history: loaded with the Studio when declared. */
export const LibraryNav: React.LazyExoticComponent<React.ComponentType<NavProps>> = React.lazy(() => (!__STUDIO_LIBRARY__ ? never() : import("./library-nav").then((m) => ({ default: m.LibraryNav }), failed<NavProps>)))
/** The open component's page, the component list and the sidebar: loaded when the library opens. */
export const LibraryPage: React.LazyExoticComponent<React.ComponentType<PageProps>> = React.lazy(() => (!__STUDIO_LIBRARY__ ? never() : import("./library-page").then((m) => ({ default: m.LibraryPage }), failed<PageProps>)))

/** A fallback holds the part's place while its chunk loads, such as the rail item above the views, so nothing below it moves. */
export function LibrarySlot({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return hasLibrary ? <React.Suspense fallback={fallback}>{children}</React.Suspense> : null
}
