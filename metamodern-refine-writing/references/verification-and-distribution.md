# Verification and Distribution

## Method sources

This skill uses an original Metamodern editing method. It is informed by two sources:

- Metamodern's approved language rules: stable terms, direct verbs, named actors, conditions before actions, one instruction per step, and preservation of every fact and scope boundary.
- The architecture demonstrated by Ege Chelebi's ASD-STE100 skill and experiment: a coherent method, progressive disclosure, versioned mechanical checks, examples, honest limits, and one canonical repository source.

Source study:

- https://github.com/woosal1337/blog/tree/cd5cf7eb498ba43ff2fdb40978c5005f1fa2f822/videos/ep01-the-cure-for-ai-slop
- https://github.com/woosal1337/blog/blob/cd5cf7eb498ba43ff2fdb40978c5005f1fa2f822/videos/ep01-the-cure-for-ai-slop/experiment/results-cross-model.md
- https://www.skills.sh/woosal1337/blog/asd-ste100

No upstream code, rule corpus, or specification text is included in this package. This skill is not ASD-STE100, is not a certified checker, and does not use the ASD-STE100 name as its method.

## Mechanical support

`scripts/check-preservation.mjs` is a read-only fidelity checker. It compares high-confidence anchors in a source and revision:

- frontmatter;
- fenced and inline code;
- block quotations and quoted text;
- Markdown link destinations and footnotes;
- URLs and email addresses;
- numbers, dates, units, currencies, percentages, and versions.

It reports missing and added anchor types with redacted fingerprints. It also fingerprints file names. It does not print protected values or names unless `--show-values` is explicitly supplied. That option is unsafe for sensitive drafts and logs. The checker does not rewrite text, assign an AI probability, score writing quality, or prove semantic and voice fidelity.

Resolve `SKILL_DIR` as the absolute path to the directory containing the loaded `SKILL.md`. Run that package script, never a project-relative script:

```bash
node "$SKILL_DIR/scripts/check-preservation.mjs" --source SOURCE --revised REVISED --json
```

Do not write pasted or client prose into the active project only to run the checker. Use the manual preservation ledger for chat-only text. Use a private temporary directory outside the project only when the user authorizes file materialization, then remove it after the check.

Exit codes:

- `0`: detected anchors match;
- `1`: anchors are missing or added;
- `2`: invalid arguments or a read failure.

## Hook decision

No hooks ship in version 0.1.0.

Always-on style injection would apply one voice to unrelated writing. A post-send gate can also cause a duplicate reply because it runs after the first reply is visible. Platform-specific settings changes would weaken the shared Codex and Claude package model.

A future hook requires demonstrated repeated failure, explicit authorization, opt-in installation, warning-only behavior, fail-open errors, idempotent removal, and tests for false positives and voice-bearing prose.

## Verification

For every behavioral change:

1. Save a sanitized baseline failure outside the package.
2. Add the original case and one distinct case to the behavior fixtures.
3. Make the narrowest instruction, example, or script change that fixes the failure.
4. Run the preservation checker for protected-anchor cases.
5. Run the focused tests, `npm test`, and `npm run validate`.
6. Remove duplicate, stale, or no-op guidance.
7. Bump `PACKAGE_VERSION` and the catalog version in the same commit.
8. Commit the source, reinstall the package, and verify Codex and Claude parity.

Track voice-loss and meaning-drift failures, not only removed filler.

## Installation and distribution

The public [Metamodern Skills repository](https://github.com/davidvictor/metamodern-skills) is the canonical source. Install directly from GitHub so the Skills CLI records update provenance:

```bash
npx --yes skills@1.7.0 add davidvictor/metamodern-skills --skill metamodern-refine-writing --global --agent codex --agent claude-code --yes
npx --yes skills@1.7.0 update metamodern-refine-writing --global --yes
```

The Agency checkout pins this repository as its `skills/` submodule. Edit the source, validate, publish the public commit, then update the Agency submodule pointer. Installed copies are derived; do not edit them directly. Local checkout installations use `bash install.sh --skill metamodern-refine-writing` and are refreshed by pulling and reinstalling, not by the CLI's remote update command.

Original packaged instructions and scripts are MIT licensed. Third-party specifications and linked sources retain their own licenses and are not redistributed here.
