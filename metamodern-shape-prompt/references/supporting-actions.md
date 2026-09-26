# Supporting actions

These can modify a selected mode or be requested alone. They do not add mandatory phases.

## Review

Return a concise critique of the supplied prompt: identify the passage, its likely effect, and a concrete correction. Check consequential ambiguity, contradictory instructions, missing context, unsupported assumptions, completion criteria, and unnecessary process. Distinguish a defect from a stylistic preference. Review-only means do not rewrite the prompt. If no meaningful issue is found, say so.

## Focus

Narrow around the user's chosen outcome or decision. Retain the constraints that still apply and briefly identify substantive material deferred or removed. If the priority cannot be inferred without changing the aim, ask which outcome should lead. Do not silently narrow a Combine-all request.

## Split

Produce connected, standalone assignments with distinct ownership or outputs, dependencies, shared constraints, and required handoff information. Keep the overall outcome visible and identify who integrates the parts where relevant. Do not invent agent tools or assume independent execution when tasks share state.

## Shorten

Reduce wording and repetition while preserving facts, requirements, uncertainty, examples that carry meaning, and authorization boundaries. A strict length cap may conflict with full preservation: expose that tradeoff rather than silently dropping substantive content. Respect exact protected spans.

For composed requests, apply the requested operations and return the requested final artifact. Show intermediate critiques or drafts only when asked or when an unresolved decision prevents the next operation.
