/*
 * The example product with a workspace, for the acceptance suite and `VITE_STUDIO_ADAPTER=workspace npm run dev`.
 * Site reads, writes and conflicts against mock-host.mjs; Audit is declared without a component to show how an
 * unavailable module reads. Remove with example/.
 */
import { exampleAdapter } from "@/adapters/example"
import type { StudioAdapter } from "@/studio/types"

export const workspaceAdapter: StudioAdapter = {
  ...exampleAdapter,
  workspace: {
    operations: "./__studio/ops",
    modules: [
      {
        id: "site",
        label: "Site",
        icon: "settings",
        sections: [
          { id: "general", label: "General" },
          { id: "secrets", label: "Secrets" },
        ],
        uses: [
          { name: "site.read", kind: "read" },
          { name: "site.write", kind: "write" },
        ],
      },
      { id: "audit", label: "Audit", icon: "activity", uses: [{ name: "audit.list", kind: "read" }] },
    ],
  },
}

export { workspaceAdapter as adapter }
