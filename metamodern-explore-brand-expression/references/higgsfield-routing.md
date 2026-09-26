# Higgsfield routing for this method

Read [provider routing](provider-routing.md) for the default-and-fallback contract and [model prompting guide](model-prompting-guide.md) for how each model family expects to be prompted. This file adds the mechanics this method depends on; verify current schemas and limits before relying on them.

## Sequence for one wave

1. `models_explore` with action `get` for each model in the wave when a parameter or aspect could be wrong. GPT Image 2 takes references with role `image`; Nano Banana, Seedream, and FLUX.2 take `image_references`. Aspect lists differ by model; GPT Image 2 has no 4:5 and the server substitutes 3:4 with an adjustment note.
2. Upload a new logo file only under the director's authorization for the run: `media_upload`, PUT the bytes, `media_confirm`, record the media id. Reuse media ids across runs; never re-upload the same file.
3. Read the account's current concurrency limit, then submit with `generate_image_batch`, one request per board and a stable `index` per board. Split a larger set into waves that stay within the verified limit.
4. Wait with `jobs_wait` in supported groups until every job is terminal.
5. Download every result to the session scratch directory and send the shown set into the chat as files.
6. Present once with `show_generation_by_ids` for the complete set.
7. Read the model and aspect back from the job record before attributing a result; providers can substitute or adjust unsupported requests.
8. Record job ids, media ids, and recipes in the ledger.

## Model routing by stage

- Boards and any surface carrying text: `gpt_image_2`, aspect `1:1` for boards, `2k`, quality `high`. Always set quality; the default is low.
- Board refinement and expansion: `gpt_image_2` with the base board or locked board passed as a job id with role `image`.
- Text-free imagery layer from a locked board: `nano_banana_pro` (or whatever the server routes to) with the board as `image_references`; FLUX.2 when precise art direction matters more than 4K.
- Vector patterns and icons with hard hex control: `recraft_v4_1`.
- Instruction edits on an existing tile ("change X, keep Y"): Seedream 5.
- Utilities before regeneration: upscale, outpaint, background removal.
- Never Soul models or Marketing Studio for brand boards; no real face is ever an input.

## References in prompts

Every reference carries an explicit role in the prompt. Two references is the working set: the logo as Image 1 and the base or locked board as Image 2. Name what to take from each and, for a board reference, say it is not a layout to copy.

## Retention and cost

Verify current output-retention and pricing terms before the run. Keep job ids and recipes as the durable record, download accepted outputs before their provider retention expires, and estimate spend from current pricing. Check balance only when the user asks or a credit error appears.
