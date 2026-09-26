# Project Artifact Contracts

## PROJECT.md

`PROJECT.md` is the durable project brief. Include only supported and relevant sections:

```markdown
# Project

Last context review: YYYY-MM-DD

## Identity
[Project, client, and exact authoritative record identifiers.]

## Outcome
[Meaningful project result.]

## Scope and Work Types
[Authorized boundary and applicable work types.]

## Deliverables and Acceptance
[Promised deliverables and observable acceptance criteria.]

## Current Focus
[Lifecycle period, current work, and dated source.]

## Decisions and Constraints
[Durable decisions and operating constraints with source pointers.]

## Open Decisions
[Questions that materially affect the work.]

## Capability Artifacts
[Links to PRODUCT.md, BRAND.md, DESIGN.md, and applicable briefs.]

## References
See `REFERENCES.md`.
```

The project's designated record system remains authoritative for client, engagement, project, task, time, proposal, invoice, and revenue facts. Identify source and retrieval date when summarizing live state. An Agency checkout may designate Bonsai for these facts.

## REFERENCES.md

`REFERENCES.md` is one human-readable Project Reference Register. Group entries under headings that fit the project, such as Editable Sources, Content and Planning, Project Records, Published State, Assets, and Research and Inspiration.

```markdown
# Project References

Last reviewed: YYYY-MM-DD

| Name | System | Role | Scope | Authority | Link | Use when | Last verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

Use durable URLs or exact identifiers. Keep signed URLs, credentials, temporary tokens, incidental package documentation, and unrelated hyperlinks out.

Roles include editable source, content source, planning source, project record, published state, asset source, research, inspiration, and historical evidence. Authority states the exact facts or decisions controlled by the entry.

## AGENTS.md

`AGENTS.md` is the concise project operating contract. Include:

- Read `PROJECT.md` and `REFERENCES.md` before substantive work.
- Exact project authority boundaries.
- Shared and project capability routing.
- A `REFERENCES.md` entry for every routed shared capability, including canonical name and source.
- Platform and integration guidance.
- External mutation, publication, and destructive-action boundaries.
- Normal `REFERENCES.md` maintenance.
- Reporting each durable reference addition and asking before changing authority or replacing a current target.
- Project-specific verification commands.
- For engineering work, the reading order into the current task and uniquely named local development skill when warranted; actual environment prerequisites, shared-code boundaries, and authorized delivery endpoint.

Engineering initiation supplies the engineering content; Project Preparation coordinates its narrow merge. Preserve useful upstream and nested instructions. Do not copy the shared engineering method into every `AGENTS.md`.

Link to project context and sources rather than duplicating them.

## Conditional artifacts

- `PRODUCT.md`: Impeccable-owned durable product truth.
- `BRAND.md`: Brand Development-owned accepted Brand System handoff.
- `DESIGN.md`: Impeccable or design-capability-owned implemented visual system.
- Surface or deliverable brief: local strategy owned by the applicable capability.

Create each only when current work and evidence justify it.

The complete `.impeccable/` tree is local runtime and working state, not a canonical artifact. Keep it out of Git and promote durable truth into `PRODUCT.md`, `BRAND.md`, `DESIGN.md`, project context, or Figma.

## Monorepos and umbrella roots

One Project has one `PROJECT.md` and one Project Reference Register at the project root, even when it contains several applications. Use the register's Scope field for app-specific sources. Add a child `AGENTS.md` when an application needs local platform or verification guidance. Place `PRODUCT.md` and `DESIGN.md` at the application that owns their truth; keep `BRAND.md` at the common root when identity is shared.

Create a child `PROJECT.md` and `REFERENCES.md` only when that child is a separate Project with its own bounded outcome, records, and project context.

## Engineering artifacts when needed

Keep requirements in their declared product source, technical decisions and code in Git, engineering tasks and check evidence in the selected delivery system, and business/project records in the designated record system. Link records by fact type rather than maintaining competing status lists. `PROJECT.md` carries durable scope and source pointers, not a second live engineering queue.

Use an existing README or engineering guide for actual local setup and commands. A first issue or work packet records the outcome, acceptance, scope/owner, dependencies, verification, and delivery endpoint. Add a separate guide only when it has an independent use. Record an ADR only for a consequential choice with alternatives and reconsideration conditions. Add a project-local development skill only for substantial project-specific behavior; otherwise concise `AGENTS.md` guidance is sufficient. Mobile starter discovery can be the first task without pretending implementation is ready.
