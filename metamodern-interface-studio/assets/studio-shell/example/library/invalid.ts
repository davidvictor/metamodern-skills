/*
 * An invalid sectioned library for the acceptance suite (LB-16): VITE_STUDIO_ADAPTER=sections with
 * VITE_STUDIO_LIBRARY=invalid builds with it, and the build must fail naming every problem. Remove with example/.
 */
import type { StudioAdapter } from "@/studio/types"
import { sectionsAdapter } from "./sections"

export const adapter: StudioAdapter = {
  ...sectionsAdapter,
  library: {
    ...sectionsAdapter.library!,
    sections: [
      { id: "controls", label: "Controls" },
      { id: "controls", label: "Again" },
      { id: "spare", label: "Spare" },
    ],
    groups: [
      { id: "actions", label: "Actions", section: "controls" },
      { id: "toggles", label: "Toggles", section: "nowhere" },
      { id: "inputs", label: "Inputs" },
    ],
    components: sectionsAdapter.library!.components.map((c) => (c.id === "button" ? { ...c, alsoIn: ["actions", "missing"] } : c)),
  },
}
