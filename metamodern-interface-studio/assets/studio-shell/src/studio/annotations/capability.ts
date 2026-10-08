/** Both supported builders replace this with a literal; the default is inert. */
declare const __STUDIO_LOCAL_ANNOTATIONS__: boolean
export const LOCAL_ANNOTATIONS = typeof __STUDIO_LOCAL_ANNOTATIONS__ !== "undefined" && __STUDIO_LOCAL_ANNOTATIONS__
