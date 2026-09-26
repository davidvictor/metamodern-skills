# Prompt blocks

Templates for every generation in the method. GPT Image 2 reads labeled blocks well; keep the block names, keep exact copy in quotes, and repeat the PRESERVE block verbatim on every call.

## PRESERVE block (written once at Stage 1, repeated on every generation)

```text
PRESERVE. Image 1 is the approved logo of "<BRAND NAME>": <one clause describing the mark and the wordmark's weight relationship>, shown on <the backgrounds in the sheet>. Image 1 is a reference for the logo and its exact colors only, not a layout to copy. Reproduce the logo exactly wherever it appears; never redraw, restyle, recolor, or distort it. The wordmark is artwork and is never typeset; any headline face is for headlines only. Palette is fixed: <name #hex>, <name #hex>, <name #hex>; nothing else<, no red, no green when a prior lapse needs closing>. The brand is <category in one sentence>. Audience: <who decides>. Character: <five conduct words>. Create a square high-end brand identity guideline board as a polished modular grid of tiles: <enumerated tiles, identical across the brand's sheets>. All text crisp and correctly spelled; keep words to the brand name, short labels, and plausible headings. The expression name and the visual verbs below are internal labels that describe behaviour and never appear as words on the board. <Imagery rules: No people. No cars, no vehicles, no machine parts.> No stock photography, no clip-art icons, no watermark.
```

Additions that closed observed failures: "the wordmark is artwork and is never typeset" (a poster lineage had re-set the name); "the expression name and the visual verbs ... never appear as words" (names and verbs had printed as taglines); "no red, no green" after a red UI label survived a three-colour rule.

## EXPRESSION block (Stage 3, distinct bets or distance scale)

```text
EXPRESSION: <NAME>. Thesis: <sentence>. Tension: <adjective> but <counter>. Lineage: <two or three genres>. Visual verbs: <three to five>. Colour roles: <field, type, signal, light or ink, proportion rules>. Typography: <behaviour>. Composition: <density, grid, scale contrast>. Imagery: <treatment>; <subject>. Materiality: <surfaces>. Reject the category's defaults: <list>. Failure to avoid: <one sentence>. Premium case-study presentation, like a real top-tier design studio case study rather than <the generic version of this category>.
```

## Matrix blocks (Stage 3 when axes are opened)

```text
TREATMENT: <held treatment in full>.
MODE: light. White is the field, black is the type and the line, <signal colour> only as <roles>, never a fill larger than a swatch.
MODE: dark. Near-black is the field, white is the type and the line, <signal colour> only as <roles>; drawings are white hairlines on black like a blueprint negative, no glow.
DEVICE: restrained. One thin <device> crosses <named applications> only; never the logo tile, never the app icon, never the dashboard.
DEVICE: structural. The mark's <geometry> organises the whole board: tile boundaries, content blocks, and image crops are cut on <the angle>; the logo tile and the app icon stay rectangular and untouched by any line; all type stays horizontal.
SUBJECT: <the drawn object in full, with what is labelled, sectioned, and called out>. Failure to avoid: <this subject's failure>.
```

Within one matrix, prompts differ only in the opened blocks.

## System line (Stage 3c, the line that made a subject into a system)

```text
The pattern system, the banner, the report cover, and the motion frames reuse the <device drawing> and the <traced line>.
```

## REFINE block (Stage 4)

```text
Image 2 is the approved base board for this brand: <one sentence describing it>. REFINE Image 2. Keep its layout, tile positions, field, colour roles, <drawings>, and all its words identical. Change only these <n> things. Change one: <named change, with where it goes>. Change two: <...>. <Change n: the screen fix, such as "the red label becomes blue".> The device never crosses the logo tile or the app icon. Nothing else changes. The words REFINE and the change list are instructions and never appear on the board.
```

Subtractive form:

```text
REFINE Image 2. Keep everything identical: <list>. Remove only <the element>; leave clean <field> where it was. Nothing else changes.
```

## NEW SURFACE block (Stage 5 on GPT Image 2)

```text
Image 2 is the locked brand identity board: <one sentence naming treatment, device, colour roles, type behaviour>. Match Image 2's drawing treatment, type behaviour, colour roles, line weights, and finish exactly. Do not copy Image 2's layout; it is a reference for the system only. NEW SURFACE: <a website hero section, 16:9, at full size>. <Placement of logo, headline reading exactly "<COPY>", support line reading exactly "<copy>", button reading exactly "<label>">. <The device drawing and its exact consequence label>. <Device placement.> No people, <category bans>, no stock photography, no gradients, no glow, no watermark. All text crisp and correctly spelled.
```

## Text-free key visual (Stage 5 on a second model, board as `image_references`)

Use the campaign-still anatomy from `metamodern-build-brand-world`: one idea in one sentence; the scene with what is present and absent; the drawing or light treatment; palette as roles; "Image 1 is the approved brand board: take its line weight, drawing treatment, colour roles, and finish only; do not reproduce its layout, tiles, logo, or words"; then a short keep-out ("no text, no letters, no logos, no numbers"). Blank callout leaders in the result are correct; type is set natively.

## Without-logo variant (Stage 3 when no mark exists or the director wants invented marks)

Replace the Image 1 sentences with "Include logo explorations and wordmark studies for "<BRAND NAME>"" inside the tile list. The model invents a mark in the named design language; treat it as a hypothesis for native design, never as the mark.
