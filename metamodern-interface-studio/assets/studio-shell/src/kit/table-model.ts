/* DataTable's model: filter on every column, sort stably either way. Pure, so node tests load it. */
export type SortState = { column: string; direction: "asc" | "desc" }
export type ColumnValue<T> = { id: string; value: (row: T) => string | number }

export function filterRows<T>(rows: T[], columns: ColumnValue<T>[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => columns.some((c) => String(c.value(row)).toLowerCase().includes(q)))
}

export function sortRows<T>(rows: T[], columns: ColumnValue<T>[], sort: SortState | null) {
  const column = sort && columns.find((c) => c.id === sort.column)
  if (!sort || !column) return rows
  const direction = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = column.value(a)
    const y = column.value(b)
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" })
    return order * direction
  })
}

/** Clicking a column sorts by it ascending; clicking it again reverses. */
export const nextSort = (sort: SortState | null, column: string): SortState => (sort?.column === column ? { column, direction: sort.direction === "asc" ? "desc" : "asc" } : { column, direction: "asc" })
