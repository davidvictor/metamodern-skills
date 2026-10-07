# Adoption and verification

## Safe adoption

Run the preview before application against the actual project root. Inventory existing profile, native files, checker paths, testing policy, `AGENTS.md`, `README.md`, and `CLAUDE.md`. Preserve unrelated settings, instruction text, project decisions, commands, and dirty work. Managed links make policy discoverable without replacing core project documents.

The installer compares owned content and recorded hashes before updating generated targets. An unmanaged file at a target path or a locally changed generated file requires explicit reconciliation. Keep the local decision, adapt it deliberately, or record a chosen replacement; do not bypass integrity checks with deletion. Route an unresolved product obligation or source-authority choice to its owner. Reversible routine adoption already covered by the request does not need another approval loop.

Existing native root model/effort settings which are absent or match the proposed lead/default mapping install normally. Differing existing project Codex or Claude Code settings stop the default preflight without writes. An override added after installation also remains a conflict on a repeat application, rather than being erased as drift. Review the exact mapped fields and record whether their replacement is authorized by current project decisions. Then use `--adopt-routing` to explicitly adopt only those profile-controlled routing fields; unrelated native settings and additions remain preserved.

The mapped fields are Codex `model`, `model_reasoning_effort`, `agents.default_subagent_model`, and `agents.default_subagent_reasoning_effort`, plus Claude Code `model` and `effortLevel`. On repeat adoption, the flag also permits reviewed replacement of managed Codex registration `config_file` and `description` conflicts. Preview output enumerates every changed value. Unrelated registration fields remain preserved; initial unmanaged role registrations still block rather than becoming adoptable.

Repeat adoption compares managed registration values against the prior installed policy. A description update from the shared source applies normally when the current value still matches that prior policy. An intentional local registration override conflicts by default and requires a reviewed adoption decision; a source update does not wipe it.

Native project agent names must be unique in their own scope. Preflight and the checker reject a conflicting identity even when its file has a different filename or sits in a nested agent directory. Keep or rename the intentional local role, or reconcile its relationship to the shared role before adoption. `--adopt-routing` does not bypass duplicate identities, unmanaged generated targets, or managed-file hash conflicts.

Literal quoted native identity keys are parsed. Unsupported complex identity forms fail conservatively with a clear preflight error rather than being ignored and allowing a potential duplicate through.

Keep application checks independent of optional agent hooks and sibling repositories. The portable checker runs from the project itself. Install no test framework until the real stack and its existing suites establish what is useful. Preserve actual access, privacy, durable-data, money, and destructive-action obligations when provisional implementation choices change.

## CLI and availability

From the shared package directory, using Python 3.11 or newer:

```bash
python3 scripts/configure-engineering.py --project ROOT
python3 scripts/configure-engineering.py --project ROOT --apply
python3 scripts/check-engineering.py --project ROOT
```

For a reviewed replacement of conflicting mapped routing or managed Codex registration fields, preview and then apply explicitly:

```bash
python3 scripts/configure-engineering.py --project ROOT --adopt-routing
python3 scripts/configure-engineering.py --project ROOT --adopt-routing --apply
```

This is a bounded routing adoption flag, not a force-update option. Keep intentional local overrides when their authority is unresolved; report the conflict and continue independent work.

`--availability JSON` accepts a file with verified provider/model evidence. Use it on the preview, apply, and check commands when available. The installer does not probe or contact a provider. Keep evidence current for the host and account receiving configuration; a list from another machine is not installation-time permission evidence. The policy asset specifies candidates, not their current availability.

The top-level JSON object contains `providers`. Each supplied `codex` or `claude-code` entry contains a nonempty `source`, a timezone-aware ISO 8601 `verified_at`, and a `models` array. Each model has a unique `id` and nonempty `reasoning_efforts` array of permitted effort names. Include the required low/medium/high combinations as actually supported by the account. Omit unobserved providers rather than asserting access. `status` other than `verified`, or `verified: false`, explicitly leaves that provider unverified.

The current policy accepts evidence up to 24 hours old. Stale or explicitly unverified evidence remains `not_verified` and cannot select a newer low Codex candidate. Without fresh evidence, an existing valid low selection is preserved; a new project uses the declared fallback provisionally. A timestamp more than five minutes in the future or missing its timezone is invalid input. Check the adopted policy for its current freshness window when updating.

Exit `0` means the applicable local configuration checks passed; absence of provider evidence still leaves availability unverified. Exit `1` reports configuration failure or conflicts. Exit `2` reports supplied or retained model evidence incompatible with the routing, and blocks application. Inspect the result's actual state rather than deriving provider readiness from an exit code.

## Evidence ladder

| State | Required evidence | Claim it does not establish |
| --- | --- | --- |
| Profile installed | Exact owned files, integrity state, preserved local changes | Native configuration loaded |
| Configuration checked | Portable checker result and any conflicts | Provider access or application readiness |
| Availability verified | Current host/account source allows selected model | A request completed on that model |
| Native discovery observed | Fresh native session lists expected custom roles and effective settings | Successful provider turn |
| Provider turn observed | Bounded successful task with effective provider/model/effort evidence | Feature correctness, deployment, or acceptance |

Report evidence rather than collapsing these into one ready flag. A checker can succeed while availability or native discovery remains unverified. Missing credentials, unavailable host tooling, or a conflicting local override blocks only the corresponding claim.

For a live smoke check, use one small read-only evidence task per necessary route or effort class, within the task's authority and resources. Record selected versus effective models, effort, runtime version, success/failure, and limitations. Reuse prior evidence only when its scope and freshness still match. Do not repeatedly run provider tasks merely to make configuration evidence look stronger.

## Updating and recovery

Keep package provenance, the installed profile version, and project overrides in Git when project policy permits. Preview a later shared update; compare managed files and intentional decisions, then apply only the reconciled change. Run the configuration checker after routing changes and the affected project checks after application changes. A fresh session may be necessary for native discovery; current chats may retain their earlier routing.

If application fails, inspect the reported conflict and actual files before retrying. Restore only task-owned changes from a reviewed Git diff or task-owned backup. Never reset the entire workspace, stop another project's services, alter global configuration, or overwrite local policy as a recovery shortcut.
