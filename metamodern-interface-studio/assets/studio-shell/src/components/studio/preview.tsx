import * as React from "react"
import { TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { adapter } from "@/adapter"
import { captureFor, NO_DRAFT, resolveValues, useStudio, type Draft } from "@/store"
import { LivePreview, type LivePreviewHandle, type LiveStatus } from "@/studio/live-preview"
import { CaptureImage, PreviewFrame, type EmptyState } from "./bits"

/** A view's preview status as Details and the top bar read it. A capture or empty state has no live status. */
export function useReportStatus() {
  const s = useStudio()
  const set = s.set
  return React.useCallback(
    (st: LiveStatus | null) => set({ preview: st ? { status: st.status, modified: st.modified, canGoBack: st.canGoBack, location: st.location, fingerprint: st.fingerprint, reason: st.reason, previous: st.previous } : { status: "static", modified: false, canGoBack: false } }),
    [set]
  )
}

/** The Inspect preview's handle, for Product back in the stage controls. */
export const inspectHandle = React.createRef<LivePreviewHandle>()

export const profileOf = (id: string) => adapter.axes.profiles.find((p) => p.id === id) ?? adapter.axes.profiles[0]
/** The profile with a dragged Inspect size on top. The ID stays the profile's, so input context and captures still resolve. */
export const sizedProfile = (id: string, size: { w: number; h: number } | null) => (size ? { ...profileOf(id), ...size, custom: true } : { ...profileOf(id), custom: false })
export const themeOf = (id: string) => adapter.axes.themes.find((t) => t.id === id) ?? adapter.axes.themes[0]

type Props = {
  scenario: string
  theme: string
  profile: string
  /** Inspect only: the frame's pixel size when the viewer dragged it off the profile's own. */
  size?: { w: number; h: number } | null
  values: Record<string, string>
  commands?: string[]
  /** The draft this preview shows; none by default. Present never passes one. */
  draft?: Draft
  resetNonce?: number
  scale: number
  label: string
  anchor?: string
  /** Captures only, such as the Gallery's capture mode. */
  source?: "auto" | "captures"
  interactive?: boolean
  className?: string
  onStatus?: (s: LiveStatus | null) => void
}

/**
 * Resolves one preview to exactly one of: a live frame, a recorded capture,
 * or an explicit empty state. A missing reference is never replaced by a
 * similar scenario, theme or profile.
 */
export const ScenarioPreview = React.forwardRef<LivePreviewHandle, Props>(function ScenarioPreview(
  { scenario, theme, profile, size, values, commands = [], draft = NO_DRAFT, resetNonce = 0, scale, label, anchor, source = "auto", interactive = true, className, onStatus },
  ref
) {
  const sc = adapter.scenarios.find((x) => x.id === scenario)
  const pr = profileOf(profile)
  const th = themeOf(theme)
  const [retry, setRetry] = React.useState(0)
  const [status, setStatus] = React.useState<LiveStatus | null>(null)
  const live = !!adapter.frameEntry && source === "auto" && !!sc && sc.status !== "later"
  const capture = sc && !live ? captureFor(sc, theme, profile) : undefined
  const onStatusRef = React.useRef(onStatus)
  React.useLayoutEffect(() => {
    onStatusRef.current = onStatus
  })
  React.useEffect(() => {
    if (!live) onStatusRef.current?.(null)
  }, [live])

  let empty: EmptyState | undefined
  if (!sc) empty = { title: `Scenario ${scenario} is not in the catalog`, description: "Nothing was substituted. Fix the reference or choose another scenario.", tone: "danger" }
  else if (sc.status === "later") empty = { title: "Not designed yet", description: "This surface is marked Later. The Studio shows nothing rather than a stand-in." }
  else if (!live && !capture) empty = { title: "No capture for this combination", description: `${th.label} · ${pr.label} was never recorded. The Studio shows nothing rather than a different state.` }
  else if (live && status?.status === "error" && !status.previous)
    empty = { title: "The preview did not start", description: status.reason ?? "The frame reported an error.", tone: "danger", action: { label: "Retry", onClick: () => setRetry((n) => n + 1) } }

  const w = capture?.w ?? size?.w ?? pr.w
  const h = capture?.h ?? size?.h ?? pr.h
  const rect = anchor ? status?.anchors.find((a) => a.id === anchor) : undefined
  // The frame receives resolved values: the viewer's choice, else what the scenario was designed with, else the default.
  const resolved = sc ? resolveValues(sc, values) : values
  const mountKey = JSON.stringify([scenario, theme, profile, resolved, commands, resetNonce, retry])

  return (
    <PreviewFrame
      w={w}
      h={h}
      scale={scale}
      phone={pr.kind === "phone"}
      appearance={status?.appearance ?? th.appearance}
      anchor={rect}
      empty={empty}
      loading={live && (!status || status.status === "loading")}
      label={label}
      className={className}
    >
      {live ? (
        <LivePreview
          ref={ref}
          src={adapter.frameEntry!}
          origin={adapter.frameOrigin}
          inputs={{ scenario, theme, profile, values: resolved, commands }}
          mountKey={mountKey}
          draft={draft}
          w={w}
          h={h}
          scale={scale}
          label={label}
          interactive={interactive}
          onStatus={(s) => {
            setStatus(s)
            onStatusRef.current?.(s)
          }}
        />
      ) : capture ? (
        <CaptureImage capture={capture} />
      ) : null}
      {live && status?.status === "ready" && (draft.css || draft.stylesheets.length > 0) && !status.capabilities.includes("draft-css") && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="secondary" className="absolute bottom-3 left-3 gap-1.5 text-warning shadow-sm" />}>
            <TriangleAlertIcon /> Fonts did not apply
          </TooltipTrigger>
          <TooltipContent>This preview's frame client predates draft CSS. Update the Studio so its preview entry picks up the new frame client.</TooltipContent>
        </Tooltip>
      )}
      {live && status?.previous && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="secondary" className="absolute top-3 left-3 gap-1.5 text-warning shadow-sm" />}>
            <TriangleAlertIcon /> Showing previous settings
          </TooltipTrigger>
          <TooltipContent>{status.reason}</TooltipContent>
        </Tooltip>
      )}
    </PreviewFrame>
  )
})
