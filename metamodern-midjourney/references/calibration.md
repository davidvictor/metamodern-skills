# Calibration

The calibration run finds, once per brand and per model version, the settings at which the look kit carries the brand without swallowing the subject. It replaces the guesswork every earlier round ran on: which reference, at what weight, raw on or off, moodboard or style reference. Twelve to twenty-four images, at hand cadence, before any production set.

## The probe set

Three subjects the brand will need, written as full recipes with the kit's parameter policy and no style words in the text:

1. An environment the brand lives in (a room, a field, a street, a table).
2. A texture or pattern the brand owns (its device, its material, its abstraction with a medium anchor).
3. A figure as form (an invented person small in the frame, never a real one).

Hold the three prompts fixed for the whole grid. Use the same aspect ratio for all.

## The grid

Choose four to seven settings so that every setting after the baseline differs from one named neighbor by exactly one control. A column that changes two things answers no question; the first-run grids of two brands each carried such a column before this rule was written down.

| Setting | Reference | `--sw` | `--raw` | `--s` | Differs from | Question it answers |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | none | none | on | 50 | baseline | What the text alone produces on this version |
| 1 | S1 alone | 100 | on | 50 | 0, adds S1 | Does the master reference take at the default weight |
| 2 | S1 alone | 250 | on | 50 | 1, weight | Does more weight carry more of the look or start swallowing the subject |
| 3 | S1 alone | 250 | off | 50 | 2, raw | Does the house aesthetic help or fight the brand |
| 4 | S1 alone | 250 | on | 150 | 2, stylize | Does stylize add energy without drift |
| 5 | House moodboard H1 | none | on | 150 | 4, reference source (a moodboard takes no weight) | Does the moodboard carry the world better than one reference |
| 6 | S1 plus S2 | 250 | on | 50 | 2, second reference | Does a pair add anything a single reference lacks |

Three probes by seven settings is twenty-one images; drop settings when the budget or the brief says so, never below four. Add a `--sv 6` column when the master reference is an older code. Every line on the sheet carries its setting in the header line, so a line that turns raw off or moves stylize is labeled as the test it is, never silently.

Probe substitutions: a brand with no people replaces the figure probe with a form probe (the brand's device at scene scale). A brand with light and dark modes runs the grid once per mode. A brand whose approved images all carry text or a logo needs text-free masters first (a crop of the empty field, a text-free plate), and the ledger records the crop as the kit item with its source job.

## Running it

Write the grid as a paste sheet numbered `C.<probe>.<setting>` with the attachments named per line. The director runs them in order, one at a time, and returns the grid images with their resolved prompts. The agent lays the results out as a contact sheet (probe by setting), screens each image for reference leakage and palette, and records everything in the ledger's calibration table before the director sees the sheet.

Cost on SD at 0.8 GPU-minutes per job: eighteen jobs is about fifteen GPU-minutes, a quarter of an hour of Fast time on a Standard plan. Say the cost at feedforward.

## The question

Show the contact sheet with the screen results. One question with labeled options per probe: which setting is closer to the brief. Then a forced pair between the two leading settings across all three probes: which is closer to the locked brief, and what one thing makes it closer. State a recommendation before the question.

## The lock

Approval writes three things together: the accepted grid images (job ids), the winning setting as the parameter policy line, and one plain sentence ("the brand's look is carried by S1 at weight 250 with raw on and stylize 50; the moodboard is not used for plates"). Record Director's words verbatim. Every production recipe then repeats the policy line.

## When to re-run

- The model version in the director's interface changes.
- A kit item is added, retired, or replaced.
- Two consecutive sets drift from the lock in the screen (palette or register) with no change in the text.
- A new mode is needed (a figure mode for a brand that only had plates).

Re-runs are cheap by design. Never carry a settings lock across model versions without one.

## Controlled tests worth running once

Each test: one probe subject, one variable, four-image grids, three seeds, recorded in the ledger with the resolved prompt and the model version. They answer questions nobody has published for V8.2.

1. A style-weight ladder for an image reference against a code (100, 250, 500).
2. Whether per-image weights (`URL::2 URL::1`) do anything on V8.2.
3. `--sv 6` against the default style version on the same reference.
4. Moodboard plus stylize against style reference plus weight for the same look.
5. `--raw` on and off at a fixed stylize value on a campaign-still prompt.
6. Named colors on things against a palette swatch as a style reference.
7. Treatment words in and out of the text with the same style reference.
8. Medium anchors for one abstraction against the bare abstraction word.
9. Draft mode with `--sref random` as a style-scouting yield check.
10. Describe as a register check: does it name the intended register on an accepted image.

File each result in the failure ledger with its confidence tier, and propose a correction to this package only when a second brand confirms it.
