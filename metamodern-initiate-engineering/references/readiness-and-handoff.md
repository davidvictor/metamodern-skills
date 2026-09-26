# Readiness and handoff

## Minimum work packet

Record:

1. Authorized outcome, source authority, and exact source revision.
2. Acceptance examples, supported cases, and exclusions.
3. Writable scope, implementation owner, shared/upstream boundaries, and relevant decisions.
4. Dependencies, exact blocker, dependency owner, and next recovery action.
5. Actual checkout, runtime, tools, safe resources, and executable baseline or change checks.
6. Required review, delivery endpoint, and next concrete action.

## Readiness states

| State | Required evidence |
| --- | --- |
| Context prepared | Coherent authority, sources, decisions, and task packet |
| Local development ready | Required runtime, owned resources, access, and a usable verification path for the named task, supported by relevant baseline observation |
| Repository delivery ready | Remote access, checks, and issue or PR workflow needed by the task |
| Deployment ready | Verified target, permissions, release ordering, integrations, and recovery path |
| Deployed | Provider/target receipt identifying the deployed revision; acceptance still separate |
| Live-verified | Relevant real-environment acceptance evidence for that deployed revision |

Do not call a task ready merely because its server starts or its commands have been listed. Check prerequisites of the acceptance path: for example, migration generation may need a separately owned shadow database even when app login works. Reuse dated evidence only where its source and resource state remain applicable; identify anything not freshly checked. If a critical verification prerequisite is unresolved, name it and hand off an independent slice or the bounded environment preflight first, with the dependent feature packet conditional. Do not infer a later state from an earlier one. Missing infrastructure blocks only dependent work. Local fixtures, mock providers, or a passing local suite do not prove production behavior.

Record implementation, checks, independent review, commit/PR/merge, deployment, and live verification as separate facts. A prepared packet is not implemented code; passing checks are not review or merge; a deployment receipt is not user acceptance.

## First-task outcome

The normal endpoint is an executable implementation task. When source authority, a mobile starter, a provider, or another material capability is unresolved, hand off a concrete discovery task with its question, evidence source, owner, stop condition, and next decision. That is useful preparation but not implementation readiness.
