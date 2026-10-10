import * as React from "react"
import {
  CircleIcon,
  CircleDotIcon,
  SquareIcon,
  SquareDashedIcon,
  SlashIcon,
  MonitorIcon,
  LaptopIcon,
  TabletIcon,
  SmartphoneIcon,
  SunIcon,
  MoonIcon,
  SunMediumIcon,
  MoonStarIcon,
  PaletteIcon,
  ImageOffIcon,
  TriangleAlertIcon,
} from "@/icons"
import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { adapter } from "@/adapter"
import { useStudio } from "@/store"
import type { Capture, Fidelity, Mode, Profile, Theme } from "@/studio/types"
import { scaledFrameRadius } from "@/studio/profile-frame"

type Look = Mode | "recreation"
const FID: Record<Look, { icon: React.ElementType; cls: string }> = {
  real: { icon: CircleIcon, cls: "text-success [&_svg]:fill-current" },
  simulated: { icon: CircleDotIcon, cls: "text-info" },
  static: { icon: SquareIcon, cls: "text-[var(--fidelity-static)] [&_svg]:fill-current" },
  recreation: { icon: SquareDashedIcon, cls: "text-warning" },
  unavailable: { icon: SlashIcon, cls: "text-muted-foreground" },
}

/** Fidelity classes map onto four badge shapes: filled, ring, square, dashed. */
export const lookOf = (f: Fidelity): Look => ({ actual: "real", "instrumented-native": "real", "actual-substituted": "simulated", "static-capture": "static", recreation: "recreation" } as const)[f]

export function FidelityBadge({ mode, children, className }: { mode: Look; children: React.ReactNode; className?: string }) {
  const f = FID[mode]
  const Icon = f.icon
  return (
    <Badge variant="outline" className={cn("gap-1 bg-background/90 font-medium backdrop-blur [&_svg]:size-2.5!", f.cls, className)}>
      <Icon aria-hidden />
      <span className="text-foreground">{children}</span>
    </Badge>
  )
}

export function StatusBadge({ kind, children }: { kind: "ready" | "loading" | "modified" | "stale" | "unresolved" | "draft"; children: React.ReactNode }) {
  const cls = {
    ready: "border-transparent bg-success-surface text-success",
    loading: "border-transparent bg-muted text-muted-foreground",
    modified: "border-transparent bg-warning-surface text-warning",
    stale: "border-transparent bg-warning-surface text-warning",
    unresolved: "border-transparent bg-danger-surface text-danger",
    draft: "border-transparent bg-info-surface text-info",
  }[kind]
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium transition-colors", cls)}>
      {kind === "loading" ? <Spinner className="size-3" /> : kind === "unresolved" || kind === "stale" ? <TriangleAlertIcon className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </Badge>
  )
}

export const themeIcon = (t: Theme) => ({ sun: SunIcon, moon: MoonIcon, "sun-contrast": SunMediumIcon, "moon-contrast": MoonStarIcon, swatch: PaletteIcon })[t.icon ?? "swatch"]
export function ProfileIcon({ profile }: { profile: Profile }) {
  switch (profile.kind) {
    case "phone": return <SmartphoneIcon />
    case "tablet": return <TabletIcon />
    case "laptop": return <LaptopIcon />
    default: return <MonitorIcon />
  }
}

/** Fit a preview inside its box; returns the displayed scale. Narrow screens fit to width and let the stage scroll. */
export function useFit(ref: React.RefObject<HTMLElement | null>, w: number, h: number, zoom: "fit" | number, pad = 56, widthOnly = false) {
  const [scale, setScale] = React.useState(0.5)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (zoom !== "fit") return setScale(zoom / 100)
      const bw = el.clientWidth - pad
      const bh = el.clientHeight - pad - 34
      setScale(Math.max(0.05, Math.min(1, bw / w, widthOnly ? 9 : bh / h)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, w, h, zoom, pad, widthOnly])
  return scale
}

export type EmptyState = { title: string; description: string; tone?: "neutral" | "danger"; action?: { label: string; onClick: () => void } }

/**
 * The anchor highlight and the label naming it. The frame clips its content, so the label sits above the ring when
 * there is room inside the frame, below it when there is not, and inside the ring's top edge when neither fits; it
 * runs from the highlight's edge toward the frame's far edge and truncates there. It takes no pointer (it lies over the
 * product), so a tooltip could never show: the full name stays in its text, which assistive technology reads whole, after a
 * visually hidden "Highlighted:".
 */
function AnchorLayer({ anchor, w, h, scale }: { anchor: { x: number; y: number; w: number; h: number; label: string }; w: number; h: number; scale: number }) {
  const LABEL = 20
  const GAP = 4
  const EDGE = 2
  const W = w * scale
  const H = h * scale
  const ring = { left: anchor.x * scale - 4, top: anchor.y * scale - 4, width: anchor.w * scale + 8, height: anchor.h * scale + 8 }
  const bottom = ring.top + ring.height
  const placement = ring.top - GAP - LABEL >= EDGE ? "above" : bottom + GAP + LABEL <= H - EDGE ? "below" : "inside"
  const top = placement === "above" ? ring.top - GAP - LABEL : placement === "below" ? bottom + GAP : Math.max(EDGE, Math.min(H - LABEL - EDGE, ring.top + GAP))
  const end = anchor.x > w / 2
  // The label grows from the highlight's edge toward the frame's far edge, so its width is the room on that side.
  const right = Math.max(EDGE, W - ring.left - ring.width)
  const left = Math.max(EDGE, ring.left)
  return (
    <>
      <div className="anchor-ring" style={ring} />
      <span
        className="anchor-label pointer-events-none absolute truncate rounded-md bg-anchor px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-anchor-foreground shadow-sm"
        data-placement={placement}
        style={{ top, maxWidth: Math.max(0, W - EDGE - (end ? right : left)), ...(end ? { right } : { left }) }}
      >
        <span className="sr-only">Highlighted: </span>
        {anchor.label}
      </span>
    </>
  )
}

/**
 * The preview boundary: frame line, corner ticks and the anchor layer. The
 * content is a live frame, a capture or an explicit empty state, never a stand-in.
 */
export function PreviewFrame({ w, h, scale, profile, appearance, anchor, empty, loading, className, label, children }: {
  w: number
  h: number
  scale: number
  profile: Pick<Profile, "kind" | "frameRadius">
  appearance?: "light" | "dark"
  anchor?: { x: number; y: number; w: number; h: number; label: string }
  empty?: EmptyState
  loading?: boolean
  className?: string
  label?: string
  children?: React.ReactNode
}) {
  const radius = scaledFrameRadius(profile, w, h, scale)
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: w * scale, height: h * scale }}>
      <div className="preview-ticks" aria-hidden>
        <i /><i /><i /><i />
      </div>
      <div className="preview-frame size-full" data-appearance={appearance} style={{ borderRadius: radius }} role={empty ? undefined : "group"} aria-label={label}>
        {empty ? (
          <div className="flex size-full items-center justify-center bg-muted/70 p-4">
            <Empty className={cn("max-w-xs border-0 p-2", empty.tone === "danger" && "text-danger")}>
              <EmptyHeader>
                <EmptyMedia variant="icon">{empty.tone === "danger" ? <TriangleAlertIcon /> : <ImageOffIcon />}</EmptyMedia>
                <EmptyTitle className="text-sm">{empty.title}</EmptyTitle>
                <EmptyDescription className="text-xs">{empty.description}</EmptyDescription>
              </EmptyHeader>
              {empty.action && (
                <EmptyContent>
                  <Button size="sm" variant="outline" onClick={empty.action.onClick}>{empty.action.label}</Button>
                </EmptyContent>
              )}
            </Empty>
          </div>
        ) : (
          children
        )}
        {anchor && !empty && !loading && <AnchorLayer anchor={anchor} w={w} h={h} scale={scale} />}
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-3 animate-in fade-in-0">
            <Badge variant="secondary" className="gap-1.5 shadow-sm">
              <Spinner className="size-3" /> Staging new preview
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}

export function CaptureImage({ capture }: { capture: Capture }) {
  return <img src={capture.src} alt="" draggable={false} className="block size-full object-cover object-top select-none" />
}

export function ScaleNote({ w, h, scale }: { w: number; h: number; scale: number }) {
  return (
    <span className="tabular-nums">
      {w} × {h}
      {scale < 0.995 || scale > 1.005 ? <span className="opacity-70"> · {Math.round(scale * 100)}%</span> : <span className="opacity-70"> · actual size</span>}
    </span>
  )
}

/** Size and shown percentage, with the one action that switches between Fit and actual size. */
export function ScaleChip({ w, h, scale, className }: { w: number; h: number; scale: number; className?: string }) {
  const s = useStudio()
  const actual = Math.abs(scale - 1) < 0.005
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg bg-background/92 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur", className)}>
      <ScaleNote w={w} h={h} scale={scale} />
      <Button variant="ghost" size="xs" className="h-5 px-1.5 text-xs" aria-label={actual ? "Fit to the stage" : "Show at actual size"} onClick={() => s.set({ zoom: actual ? "fit" : 100 })}>
        {actual ? "Fit" : "100%"}
      </Button>
    </span>
  )
}

/**
 * The product mark inside a tile: the adapter's drawn mark in the tile's foreground color,
 * or its two letters. `width` is the glyph's optical width, set by the caller for the tile.
 */
export function ProductMark({ width, decorative }: { width: number; decorative?: boolean }) {
  const m = adapter.product.markSvg
  if (!m) return <>{adapter.product.mark}</>
  const [, , w, h] = m.viewBox.split(" ").map(Number)
  return (
    <svg
      viewBox={m.viewBox}
      width={width}
      height={(width * h) / w}
      fill="currentColor"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": adapter.product.name })}
    >
      {m.paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

/** Keep the provider and working drafts alive when an optional chunk cannot load. */
export class LazyRegionBoundary extends React.Component<{ label: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError = () => ({ failed: true })
  render() {
    return this.state.failed ? <p role="alert" className="p-3 text-sm text-muted-foreground">{this.props.label} could not load. Your working state is retained; reload the Studio to try again.</p> : this.props.children
  }
}
