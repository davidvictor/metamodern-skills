/*
 * Documentation text as React elements: paragraphs, lists, tables, callouts, code and inline runs, plus the visible
 * "Adjusted for <product>" marks. Never HTML: every string is rendered as text.
 */
import * as React from "react"
import { InfoIcon, TriangleAlertIcon } from "lucide-react"
import { adapter } from "@/adapter"
import { cn } from "@/lib/utils"
import { CodeBlock } from "./code-block"
import type { Adjusted, Block, Inline, ListItem, RichText, Text } from "./schema"

/** Opens another component's page; provided by the library page. */
export const OpenComponent = React.createContext<(id: string) => void>(() => undefined)

const labelOf = (id: string) => adapter.library?.components.find((c) => c.id === id)?.label

/** What the product changed from the documentation's source, in text: never only a tooltip. */
export function AdjustedNote({ reason, className }: { reason?: string; className?: string }) {
  if (!reason) return null
  return (
    <p data-adjusted className={cn("text-xs text-muted-foreground", className)}>
      <span className="mr-1.5 rounded-sm border px-1 py-px font-medium text-foreground">Adjusted</span> for {adapter.product.name}: {reason}
    </p>
  )
}

export function InlineText({ text }: { text: Text }) {
  const open = React.useContext(OpenComponent)
  const runs: Inline[] = typeof text === "string" ? [text] : text
  return (
    <>
      {runs.map((r, i) => {
        if (typeof r === "string") return <React.Fragment key={i}>{r}</React.Fragment>
        if ("code" in r) return <code key={i} className="rounded bg-muted px-1 py-px font-mono text-[0.9em]">{r.code}</code>
        if ("strong" in r) return <strong key={i} className="font-semibold">{r.strong}</strong>
        if ("em" in r) return <em key={i}>{r.em}</em>
        if ("kbd" in r) return <kbd key={i} className="rounded border bg-muted px-1 font-mono text-[0.85em]">{r.kbd}</kbd>
        // A reference to a component the library does not declare is plain text, never a button that opens nothing
        // (docsProblems reports it before a page renders).
        const label = labelOf(r.component)
        if (!label) return <React.Fragment key={i}>{r.text ?? r.component}</React.Fragment>
        // An inline reference: text in a sentence, so the inline exception to the 44 px target applies (data-inline).
        return (
          <button key={i} type="button" data-inline className="rounded-sm font-medium text-foreground underline underline-offset-2 hover:decoration-2" onClick={() => open(r.component)}>
            {r.text ?? label}
          </button>
        )
      })}
    </>
  )
}

const itemOf = (item: ListItem): { text: Text } & Adjusted => (typeof item === "string" || Array.isArray(item) ? { text: item } : item)

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <div className="grid gap-1">
          <p className="text-pretty">
            <InlineText text={block.text} />
          </p>
          <AdjustedNote reason={block.adjusted} />
        </div>
      )
    case "list": {
      const List = block.ordered ? "ol" : "ul"
      return (
        <div className="grid gap-1">
          <List className={cn("grid gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
            {block.items.map((raw, i) => {
              const item = itemOf(raw)
              return (
                <li key={i}>
                  <InlineText text={item.text} />
                  <AdjustedNote reason={item.adjusted} className="mt-0.5" />
                </li>
              )
            })}
          </List>
          <AdjustedNote reason={block.adjusted} />
        </div>
      )
    }
    case "code":
      return (
        <div className="grid gap-1">
          <CodeBlock code={block.code} language={block.language} title={block.title} />
          <AdjustedNote reason={block.adjusted} />
        </div>
      )
    case "table":
      return (
        <div className="grid gap-1">
          <div role="region" aria-label={block.columns.join(", ")} tabIndex={0} className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {block.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i} className="border-t align-top">
                    {row.cells.map((cell, j) => (
                      <td key={j} className="px-3 py-2">
                        <InlineText text={cell} />
                        {j === row.cells.length - 1 && <AdjustedNote reason={row.adjusted} className="mt-1" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdjustedNote reason={block.adjusted} />
        </div>
      )
    case "callout":
      return (
        <div role="note" className={cn("flex gap-3 rounded-lg border p-3", block.tone === "warning" && "border-warning/60")}>
          {block.tone === "warning" ? <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" /> : <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />}
          <div className="grid gap-1">
            <p>
              <span className="sr-only">{block.tone === "warning" ? "Warning: " : "Note: "}</span>
              <InlineText text={block.text} />
            </p>
            <AdjustedNote reason={block.adjusted} />
          </div>
        </div>
      )
  }
}

export function Rich({ blocks }: { blocks?: RichText }) {
  if (!blocks?.length) return null
  return (
    <div className="grid gap-4 text-sm leading-relaxed">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  )
}
