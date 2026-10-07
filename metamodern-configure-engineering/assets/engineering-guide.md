# Engineering profile

Read the project `AGENTS.md`, `PROJECT.md`, and `REFERENCES.md` first. This directory records the adopted shared engineering configuration and portable testing guidance. Current project decisions and task authority control outcomes and delivery.

## Local files

- `profile.json` records profile provenance, routing defaults, chosen models, provider availability evidence, and managed-file integrity.
- `testing-policy.md` guides meaningful proof, test-first risk boundaries, browser evidence, and the owner/check/review/correction loop.
- Root `.codex/config.toml` and `.codex/agents/` provide Codex routing; `.claude/settings.json` and `.claude/agents/` provide Claude Code routing.
- Root `scripts/check-engineering.py` and `scripts/engineering_profile.py` run without the shared collection checkout.

From the project root with Python 3.11 or newer:

```bash
python3 scripts/check-engineering.py --project .
```

Optional current provider evidence can be supplied with `--availability JSON`. The configuration checker inspects files and routing; it does not contact providers. Record actual application commands and required checks in the root `README.md` after selecting the stack. No build/test/server command is invented by this profile.

## Routing and evidence

The lead uses high effort. Explorer and vision roles use low effort, routine bounded roles medium effort, and deeper review/design/debugging roles high effort. Codex uses `gpt-6.1-sol` except the light evidence roles, which select the newest verified permitted low-cost candidate from the declared candidates. Claude Code uses `claude-sonnet-5` for low effort and `claude-opus-5-5` for medium/high effort, including the lead. Its explicit `general-purpose` agent keeps unnamed default dispatch at medium effort. Inspect `profile.json` for exact selections and current evidence.

Report configuration installation/checks, model availability, native discovery, and successful provider turns separately. A passing checker does not prove the runtime loaded configuration, the account can use the model, or the application is ready. Fresh sessions may be necessary to discover changed custom roles. Runtime/environment overrides can alter effective model or effort; observe the effective assignment when making a provider-use claim.

## Operating method

Use one implementation owner per coherent outcome. Add independent specialists only for useful bounded work with separate writable files/resources. Run focused checks while implementing, required integrated checks at the affected delivery boundary, and an independent integrated review for substantive code changes. Group corrections and recheck their actual boundary; after two unsuccessful same-cause corrections, change diagnosis before trying again.

Choose proof from risk and use the lowest trustworthy layer. Test consequential boundaries and escaped defects first; manual/static evidence may be appropriate for reversible exploration with a stated reason and promotion follow-up. Keep tests aligned with accepted intent, remove obsolete assertions, and preserve actual access/privacy/data/money obligations. See `testing-policy.md` for the full policy.

## Adoption and updates

The shared package `metamodern-configure-engineering` owns generation. The installed project owns its decisions, overrides, required commands, test frameworks, and delivery endpoint. Keep unrelated native settings and instruction prose. Preview shared updates before application. Locally changed managed files or unmanaged targets require reconciliation; do not delete policy or overwrite configuration to force a clean check.

Absent or matching root lead/default model settings install normally. Differing project Codex or Claude Code routing and intentional managed Codex registration `config_file`/`description` overrides stop a default application without writes. After reviewing the enumerated changed values and recording replacement of those specific mapped fields, the shared installer can preview with `--adopt-routing` and apply with `--adopt-routing --apply`. Unrelated settings and registration additions remain preserved. Source-description upgrades proceed normally when current values still match the prior installed policy; keep unresolved intentional overrides as reported conflicts. Initial unmanaged registrations remain blocked.

Native agent names must be unique within project scope. A duplicate identity at an alternate filename or nested agent directory conflicts in preflight and the checker. Literal quoted identity keys are parsed; unsupported complex forms fail conservatively. Routing adoption does not bypass duplicate identities, unmanaged targets, or locally changed generated content.

Record the canonical shared package source and this installed profile in `REFERENCES.md` with their roles and verification state. Maintain local decisions in Git. Configuration checks remain independent of optional hooks, credentials, sibling checkouts, and service startup. Installing this profile does not authorize provider provisioning, Git delivery, deployment, or publication.
