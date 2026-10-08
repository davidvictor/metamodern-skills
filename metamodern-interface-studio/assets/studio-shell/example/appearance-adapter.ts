/** Test-only alternate map. No paid style geometry or production availability is claimed. */
import { exampleAdapter } from "../src/adapters/example"
import type { StudioAdapter } from "../src/studio/types"
export const adapter: StudioAdapter = {
  ...exampleAdapter,
  comparisons: [{ id: "appearance-proof", label: "Test-only appearance comparison", scenario: "tasks.new", axis: "appearance:iconStyle", values: ["stroke-rounded", "test-only-square"] }],
  walkthroughs: [{ id: "appearance-proof", name: "Appearance proof", goal: "Present an authored Design-only appearance", steps: [{ scenario: "tasks.new", narration: "Synthetic appearance, separate from properties", design: { iconStyle: "test-only-square" } }] }],
  design: { ...exampleAdapter.design, parameters: exampleAdapter.design!.parameters.map(parameter => parameter.id === "iconStyle" ? { ...parameter, choices: [...parameter.choices!, { id: "test-only-square", label: "Test-only synthetic square" }] } : parameter) },
}
