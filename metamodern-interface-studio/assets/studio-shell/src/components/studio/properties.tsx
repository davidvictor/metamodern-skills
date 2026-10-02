/*
 * Component properties in Details, loaded only when a scenario has them. Named states stay the unit of
 * review: a property edits the selected state, shows as a difference from it, and changes the live
 * frame without a remount. Built from the shell's own components; nothing here is product UI.
 */
import * as React from "react"
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { adapter } from "@/adapter"
import { optionsFor, useStudio } from "@/store"
import { normalizeScenarioInput } from "@/studio/input"
import { propertiesFor } from "@/studio/properties"
import type { InputValue, ScenarioInput } from "@/studio/types"

/** Coarse pointers: every row control reaches 44 px and text fields use 16 px text, so phones do not zoom. */
const TOUCH = "pointer-coarse:min-h-11 pointer-coarse:text-base"

/**
 * A control that removes itself (Set, Clear, Back to designed, Reset) hands focus on: the element with this ID is
 * focused after the render that shows it, never left on the page body.
 */
function useFocusAfter() {
  const target = React.useRef<string | null>(null)
  // Runs after every render of the row; the change that removed the control re-renders it through the store.
  React.useEffect(() => {
    if (!target.current) return
    document.getElementById(target.current)?.focus()
    target.current = null
  })
  return (id: string) => {
    target.current = id
  }
}

/** The one entry Details loads: the state picker (before the scenario inputs) or the Properties section (after them). */
export default function Properties({ part }: { part: "picker" | "section" }) {
  const s = useStudio()
  return part === "picker" ? <StatePicker /> : <PropertiesSection inputs={propertiesFor(adapter.axes.inputs, s.scenarioObj)} />
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
  // After Reset, the first curated row's control; the section heading when there is none.
  const first = curated.find((i) => !i.readonly)
  return (
    <FieldSet data-properties>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <FieldLegend id="properties-heading" tabIndex={-1} variant="label" className="mb-0 outline-none">
          Properties
        </FieldLegend>
        {n > 0 && (
          <Button
            size="xs"
            variant="ghost"
            className={TOUCH}
            onClick={() => {
              s.resetProps()
              focusAfter(first ? `property-${first.id}` : "properties-heading")
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
  const value = edited ?? designed
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
