import { useState } from "react"
import { Button, Field, NumberField, SegmentedControl, EditorPopover, PropertyList } from "@studio/kit"
import { useDesignSnapshot, type DesignPanelProps, type DesignEditorModule } from "@studio/design-ui"
function Foundation({ controller, review }: DesignPanelProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const state = useDesignSnapshot(controller)!
  const read = controller.readout("scale")
  const palette = controller.readout("palette")
  const value = Number(read.effective)
  const error = state.inputProblems.scale
  return <>
    <h2 className="text-sm font-semibold">Fixture direction</h2>
    <Field kind="select" label="Review fixture" value={review.scenarioId} options={review.scenarios} onChange={review.selectScenario} />
    <p data-review-fixture className="text-xs text-muted-foreground">Review context: {review.scenarioId}</p>
    <SegmentedControl label="Recipe" value="" options={[{ id: "compact", label: "Compact" }, { id: "airy", label: "Airy" }]} onChange={v => controller.edit({ controlId: "recipe", value: v })} />
    <SegmentedControl label="Theme scope" value={state.scope.themes.length > 1 ? "both" : state.scope.themes[0]} options={[{ id: "both", label: "Both" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} onChange={v => controller.setScope({ themes: v === "both" ? ["light", "dark"] : [v] })} />
    <Field kind="switch" label="Link theme values" checked={palette.linked} onChange={v => controller.edit({ controlId: "linked", value: v })} />
    <EditorPopover label="Registered palette" open={paletteOpen} onOpenChange={setPaletteOpen} trigger={<Button>Palette picker</Button>}><Field kind="select" label="Palette" value={typeof palette.effective === "string" ? palette.effective : "mixed"} options={[{ id: "blue", label: "Blue" }, { id: "green", label: "Green" }, { id: "mixed", label: "Mixed", disabled: true }]} onChange={v => { controller.edit({ controlId: "palette", value: v }); setPaletteOpen(false) }} /><p className="mt-2 text-xs">{typeof palette.effective === "object" ? "Mixed mode values" : "Registered fixture palette"}</p><Button onClick={() => setPaletteOpen(false)}>Close picker</Button></EditorPopover>
    <NumberField label="Scale" value={value} min={.5} max={2} step={.1} unit="×" invalidText={error?.raw} inputError={error?.message} resetKey={state.inputEpoch} onGestureStart={() => controller.beginGesture()} onGestureCommit={() => controller.commitGesture()} onGestureCancel={() => { controller.cancelGesture(); controller.clearInputProblem("scale") }} onInvalid={(message, raw) => controller.inputProblem("scale", message, raw)} onChange={v => controller.edit({ controlId: "scale", value: v })} />
    <Field kind="select" label="Registered asset" value={String(controller.readout("asset").effective)} options={[{ id: "loaded", label: "Loaded" }, { id: "pending", label: "Loading" }, { id: "missing", label: "Missing" }, { id: "frame-missing", label: "Missing stylesheet" }]} onChange={v => controller.edit({ controlId: "asset", value: v })} />
    <p className="text-xs text-muted-foreground">Macro changes preserve explicit component radius overrides.</p>
  </>
}
function Component({ controller, component }: DesignPanelProps) {
  const state = useDesignSnapshot(controller)!
  const read = controller.readout("radius")
  if (component !== "button") return <p className="text-xs text-muted-foreground">No treatment binding for this fixture component.</p>
  return <><NumberField label="Component radius" value={Number(read.effective)} min={0} max={32} step={1} unit="px" invalidText={state.inputProblems.radius?.raw} inputError={state.inputProblems.radius?.message} resetKey={state.inputEpoch} onGestureStart={() => controller.beginGesture()} onGestureCommit={() => controller.commitGesture()} onGestureCancel={() => { controller.cancelGesture(); controller.clearInputProblem("radius") }} onChange={v => controller.edit({ controlId: "radius", value: v })} onInvalid={(message, raw) => controller.inputProblem("radius", message, raw)} /><PropertyList items={[{ label: "Inherited", value: String(read.inherited) }, { label: "Source", value: read.sourceScope }]} /><Button onClick={() => controller.reset({ basis: "inherited", controlId: "radius" })}>Reset to inherited</Button></>
}
export const fixtureEditor: DesignEditorModule = { schema: "studio-design-editor/1", id: "fixture", version: "1", capabilities: ["edit", "reset", "history", "inheritance", "diagnostics"], Foundation, Component }
