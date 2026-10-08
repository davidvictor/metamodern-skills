# Studio icon build profiles

The public starter works with no paid credentials: its default Free profile uses `@hugeicons/core-free-icons@4.3.5` and `@hugeicons/react@1.1.10`. A licensed receiver may explicitly activate Pro, using `@hugeicons-pro/core-stroke-rounded@4.3.4` and the same renderer. The Studio chrome keeps its own Stroke Rounded appearance; a product adapter declares its real active product styles separately. A product with ten installed Pro styles supplies ten Pro choices, without adding Free. Style IDs describe appearance; profile metadata describes the installed provider.

## Licensed activation

Use the requesting project's authorized secret manager and protected scoped npm registry configuration. The canonical skill never asks for, stores, embeds or transports the license code. Do not put it in `studio-icons.json`, source, command arguments, browser fields or generated output. The same licensed owner's key can provision that owner's projects through their authorized local installation workflow; key entry is outside the Studio UI.

Run the following in the verified receiver with protected registry authentication already available to npm:

```bash
npm install --save-exact @hugeicons-pro/core-stroke-rounded@4.3.4 @hugeicons/react@1.1.10
node scripts/icon-profile.mjs activate pro
npm install
npm run typecheck
npm run lint
npm run build
```

Activation first validates the exact installed package/renderer and every semantic alias, then selects Pro and removes the unused Free dependency from the receiver manifest. The final install synchronizes the private lock. A missing package, wrong version or missing glyph refuses activation/build; there is no silent substitution. A configured Pro receiver stays Pro when a key is unavailable later; the required package must remain installed or be restored through its protected registry workflow. Public/new receivers without a Pro declaration stay Free.

`node scripts/icon-profile.mjs activate free` is an explicit local profile change after installing the exact Free package. It is not a Free option exposed in a Pro product's appearance picker. The generic example labels its one actual installed style as Pro or Free according to the build profile; product adapters own their active capability choices.

## Files and updater contract

`studio-icons.json` is a product-owned seed containing only `{ "schema": "studio-icon-profile/1", "edition": "free" }` or `"pro"`. The managed updater never overwrites it. Lock schema2 adds `icons` with the validated edition, provider package/version and fixed chrome style. Older locks without this field mean the default Free profile until explicitly activated. A build refuses disagreement between an existing profile lock declaration and the selected profile.

The updater projects the host dependency manifest for that declared profile. Pro updates preserve the receiver's private npm lock and exact Pro dependency instead of replacing it with the default Free lock. No managed source hash bypass or `--keep` exception is needed. New receivers use the normal `--create --host vite|next`, then the activation sequence above. Updating a Pro receiver requires its protected npm authentication whenever packages must be downloaded; report/apply and every skipped check remain explicit.

Ignored `.studio-generated/icon-glyphs.ts` contains import declarations only. Pro imports use published ESM per-glyph default subpaths resolved from the package's export-alias manifest, avoiding its incompatible CJS barrel and filename aliases. Licensed geometry stays in the installed package and compiled private receiver. `.studio-generated/icon-profile.ts` exposes safe build metadata through `@studio/icon-profile`; `@studio/icon-glyphs` is the shared internal glyph import seam. Vite, Next and Next's isolated preview builder resolve the same profile.

Build output `studio-icon-profile.json` records edition, exact packages, semantic-map/import/source fingerprints and glyph count. It contains no key, private account identifier or machine path. Preserve the renderer's MIT notice and handle Pro redistribution under the licensed project's applicable terms. The public package contains no Pro license or paid glyph data.

Next preview compilation replaces its generated `public/assets/` directory before rebuilding, removing prior-profile chunks. Keep authored product assets in another directory, such as `public/studio/`. This matches the host's existing ignored generated-output boundary; Vite already replaces its build output.

`parseIconProfile(data)` returns normalized five-field metadata without accessing the filesystem or installed packages. `assertIconProfileLock(lock.icons, profile)` checks that exact metadata. Integrity tools may use those functions on copied fixtures without `node_modules`; only `prepareIconProfile` and `activateIconProfile` validate installed provider/renderer versions and glyph availability. Activation projects both `package.json` and the lock's managed `package` baseline through the selected profile, alongside `lock.icons`, without changing managed source hashes.
