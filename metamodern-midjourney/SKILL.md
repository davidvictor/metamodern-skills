---
name: metamodern-midjourney
description: Use when the user wants Midjourney prompts, recipes, style references, moodboards, a brand look kit, a calibration run, a paste sheet, a screened set, a parameter answer, or a review of results from their session. Do not use for Higgsfield generation (that is metamodern-build-brand-world) or for native Figma production.
---

# Metamodern Midjourney

## Purpose

Turn an accepted brand into Midjourney inputs that reproduce its look, and keep improving them. The skill produces a look kit (a style set from the brand's own approved imagery, a house moodboard code, identity sheets, a parameter policy, a vocabulary sheet), recipes the user pastes into their own Midjourney session, a calibration run that fixes the settings once per brand and model version, a screen that runs before the director sees anything, and a ledger that turns every accepted image into the next reference.

The method rests on one division: the words in a recipe carry the scene, and the references and parameters carry the look. Every earlier Metamodern attempt put the look into words, and the model returned its average image. Midjourney reads style words weakly, ignores hex codes, and reads a plain candid sentence as a request for a stock photo. It reads references, style weight, stylize, and raw mode strongly, and it rewards concrete nouns, light stated as direction and quality, and one staged idea.

The designated creative director is the only taste authority. The agent proposes, writes, screens, records, and asks. It never selects on the director's behalf.

## Choose the requested outcome

Use the `parameter` route to answer a control question from [controls](references/controls.md), with its model-version boundary and unverified status. Use the `recipe` route to write a paste-ready recipe or a small requested set from existing accepted brand authority, kit items, and settings. Use the `review` route to screen supplied results against their stated recipe and accepted brief. These bounded routes do not open a new look kit, calibration, ledger, upload, paste sheet, or director gate unless the director asks to create or change one.

Use a `look-kit run`, `calibration`, or `sets` run only when the director requests that outcome or changed authority or model version makes it necessary. Reuse the accepted source, image-language brief, kit, settings lock, ledger, and known plan facts, then resume at the earliest material gap. A material source or version change reopens the stage that owns it and its dependents; valid prior acceptance is not repeated merely to reconstruct it.

## Establish authority

For a parameter answer, read [controls](references/controls.md). Verify the current model version when the answer depends on it; if it differs from the version the controls file was verified against, say so and treat the version-dependent claim as a test. Do not load brand authority or open a brand workflow for a parameter answer.

For a recipe, review, look-kit, calibration, or sets run, read the project's current instructions, accepted brand authority, and any local governance or language guidance. Do not assume private Metamodern Agency files are available. Read the brand's `BRAND.md` and `brand-world.md` when they exist, then read [controls](references/controls.md) before writing any recipe.

For a recipe, review, look-kit, calibration, or sets run, require one of three sources: an accepted Brand System, a brand-world lock chain from `metamodern-build-brand-world`, or an accepted expression sheet. Absent all three, state `Brand Development required` and route to `metamodern-develop-brand` or `metamodern-build-brand-world`. A lighter image-language brief is allowed only when it names the brand fields it derives from, and the ledger records it as an image-language brief. A parameter answer can remain limited to the verified control without creating brand work.

## Operating model

Midjourney is the user's instrument. For a recipe or session-facing run, the agent writes complete recipes in the requested form, reads back results the user returns when applicable, screens, records, and asks. A numbered paste sheet is delivered only when the user requests one. The agent never operates the session unless the user asks for that in the current session. Read [operating contract](references/operating-contract.md) before preparing a paste sheet, handling returned jobs, or using plan and session facts. Higgsfield remains the automated generation chain; a Midjourney result enters it only as a reference the user authorizes.

## Gate contract for look-kit, calibration, and sets runs

Every director stop has the same shape, inherited from build-brand-world:

1. **Recap.** The brief line, the source of authority, the look kit state, the settings lock, and the judging criteria, before any image appears. Say in plain words what the images will become and what a choice commits.
2. **Feedforward.** The recipes and their cost in GPU minutes. Ask whether the set is worth its cost.
3. **Generate many, show few.** The director returns every result; the screen runs; the agent shows two to four with one far candidate labeled as such, and keeps every discard visible in the ledger with its screen result.
4. **Single variable.** Within one shown set, candidates differ by one input, and each recipe's Varies line names the base recipe and the slot. A candidate that changes the frame word, the object, and the view at once is three candidates.
5. **One question.** Labeled options: keep, reject, combine, redirect. A forced pair when two candidates are close: which is closer to the brief, and what one thing makes it closer. State a recommendation. Ask whether the candidate expresses the brief, never whether it is liked.
6. **Verbatim record.** The director's words go into the ledger unedited.
7. **Lock.** Approval writes three things together: the accepted image ids, the exact recipe with resolved codes, and one plain sentence. Prose alone is never a lock.

Send every shown image into the chat as a file. Links alone do not render for the director.

## Stages

### Stage 1: Intake

For a new or invalidated look-kit run, collect from evidence, never by interview. Read [look kit](references/look-kit.md) for the field-by-field mapping. Reuse a valid accepted intake and add only the evidence needed for the requested material gap.

- From the brand source: the register in conduct words; the concept ideas; the light idea; color roles as named colors on things (field, figure, highlight); lineage genres; visual verbs; imagery subject rules; the forbidden list; the judging criteria; the surfaces and their aspect ratios.
- The approved image set (locked brand-world images, approved photography, approved generations) and the inspected external references with their roles. Inspect every image; never describe a mark or an image from a document's wording.
- Operating facts: the model version in the director's interface, the plan tier and what it allows, the GPU budget for the run, the brand's Midjourney folder.
- Every document the user points to in the request, named in the brief's source list with what it contributed, even when it contributed nothing. A named source the brief does not cite reads as a source that was not read.

Open `midjourney.md` in the brand's project directory from [the ledger template](references/ledger-template.md). One question set: the decisions only the director can make (which approved images count, imagery rules, budget). Approve the brief.

### Stage 2: Look kit

Build the brand's encoding in Midjourney's own instruments, per [look kit](references/look-kit.md):

- **Style set.** Candidate style references from three sources in order: the brand's own approved images passed as image references, style codes from a supplied project library or the official Style Explorer, and a Style Creator code only when the look is reachable no other way. Each candidate is tested alone on the probe set before any pairing. At most two references per recipe.
- **House moodboard.** One board per brand of ten to thirty images: the approved set plus inspected references. Record the code, since it survives edits and deletion of the board.
- **Identity sheets.** Only when the brief needs an exact object: a master sheet for the Edit Model. Never the wordmark. Never a real person.
- **Palette swatch.** Optional, for palette-dominance tests only. Color lives on things and as light first.
- **Parameter policy.** Version pin, raw by default for photographic and campaign-still registers, a stylize band, chaos 0, experimental 0, aspect per surface, and a `--no` baseline in words that survive per-word moderation.
- **Vocabulary sheet.** Treatment words, register words, framing words, medium anchors, the anti-list, and Describe's reading of the approved set as an inventory of Midjourney's own words for the look.

### Stage 3: Calibration

The step every earlier round skipped. Per brand and per model version, run [calibration](references/calibration.md): three probe subjects the brand will need (an environment, a texture or pattern, a figure as form) against four to seven settings where each setting differs from a named neighbor by exactly one control, twelve to twenty-one images at hand cadence. The director judges with a forced pair. The winning setting becomes the parameter policy, written to the ledger with the images that proved it. Re-run on any model version change.

### Stage 4: Sets

For a sets run, per content cell, four to eight candidates that differ by one input. Write every recipe in full per [recipe craft](references/recipe-craft.md), deliver the paste sheet, run the screen from [screen and iterate](references/screen-and-iterate.md) on what comes back, show two to four, ask one question, lock. Accepted images are promoted into the style set and chained as the next reference.

### Stage 5: Closeout

Separate brand facts from method lessons. Brand facts (the kit, the settings lock, the accepted images, the standing rules) go to the brand's `midjourney.md` and `BRAND.md`. New style codes go to the project's supplied style-reference library when one exists, with source and version evidence; otherwise keep them in the brand ledger. Method lessons that survive this case and one materially different case may be proposed as corrections to this package and reported before any change.

## The recipe block

Every recipe is written in full. When the director requests a paste sheet, use the same complete recipe fields in that sheet:

```text
Recipe <set>.<index>: <one line naming the cell and the single variable>
Prompt: <frame word> <one idea in one clause> <subject and staging in concrete nouns> <one light source, its direction and behavior> <placement and emptiness> <two or three named colors on things> <finish: one shot size or format, at most one process word> ["with the words '<short text>'" only when text is briefed]
Parameters: --ar <w:h> --v <pinned version> --raw --s <band> --c 0 --exp 0 [--sref <kit item> --sw <band>] [--p <house code>] --no <baseline>
References: <kit item id, its role, what it must carry> (none, one, or two)
Edit references: <role of each, only when identity is briefed>
Varies: <the one slot changed> from <base recipe id>, <old> to <new> (or "base of the set")
Record back: job id, resolved prompt, seed, image URLs
```

Omit optional reference controls when no accepted kit item or house code applies; never invent an id, code, or reference to fill a slot. When the director requests a paste sheet, it carries the same content as two lines per recipe: a header line (id, the single variable or calibration setting, attachments by kit id and slot) and, beneath it, the paste line alone, which is the only thing that enters Midjourney. Numbered, grouped by set, in run order.

## Prompt discipline

Rules that never bend within this method; re-verify version-dependent syntax against current official documentation:

- Frame the deliverable first ("Campaign still", "Key visual", "Texture plate"). A prompt that names a record produces a record.
- One idea per image, one hero, one gesture. Multi-object layout instructions fail.
- Subject first, then staging, light, placement, color, finish, parameters. Twenty to sixty words of description; never instruction language outside the Edit Model.
- When a style reference carries the look, treatment words stay out of the text until the reference fails to activate; then add only words that match the reference.
- Light as direction and quality ("one hard key from camera left, no fill, shadow falls to black"), never as a mood word.
- Color on things and as light, one to three unambiguous color names, "-color" appended to noun-colors. Hex codes and Pantone names never appear in a prompt.
- One owner of the palette per recipe: the reference or the text, never both.
- Positive phrasing in the text; exclusions in `--no`, each word moderated on its own.
- Concrete nouns, materials, film stocks, shot sizes, print processes, and layout template nouns; no artist or photographer names; no quality boosters (8k, masterpiece, trending); no "in the style of".
- Every abstraction gets a medium anchor (a risograph print, a cloth simulation, ink in glass, an engraved line).
- Text only in double quotes, short, and only when briefed. The wordmark is never generated; type is reserved with template nouns and set natively.
- Vary one input between candidates. Refine a right idea with one wrong quality through Vary or the Editor; regenerate only when the idea is wrong.

## Screen

Before the director sees anything, per [screen and iterate](references/screen-and-iterate.md): hard checks (no unbriefed text, no logo-like mark, no real-person likeness, no forbidden object, no reference leakage, palette measured by pixel sampling against the color roles), a rubric scored 0 to 1 per dimension (idea present, light as subject, one dominant form, placement, register, finish), a gap-to-action table, stop rules at three, five, and seven iterations, and Describe run on the strongest candidate as a register check.

## Ledger

One `midjourney.md` per brand, from [the ledger template](references/ledger-template.md): run facts, the look kit with sources and version evidence, the calibration grid and its lock, every recipe with resolved codes read from the lightbox, screen results, Director's words, accepted images with job ids and URLs, a failure ledger with confidence tiers, and the re-validation log. Job ids, URLs, and recipes are stored; generated images stay out of Git unless the project's explicit asset policy says otherwise.

## Guardrails

- Midjourney runs only in the user's own account. Do not use third-party wrappers, pooled accounts, proxy APIs, or MCP shims.
- The agent never operates the session without the user's request in the current session. Recipes are the deliverable.
- Uploads of brand assets to Midjourney need the user's authorization per run, recorded with the date.
- No real person is ever a reference or an Edit Model input. Portraits of real people are placed natively.
- The wordmark is never generated. Identity sheets carry products and objects only.
- Generated images are evidence until the director locks them, never production assets.
- Before uploading client or confidential material, verify the user's current plan, gallery visibility, account terms, and authorization. Never carry privacy consent or plan facts from another user or an earlier run.
- Customer-facing AI language follows the project's approved policy. If no policy is supplied, do not invent one or make disclosure claims on the user's behalf.
- Rights, contract, and disclosure questions belong to the legal team, never to this skill.

## Closeout

Parameter answers, bounded recipes, and reviews return the requested output without filing facts, codes, or a ledger unless that write is separately requested. At the end of an authorized look-kit, calibration, or sets run, file brand facts in the brand's ledger, file new style codes in the supplied project library when one exists, and propose method corrections only after one distinct case confirms them. Report every change to this package before it is made.
