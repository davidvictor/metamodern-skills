# The look kit

The look kit is the brand encoded in Midjourney's own instruments. It is built once per brand from the brand source and the approved image set, recorded in the ledger, and re-validated whenever the model version changes. Recipes point at kit items by id; nothing in a recipe describes a look that a kit item can carry.

## Brand field to Midjourney input

| Brand field | Where it goes | How | Retest on a new model version |
| --- | --- | --- | --- |
| Positioning, core idea | The one staged idea in the prompt | Hero subject, gesture, setting, as concrete nouns; one hero and one gesture | low |
| Register, personality | Never adjectives | Shoot specifications: light quality and direction, shot size, film stock, grade, grain, surface finish; and the style set | medium |
| Color roles | The style set first, then the text | One to three graded approved images carry grade and hue; one or two unambiguous color names on things, "-color" appended to noun-colors; structure words (duotone, monochrome, limited palette) when structural; light as color ("lit by warm tungsten practicals, cool ambient"); `--raw`, low stylize, chaos 0, exp 0; a numeric palette check and a post-grade budget; a flat swatch as an image prompt only for flat graphic work | high |
| Typography | Nowhere in Midjourney | Reserve space with layout template nouns ("magazine cover", "advertising template") and concrete empty-area nouns ("blank plaster wall on the right"); composite real type in Figma; quoted words only for incidental scene text | low |
| Mark | Never generated | Place through Editor layers (only transparent areas regenerate) or an Edit Model reference with `--raw`; the mark's geometry (a whole ring, a diagonal cut, a monoline) enters as concept cues in the scene | medium |
| Product, mascot, object | Identity sheet for the Edit Model | Up to four references, one job each, the object also described in the text | high |
| The brand's world | House moodboard | Six to thirty approved and inspected images for breadth, strength through `--stylize`; a style reference of one or two images for a specific treatment, `--sw` from the calibration, `--sv 6` when the subject must read | medium |
| Audience | Scene nouns | Casting, props, place, time of day, as nouns | low |
| Art direction | Framing and parameters | `--raw`; a cinematographer's sentence; template and framing nouns; the forbidden list; one hero, one gesture | medium |
| Consistency across a set | Fixed kit, fixed parameters | Vary only content words; chain accepted outputs into the style set; seeds only for A and B tests; Draft mode only for scouting | low |

## Style set

**Sources, in order.**

1. The brand's own approved images: locked brand-world plates, approved photography, approved generations. Passed as image references (a code cannot be minted from an upload), hosted in the director's Midjourney account, URLs recorded in the ledger. A style reference transfers light, grade, and texture, so those must be the brand's.
2. Style codes from a supplied project library and the official Style Explorer. In a Metamodern Agency checkout, `inspiration/midjourney-style-codes.md` is the private library when it exists. A code's version evidence travels with it; older codes may need a style-version pin.
3. A Style Creator code, only when the look is reachable no other way. Five to fifteen rounds in Draft mode; every round's code is saved on the Create page; a session cannot be reopened.

**When every approved image carries text or a logo**, make text-free masters first: a crop of the empty field, a text-free plate, or a plate regenerated without its lockup. Record the crop as the kit item with its source job, and never pass an image with a mark in it, however small.

**What a good reference looks like.** Close-ups and images with shallow focus transfer more favorably than complex scenes. A reference whose subject is light itself (an empty room, a wall, haze, a field) has little to leak. A reference's subject and props leak unless the prompt defines the subject; environmental references leak less than portraits. Never a reference with text or a logo. Keep the set in one light temperature and one genre.

**Test each candidate alone.** Run the probe set (an environment, a texture or pattern, a figure as form) with the candidate as the only reference at the default weight, plus one void prompt (punctuation only) to see what the reference encodes on its own. Keep the candidates that carry the brand's light, grade, and texture on all three probes without leaking their own subject. Only then try a pair.

**At most two references per recipe.** Three or more average into mud. Per-image weights are unverified on V8.x; until tested, prefer one reference, and when two are needed, choose them so the stronger one is the one you want to dominate.

**Modes.** One master reference per mode the brand needs (world plates, texture and pattern, editorial figure), each with its own weight band from the calibration. Record each as a kit item: id, source, role, what it must carry, weight band, style version, verified date.

## House moodboard

One board per brand, in the director's account, ten to thirty images: the approved set plus the inspected external references with roles. Use it once with `--p <board id>`; the submitted prompt shows the resolved code. Record the code, since it survives later edits and deletion of the board. Moodboards refuse `--sw` and `--sv`; their strength is `--stylize`, which also sets house-style strength, so log the stylize value next to the code every time. A moodboard gives breadth (the brand's world); a style reference gives a specific treatment (one campaign). The calibration decides which of the two carries the look for this brand, or whether both do.

Keep one board per brand. A board that mixes clients biases every client's output toward the others.

## Identity sheets

Only when the brief needs an exact object. Build one clean master sheet per object for the Edit Model: the object alone, two or three angles, on a plain field, no text. Several characters bleed into each other across separate references; merge them into one sheet. Never the wordmark. Never a real person. Describe the object in the text as well as attaching it; use `--raw` when the house aesthetic fights the reference.

## Palette swatch

A flat image of four to six color bars, no text, at least 800 px square. It is a lever for palette-dominance tests as a style reference (weight from the calibration) or as an image prompt at `--iw` 1.5 to 2 for flat graphic work. It encodes hue and nothing about how the hue behaves under light, which is why the graded approved images come first.

## Parameter policy

Set by the calibration and written as one line the paste sheet repeats:

- Version pin (`--v 8.2` today).
- `--raw` by default for photographic, campaign-still, and product registers. Off only when the brand wants the house aesthetic's energy and the calibration showed it holds the brief.
- A `--stylize` band (a low value for literal work and palette fidelity; the calibration finds the band where the reference or moodboard takes without swallowing the subject).
- `--chaos 0` and `--exp 0` for sets; chaos rises only in Draft scouting.
- `--ar` per surface, from the brand's surface list.
- A `--no` baseline in words that survive per-word moderation: single nouns for the forbidden list ("text, watermark, logo, signature, microphone"), never a phrase.
- The style weight band per kit item.

## Vocabulary sheet

Written from the brand source and from Describe:

1. **Treatment words**: light geometry (direction, hardness, fill), shot sizes, one or two film stocks or print processes that match the brand's grade, grain and grade terms, materials, surface finishes.
2. **Register words** in conduct terms (blunt, still, confident, slightly distant).
3. **Framing words** ("Campaign still", "Key visual", "Texture plate", "Editorial still").
4. **Medium anchors** for the brand's abstractions (its wave is a cloth simulation, its grid is an engraved line, its gradient is a risograph).
5. **The anti-list**: the category's stock tells and the brand's forbidden objects, as nouns.
6. **Describe's inventory**: run Describe on three to five approved images, keep the concrete nouns, light terms, and medium words that recur, strip artist names and "-core" buzzwords, and note the words Midjourney itself uses for the look. These are candidates for the text when a reference fails to activate.

## Re-validation

When the model version in the director's interface changes: run the baseline probe with no references, then each kit item alone, then the calibration grid. Record which items still carry the look, which need a style version pin, and which are retired. Every kit item carries the date it was last verified.
