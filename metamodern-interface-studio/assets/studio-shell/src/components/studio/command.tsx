import { LinkIcon, MoonIcon, PanelLeftIcon, PanelRightIcon, PresentationIcon, RotateCcwIcon, FileIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useTheme } from "@/components/theme-provider"
import { adapter } from "@/adapter"
import { areaLabel, useStudio } from "@/store"
import { VIEWS } from "./rail-panel"
import { isMac } from "./stage-nav"

export function CommandMenu() {
  const s = useStudio()
  const { theme, setTheme } = useTheme()
  const close = () => s.set({ commandOpen: false })
  const run = (fn: () => void) => () => { fn(); close() }
  return (
    <CommandDialog open={s.commandOpen} onOpenChange={(o) => s.set({ commandOpen: o })} title="Go to" description="Search scenarios, views and actions" className="sm:max-w-xl">
      <Command>
        <CommandInput placeholder="Go to a scenario, view or action…" />
        <CommandList className="max-h-96">
          <CommandEmpty>No match. Try an area, a state, or an action such as “reset”.</CommandEmpty>
          <CommandGroup heading="Scenarios">
            {adapter.scenarios.map((x) => (
              <CommandItem key={x.id} value={`${areaLabel(x.area)} ${x.label} ${x.surface} ${x.id}`} onSelect={run(() => { s.selectScenario(x.id); if (s.view === "gallery") s.set({ view: "inspect" }) })}>
                {x.status ? <TriangleAlertIcon className="text-warning" /> : <FileIcon />}
                <span>{x.label}</span>
                <span className="text-muted-foreground">{areaLabel(x.area)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Views">
            {VIEWS.map((v) => (
              <CommandItem key={v.id} value={`view ${v.label}`} onSelect={run(() => s.set({ view: v.id, panelOpen: true }))}>
                <v.icon />
                {v.label}
                <CommandShortcut>{v.key}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem value="reset preview" onSelect={run(s.reset)}><RotateCcwIcon />Reset preview<CommandShortcut>R</CommandShortcut></CommandItem>
            <CommandItem value="toggle panel" onSelect={run(() => s.set({ panelOpen: !s.panelOpen }))}><PanelLeftIcon />Toggle panel<CommandShortcut>⌘B</CommandShortcut></CommandItem>
            <CommandItem value="toggle details" onSelect={run(() => s.set({ detailsOpen: !s.detailsOpen }))}><PanelRightIcon />Toggle details<CommandShortcut>⌘.</CommandShortcut></CommandItem>
            <CommandItem value="studio appearance dark light" onSelect={run(() => setTheme(theme === "dark" ? "light" : "dark"))}><MoonIcon />Switch Studio appearance</CommandItem>
            <CommandItem value="copy link" onSelect={run(() => navigator.clipboard.writeText(location.href).then(() => toast("Link copied"), () => toast.error("Couldn't copy the link")))}><LinkIcon />Copy link to this view</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Walkthroughs">
            {adapter.walkthroughs.map((w) => (
              <CommandItem key={w.id} value={`walkthrough ${w.name}`} onSelect={run(() => s.set({ view: "present", present: { ...s.present, tour: w.id, step: 0, playing: false } }))}>
                <PresentationIcon />{w.name}<span className="text-muted-foreground">{w.steps.length} steps</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>Navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd>Open</span>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd>Close</span>
          <span className="ml-auto tabular-nums">{adapter.scenarios.length} scenarios</span>
        </div>
      </Command>
    </CommandDialog>
  )
}

const SHORTCUTS: [string, string[]][] = [
  ["Go to scenario, view or action", ["⌘", "K"]],
  ["Search the catalog", ["/"]],
  ["Previous or next scenario", ["[", "]"]],
  ["Switch view", ["1", "to", String(VIEWS.length)]],
  ["Toggle panel", ["⌘", "B"]],
  ["Toggle details", ["⌘", "."]],
  ["Reset preview", ["R"]],
  ["Fit or actual size", ["⇧1", "⇧0"]],
  ["Zoom in or out", ["+", "−"]],
  ["Zoom at the pointer", [isMac ? "⌘" : "Ctrl", "scroll"]],
  ["Pan the stage", ["Space", "drag"]],
  ["Walkthrough: step, pause, exit", ["←", "→", "Space", "Esc"]],
  ["Compare: flip A and B", ["Space"]],
  ["This list", ["?"]],
]

export function ShortcutsDialog() {
  const s = useStudio()
  return (
    <Dialog open={s.shortcutsOpen} onOpenChange={(o) => s.set({ shortcutsOpen: o })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Inactive while you type in a field or while focus is inside a preview, so product keys always reach the product.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd><KbdGroup>{keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</KbdGroup></dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
