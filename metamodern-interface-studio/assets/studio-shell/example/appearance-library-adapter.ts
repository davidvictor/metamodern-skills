/** Design-only appearance fixture: iconStyle is never an axes/component property. */
import { libraryAdapter } from "./library/adapter"
import type { StudioAdapter } from "../src/studio/types"
export const adapter: StudioAdapter = {
  ...libraryAdapter,
  design: { ...libraryAdapter.design, parameters: libraryAdapter.design!.parameters.map(parameter => parameter.id === "iconStyle" ? { ...parameter, choices: [...parameter.choices!, { id: "test-only-square", label: "Test-only synthetic square" }] } : parameter) },
}
