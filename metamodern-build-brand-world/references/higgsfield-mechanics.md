# Higgsfield mechanics

Tool names are given without their MCP prefix; use the connected server's exact names. Verify every model schema live before the first call of a run; the catalog changes faster than this file.

## Sequence for one gate

1. `models_explore` with action `get` for each model the gate uses. Read `medias[].roles` and the parameter list. GPT Image 2 uses role `image`; Nano Banana Pro, Seedream, and FLUX.2 use `image_references`.
2. Check balance or cost only when the director asks, or when a credit error appears.
3. Upload any new authorized reference with `media_upload`, PUT the bytes to the returned URL, then `media_confirm`. Reuse media ids; never re-upload the same file.
4. Submit all candidates of the gate with `generate_image_batch`, one request per candidate, `count` one each, a stable `index` per candidate.
5. Wait with `jobs_wait` in groups of at most twelve until every job is terminal.
6. Present once with `show_generation_by_ids` for the complete set.
7. Download the shown images to the session scratch directory and send them into the chat as files. Links alone do not render for the director.
8. Record job ids, recipes, and screen results in `brand-world.md`.

## Model routing by layer

- Physical tiles, rooms, stand-ins, world cells: Nano Banana Pro or Seedream 4.5, chosen by the toolchain check for the register.
- Readable text stage only: GPT Image 2 as a second pass over a locked base image, with the exact words in quotes.
- Precision alternative: FLUX.2 when the toolchain check prefers it.
- Motion (`deluxe` only): Seedance from a locked still as the start image.
- Never: Soul models, Marketing Studio, DTC Ads, or any model requiring a real face.

Resolution: 2k for tiles and cells; 4k only for the Gate D hero still.

## Reference roles in prompts

Three layers, in this order, on every generation that carries a reference:

1. Content comes from the text. Write the scene exhaustively; the reference never supplies subject matter.
2. Enumerate what to take: "Image 1: take its light quality, palette, contrast, grain, and finish." Naming attributes is what carries; "use Image 1 for style" is the weak form.
3. Leave nothing to leak: state what is in the frame and what is absent ("an empty plaster wall, one figure, no furniture, no objects"), then a short exclusion ("do not reproduce Image 1's objects, people, text, or composition"). Exclusion alone does not stop leakage; the exhaustive positive frame does.

Two references is the working default; four is the ceiling. Keep references in one light temperature and one genre. A still life passed to a scene with people can leak its objects. References with text or logos are never passed; they may reproduce. Photographer and cinematographer names never appear in prompts; their descriptors do.

## One identity across a set

When several images must read as one world, generate the strongest candidate first, wait for it, then pass its job id as a reference to the rest with the approved-image phrasing: "Image 1 is an approved image from this campaign. Match its light quality, palette, contrast, grain, and heightened staging. Do not reproduce its room, opening, circle, or figure. New image: <exhaustive scene>." Change only the scene, the light's placement, and the camera across the set.

## Refinement pass

When a shown image has the right idea and one wrong quality, refine rather than regenerate: submit a new job at the same index with the latest completed job of that index as the single reference, "keep composition, subject, and framing identical; change only <one named quality>." At most two refinements per index. Regenerate only when the idea is wrong.

## Reference Elements

After Gate C, create reusable elements with `show_reference_elements` action `create`:

- environment: the locked room plate job id
- prop: each locked mark tile job id
- character: the locked stand-in portrait job id

Pass `medias` as `{ id: <job id>, type: "image_job", url: <result url> }`. Record each returned element id in the ledger. In later prompts, embed `<<<element_id>>>` where that element belongs; the server injects the image and rewrites the placeholder. Elements work with Nano Banana Pro, Nano Banana 2, GPT Image 2, Seedream 4.5, Seedream 5 lite, and Cinema Studio Image 2.5. Do not use Soul characters.

## Uploads and authorization

Any Figma asset (mark, portrait, palette sheet) sent to Higgsfield requires the director's explicit authorization for that run, recorded in the ledger with the date. Exported Figma URLs are short-lived; download and upload immediately. Never upload a real person's photograph as a generation input.

## Retention

Verify the provider's current output-retention terms. Treat job ids and recipes as the durable record and re-download anything the handoff needs before closing the run. Generated images stay out of Git unless the project's explicit asset policy says otherwise.

## Failure handling

- A job returning `nsfw` or `failed` on a portrait means the provider refused a likeness; check that no real person was passed, then retry once with the corrected input. Do not retry a third time.
- A model redrawing the mark means the mark was described rather than passed; pass it as a labeled input or move the mark to native compositing.
- Text errors mean too many words; cut to five or fewer, or move text to the GPT Image 2 second pass.
- Literal-object drift (a ring rendered as jewelry, concentric rings as a record) means the prompt was a specification; rewrite as a campaign still with one idea.
- Stock-photo drift (competent, plain, forgettable scenes) means the prompt was documentary; add the idea, the dominant form, and the light as subject.
