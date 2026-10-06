/*
 * One preview on a library page: the playground, a preview group or an example, each one live frame for the whole
 * group (never one per variant), with Preview and Code tabs, Phone width and an expanded view. A page's frames mount
 * only near the viewport and at most LIVE_FRAMES at once, the playground first and then the nearest; a preview without
 * a frame keeps its size. Frames load only from the adapter (previewSource) with its isolation, through the same host
 * as every view; the documentation supplies scenario strings and validated values, nothing else (references/library.md).
 */
import * as React from "react"
import { ExpandIcon, SmartphoneIcon } from "lucide-react"
import { adapter } from "@/adapter"
import { useStudio } from "@/store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FidelityBadge, PreviewFrame as Boundary, useFit, type EmptyState } from "@/components/studio/bits"
import { LivePreview, type LivePreviewHandle, type LiveStatus } from "@/studio/live-preview"
import { TARGET } from "@/kit/layout"
import type { InputValue } from "@/studio/types"
import { CodeBlock } from "./code-block"
import { AdjustedNote, InlineText } from "./rich-text"
import { captureSource, libraryProfile, LIVE_FRAMES, MOBILE_WIDTH, NEAR_PX, pickLive, previewSource } from "./model"
import type { Code, Text } from "./schema"

/** Where this Studio's library previews load from, decided once from the adapter. */
const SOURCE = previewSource(adapter, location.href)
const PROFILE = libraryProfile(adapter.axes.profiles, adapter.axes.defaultProfile)
const PAD = 48

type Seen = { near: boolean; pinned: boolean; el: Element }
/**
 * Which of a page's previews hold a live frame: the nearest LIVE_FRAMES (the playground first), none while one is
 * expanded. The observer only says which previews are near; their distances are measured afresh from the page every
 * time the budget decides (on an observer change, and on the page's scroll or a resize, once per animation frame), so a
 * preview that stays inside the margin while the page scrolls is ranked by where it is now, not where it entered.
 */
function createBudget() {
  const seen = new Map<string, Seen>()
  let live = new Set<string>()
  let expanded: string | null = null
  let root: HTMLElement | null = null
  const subscribers = new Set<() => void>()
  const distance = (el: Element) => {
    const r = el.getBoundingClientRect()
    const b = root?.getBoundingClientRect()
    const middle = b ? b.top + b.height / 2 : innerHeight / 2
    return Math.abs(r.top + r.height / 2 - middle)
  }
  const update = () => {
    const slots = [...seen].map(([id, s]) => ({ id, near: s.near, pinned: s.pinned, distance: s.near ? distance(s.el) : Infinity }))
    const next = expanded ? new Set<string>() : pickLive(slots, LIVE_FRAMES)
    if (next.size === live.size && [...next].every((id) => live.has(id))) return
    live = next
    subscribers.forEach((f) => f())
  }
  let frame = 0
  const onMove = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
  }
  return {
    see: (id: string, s: Seen) => {
      seen.set(id, s)
      update()
    },
    forget: (id: string) => {
      seen.delete(id)
      update()
    },
    expand: (id: string | null) => {
      expanded = id
      update()
    },
    /** Follows the page's scroller (and the window's size) while the page is open; returns the cleanup. */
    attach: (el: HTMLElement | null) => {
      root = el
      el?.addEventListener("scroll", onMove, { passive: true })
      addEventListener("resize", onMove)
      // Previews report before their page attaches: rank them again against the page itself.
      update()
      return () => {
        el?.removeEventListener("scroll", onMove)
        removeEventListener("resize", onMove)
        cancelAnimationFrame(frame)
        frame = 0
      }
    },
    subscribe: (f: () => void) => {
      subscribers.add(f)
      return () => {
        subscribers.delete(f)
      }
    },
    isLive: (id: string) => live.has(id),
  }
}
export type Budget = ReturnType<typeof createBudget>
/** The page's budget and its scroller, which bounds "near". */
export const BudgetContext = React.createContext<{ budget: Budget; root: React.RefObject<HTMLElement | null> } | null>(null)
/** One budget per page. */
export function useBudget() {
  const [budget] = React.useState(createBudget)
  return budget
}
const noSubscribe = () => () => undefined

/** A preview as a block shows it: a preview group, an example, or the playground. */
export type BlockSpec = { id: string; label: string; description?: Text; width: number; height: number; mobileHeight?: number; code?: Code; adjusted?: string; scenario?: string; capture?: { src: string; alt: string } }

const sizeOf = (spec: BlockSpec, phone: boolean) => ({ w: phone ? MOBILE_WIDTH : spec.width, h: phone ? (spec.mobileHeight ?? spec.height) : spec.height })

/**
 * A wide component's preview and code (LibraryComponent.wide): 1.5 times the text column, or the page's width inside
 * its gutters when that is less, centred on the column. The page is the size container (`100cqw`) and names its gutter
 * (`--library-gutter`); percentages are of the column. The column is centred on the page, so the block breaks out
 * evenly on both sides and its left edge never passes the gutter.
 */
const WIDE: React.CSSProperties = { width: "min(150%, 100cqw - 2 * var(--library-gutter))", marginLeft: "calc(50% - min(75%, 50cqw - var(--library-gutter)))", maxWidth: "none" }

export function PreviewBlock({ component, spec, values, pinned, liveCode, wide }: { component: string; spec: BlockSpec; values?: Record<string, InputValue>; pinned?: boolean; liveCode?: boolean; wide?: boolean }) {
  const s = useStudio()
  const page = React.useContext(BudgetContext)
  const key = `${component}/${spec.id}`
  const title = adapter.library?.components.find((c) => c.id === component)?.label ?? component
  const label = `${title}: ${spec.label}`
  const [tab, setTab] = React.useState("preview")
  const [phone, setPhone] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const wrap = React.useRef<HTMLElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const handle = React.useRef<LivePreviewHandle>(null)
  const { w, h } = sizeOf(spec, phone)
  const scale = useFit(box, w, h, "fit", PAD, true)

  // Whether this preview is near the page's viewport, for the budget (which measures how near). The observer lives as long as the preview.
  React.useEffect(() => {
    const el = wrap.current
    if (!el || !page) return
    const io = new IntersectionObserver(
      ([e]) => page.budget.see(key, { near: e.isIntersecting, pinned: !!pinned, el }),
      { root: page.root.current, rootMargin: `${NEAR_PX}px 0px` }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      page.budget.forget(key)
    }
  }, [page, key, pinned])
  const live = React.useSyncExternalStore(page?.budget.subscribe ?? noSubscribe, () => !!page?.budget.isLive(key))

  // As every preview: a failure belongs to the frame that reported it, and Retry mounts a fresh runtime.
  const [status, setStatus] = React.useState<LiveStatus | null>(null)
  const [retry, setRetry] = React.useState(0)
  const frameKey = JSON.stringify([spec.scenario, s.theme])
  const [shown, setShown] = React.useState(frameKey)
  if (shown !== frameKey) {
    setShown(frameKey)
    setStatus(null)
  }
  const capture = spec.capture ? captureSource(spec.capture.src, location.href) : null
  const empty: EmptyState | undefined = spec.capture
    ? capture
      ? undefined
      : { title: "Capture refused", description: "A capture must be an image on this Studio's origin or an inline data image." }
    : "unavailable" in SOURCE
      ? { title: "No live preview", description: SOURCE.unavailable }
      : status?.status === "error" && !status.previous
        ? { title: "The preview did not start", description: status.reason ?? "The frame reported an error.", tone: "danger", action: { label: "Retry", onClick: () => { setStatus(null); setRetry((n) => n + 1) } } }
        : undefined
  const frame = !spec.capture && live && "src" in SOURCE && spec.scenario ? { src: SOURCE.src, origin: SOURCE.origin, scenario: spec.scenario } : null

  // The playground's Code tab asks its frame for the code of the current values, when the frame announces code.
  const [generated, setGenerated] = React.useState<Code | null>(null)
  const valuesKey = JSON.stringify(values ?? {})
  React.useEffect(() => {
    if (tab !== "code" || !liveCode) return
    let on = true
    void (handle.current?.code() ?? Promise.resolve(null)).then((c) => {
      if (on) setGenerated(c ? { language: c.language, code: c.text } : null)
    })
    return () => {
      on = false
    }
  }, [tab, liveCode, valuesKey, status?.status])
  const code = (liveCode && generated) || spec.code

  const expand = () => {
    setExpanded(true)
    page?.budget.expand(key)
  }
  const collapse = () => {
    setExpanded(false)
    page?.budget.expand(null)
  }
  const labelId = React.useId()
  return (
    <section ref={wrap} data-preview-block={spec.id} data-live={frame ? "true" : "false"} aria-labelledby={labelId} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 id={labelId} className="text-sm font-semibold">
            {spec.label}
          </h3>
          {spec.description && (
            <p className="text-sm text-pretty text-muted-foreground">
              <InlineText text={spec.description} />
            </p>
          )}
        </div>
        <div role="toolbar" aria-label={`${spec.label} preview`} className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className={TARGET} aria-label="Phone width" aria-pressed={phone} disabled={!spec.scenario} onClick={() => setPhone((v) => !v)}>
            <SmartphoneIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" className={TARGET} aria-label={`Expand ${spec.label}`} disabled={!!empty && !capture} onClick={expand}>
            <ExpandIcon />
          </Button>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-w-0">
        <TabsList variant="line" aria-label={`${spec.label}: preview or code`} className="pointer-coarse:h-auto">
          <TabsTrigger value="preview" className={TARGET}>
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" className={TARGET}>
            Code
          </TabsTrigger>
        </TabsList>
        <TabsContent value="preview" keepMounted className="grid gap-2" style={wide ? WIDE : undefined} data-wide={wide ? "" : undefined}>
          <div ref={box} className="stage-surface flex justify-center overflow-hidden rounded-xl p-6">
            <Boundary w={w} h={h} scale={scale} profile={{ kind: phone ? "phone" : "desktop" }} appearance={status?.appearance} empty={empty} loading={!!frame && (!status || status.status === "loading")} label={label}>
              {capture ? (
                <img src={capture} alt={spec.capture?.alt ?? ""} className="absolute inset-0 size-full object-contain" />
              ) : frame ? (
                <LivePreview
                  ref={handle}
                  src={frame.src}
                  origin={frame.origin}
                  isolation={adapter.frameIsolation}
                  inputs={{ scenario: frame.scenario, theme: s.theme, profile: PROFILE, values: values ?? {}, commands: [] }}
                  // Values and width never remount: values go in place to a frame with live-values, and the width is the frame element's.
                  mountKey={JSON.stringify([frame.scenario, s.theme, retry])}
                  draft={s.viewDraft(s.theme)}
                  w={w}
                  h={h}
                  scale={scale}
                  label={label}
                  onStatus={setStatus}
                />
              ) : (
                <div data-placeholder className="flex size-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  Loads when on screen
                </div>
              )}
            </Boundary>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {capture && <FidelityBadge mode="static">Static capture</FidelityBadge>}
            <span className="tabular-nums">
              {w} × {h}
              {scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : " · actual size"}
            </span>
          </p>
        </TabsContent>
        <TabsContent value="code" style={wide ? WIDE : undefined}>{code ? <CodeBlock code={code.code} language={code.language} title={`${spec.label} code`} /> : <p className="text-sm text-muted-foreground">No code for this preview.</p>}</TabsContent>
      </Tabs>
      <AdjustedNote reason={spec.adjusted} />
      <Dialog open={expanded} onOpenChange={(open) => !open && collapse()}>
        <DialogContent data-kit className="flex h-[min(90svh,56rem)] w-[min(96vw,88rem)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="sr-only">The preview at its natural size.</DialogDescription>
          {expanded && <Expanded spec={spec} capture={capture} values={values} phone={phone} label={label} />}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** The expanded view: the same preview at its natural size, fitted to the dialog, as its own runtime. */
function Expanded({ spec, capture, values, phone, label }: { spec: BlockSpec; capture: string | null; values?: Record<string, InputValue>; phone: boolean; label: string }) {
  const s = useStudio()
  const box = React.useRef<HTMLDivElement>(null)
  const { w, h } = sizeOf(spec, phone)
  const scale = useFit(box, w, h, "fit", PAD)
  const [status, setStatus] = React.useState<LiveStatus | null>(null)
  const source = !capture && spec.scenario && "src" in SOURCE ? SOURCE : null
  const empty: EmptyState | undefined = capture || source ? undefined : { title: "No live preview", description: "unavailable" in SOURCE ? SOURCE.unavailable : "This preview has no scenario." }
  return (
    <div ref={box} className="stage-surface flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl p-6">
      <Boundary w={w} h={h} scale={scale} profile={{ kind: phone ? "phone" : "desktop" }} appearance={status?.appearance} empty={empty} loading={!!source && (!status || status.status === "loading")} label={label}>
        {capture ? (
          <img src={capture} alt={spec.capture?.alt ?? ""} className="absolute inset-0 size-full object-contain" />
        ) : source && spec.scenario ? (
          <LivePreview src={source.src} origin={source.origin} isolation={adapter.frameIsolation} inputs={{ scenario: spec.scenario, theme: s.theme, profile: PROFILE, values: values ?? {}, commands: [] }} mountKey={JSON.stringify([spec.scenario, s.theme])} draft={s.viewDraft(s.theme)} w={w} h={h} scale={scale} label={label} onStatus={setStatus} />
        ) : null}
      </Boundary>
    </div>
  )
}
