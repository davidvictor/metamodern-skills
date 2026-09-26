# Image-model prompting guide

Read this with [provider routing](provider-routing.md) before any generation. Provider routing decides *which* model; this file explains what the major models are and *how to prompt each one*. Verify the live catalog with `models_explore` (action `list` or `recommend`) before relying on this file: the catalog changes faster than this document.

## What Higgsfield is

Higgsfield is an aggregator: one MCP workspace over many providers' models: Google's Nano Banana family, ByteDance's Seedream family, OpenAI's GPT Image 2 and Hazel, Black Forest Labs' FLUX.2, xAI Grok, Kling, Recraft, plus Higgsfield's own Soul/Cinema/Marketing models. "Using Higgsfield" is not a model choice. Every generation call must name a model deliberately, and `models_explore` with action `recommend` (goal + input context) is the required first step whenever model choice could change the visual character of the work.

## Model map (verified against the catalog, 2026-08-31)

| Model (id) | Provider | Reach for it when | Avoid it when |
| --- | --- | --- | --- |
| **Nano Banana Pro** (`nano_banana_pro`) | Google (Gemini 3 Pro Image) | Highest-fidelity single images; accurate in-image text and logos; diagrams; work grounded in real-world knowledge; up to 14 reference images for brand/character consistency; 4K | Speed matters more than fidelity (use `nano_banana_2` or `nano_banana`) |
| **Nano Banana 2** (`nano_banana_2`) | Google | Fast high-quality photorealistic work; inpainting with a mask; reference-driven edits | Dense text layouts (Pro is stronger) |
| **Seedream 4.5** (`seedream_v4_5`) | ByteDance | Precise structured control; poster-like composition; multi-image editing/transformation; up to ~6K on `high` | Loose exploratory vibes prompts: it rewards structure |
| **Seedream 5.0 Pro** (`seedream_v5_pro`) | ByteDance | Instruction-based editing with visual reasoning ("change X, keep Y"); inpaint; background removal | First-pass generation where 4.5's control or NB Pro's fidelity fits better |
| **GPT Image 2** (`gpt_image_2`) | OpenAI | The routing baseline for graphic design, complete brand-world compositions, typography, banners, on-image text; 4K; strong instruction following | Its `quality` defaults to **low**: always set `medium`/`high` for anything shown to a human; use `high` for dense text |
| **FLUX.2** (`flux_2`) | Black Forest Labs | Precise prompt adherence; `pro`/`flex`/`max` variants; controlled art direction | 4K output needed (caps at 2K) |
| **Soul 2.0** (`soul_2`) | Higgsfield | Realistic people: UGC, fashion/editorial portraits, persistent characters via Soul ID | Anything that isn't primarily a person; never a default for brand work |
| **Soul Cinema** (`soul_cinematic`) / **Cinema Studio 2.5** (`cinematic_studio_2_5`) | Higgsfield | Cinema-grade stills, dramatic lighting, concept frames; 21:9 | Flat/graphic or documentary registers |
| **Recraft V4.1** (`recraft_v4_1`) | Recraft | Vector-like logos/icons/typography (`vector`), clean product shots (`utility`); accepts an explicit hex `colors` palette and `background_color`: the only model with hard palette control | Photorealism |
| **OpenAI Hazel** (`openai_hazel`) | OpenAI | Heavy editing with best-in-class text rendering: logos, diagrams, infographics | Fresh photographic generation |
| **Kling O1** (`kling_omni_image`) / **Grok Image 2.0** (`grok_image_2_0`) / **Z Image** (`z_image`) | Kling / xAI / Tongyi | Versatile photoreal wide-ratio; expressive high-contrast; fast cheap drafts | When a listed specialist matches better |

Utilities, not generators: outpaint (`flux_2_pro_outpaint`), upscale (`bytedance_image_upscale`, Topaz), background remover. Prefer these over regenerating an asset that is already right.

Soul is a portrait specialist, not a house default. Model choice is part of art direction: record the model and the reason with every generation.

## How to prompt each family

**All models.** Write natural descriptive language; no tag spam ("8k, masterpiece, trending"). One coherent direction per request: never several aesthetics mixed. State intended use (brand-world board, photography hypothesis, texture study). Put exact on-image text in quotes with explicit treatment ("EXACT TEXT: 'HEADLINE' in thin geometric sans, white on charcoal"): or keep text out entirely and set type natively. Name the avoid-list from the anti-references (no glow gradients, no category clichés, no fake logos). Iterate one variable at a time.

**Nano Banana Pro / Nano Banana 2 (Google).** Conversational, richly specified scenes: subject, composition, action, location, style, camera, lighting in flowing prose. It reasons before rendering, so factual constraints and real-world references work ("accurate…", "as used in broadcast studios"). Text: describe exact string, font character, color, placement. Use reference images (role `image_references`, up to 14 on Pro) for palette, product, or character lock rather than describing them verbally. Treat follow-up edits as conversation: change one thing, keep the rest.

**Seedream 4.5 / 5.0 (ByteDance).** Order is signal: it weights what comes first. Structure as [subject] + [action/pose] + [setting] + [style] + [lighting] + [camera/technical] + [mood]. Concise and precise beats long and lyrical. Wrap in-image text in double quotes. For edits on 5.0, give explicit instructions ("replace the background with…; keep the subject's pose and lighting") and set `is_inpaint` when editing a reference. Use `high` quality for final boards.

**GPT Image 2 (OpenAI).** Prompt like a production brief in labeled segments: scene/background → subject → key details → constraints → EXACT TEXT → aspect/use. Editing pattern: `Change: … / Preserve: face, pose, lighting, layout / Constraints: no extra objects, no logo drift`. Always set `quality` explicitly (`high` for typography-dense work) and `resolution` `2k`+ for boards.

**FLUX.2 (BFL).** Rewards precise, concrete art direction: exact framing, lens, materials, spatial relationships. Use `variant: max` for final quality, `flex` for iteration.

**Soul 2.0 / Soul Cinema (Higgsfield).** Prompt like a photographer's shot note: subject, wardrobe, expression, environment, lens/film character, lighting. For a recurring person, train and pass a `soul_id` rather than re-describing. Do not ask Soul for graphic design, layouts, or text.

**Recraft V4.1.** State the graphic style plainly (flat vector mark, single-weight icon set), pass the exact brand palette via `colors` (#RRGGBB), and choose `model_type` deliberately; `utility` for predictable product/mockup shots.

## Midjourney (manual hand-off)

Use `metamodern-midjourney` for current controls, the look kit, recipe block, calibration run, and ledger. Where this general handoff guidance disagrees with that skill's current controls reference, the dedicated skill wins.

The user runs Midjourney in their own account; the deliverable is complete copy-paste prompt text with no parameter tags when the user controls aspect, stylize, version, and negatives in the interface.

1. **Subject first.** Midjourney weights early nouns heaviest; open with the hero ("aerial photograph of flooded rice terraces...").
2. **Anchor everything that matters.** Whatever the prompt leaves unstated, the model invents. Each prompt states vantage, place, light (direction, temperature, what it does), color relationships as roles (what is pale, what is deep), texture and grain, and mood, as one flowing scene description of roughly 40 to 80 words.
3. **Positive phrasing only.** Midjourney reads words as content: "no text" can add text. Express exclusions positively ("frame filled edge to edge with the pattern" instead of "no horizon"). Negatives belong in the interface's tools, which the director controls.
4. **Concrete nouns and camera vocabulary** ("straight-down aerial", "macro", "medium format", "shallow depth of field") beat adjectives; junk tokens ("8k", "award winning", "photorealistic") stay out.
5. **Theme by variation matrix.** For a validated visual essence, deliver five themes by five prompts: hold the treatment invariants constant (the essence vocabulary) and vary exactly one axis per prompt (subject instance, time of light, scale, pattern behavior, weather). One coherent scene per prompt; alternatives are separate prompts.
6. Deliver prompts as finished blocks, never as fragments to assemble, and store the client set in the client workspace.
7. **Abstract patterns need a medium anchor.** Pure abstraction words ("wave pattern", "gradient") regress to stock cliches. Anchor the abstraction in a craft the model knows: a risograph print, a Cinema 4D cloth or particle simulation, ink in glass, an engraved line, a long-exposure photograph. Dither responds to print-process vocabulary (risograph, halftone dots, 8-bit dithering, grainy noise gradient). Control color with two or three plain color names placed early; hex codes are ignored.
8. **Style reference mechanics.** Verify current syntax in `metamodern-midjourney` before use. Let the reference carry treatment while the text supplies the subject, keep the reference set small, and test each reference alone before combining them.
9. **With style references, strip the prompt to subject.** When the user drives the look through reference images in the interface, style language in the text can compete with the reference. Keep the prompt to subject, vantage, concrete physical contents, and the time or direction of light.

## Sources

Prompting guidance grounded in: [Google Cloud Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana), [Google's Nano Banana Pro prompt tips](https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/), [fal Seedream 4.5 prompt guide](https://fal.ai/learn/devs/seedream-v4-5-prompt-guide), [VEED Seedream 4.5 guide](https://www.veed.io/learn/seedream-4-5-prompt-guide), [fal GPT Image 2 prompting](https://fal.ai/learn/tools/prompting-gpt-image-2), [i-SCOOP GPT Image 2 field guide](https://www.i-scoop.eu/prompting-gpt-image-2-like-a-pro-guide/), [Higgsfield model chooser](https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use), and the live `models_explore` catalog (2026-08-31). Re-verify against vendor docs when a model version changes.
