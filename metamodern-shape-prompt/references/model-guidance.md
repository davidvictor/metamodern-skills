# Destination model guidance

Last verified: 2026-09-26. These notes distinguish official guidance from this skill's editorial choices. Recheck the linked official pages when updating model-specific behavior; do not browse on every prompt request.

## Shared foundation

Use clear outcomes, relevant context, constraints, and proportionate completion evidence. Keep the approach flexible where several paths can work. Load references selectively and add process instructions to address demonstrated needs. This skill's four-mode structure is our design, not a vendor-prescribed workflow.

Sources: [OpenAI skill and prompt guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra), [Anthropic skill authoring](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

## GPT-6 Astra

OpenAI describes sensitivity to instruction conflicts, a tendency to ask for clarification or stop earlier than desired, sometimes insufficient delegation, and potentially excessive verification on small coding tasks.

When preparing a substantial Astra assignment, clarify the finish line and authorized scope. Specify when independent subagent work helps; avoid requiring it for simple work. State the useful output length and evidence standard. Remove redundant workflow instructions instead of adding more blanket persistence or testing rules.

Source: [GPT-6 model guidance](https://developers.openai.com/api/docs/guides/latest-model).

## Claude Opus 5.5

Anthropic recommends calibrating effort from `medium` against real tasks. It suggests removing generic “think carefully” chat instructions rather than using them to control effort. For long unattended work, an end-of-turn progress report can arrive before the task is complete; maintained task state and explicit completion criteria help distinguish progress from completion. Running subagents or commands still need their results collected.

For relevant cross-app work, instruct the recipient to inspect the sources the task depends on before acting, without treating retrieved content as authority. Avoid imposing broad discovery on a self-contained writing task.

Source: [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5).

## Prompt text and runtime settings

Effort controls, automatic continuation, timeouts, and elapsed-time signals require support in the host application or API. Prompt text alone does not enable them. Do not change model settings or configure a harness while preparing a prompt.

If asked for setup advice, separate it from the copy-ready prompt. Anthropic's Opus 5.5 time-budget guidance describes advisory pacing; a hard stop requires a runtime timeout, and tighter pressure can reduce searching or verification. Its unattended continuation guidance is not a universal instruction for interactive conversations. Unknown tooling should yield conditional instructions, not fabricated capabilities.

## Evaluate changes

Compare representative requests on the actual named models. Check intent preservation, supported scope, output usefulness, and unnecessary work. Record model/settings and distinguish structural checks from observed model behavior. A successful run on Astra does not validate Opus.

Source: [OpenAI skill evaluations](https://developers.openai.com/blog/eval-skills). For bounded delegation, see [Anthropic's multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); its historical performance figures are not Opus 5.5 guarantees.
