# Stage playbooks

Inputs, tools, outputs, gate shapes, and lock formats for an expression run. A review uses the accepted brief, sheets, boards, locks, and failure lines to report its assessment; it does not enter these stages unless the director asks to create or change expression work.

## Stage 1: Intake

For a new or invalidated PRESERVE block, inventory before any writing. Nine inputs, each with a source and a state (fixed, open, or gap):

| Input | Where it comes from | Notes |
| --- | --- | --- |
| Logo files | The current export, inspected as an image | Prefer a sheet showing the lockup on light, dark, and the brand colour; it teaches the colour treatments. A transparent lockup alone can render at the wrong scale |
| Editable identity source | Figma file or a recorded gap | A gap is recorded, never invented |
| Palette | Sampled from the export, exact hex | Fixed exactly unless the brief allows a tolerance |
| Settled type | `BRAND.md` or "open" | Product-UI type evidence is exploratory, not settled |
| Brand facts | The accepted platform | Category, audience, character in one paragraph |
| Naming on surfaces | Director decision | The logo's styling can differ from the recorded name; ask, then record the split |
| Imagery rules | Director decision | People allowed or not; category objects allowed, stylized, or banned |
| Prior accepted and rejected work | Ledgers, prior boards | Advanced directions become sheet lineage; rejected ones become failure lines |
| Tolerances | Brief | Hue shifts within a stated angle, colours that may be added |

Reuse a valid accepted PRESERVE block and its logged logo media id. Otherwise ask the two director decisions in one question set with labeled options. Upload the logo under the director's authorization, PUT the bytes, confirm, and record the media id. Output the PRESERVE block from [prompt blocks](prompt-blocks.md).

Gate: the director confirms what is fixed and what is open.

## Stage 2: Sheets

Write the sheets from [expression sheet](expression-sheet.md), side by side in one table, and show the table before spending anything. The gate costs nothing and catches a wrong far candidate or a missing subject line before credits.

Brief shapes: a set of distinct bets (three to five sheets); a distance scale from the current brand disciplined to a far reach (five to seven, the nearest one behaves as a control); a matrix that isolates one or two opened axes (subject by mode, mode by device) when the director has asked for more options on a known axis.

Gate: the director approves, edits a line, swaps a candidate, or holds.

## Stage 3: Boards

Recipe: `gpt_image_2`, aspect `1:1`, resolution `2k`, quality `high`, one job per sheet, Image 1 the logo sheet with role `image`. Prompt: PRESERVE block, then the EXPRESSION block (or TREATMENT, MODE, DEVICE, SUBJECT blocks for a matrix), then the quality bar. Submit with `generate_image_batch` in waves of eight or fewer, wait with `jobs_wait`, download every result, present once with `show_generation_by_ids`, and send every shown image into the chat as a file.

Screen every board before the director sees it:

- logo reproduced exactly, wordmark not re-set in another face;
- palette held, including the smallest labels and UI chips;
- no expression name or verb printed as copy;
- imagery rules held (people, category objects);
- subject landed (the drawn object is the one the sheet named);
- device placed where the sheet allowed and nowhere else;
- spelling of every readable word;
- every enumerated tile present.

Treat label-size text as a screen item; prompting alone does not verify it.

Gate: state a recommendation, then ask whether a board expresses the brief. Options: keep, reject, combine. When the director names two boards, ask the forced pair: which is closer, and what one thing would make it closer. "Take elements from all three" is a refinement request against one base.

## Stage 4: Refine

Base board as Image 2 (its job id, role `image`), logo as Image 1. Describe Image 2 in one sentence, then `REFINE Image 2. Keep <list> identical. Change only <named changes>. <Where the change may not go.> Nothing else changes.` Add "the words REFINE and the change list never appear on the board".

Name every change and where it may not go. List screen fixes (a stray colour, a misspelling) as explicit changes because "keep identical" can outrank the preserve block. A type change against a reference needs a stronger instruction or a specimen reference. Re-screen the output because refinements can introduce new small-text errors.

Critique first, without generating: read the board against its sheet's failure line. Where a board drifts, it drifts where the sheet predicted, which makes the critique mechanical.

Return path: a rejection here goes back to Stage 2 with one axis opened. The most common opened axis is the imagery subject (the director liked the treatment and rejected what was drawn).

Gate: did the right thing move. Options: lock, refine once more, back to the base, back to sheets.

## Stage 5: Expand

The locked board as Image 2 with "match its drawing treatment, type behaviour, colour roles, line weights, and finish exactly; do not copy its layout; it is a reference for the system only", logo as Image 1, then `NEW SURFACE: <format> at full size` with exact copy in quotes and the device placement. Use the model's aspect list from `models_explore`; a 4:5 deliverable is a 3:4 generation cropped natively.

Route by aspect: text-bearing surfaces stay on GPT Image 2; a text-free imagery layer can go to Nano Banana Pro (the server may substitute Nano Banana 2; read the model back from the job record) with the locked board as `image_references` and a campaign-still prompt that enumerates what to take from the reference. Vector patterns and icons with hard hex control go to Recraft. Upscale and outpaint utilities before regeneration.

A subtractive refinement ("remove only X; leave clean white where it was; nothing else changes") is the cleanest change in the method; use it for a device the director withdraws at this stage.

Gate: does each tile hold the expression. A device that fails here amends the lock and invalidates the affected tiles.

## Stage 6: Language and handoff

Written, no generation. Read [design language and handoff](design-language-and-handoff.md).

Gate: accept the expression as the direction.

## Stage 7: Closeout

Brand facts go to the brand's workspace and `BRAND.md` (naming used, decisions, rejected directions, the lock and its amendments, the recipe bank, where the accepted images were copied). Method lessons go to the run ledger and, when they survive a distinct case, may be proposed for this package. Generated images stay out of Git unless the project's explicit asset policy says otherwise.

## Lock format

```text
LOCK, <what>: images <indexes and job ids>. Recipe: <model, aspect, resolution, quality, Image 1 media id, Image 2 job id, prompt blocks by name>. Sentence: <one plain sentence a designer could build from>. Dependents: <stages and artifacts invalidated if this changes>.
```

An amendment repeats the format with the date and Director's words.

## Cost and time estimate

Use the provider's current model catalog and pricing before the run. Show the proposed wave size, estimated credit spend, and expected wait before generating. Check the live balance only when the user requests it or a credit error prevents generation.
