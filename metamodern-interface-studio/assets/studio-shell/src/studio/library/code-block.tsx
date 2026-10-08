/*
 * A code sample on a library page: tokens drawn as React text in spans (never HTML), its own horizontal scroll, and
 * Copy. Token colors come from studio.css (.library-code), which keeps each at AA on the code ground.
 */
import * as React from "react"
import { CheckIcon, CopyIcon } from "@/icons"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TARGET } from "@/kit/layout"
import { tokenize } from "./highlight"

export function CodeBlock({ code, language, title, className }: { code: string; language: string; title?: string; className?: string }) {
  const tokens = React.useMemo(() => tokenize(code, language), [code, language])
  const [copied, setCopied] = React.useState(false)
  // "Copied" reverts after a moment; the timer belongs to the element.
  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  const name = title ?? language
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true)
        toast.success("Code copied")
      },
      () => toast.error("Couldn't copy the code")
    )
  return (
    <figure className={cn("library-code grid min-w-0 overflow-hidden rounded-lg border bg-muted/50", className)}>
      <figcaption className="flex min-h-9 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <span className="truncate">{name}</span>
        <Button variant="ghost" size="sm" className={cn("ml-auto h-7 gap-1.5 px-2 text-xs", TARGET)} aria-label={`Copy ${name}`} onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </figcaption>
      <pre tabIndex={0} aria-label={name} className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
        <code>
          {tokens.map((t, i) =>
            t.kind === "plain" ? (
              <React.Fragment key={i}>{t.text}</React.Fragment>
            ) : (
              <span key={i} className={`tok-${t.kind}`}>
                {t.text}
              </span>
            )
          )}
        </code>
      </pre>
    </figure>
  )
}
