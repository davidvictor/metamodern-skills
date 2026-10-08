import { useState } from "react"
import { Button, Field, ConfirmDialog, EditorDialog, EditorDialogClose, EditorDialogTitle, EditorPopover, EditorPopoverClose } from "@studio/kit"
import type { DesignPanelProps } from "@studio/design-ui"
import { fixtureEditor as base } from "./index"
const NATIVE = "max-[1000px]:[&_button]:min-h-11 max-[1000px]:[&_button]:min-w-11 max-[1000px]:[&_input]:min-h-11 max-[1000px]:[&_input]:text-base!"
function Foundation({ controller }: DesignPanelProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [note, setNote] = useState("")
  const [legacy, setLegacy] = useState(false)
  const choices = Array.from({ length: 30 }, (_, i) => ({ label: `Choice ${String(i + 1).padStart(2, "0")}`, value: i % 2 ? "green" : "blue" }))
  return <>
    <h2>Generic dialog fixture</h2>
    <EditorDialog label="Synthetic centered picker" open={open} onOpenChange={setOpen} className={NATIVE} trigger={<Button>Open centered picker</Button>}>
      <div className="flex items-center justify-between gap-2"><EditorDialogTitle className="font-semibold">Synthetic centered picker</EditorDialogTitle><EditorDialogClose variant="ghost">Close picker</EditorDialogClose></div>
      <Field kind="text" label="Search choices" value={query} onChange={setQuery} />
      <p className="text-xs text-muted-foreground">Synthetic readiness help is supplied by product content.</p>
      <div data-synthetic-options className="grid grid-cols-2 gap-2">{choices.filter(c => c.label.toLowerCase().includes(query.toLowerCase())).map((c, i) => <Button key={c.label} className="h-auto justify-start py-2" variant="outline" onClick={() => { controller.edit({ controlId: "palette", value: c.value }); setOpen(false) }}><span data-synthetic-swatch aria-hidden className={`size-4 shrink-0 rounded-sm border ${i % 2 ? "bg-muted-foreground/30" : "bg-muted"}`} />{c.label}</Button>)}</div>
    </EditorDialog>
    <EditorDialog label="Uncontrolled centered picker" className={NATIVE} trigger={<Button>Open uncontrolled dialog</Button>}><EditorDialogTitle>Uncontrolled centered picker</EditorDialogTitle><Field kind="text" label="Uncontrolled note" value={note} onChange={setNote} /><EditorDialogClose>Close uncontrolled</EditorDialogClose></EditorDialog>
    <EditorPopover label="Legacy anchored picker" trigger={<Button>Open anchored picker</Button>}><Field kind="text" label="Legacy note" value={note} onChange={setNote} /><EditorPopoverClose>Close anchored</EditorPopoverClose></EditorPopover>
    <Button onClick={() => setLegacy(true)}>Open legacy confirmation</Button>
    <ConfirmDialog open={legacy} onCancel={() => setLegacy(false)} confirmLabel="Confirm" title="Legacy confirmation" description="Existing shared confirmation defaults remain." onConfirm={() => setLegacy(false)} />
  </>
}
export const fixtureEditor = { ...base, Foundation }
