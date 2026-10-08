# Updating a Studio's shell

Read this when a Studio already in use should get the newest shell: new features, design refinements and fixes released in this skill. It covers the shell only. Reconciling the product's scenarios, evidence and presenter work is the Update operation in [manifest.md](manifest.md).

## Ownership

Every file in a Studio has one owner.

| Owner | Files | The updater |
| --- | --- | --- |
| Product | `src/adapter.ts`, `studio.config.ts`, `src/workspace/`, `src/library/` and `src/design-runtime/` and `src/design-ui/` (every file in them), the product adapter under `src/adapters/`, `layouts.json`, `scenarios.json`, `directions.json` (or the configured savedFiles.directions path), captures, and every file that did not come from the starter | Never writes them. `src/adapter.ts`, `studio.config.ts`, `src/workspace/index.ts` and `src/library/index.ts` and `src/design-runtime/index.ts` and `src/design-ui/index.ts` are created when missing, so a deleted one comes back on the next update: the workspace and library seeds empty, `src/adapter.ts` as the starter's, and `studio.config.ts` rebuilt from the Studio's `index.html`. Nothing under `src/workspace/` or `src/library/` is compared, locked, added, replaced or deleted. |
| Shell | Every other starter file: `src/studio/`, `src/components/`, `src/store.tsx`, `src/App.tsx`, the CSS, `index.html`, `vite.config.ts`, the TypeScript and lint configs, `UPDATING.md` | Replaces them whole. A local edit blocks the update. |
| Shell, optional | `README.md`, `example/`, `src/adapters/example.ts`, `src/adapters/synthetic.ts`, `scripts/acceptance.mjs` | As shell files, but a Studio may delete them on purpose and record that. |
| Merged | `package.json` | The shell's packages take the shell's versions; packages and scripts the Studio added stay; a script the Studio removed stays removed; a package the previous shell declared and the new one dropped is removed. `name`, `version` and `private` stay the Studio's. |
| Regenerated | `package-lock.json`, `next-env.d.ts` | Replaced when the shell's lockfile changed, then refreshed by `npm install`. |

Product needs belong in the adapter or `studio.config.ts`, never in shell files. A shell defect found in a Studio is fixed in this skill and reaches every Studio through an update.

## Commands

```bash
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <new-dir> --create
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <studio-dir>
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <studio-dir> --apply
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <studio-dir> --adopt
```

- `--create --host vite` (default) or `--create --host next` composes the common source and selected host overlay into an empty folder and writes `studio-shell.lock.json`. Use it for Build instead of copying by hand.
- Without `--apply` the updater writes nothing. It lists every action, every blocked file with a diff against the new shell file, the update notes between the two versions, and the files recorded as removed.
- `--apply` writes only when nothing is blocked and no shell file has uncommitted Git changes (`--allow-dirty` overrides the Git check). It then runs `npm install`, `typecheck`, `lint`, `build`, and `acceptance` when the acceptance script, the example (with `example/workspace/` and `example/library/`), the acceptance adapters and Playwright are all present; otherwise acceptance is reported as skipped with that reason. A failing check is reported by name with its output; the files stay updated, so fix it in place and let Git hold the previous state.
- `--accept-kit studio-kit/<n>` confirms an update that changes the Studio UI kit's major version (see below).
- `--skip-checks` skips the install and checks. `--json` prints the result as JSON, with a `kit` field (`{ from, to }` when the kit's major version changes, else null).

Update in this order: publish and install the skill release (`bash skills/install.sh` in the Agency), then run the updater on each Studio, review the report, apply, and commit the Studio.

## Blocked files

Nothing is written until every blocked file is resolved. Each flag may repeat and takes a file or a folder ending in `/`.

| Blocked because | Resolve with |
| --- | --- |
| A shell file was edited in the Studio | Move the change into this skill and release it; or `--replace <path>` to take the shell's version; or `--keep <path> --reason "<why>"` to keep the edit. A kept file is listed on every update, with the shell's diff whenever the shell changes it. |
| A shell file is missing | `--replace <path>` restores it. For an optional file deleted on purpose, `--removed <path>`. |
| A Studio file collides with a file the new shell adds | Rename the Studio's file, or `--replace <path>`. |
| A file recorded as removed exists again | Delete it, or `--replace <path>` to take it back into the shell's care. |

## The lock

`studio-shell-lock/2` records `host` and common/overlay/composed hashes under `composition`. Legacy `studio-shell-lock/1` always means Vite. Updates preserve that host; a mismatched `--host` refuses before writes and requires a separately scoped migration. Release fingerprints retain old Vite layouts and include both current compositions.

`studio-shell.lock.json` sits in the Studio root, is written only by the updater, and is committed with the Studio.

| Field | Holds |
| --- | --- |
| `shell` | The shell version the Studio is on. |
| `files` | The SHA-256 of every shell file as the shell shipped it. A local file that differs has been edited. |
| `package` | The shell's dependencies, dev dependencies and scripts, for the `package.json` merge. |
| `packageLock` | The SHA-256 of the shell's `package-lock.json`. |
| `removed` | Optional files or folders the Studio deleted on purpose. |
| `kept` | Shell files kept with a local edit: path, reason and the version it was kept since. |

## Adopting a Studio made before the lock

Studios made from shell 0.2.0 to 0.5.0 have no lock. `--adopt` compares the Studio with every released shell in [studio-shell.releases.json](../assets/studio-shell.releases.json), picks the best match (the newer one on a tie), and treats that release as the Studio's starting point. The report lists every shell file that differs from it; resolve them as above and apply with `--adopt --apply`. The first adoption also creates `studio.config.ts` from the Studio's own `index.html` title and `vite.config.ts` output folder.

## Studio UI kit versions

Workspace modules (see [workspace](workspace.md)) build on `@studio/kit`, whose major version is `KIT_VERSION` in `src/kit/index.ts` (`studio-kit/1`). When an update changes it, the report says Breaking and names both versions, and `--apply` writes nothing and exits 1 until `--accept-kit <new version>` names exactly the new version. Read the update notes, change the modules in `src/workspace/`, then apply. A Studio without modules can accept at once. An update within one kit version needs nothing.

## Releasing a shell change

For every change to `assets/studio-shell/`:

1. Bump `PACKAGE_VERSION` and the catalog entry.
2. Add a section to `assets/studio-shell/UPDATING.md` for anything a product must do by hand: new required adapter fields, frame-client changes the preview entry must pick up, protocol changes, renamed product files. Write "Nothing to do by hand." when there is nothing. For a kit major change, say what modules must change.
3. Regenerate the release fingerprints with `node scripts/generate-studio-shell-releases.mjs` in the skill collection repository.
4. Run the collection tests, then publish, pin and install as usual.
5. Update one real Studio with the new release and report what the updater said.

## Next host

Next uses App Router with a bare root layout and a client-only dynamically imported shell entry. Studio CSS loads only with that entry; product iframe routes can render in the bare layout without shell styles. The product's `studio.config.ts.inputs` preview documents build through a small Vite preview builder into `public/`, separate from the shared UI. Configured preview outputs are generated artifacts; keep unrelated assets outside those declared outputs. Workspace/library loaders remain explicit product maps. `scripts/prepare-next.ts` validates the same declarations as Vite and writes `.studio-generated/` maps/saved-file snapshots. It refuses a product collision at its generated reserved `app/%5F%5Fstudio/[file]/route.ts` service file.

The Next client bootstraps live development scenarios/layouts before importing the common browser store, so newly saved IDs resolve on reload and in fresh links. Review builds retain bundled snapshots. Only `next dev` writes saved files through the shared same-origin/schema/size/revision/atomic-write handler. `next build && next start` offers read-only bundled saved data and refuses POST. For static review use `STUDIO_STATIC=1 npm run build`; its output has no saved-file route and no save capability. Do not treat a deployed filesystem as durable. `next-env.d.ts` is regenerated by Next.

The Vite acceptance suite remains `npm run acceptance`. Both hosts also offer `npm run acceptance:host` with Playwright installed (or `PLAYWRIGHT_MODULE` pointing to an available module), using synthetic Library/Inspect/Design/Compare/Responsive flows. Run it only in a disposable generated consumer: its save/reload checks write that consumer's synthetic layouts. `STUDIO_HOST_URL` can target an already running task-owned fixture; set `STUDIO_HOST_LIBRARY=0` when it has no synthetic library.

Next linting uses the official `@next/eslint-plugin-next` recommended rules alongside the shared TypeScript/hooks and product import-boundary checks. Mixed provider/hook/helper exports are supported. The Vite refresh export rule stays in the Vite overlay. `npm run acceptance:lint` exercises synthetic exports, official inline directives and the invalid async-client rule without copying product source.

The optional rich Design interface is described in [design-ui.md](design-ui.md). Its entire src/design-ui/ tree is product-owned; host updates preserve it and its explicit module map.

For mapped Free icons and state-preserving appearance updates, use the explicit [live appearance contract](frame-protocol.md#declared-live-appearance-0190). Verify a negotiated `live-appearance` client, refused/invalid and stale updates, state preservation and an older client's remount fallback. A single installed `stroke-rounded` style does not imply alternate style availability or entitlement.
