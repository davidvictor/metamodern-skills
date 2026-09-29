/*
 * A small windowed list with one tab stop (roving tabindex), arrow-key and
 * type-ahead movement. Only rows near the viewport, plus the active row, are
 * in the document, so a catalog or token set of any size stays under a few
 * dozen nodes. Rows have known heights; the caller owns row content and ARIA.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export type VirtualListHandle = {
  /** Make a row the tab stop, scroll it into view inside the list and focus it. */
  focusIndex: (index: number) => void
}

type Props = {
  count: number
  /** A number for uniform rows, or a function for mixed rows. */
  rowHeight: number | ((index: number) => number)
  /** The row that owns the tab stop. */
  active: number
  onActiveChange: (index: number) => void
  /** Attributes for the row wrapper: role, aria-*, onClick, className. */
  rowProps: (index: number) => React.HTMLAttributes<HTMLDivElement>
  children: (index: number) => React.ReactNode
  /** Text for type-ahead. Omit to disable it. */
  label?: (index: number) => string
  /** Handle extra keys (for example Left and Right in a tree). Call preventDefault to stop the default handling. */
  onRowKeyDown?: (event: React.KeyboardEvent, index: number) => void
  /** Scroll this row into view, without moving focus, whenever the value changes. */
  reveal?: number | null
  role?: string
  overscan?: number
  className?: string
  "aria-label"?: string
  "aria-rowcount"?: number
}

export const VirtualList = React.forwardRef<VirtualListHandle, Props>(function VirtualList(
  { count, rowHeight, active, onActiveChange, rowProps, children, label, onRowKeyDown, reveal, role, overscan = 8, className, ...aria },
  ref
) {
  const box = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewport, setViewport] = React.useState(0)
  const pending = React.useRef<number | null>(null)
  const typed = React.useRef({ text: "", at: 0 })

  const offsets = React.useMemo(() => {
    const out = new Array<number>(count + 1)
    out[0] = 0
    for (let i = 0; i < count; i++) out[i + 1] = out[i] + (typeof rowHeight === "number" ? rowHeight : rowHeight(i))
    return out
  }, [count, rowHeight])
  const total = offsets[count]

  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      setViewport(el.clientHeight)
      setScrollTop(el.scrollTop)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ensureVisible = React.useCallback(
    (index: number) => {
      const el = box.current
      if (!el || index < 0 || index >= count) return
      const top = offsets[index]
      const bottom = offsets[index + 1]
      if (top < el.scrollTop) el.scrollTop = top
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
    },
    [offsets, count]
  )

  const focusIndex = React.useCallback(
    (index: number) => {
      const i = Math.max(0, Math.min(count - 1, index))
      pending.current = i
      onActiveChange(i)
      ensureVisible(i)
      // The row may already be the tab stop, in which case nothing re-renders: focus now if it exists.
      const el = box.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)
      if (el) {
        el.focus({ preventScroll: true })
        pending.current = null
      }
    },
    [count, onActiveChange, ensureVisible]
  )
  React.useImperativeHandle(ref, () => ({ focusIndex }), [focusIndex])

  React.useEffect(() => {
    if (reveal != null && reveal >= 0) ensureVisible(reveal)
  }, [reveal, ensureVisible])

  // Which rows are in the document: the window plus the tab stop.
  const from = React.useMemo(() => {
    let lo = 0
    let hi = count
    const target = scrollTop
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (offsets[mid + 1] <= target) lo = mid + 1
      else hi = mid
    }
    return Math.max(0, lo - overscan)
  }, [offsets, scrollTop, count, overscan])
  let to = from
  while (to < count && offsets[to] < scrollTop + viewport) to++
  to = Math.min(count, to + overscan)
  const rendered: number[] = []
  for (let i = from; i < to; i++) rendered.push(i)
  const safeActive = Math.max(0, Math.min(count - 1, active))
  if (count > 0 && (safeActive < from || safeActive >= to)) rendered.push(safeActive)

  React.useLayoutEffect(() => {
    if (pending.current == null) return
    const el = box.current?.querySelector<HTMLElement>(`[data-index="${pending.current}"]`)
    if (el) {
      el.focus({ preventScroll: true })
      pending.current = null
    }
  })

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-index]")
    if (!row || row.parentElement?.parentElement !== box.current) return
    const i = Number(row.dataset.index)
    onRowKeyDown?.(e, i)
    if (e.defaultPrevented) return
    const page = Math.max(1, Math.floor(viewport / (total / Math.max(1, count))) - 1)
    const move = (to: number) => {
      e.preventDefault()
      focusIndex(to)
    }
    if (e.key === "ArrowDown") move(i + 1)
    else if (e.key === "ArrowUp") move(i - 1)
    else if (e.key === "Home") move(0)
    else if (e.key === "End") move(count - 1)
    else if (e.key === "PageDown") move(i + page)
    else if (e.key === "PageUp") move(i - page)
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      row.click()
    } else if (label && e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead consumes letters so they do not also trigger Studio shortcuts.
      e.preventDefault()
      e.stopPropagation()
      const now = performance.now()
      const t = typed.current
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      const start = t.text.length === 1 ? i + 1 : i
      for (let k = 0; k < count; k++) {
        const j = (start + k) % count
        if (label(j).toLowerCase().startsWith(t.text)) {
          focusIndex(j)
          break
        }
      }
    }
  }

  return (
    <div ref={box} role={role} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} onKeyDown={onKeyDown} className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain", className)} {...aria}>
      <div style={{ height: total }} className="relative w-full">
        {rendered.map((i) => {
          const props = rowProps(i)
          return (
            <div
              key={i}
              {...props}
              data-index={i}
              tabIndex={i === safeActive ? 0 : -1}
              style={{ position: "absolute", top: offsets[i], height: offsets[i + 1] - offsets[i], left: 0, right: 0, ...props.style }}
            >
              {children(i)}
            </div>
          )
        })}
      </div>
    </div>
  )
})
