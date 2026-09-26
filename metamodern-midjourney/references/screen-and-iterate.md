# Screen and iterate

The screen runs on every returned image before the director sees anything. It reserves the director's attention for judgment and keeps mechanical checks with the agent. Results go into the ledger next to the recipe, discards included.

## Hard checks

Each is pass or fail. One fail discards the image from the shown set; the ledger keeps it with the reason.

| Check | How |
| --- | --- |
| No unbriefed text | Read the image; any letters, numbers, or signage that the recipe did not brief |
| No logo-like mark | Any emblem, badge, or wordmark shape; the brand's own mark is never generated |
| No real-person likeness | A face that reads as a specific real person; stand-ins are invented |
| No forbidden object | The brand's anti-list (the category's stock props, the objects the brief banned) |
| No reference leakage | The reference's subject, props, room, or composition reproduced instead of its treatment |
| Palette within the color roles | Measured, never judged by eye or by a vision model, which misjudges color; see below |
| Aspect and resolution as briefed | Read the file dimensions |

**Palette measurement.** Sample the dominant colors of the image (a short script with Pillow when Python is available: resize to 64 px, cluster to five colors, convert to Lab; otherwise the director's Digital Color Meter on three named regions) and compare each to the nearest color role in Lab. Record the values in the ledger. A dominant color more than a set distance from every role fails; the brand's tolerance is set at intake (a photographic register tolerates more drift than a graphic one). Repeat this by hand until it recurs across brands; only then propose a bundled script.

## Rubric

Score each dimension 0 to 1, where 0.9 and above means the recipe's intent is fully present, 0.5 means partly, and 0.2 and below means absent or wrong. Present the scores as preliminary; the director's judgment outranks them.

1. **Idea present.** The one idea in the recipe is what the image is about.
2. **Light as subject.** One source, its direction and behavior, the shadow side as briefed.
3. **One dominant form.** The frame has a hero; nothing competes.
4. **Placement.** What sits where and what is empty, as written.
5. **Register.** The conduct words hold (still, blunt, confident); no drift to the model's house mood.
6. **Finish.** Shot size, format, grain, and grade as briefed; no plastic sheen.

## Gap to action

| Situation | Next move |
| --- | --- |
| One element wrong, rest right (best score above 0.8) | Vary Subtle, or the Editor on the one region |
| Right concept, wrong execution (0.5 to 0.8) | Vary Strong, or a refinement recipe that names the one quality to change |
| Wrong idea (below 0.5 on idea) | Rewrite the idea clause; regenerate |
| A dimension stuck within 0.03 across two edits | Change the reference or its weight, never the words again |
| Palette fails while everything else passes | Lower stylize, raise the reference weight, or move the palette owner from text to reference; last, plan a post-grade |
| Text or logo appears unbriefed | Add the noun to `--no`, lower stylize, or use `--raw` if it was off |

Stop rules: after three iterations on one index, review the recipe with the director; after five, change the prompt structure; after seven, change the reference, the aspect, or split the idea. Two refinements per index at most before regeneration.

## Describe as a register check

Run Describe on the strongest candidate of a set. Its four readings are Midjourney's own account of the image. If none names the intended register (the medium, the light, the genre), the image reads as something else to the model and probably to a viewer; note it in the ledger and weigh it in the recommendation. Describe is an inventory, never a prompt to paste.

## Showing the set

Two to four candidates per cell, plus one far candidate labeled as such. Contact sheet order: the recommended first. Each shown image goes into the chat as a file with its recipe id. Then the recap, the recommendation, and one question with labeled options: keep, reject, combine, redirect. When two are close, the forced pair. The director's words verbatim into the ledger.

## After a lock

Promote every accepted image into the style set as a kit item with its role and weight band (accepted-asset promotion). Chain it as the next reference for the rest of the set: the same recipe shape with the accepted image as S-next carrying light, grade, and texture. Realism drops when chained images hold several people or objects; prefer plates and single figures as chain links. Record the resolved prompt from the lightbox, including the `--p` code and the `--sref` inputs, next to the recipe; that record is the reproducibility of the whole system.

## Failure ledger

Every pattern the screen catches more than once goes into the brand ledger's failure table with a confidence tier: low (one session), medium (two or more sessions), high (two brands). Entries name the pattern, the fix that worked, and the sessions. A high-confidence entry is a candidate correction to this package, reported to the director before any change.
