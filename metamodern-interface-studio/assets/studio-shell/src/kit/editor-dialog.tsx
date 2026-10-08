import * as React from "react"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Button } from "./layout"
import type { EditorPopoverCloseProps } from "./design-controls"

export type EditorDialogProps = {
  label: string; trigger: React.ReactElement; children: React.ReactNode
  open?: boolean; onOpenChange?: (open: boolean) => void
  className?: string; overlayClassName?: string
}
/** Opt-in centered picker surface. Product content and ordinary Popover defaults remain separate. */
export function EditorDialog({ label, trigger, children, open, onOpenChange, className, overlayClassName }: EditorDialogProps) {
  return <Dialog modal open={open} onOpenChange={onOpenChange}>
    <DialogTrigger render={trigger} />
    <DialogContent data-kit aria-label={label} showCloseButton={false}
      className={cn("min-w-0 grid-cols-[minmax(0,1fr)] [overflow-wrap:anywhere] w-[calc(100vw-32px)] max-w-[420px] sm:max-w-[420px] max-h-[calc(100dvh-32px)] gap-[16px] rounded-[16px] border border-border p-[20px] overflow-y-auto shadow-[0_16px_40px_rgb(0_0_0/0.12)] ring-0", className)}
      overlayClassName={cn("bg-black/[0.18] backdrop-filter-none supports-backdrop-filter:backdrop-blur-none", overlayClassName)}>
      {children}
    </DialogContent>
  </Dialog>
}
export type EditorDialogCloseProps = EditorPopoverCloseProps
export function EditorDialogClose(props: EditorDialogCloseProps) {
  return <DialogClose render={<Button {...props} />} />
}
export function EditorDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} />
}
