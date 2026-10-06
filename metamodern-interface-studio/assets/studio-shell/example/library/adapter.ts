/*
 * The example product with its workspace and a component library, for the acceptance suite and
 * `VITE_STUDIO_ADAPTER=library npm run dev`. The library comes first in the rail, above the views. Remove with example/.
 */
import type { StudioAdapter } from "@/studio/types"
import { workspaceAdapter } from "../workspace/adapter"
import { exampleLibrary } from "./declaration"

export const libraryAdapter: StudioAdapter = { ...workspaceAdapter, library: exampleLibrary }

export { libraryAdapter as adapter }
