import { cn } from "cn"
import { LoadingIcon } from "@/icons"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoadingIcon data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
