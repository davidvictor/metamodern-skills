import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { INPUT } from "./layout"

export type SelectListItem = { id: string; label: string; description?: string; meta?: string }
export type SelectListGroup = { id: string; label: string; items: SelectListItem[] }
export type SelectListProps = {
  /** The list's accessible name. */
  label: string
  /** Shown in order, each under its heading. Item IDs are unique across groups. */
  groups: SelectListGroup[]
  /** The selected item, or null. */
  value: string | null
  /** Called with the item a click or a key selects. Selection follows focus: moving with the keyboard selects. */
  onChange: (id: string) => void
  /** Adds a filter field above the list that narrows it across groups. */
  filterable?: boolean
  /** The filter field's accessible name. Defaults to "Filter" and the list's label. */
  filterLabel?: string
  /** Shown when there is nothing to list. */
  emptyLabel?: string
}

const matches = (item: SelectListItem, query: string) => !query || [item.label, item.description, item.meta].some((t) => t?.toLowerCase().includes(query))

/** Keys that move within the list: down and up (also j and k), first and last. */
const MOVES: Record<string, "next" | "previous" | "first" | "last"> = { ArrowDown: "next", j: "next", ArrowUp: "previous", k: "previous", Home: "first", End: "last" }

/**
 * A grouped list to step through, with listbox semantics: one tab stop, and selection follows focus, so the arrow keys
 * (and j and k) move and select, Home and End go to the first and last item. Groups show their headings; the optional
 * filter narrows every group by label, description and meta, and keeps the selection while it still matches. The
 * selected item is scrolled into view.
 */
export function SelectList({ label, groups, value, onChange, filterable, filterLabel, emptyLabel = "Nothing to show." }: SelectListProps) {
  const [query, setQuery] = React.useState("")
  const base = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const shown = React.useMemo(() => groups.map((g) => ({ ...g, items: g.items.filter((i) => matches(i, q)) })).filter((g) => g.items.length), [groups, q])
  const flat = React.useMemo(() => shown.flatMap((g) => g.items), [shown])
  const stop = flat.some((i) => i.id === value) ? value : (flat[0]?.id ?? null)
  const optionId = (id: string) => `${base}-o-${id}`
  const optionEl = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-option="${CSS.escape(id)}"]`) ?? null

  // The selected item stays in view, whether it was chosen here or by the module (a link, j and k on the page).
  React.useEffect(() => {
    if (value) listRef.current?.querySelector(`[data-option="${CSS.escape(value)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [value, shown])

  const choose = (id: string) => {
    if (id !== value) onChange(id)
    const el = optionEl(id)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !flat.length) return
    const move = e.shiftKey ? undefined : MOVES[e.key]
    if (move) {
      e.preventDefault()
      const at = flat.findIndex((i) => i.id === stop)
      const to = move === "first" ? 0 : move === "last" ? flat.length - 1 : Math.min(flat.length - 1, Math.max(0, at + (move === "next" ? 1 : -1)))
      choose(flat[to].id)
    } else if ((e.key === "Enter" || e.key === " ") && stop) {
      e.preventDefault()
      choose(stop)
    }
  }

  return (
    // Positioned, so the visually hidden count stays inside the page's scroller.
    <div className="relative grid gap-2" data-select-list>
      {filterable && (
        <Input type="search" aria-label={filterLabel ?? `Filter ${label}`} aria-controls={`${base}-list`} placeholder="Filter" value={query} onChange={(e) => setQuery(e.target.value)}
          // Down from the filter goes into the list, at the selection when it is listed.
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && stop) {
              e.preventDefault()
              choose(stop)
            }
          }}
          className={INPUT}
        />
      )}
      {filterable && (
        <p role="status" aria-live="polite" className="sr-only">
          {q ? `${flat.length} ${flat.length === 1 ? "match" : "matches"}` : ""}
        </p>
      )}
      <div ref={listRef} id={`${base}-list`} role="listbox" aria-label={label} aria-describedby={flat.length ? undefined : `${base}-empty`} onKeyDown={onKeyDown} className="grid gap-2">
        {shown.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`${base}-g-${g.id}`} className="grid gap-0.5">
            <div role="presentation" id={`${base}-g-${g.id}`} className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
              {g.label}
            </div>
            {g.items.map((item) => {
              const selected = item.id === value
              return (
                <div
                  key={item.id}
                  id={optionId(item.id)}
                  data-option={item.id}
                  role="option"
                  aria-selected={selected}
                  tabIndex={item.id === stop ? 0 : -1}
                  onClick={() => choose(item.id)}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm outline-none select-none hover:bg-muted/60 pointer-coarse:min-h-11",
                    selected && "bg-accent font-medium text-accent-foreground shadow-[inset_2px_0_0_var(--foreground)] hover:bg-accent",
                    selected && "forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:[forced-color-adjust:none] forced-colors:**:text-[HighlightText]"
                  )}
                >
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{item.label}</span>
                    {item.description && <span className="truncate text-xs font-normal text-muted-foreground">{item.description}</span>}
                  </span>
                  {item.meta && <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{item.meta}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {!flat.length && (
        <p id={`${base}-empty`} className="px-2 text-sm text-muted-foreground">
          {q ? `Nothing matches "${query.trim()}". Edit the filter.` : emptyLabel}
        </p>
      )}
    </div>
  )
}
