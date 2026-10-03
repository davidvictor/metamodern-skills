import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CircleIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { VirtualList } from "@/studio/virtual-list"
import { Button, INPUT } from "./layout"
import { filterRows, nextSort, sortRows, type SortState } from "./table-model"

/** Label and value pairs. */
export function PropertyList({ items, label }: { items: { label: string; value: React.ReactNode; hint?: string }[]; label?: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((item) => (
        <React.Fragment key={item.label}>
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words">
            {item.value}
            {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export type StatusTone = "ok" | "warning" | "error" | "info" | "neutral"
const TONE: Record<StatusTone, string> = {
  ok: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  error: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  neutral: "bg-muted text-muted-foreground",
}

/** A state in a glyph and a word; color only repeats it. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const Glyph = tone === "error" || tone === "warning" ? TriangleAlertIcon : tone === "ok" ? CheckIcon : CircleIcon
  return (
    <Badge variant="outline" className={cn("gap-1.5 border-transparent font-medium", TONE[tone])}>
      <Glyph aria-hidden className="size-3" />
      {children}
    </Badge>
  )
}

/** A figure with its label and, optionally, its state. */
export function StatusTile({ label, value, status, detail }: { label: string; value: React.ReactNode; status?: { tone: StatusTone; label: string }; detail?: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-xl border bg-card p-4 text-card-foreground">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {(status || detail) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
          {detail}
        </div>
      )}
    </div>
  )
}

export type Column<T> = {
  id: string
  label: string
  /** The value sorted and filtered on, and shown when there is no render. */
  value: (row: T) => string | number
  render?: (row: T) => React.ReactNode
  /** A CSS grid track, such as "8rem". Defaults to an equal share. */
  width?: string
  align?: "start" | "end"
}

const COARSE = "(pointer: coarse)"
const subscribeCoarse = (onChange: () => void) => {
  const query = matchMedia(COARSE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const useCoarse = () => React.useSyncExternalStore(subscribeCoarse, () => matchMedia(COARSE).matches, () => false)

/** Rows with sortable columns, an optional filter, and windowed rendering with one tab stop for any size. */
export function DataTable<T>({ label, rows, columns, filterable, initialSort, onOpen, empty = "Nothing to show.", height = 360 }: { label: string; rows: T[]; columns: Column<T>[]; filterable?: boolean; initialSort?: SortState; onOpen?: (row: T) => void; empty?: string; height?: number }) {
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortState | null>(initialSort ?? null)
  const [active, setActive] = React.useState(0)
  const rowHeight = useCoarse() ? 44 : 36
  const shown = React.useMemo(() => sortRows(filterRows(rows, columns, query), columns, sort), [rows, columns, query, sort])
  const template = columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ")
  return (
    <div className="grid gap-2">
      {filterable && (
        <Input
          aria-label={`Filter ${label}`}
          placeholder="Filter"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          className={INPUT}
        />
      )}
      <div role="grid" aria-label={label} aria-rowcount={shown.length + 1} aria-colcount={columns.length} className="flex flex-col overflow-hidden rounded-xl border">
        <div role="row" aria-rowindex={1} className="grid border-b bg-muted/40" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => {
            const direction = sort?.column === c.id ? sort.direction : null
            return (
              <div key={c.id} role="columnheader" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"} className={cn("flex min-w-0", c.align === "end" && "justify-end")}>
                <Button variant="ghost" size="sm" className="h-9 min-w-0 gap-1 rounded-none px-3 text-xs font-medium text-muted-foreground" onClick={() => setSort(nextSort(sort, c.id))}>
                  <span className="truncate">{c.label}</span>
                  {direction === "asc" ? <ArrowUpIcon aria-hidden /> : direction === "desc" ? <ArrowDownIcon aria-hidden /> : null}
                </Button>
              </div>
            )
          })}
        </div>
        {shown.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{query ? `Nothing matches "${query}". Clear the filter.` : empty}</p>
        ) : (
          <div className="flex flex-col" style={{ height: Math.min(height, shown.length * rowHeight) }}>
            <VirtualList
              role="rowgroup"
              count={shown.length}
              rowHeight={rowHeight}
              active={Math.min(active, shown.length - 1)}
              onActiveChange={setActive}
              label={(i) => String(columns[0]?.value(shown[i]) ?? "")}
              rowProps={(i) => ({
                role: "row",
                "aria-rowindex": i + 2,
                onClick: onOpen ? () => onOpen(shown[i]) : undefined,
                className: cn("grid items-center border-b text-sm outline-none last:border-b-0 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]", onOpen && "cursor-pointer hover:bg-muted/60"),
                style: { gridTemplateColumns: template },
              })}
            >
              {(i) =>
                columns.map((c) => (
                  <div key={c.id} role="gridcell" className={cn("min-w-0 truncate px-3", c.align === "end" && "text-right tabular-nums")}>
                    {c.render ? c.render(shown[i]) : c.value(shown[i])}
                  </div>
                ))
              }
            </VirtualList>
          </div>
        )}
      </div>
    </div>
  )
}
