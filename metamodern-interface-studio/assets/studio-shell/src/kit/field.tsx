import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Field as UIField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { INPUT, TARGET } from "./layout"

type Common = { label: string; description?: string; error?: string; disabled?: boolean }
type TextLike = Common & { value: string; onChange: (value: string) => void; placeholder?: string }
export type FieldProps =
  | (TextLike & { kind: "text" })
  | (TextLike & { kind: "secret" })
  | (Common & { kind: "select"; value: string; onChange: (value: string) => void; options: { id: string; label: string }[] })
  | (Common & { kind: "switch"; checked: boolean; onChange: (checked: boolean) => void })

/** A labeled control: text, select, switch, or a secret masked until Reveal. */
export function Field(props: FieldProps) {
  const id = React.useId()
  const hintId = `${id}-hint`
  const describedBy = props.error || props.description ? hintId : undefined
  const invalid = props.error ? true : undefined
  const note = props.error ? (
    <FieldError id={hintId}>{props.error}</FieldError>
  ) : props.description ? (
    <FieldDescription id={hintId} className="text-xs">{props.description}</FieldDescription>
  ) : null
  if (props.kind === "switch")
    return (
      <UIField orientation="horizontal" className="justify-between" data-invalid={invalid}>
        <div className="grid gap-1">
          <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
          {note}
        </div>
        <Switch id={id} checked={props.checked} disabled={props.disabled} aria-describedby={describedBy} onCheckedChange={(v) => props.onChange(v)} className="pointer-coarse:after:-inset-y-3" />
      </UIField>
    )
  if (props.kind === "select") {
    const { value, onChange, options } = props
    return (
      <UIField data-invalid={invalid}>
        <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
        <Select value={value} items={Object.fromEntries(options.map((o) => [o.id, o.label]))} onValueChange={(v) => v && onChange(v as string)} disabled={props.disabled}>
          <SelectTrigger id={id} className={cn("w-full", INPUT)} aria-describedby={describedBy}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-kit>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id} className={TARGET}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {note}
      </UIField>
    )
  }
  if (props.kind === "secret") return <SecretField id={id} field={props} describedBy={describedBy} note={note} />
  return (
    <UIField data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Input id={id} value={props.value} placeholder={props.placeholder} disabled={props.disabled} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => props.onChange(e.target.value)} className={INPUT} />
      {note}
    </UIField>
  )
}

function SecretField({ id, field, describedBy, note }: { id: string; field: TextLike; describedBy?: string; note: React.ReactNode }) {
  const [shown, setShown] = React.useState(false)
  return (
    <UIField data-invalid={field.error ? true : undefined}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <InputGroup className="pointer-coarse:min-h-11">
        <InputGroupInput id={id} type={shown ? "text" : "password"} value={field.value} placeholder={field.placeholder} disabled={field.disabled} autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore spellCheck={false} aria-invalid={field.error ? true : undefined} aria-describedby={describedBy} onChange={(e) => field.onChange(e.target.value)} className="pointer-coarse:text-base!" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label={shown ? `Hide ${field.label}` : `Reveal ${field.label}`} aria-pressed={shown} onClick={() => setShown((v) => !v)} className={TARGET}>
            {shown ? <EyeOffIcon /> : <EyeIcon />}
            {shown ? "Hide" : "Reveal"}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {note}
    </UIField>
  )
}
