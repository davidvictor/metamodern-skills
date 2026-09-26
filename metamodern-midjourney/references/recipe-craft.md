# Recipe craft

How to write a Midjourney recipe that produces an art-directed brand image instead of the model's average. The method uses concrete nouns, avoids unsupported hex control, anchors abstractions in a medium, keeps style words from competing with style references, and states light as direction and quality. Verify current model behavior against the official controls before relying on a version-sensitive technique.

## Anatomy

One recipe, in this order. Twenty to sixty words of description on V8; the model rewards specific description and punishes instruction language and keyword lists.

| Slot | What goes in | Example fragment |
| --- | --- | --- |
| Frame | The deliverable, first | "Campaign still", "Key visual", "Texture plate", "Editorial still" |
| Idea | One idea in one clause, from the brand's concept | "the brand's ring drawn as a hairline circle of light on a dark floor" |
| Subject and staging | Concrete nouns: the dominant form, the figure as a form, the ground plane, one architectural fact, the count of objects | "one invented woman in a dark knit stands small inside it, empty polished concrete, nothing else" |
| Light | One source, its direction, hard or soft as behavior, its color as material light, where it lands, how the shadow side falls | "one hard source from far above, brass-gold, edged shadow, no fill, everything outside the ring falls to black" |
| Placement | Where things sit and what is empty, in words, never ratios | "ring as a long ellipse across the middle, darkness above and below" |
| Color | One to three named colors on things; "-color" appended to noun-colors | "brass-gold light on dark concrete, one pale blue haze far back" |
| Finish | One shot size or format, at most one process word | "wide shot, large-format clarity, fine grain" |
| Text | Only when briefed, in double quotes, short | "with the words "OPEN"" |
| Parameters | The parameter policy plus the kit items | see below |

Then the parameters, and then nothing.

## Words that move Midjourney, by evidence strength

1. Film stock names (Portra 160, 400, 800; Ektar 100; Cinestill 50 and 800T; Velvia 50; Superia 400; HP5; Tri-X; Pan F 50): grain, contrast, saturation, vignette, cast. Some are redundant with each other.
2. `--raw`: removes the house stylization; the base for any brand grade.
3. Shot-size words (extreme close-up, close-up, medium, wide, overhead, three-quarter view, eye-level). Stronger than focal lengths, which are unreliable.
4. Concrete subject nouns and materials (recycled nylon, brushed aluminium, matte clay, wet asphalt, cream plaster). They introduce content.
5. Medium and print-process words (watercolor, gouache, block print, linocut, risograph, halftone, screenprint, cyanotype). Each carries a default palette that will fight the brand palette unless the reference carries the palette; risograph drags toward fluorescent pink and blue.
6. Unambiguous color adjectives with "-color" appended to noun-colors (teal, ultramarine, burnt-sienna-color, blush-color, sage-color, mint-color). One or two per prompt.
7. Palette-structure words (duotone, monochrome, sepia, pastel, muted, desaturated, high-contrast, limited palette). Reliable for structure, unreliable for exact hue.
8. Lighting stated as direction and quality (single hard key from camera left, no fill; backlight through haze; window light; overcast; rim light; silhouette; practical neon; dappled light). "Rembrandt" produces paintings; "cinematic lighting" and "studio softbox" pull toward poster cliché.
9. Grade and grain terms (teal and orange, bleach bypass, faded film, lifted blacks, film grain, halation, 35 mm film scan).
10. Layout template nouns (advertising template, poster, magazine cover, billboard) and concrete empty-area nouns (blank wall, empty studio sweep, blank white space on the right). "Negative space" and "leave space for text" are unreliable.
11. Editorial genre words (fashion editorial, magazine editorial, campaign still): a staging prior.
12. Numbers and collective nouns for counts.
13. Camera-body names push the photograph prior more reliably than the word "photorealism"; they carry no verified optical effect.

Words that do nothing or harm: hex codes; Pantone and RAL names; mood adjectives (elegant, dynamic, premium, modern, beautiful); abstract pattern words alone (energetic, organic, bold, wave pattern, gradient); "in the style of"; the quality boosters (8k, 4k, Unreal, Octane, masterpiece, trending on artstation); artist and photographer names, which are derivative and a rights question for the legal team.

## Stock tells to keep out of the frame

Never as the frame of a brand prompt: "photograph of", "documentary", "candid", "natural light", "soft window daylight", "realistic", "professional photo", "modern office", "team", "smiling at the camera". A plain candid-subject sentence is the stock recipe. Override every default: unspecified prompts come back centered, symmetric, smooth, evenly lit, generic.

## References in the text

When a kit item carries the look, the text names the scene and nothing about the look. If the look is not taking, add only words that match the reference (the official rule), one at a time, and record which word activated it. The prompt never says "use the reference for style"; Midjourney reads that as content.

When an image prompt is used for composition, the text still describes the whole frame; the image prompt is inspiration, and it bleeds style, so it is never paired with a conflicting style reference.

Edit Model prompts may use instruction language: "place the bottle on the black table under the ring of light, keep the label exact, match the light of the scene." Name what must not change. With a style reference or moodboard on an Edit Model job, add explicit style words; the docs say they may be needed there.

## Medium anchors for abstractions

Pure abstraction words regress to stock. Anchor every abstraction in a craft the model knows:

| Abstraction | Anchors that work |
| --- | --- |
| Gradient | risograph print gradient on cream paper; grainy noise gradient; halftone dot gradient; stacked colored glass sheets edge lit; posterized bands |
| Wave, flow | Cinema 4D cloth simulation; particle simulation; ink in glass; engraved line; long-exposure photograph; rippled satin |
| Grid, structure | engraved line on ivory; dimensioned engineering drawing; etched glass; woven textile |
| Dither, texture | risograph; halftone dots; 8-bit dither; screenprint; grainy noise |
| Light as subject | a beam through a round opening; a hairline of light on a floor; a blade of light on a table; a lit doorway |

Name the color as an ordered journey early ("from deep forest green through pale mint to cream") plus the field color, and give the palette one owner: the reference or the text, never half of each.

## The variation matrix

A set holds the kit and the parameter policy fixed and varies one axis per recipe: subject instance, time of light, scale, pattern behavior, weather, placement. Every recipe's Varies line names its base recipe and the one slot that changed; when writing a candidate changes the frame word, the object, and the view together, split it into three candidates or pick the one change that answers the cell's question. One coherent scene per recipe; alternatives are separate recipes. Where the plan allows, run an axis as one permutation job (`{a, b, c}` in the prompt, Fast mode only, cap by plan) so the set lands together. Draft mode with `--sref random` is for style scouting, never for brand sets.

## Worked examples, brand-neutral

A campaign still for a business podcast whose world is a ring of light:

```text
Recipe A.1: world plate, wide, the floor ring
Prompt: Campaign still, the brand's ring drawn as a hairline circle of brass-gold light on a vast dark polished concrete floor, one invented woman in her late thirties in a dark knit standing small inside it, one hard source from far above, edged shadow, no fill, everything outside the ring falls to black, one pale blue haze far back, ring as a long ellipse across the middle of the frame with darkness above and below, wide shot, large-format clarity, fine grain
Parameters: --ar 16:9 --v 8.2 --raw --s 50 --c 0 --exp 0 --sref <kit S1> --sw 150 --no text, logo, watermark, gap
References: S1, the locked hall plate, carries light quality, grade, and grain
Record back: job id, resolved prompt, seed, image URLs
```

A texture plate for a market-information brand whose device is stacked layers:

```text
Recipe T.3: texture plate, stacked layers as strata
Prompt: Texture plate, seven stacked translucent sheets of pale paper seen edge-on in a sectioned side view like strata, one thin ultramarine-color line tracing from the fifth layer down to the base, white field, black hairline rules, dimensioned engineering drawing on ivory, overhead light, no shadow, flat and exact, fills the frame edge to edge
Parameters: --ar 16:9 --v 8.2 --raw --s 30 --c 0 --exp 0 --sref <kit S2> --sw 100 --no text, logo, watermark, car
References: S2, the locked expression board, carries line weight, paper, and palette
Record back: job id, resolved prompt, seed, image URLs
```

An editorial figure as form, for a campaign that keeps people small and still:

```text
Recipe F.2: figure as form, the doorway
Prompt: Editorial still, an invented man in his fifties in a charcoal coat standing still in a lit doorway at the far end of an empty ink-black corridor, tungsten-amber light spilling from the doorway across a wet concrete floor, no fill, figure small at the center of the frame with darkness on both sides, medium-format look, fine grain
Parameters: --ar 4:5 --v 8.2 --raw --s 80 --c 0 --exp 0 --p <house code> --no text, logo, watermark, microphone
References: house moodboard H1 carries the world; no style reference
Record back: job id, resolved prompt, seed, image URLs
```

Substitute the real brand's locked geometry, palette, and kit items. The examples fix the shape, never the content.

## Refinement

When a shown image has the right idea and one wrong quality, refine rather than regenerate: Vary Subtle for a single element, Vary Strong for right concept wrong execution, the Editor's Smart Select and Retexture for one region or one material, the Edit Model with the image as the first reference and "keep composition, subject, and framing identical; change only <one named quality>". Two refinements per index at most. Regenerate only when the idea is wrong. Fix language: light flat, add one hard directional source and let the shadow fall to black; plastic surface, add real micro-texture and fine grain; stock feel, add the idea, the dominant form, and the light as subject; drift from palette, name the tone to bring forward and the tone to reduce, or lower stylize.
