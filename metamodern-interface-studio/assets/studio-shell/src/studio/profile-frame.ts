import type { Profile } from "./types"

/** Match the preview's outer shape, in source CSS pixels, without zoom rounding. */
export function scaledFrameRadius(profile: Pick<Profile, "kind" | "frameRadius">, w: number, h: number, scale: number) {
  const fallback = profile.kind === "phone" ? 44 : profile.kind === "tablet" ? 28 : 8
  const requested = profile.frameRadius ?? fallback
  const radius = Number.isFinite(requested) ? Math.max(0, Math.min(requested, w / 2, h / 2)) : fallback
  return radius * scale
}
