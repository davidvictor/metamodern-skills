# Guide expansion

Stage 5 in full: apply a locked expression to every aspect of a brand guide, as sets rather than single tiles, and prove the set reads as one brand. Everything here starts from a lock (the board's job id, the logo media id, the preserve block, the design language) and ends in hypotheses for native production.

## The rule

One preserve block, one board reference, one aspect per tile, one wave of eight or fewer at a time. Every tile repeats the logo sentence, the one-sentence description of the locked board, "match its drawing treatment, type behaviour, colour roles, line weights, and finish exactly; do not copy its layout", and the palette. What changes per tile is only the NEW SURFACE block.

Text-bearing tiles run on GPT Image 2 with exact copy in quotes. Text-free tiles (patterns, textures, backgrounds, illustration variants) can run on GPT Image 2 with the board as Image 1, or on a second model with the board as `image_references` and the campaign-still anatomy. Hard-hex vector work runs on Recraft with `colors` and `background_color` set and `model_type` `vector`; Recraft takes no reference images, so the device is described in words.

## Aspect matrix

| Aspect | What the tile shows | Tool | Prompt notes | Screen | Native handoff |
| --- | --- | --- | --- | --- | --- |
| Colour system | Core swatches plus tint, shade, and neutral ramps, each labelled with its hex; a roles legend (field, type, signal, light) | GPT Image 2, 16:9 | Compute every ramp value locally and pass the hexes; never ask the model to derive a scale | Every printed hex equals the given value; roles legend matches the language | Colour variables per mode |
| Pattern and texture | A seamless tile built from the device; a texture family (line density, halftone, grain) | GPT Image 2 1:1 text-free with the board as Image 1; Recraft `vector` only as a vector starting point to recolour natively | "Seamless repeating pattern tile", the device's geometry in words, the palette as roles | Palette exact; tile edges continue; no text; verify hard-hex output rather than assuming provider controls held | Vector pattern component |
| Illustration treatment | The locked subject drawn in alternate treatments (halftone, flat colour, engraved, photographic) while the subject, palette, and composition hold | GPT Image 2 16:9 text-free, board as Image 1 | "Change only the treatment: <named treatment>. Keep the subject, its parts, the palette roles, and the composition identical" | Subject unchanged; palette held; treatment landed | Illustration style sheet; the accepted treatments become rules |
| Typography | A specimen sheet with the hierarchy in real copy: display, headline, subhead, body, data, label; sizes and tracking as behaviour | GPT Image 2, 16:9 | Real copy from the brand, exact in quotes; ask for behaviour, never a typeface name | Copy exact; hierarchy readable; the model's named faces recorded as suggestions only | Type scale in chosen faces |
| Backgrounds | Wide plates with the device at scene scale and clean space where type goes; light and dark | Second model with the board as `image_references`, or GPT Image 2 text-free | Campaign-still anatomy: one idea, scene, treatment, palette as roles, what is empty | No text; device whole; clean space where promised | Image layers under native type |
| Card backgrounds | Square or 3:2 plates for cards, tiles, and thumbnails; a small set with one variable (device scale, crop, mode) | Same as backgrounds, 1:1 | As backgrounds, plus "the artwork only, edge to edge, no card object, no ground", and the layer count | As backgrounds; a plate that renders as a card mockup on a ground fails | Card component image slots |
| UI fragments | Buttons, chips or result states, inputs, one card, one table row, in both modes | GPT Image 2, 16:9 | Name every element and its state words exactly; colour roles per element | Palette exact at chip scale; words exact | Components in Figma; the tile is a hypothesis only |
| Social ads | One message across the formats the brand ships: 1:1 feed, 9:16 story, 16:9 link post; then more messages | GPT Image 2 per format | Headline, support, CTA, and consequence figure exact in quotes; device placement per format; restate the headline face's width in every format | Copy exact; logo held; device and headline face consistent across formats | Templates in Figma; generated ads are comps |
| Motion frames | A still storyboard of the device's behaviour (build, reveal, resolve) | GPT Image 2, 16:9 | Name the frames and the verb of each | Device whole in every frame | Motion in the `deluxe` tier of build-brand-world |

## Set consistency

- **Contact sheet.** Assemble every tile of the run on one sheet locally and look at it as a set before showing any tile alone; drift shows at contact-sheet scale before it shows in a tile.
- **Hand test pair.** For one surface, generate the same tile with the device and without it, and ask "would you know this is the brand" as a pair. Record the director's answer rather than inferring it. If the answer is no, the device carries the identity and every surface needs it or its fragment; if yes, the language names what carries it and where the device is optional.
- **Screen table.** One row per tile: logo, palette to chip scale, copy exact, device where allowed, subject unchanged, model read back from the job record, spelling.
- **One variable per set.** Within an aspect, tiles differ by one input (format, mode, treatment). Record which.

## Waves

Eight jobs or fewer per wave. A hand-test pair depends on its first tile, so it runs in a later wave with the first tile's job id as its reference. Read the model and aspect back from every job record.

## Cost check

Read the provider's current model and credit information before the run. Estimate the proposed wave from live prices, show that estimate to the user, and record actual spend in the project ledger.
