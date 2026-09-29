# Updating this Studio

The shell in this Studio comes from the `metamodern-interface-studio` skill. Bring it up to the newest shell with the skill's updater instead of copying files by hand. First install the skill update, then run, from anywhere:

```bash
node ~/.agents/skills/metamodern-interface-studio/scripts/update-studio.mjs <this-studio>
```

That reports what would change and writes nothing. Add `--apply` to update; it then installs and runs typecheck, lint, build and, when it can, acceptance. The skill's `references/updating.md` explains blocked files and the lock.

The updater never changes product files: `src/adapter.ts`, `studio.config.ts`, the product's adapter, `layouts.json`, and anything that did not come from the starter. It replaces shell files whole, so change the shell in the skill, not here.

Each section below lists what a product does by hand when it updates to that version. The updater prints every section between the Studio's version and the new one.

## 0.6.0

- `studio-shell.lock.json` records the shell version and a fingerprint of every shell file. A Studio made before 0.6.0 has none: run the updater once with `--adopt`, which finds the shell version the Studio came from and lists every shell file that differs from it.
- `studio.config.ts` is new and belongs to the product. It holds the page title, the output folder and any extra pages to build. The updater creates it from the `<title>` in your `index.html` and the `outDir` in your `vite.config.ts`. Check it, and add to `inputs` any page your old `vite.config.ts` built besides the Studio.
- `index.html`, `vite.config.ts` and `tsconfig.app.json` are shell files again. Once their product settings are in `studio.config.ts`, take the shell versions with `--replace`. `index.html` now tells search engines not to index the Studio.
- `src/adapter.ts` only exports the product adapter. The acceptance build reaches its stress and capture-only adapters through `vite.config.ts`, so any `VITE_STUDIO_ADAPTER` branch in `src/adapter.ts` can go.
- Record deliberately deleted starter files with `--removed`, for example `--removed example/ --removed src/adapters/example.ts --removed src/adapters/synthetic.ts --removed scripts/acceptance.mjs`.
