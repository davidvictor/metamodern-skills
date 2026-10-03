/* Acceptance only (WS-03): defines a module the adapter does not declare, so the build must fail naming "orphan". */
import { defineWorkspace } from "@studio/workspace"
import { SitePage } from "./site"

export default defineWorkspace({
  site: { Page: SitePage },
  orphan: { Page: SitePage },
})
