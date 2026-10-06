/*
 * The example library declared with sections, for the acceptance suite (LB-11 to LB-16) and
 * `VITE_STUDIO_ADAPTER=sections npm run dev`: the same four components and documentation, with two sections holding
 * three groups and Switch also listed under Inputs. With VITE_STUDIO_LIBRARY=invalid the build uses invalid.ts instead,
 * which must fail. Remove with example/.
 */
import type { StudioAdapter } from "@/studio/types"
import { workspaceAdapter } from "../workspace/adapter"
import { exampleLibrary } from "./declaration"

export const sectionsAdapter: StudioAdapter = {
  ...workspaceAdapter,
  library: {
    entry: exampleLibrary.entry,
    sections: [
      { id: "controls", label: "Controls" },
      { id: "forms", label: "Forms" },
    ],
    groups: [
      { id: "actions", label: "Actions", section: "controls" },
      { id: "toggles", label: "Toggles", section: "controls" },
      { id: "inputs", label: "Inputs", section: "forms" },
    ],
    // Switch comes before Text field here, so Inputs lists it first: a cross-listed component keeps its place in this list.
    components: ["button", "switch", "icon-button", "text-field"].map((id) => {
      const c = exampleLibrary.components.find((x) => x.id === id)!
      return id === "switch" ? { ...c, group: "toggles", alsoIn: ["inputs"] } : c
    }),
  },
}

export { sectionsAdapter as adapter }
