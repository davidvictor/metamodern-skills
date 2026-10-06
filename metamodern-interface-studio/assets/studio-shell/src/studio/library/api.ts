/*
 * The library API documentation files import as @studio/library (references/library.md): the documentation map and
 * the documentation types. Public surface, versioned as studio-library/1. Documentation is data: this module is all a
 * file under src/library/ may import besides its own files.
 */
import type { ComponentDocs } from "./schema"

export const LIBRARY_VERSION = "studio-library/1"

export type { Adjusted, ApiRow, Block, Code, ComponentDocs, DocSection, Inline, ListItem, Playground, PlaygroundProperty, PreviewGroup, RichText, Text } from "./schema"

/** Loads one component's documentation module when its page opens. */
export type DocsLoader = () => Promise<{ default: ComponentDocs }>
export type LibraryDefinition = { docs: Record<string, DocsLoader> }

/** The default export of src/library/index.ts. Keys are plain component IDs the adapter declares; any other fails the build. */
export function defineLibrary(docs: Record<string, DocsLoader>): LibraryDefinition {
  return { docs }
}
