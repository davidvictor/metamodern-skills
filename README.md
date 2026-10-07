# Metamodern Skills

Reusable working methods for **Codex and Claude Code**, from shaping a prompt to developing a brand, preparing a project, and delivering software.

[![Validate skills](https://github.com/davidvictor/metamodern-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/davidvictor/metamodern-skills/actions/workflows/validate.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

These are the methods behind Metamodern's creative and technical work. Each skill gives an agent a focused workflow: what evidence to read, which decisions belong to the user, what to produce, and how to check the result. Install the ones you need. Your projects, private documents, accounts, and approvals stay yours.

## Develop software around an outcome

Four focused skills carry a shared outcome brief through development. They are independently usable; a clear small build does not need four separate stages. Project instructions retain authority over requirements, checks, branches and releases.

| Skill | Use it for |
| --- | --- |
| [$metamodern-plan-development](./metamodern-plan-development/SKILL.md) | Turn direction into acceptance, preservation/replacement boundaries and coherent delivery batches. |
| [$metamodern-execute-development](./metamodern-execute-development/SKILL.md) | Complete an authorized build or resume it with focused checks and required integrated validation. |
| [$metamodern-fix-development](./metamodern-fix-development/SKILL.md) | Separate product defects, obsolete assertions, environment failures and unrelated baseline failures, then repair the affected behavior. |
| [$metamodern-review-development](./metamodern-review-development/SKILL.md) | Independently review the integrated outcome and concrete risks, with grouped corrections and targeted re-review. |

The user supplies direction and material decisions. The agent resolves reversible implementation choices and carries existing authorization through to its endpoint. Planning alone stays read-only; release actions use the current request and standing project authority. Component families can be implementation steps within one delivery batch. Checks follow failure consequence, uncertainty and reversibility, including every required project check.

These skills augment the existing engineering process. The agent translates ordinary conversational direction into a brief and appropriately sized, usually sequential delivery worktrees. Every delivery boundary retains required testing and independent review; the user does not need to specify the engineering machinery.

```text
Use $metamodern-execute-development to replace the settings controls
with our selected UI library. Preserve submitted values, validation,
keyboard operation and focus return. Component structure and styling may
change. Finish at a checked, reviewed pull request; deployment is separate.
```

Install the four skills together, or choose only the one you need:

```bash
bash install.sh --skill metamodern-plan-development \
  --skill metamodern-execute-development \
  --skill metamodern-fix-development \
  --skill metamodern-review-development
```

## Configure a project's engineering profile

[Configure Engineering](./metamodern-configure-engineering/SKILL.md) is a standalone method for portable testing guidance and native Codex/Claude Code routing. Engineering initiation and MakerKit bootstrap use it when local engineering setup is authorized. Inspect, brand, prose, and general workspace preparation do not install the profile automatically.

Install the shared skill for Codex and Claude Code:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills \
  --skill metamodern-configure-engineering \
  --global --agent codex --agent claude-code --yes
```

Then invoke `$metamodern-configure-engineering` in the project you want to configure, or `/metamodern-configure-engineering` in Claude Code. The agent previews and applies the authorized local change while preserving existing policy and settings. The package generates `docs/engineering/profile.json`, a testing policy and guide, project-local native configuration, and a portable checker. Run `python3 scripts/check-engineering.py --project .` from the configured project.

Differing existing lead/default routing is a conflict with no writes by default. A reviewed `--adopt-routing` invocation replaces only the mapped routing fields; unrelated settings remain preserved. Intentional later overrides and duplicate native project agent identities also remain explicit conflicts. See the adoption guide before replacing project decisions.

Codex uses `gpt-6.1-sol` except low-effort explorer/vision roles, which choose the newest verified permitted low-cost candidate. Claude Code uses `claude-sonnet-5` for low effort and `claude-opus-5-5` for medium/high effort; the lead uses Opus at high effort. Effort and access boundaries remain explicit. Configuration checks, current provider availability, native discovery, and successful provider turns are reported separately. Installing files does not establish provider access or application readiness.

The [profile contract](./metamodern-configure-engineering/references/profile-contract.md), [adoption guide](./metamodern-configure-engineering/references/adoption-and-verification.md), and [portable testing policy](./metamodern-configure-engineering/assets/testing-policy.md) document routing, safe updates, and risk-based proof. Existing project decisions and required commands retain authority; test frameworks come from the actual stack. This package is reusable without MakerKit or the private Agency repository.

## Start with a better prompt

```text
Use Metamodern Prompt to expand this idea in three directions.
Then combine the strongest parts and prepare a prompt for implementation.
Preserve my constraints and flag any conflicting choices.
```

**Metamodern Prompt** has five modes:

| Mode | Use it to |
| --- | --- |
| Clarify | Make your intention precise without adding scope. |
| Expand | Explore distinct, useful directions. |
| Combine | Bring selected directions together without losing their contributions. |
| Prepare | Turn the result into an actionable brief with an outcome, boundaries, and evidence of completion. |
| Learn | Save, research, correct, inspect, or remove local domain knowledge for future prompts. |

You can also **review, focus, split, or shorten** a prompt. Modes can compose. Preparing a prompt does not execute the task inside it.

Prompt includes focused domain references for UI design, front-end development, back-end/API design, domain and data modeling, automotive design, automotive engineering, copywriting, and marketing, alongside the existing apparel, furniture, business, and research references. It consults only the guides relevant to your idea; naming a domain does not start the underlying design, coding, or campaign work. See the [domain guide index](metamodern-shape-prompt/references/foundation.md#select-only-relevant-references).

## Teach Prompt your domain

```text
Use Metamodern Prompt in Learn mode. Save this for future furniture prompts:
when I say "floating," I mean visually light, not necessarily wall mounted.
This is my terminology preference, not an industry definition.
```

You can also ask it to research a domain and save a concise, sourced reference, correct an earlier entry, show what it knows about a topic, or remove an entry. Learn saves only when you request it; ordinary prompt shaping does not silently build a profile. Research runs only when requested or separately authorized.

Later, ask: "Expand this furniture idea using my saved terminology." Prompt checks a small index and reads only relevant entries. It includes the needed meaning in the resulting prompt so another recipient does not need your local files. Saved material is reference context, not permission to run tasks.

Personal knowledge lives in `~/.metamodern/prompt-knowledge/`. Say "for this project only" to use `.metamodern/prompt-knowledge/` inside the identified project instead. Both use an `index.md` with `Format: 1` and topic files in `domains/`. Codex and Claude Code on the same computer can use the same files. **Skill installation scope and knowledge scope are independent:** a project-installed skill can use personal knowledge, and a globally installed skill can use project knowledge.

Supported installs, named updates, reinstalls, and removal of the skill leave these separate knowledge folders untouched. Keep personal additions here instead of editing installed skill files. This is persistent reference material, not model training or a change to every conversation. It requires local file access; without that access, the agent can draft an entry but must say it was not saved.

To correct an entry, say "Learn: correct my furniture reference..." To remove one, name the topic and personal or project scope. Back up or deliberately share the knowledge folder as ordinary files; it is not automatically synchronized or sent to this repository. A project folder may be included in a later Git commit unless excluded, so choose your project's sharing policy. Saving knowledge does not commit or publish it. See the [local knowledge contract](metamodern-shape-prompt/references/local-knowledge.md) for discovery and conflict handling.

## Install only what you need

Requires Node.js 22+ with npm and either Codex or Claude Code. The examples pin the tested [Skills CLI](https://github.com/vercel-labs/skills) version. They install for both agents; omit either `--agent` option if you use only one.

Install Prompt and Writing globally:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills \
  --skill metamodern-shape-prompt \
  --skill metamodern-refine-writing \
  --global --agent codex --agent claude-code --yes
```

Browse the collection without installing:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills --list
```

Install everything:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills \
  --skill '*' --global --agent codex --agent claude-code --yes
```

For **Codex only in one project**, open that project's directory and run:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills \
  --skill metamodern-shape-prompt \
  --skill metamodern-refine-writing \
  --agent codex --yes
```

This installs the two skills at project level, without a global or Claude Code installation. To use Learn only within that project as well, explicitly ask it to save knowledge "for this project only."

For **one project**, run the same install command in that project's directory and omit `--global`. This creates project skill files and a lockfile there. Reopen your agent session if its skill list does not refresh.

In Codex, invoke `$metamodern-shape-prompt`. In Claude Code, use `/metamodern-shape-prompt`. You can also ask for the method by name. Skills guide the model; they do not install integrations or grant permission to take external actions.

## Build an Interface Studio

[Interface Studio](./metamodern-interface-studio/SKILL.md) helps an agent build and maintain a review environment around your existing application and UI kit. It reuses product components and behavior where practical, adds reproducible scenarios, and keeps presenter material separate from generated source mappings. It includes a manifest validator and a product-neutral Studio shell starter: a grey review stage with an icon rail, contextual panels, and Inspect, Compare, Responsive (one screen at several sizes, as a row or on a canvas, with scroll and click sync), Gallery, Present, and Design views (a parametric draft editor over density, radius, type and color, plus the token table), built on shadcn (Base UI, Rhea style), with a Size menu of device profiles and a draggable Inspect frame. A synthetic example product runs inside it until you connect your own through a small adapter and an isolated preview frame. A Studio made from the starter stays current: `scripts/update-studio.mjs` brings it to the newest shell, replacing shell files and never touching the product's adapter or settings.

Install just this skill for Codex and Claude Code:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills \
  --skill metamodern-interface-studio \
  --global --agent codex --agent claude-code --yes
```

Omit `--global` to install only in the current project. Invoke `$metamodern-interface-studio` in Codex or `/metamodern-interface-studio` in Claude Code. Start from the application repository so the agent can inspect its components, routes, tokens, assets, and tests. Build composes the [common shell starter](./metamodern-interface-studio/assets/studio-shell/README.md) with a Vite or Next host overlay in the location you choose, connects your product, and removes the example. Every Studio shares the same React/style/protocol source; each product supplies only its adapter and preview entry.

Start with a read-only inspection:

```text
Use $metamodern-interface-studio in Inspect mode for this application.
Inventory the UI kit, surfaces, states, routes, and tests. Recommend a
preview strategy and a concrete first Studio scope. Do not modify the app.
```

Then request the work you want:

| Operation | Example request |
| --- | --- |
| Build | Build a local Studio for our task-management flow from the shell starter, using the existing components and synthetic fixtures. Include Inspect, Gallery, and an initial walkthrough. |
| Update | Update the Studio against the current source. Preserve my narration and walkthrough edits; report ambiguous renames, removed references, and stale captures. |
| Verify | Verify reset, isolated previews, navigation, the key task interaction, responsive behavior, and the walkthrough. Report the source revision, scenarios, environments, and unavailable checks. |
| Prepare | Prepare a five-minute walkthrough for product reviewers using the existing task flow. Explain current behavior and flag unresolved steps. |
| Publish | Publish this Studio to the destination I specify, for the named audience, and verify the hosted result. |

Supply the application and UI-kit locations, target platforms, relevant flows, intended audience, and any existing Studio or presenter files. Build can proceed with one appropriate target adapter. Native previews require an available instrumented build, simulator/device, stream, or supplied capture evidence; a web recreation never proves native behavior. Publication additionally needs an explicit destination and audience-appropriate fixtures/assets.

The Studio's interface views are Inspect, Compare, Gallery, and Present, plus Tokens when your product has a token source. These are separate from the six skill operations. The first Build includes Gallery and an initial walkthrough; comparisons name the changing axis, such as theme or revision.

Update preserves stable identities and presenter work and reports unresolved changes. Verification distinguishes source inspection, local runtime, native runtime, hosted publication, and user acceptance. Installing this skill does not deploy an application, connect accounts, or establish any of those outcomes. See the [manifest and update contract](./metamodern-interface-studio/references/manifest.md), [verification guide](./metamodern-interface-studio/references/verification.md), and [shell guide](./metamodern-interface-studio/references/shell.md) for the detailed boundaries.

## Choose a skill

| Skill | What it helps you do |
| --- | --- |
| [Interface Studio](./metamodern-interface-studio/SKILL.md) · `$metamodern-interface-studio` | Inspect, build, update, verify, prepare, and publish review Studios around existing interfaces. |
| [Prompt](./metamodern-shape-prompt/SKILL.md) · `$metamodern-shape-prompt` | Shape prompts and save reusable local domain knowledge. |
| [Writing](./metamodern-refine-writing/SKILL.md) · `$metamodern-refine-writing` | Improve existing prose while preserving meaning and voice. |
| [Project preparation](./metamodern-prepare-project/SKILL.md) · `$metamodern-prepare-project` | Start or adopt a project with usable context, references, and instructions. |
| [Meeting naming](./metamodern-name-meeting/SKILL.md) · `$metamodern-name-meeting` | Name meetings with candid premises and funny video style parentheticals. |
| [Meeting processing](./metamodern-process-meeting/SKILL.md) · `$metamodern-process-meeting` | Reconcile meeting evidence with current project facts and requested actions. |
| [Proposal preparation](./metamodern-prepare-proposal/SKILL.md) · `$metamodern-prepare-proposal` | Scope work and prepare proposals from your approved terms and evidence. |
| [Brand development](./metamodern-develop-brand/SKILL.md) · `$metamodern-develop-brand` | Document, audit, develop, or refresh a brand system. |
| [Brand expression](./metamodern-explore-brand-expression/SKILL.md) · `$metamodern-explore-brand-expression` | Explore and refine visual directions from an accepted identity. |
| [Brand world](./metamodern-build-brand-world/SKILL.md) · `$metamodern-build-brand-world` | Develop a visual world through explicit creative direction and approval gates. |
| [Midjourney](./metamodern-midjourney/SKILL.md) · `$metamodern-midjourney` | Build look kits, complete recipes, calibration runs, and screened sets. |
| [Figma](./metamodern-work-in-figma/SKILL.md) · `$metamodern-work-in-figma` | Inspect, construct, revise, verify, and hand off editable design work. |
| [App bootstrap](./metamodern-bootstrap-app/SKILL.md) · `$metamodern-bootstrap-app` | Prepare a MakerKit application and verify its local setup. |
| [Engineering initiation](./metamodern-initiate-engineering/SKILL.md) · `$metamodern-initiate-engineering` | Establish proportional engineering preparation and a first-task handoff. |
| [Engineering configuration](./metamodern-configure-engineering/SKILL.md) · `$metamodern-configure-engineering` | Adopt portable testing policy and native Codex/Claude Code routing with explicit evidence states. |
| [Form delivery](./metamodern-setup-form-delivery/SKILL.md) · `$metamodern-setup-form-delivery` | Build durable database-first forms with Sheets and Slack delivery. |

### What you need beyond installation

**Prompt and Writing** work with your supplied text. Project preparation and Engineering initiation inspect the actual project and available tools.

**Brand and design** workflows need your brand evidence and a designated approver. Brand World uses Higgsfield MCP for generation. Brand Expression documents its provider routes and fallback. Figma work needs a Figma connection and the applicable official Figma instructions. Midjourney recipes are intended for your own account; the skill checks your plan and privacy constraints and does not operate your session without your request.

**Commercial and meeting** workflows need your own authoritative policy, approved terms, templates, source records, and any connectors needed for live work. Agency OS filenames in the methods are conditional integration conventions. Private Metamodern policies, pricing, client evidence, and account access are not bundled. Missing authority stays an explicit gap.

**App bootstrap** requires your licensed MakerKit source. **Form delivery** requires the relevant project, database, hosting, Google Sheets, and Slack access. Installing a skill does not supply those accounts, licenses, vendor plugins, or credentials. Related skills are recommended when a workflow hands off to them; the installer does not resolve these dependencies automatically.

## Update and remove

A GitHub-source install records its origin and content hash, allowing named updates:

```bash
npx --yes skills@1.7.0 update metamodern-shape-prompt --global --yes
```

Repeat that command for each skill you want to update. To refresh a selected set, rerun its original `add` command. To refresh all Metamodern skills, rerun the full-collection install above. These commands can replace installed skill files. Use Learn for domain additions: its external personal and project knowledge folders are preserved. Keep other method customizations in project instructions or a fork.

Inspect installed skills:

```bash
npx --yes skills@1.7.0 list --global --json
```

Remove a skill from all agents:

```bash
npx --yes skills@1.7.0 remove metamodern-shape-prompt --global --yes
```

Use `--project` instead of `--global` for project installs. Use the explicit named update commands above; `skills check` is not a read-only status command in the tested CLI.

### Updating from the earlier intent skills

Prompt replaces `metamodern-articulate-intent` and `metamodern-expand-intent`. Install and verify `metamodern-shape-prompt` first, then remove the retired names if present. No old aliases are included in this collection. The local maintainer installer also recognizes earlier owned aliases and retires them only after the replacement validates.

## How the repository is organized

```text
metamodern-skills/
├── catalog.json                    # Package names, versions, categories
├── metamodern-shape-prompt/
│   ├── SKILL.md                    # Trigger and core method
│   ├── PACKAGE_ID                  # Stable ownership identity
│   ├── PACKAGE_VERSION             # Package semantic version
│   ├── agents/openai.yaml          # Codex display and invocation metadata
│   └── references/                 # Mode details, examples, model guidance
├── metamodern-refine-writing/      # Same package contract
├── …                               # Independent packages listed in catalog.json
├── scripts/                        # Collection and package validators
├── tests/                          # Package contracts and failure cases
└── install.sh                      # Validated local maintainer installation
```

This public repository is the canonical source. The private Agency repository mounts it at `skills/` as a Git submodule and pins an exact commit. Other users install directly from this public repository; they never need the Agency repository.

`PACKAGE_ID` retains the `:metamodern-agency` publisher marker for compatibility with existing installations. It is an ownership identifier, not a dependency on a private repository. Package versions describe changes to individual methods; release tags version the collection.

## Maintain and contribute

```bash
git clone https://github.com/davidvictor/metamodern-skills.git
cd metamodern-skills
npm test
npm run validate
```

There are no npm dependencies to install for validation. Edit the relevant package, keep its root instructions concise, and put supporting detail in `references/`. Update `PACKAGE_VERSION` and its entry in `catalog.json` together. Include an example of the behavior before and after a method change, and test the original case plus a different case. Open a pull request with the resulting behavior and verification.

For a local checkout installation:

```bash
bash install.sh --skill metamodern-shape-prompt
```

The local installer validates package ownership and content, copies into the shared agent installation, and verifies the Claude link. It uses a separately pinned installer version for that tested layout. Local-path installs are refreshed with `git pull --ff-only` and another installation; they are not eligible for remote `skills update`. Use the GitHub commands above for normal installation.

Agency maintainers publish the public skill commit first, then advance the private Agency `skills/` submodule pointer and run the Agency checks. This keeps public methods separate from private project facts while preserving reproducible versions.

## Scope and license

Skills are instructions interpreted by an agent. Tests validate packaging and specific behaviors; they do not guarantee every model response or certify every connected service. Tool availability and model behavior can vary by host. The methods ask the agent to verify current provider capabilities when they matter.

Original instructions and scripts in this repository are available under the [MIT license](LICENSE). Referenced standards, vendor documentation, paid source material, fonts, templates, and third-party assets retain their own rights and are not included. The brand-development package records its [source provenance and distribution boundary](metamodern-develop-brand/references/source-provenance.md).
