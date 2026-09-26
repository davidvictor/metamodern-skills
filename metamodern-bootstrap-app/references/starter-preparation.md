# Starter preparation

## Make the map first

For each applicable surface, record the decision, authority, affected consumers, verification, and recovery path:

| Surface | Inspect before deciding |
| --- | --- |
| Identity and metadata | App configuration, metadata consumers, locale copy, logos, icons, manifest, and public URLs |
| Public and entry routes | Root route, locale behavior, signed-out and signed-in entry, marketing subtree, navigation, redirects, sitemap, and internal links |
| Starter content | Demo copy, images, posts, documentation, changelog, legal and contact pages, seeded data, and fixtures |
| Product boundaries | Auth methods, account/team flows, feature flags, billing, CMS, email, social login, and provider integration points |
| Local behavior | Development/test environment URL and key pairs, callbacks, passkey relying-party origins, local URLs, service identity, configured and derived ports, Mailpit, E2E helpers, MCP/devtool endpoints, jobs, webhooks, and resource ownership |

Use one of keep, adapt, hide, remove, or defer. A removal requires concrete consumers to be inspected and a recovery path. Do not delete unrelated starter material merely because it is unused by the named task. Preserve upstream update paths and behavior needed by retained routes.

## Local isolation

Read actual `config.toml` and related configuration rather than copying default ports. Derive the project ID and every service port from the owned project identity, including shadow database and pooler-related defaults when configured. Probe current listeners and inspect local stack ownership before start, stop, migration, schema work, jobs, or webhooks. A stopped default stack is not safe to copy: do not adopt its project ID, ports, volumes, or credentials without verified ownership.

Reconcile the effective development and test environment URL/key pairs with the derived stack. `.env.local` can contain public local overrides and secret values; source-shipped local credentials may be synthetic, but neither source-shipped nor ignored values should be printed in reports. Keep real secrets out of Git. Update local callback URLs and passkey relying-party origins together when the derived local origin changes. Retarget E2E web/API/Mailpit consumers or exclude them from evidence. Keep registered MCP endpoints dormant or explicitly deferred until each points to the correct owned target; read back service identity before mutable mail, database, job, or webhook operations. Reconcile the local devtool's app, service, and webhook targets. A Docker-compatible runtime is required before claiming a DB-dependent check. Its absence blocks that claim, not non-DB preparation.

## Safe actions

- Use the checkout's project-local CLI and supported scripts after inspection.
- Do not run Supabase reset, destructive stop, or cleanup on a non-owned stack.
- Do not run upstream setup generation automatically.
- Do not auto-fix a healthcheck; inspect its command, target, and side effects before changing it.
- Do not provision hosted projects, set remote OAuth or billing providers, send email, or publish.
