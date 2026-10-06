/*
 * The example product as published to a static host, for the acceptance suite's static build and
 * `VITE_STUDIO_ADAPTER=static npm run dev`: every preview frame is sandboxed without allow-same-origin, so it runs at
 * an opaque origin (no frameOrigin is declared; the sandbox implies "null"); the workspace declares no operations host,
 * so its host-free modules open and the one module that declares operations says why it cannot; the modules come in
 * two groups; and the library adds one wide component. Remove with example/.
 */
import { exampleAdapter } from "@/adapters/example"
import type { StudioAdapter } from "@/studio/types"
import { exampleLibrary } from "./library/declaration"

export const staticAdapter: StudioAdapter = {
  ...exampleAdapter,
  frameIsolation: { sandbox: "allow-scripts allow-forms" },
  workspace: {
    modules: [
      {
        id: "catalog",
        label: "Catalog",
        icon: "layers",
        group: "review",
        sections: [
          { id: "screens", label: "Screens" },
          { id: "states", label: "States" },
        ],
      },
      { id: "notes", label: "Notes", icon: "file-text", group: "review", uses: [] },
      { id: "sync", label: "Sync", icon: "plug", group: "host", uses: [{ name: "sync.read", kind: "read" }] },
    ],
  },
  library: {
    ...exampleLibrary,
    components: [...exampleLibrary.components, { id: "button-row", label: "Button row", group: "actions", summary: "Actions in a row at the end of a form or dialog.", keywords: ["toolbar", "actions"], wide: true }],
  },
}

export { staticAdapter as adapter }
