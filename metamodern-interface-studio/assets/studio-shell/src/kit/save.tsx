import * as React from "react"
import { CheckIcon, TriangleAlertIcon } from "@/icons"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "./layout"

export type SaveBarState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  /** A write found a newer revision: the person's edit is kept and `current` shows what is stored now. */
  | { kind: "conflict"; reason: string; current: React.ReactNode }
  | { kind: "error"; reason: string; recoverable: boolean }

/** The bar under a module page that owns saving. Nothing is overwritten without the person's choice. */
export function SaveBar({ state, onSave, onDiscard, onRetry, saveLabel = "Save", disabled = false, conflictSaveLabel = "Save mine again", conflictDiscardLabel = "Use current value" }: { state: SaveBarState; onSave: () => void; onDiscard: () => void; onRetry: () => void; saveLabel?: string; disabled?: boolean; conflictSaveLabel?: string; conflictDiscardLabel?: string }) {
  if (state.kind === "clean") return null
  const trouble = state.kind === "conflict" || state.kind === "error"
  return (
    <div role="region" aria-label="Changes" className={cn("border-t bg-background px-4 py-3 md:px-8", trouble && "border-t-2 border-t-warning")}>
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3">
        {/* The message wants 16rem: narrower than that beside the actions, it takes its own line above them. */}
        <div role="status" aria-live="polite" className="grid min-w-0 flex-1 basis-64 gap-1 text-sm">
          {state.kind === "dirty" && <span className="font-medium">Unsaved changes</span>}
          {state.kind === "saving" && (
            <span className="flex items-center gap-2 font-medium">
              <Spinner className="size-4" /> Saving
            </span>
          )}
          {state.kind === "saved" && (
            <span className="flex items-center gap-2 font-medium">
              <CheckIcon aria-hidden className="size-4 text-success" /> Saved
            </span>
          )}
          {state.kind === "conflict" && (
            <>
              <span className="flex items-center gap-2 font-medium">
                <TriangleAlertIcon aria-hidden className="size-4 text-warning" /> Changed elsewhere. Your edit is kept and nothing was overwritten.
              </span>
              <span className="text-muted-foreground">{state.reason}</span>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">Current value</span>
                {state.current}
              </div>
            </>
          )}
          {state.kind === "error" && (
            <>
              <span className="flex items-center gap-2 font-medium">
                <TriangleAlertIcon aria-hidden className="size-4 text-danger" /> Not saved
              </span>
              <span className="text-muted-foreground">{state.reason}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {state.kind !== "saved" && (
            <Button variant="outline" disabled={state.kind === "saving"} onClick={onDiscard}>
              {state.kind === "conflict" ? conflictDiscardLabel : "Discard"}
            </Button>
          )}
          {(state.kind === "dirty" || state.kind === "saving") && (
            <Button disabled={state.kind === "saving" || disabled} onClick={onSave}>
              {saveLabel}
            </Button>
          )}
          {state.kind === "conflict" && <Button disabled={disabled} onClick={onRetry}>{conflictSaveLabel}</Button>}
          {state.kind === "error" && state.recoverable && <Button disabled={disabled} onClick={onRetry}>Retry</Button>}
        </div>
      </div>
    </div>
  )
}

/** A question with a safe default: focus starts on Cancel, and Esc cancels. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Cancel", tone = "default", onConfirm, onCancel }: { open: boolean; title: string; description?: string; confirmLabel: string; cancelLabel?: string; tone?: "default" | "danger"; onConfirm: () => void; onCancel: () => void }) {
  const actions = React.useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent data-kit showCloseButton={false} initialFocus={() => actions.current?.querySelector<HTMLElement>("[data-cancel]") ?? true}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div ref={actions} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button data-cancel variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
