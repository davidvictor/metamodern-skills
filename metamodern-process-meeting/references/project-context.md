# Project Context Contract

## Purpose

Project context is the current understanding the agent assembles from authoritative records and source-backed evidence. It is not a separate database, project ledger, or authorization record.

## Source map

For every source used, retain:

- Source type
- Exact authoritative record identifier and direct link when the source is an authoritative record; if the connector does not provide a direct link, state `direct link unavailable from the connector` with the exact identifier and do not invent one
- Title
- Date and duration when relevant
- Role in the context: primary plan, follow-up, current record, correction, or historical evidence
- Freshness and known limitations

## Project context fields

- Client
- Engagement
- Project and exact authoritative identifier with direct record link when resolved
- Workstreams
- Work types
- Desired outcomes
- Deliverables and acceptance criteria
- Current status
- Current next action
- Required client input
- Target dates and dependencies
- Decisions and commitments
- Risks, blockers, and open questions
- Scope or commercial changes
- Authoritative artifact links
- Evidence pointers for material claims
- Proposed record changes, separated from completed record changes

## Reconciliation order

Current user instructions control the requested action and its authorization. A current user instruction can also supply a task-scoped fact that is not represented in an authoritative system. It cannot replace a conflicting authoritative domain fact.

Use this order to assess factual claims when sources conflict:

1. Current authoritative state in the applicable live system
2. The user's current correction, recorded as a sourced claim when it conflicts with the authoritative state
3. Newer explicit decisions from direct meeting evidence
4. Current planning documents such as a client-maintained Sheet
5. Older generated notes or transcripts
6. Historical examples and memory used only as pointers

When a user correction conflicts with an authoritative domain fact, preserve both: retain the authoritative value as current record state, and retain the correction separately as a sourced claim and proposed record repair until the authoritative record is corrected. Do not silently overwrite, discard, or report the correction as the current authoritative value.

AI suggestions inside generated notes are not decisions or commitments unless direct meeting evidence supports them.

## Project matching

Apply this procedure only when the request asks to match a project or an authorized record action needs an exact project relationship. A supplied-source summary that does not need project matching does not require a candidate search.

First resolve the exact client or equivalent account, then enumerate every accessible non-archived project for that subject and complete pagination before ranking candidates. If the connector does not offer a subject filter, read the relevant project states and every relevant result page, then filter the results to the exact subject and non-archived state. Do not label a statusless or all-project result as current, and do not assume the newest or first few records are the complete candidate set. Consider archived projects only as historical candidates when the request or evidence requires history. Use the same non-archived state scope for candidate discovery and comparison.

Match a project only when the complete client-scoped candidate set and the evidence resolve one exact authoritative project identifier without a conflicting signal. Use explicit names first, then client, participants, recent activity, prior notes, and unique deliverables. If two records remain plausible, leave the source unmatched and ask one project question. Do not split one meeting across projects unless the meeting and current records clearly establish separate project boundaries.

Scope every exactness claim to the relationship the evidence proves:

- An **exact record identifier** proves only that named record.
- An **exact record-to-record link** proves only the explicit relationship between those two records.
- A **title/content association** may support a workstream or deliverable connection, but is not an exact record link unless the source identifies both records and their relationship.

Do not use an exact parent project or invoice record as proof of an exact deliverable, task, time-entry, or invoice-line association. If a requested write depends on an unresolved relationship, ask the single focused matching question before writing.

## Status rules

Use the project's documented status terms. If none are available, retain the source system's native terms and report that a project status vocabulary is unavailable. Keep these values separately labeled whenever they differ:

1. The authoritative system's native status, preserved verbatim with its source.
2. Independently verified lifecycle facts, such as sent and paid.
3. A current user correction or evidence-backed project status, with its source and scope.

Do not infer Sent, Accepted, Delivered, Published, Complete, Invoiced, or Paid from a planning file. An opaque native value, including an invoice status that does not encode sending or payment semantics, is evidence of that native value only; it does not prove sent or paid. Preserve any native invoice value separately. Treat the sent-state and payment-state axes independently: label the invoice `Draft` until dedicated sent-state evidence confirms otherwise, and label payment `Unverified` or `not verified paid` until dedicated payment evidence confirms otherwise. Sending evidence changes only the sent-state axis; payment evidence changes only the payment-state axis. Use `unpaid` only when the applicable financial system or a scoped current correction establishes that fact. Never couple the two axes. Do not replace a native project or task status with a project term such as Active unless an explicit, supported mapping establishes that meaning.

## Record boundary

Read-only preparation produces project context and proposed changes. Preserve every authoritative record used in the result with its exact identifier and direct record link. If the connector exposes no direct link for a task, time entry, or other record, state `direct link unavailable from the connector` with the exact identifier; do not invent a link. External writes require the user's instruction. Before a write, search for duplicates and re-read the target. After a write, read the result back and return the direct record link when available.

A closeout classification does not authorize changing a project fact. Record a project fact only through the requested and authorized project-record action.

## Improvement classification

After real use, classify each correction as one of:

- Project fact: update the authoritative project record or current project context.
- Policy correction: update the applicable approved policy only with designated-approver authority.
- Method lesson: update the skill only when the lesson is reusable and source-backed.
- Tool limitation: record the current capability boundary and preserve a manual fallback.

Test a method correction on the original case and one distinct case before committing it.
