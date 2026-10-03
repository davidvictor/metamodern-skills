import { InboxIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Icon, type KitIconName } from "./icons"
import { Button } from "./layout"

/** A reason when there is nothing to show; never a stand-in. */
export function EmptyState({ title, description, tone = "neutral", icon, action }: { title: string; description: string; tone?: "neutral" | "danger"; icon?: KitIconName; action?: { label: string; onClick: () => void } }) {
  return (
    <Empty data-kit className={cn("border-0 p-6", tone === "danger" && "text-danger")}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ? <Icon name={icon} /> : tone === "danger" ? <TriangleAlertIcon aria-hidden /> : <InboxIcon aria-hidden />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && (
        <EmptyContent>
          <Button variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
