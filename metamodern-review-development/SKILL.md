---
name: metamodern-review-development
description: Use when independently reviewing an integrated software change against its intended outcome, accepted replacement boundaries and concrete risks.
---

# Metamodern: Review Development

Review read-only. Obtain the requested outcome, approved replacement boundaries, complete base-to-head diff, relevant consumers and exact-revision evidence. Do not silently review only the last commit of a multi-step batch. Resolve missing facts narrowly; a review request does not authorize implementation, merge or release.

## Assess the outcome

Check observable acceptance behavior and consequences: access and privacy, data integrity, financial effects, recovery, supported interactions and relevant integration boundaries. For UI changes, inspect supplied rendered evidence and obtain focused browser evidence when it is necessary and available. Passing compilation does not prove focus, selection or form submission; a screenshot does not prove an interaction.

Recognize authorized replacements. Historical component anatomy, visual recipes and provisional choices are not permanent obligations. Evaluate whether updated tests still protect actual behavior. Do not require compatibility or polish the user explicitly placed outside this batch.

Inspect evidence before rerunning commands. Repeat a check only for a gap, changed inputs, contradictory observations or a concrete unresolved question. Missing meaningful acceptance evidence is a gap to report, not automatic proof of a defect.

## Report concrete findings

A blocking finding identifies the violated obligation, reachable failure, affected location, consequence and bounded correction. Separate concrete defects, acceptance gaps and optional improvements. Naming, speculative extensibility and reversible presentation preferences are advisory unless an accepted requirement makes them material. No findings is a valid result.

When assigned as the independent reviewer, perform the review directly. When invoked by the implementation owner, use one independent reviewer if authorized and required or warranted; do not describe self-review as independent. Add another specialist only for a concrete distinct risk, contradictory evidence or explicit user request, following project rules. Do not create a default reviewer/hunter/refuter/verifier roster.

Deliver one consolidated report for the integrated batch. The owner groups corrections; the same reviewer checks the corrections and affected surface. New evidence may reveal a further material defect, but internal milestones do not each require another full review. Do not waive a known defect to meet a review budget.

State the reviewed revision, evidence coverage, findings and unresolved limitations. Acceptance, merge and release authority remain with the current request and project policy. Route authorized repairs to `metamodern-fix-development` when available or the project's repair method; review itself ends with its assessment.
