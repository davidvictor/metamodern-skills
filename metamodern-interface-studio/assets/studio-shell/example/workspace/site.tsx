/*
 * The example workspace's one module: synthetic site settings read, written and conflicted against the
 * mock host (mock-host.mjs). Built only from @studio/kit and @studio/workspace, as every module must be.
 */
import * as React from "react"
import { Button, DataTable, EmptyState, Field, Icon, ModulePage, PropertyList, SaveBar, Section, StatusTile, Toolbar, type Column, type SaveBarState } from "@studio/kit"
import { useDirtyGuard, useModule, useModuleState, useOperation } from "@studio/workspace"

type Settings = { siteName: string; region: string; maintenance: boolean; apiKey: string }
type Change = { at: string; field: string; by: string }
type SiteData = { settings: Settings; history: Change[] }
type Loaded = { data: SiteData; revision?: string }
/** Unsaved edits and the load they started from; writes send that revision, so a change made elsewhere since is a conflict, never overwritten. */
type Draft = { values: Partial<Settings>; base: Loaded | null }
type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "conflict"; reason: string; theirs: Loaded } | { kind: "error"; reason: string; recoverable: boolean }

const REGIONS = [
  { id: "eu", label: "Europe" },
  { id: "us", label: "United States" },
  { id: "ap", label: "Asia Pacific" },
]
const LABELS: Record<keyof Settings, string> = { siteName: "Site name", region: "Region", maintenance: "Maintenance mode", apiKey: "API key" }
const shown = (key: keyof Settings, value: Settings[keyof Settings], before?: Settings[keyof Settings]) =>
  key === "apiKey" ? (value === before ? "Hidden" : "Changed (hidden)") : key === "maintenance" ? (value ? "On" : "Off") : key === "region" ? (REGIONS.find((r) => r.id === value)?.label ?? String(value)) : String(value)
const HISTORY: Column<Change>[] = [
  { id: "at", label: "When", value: (c) => c.at, render: (c) => new Date(c.at).toLocaleString(), width: "minmax(0,1.4fr)" },
  { id: "field", label: "Setting", value: (c) => LABELS[c.field as keyof Settings] ?? c.field },
  { id: "by", label: "By", value: (c) => c.by },
]

/** Settings as loaded from the host, shared with the Panel through module state. */
function useLoaded() {
  const read = useOperation<SiteData>("site.read")
  const [loaded, setLoaded] = useModuleState<Loaded | null>("loaded", null)
  const run = read.read
  /** Reads the settings again and keeps them when the read succeeds (Try again, Reload). */
  const load = React.useCallback(
    () =>
      run().then((r) => {
        if (r.ok) setLoaded({ data: r.data, revision: r.revision })
        return r
      }),
    [run, setLoaded]
  )
  React.useEffect(() => {
    let live = true
    void run().then((r) => {
      if (live && r.ok) setLoaded({ data: r.data, revision: r.revision })
    })
    return () => {
      live = false
    }
  }, [run, setLoaded])
  return { loaded, setLoaded, read, load }
}

export function SitePage() {
  const m = useModule()
  const { loaded, setLoaded, read, load } = useLoaded()
  const write = useOperation<SiteData>("site.write")
  const [draft, setDraft] = React.useState<Draft>({ values: {}, base: null })
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" })
  const [showHistory] = useModuleState("show-history", true)
  const dirty = Object.keys(draft.values).length > 0
  useDirtyGuard(dirty)
  if (!loaded) {
    const failed = read.result && !read.result.ok ? read.result.error : null
    return (
      <ModulePage title={m.label} busy={!failed}>
        {failed && <EmptyState tone="danger" title="Settings did not load" description={failed.reason} action={{ label: "Try again", onClick: () => void load() }} />}
      </ModulePage>
    )
  }
  const value: Settings = { ...loaded.data.settings, ...draft.values }
  const edit = (patch: Partial<Settings>) => {
    // The first edit records the load it started from; a Reload later does not move it.
    setDraft((d) => ({ values: { ...d.values, ...patch }, base: d.base ?? loaded }))
    if (phase.kind === "saved" || phase.kind === "error") setPhase({ kind: "idle" })
  }
  const save = async (base: Loaded | null) => {
    const sent = draft.values
    setPhase({ kind: "saving" })
    const r = await write.write(sent, { expectedRevision: base?.revision })
    if (r.ok) {
      const next = { data: r.data, revision: r.revision }
      setLoaded(next)
      // Only what was sent is saved; an edit typed while saving stays unsaved, now based on this save.
      setDraft((d) => {
        const values = Object.fromEntries(Object.entries(d.values).filter(([k, v]) => sent[k as keyof Settings] !== v)) as Partial<Settings>
        return { values, base: Object.keys(values).length ? next : null }
      })
      setPhase({ kind: "saved" })
    } else if (r.error.code === "conflict" && r.current) setPhase({ kind: "conflict", reason: r.error.reason, theirs: { data: r.current.data, revision: r.current.revision } })
    else setPhase({ kind: "error", reason: r.error.reason, recoverable: r.error.recoverable })
  }
  const bar: SaveBarState =
    phase.kind === "saving"
      ? { kind: "saving" }
      : phase.kind === "conflict"
        ? { kind: "conflict", reason: phase.reason, current: <PropertyList items={(Object.keys(draft.values) as (keyof Settings)[]).map((k) => ({ label: LABELS[k], value: shown(k, phase.theirs.data.settings[k], draft.base?.data.settings[k]) }))} /> }
        : phase.kind === "error"
          ? { kind: "error", reason: phase.reason, recoverable: phase.recoverable }
          : dirty
            ? { kind: "dirty" }
            : phase.kind === "saved"
              ? { kind: "saved" }
              : { kind: "clean" }
  const discard = () => {
    if (phase.kind === "conflict") setLoaded(phase.theirs)
    setDraft({ values: {}, base: null })
    setPhase({ kind: "idle" })
  }
  const retry = () => {
    if (phase.kind !== "conflict") return void save(draft.base)
    // "Save mine again": the person chose to replace what is stored now, so the edit is rebased on it.
    const theirs = phase.theirs
    setDraft((d) => ({ ...d, base: theirs }))
    void save(theirs)
  }
  const reload = () => void load()
  return (
    <ModulePage
      title={m.label}
      description="Synthetic settings kept by the example host. Writes send the revision they started from."
      actions={
        <Toolbar label="Site actions">
          <Button variant="outline" onClick={reload}>
            <Icon name="refresh" /> Reload
          </Button>
        </Toolbar>
      }
      footer={<SaveBar state={bar} onSave={() => void save(draft.base ?? loaded)} onDiscard={discard} onRetry={retry} />}
    >
      {(m.section ?? "general") === "general" ? (
        <>
          <Section title="General">
            <div className="grid gap-5">
              <Field kind="text" label={LABELS.siteName} value={value.siteName} onChange={(v) => edit({ siteName: v })} />
              <Field kind="select" label={LABELS.region} value={value.region} options={REGIONS} onChange={(v) => edit({ region: v })} />
              <Field kind="switch" label={LABELS.maintenance} description="Shows a maintenance notice to every visitor." checked={value.maintenance} onChange={(v) => edit({ maintenance: v })} />
            </div>
          </Section>
          {showHistory && (
            <Section title="Recent changes" description="Sort by any column, or filter.">
              <DataTable label="Recent changes" rows={loaded.data.history} columns={HISTORY} filterable initialSort={{ column: "at", direction: "desc" }} empty="No changes yet." />
            </Section>
          )}
        </>
      ) : (
        <Section title="Secrets" description="Revealed only on request, never placed in links.">
          <Field kind="secret" label={LABELS.apiKey} value={value.apiKey} onChange={(v) => edit({ apiKey: v })} />
        </Section>
      )}
    </ModulePage>
  )
}

export function SitePanel() {
  const [loaded] = useModuleState<Loaded | null>("loaded", null)
  const [showHistory, setShowHistory] = useModuleState("show-history", true)
  return (
    <div className="grid gap-4">
      <StatusTile label="Revision" value={loaded?.revision ?? "None yet"} status={loaded ? { tone: "ok", label: "Loaded" } : { tone: "neutral", label: "Loading" }} />
      <Field kind="switch" label="Show recent changes" checked={showHistory} onChange={setShowHistory} />
    </div>
  )
}

export function SiteDetails() {
  const m = useModule()
  return (
    <div className="grid gap-4 text-sm">
      <p className="text-muted-foreground">Writes send the revision they started from. A change made elsewhere since then is shown beside your edit, and nothing is overwritten until you choose.</p>
      <PropertyList label="Operations" items={m.uses.map((u) => ({ label: u.name, value: u.kind === "write" ? "Write" : "Read" }))} />
    </div>
  )
}
