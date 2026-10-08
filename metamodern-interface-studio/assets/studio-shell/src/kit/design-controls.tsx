import * as React from "react"
import { Field as FieldRoot, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { INPUT, TARGET } from "./layout"

export type NumberFieldProps = {
  label: string; resetKey?: number; invalidText?: string; inputError?: string; value: number; min: number; max: number; step: number; unit?: string; description?: string; disabled?: boolean
  onChange(value: number): void
  onInvalid?(message: string, text: string): void
  onGestureStart?(): void; onGestureCommit?(): void; onGestureCancel?(): void
}
/** Invalid text stays editable; the range and readout retain the last valid controlled value. */
export function NumberField(p: NumberFieldProps) {
  const id = React.useId()
  const [text, setText] = React.useState(p.invalidText ?? String(p.value))
  const [error, setError] = React.useState(p.inputError ?? "")
  const received = React.useRef({ value: p.value, resetKey: p.resetKey, raw: p.invalidText, problem: p.inputError })
  React.useEffect(() => {
    const prior = received.current
    const controlledChanged = prior.raw !== p.invalidText || prior.problem !== p.inputError
    if (controlledChanged || prior.resetKey !== p.resetKey || (prior.value !== p.value && !error)) {
      received.current = { value: p.value, resetKey: p.resetKey, raw: p.invalidText, problem: p.inputError }
      setText(p.invalidText ?? String(p.value)); setError(p.inputError ?? "")
    }
  }, [p.value, p.resetKey, p.invalidText, p.inputError, error])
  const change = (next: string) => {
    setText(next)
    const n = Number(next)
    const valid = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(next) && Number.isFinite(n) && n >= p.min && n <= p.max && Math.abs((n - p.min) / p.step - Math.round((n - p.min) / p.step)) < 1e-7
    if (!valid) { const message = `Enter ${p.min}–${p.max}${p.unit ?? ""} in steps of ${p.step}`; setError(message); p.onInvalid?.(message, next); return }
    setError(""); p.onChange(n)
  }
  return <FieldRoot data-invalid={!!error} className="gap-2">
    <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{p.label}</FieldLabel><output className="font-mono text-xs tabular-nums" aria-live="polite">{p.value}{p.unit}</output></div>
    <Slider className="pointer-coarse:px-3 pointer-coarse:[&_[data-slot=slider-control]]:min-h-11 pointer-coarse:[&_[data-slot=slider-thumb]]:after:absolute pointer-coarse:[&_[data-slot=slider-thumb]]:after:-inset-3.5" aria-label={`${p.label} slider`} value={[p.value]} min={p.min} max={p.max} step={p.step} disabled={p.disabled} onPointerDown={p.onGestureStart} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) p.onGestureStart?.() }} onValueChange={v => { const n = Array.isArray(v) ? v[0] : v; if (Number.isFinite(n)) { setError(""); setText(String(n)); p.onChange(n) } }} onValueCommitted={p.onGestureCommit} />
    <Input id={id} type="text" inputMode="decimal" value={text} disabled={p.disabled} aria-invalid={!!error} aria-describedby={`${id}-hint`} className={INPUT} onFocus={p.onGestureStart} onChange={e => change(e.target.value)} onBlur={p.onGestureCommit} onKeyDown={e => { if (e.key === "Enter") p.onGestureCommit?.(); if (e.key === "Escape") { p.onGestureCancel?.(); setText(String(p.value)); setError("") } }} />
    {error ? <FieldError id={`${id}-hint`}>{error}</FieldError> : <FieldDescription id={`${id}-hint`}>{p.description ?? `${p.min}–${p.max}${p.unit ?? ""} · step ${p.step}`}</FieldDescription>}
  </FieldRoot>
}
export function SegmentedControl({ label, value, options, onChange, disabled }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange(value: string): void; disabled?: boolean }) {
  return <FieldRoot><FieldLabel>{label}</FieldLabel><ToggleGroup aria-label={label} value={[value]} onValueChange={v => v[0] && onChange(v[0])} disabled={disabled} className="flex flex-wrap">{options.map(o => <ToggleGroupItem key={o.id} value={o.id} className={TARGET}>{o.label}</ToggleGroupItem>)}</ToggleGroup></FieldRoot>
}
export function EditorPopover({ label, trigger, children, open, onOpenChange }: { label: string; trigger: React.ReactElement; children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return <Popover modal open={open} onOpenChange={onOpenChange}><PopoverTrigger render={trigger} /><PopoverContent data-kit role="dialog" aria-label={label} className="max-h-[min(70dvh,28rem)] w-64 overflow-y-auto">{children}</PopoverContent></Popover>
}
