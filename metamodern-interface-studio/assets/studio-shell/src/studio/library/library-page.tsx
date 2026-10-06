/*
 * The component library's pages, loaded only when the library opens: one documentation column on the Studio surface,
 * the components grouped with search in the context panel, and On this page, the playground and the preview theme in
 * Details. The documentation is the product's (src/library/index.ts), one module per component, loaded when its page
 * opens and checked before it renders.
 */
import * as React from "react"
import { ChevronRightIcon, PanelRightIcon, RotateCcwIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import library from "@/library"
import { adapter } from "@/adapter"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store"
import { useMedia } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Field as UIField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { FidelityBadge, lookOf } from "@/components/studio/bits"
import { EmptyState, Field } from "@/kit"
import { INPUT, TARGET } from "@/kit/layout"
import type { InputValue, LibraryComponent } from "@/studio/types"
import { docsProblems, filterComponents, groupedComponents, homePath, LIBRARY_LABEL, noDocs, playgroundValue, playgroundValues, SECTIONS, sectionedComponents, undeclaredDocs, type SectionId } from "./model"
import type { ComponentDocs, PlaygroundProperty } from "./schema"
import { AdjustedNote, InlineText, OpenComponent, Rich } from "./rich-text"
import { BudgetContext, PreviewBlock, useBudget } from "./preview-block"

const decl = adapter.library ?? { groups: [], components: [] }
const LABEL = decl.label ?? LIBRARY_LABEL
const defined = Object.keys(library.docs)
const DECLARED = decl.components.map((c) => c.id)
const orphans = undeclaredDocs(decl, defined)
if (orphans.length) {
  // The build fails on this when it can load the adapter; when it cannot, this is where it shows.
  const reason = `src/library/index.ts documents ${orphans.join(", ")}, which the adapter does not declare in library.components. Declare it there or remove it; a build fails on this.`
  console.error(reason)
  toast.error("A documented component is not declared", { id: "studio-undeclared-component", description: reason, duration: Infinity })
}

/** A value shared by the page and the sidebar, which render in different parts of the Studio. */
function store<T>(initial: T) {
  let value = initial
  const subscribers = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      subscribers.forEach((f) => f())
    },
    subscribe: (f: () => void) => {
      subscribers.add(f)
      return () => {
        subscribers.delete(f)
      }
    },
  }
}
/** The person's playground edits, by component, until the Studio reloads. Raw: values are validated when sent. */
const edits = store<Record<string, Record<string, InputValue>>>({})
/** The section on screen, for On this page. */
const active = store<SectionId | null>(null)
/** Scrolls the open page to a section; set by the page while it is open. */
const scrollTo: { current: ((id: SectionId, smooth: boolean) => void) | null } = { current: null }

/** The viewer's own section and group toggles, kept per viewer and per product like the Studio's other preferences. */
const OPEN_KEY = `studio.${adapter.id}.library-open.v1`
function readOpen(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null")
    return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === "boolean")) : {}
  } catch {
    return {}
  }
}
function writeOpen(value: Record<string, boolean>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(value))
  } catch {
    /* per-viewer convenience only */
  }
}
/**
 * Which sections and groups are open (keys `section:<id>` and `group:<id>`): closed by default. `open` starts from the
 * viewer's kept toggles (`toggled`); each page opened opens its branch (its home section and group) in `open` only, so a
 * branch the viewer closed opens again when a page in it opens, and a reload starts again from the viewer's toggles. While
 * searching every branch with a match opens, and toggles made then (`searching`) are dropped when the search changes, so
 * clearing it restores the open state from before.
 */
const disclosure = store(((toggled: Record<string, boolean>) => ({ toggled, open: toggled, searching: {} as Record<string, boolean> }))(readOpen()))
type Disclosure = ReturnType<typeof disclosure.get>
const isOpen = (d: Disclosure, key: string, searching: boolean) => (searching ? (d.searching[key] ?? true) : d.open[key] === true)
function toggle(key: string, searching: boolean) {
  const d = disclosure.get()
  const next = !isOpen(d, key, searching)
  if (searching) return disclosure.set({ ...d, searching: { ...d.searching, [key]: next } })
  const toggled = { ...d.toggled, [key]: next }
  writeOpen(toggled)
  disclosure.set({ ...d, toggled, open: { ...d.open, [key]: next } })
}
/** Opens a page's branch: its home section and group. */
function openBranch(id: string | null) {
  const { section, group } = homePath(decl, id)
  const d = disclosure.get()
  if (!section || !group || (d.open[`section:${section.id}`] && d.open[`group:${group.id}`])) return
  disclosure.set({ ...d, open: { ...d.open, [`section:${section.id}`]: true, [`group:${group.id}`]: true } })
}

type Loaded = { docs: ComponentDocs | null; problems: string[]; failed?: boolean }
const loads = new Map<string, Promise<Loaded>>()
/** A component's documentation, loaded once and checked; a failed load can be tried again. */
function docsFor(id: string): Promise<Loaded> {
  let p = loads.get(id)
  if (!p) {
    const load = library.docs[id]
    p = !load
      ? Promise.resolve({ docs: null, problems: [noDocs(id)] })
      : load().then(
          (m) => {
            // A bad module yields its problems, never an exception that takes the page down.
            try {
              const docs: unknown = m?.default
              const problems = docsProblems(docs, DECLARED)
              return { docs: problems.length ? null : (docs as ComponentDocs), problems }
            } catch (e) {
              return { docs: null, problems: [`The documentation could not be read: ${e instanceof Error ? e.message : String(e)}`] }
            }
          },
          (e: unknown) => ({ docs: null, problems: [`The documentation could not load: ${e instanceof Error ? e.message : String(e)}`], failed: true })
        )
    loads.set(id, p)
  }
  return p
}

/**
 * Keeps a fault in one component's documentation inside its part of the Studio: the part shows the reason instead of
 * taking the Studio down. Reset by its key (the component), so another page renders normally.
 */
class PartBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  componentDidCatch(e: unknown) {
    console.error(`The library's ${this.props.name} could not render`, e)
  }
  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div role="alert" data-library-fault className="grid gap-1 p-4 text-sm">
        <p className="font-medium">The {this.props.name} could not render</p>
        <p className="text-muted-foreground">{this.state.error}</p>
      </div>
    )
  }
}

export type PageProps = { part: "stage" } | { part: "panel" } | { part: "details"; onClose?: () => void }

export function LibraryPage(props: PageProps) {
  if (props.part === "stage") return <LibraryStage />
  if (props.part === "panel") return <LibraryPanel />
  return <LibraryDetails onClose={props.onClose} />
}

function LibraryStage() {
  const s = useStudio()
  const [attempt, setAttempt] = React.useState(0)
  // Each page opened opens its branch in the panel, also where the viewer closed it, before the panel paints.
  React.useLayoutEffect(() => openBranch(s.library), [s.library])
  const c = decl.components.find((x) => x.id === s.library)
  if (!c) return null
  return (
    <div data-kit className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <PartBoundary key={`${c.id}/${attempt}`} name={`${c.label} page`}>
        <React.Suspense
          fallback={
            <p role="status" className="p-8 text-sm text-muted-foreground">
              Loading {c.label}
            </p>
          }
        >
          <ComponentPage
            id={c.id}
            retry={() => {
              loads.delete(c.id)
              setAttempt((n) => n + 1)
            }}
          />
        </React.Suspense>
      </PartBoundary>
    </div>
  )
}

function ComponentPage({ id, retry }: { id: string; retry: () => void }) {
  const s = useStudio()
  const { docs, problems, failed } = React.use(docsFor(id))
  const c = decl.components.find((x) => x.id === id)!
  const wide = c.wide === true
  // A wide component's page is the size its preview blocks measure against, with the article's gutter (md:px-8).
  const gutter = useMedia("(min-width: 48rem)") ? "2rem" : "1rem"
  const scroller = React.useRef<HTMLDivElement>(null)
  const budget = useBudget()
  const page = React.useMemo(() => ({ budget, root: scroller }), [budget])
  // The budget ranks previews by where they are now, so it follows this page's scrolling.
  React.useEffect(() => budget.attach(scroller.current), [budget])
  const pg = docs?.preview.playground
  const all = React.useSyncExternalStore(edits.subscribe, edits.get)
  const values = React.useMemo(() => (pg ? playgroundValues(pg.properties, all[id]) : undefined), [pg, all, id])

  const go = React.useCallback((at: SectionId, smooth: boolean) => {
    const el = scroller.current?.querySelector<HTMLElement>(`#lib-${at}`)
    if (!el) return
    el.scrollIntoView({ block: "start", behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" })
    el.querySelector("h2")?.focus({ preventScroll: true })
  }, [])
  // A link that names a section opens there, once.
  const opening = React.useRef(s.libraryAt)
  React.useLayoutEffect(() => {
    scrollTo.current = go
    if (opening.current) go(opening.current as SectionId, false)
    return () => {
      scrollTo.current = null
    }
  }, [go])
  // On this page follows the last section whose heading has reached the top of the page (64 px), or the last one at the end.
  React.useEffect(() => {
    const root = scroller.current
    if (!root) return
    let frame = 0
    const measure = () => {
      frame = 0
      const sections = [...root.querySelectorAll<HTMLElement>("section[data-section]")]
      const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 2
      const line = root.getBoundingClientRect().top + 64
      const current = atEnd ? sections.at(-1) : ([...sections].reverse().find((el) => el.getBoundingClientRect().top <= line) ?? sections[0])
      active.set((current?.dataset.section as SectionId | undefined) ?? null)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      root.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
      active.set(null)
    }
  }, [docs])

  return (
    <OpenComponent.Provider value={(next) => s.set({ library: next, libraryAt: null })}>
      <BudgetContext.Provider value={page}>
        <div ref={scroller} data-library-page data-wide={wide ? "" : undefined} className="min-h-0 flex-1 overflow-y-auto" style={wide ? ({ containerType: "inline-size", "--library-gutter": gutter } as React.CSSProperties) : undefined}>
          <article className="mx-auto grid w-full max-w-3xl gap-12 px-4 pt-6 md:px-8 md:pt-10">
            <header className="grid gap-2">
              <h1 className="font-heading text-2xl leading-tight font-semibold text-balance">{c.label}</h1>
              <p className="text-base text-pretty text-muted-foreground">{c.summary}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {docs?.source && (
                  <span data-provenance>
                    Documentation from {docs.source.name} {docs.source.version}, adjusted for {adapter.product.name} where marked.
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  Previews
                  <FidelityBadge mode={lookOf(adapter.target.fidelity)}>{adapter.target.label}</FidelityBadge>
                </span>
              </div>
            </header>
            {!docs ? (
              <EmptyState tone={failed ? "danger" : "neutral"} title={failed ? `${c.label} documentation did not load` : defined.includes(id) ? `${c.label} documentation has problems` : `${c.label} has no documentation yet`} description={problems.join(" ")} action={failed ? { label: "Try again", onClick: retry } : undefined} />
            ) : (
              SECTIONS.map((section) => (
                <section key={section.id} id={`lib-${section.id}`} data-section={section.id} aria-labelledby={`lib-${section.id}-title`} className="grid min-w-0 scroll-mt-6 gap-4">
                  <h2 id={`lib-${section.id}-title`} tabIndex={-1} className="font-heading text-lg font-semibold">
                    {section.label}
                  </h2>
                  <SectionBody id={section.id} docs={docs} component={id} values={values} wide={wide} />
                </section>
              ))
            )}
            {docs?.source && (
              <footer className="grid gap-1 border-t pt-4 text-xs text-muted-foreground">
                <h2 className="text-sm font-semibold text-foreground">Notice</h2>
                <p className="whitespace-pre-line">{docs.source.notice}</p>
              </footer>
            )}
          </article>
          {/* Room below the last section, so every section can scroll to the top of the page. */}
          <div aria-hidden className="h-[60svh]" />
        </div>
      </BudgetContext.Provider>
    </OpenComponent.Provider>
  )
}

const NONE = <p className="text-sm text-muted-foreground">Not documented yet.</p>

function SectionBody({ id, docs, component, values, wide }: { id: SectionId; docs: ComponentDocs; component: string; values?: Record<string, InputValue>; wide: boolean }) {
  if (id === "preview") {
    const pg = docs.preview.playground
    return (
      <div className="grid gap-10">
        <AdjustedNote reason={docs.preview.adjusted} />
        {pg && <PreviewBlock component={component} spec={{ ...pg, id: "playground", label: "Playground" }} values={values} pinned liveCode wide={wide} />}
        {docs.preview.groups.map((g) => (
          <PreviewBlock key={g.id} component={component} spec={g} wide={wide} />
        ))}
      </div>
    )
  }
  if (id === "examples") {
    if (!docs.examples) return NONE
    return (
      <div className="grid gap-10">
        <AdjustedNote reason={docs.examples.adjusted} />
        <Rich blocks={docs.examples.intro} />
        {docs.examples.items.map((g) => (
          <PreviewBlock key={g.id} component={component} spec={g} wide={wide} />
        ))}
      </div>
    )
  }
  if (id === "api") {
    const api = docs.api
    if (!api) return NONE
    return (
      <div className="grid gap-4">
        <AdjustedNote reason={api.adjusted} />
        <div role="region" aria-label="Properties" tabIndex={0} className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {["Property", "Type", "Default", "Description"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {api.props.map((row) => (
                <tr key={row.name} className="border-t align-top">
                  <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-medium">
                    {row.name}
                    {row.required && <span className="ml-1 font-sans text-muted-foreground">(required)</span>}
                  </th>
                  <td className="px-3 py-2 font-mono text-xs">{row.type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.default ?? ""}</td>
                  <td className="px-3 py-2">
                    <InlineText text={row.description} />
                    <AdjustedNote reason={row.adjusted} className="mt-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Rich blocks={api.notes} />
      </div>
    )
  }
  const key = SECTIONS.find((x) => x.id === id)!.key as Exclude<(typeof SECTIONS)[number]["key"], "preview" | "examples" | "api">
  const section = docs[key]
  if (!section) return NONE
  return (
    <div className="grid gap-3">
      <AdjustedNote reason={section.adjusted} />
      <Rich blocks={section.body} />
    </div>
  )
}

/** The context panel: components under their group headings (and sections, when declared), in the declared order, with search. */
function LibraryPanel() {
  const [query, setQuery] = React.useState("")
  const list = filterComponents(decl, query)
  const tree = sectionedComponents(decl, list)
  return (
    <>
      <SidebarHeader className="gap-2 border-b p-3">
        <div className="flex h-7 items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{LABEL}</h2>
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {list.length} of {decl.components.length}
          </span>
        </div>
        <div data-kit>
          <InputGroup>
            <InputGroupInput
              id="library-search"
              data-search
              value={query}
              onChange={(e) => {
                if (Object.keys(disclosure.get().searching).length) disclosure.set({ ...disclosure.get(), searching: {} })
                setQuery(e.target.value)
              }}
              placeholder="Search components"
              aria-label="Search components"
              className={INPUT}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        </div>
      </SidebarHeader>
      <SidebarContent data-kit>
        <nav aria-label="Components" className="py-1">
          {tree ? (
            <SectionTree tree={tree} searching={!!query.trim()} />
          ) : (
            groupedComponents(decl, list).map((g) => (
              <SidebarGroup key={g.id} data-library-group={g.id}>
                <h3 className="flex h-8 items-center px-3 text-xs font-medium text-muted-foreground">{g.label}</h3>
                <ComponentList components={g.components} />
              </SidebarGroup>
            ))
          )}
          {!list.length && <p className="px-4 py-3 text-sm text-muted-foreground">No component matches “{query}”.</p>}
        </nav>
      </SidebarContent>
    </>
  )
}
/** A group's components; while searching with sections, each says where it is listed. */
function ComponentList({ components, path, nested }: { components: LibraryComponent[]; path?: string; nested?: boolean }) {
  const s = useStudio()
  return (
    <SidebarMenu className={nested ? "pl-4" : undefined}>
      {components.map((c) => (
        <SidebarMenuItem key={c.id}>
          <SidebarMenuButton isActive={s.library === c.id} aria-current={s.library === c.id ? "page" : undefined} className="border border-transparent pointer-coarse:min-h-11" onClick={() => s.set({ library: c.id, libraryAt: null, mobilePanel: null })}>
            {path ? (
              <>
                <span className="min-w-0 truncate">{c.label}</span>
                <span data-library-path className="ml-auto min-w-0 shrink truncate text-xs text-muted-foreground">
                  {path}
                </span>
              </>
            ) : (
              c.label
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

const DISCLOSURE = "flex w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-left hover:bg-sidebar-accent pointer-coarse:min-h-11"

/** One disclosure: a native button naming the branch and how many listings it holds, and the region it opens. */
function Disclosure({ level, id, label, count, open, onToggle, children }: { level: "section" | "group"; id: string; label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const region = `${React.useId()}-${level}-${id}`
  // Headings wrap the buttons (sections h3, groups h4), so heading navigation reaches them as in an accordion.
  const Heading = level === "section" ? "h3" : "h4"
  return (
    <div data-library-section={level === "section" ? id : undefined} data-library-group={level === "group" ? id : undefined} className={level === "section" ? "px-2 py-1" : "pt-0.5 pl-2"}>
      <Heading>
        <button
          type="button"
          data-library-disclosure={level}
          aria-expanded={open}
          aria-controls={region}
          onClick={onToggle}
          className={cn(DISCLOSURE, level === "section" ? "min-h-8 text-sm font-medium text-sidebar-foreground" : "min-h-7 text-xs font-medium text-muted-foreground hover:text-foreground")}
        >
          <ChevronRightIcon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span data-library-count className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
          <span className="sr-only">{count === 1 ? " component" : " components"}</span>
        </button>
      </Heading>
      <div id={region} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

/** Sections holding groups, each a disclosure; the open page's branch opens on navigation, and searching opens every match's branch. */
function SectionTree({ tree, searching }: { tree: NonNullable<ReturnType<typeof sectionedComponents>>; searching: boolean }) {
  const d = React.useSyncExternalStore(disclosure.subscribe, disclosure.get)
  return tree.map((x) => {
    const sectionKey = `section:${x.id}`
    return (
      <Disclosure key={x.id} level="section" id={x.id} label={x.label} count={x.groups.reduce((n, g) => n + g.components.length, 0)} open={isOpen(d, sectionKey, searching)} onToggle={() => toggle(sectionKey, searching)}>
        {x.groups.map((g) => {
          const groupKey = `group:${g.id}`
          return (
            <Disclosure key={g.id} level="group" id={g.id} label={g.label} count={g.components.length} open={isOpen(d, groupKey, searching)} onToggle={() => toggle(groupKey, searching)}>
              <ComponentList nested components={g.components} path={searching ? `${x.label} › ${g.label}` : undefined} />
            </Disclosure>
          )
        })}
      </Disclosure>
    )
  })
}

/** Details on a library page: On this page, the playground and the preview theme. */
function LibraryDetails({ onClose }: { onClose?: () => void }) {
  const s = useStudio()
  const current = React.useSyncExternalStore(active.subscribe, active.get)
  const c = decl.components.find((x) => x.id === s.library)
  if (!c) return null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <h2 className="font-heading text-base font-semibold">On this page</h2>
        {onClose && (
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close details" onClick={onClose}>
            <PanelRightIcon />
          </Button>
        )}
      </div>
      <div data-kit className="grid min-h-0 flex-1 content-start gap-8 overflow-y-auto p-4">
        <PartBoundary key={`outline/${c.id}`} name="outline">
          <nav aria-label="On this page">
            <ul className="grid">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-current={current === section.id ? "location" : undefined}
                    className={cn("flex min-h-8 w-full items-center rounded-md border border-transparent px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:min-h-11", current === section.id && "font-medium text-foreground")}
                    onClick={() => {
                      s.set({ libraryAt: section.id, mobilePanel: null })
                      scrollTo.current?.(section.id, true)
                    }}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </PartBoundary>
        <PartBoundary key={`playground/${c.id}`} name="playground">
          <React.Suspense fallback={null}>
            <Playground id={c.id} />
          </React.Suspense>
        </PartBoundary>
        <PreviewSettings />
      </div>
    </div>
  )
}

function Playground({ id }: { id: string }) {
  const { docs } = React.use(docsFor(id))
  const all = React.useSyncExternalStore(edits.subscribe, edits.get)
  const pg = docs?.preview.playground
  if (!pg) return null
  const mine = all[id] ?? {}
  const set = (prop: string, value: InputValue) => edits.set({ ...all, [id]: { ...mine, [prop]: value } })
  return (
    <section aria-labelledby="library-playground" className="grid gap-4">
      <div className="flex items-center gap-2">
        <h2 id="library-playground" className="text-sm font-semibold">
          Playground
        </h2>
        <Button variant="ghost" size="sm" className={cn("ml-auto", TARGET)} disabled={!Object.keys(mine).length} onClick={() => edits.set({ ...all, [id]: {} })}>
          <RotateCcwIcon />
          Reset
        </Button>
      </div>
      {pg.properties.map((p) => (
        <PropertyField key={p.id} p={p} raw={mine[p.id]} onChange={(v) => set(p.id, v)} />
      ))}
    </section>
  )
}

/** One playground property. An edit the property cannot take stays in the field with the reason; the frame keeps the default. */
function PropertyField({ p, raw, onChange }: { p: PlaygroundProperty; raw: InputValue | undefined; onChange: (v: InputValue) => void }) {
  const value = raw ?? p.default
  const invalid = raw !== undefined && playgroundValue(p, raw) === undefined
  if (p.kind === "switch") return <Field kind="switch" label={p.label} description={p.description} checked={value === true} onChange={onChange} />
  if (p.kind === "select") return <Field kind="select" label={p.label} description={p.description} value={String(value)} options={p.options} onChange={onChange} />
  if (p.kind === "text") return <Field kind="text" label={p.label} description={p.description} value={String(value)} error={invalid ? `At most ${p.maxLength ?? 500} characters on one line` : undefined} onChange={onChange} />
  return <NumberField p={p} value={value} onChange={onChange} />
}

/**
 * A number property keeps what the person types while they type (an empty field, "-" or "1." are steps on the way), and
 * sends an edit only for a non-empty value the property accepts; anything else shows the range and leaves the frame alone.
 */
function NumberField({ p, value, onChange }: { p: Extract<PlaygroundProperty, { kind: "number" }>; value: InputValue; onChange: (v: InputValue) => void }) {
  const id = React.useId()
  const range = `From ${p.min ?? "any"} to ${p.max ?? "any"}${p.step ? ` in steps of ${p.step}` : ""}`
  const [field, setField] = React.useState({ text: String(value), from: value })
  // Reset (or another part) changed the value: show it, unless it is what the typed text already says.
  if (field.from !== value) setField({ text: Number(field.text) === value && field.text.trim() !== "" ? field.text : String(value), from: value })
  const parsed = field.text.trim() === "" ? undefined : Number(field.text)
  const invalid = field.text.trim() !== "" && (parsed === undefined || playgroundValue(p, parsed) === undefined)
  return (
    <UIField data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{p.label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={p.min}
        max={p.max}
        step={p.step}
        value={field.text}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const text = e.target.value
          const n = text.trim() === "" ? undefined : Number(text)
          const ok = n !== undefined && playgroundValue(p, n) !== undefined
          setField({ text, from: ok ? n : value })
          if (ok) onChange(n)
        }}
        className={INPUT}
      />
      {invalid ? <FieldError id={`${id}-hint`}>{range}</FieldError> : <FieldDescription id={`${id}-hint`} className="text-xs">{p.description ?? range}</FieldDescription>}
    </UIField>
  )
}

/** The product theme every library preview uses, and Contrast where themes pair with high-contrast versions. */
function PreviewSettings() {
  const s = useStudio()
  const themes = adapter.axes.themes
  const paired = themes.some((t) => t.contrastOf)
  const base = themes.find((t) => t.id === s.theme)?.contrastOf ?? s.theme
  const high = themes.find((t) => t.contrastOf === base)
  return (
    <section aria-labelledby="library-preview-settings" className="grid gap-4">
      <h2 id="library-preview-settings" className="text-sm font-semibold">
        Preview
      </h2>
      <Field
        kind="select"
        label={adapter.axes.themeLabel}
        value={paired ? base : s.theme}
        options={(paired ? themes.filter((t) => !t.contrastOf) : themes).map((t) => ({ id: t.id, label: t.label }))}
        onChange={(id) => {
          const contrast = paired && s.theme !== base ? themes.find((t) => t.contrastOf === id) : undefined
          s.setTheme(contrast?.id ?? id)
        }}
      />
      {paired && high && <Field kind="switch" label="Contrast" checked={s.theme !== base} onChange={(on) => s.setTheme(on ? high.id : base)} />}
    </section>
  )
}
