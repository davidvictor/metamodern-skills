/*
 * Component properties in Details, loaded only when a scenario has them. Named states stay the unit of
 * review: a property edits the selected state, shows as a difference from it, and changes the live
 * frame without a remount. Save as scenario keeps it as a new named state in scenarios.json (dev
 * server only; a built Studio offers Copy as JSON). The Code tab shows the frame's code for the current
 * values when the frame offers it. Built from the shell's own components.
 */
import * as React from "react"
import { ChevronDownIcon, CopyIcon, EllipsisIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { adapter } from "@/adapter"
import { optionsFor, useStudio } from "@/store"
import { normalizeScenarioInput } from "@/studio/input"
import { propertiesFor } from "@/studio/properties"
import { SCENARIOS_MAX_BYTES, savedId, validateScenarios, type SavedScenario } from "@/studio/scenarios"
import type { InputValue, ScenarioInput } from "@/studio/types"
import { inspectHandle } from "./preview"

/** Coarse pointers: every row control reaches 44 px and text fields use 16 px text, so phones do not zoom. */
const TOUCH = "pointer-coarse:min-h-11 pointer-coarse:text-base"
/** Only the dev server can write scenarios.json (read here, not from the store, so this chunk stays the only importer of the saved-state file model). */
const canSaveScenarios = import.meta.env.DEV
const WHY = "Saving needs the local Studio (npm run dev). A published Studio offers Copy as JSON instead."

/**
 * A control that removes or disables itself (Set, Clear, Back to designed, Reset, the save actions) hands focus on:
 * after the render that follows, the first of these IDs that exists is focused, else the Properties heading, never
 * the page body.
 */
function useFocusAfter() {
  const target = React.useRef<string[] | null>(null)
  // Runs after every render; the change that removed the control re-renders it through the store.
  React.useEffect(() => {
    if (!target.current) return
    for (const id of [...target.current, "properties-heading"]) {
      const el = document.getElementById(id)
      if (el) {
        el.focus()
        break
      }
    }
    target.current = null
  })
  return (...ids: string[]) => {
    target.current = ids
  }
}

/** The one entry Details loads: the state picker (before the scenario inputs) or the Properties section (after them). */
export default function Properties({ part }: { part: "picker" | "section" | "code" }) {
  const s = useStudio()
  return part === "picker" ? <StatePicker /> : part === "code" ? <CodePanel /> : <PropertiesSection inputs={propertiesFor(adapter.axes.inputs, s.scenarioObj)} />
}

/** The named states of this scenario's surface, to move between them without the catalog. */
function StatePicker() {
  const s = useStudio()
  const states = adapter.scenarios.filter((x) => x.surface === s.scenarioObj.surface && x.status !== "later")
  if (states.length < 2) return null
  const label = (x: (typeof states)[number]) => (x.savedFrom ? `${x.label} · Saved` : x.label)
  return (
    <Field>
      <FieldLabel htmlFor="property-state">State</FieldLabel>
      {/* Like the previous and next arrows, the picker keeps the phone's Details drawer open. */}
      <Select
        value={s.scenarioObj.id}
        items={Object.fromEntries(states.map((x) => [x.id, label(x)]))}
        onValueChange={(v) => v && s.set((st) => ({ scenario: v as string, preview: { ...st.preview, status: "loading", modified: false, canGoBack: false } }))}
      >
        <SelectTrigger id="property-state" className={`w-full ${TOUCH}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {states.map((x) => (
            <SelectItem key={x.id} value={x.id}>
              {label(x)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/** Curated rows, then the rest under a collapsed All properties, with Reset (n). */
function PropertiesSection({ inputs }: { inputs: ScenarioInput[] }) {
  const s = useStudio()
  const focusAfter = useFocusAfter()
  const n = Object.keys(s.edits).length
  const curated = inputs.filter((i) => i.curated)
  const rest = inputs.filter((i) => !i.curated)
  // After Reset, the first curated row's control, or its Set button when it is unset; the section heading when there is neither.
  const first = curated.find((i) => !i.readonly)
  return (
    <FieldSet data-properties>
      <div className="flex min-h-7 items-center justify-between gap-2">
        {/* Focused only by script (after Reset or a save), so its ring shows on :focus, not only :focus-visible. */}
        <FieldLegend id="properties-heading" tabIndex={-1} variant="label" className="mb-0 rounded-sm focus:ring-2 focus:ring-ring focus:outline-none">
          Properties
        </FieldLegend>
        {n > 0 && (
          <Button
            size="xs"
            variant="ghost"
            className={TOUCH}
            onClick={() => {
              s.resetProps()
              if (first) focusAfter(`property-${first.id}`, `property-${first.id}-set`)
              else focusAfter()
            }}
          >
            <RotateCcwIcon /> Reset ({n})
          </Button>
        )}
      </div>
      <FieldDescription className="text-xs">Edit this state. The preview changes in place; Reset returns it to the state as designed.</FieldDescription>
      {s.propsNote === s.scenario && (
        <p role="status" className="text-xs text-warning">
          The sender had local text edits. Links do not carry free text, so this shows the designed text.
        </p>
      )}
      {curated.length > 0 && (
        <FieldGroup className="gap-4">
          {curated.map((i) => (
            <PropertyRow key={i.id} input={i} />
          ))}
        </FieldGroup>
      )}
      {rest.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className={`group w-full justify-between px-2 ${TOUCH}`} />}>
            All properties ({rest.length})
            <ChevronDownIcon className="transition-transform group-data-[panel-open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FieldGroup className="gap-4 pt-3">
              {rest.map((i) => (
                <PropertyRow key={i.id} input={i} />
              ))}
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      )}
      <SaveActions />
    </FieldSet>
  )
}

const labelOf = (i: ScenarioInput, v: InputValue | undefined) =>
  v === undefined ? "Product default" : i.control === "switch" ? (v ? "On" : "Off") : (i.options?.find((o) => o.id === v)?.label ?? String(v))

/** A value to start from when Set is chosen on an optional property with no declared default. */
const firstValue = (i: ScenarioInput, options: { id: string }[]): InputValue => (i.control === "switch" ? false : i.control === "number" || i.control === "range" ? (i.min ?? 0) : i.control === "text" ? "" : (options[0]?.id ?? ""))

function PropertyRow({ input: i }: { input: ScenarioInput }) {
  const s = useStudio()
  const focusAfter = useFocusAfter()
  const designed = s.scenarioObj.designed?.[i.id] ?? (i.optional ? undefined : i.default)
  const edited = s.edits[i.id]
  // null: an optional property this state designs, unset by the viewer.
  const value = edited === null ? undefined : (edited ?? designed)
  const id = `property-${i.id}`
  if (i.readonly)
    return (
      <Field data-property={i.id}>
        <span className="text-sm leading-snug font-medium">{i.label}</span>
        <p className="text-xs text-muted-foreground">{i.note ?? "Handled by the sample data"}</p>
      </Field>
    )
  return (
    <Field data-property={i.id}>
      <div className="flex min-h-6 items-center gap-1.5">
        <FieldLabel htmlFor={id} className="min-w-0 flex-1">
          {i.label}
        </FieldLabel>
        {edited !== undefined && (
          <>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--anchor)" />
            <Button
              size="xs"
              variant="ghost"
              className={TOUCH}
              aria-label={designed === undefined ? `Clear ${i.label}` : `Back to designed: ${i.label}`}
              onClick={() => {
                s.setProp(i.id, null)
                focusAfter(designed === undefined ? `${id}-set` : id)
              }}
            >
              {designed === undefined ? "Clear" : "Back to designed"}
            </Button>
          </>
        )}
        {/* A saved state can return an optional property it sets to unset; a generated scenario's own value cannot be unset in a saved state. */}
        {i.optional && value !== undefined && designed !== undefined && s.scenarioObj.savedFrom && adapter.scenarios.find((x) => x.id === s.scenarioObj.savedFrom)?.designed?.[i.id] === undefined && (
          <Button
            size="xs"
            variant="ghost"
            className={TOUCH}
            aria-label={`Clear ${i.label}`}
            onClick={() => {
              s.setProp(i.id, undefined)
              focusAfter(`${id}-set`)
            }}
          >
            Clear
          </Button>
        )}
      </div>
      {i.optional && value === undefined ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{i.default === undefined ? "Product default" : `${labelOf(i, i.default) || "Empty"} (product default)`}</span>
          <Button
            id={`${id}-set`}
            size="sm"
            variant="outline"
            className={TOUCH}
            aria-label={`Set ${i.label}`}
            onClick={() => {
              s.setProp(i.id, i.default ?? firstValue(i, optionsFor(i, s.scenarioObj)))
              focusAfter(id)
            }}
          >
            Set
          </Button>
        </div>
      ) : (
        <Control input={i} id={id} value={value} onChange={(v) => s.setProp(i.id, v)} />
      )}
      {i.note && <FieldDescription className="text-xs">{i.note}</FieldDescription>}
    </Field>
  )
}

function Control({ input: i, id, value, onChange }: { input: ScenarioInput; id: string; value: InputValue | undefined; onChange: (v: InputValue) => void }) {
  const s = useStudio()
  if (i.control === "switch") return <Switch id={id} checked={value === true} onCheckedChange={(v) => onChange(v)} className="pointer-coarse:after:-inset-y-3" />
  if (i.control === "text") {
    const field = { id, value: typeof value === "string" ? value : "", maxLength: i.maxLength, className: TOUCH, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value) }
    // A text area keeps its rows on a phone: it takes only the 16 px text, not the 44 px row height.
    return i.multiline ? <Textarea rows={3} {...field} className="pointer-coarse:text-base" /> : <Input {...field} />
  }
  if (i.control === "number" || i.control === "range") return <NumberControl input={i} id={id} value={typeof value === "number" ? value : undefined} onChange={onChange} />
  const options = optionsFor(i, s.scenarioObj)
  return (
    <Select value={String(value ?? "")} items={Object.fromEntries(options.map((o) => [o.id, o.label]))} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger id={id} aria-label={i.label} className={`w-full ${TOUCH}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A plain number field: the text is kept while it is typed and sent only when it is a valid value. Presets set it in one click. */
function NumberControl({ input: i, id, value, onChange }: { input: ScenarioInput; id: string; value: number | undefined; onChange: (v: InputValue) => void }) {
  const s = useStudio()
  const [text, setText] = React.useState(value === undefined ? "" : String(value))
  // A value changed elsewhere (Back to designed, a preset, a link) replaces the typed text. Adjusted during render, not in an effect.
  const [seen, setSeen] = React.useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(value === undefined ? "" : String(value))
  }
  const valid = normalizeScenarioInput(i, s.scenarioObj, text) !== undefined
  return (
    <div className="grid gap-2">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={i.min}
        max={i.max}
        // Normalization accepts any value within min and max, so the field does too: a native step would mark 3.25 invalid.
        step="any"
        value={text}
        aria-invalid={!valid || undefined}
        className={TOUCH}
        onChange={(e) => {
          setText(e.target.value)
          const v = normalizeScenarioInput(i, s.scenarioObj, e.target.value)
          if (v !== undefined) onChange(v)
        }}
      />
      {!!i.presets?.length && (
        <div className="flex flex-wrap gap-1">
          {i.presets.map((p) => (
            <Button key={p.value} size="xs" variant={value === p.value ? "secondary" : "outline"} className={TOUCH} onClick={() => onChange(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Save as scenario (dev server), Save and the saved state's own actions, or Copy as JSON in a built Studio. */
function SaveActions() {
  const s = useStudio()
  const focusAfter = useFocusAfter()
  // The JSON shown to select by hand when the browser has no clipboard or refuses it, for the state it was made from.
  const [shown, setShown] = React.useState<{ id: string; json: string } | null>(null)
  const sc = s.scenarioObj
  const own = s.savedStates.find((x) => x.id === sc.id)
  const n = Object.keys(s.edits).length
  const generated = adapter.scenarios.filter((x) => !x.savedFrom)
  const ids = [...generated, ...s.savedStates].map((x) => x.id)
  const base = generated.find((x) => x.id === (sc.savedFrom ?? sc.id))
  // The state as it now resolves, kept where it differs from the generated scenario it names; an unset optional property is left out.
  const values = () => {
    const out: SavedScenario["values"] = {}
    for (const i of propertiesFor(adapter.axes.inputs, sc)) {
      const e = s.edits[i.id]
      const v = e === null ? undefined : (e ?? sc.designed?.[i.id])
      if (!i.readonly && v !== undefined && v !== (base?.designed?.[i.id] ?? (i.optional ? undefined : i.default))) out[i.id] = v
    }
    return out
  }
  const entry = (id: string, label: string, description?: string): SavedScenario => ({ id, label, base: base?.id ?? sc.id, values: values(), ...(description !== undefined && { description }) })
  /*
   * Every write starts from the file as it is on disk: entries this Studio skipped (an unknown base, a hand edit)
   * and the stored values of entries the change does not touch are written back exactly as they were. Only the
   * dev server's checks (schema, 500 entries, 256 KB) can refuse the file; nothing is dropped silently. The write
   * names the revision it read, so a change made elsewhere in between is never overwritten: the catalog shows the
   * file as it now is and the person's edits stay unsaved.
   */
  const persist = async (change: (raw: SavedScenario[]) => SavedScenario[]) => {
    const read = await fetch("__studio/scenarios")
    if (!read.ok) throw new Error(`The Studio could not read scenarios.json (${read.status})`)
    const revision = read.headers.get("x-studio-revision")
    const current = (await read.json())?.scenarios
    const list = change(Array.isArray(current) ? current : [])
    const file = { schema: "studio-scenarios/1" as const, scenarios: list }
    const problems = validateScenarios(file, generated.map((x) => x.id))
    if (problems.length) throw new Error(problems[0])
    const body = JSON.stringify(file)
    if (new Blob([body]).size > SCENARIOS_MAX_BYTES) throw new Error("Saved scenarios are limited to 256 KB")
    const res = await fetch("__studio/scenarios", { method: "POST", headers: { "content-type": "application/json", ...(revision ? { "x-studio-expected-revision": revision } : {}) }, body })
    if (res.status === 409) {
      // data is null when scenarios.json no longer reads as JSON (a merge conflict, say): the catalog stays as it is.
      const latest = (await res.json().catch(() => ({})))?.current?.data?.scenarios
      if (Array.isArray(latest)) s.setSavedStates(latest)
      throw new Error(Array.isArray(latest) ? "Saved states changed elsewhere. The latest is loaded; your change was not saved." : "scenarios.json changed elsewhere and is not a valid saved-states file. Your change was not saved.")
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The Studio refused the save (${res.status})`)
    s.setSavedStates(list)
  }
  const fail = (what: string) => (e: unknown) => {
    toast.error(what, { description: e instanceof Error ? e.message : String(e) })
  }
  const saveAs = async (label: string) => {
    let next: SavedScenario | undefined
    await persist((raw) => {
      // IDs on disk count too, so a new state never takes the ID of an entry this Studio skipped.
      next = entry(savedId(label, [...ids, ...raw.map((x) => x?.id)]), label)
      return [...raw, next]
    })
    s.resetProps()
    if (next) s.selectScenario(next.id)
    toast.success(`Saved ${label}`, { description: "In this Studio's scenarios.json. Commit it to share." })
  }
  const save = () =>
    // A state the file no longer holds (removed by hand since the page loaded) is written back.
    persist((raw) => (raw.some((x) => x?.id === sc.id) ? raw.map((x) => (x?.id === sc.id ? entry(sc.id, x.label, x.description) : x)) : [...raw, entry(sc.id, sc.label, own?.description)]))
      .then(() => {
        s.resetProps()
        // Save is disabled once nothing is edited; focus moves to the heading rather than the page body.
        focusAfter()
        toast.success(`Saved ${sc.label}`)
      })
      .catch(fail("Not saved"))
  const copy = async () => {
    const json = JSON.stringify(entry(own?.id ?? savedId(`${sc.label} edited`, ids), own?.label ?? `${sc.label}, edited`, own?.description), null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setShown(null)
      toast("Copied as JSON", { description: "Add it to scenarios.json in the local Studio to make it a named state." })
    } catch {
      // No clipboard (an insecure page) or a refusal: show the JSON to select and copy by hand.
      setShown({ id: sc.id, json })
      toast.error("Couldn't copy", { description: "Select the JSON below and copy it." })
    }
  }
  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="flex flex-wrap gap-1.5">
        {own && (
          <Button size="sm" variant="outline" className={TOUCH} disabled={!canSaveScenarios || n === 0} title={canSaveScenarios ? undefined : WHY} onClick={save}>
            <SaveIcon /> Save
          </Button>
        )}
        <SaveAs disabled={!canSaveScenarios || n === 0} initial={`${sc.label}, edited`} onSave={(label) => saveAs(label).then(() => true, (e) => (fail("Not saved")(e), false))} />
        {!canSaveScenarios && (
          <Button size="sm" variant="ghost" className={TOUCH} onClick={copy}>
            <CopyIcon /> Copy as JSON
          </Button>
        )}
        {own && canSaveScenarios && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className={TOUCH} aria-label="More saved state actions" />}>
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  const label = window.prompt("Rename the saved state", own.label)?.trim()
                  if (label) persist((raw) => raw.map((x) => (x?.id === own.id ? { ...x, label } : x))).catch(fail("Not renamed"))
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => saveAs(`${own.label} copy`).catch(fail("Not duplicated"))}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (!window.confirm(`Delete the saved state ${own.label}? This changes scenarios.json.`)) return
                  persist((raw) => raw.filter((x) => x?.id !== own.id))
                    .then(() => {
                      s.selectScenario(own.base)
                      // The menu's trigger leaves with the saved state.
                      focusAfter()
                    })
                    .catch(fail("Not deleted"))
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {!canSaveScenarios && <p className="text-[11px] text-muted-foreground">{WHY}</p>}
      {shown?.id === sc.id && (
        <pre data-copy-json tabIndex={0} aria-label="Saved state as JSON" className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap select-all">
          {shown.json}
        </pre>
      )}
    </div>
  )
}

function SaveAs({ disabled, initial, onSave }: { disabled: boolean; initial: string; onSave: (label: string) => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState(initial)
  // After a save the trigger is disabled (nothing is edited on the new state), so focus goes to the Properties heading.
  const saved = React.useRef(false)
  const submit = async () => {
    if (!label.trim()) return
    // A failed save keeps the popover open with the name, so it can be tried again.
    if (!(await onSave(label.trim()))) return
    saved.current = true
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setLabel(initial)
          saved.current = false
        }
      }}
    >
      <PopoverTrigger render={<Button size="sm" variant="outline" className={TOUCH} disabled={disabled} title={disabled && !canSaveScenarios ? WHY : undefined} />}>
        <SaveIcon /> Save as scenario
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64" finalFocus={() => (saved.current ? document.getElementById("properties-heading") : true)}>
        <Field>
          <FieldLabel htmlFor="scenario-name">Name the new state</FieldLabel>
          <Input id="scenario-name" value={label} maxLength={80} className={TOUCH} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        </Field>
        <Button size="sm" className={`mt-3 w-full ${TOUCH}`} disabled={!label.trim()} onClick={submit}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The frame's code for the current values, asked again whenever they change, with a copy button. Asking waits 150 ms
 * as a debounce, so typing asks once; ordering needs no delay, since postMessage is FIFO and the frame updates its
 * current values synchronously before it answers. While the preview is not ready the snippet would be stale, so it
 * is replaced by a waiting line and Copy is disabled. Docs and usage stay in the summary.
 */
function CodePanel() {
  const s = useStudio()
  const [code, setCode] = React.useState<{ language: string; text: string } | null>(null)
  const key = JSON.stringify([s.scenario, s.edits, s.values, s.preview.fingerprint])
  const ready = s.preview.status === "ready"
  React.useEffect(() => {
    if (!ready) return
    let live = true
    const timer = window.setTimeout(() => inspectHandle.current?.code().then((c) => live && setCode(c)), 150)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [key, ready])
  const waiting = <p className="text-xs text-muted-foreground">Waiting for the preview.</p>
  if (!code) return ready ? <p className="text-xs text-muted-foreground">The preview did not return code.</p> : waiting
  const copy = () =>
    navigator.clipboard.writeText(code.text).then(
      () => toast("Code copied"),
      () => toast.error("Couldn't copy", { description: "The browser refused the clipboard." })
    )
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{code.language}</span>
        <Button size="sm" variant="outline" className={TOUCH} onClick={copy} disabled={!ready}>
          <CopyIcon /> Copy
        </Button>
      </div>
      {ready ? (
        <pre data-code tabIndex={0} aria-label="Code" className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
          {code.text}
        </pre>
      ) : (
        waiting
      )}
    </>
  )
}
