# Metamodern Skills

Reusable working methods for **Codex and Claude Code**, from shaping a prompt to developing a brand, preparing a project, and delivering software.

[![Validate skills](https://github.com/davidvictor/metamodern-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/davidvictor/metamodern-skills/actions/workflows/validate.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

These are the methods behind Metamodern's creative and technical work. Each skill gives an agent a focused workflow: what evidence to read, which decisions belong to the user, what to produce, and how to check the result. Install the ones you need. Your projects, private documents, accounts, and approvals stay yours.

## Start with a better prompt

```text
Use Metamodern Prompt to expand this idea in three directions.
Then combine the strongest parts and prepare a prompt for implementation.
Preserve my constraints and flag any conflicting choices.
```

**Metamodern Prompt** has four main modes:

| Mode | Use it to |
| --- | --- |
| Clarify | Make your intention precise without adding scope. |
| Expand | Explore distinct, useful directions. |
| Combine | Bring selected directions together without losing their contributions. |
| Prepare | Turn the result into an actionable brief with an outcome, boundaries, and evidence of completion. |

You can also **review, focus, split, or shorten** a prompt. Modes can compose. Preparing a prompt does not execute the task inside it.

Prompt includes focused domain references for UI design, front-end development, back-end/API design, domain and data modeling, automotive design, automotive engineering, copywriting, and marketing, alongside the existing apparel, furniture, business, and research references. It consults only the guides relevant to your idea; naming a domain does not start the underlying design, coding, or campaign work. See the [domain guide index](metamodern-shape-prompt/references/foundation.md#select-only-relevant-references).

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

For **one project**, run the same install command in that project's directory and omit `--global`. This creates project skill files and a lockfile there. Reopen your agent session if its skill list does not refresh.

In Codex, invoke `$metamodern-shape-prompt`. In Claude Code, use `/metamodern-shape-prompt`. You can also ask for the method by name. Skills guide the model; they do not install integrations or grant permission to take external actions.

## Choose a skill

| Skill | What it helps you do |
| --- | --- |
| [Prompt](./metamodern-shape-prompt/SKILL.md) · `$metamodern-shape-prompt` | Clarify, expand, combine, prepare, and review prompts. |
| [Writing](./metamodern-refine-writing/SKILL.md) · `$metamodern-refine-writing` | Improve existing prose while preserving meaning and voice. |
| [Project preparation](./metamodern-prepare-project/SKILL.md) · `$metamodern-prepare-project` | Start or adopt a project with usable context, references, and instructions. |
| [Meeting processing](./metamodern-process-meeting/SKILL.md) · `$metamodern-process-meeting` | Reconcile meeting evidence with current project facts and requested actions. |
| [Proposal preparation](./metamodern-prepare-proposal/SKILL.md) · `$metamodern-prepare-proposal` | Scope work and prepare proposals from your approved terms and evidence. |
| [Brand development](./metamodern-develop-brand/SKILL.md) · `$metamodern-develop-brand` | Document, audit, develop, or refresh a brand system. |
| [Brand expression](./metamodern-explore-brand-expression/SKILL.md) · `$metamodern-explore-brand-expression` | Explore and refine visual directions from an accepted identity. |
| [Brand world](./metamodern-build-brand-world/SKILL.md) · `$metamodern-build-brand-world` | Develop a visual world through explicit creative direction and approval gates. |
| [Midjourney](./metamodern-midjourney/SKILL.md) · `$metamodern-midjourney` | Build look kits, complete recipes, calibration runs, and screened sets. |
| [Figma](./metamodern-work-in-figma/SKILL.md) · `$metamodern-work-in-figma` | Inspect, construct, revise, verify, and hand off editable design work. |
| [App bootstrap](./metamodern-bootstrap-app/SKILL.md) · `$metamodern-bootstrap-app` | Prepare a MakerKit application and verify its local setup. |
| [Engineering initiation](./metamodern-initiate-engineering/SKILL.md) · `$metamodern-initiate-engineering` | Establish proportional engineering preparation and a first-task handoff. |
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

Repeat that command for each skill you want to update. To refresh a selected set, rerun its original `add` command. To refresh all Metamodern skills, rerun the full-collection install above. These commands can replace installed copies, so keep customizations in your project instructions or a fork.

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
├── …                               # 13 independent packages total
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
