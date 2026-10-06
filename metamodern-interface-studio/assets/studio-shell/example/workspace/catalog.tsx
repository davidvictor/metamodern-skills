/*
 * The static build's host-free modules (example/static-adapter.ts): they call no operations, so they open without a
 * host. Catalog steps through the example's screens with a SelectList and j and k, keeps the open screen in the link as
 * the module's item, and previews it in a sandboxed frame. Built only from @studio/kit and @studio/workspace.
 */
import * as React from "react"
import { EmptyState, ModulePage, PreviewFrame, Section, SelectList, type SelectListGroup } from "@studio/kit"
import { useModule, useStepKeys } from "@studio/workspace"

const SCREENS: SelectListGroup[] = [
  {
    id: "tasks",
    label: "Tasks",
    items: [
      { id: "tasks.list", label: "Today", description: "Today's tasks, open first.", meta: "Task list" },
      { id: "tasks.new", label: "New task", description: "The form over the list.", meta: "Dialog" },
    ],
  },
  { id: "task", label: "Task detail", items: [{ id: "task.detail", label: "Task", description: "One task with its notes and history.", meta: "Detail" }] },
  {
    id: "account",
    label: "Account",
    items: [
      { id: "account.settings", label: "Settings", description: "Name, notifications and appearance.", meta: "Settings" },
      { id: "account.sign-in", label: "Sign in", description: "The sign-in page.", meta: "Sign in" },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { id: "help.guide", label: "Getting started", description: "A long page that scrolls.", meta: "Guide" },
      { id: "help.welcome", label: "Welcome", description: "A first-run hero.", meta: "Welcome" },
    ],
  },
]
const STATES: SelectListGroup[] = [
  {
    id: "tasks",
    label: "Task list",
    items: [
      { id: "tasks.list.empty", label: "First use", meta: "Empty" },
      { id: "tasks.list.loading", label: "Loading", meta: "Loading" },
      { id: "tasks.list.failed", label: "Failed to load", meta: "Error" },
    ],
  },
  { id: "components", label: "Task card", items: [{ id: "components.task-card.done", label: "Done", meta: "Done" }] },
]

export function CatalogPage() {
  const { section, item, setItem } = useModule()
  const groups = section === "states" ? STATES : SCREENS
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups])
  const at = flat.findIndex((x) => x.id === item)
  const open = at >= 0 ? flat[at] : null
  const step = (by: number) => setItem(flat[Math.min(flat.length - 1, Math.max(0, (at < 0 ? (by > 0 ? -1 : flat.length) : at) + by))].id)
  useStepKeys(
    () => step(-1),
    () => step(1)
  )
  return (
    <ModulePage title="Catalog" description="Step through the screens with the list, or with j and k anywhere on the page.">
      <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <SelectList label={section === "states" ? "States" : "Screens"} groups={groups} value={item} onChange={setItem} filterable />
        <Section title={open?.label ?? "Nothing selected"} description={open?.description}>
          {open ? (
            <PreviewFrame label={open.label} fidelity="actual" fidelityLabel="Actual UI · sample data" w={1280} h={800} src="./example/index.html" scenario={open.id} theme="light" profile="desktop" />
          ) : item ? (
            <EmptyState title="Not in this list" description={`${item} is not one of the ${section === "states" ? "states" : "screens"} here. Choose one from the list.`} />
          ) : (
            <EmptyState title="Choose a screen" description="Pick one from the list to preview it." />
          )}
        </Section>
      </div>
    </ModulePage>
  )
}

export function NotesPage() {
  return (
    <ModulePage title="Notes" description="A host-free module: it calls no operations, so it opens in a Studio published as static files.">
      <p className="text-sm">Review notes for this release live here.</p>
    </ModulePage>
  )
}
