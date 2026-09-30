---
name: metamodern-fix-development
description: Use when diagnosing failing tests, regressions, review corrections or repeated coding loops and repairing the affected behavior without replaying unrelated validation.
---

# Metamodern: Fix Development

Read the current outcome, owning project instructions and failing evidence. Verify the tested revision, environment and actual checkout. Do not accept an agent's proposed cause as the diagnosis. If the request is diagnosis-only, remain read-only; an authorized implementation or fix request permits bounded repair.

## Find the cause

Choose the smallest reproduction or observation that discriminates between plausible causes. Classify the failure using evidence:

- **Product defect:** supported behavior or an accepted obligation fails. Correct the implementation and add meaningful regression coverage at the failing boundary when warranted.
- **Obsolete assertion:** authorized intent superseded the expected structure, style or API. Update the assertion to test the current obligation, preserving behavioral protection.
- **Environment failure:** a prerequisite failed before the behavior could run. Repair the task-owned prerequisite or report the missing resource; use bounded infrastructure retries where justified.
- **Unrelated baseline failure:** unchanged relevant source reproduces the same cause. Preserve its evidence and disposition under project policy; do not repeatedly investigate it inside this repair.

Mixed reports require separate dispositions. A matching test title is insufficient to establish an unchanged cause. Missing roles or labels may be product accessibility defects, not merely broken selectors.

## Correct and recheck

Make the narrow repair that satisfies the current outcome. Remove abandoned assumptions directly when replacement is authorized. Avoid speculative retries, validators, compatibility layers or expanded hardening. Investigate tests rather than deleting, skipping or loosening a real obligation to obtain a pass.

Run the failing check and affected consumers. Repeat broader checks only when the repair can affect their covered surface, earlier evidence was invalid, or repository policy requires it. Test-only corrections still need to demonstrate the real behavior they now assert. Preserve failed attempts needed to understand unresolved defects; keep large logs outside ordinary context.

A second same-cause failure without new information changes the investigation: inspect a different boundary, capture the actual browser/runtime state, or ask a specialist a bounded question. A repair budget never permits declaring a known material defect fixed. Defer reversible polish only when it is outside required acceptance and accurately report it.

## Return to the outcome

Report the cause, correction, exact checked revision and remaining uncertainty. Update only the affected part of the existing task record. Resume the authorized execution batch rather than starting a new delivery process for each finding. Use `metamodern-execute-development` when available or the owning project's method. A repair is complete when relevant evidence demonstrates the failure is resolved; deployment and acceptance remain separate claims.
