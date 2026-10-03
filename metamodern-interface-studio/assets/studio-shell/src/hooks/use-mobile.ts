import * as React from "react"

const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/** Whether a media query matches, following changes. */
export function useMedia(q: string) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(q)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(q).matches,
    () => false
  )
}

export function useIsMobile() {
  return useMedia(query)
}

/** A touch screen at any width: targets reach 44 px, so fixed-height rows grow with them. */
export const useCoarse = () => useMedia("(pointer: coarse)")
