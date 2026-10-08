import * as React from "react"
import { useStudio } from "@/store"
import { appearanceFields, liveAppearanceIds } from "@/studio/appearance"
import { adapter } from "@/adapter"
import { FidelityBadge, lookOf, PreviewFrame as Boundary, useFit } from "@/components/studio/bits"
import { LivePreview, type LiveStatus } from "@/studio/live-preview"
import type { MountInputs } from "@/studio/protocol"
import type { Fidelity, Profile } from "@/studio/types"

type Common = {
  /** Names the frame, such as "Welcome email". */
  label: string
  /** What the frame shows, stated beside it as in every preview. */
  fidelity: Fidelity
  fidelityLabel: string
  w: number
  h: number
  kind?: Profile["kind"]
  appearance?: "light" | "dark"
}
export type PreviewFrameProps = Common &
  (
    | { html: string }
    | { src: string; origin?: string; scenario: string; theme: string; profile: string; values?: MountInputs["values"] }
  )

const NO_DRAFT = { tokens: {}, css: "", stylesheets: [] }
const PAD = 48

/**
 * Product output inside a module, on the stage surface behind the preview boundary, with its fidelity and
 * scale stated. `src` mounts a studio-preview/1 entry like any preview; `html` shows static output, such as
 * an email, in a sandbox with no scripts, no forms and no access to the Studio.
 */
export function PreviewFrame(props: PreviewFrameProps) {
  const studio = useStudio()
  const box = React.useRef<HTMLDivElement>(null)
  const scale = useFit(box, props.w, props.h, "fit", PAD, true)
  const live = "src" in props ? props : null
  // As every preview: a frame that is starting says so, and one that failed with nothing to keep on screen says why and offers Retry.
  const [status, setStatus] = React.useState<LiveStatus | null>(null)
  const [retry, setRetry] = React.useState(0)
  // Another frame (src, scenario, theme or profile) starts afresh: a failure belongs to the frame that reported it.
  const frame = live ? JSON.stringify([live.src, live.scenario, live.theme, live.profile]) : ""
  const [shown, setShown] = React.useState(frame)
  if (shown !== frame) {
    setShown(frame)
    setStatus(null)
  }
  // The boundary shows a failure instead of the frame, so Retry clears it and the frame mounts again with a fresh runtime.
  const retryFrame = () => {
    setStatus(null)
    setRetry((n) => n + 1)
  }
  const failed =
    live && status?.status === "error" && !status.previous
      ? { title: "The preview did not start", description: status.reason ?? "The frame reported an error.", tone: "danger" as const, action: { label: "Retry", onClick: retryFrame } }
      : undefined
  return (
    <figure data-kit className="grid gap-2">
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <FidelityBadge mode={lookOf(props.fidelity)}>{props.fidelityLabel}</FidelityBadge>
        <span className="tabular-nums">
          {props.w} × {props.h}
          {scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : " · actual size"}
        </span>
        {status?.previous && <span role="status" className="text-warning">Showing previous settings: {status.reason}</span>}
      </figcaption>
      <div ref={box} className="stage-surface flex justify-center overflow-hidden rounded-xl p-6">
        <Boundary w={props.w} h={props.h} scale={scale} profile={{ kind: props.kind ?? "desktop" }} appearance={status?.appearance ?? props.appearance} empty={failed} loading={!!live && (!status || status.status === "loading")} label={props.label}>
          {live ? (
            <LivePreview
              src={live.src}
              origin={live.origin}
              isolation={adapter.frameIsolation}
              inputs={{ scenario: live.scenario, theme: live.theme, profile: live.profile, values: live.values ?? {}, design: appearanceFields(studio.designFor(live.theme).inputs, liveAppearanceIds(adapter)), commands: [] }}
              // Values travel in inputs: a frame with live-values takes them in place, as in every preview. Retry mounts a fresh runtime.
              mountKey={JSON.stringify([live.scenario, live.theme, live.profile, retry])}
              appearanceIds={liveAppearanceIds(adapter)}
              draft={NO_DRAFT}
              w={props.w}
              h={props.h}
              scale={scale}
              label={props.label}
              onStatus={setStatus}
            />
          ) : (
            <iframe title={props.label} sandbox="" tabIndex={-1} referrerPolicy="no-referrer" srcDoc={"html" in props ? props.html : ""} className="absolute top-0 left-0 origin-top-left border-0" style={{ width: props.w, height: props.h, transform: `scale(${scale})` }} />
          )}
        </Boundary>
      </div>
    </figure>
  )
}
