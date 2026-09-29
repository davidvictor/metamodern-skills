import * as React from "react"
import type { StageGesture } from "./protocol"

/** Where a frame's stage gestures go: the stage around it. Wheel positions arrive in the Studio's client coordinates. */
export type StageGestureHandler = (g: StageGesture) => void
export const StageGestureContext = React.createContext<StageGestureHandler | null>(null)
