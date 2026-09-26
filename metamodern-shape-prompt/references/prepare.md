# Prepare

Turn a selected intention into a prompt its recipient can act on. Preserve the user's aim and supply only the structure needed for the task and destination.

## Establish the brief

Resolve the desired outcome, relevant context, intended recipient, available inputs, constraints, and expected output from the request. Include completion evidence when the task benefits from it. The path can remain open where the recipient should exercise judgment.

For a small task, a paragraph may suffice. For a substantial task, organize the supported information into readable sections. Do not print empty fields or force every brief through a fixed template.

Use explicit success criteria the user supplied. Where none exist, propose proportionate criteria and mark consequential additions as suggested, including inside the copy-ready prompt. Do not invent numeric targets, deadlines, budgets, credentials, deployment destinations, or approvals. Ask only when the missing choice prevents a useful brief.

## Scale working instructions to the assignment

For sustained work, include these only when useful:

- **Continuity:** keep a compact task record containing owner, status, dependencies or blocker, completion evidence, and next action. Use the destination's existing task tool or project convention; do not assume persistent memory or mandate new files for every request.
- **Delegation:** use subagents for bounded independent work when available and worthwhile. Give each an objective, relevant context, source/tool boundaries, and expected return. The lead integrates results, resolves conflicts, and checks completion. Work directly when dependencies or shared state make delegation unhelpful.
- **Completion:** define what supports a done claim, how to report missing evidence, and when to stop for a genuine blocker. Progress narration, a generated artifact, a checked box, or a finished subagent alone is not proof that the whole task succeeded.
- **Autonomy:** carry forward the actual authorization boundary. Encourage completing authorized work and reasonable routine decisions; do not grant publication, sending, deletion, deployment, or other consequential authority the user did not provide.
- **Verification:** use checks appropriate to the outcome. Broaden or repeat them when changes, failures, or unresolved concerns warrant it. Do not demand a reviewer agent or exhaustive testing for every task.

These describe the downstream recipient's work, not actions for the prompt-writing skill to perform. State tool-dependent instructions conditionally when the destination's capabilities are unknown.

## Adapt and return

Use [model guidance](model-guidance.md) when a named destination warrants it. Otherwise keep the brief portable. An authoring model is not evidence of the recipient's model or tools.

Return one standalone prompt. Include setup notes separately only when requested or necessary to explain a capability the prompt itself cannot configure. Keep supplied facts, proposed additions, remaining decisions, and the definition of completion distinguishable.
