/** Test-only alternate map. No paid style geometry or production availability is claimed. */
import { exampleAdapter } from "../src/adapters/example"
import type { StudioAdapter } from "../src/studio/types"
export const adapter: StudioAdapter = {
  ...exampleAdapter,
  design: { ...exampleAdapter.design, parameters: exampleAdapter.design!.parameters.map(parameter => parameter.id === "iconStyle" ? { ...parameter, choices: [...parameter.choices!, { id: "test-only-square", label: "Test-only synthetic square" }] } : parameter) },
}
