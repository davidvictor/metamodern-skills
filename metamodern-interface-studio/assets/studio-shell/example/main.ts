/*
 * Example product preview entry. A real product replaces this with a preview
 * route or document that renders its own components for one scenario, with
 * fixtures injected at its existing seams. The contract is the same: mount
 * from inputs, run commands through the app's own path, expose anchors.
 */
import { connectStudioFrame } from "../src/studio/frame-client"
import type { MountInputs } from "../src/studio/protocol"

type Task = {
  id: string
  title: string
  due: string
  done?: boolean
  isNew?: boolean
}
type State = {
  scenario: string
  /** The name last sent from the guide's form. */
  sent?: string
  role: string
  location: string[]
  tasks: Task[]
  dialog: null | { title: string }
  loading: boolean
  failed: boolean
}

const FIXTURE: Task[] = [
  { id: "t1", title: "Draft the quarterly plan", due: "Today, 12:00" },
  { id: "t2", title: "Review the onboarding copy", due: "Today, 15:30" },
  { id: "t3", title: "Reply to the design feedback", due: "Today" },
  { id: "t4", title: "Update the release checklist", due: "Tomorrow" },
  { id: "t5", title: "Book the planning room", due: "Done", done: true },
]

const app = document.getElementById("app")!
let s: State = {
  scenario: "",
  role: "owner",
  location: ["/tasks"],
  tasks: [],
  dialog: null,
  loading: false,
  failed: false,
}
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const here = () => s.location[s.location.length - 1]
const go = (path: string) => {
  s.location = [...s.location, path]
  render()
  frame.notifyNavigated()
}

function nav() {
  const link = (path: string, label: string) => `<a href="#" data-go="${path}" ${here().startsWith(path) ? 'aria-current="page"' : ""}>${label}</a>`
  return {
    side: `<nav class="nav" aria-label="Example"><div class="brand"><i></i>Example Tasks</div>${link("/tasks", "Tasks")}${link("/reports", "Reports")}${link("/settings", "Settings")}</nav>`,
    tabs: `<nav class="tabs" aria-label="Example tabs">${link("/tasks", "Tasks")}${link("/reports", "Reports")}${link("/settings", "Settings")}</nav>`,
  }
}

function listView() {
  const owner = s.role === "owner"
  const head = `<div class="head"><h1>Today</h1>${owner ? '<button class="btn" data-act="new" data-studio-anchor="new-task">New task</button>' : ""}</div>`
  if (s.loading) return head + `<div class="list" aria-busy="true">${[1, 2, 3, 4].map(() => '<div class="row"><span class="check"></span><span class="skeleton"></span></div>').join("")}</div>`
  if (s.failed) return head + '<div class="failed" role="alert"><strong>Tasks didn’t load</strong><p class="muted">Check the connection, then try again.</p><button class="btn ghost" data-act="retry">Retry</button></div>'
  if (!s.tasks.length) return head + `<div class="empty"><h2>No tasks yet</h2><p class="muted">Tasks you add appear here, newest first.</p>${owner ? '<button class="btn" data-act="new">Add your first task</button>' : ""}</div>`
  const rows = s.tasks
    .map(
      (t, i) =>
        `<button class="row${t.done ? " done" : ""}${t.isNew ? " new" : ""}" data-open="${t.id}" ${i === 0 ? 'data-studio-anchor="first-task" data-studio-anchor-label="Newest task"' : ""}><span class="check"></span><span class="title">${esc(t.title)}</span><span class="due">${esc(t.due)}</span></button>`
    )
    .join("")
  return head + `<div class="list" data-studio-anchor="task-list" data-studio-anchor-label="Task list">${rows}</div>`
}

function dialogView() {
  if (!s.dialog) return ""
  const ready = s.dialog.title.trim().length > 0
  return `<div class="scrim"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">New task</h2>
    <label class="field" data-studio-anchor="title-field" data-studio-anchor-label="Title"><span>Title</span><input id="title" value="${esc(s.dialog.title)}" placeholder="What needs doing?" /></label>
    <label class="field"><span class="muted">Notes (optional)</span><textarea rows="3"></textarea></label>
    <div class="actions"><button class="btn ghost" data-act="cancel">Cancel</button><button class="btn" data-act="save" data-studio-anchor="save-task" ${ready ? "" : "disabled"}>Save</button></div>
  </div></div>`
}

function guideView() {
  const sections = [
    ["guide-start", "Start here", "Tasks keep today's work in one list. Add a task, give it a due time, and tick it off when it is done."],
    ["guide-lists", "Lists and due times", "Each task has one due time. Overdue tasks move to the top of Today and stay there until they are done or moved."],
    ["guide-sharing", "Sharing", "Owners can add and edit tasks. Viewers see the same list without New task, so a shared list stays tidy."],
    ["guide-shortcuts", "Shortcuts", "Press N for a new task, J and K to move through the list, and X to tick the current task."],
  ]
  const notes = Array.from({ length: 12 }, (_, i) => `<li>Note ${i + 1}: a line in a box that scrolls on its own.</li>`).join("")
  return `<article class="doc">
    <h1 data-studio-anchor="guide-top" data-studio-anchor-label="Guide title">Getting started</h1>
    ${sections.map(([id, title, text]) => `<section id="${id}" data-studio-anchor="${id}" data-studio-anchor-label="${title}"><h2>${title}</h2><p>${text}</p><p class="muted">${text}</p></section>`).join("")}
    <section data-studio-anchor="guide-notes" data-studio-anchor-label="Notes"><h2>Notes</h2><ul class="notes" data-studio-scroll="guide-notes">${notes}</ul></section>
    <form class="card" data-studio-anchor="guide-form" data-studio-anchor-label="Feedback form" onsubmit="return false">
      <h2 style="margin:0">Was this helpful?</h2>
      <label class="field"><span>Your name</span><input id="guide-name" name="name" autocomplete="off" /></label>
      <label class="field"><span>Password (never sent to the Studio)</span><input id="guide-secret" name="secret" type="password" autocomplete="off" /></label>
      <label class="field"><span>Comments</span><textarea id="guide-comments" name="comments" rows="3"></textarea></label>
      <label class="field" data-studio-private><span>Private note (never sent to the Studio)</span><input id="guide-private" name="private" autocomplete="off" /></label>
      <label class="field"><span>Screenshot (never sent)</span><input id="guide-file" name="file" type="file" /></label>
      <button class="btn" data-act="send-feedback" data-studio-anchor="guide-send" style="justify-self:start">Send</button>
      <p class="muted" id="guide-sent" ${s.sent ? "" : "hidden"}>Thanks, ${esc(s.sent ?? "")}.</p>
    </form>
  </article>`
}

function welcomeView() {
  return `<div class="welcome"><section class="hero" data-studio-anchor="welcome-hero" data-studio-anchor-label="Hero"><h1>Welcome to Example Tasks</h1><p>Today's work, in one list.</p></section><section class="doc"><h2>What's next</h2><p>Add your first task.</p></section></div>`
}

function page() {
  const path = here()
  if (s.scenario === "help.guide") return guideView()
  if (s.scenario === "help.welcome") return welcomeView()
  if (s.scenario === "account.sign-in")
    return `<div class="center"><div class="card" style="width:min(380px,100%)"><div class="brand"><i></i>Example Tasks</div><label class="field"><span>Email</span><input placeholder="you@example.com" /></label><button class="btn" data-studio-anchor="sign-in">Continue</button></div></div>`
  const { side, tabs } = nav()
  let body: string
  if (path.startsWith("/tasks/")) {
    const t = s.tasks.find((x) => x.id === path.slice(7))
    body = `<button class="back" data-act="back">‹ Tasks</button><div class="card"><h1 style="margin:0">${esc(t?.title ?? "Task")}</h1><p class="muted">Due ${esc(t?.due ?? "")}</p><p>Notes and history for this task. Everything here is synthetic.</p></div>`
  } else if (path === "/settings") {
    body = `<div class="head"><h1>Settings</h1></div><div class="card"><label class="field"><span>Name</span><input value="Sam Example" /></label><label class="field"><span>Email</span><input value="sam@example.com" /></label><button class="btn" style="justify-self:start">Save changes</button></div>`
  } else if (path === "/reports") {
    body = `<div class="head"><h1>Reports</h1></div><div class="empty"><p class="muted">Reports are not designed yet.</p></div>`
  } else body = listView()
  return `<div class="app">${side}<main class="main">${body}</main>${tabs}</div>${dialogView()}`
}

function render() {
  const focused = document.activeElement?.id
  app.innerHTML = page()
  if (focused) document.getElementById(focused)?.focus()
}

// Product behavior: the same functions run for clicks and for Studio commands.
const actions: Record<string, () => void> = {
  "open-new-task": () => {
    s.dialog = { title: "" }
    render()
    frame.notifyNavigated()
    document.getElementById("title")?.focus()
  },
  "fill-title": () => {
    if (!s.dialog) throw new Error("The New task dialog is not open")
    s.dialog.title = "Prepare the demo script"
    render()
  },
  "save-task": () => {
    if (!s.dialog?.title.trim()) throw new Error("Save is unavailable without a title")
    s.tasks = [
      {
        id: `n${Date.now()}`,
        title: s.dialog.title.trim(),
        due: "Today",
        isNew: true,
      },
      ...s.tasks,
    ]
    s.dialog = null
    render()
    frame.notifyNavigated()
  },
  "open-first-task": () => go(`/tasks/${s.tasks[0]?.id}`),
  retry: () => {
    s.failed = false
    s.tasks = FIXTURE.map((t) => ({ ...t }))
    render()
  },
}

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-open],[data-go]")
  if (!el) return
  e.preventDefault()
  if (el.dataset.go) return go(el.dataset.go)
  if (el.dataset.open) return go(`/tasks/${el.dataset.open}`)
  const act = el.dataset.act
  if (act === "new") actions["open-new-task"]()
  else if (act === "cancel") {
    s.dialog = null
    render()
    frame.notifyNavigated()
  } else if (act === "save") actions["save-task"]()
  else if (act === "retry") actions.retry()
  else if (act === "back") frameBack()
  else if (act === "send-feedback") {
    s.sent = (document.getElementById("guide-name") as HTMLInputElement | null)?.value.trim() || "friend"
    const sent = document.getElementById("guide-sent")!
    sent.textContent = `Thanks, ${s.sent}.`
    sent.hidden = false
  }
})
app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement
  if (el.id !== "title" || !s.dialog) return
  s.dialog.title = el.value
  app.querySelector<HTMLButtonElement>("[data-act=save]")!.disabled = !el.value.trim()
})

function frameBack() {
  if (s.dialog) {
    s.dialog = null
    render()
    frame.notifyNavigated()
    return true
  }
  if (s.location.length < 2) return false
  s.location = s.location.slice(0, -1)
  render()
  frame.notifyNavigated()
  return true
}

function mount(inputs: MountInputs) {
  const root = document.documentElement
  root.dataset.theme = inputs.theme
  root.dataset.density = String(inputs.values.density ?? "comfortable")
  const known = ["tasks.list", "tasks.list.empty", "tasks.list.loading", "tasks.list.failed", "tasks.new", "task.detail", "account.settings", "account.sign-in", "help.guide", "help.welcome"]
  root.dataset.page = inputs.scenario.startsWith("help.") ? "document" : "app"
  if (!known.includes(inputs.scenario) && !inputs.scenario.startsWith("syn.")) throw new Error(`Scenario ${inputs.scenario} has no preview in this product`)
  // A real product constraint for the example: it has no layout narrower than 300 px.
  if (innerWidth < 300) throw new Error(`Example Tasks has no layout narrower than 300 px; this frame is ${innerWidth} px`)
  s = {
    scenario: inputs.scenario,
    role: String(inputs.values.role ?? "owner"),
    location: [inputs.scenario === "account.settings" ? "/settings" : inputs.scenario === "task.detail" ? "/tasks/t1" : "/tasks"],
    tasks: inputs.scenario === "tasks.list.empty" ? [] : FIXTURE.map((t) => ({ ...t })),
    dialog: inputs.scenario === "tasks.new" ? { title: "" } : null,
    loading: inputs.scenario === "tasks.list.loading",
    failed: inputs.scenario === "tasks.list.failed",
  }
  render()
  // For the starter's acceptance script only: the inputs this runtime was mounted with.
  ;(window as unknown as { __studioMounted: MountInputs }).__studioMounted = inputs
  return {
    appearance: inputs.theme.startsWith("dark") ? ("dark" as const) : ("light" as const),
    location: here(),
  }
}

// For the starter's acceptance script only: stand in for an older frame client, or a product without navigate.
const testing = window as unknown as {
  __studioLegacy?: boolean
  __studioNoNavigate?: boolean
}
const frame = connectStudioFrame(
  {
    mount,
    command: (id) => {
      const run = actions[id]
      if (!run) throw new Error(`Unknown command ${id}`)
      run()
    },
    back: frameBack,
    // For navigation sync: go to a location another frame reached.
    navigate: testing.__studioNoNavigate
      ? undefined
      : (location) => {
          const path = location.replace(/ \(New task\)$/, "")
          if (here() !== path) go(path)
        },
    canGoBack: () => s.location.length > 1 || !!s.dialog,
    location: () => here() + (s.dialog ? " (New task)" : ""),
  },
  { sync: !testing.__studioLegacy }
)

// Opened directly, outside the Studio: show the default scenario.
if (window.parent === window)
  mount({
    scenario: "tasks.list",
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    profile: "desktop",
    values: {},
    commands: [],
    tokens: {},
  })
