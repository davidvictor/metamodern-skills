import * as React from "react"
import { cn } from "@/lib/utils"
import { Button as UIButton } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Coarse pointers: every kit control reaches 44 px. */
export const TARGET = "pointer-coarse:min-h-11 pointer-coarse:min-w-11"
/** Inputs reach 44 px and keep 16 px text on touch screens, so the browser never zooms. */
export const INPUT = "pointer-coarse:min-h-11 pointer-coarse:text-base!"

/** A module's page on the Studio surface: title, optional description and actions, content, and an optional footer such as a SaveBar. */
export function ModulePage({ title, description, actions, busy, footer, children }: { title: string; description?: string; actions?: React.ReactNode; busy?: boolean; footer?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div data-kit className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-6 md:px-8 md:py-8">
          <header className="flex flex-wrap items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-1">
              <h1 className="font-heading text-xl leading-tight font-semibold text-balance">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </header>
          {busy ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading
            </p>
          ) : (
            children
          )}
        </div>
      </div>
      {footer}
    </div>
  )
}

/** A headed group on a module page. */
export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** A labeled row of actions. */
export function Toolbar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  )
}

/** The Studio's button with the kit's target floor; a destructive button's text keeps AA contrast. */
export function Button({ className, ...props }: React.ComponentProps<typeof UIButton>) {
  return <UIButton className={cn(TARGET, props.variant === "destructive" && "text-[color:var(--kit-danger-ink,var(--destructive))]", className)} {...props} />
}
