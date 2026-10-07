---
name: metamodern-configure-engineering
description: Use when the user asks to configure, adopt, inspect, or update a project's shared engineering profile, or authorized engineering initiation or MakerKit bootstrap needs portable testing guidance and native Codex and Claude Code agent routing.
---

# Metamodern Configure Engineering

## Establish the boundary

Inspect the actual project root, checkout, instructions, dirty paths, existing engineering decisions, native configuration, and shared skill provenance. Apply only within authorized engineering setup. An Inspect request stays read-only. Brand, prose, document, and workspace orientation work does not install this profile automatically.

Use [Profile contract](references/profile-contract.md) for model routing and native outputs, and [Adoption and verification](references/adoption-and-verification.md) for preservation and evidence. The [profile asset](assets/engineering-profile.json) is the routing source; the [testing policy](assets/testing-policy.md) and [engineering guide](assets/engineering-guide.md) supply portable project guidance. Preserve project obligations and overrides when adopting these defaults.

## Preview and configure

From this installed skill directory with Python 3.11 or newer, run the bundled preview against the verified project root:

```bash
python3 scripts/configure-engineering.py --project ROOT
```

Replace `ROOT` with the actual project path. Review the proposed files and conflicts. When engineering configuration is authorized, apply the same bounded plan:

```bash
python3 scripts/configure-engineering.py --project ROOT --apply
```

Pass `--availability JSON` only with current provider/model evidence in the documented format. Do not invent a model catalog from defaults or documentation. Missing evidence can leave provider availability unverified while local configuration is installed. Select the newest permitted low-cost Codex candidate that the evidence actually allows; all other Codex assignments retain `gpt-6.1-sol`. Keep the role effort and access boundaries.

The installer owns its generated profile, native routing, portable checker, and managed instruction links. Keep unrelated configuration and user prose. If it reports an existing unmanaged target or modified managed file, reconcile that specific conflict with the project owner or its recorded decision before adopting it; never delete local policy to make the installer pass. A new package version is an available update, not authority to erase project customizations.

Absent or matching native root routing installs normally. Differing existing Codex or Claude Code lead/default settings and intentional overrides of managed Codex registration `config_file` or `description` are conflicts; the default path writes nothing. After reviewing the enumerated value changes and recording replacement of those specific mapped fields within the task's authority, preview with `--adopt-routing` and apply with `--adopt-routing --apply`. The flag preserves unrelated settings/registration fields and does not adopt initial unmanaged role registrations or bypass generated-file integrity or duplicate-agent-identity checks. Resolve same-scope duplicate native names at alternate filenames or nested directories before application. See the adoption reference for source updates versus local overrides and conservative identity parsing.

## Connect project instructions

Project Preparation owns `PROJECT.md`, `REFERENCES.md`, and `AGENTS.md`; this package adds managed engineering links without replacing their authority. Return supported facts to `metamodern-prepare-project` for a portable-core-only merge if needed. That delegated call returns here and must not dispatch initiation, bootstrap, or this configuration again.

Record the canonical shared package and generated profile in `REFERENCES.md` with their distinct roles. Keep the shared skill at user scope; generated `.codex`, `.claude`, checker files, and project policy are local runtime configuration rather than a same-name project skill. Record real project commands in `README.md` only after the actual stack supplies them. Do not install a generic test framework or add a package manifest merely to configure agents.

## Check and report evidence

Run the bundled checker after application:

```bash
python3 scripts/check-engineering.py --project ROOT
```

The installed project also carries `scripts/check-engineering.py` and `scripts/engineering_profile.py`, so the configuration check works without this collection checkout. With current availability evidence, use the same optional `--availability JSON` argument.

Report changed files, preserved overrides or conflicts, selected models and efforts, availability evidence, structural configuration checks, and pending native discovery or provider-turn checks separately. A parsed file or passing checker does not prove the runtime loaded it, the account can use the model, or the application is ready. Fresh native sessions establish discovery; a bounded successful provider turn establishes use. Run those only within the current task authority and available tools, and keep unobserved states explicit.

Return to the initiation or bootstrap caller with this evidence. Standalone use ends at its configured and checked local outcome unless the user requested a later delivery action.
