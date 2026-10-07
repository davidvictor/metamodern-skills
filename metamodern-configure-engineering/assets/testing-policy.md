# Engineering testing policy

This policy guides proportional verification. Current user intent, project requirements, and real access, privacy, data, money, and destructive-action obligations retain authority. Project decisions and required commands belong in the project's own instructions and README.

## Choose proof from risk

Test observable behavior, durable state, domain decisions, contracts, and concrete regression risk. Choose checks from failure consequence, uncertainty, reversibility, and the affected consumers. Use the lowest trustworthy proof layer: pure/domain logic before service integration, service integration before browser or device automation when that layer can establish the claim. Browser and native evidence remains necessary for interactions lower layers cannot prove.

Do not add tests merely to mirror code, freeze incidental component structure, or satisfy a coverage quota. Small reversible documentation, styling, or configuration changes can use static validation and focused manual evidence when that proves the intended outcome. Run all applicable required project checks, and state their scope and any unavailable evidence.

Inspect extension points and consumers before changing shared code. Reuse and extend existing suites rather than duplicating them. Do not rerun upstream vendor suites for untouched upstream behavior unless integration evidence gives a reason. Select test frameworks and database verification tools from the actual stack and risks; no universal dependency is required by this policy.

## Test first where failure matters

Use targeted test-first work for an escaped defect, access boundary, durable state transition, money movement, destructive action, idempotency/retry behavior, or stable shared contract. First reproduce the meaningful failure at the lowest useful layer; confirm the test fails for the expected reason, implement the correction, then prove the changed behavior and relevant consumers.

Cover success, meaningful failure, and recovery. For access changes, include allowed and denied operations. For state or retry changes, check persisted outcomes, duplicate handling, partial failure, and recovery where relevant. Assertions should prove an outcome or invariant rather than a private function's current structure.

Exploration may use manual, static, or disposable runtime proof before a stable test is useful. Record why that proof is sufficient for the current slice and any promotion follow-up: what should become durable coverage when the behavior stabilizes, who owns it, and the trigger. Do not turn uncertainty into a blanket exemption from meaningful verification.

## Match the maturity of the work

Discovery uses small experiments and explicit uncertainty. Stabilization promotes recurring or consequential behavior into durable tests and checks integration. Hardening exercises adverse conditions, recovery, and concrete operational risks. These are useful approaches, not compulsory gates for every task.

Provisional product and technical choices may change with intent. Remove obsolete assertions that enforce replaced behavior, and replace them with checks for the accepted outcome. Preserve obligations that still apply: access, privacy, data integrity, money, recovery, and authorized destruction. Do not impose future/customer compatibility constraints without evidence of consumers or an explicit obligation.

## Browser and visual evidence

Use deterministic task-owned fixtures and expected-state awaits. Wait for the UI outcome that makes the next action valid; fixed sleeps and network-idle guesses rarely prove readiness. With Playwright, for example:

```javascript
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByRole('status')).toHaveText('Saved');
await expect(page.getByLabel('Project name')).toHaveValue('Example');
await page.reload();
await expect(page.getByLabel('Project name')).toHaveValue('Example');
```

For a search interaction, await the expected result and its accessible state before selecting it:

```javascript
await page.getByRole('searchbox').fill('Example');
await expect(page.getByRole('option', { name: 'Example project' })).toBeVisible();
await page.getByRole('option', { name: 'Example project' }).click();
await expect(page.getByRole('heading', { name: 'Example project' })).toBeVisible();
```

Adapt roles, selectors, and persistence checks to the real application; examples are not required test fixtures. Verify keyboard, focus return, responsive behavior, and touch interaction where the changed behavior needs them. Capture screenshot matrices on demand for a named visual question, state, or breakpoint. A screenshot proves visible appearance; it does not prove interaction, access, durable state, or all device behavior.

## Keep the loop focused

One implementation owner carries a coherent outcome through focused checks, required integrated checks, independent integrated review for substantive changes, grouped correction, and targeted re-review. Delegate independent evidence or specialist work with separate files/resources and a stable boundary; adding roles is optional, not a task graph requirement.

During implementation, run the narrow relevant checks. At the delivery boundary, run required integrated checks for the affected scope. Rerun when relevant code or configuration changes, a new failure appears, or unresolved concerns justify it. After a clean result, proceed toward the authorized endpoint instead of repeating unchanged suites.

Set runtime budgets from the project's actual commands, fixtures, services, and reliability evidence. Record slow/flaky checks and their owner. This policy sets no universal CI timeout, browser count, coverage percentage, or task-specific budget.

After two unsuccessful corrections of the same cause without new evidence, change the diagnosis: inspect the actual failing boundary, reproduce it narrowly, classify product defect versus obsolete assertion versus environment or baseline failure, and identify the next discriminating check. Do not accumulate speculative guards or retries. Preserve useful failure evidence and hand off a bounded dependency when progress truly requires another owner.

## Report evidence accurately

Record the source revision, meaningful commands/results, fixture and resource ownership, limitations, and remaining action. Keep implementation, validation, independent review, repository delivery, deployment, hosted behavior, and user acceptance distinct. Passing source checks does not prove an interactive outcome; a green provider/configuration check does not prove application readiness.

Use task-owned resources. A worktree does not isolate services or data. Inspect command effects before execution, keep fixers within owned paths, and never reset or stop another project's stack. Release actions follow the current request and recorded project authority.
