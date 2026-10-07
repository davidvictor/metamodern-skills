# Profile contract

## Scope and source

The [routing asset](../assets/engineering-profile.json) defines the shared defaults. Its profile version is distinct from `PACKAGE_VERSION`. The installed `docs/engineering/profile.json` records the adopted policy, chosen models, availability evidence, and managed-file integrity. It belongs to the project; the shared package is the source for future deliberate updates.

These assignments are an operating preference. Refresh current provider documentation and actual host availability when native configuration or model support matters. The package does not grant provider access or spending authority.

## Role routing

| Role group | Roles | Effort | Codex | Claude Code |
| --- | --- | --- | --- | --- |
| Lead | Root orchestration | high | `gpt-6.1-sol` | `claude-opus-5-5` |
| Light evidence | `explorer`, `vision` | low | Newest verified permitted candidate: `gpt-6.1-luna`, then `gpt-6-luna` | `claude-sonnet-5` |
| Bounded work | `analyst`, `planner`, `docs-researcher`, `worker`, `test-engineer`, `git-master`; unnamed default | medium | `gpt-6.1-sol` | `claude-opus-5-5` |
| Deep work | `architect`, `designer`, `debugger`, `reviewer`, `security-reviewer`, `browser-debugger`, `build-fixer`, `code-simplifier`, `verifier` | high | `gpt-6.1-sol` | `claude-opus-5-5` |

Read-only evidence and review roles retain their access boundaries. Implementation roles receive workspace write scope, not release or external mutation authority. With no verified catalog, the declared low Codex fallback can be written as a provisional selection and must remain explicitly unverified. An explicit supplied catalog which excludes required models is a configuration gap; it does not authorize a different model family.

Availability evidence names permitted models on the relevant host/account. A current model picker or provider catalog can establish that selection is permitted; it cannot establish a successful provider turn. Preserve the source/date and report the exact selected model. Keep project overrides explicit and inspect runtime/environment precedence rather than assuming files always win.

## Native files and portable outputs

| Output | Role |
| --- | --- |
| `docs/engineering/profile.json` | Adopted defaults, model selections, provider evidence, and integrity state |
| `docs/engineering/README.md` | Project-local operation and evidence guide |
| `docs/engineering/testing-policy.md` | Portable testing policy, subject to current project obligations |
| `scripts/check-engineering.py`, `scripts/engineering_profile.py` | Standalone structural checker and support code |
| `.codex/config.toml`, `.codex/agents/*.toml` | Codex lead/default settings and custom roles |
| `.claude/settings.json`, `.claude/agents/*.md` | Claude Code lead settings and custom roles, including medium-effort `general-purpose` default dispatch |
| Managed `AGENTS.md` and root `README.md` links | Make the installed profile and policy reachable |
| `CLAUDE.md` with `@AGENTS.md` when absent | Share project instructions across runtimes |

Claude Code's `general-purpose` agent makes the unnamed medium-effort default explicit while its main conversation stays Opus/high. Named roles retain their individual effort. Explicit CLI/dispatch overrides, managed settings, and environment constraints can still change effective routing.

Profile-controlled root lead/default settings are adopted automatically only when absent or already matching. Differing intentional project routing or managed Codex registration `config_file`/`description` overrides stop the installer without writes unless a reviewed `--adopt-routing` invocation selects replacement of those mapped fields. Preview output enumerates each changed value. Unrelated registration fields remain preserved, and matching prior source values can accept a normal source-description update. Native role identity must be unique within project scope; alternate filenames and nested agent directories cannot silently shadow a generated role. Both preflight and the portable checker report those conflicts. Literal quoted identity keys are parsed; unsupported complex forms fail conservatively. Unrelated settings and roles stay preserved.

Generated files do not choose an application stack, test framework, database, service topology, CI budget, or release target. The package neither changes global agent settings nor copies a shared skill into the project. It does not change machine trust, authentication, or the caller's sandbox/approval policy.

## Native documentation

Refresh [Codex subagent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents) before changing the adapter. Codex custom TOML agents use a `name`, description, model, reasoning effort, sandbox mode, and developer instructions; the name is the role identity. Trust and runtime discovery remain separate from generating these files.

Refresh [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [model configuration](https://code.claude.com/docs/en/model-config) before changing that adapter. Agent Markdown frontmatter supports full model IDs and model-dependent effort levels. Per-invocation model selections, environment variables, and organization constraints can alter the effective assignment. Inspect the effective native task model and effort when verifying adoption.
