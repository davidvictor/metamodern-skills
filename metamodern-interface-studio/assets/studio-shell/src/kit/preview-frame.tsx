import * as React from "react"
import { adapter } from "@/adapter"
import { FidelityBadge, lookOf, PreviewFrame as Boundary, useFit } from "@/components/studio/bits"
import { LivePreview } from "@/studio/live-preview"
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
  const box = React.useRef<HTMLDivElement>(null)
  const scale = useFit(box, props.w, props.h, "fit", PAD, true)
  const live = "src" in props ? props : null
  return (
    <figure data-kit className="grid gap-2">
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <FidelityBadge mode={lookOf(props.fidelity)}>{props.fidelityLabel}</FidelityBadge>
        <span className="tabular-nums">
          {props.w} × {props.h}
          {scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : " · actual size"}
        </span>
      </figcaption>
      <div ref={box} className="stage-surface flex justify-center overflow-hidden rounded-xl p-6">
        <Boundary w={props.w} h={props.h} scale={scale} profile={{ kind: props.kind ?? "desktop" }} appearance={props.appearance} label={props.label}>
          {live ? (
            <LivePreview
              src={live.src}
              origin={live.origin}
              isolation={adapter.frameIsolation}
              inputs={{ scenario: live.scenario, theme: live.theme, profile: live.profile, values: live.values ?? {}, commands: [] }}
              // Values travel in inputs: a frame with live-values takes them in place, as in every preview.
              mountKey={JSON.stringify([live.scenario, live.theme, live.profile])}
              draft={NO_DRAFT}
              w={props.w}
              h={props.h}
              scale={scale}
              label={props.label}
            />
          ) : (
            <iframe title={props.label} sandbox="" tabIndex={-1} referrerPolicy="no-referrer" srcDoc={"html" in props ? props.html : ""} className="absolute top-0 left-0 origin-top-left border-0" style={{ width: props.w, height: props.h, transform: `scale(${scale})` }} />
          )}
        </Boundary>
      </div>
    </figure>
  )
}
