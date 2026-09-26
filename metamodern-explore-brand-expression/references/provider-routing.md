# Image-generation provider routing

## Default and overrides

Use the Higgsfield MCP tool family by default for image generation and editing. Do not replace it with the Higgsfield CLI, an ad hoc API client, or the built-in image generator while the MCP tools can perform the task.

References to `ImageGen` elsewhere in this package mean image-generation activity, not the built-in provider. This file controls provider selection.

An explicitly requested provider or model overrides the default. Preserve that choice unless it is unavailable or cannot satisfy the required input/output contract; explain the concrete limitation before using another provider. Do not silently replace one model with a cheaper or newer model.

## Higgsfield image flow

For a visual-direction exploration, use the Higgsfield `models_explore` tool with action `recommend` before the first generation when model choice could materially change the visual character or use of references. Give it the concrete brief and input context. Fetch the selected model's constraints with action `get`, follow the supported media roles, and record the model and the reason for choosing it with every generation. Different territories may use different models only when their briefs genuinely require different generation behavior; do not vary models merely to manufacture difference.

Read the [model prompting guide](model-prompting-guide.md) before writing prompts: it maps the current catalog (Nano Banana Pro/2, Seedream 4.5/5.0, GPT Image 2, FLUX.2, Soul, Recraft, Hazel) and how each family expects to be prompted. Specialist models remain task-specific: Soul is for realistic people, never a house default for brand work.

Use Higgsfield GPT Image 2 as the general baseline for graphic design, complete brand-world compositions, typography, banners, and on-image text when specialist routing is unnecessary. Prefer recommended specialist models for reference-sensitive characters, cinematic people, environments, vector-like graphics, product imagery, or complex image editing. For an ordinary GPT Image 2 request whose parameters are known, call generation directly.

For several distinct territories or prompts, use `higgsfield_generate_image_batch` with one independent request per territory. Do not request a count of cosmetic variants as a substitute for distinct briefs. Wait for all returned jobs together with `higgsfield_jobs_wait`, then present the completed set once with `higgsfield_show_generation_by_ids`. Use the single-image generation and display path when only one output is needed.

Do not estimate cost from historical runs or choose a cheaper model unless the user asks. Read current provider pricing before giving an estimate. Check balance only when requested or when a credit error prevents generation.

For reference inputs, follow the selected model schema. Upload only authorized media through the Higgsfield media tools and confirm successful uploads before generation. Preserve the source role and borrowing boundary for every reference. Keep public inspiration, private client material, official assets, and edit targets distinguishable.

For identity-sensitive portraits, official assets, products, or edit targets, state the immutable subject and identity requirements before prompting. Use a model and reference mode that support those invariants, then compare the result directly with the source. Reject drift rather than treating approximate resemblance as a successful visual translation.

Generated images remain evidence until selected. Preserve exact logos, typography, diagrams, and complete compositions as editable native elements rather than trusting generated pixels. When the work depends on a generated asset, persist the selected output in the authorized project location and record its model, prompt, reference roles, and source limits.

## Built-in fallback

Use the built-in `imagegen` skill and tool only when:

- the user explicitly requests built-in ImageGen;
- Higgsfield MCP tools are not available in the active task;
- Higgsfield authentication, workspace access, or credits prevent generation;
- the required operation is unsupported by available Higgsfield model schemas; or
- a Higgsfield request fails, one corrected retry against the verified schema also fails, and the built-in tool can satisfy the same brief.

Do not retry an identical failed request or hide a fallback. State that Higgsfield was unavailable or failed and name the fallback provider in the result. Preserve the same brief, references, invariants, and output boundary across providers.
