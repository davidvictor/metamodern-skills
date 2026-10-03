/* The example workspace's module map; Audit is deliberately left out (see adapter.ts). */
import { defineWorkspace } from "@studio/workspace"
import { SiteDetails, SitePage, SitePanel } from "./site"

export default defineWorkspace({
  site: { Page: SitePage, Panel: SitePanel, Details: SiteDetails },
})
