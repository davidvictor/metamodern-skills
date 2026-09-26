# Verification and handoff

## Verify the selected slice

First record the checkout revision, working-tree state, remotes, source instructions, root and downstream runtime engines, Node version, effective root and child pnpm versions, lockfile state, and available local resources. Use Corepack or an equivalent task-local shim so `pnpm install` and lifecycle commands use the `packageManager` version. A global pnpm executable that differs from the manifest is not sufficient.

Choose the cheapest trustworthy checks for the actual changed surfaces. Typical sequence after a safe lockfile installation is relevant configuration validation, a path-targeted static check, and startup or route inspection for the selected entry behavior. Inspect script composition before supplying startup flags: a wrapped `next dev` script can send an appended port flag to another process. Use a supported `PORT` environment setting or a verified direct Next CLI invocation for a nondefault port. Run database checks only with an owned Docker-compatible stack. Do not begin by running every generic formatter, test, reset, or service script; inspect their effects first.

For a marketing disposition, inspect root, localized public routes where applicable, signed-out and signed-in entry, retained navigation, removed-route behavior, sitemap/assets, and auth boundaries. For identity changes, inspect configuration validation, rendered metadata or visible identity, and related auth/email/passkey local labels when they are in scope. Before claiming local isolation or E2E evidence, verify effective dev/test URL/key pairs and the web, API, Mailpit, MCP, devtool, jobs, and webhook targets that the selected check can consume. Exclude an unretargeted consumer rather than treating a default listener as owned. Treat local fixtures and provider stubs as local evidence only.

## Evidence states

Report each item as implemented, checked, reviewed, repository-delivery-ready, deployed, or live-verified only when its own evidence supports that state. A named-slice runtime proof includes the exact checkout/revision, command, local resource identity, result, and limitations. It does not prove hosted configuration, repository delivery readiness, deployment, or customer acceptance.

## Handoff

Return:

1. Named task, source authority, exact source revision, and applied decisions.
2. Retained, adapted, hidden, removed, and deferred starter surfaces with consumers checked.
3. Local stack identity, configured and derived ports, secret-file handling, fixtures, callbacks, passkey origins, and ownership evidence.
4. Commands and results, known baseline failures, missing capabilities, and the narrow claims those gaps block.
5. The next concrete development task, acceptance examples, responsible dependency owner, recovery action, and review/checks needed for repository delivery.
