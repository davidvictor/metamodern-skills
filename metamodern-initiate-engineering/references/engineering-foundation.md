# Engineering foundation

## Default operating model

Start with one implementation owner and one integration owner, often the same person. Add a bounded specialist only for a concrete risk. Use one integrated independent review for substantive implementation, grouped correction, and targeted re-review. Do not prescribe a model roster, mandatory task graph, hooks, sibling repository, or specialist suite.

Make reversible implementation decisions within authorized scope. the user owns product meaning, consequential ownership or compatibility choices, external obligations, spending, and destructive effects. Define the delivery endpoint: ordinary authorized development may reach its agreed checks, review, and PR path; merge, deployment, and publication follow recorded authority.

## Code and verification

Verify the actual checkout, branch/worktree, instructions, source revision, runtime, resources, and command effects when starting or resuming. A worktree does not isolate services or data. Keep repository-wide checks read-only in dirty workspaces, scope fixers to owned files, and preserve unrelated work.

Use the cheapest trustworthy check for the changed behavior. Test meaningful decisions, access, durable state, provider contracts, destructive behavior, recovery, shared consumers, and escaped-defect paths in proportion to risk. Test allowed and denied cases where an access or authority boundary changes. Use browser/device evidence where lower layers cannot prove a claim. Do not impose a coverage quota or add tests for incidental implementation.

Inspect upstream extension points and every affected shared consumer before changing shared code. Use project-local skills only for substantial project behavior, with a unique project namespace; reference shared capabilities by canonical name and do not create same-name collisions. Core checks must work without sibling repositories or optional agent hooks.

## Resource and recovery discipline

Record task-owned mutable resources and their cleanup owner. Isolate or serialize concurrent mutable work. Stop, reset, delete, provision, or contact external systems only under current authority and after target verification. After repeated failure without new evidence, diagnose or narrow the task instead of adding retries or speculative guards.
