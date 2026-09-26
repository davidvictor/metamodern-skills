# Prompt craft for brand-world stills

How to write a prompt that produces an art-directed campaign still instead of a stock photograph. The method synthesizes vendor guidance, Higgsfield's production workflow contract, and practitioner testing without including client material.

## The rule in one line

Frame the deliverable, not the medium. Open with "Campaign still" or "Key visual", never with "Photograph of" or "Documentary photograph of". A prompt that names a record produces a record.

## Anatomy of a brand-world prompt

Write it as labeled sections for Nano Banana Pro and GPT Image 2. Collapse the same content into one ordered paragraph for Seedream and FLUX.2, subject and light first, because those models weight early words. Forty to one hundred words of content; structure is fine, keyword soup is not.

```text
[USE] Campaign still for <brand, one clause on what it is>, <aspect ratio>.
[IDEA] One idea: <the single visual proposition, one sentence, no lists>.
[SCENE] <The stage: one ground plane and its finish, one architectural fact, count of objects; what is deliberately absent>.
[SUBJECT] <The dominant form, and the figure if any, as a form: invented, described by age, build, clothing; small or large against the form; where it stands>.
[LIGHT] <One source; its motivation; hard or soft as behavior; its color as a named material light; where it lands; how the shadow side falls>.
[COMPOSITION] <Placement in words, not ratios: what sits where, what is empty; symmetry held or broken by one named thing; scale contrast stated literally>.
[PALETTE] <Two or three named tones tied to things: brass-gold light, ink-black ground, cream plaster, one pale blue haze>.
[REGISTER] <Attitude words that describe conduct, not mood: blunt, still, confident, slightly distant; the locked register named in plain words>.
[FINISH] <One lens, one depth-of-field phrase, at most one film character: medium-format look, fine grain, faint blue cast in shadows>.
[REFERENCES] Image 1: <role and the attributes to take>. Image 2: <role>. <Exhaustive positive frame that leaves the reference nothing to leak>.
[KEEP OUT] <Short, only after the positive frame: no text, no logos; on GPT Image 2 explicit exclusions are honored; on Nano Banana Pro and FLUX.2 prefer positive framing>.
```

Every section is filled with concrete nouns and behaviors. No section is filled with an opinion adjective.

## What the shipped campaigns share

Every published brand campaign made with generative models that a creative director would call art-directed shares eight traits, and every named failure lacks them (Base Design for La Monnaie, Magpie for Lyaness, OHMY for amra, Under After for Reasoning, Pentagram for Performance.gov, Coca-Cola 2025, Heinz; failures: Mango Teen, Coca-Cola 2024, faked photojournalism generally).

1. The prompt starts as a line of strategy, then its staging. La Monnaie prompted one-line plot spoilers; Lyaness prompted drink narratives; amra prompted a metaphor. For a brand world, the idea sentence comes from the platform or the real content (an episode's anchor line), not from a scene.
2. One graphic device per image, named: a silhouette against one luminous field; one form at impossible scale; mirror symmetry; motion blur against a fixed grid; a crop that breaks the frame.
3. Light is the subject and carries the palette: a single colored source, a field it lands on, a figure at its edge.
4. A register other than documentary is declared: campaign still, constructed still life, hyper-real and slightly illustrated, or the model's look kept on purpose when the brief allows it. Faked photojournalism is the common trait of the failures.
5. References carry style; words carry the event. Six to twelve coherent references in the library, two to four per call, and a reference is removed the moment it leaks a cast or an object.
6. Identity lives in concept, palette, and the type container. No logo is generated; negative space is reserved for the wordmark as part of the composition.
7. Volume, then curation, then finishing. No published case delivered raw generations: an edit pass repairs single objects, then upscale, then grade. Higgsfield's upscale and background tools serve this step.
8. The stock tells are banned outright: eye-level mid-distance, even daylight, people smiling at tables, office interiors.

## What each section must do

**Use.** The intended deliverable and audience. Models pick their polish mode from this. "Campaign still for a business podcast whose audience is senior brand leaders" is a different render from "photo".

**Idea.** The single-minded proposition, the way a campaign brief states it. One sentence, no commas or lists. If the idea cannot be said in one sentence, the image has two ideas; split it. The identity enters here, as concept (the mark's form drawn by light on a floor or a wall), never as a logo. The concept must match the real mark's geometry as inspected at Gate A, not a word from a brand document.

**Scene.** Stage, do not document. Name the ground plane and its finish (cream plaster, black glass, seamless), one architectural fact (one round opening high in the left wall), and count the objects (one table, nothing else). Say what is absent in positive terms (an empty wall) so the model and any reference have nothing to fill.

**Subject.** One dominant form. The figure, when present, is a form in the composition: invented, described by age, build, hair, and clothing, never a real person, and placed relative to the form (small at the lower edge of the circle, half inside the light). Silhouettes and half-lit figures sidestep face-realism problems and read as campaign work. Keep the mark's form at scene scale: when a line of light becomes the close-range subject, the model renders it as inlay, wire, or paint.

**Light.** The section with the largest effect on quality. Give the source (a beam through a round opening; one overhead key), its motivation, its behavior (hard, edged shadow; soft, wraps), its color as material light (brass-gold, pale blue), where it lands, and how the shadow side falls (falls to ink black). "No fill" is a behavior, say it. Warm key against cool ambient is the most reliable color-temperature move.

**Composition.** Placement and emptiness, in words. "Subject small at the lower right, upper two-thirds empty wall." Symmetry held, or broken by one named thing. Scale contrast stated literally (a tiny figure against a vast circle). Numeric ratios and complex three-dimensional relations are not honored; do not write them.

**Palette.** Color lives on things: brass-gold light on cream plaster, ink-black surround, one pale blue haze far behind. Never bare "vibrant" or "high contrast". Hex codes only on FLUX.2 and only tied to a named object; nowhere else until native production.

**Register.** The locked register in plain conduct words: blunt, still, business made visually alive; editorial scale; one source, no fill. Attitude words work ("still, confident, slightly distant"); mood adjectives do not ("beautiful", "premium", "professional").

**Finish.** One focal length, one depth-of-field phrase, at most one film character, and only when its known bias is wanted. Medium-format look means shallow focus and a quiet background. GPT Image 2 reads camera specs loosely; keep them light there.

**References.** Each reference gets one job and a list of attributes to take. Then describe the whole frame exhaustively so the reference has nothing to leak. See the reference section below.

**Keep out.** Short and last. Exclusion alone does not prevent leakage or emptiness; the positive frame does that. Do not end a prompt with "no words, no marks, no logos" as the only description of what the image is.

## Words that produce stock photographs

Never use these as the frame of a brand-world prompt: "photograph of", "documentary", "candid", "natural light", "soft window daylight", "natural color", "realistic", "professional photo", "modern office", "team", "conversation", "beautiful", "stunning", "premium" as a bare adjective, "8k", "masterpiece", "trending". Unspecified prompts default to centered, symmetric, smooth, evenly lit, generic. Every one of those defaults must be overridden by a concrete choice.

## Words that move an image toward campaign work

"Campaign still", "key visual", "one idea", "one source, no fill", "hard edge", "falls to ink black", "single blade of light", "hairline ring of light", "generous negative space", "empty plaster wall", "tiny figure against a vast form", "symmetry broken by one thing", "heightened staging", "editorial scale", "blunt hierarchy", "still, confident, slightly distant", "medium-format look, fine grain", "faint blue cast in the shadows", "light as the subject".

## References: three layers, in order

1. **Content comes from the text.** The scene is written exhaustively; the reference never supplies subject matter.
2. **Enumerate what to take.** "Image 1: take its light quality, palette, contrast, grain, and finish" beats "use Image 1 for style". Naming attributes is the layer that carries.
3. **Leave nothing to leak.** Describe what is in the frame and what is deliberately absent ("an empty plaster wall, one figure, no furniture, no objects"). Only then add a short exclusion ("do not reproduce Image 1's objects, people, text, or composition").

Two references is the working default; four is the ceiling. References should share light temperature and genre. A still-life reference can leak objects into a scene with people. A reference whose subject is light itself (an empty room, a wall, haze) has less subject matter to leak. Never pass a reference containing text or logos; they may be reproduced.

Approved images from the same brand are the strongest references for coherence: "Image 1 is an approved image from this campaign. Match its light quality, palette, contrast, grain, and heightened staging. Do not reproduce its room, opening, circle, or figure. New image: <exhaustive scene>."

## Craft anchors

Photographer and cinematographer names are lookup keys for the agent, never words in a prompt: living names are blocked or flaky in the models and carry policy risk, and unknown names are ignored. Read the descriptor, put the descriptor in the prompt.

| Genre | Anchor keys (internal) | Descriptors that go in the prompt |
| --- | --- | --- |
| Cinematic narrative still | Crewdson, Erwin Olaf | staged tableau, single motivated source, figures held still, controlled darkness, large-format clarity |
| Atmospheric refined | Kander | restrained color, haze, distant figure, quiet vast field |
| Surreal high-concept | Kretschmer, Tilley, Tim Walker | one impossible fact rendered with real materials, committed fully, sculptural geometry |
| Abstract brand mood | Tillmans, Kleiner | light play, gradient of real light on a surface, color blocking, no product |
| Blunt editorial | Businessweek cover practice under Turley | image and type on one layer at page scale, business made visually alive, one idea per cover |

Pick anchors that share a sensibility; never mix surreal with clean or dark with bright in one prompt.

## Craft reference leads

Inspect the actual image before using any of these as a reference, and record the inspection in the ledger. Leads, not approvals:

- Silhouette against one luminous field: OHMY's amra beacon imagery (Creative Boom coverage, 2026). Maps to a brand world as an ink-black figure against a brass-gold field.
- One form at impossible scale in an impossible environment: Enter The Void's underwater desert hotel for Valentino (2025).
- Symmetry as the whole idea: Thomas Albdorf's mirrored planes for Valentino (studio work, not generated; a staging reference).
- Abstract world derived from copy, cropped to break the frame: Magpie's Lyaness imagery (Creative Boom coverage).
- The brand's own approved images, once a gate is locked, are the strongest references for coherence; their job ids live in the brand's ledger, not here.

## Per-model notes

- **Nano Banana Pro**: labeled sections or narrative prose both work; state the use; positive framing; up to fourteen references but two to four is right; reasons before rendering, so the idea sentence matters.
- **GPT Image 2**: labeled segments with line breaks; state the use; explicit exclusions are honored; repeat the preserve list on every iteration; camera specs read loosely.
- **Seedream 4.5**: one ordered paragraph, subject and light first, thirty to one hundred words; numbered image references; keep reference styles consistent.
- **FLUX.2**: front-load what matters; no negative prompts at all; hex codes tied to objects if needed; JSON form available for repeatable structure.
- **Midjourney (the director's session only)**: strip style words when a style reference carries the look; `--raw` and low `--s` so the reference wins.

## Refinement pass

When a shown image is right in idea and wrong in one quality, refine instead of regenerating: reference the latest completed job of the same index, keep composition, subject, and framing identical, and change one named quality. Fix language: light flat, add one hard directional source and let the shadow side fall to black; plastic surface, add real micro-texture and fine grain; stock feel, add one narrative cue and one deliberate asymmetry; AI sheen, film grain and micro-imperfection; drift from palette, name the tone to bring forward and the tone to reduce. Two refinements per index at most.

## Worked examples, brand-neutral

Register for the examples: blunt editorial. Palette as light: brass-gold light, ink-black ground, cream plaster, one pale blue haze. The mark in the examples is a thin whole ring; substitute the real mark's inspected geometry.

**The mark as light, Nano Banana Pro:**

```text
[USE] Campaign still for <brand>, a <one clause on what it is>, 16:9.
[IDEA] One idea: the brand's ring drawn as a complete hairline circle of light on the floor of a vast dark hall.
[SCENE] A vast empty hall with a dark polished concrete floor and no visible walls; nothing in it but the light and one person.
[SUBJECT] One enormous thin ring of brass-gold light lies on the floor, whole; an invented woman in her late thirties, close-cropped hair, dark knit, stands small inside it.
[LIGHT] One hard source from far above throws the ring; edged shadow; no fill; everything outside the ring falls to ink black; a faint pale blue haze hangs in the far distance.
[COMPOSITION] Camera low and frontal so the ring becomes a long ellipse across the middle of the frame; the figure a small vertical mark inside it; empty darkness above and below.
[PALETTE] Brass-gold light on dark concrete, ink black, one pale blue haze.
[REGISTER] Blunt, still, editorial scale; one source, no fill.
[FINISH] 35 mm equivalent, large-format clarity, fine grain.
[KEEP OUT] No text, no logos, no gap or break in the ring, no wide band of light.
```

**The conversation as a campaign still (replaces a documentary room), Nano Banana Pro:**

```text
[USE] Campaign still for <brand>, 16:9.
[IDEA] One idea: two people, one table, one blade of light between them.
[SCENE] An empty ink-black room; a long black table runs edge to edge across the lower third; nothing else on it but one cream ceramic cup.
[SUBJECT] Two invented people, a woman in her late thirties and a man in his fifties, sit at opposite ends, far apart, leaning in toward each other.
[LIGHT] One hard blade of brass-gold light from directly above strikes the empty center of the table between them; their faces catch only its edge; no fill; the room falls to black.
[COMPOSITION] Symmetrical across the table, broken by one thing: the cup pushed off-center toward the woman; the light is the dominant form.
[PALETTE] Brass-gold light on black, cream cup, faint blue cast in the shadows.
[REGISTER] Blunt, still, editorial scale; a magazine cover's stillness.
[FINISH] 35 mm equivalent, medium-format look, fine grain.
[REFERENCES] Image 1: take its light quality, contrast, and finish only; the frame contains the table, the two figures, the cup, and the blade of light.
[KEEP OUT] No text, no logos, no laptops, no microphones.
```

**The same conversation for Seedream 4.5 (one paragraph):**

```text
Campaign still for a business podcast, 16:9. Two invented people at opposite ends of a long black table leaning in, one hard blade of brass-gold light from directly above striking the empty table center between them, faces catching only its edge, ink-black empty room, a single cream cup off-center toward the woman, symmetry deliberately broken, no fill, editorial scale, medium-format look, fine grain, cool blue cast in the shadows. Image 1 supplies light quality and finish only; the frame contains the table, two figures, the cup, and the light.
```
