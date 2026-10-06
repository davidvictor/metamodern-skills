/*
 * A component's documentation (studio-library/1), as product files in src/library/ write it and the library page
 * renders it. Types only: documentation is data, never code (references/library.md).
 */

/** Inline text: words, code, emphasis, a key, or a reference that opens another component's page. */
export type Inline = string | { code: string } | { strong: string } | { em: string } | { kbd: string } | { component: string; text?: string }
/** A run of inline text; a plain string is one run. */
export type Text = string | Inline[]
/** Marks what the product changed from its source, with why. Shown as visible text: "Adjusted for <product>: <reason>". */
export type Adjusted = { adjusted?: string }
export type ListItem = Text | ({ text: Text } & Adjusted)
export type Block =
  | ({ kind: "paragraph"; text: Text } & Adjusted)
  | ({ kind: "list"; items: ListItem[]; ordered?: boolean } & Adjusted)
  | ({ kind: "code"; language: string; code: string; title?: string } & Adjusted)
  | ({ kind: "table"; columns: string[]; rows: ({ cells: Text[] } & Adjusted)[] } & Adjusted)
  | ({ kind: "callout"; tone: "note" | "warning"; text: Text } & Adjusted)
export type RichText = Block[]
export type DocSection = { body: RichText } & Adjusted
export type Code = { language: string; code: string }

/** A preview's natural size in CSS pixels, and its height at phone width when that differs. */
type Size = { width: number; height: number; mobileHeight?: number }
/**
 * One preview: a group of variants (or an example) rendered together in one frame from an opaque product scenario
 * string, or a static capture (an image on the Studio's origin or an inline data image).
 */
export type PreviewGroup = { id: string; label: string; description?: Text; code?: Code } & Size &
  Adjusted &
  ({ scenario: string; capture?: never } | { capture: { src: string; alt: string }; scenario?: never })
/** A playground property, sent to the frame under its ID in `values`. */
export type PlaygroundProperty = { id: string; label: string; description?: string } & (
  | { kind: "text"; default: string; maxLength?: number }
  | { kind: "select"; default: string; options: { id: string; label: string }[] }
  | { kind: "switch"; default: boolean }
  | { kind: "number"; default: number; min?: number; max?: number; step?: number }
)
export type Playground = { scenario: string; properties: PlaygroundProperty[]; code?: Code } & Size
export type ApiRow = { name: string; type: string; default?: string; required?: boolean; description: Text } & Adjusted

/** The default export of a documentation module in src/library/. Every section is optional; a missing one says so on the page. */
export type ComponentDocs = {
  /** Where the text comes from when it is adapted from another library: shown with its version, and its notice at the page's foot. */
  source?: { name: string; version: string; notice: string }
  preview: { playground?: Playground; groups: PreviewGroup[] } & Adjusted
  whenToUse?: DocSection
  whenNotToUse?: DocSection
  usage?: DocSection
  examples?: { intro?: RichText; items: PreviewGroup[] } & Adjusted
  api?: { props: ApiRow[]; notes?: RichText } & Adjusted
  keyboard?: DocSection
  accessibility?: DocSection
  motion?: DocSection
  responsive?: DocSection
  performance?: DocSection
  notesForAI?: DocSection
}
