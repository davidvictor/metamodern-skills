# Gate playbooks

Each playbook gives the inputs, generation plan, prompt templates, question shape, consistency screen, and lock format for one gate. Every prompt follows the anatomy in [prompt craft](prompt-craft.md): campaign still, one idea, light as subject, placement in words, palette as light, register in conduct words, references by attribute. Pull vocabulary from [the production glossary](production-glossary.md). Tool sequences are in [Higgsfield mechanics](higgsfield-mechanics.md).

## Shared question shape

Use the available structured-input mechanism with labeled options. When one is unavailable, ask the same single labeled question in text. Use one question per gate, plus a forced pair when two candidates are close.

```text
Question: Which candidate expresses the locked brief for <gate subject>?
Options:
  Keep <n>: <one sentence on what it locks>
  Reject all: <what would be regenerated and which input changes>
  Combine: refine <n> with one named quality from <m>
  Redirect: <the one alternative reading the agent considers most likely>
Recommendation: <n>, because <one sentence tied to the judging criteria>
```

Forced pair, when close: "Between <n> and <m>, which is closer to the locked brief, and what one thing makes it closer?"

## Shared lock format

```text
Lock: <gate or sub-lock name>
Images: <job ids of approved images>
Recipe: model <id>, parameters <list>, references <id: role, ...>, prompt block <verbatim>
Sentence: <one plain sentence stating what is now fixed>
Dependents: <gates or sub-locks that must be revisited if this changes>
```

## Gate A: Brief

Inputs, gathered from evidence before any question:

- Brand Platform: the accepted `BRAND.md` platform statement, quoted.
- Equity inventory: every existing identity element with `fixed` or `open`. Every `fixed` item is inspected as an image (screenshot the Figma master or open the export) and its geometry recorded in the ledger in plain words. A word in a brand document ("interrupted", "broken", "stacked") is never read as geometry; only the image is.
- Register: two to four real references, inspected, each with borrow and keep-outside lines. Search Savee first; sources named.
- Test content: one real artifact's exact text.
- Judging criteria: three to five, agreed by the director before images. Default set: expresses the platform; distinct from the named alternatives; holds under real content; producible; recognizable without the mark.
- Flaw tolerance: `photographic, low tolerance` by default; a named flaw-tolerant register only when the director chooses it.
- Tier: `normal` or `deluxe`, from the tier question when the brief has no valid recorded tier.
- Credit budget per gate, using current model costs from the toolchain check.

Question: "Approve the brief as recorded?" Options: approve; tweak one named section; stop with the brief only.

Lock: the brief itself, with the register images as the first reference set.

## Internal step: Toolchain check

Skip when a cached check exists for this register. Otherwise, per candidate model, one image:

```text
[USE] Campaign still, toolchain check, <aspect ratio>.
[IDEA] One idea: <one visual proposition from the register, with no people and no words>.
[SCENE] <one ground plane and finish, one architectural fact, nothing else>.
[SUBJECT] <one dominant form>.
[LIGHT] <one source, behavior, color as material light, where it lands, shadow falls to>.
[COMPOSITION] <placement and emptiness in words>.
[PALETTE] <two or three tones on things>.
[REGISTER] <the locked register in conduct words>.
[FINISH] <one lens, one depth phrase>.
[REFERENCES] Image 1: take its light quality, contrast, and finish only; the frame contains only <list>.
```

Judge the check on finish and light, not on the idea.

Judge only: is this beautiful and current-grade. Record the pick, the reason, and the reference roles the model accepts. The director sees the set only when two candidates are close.

## Gate B: World

Question for the gate: where does the brand live, and how does its idea become visible there? Two or three world candidates plus one far candidate and one unbriefed image. Each candidate is a pair: one wide campaign still (16:9) and one detail (4:5), built on one visual concept, with an invented stand-in figure where people belong. Generate N of each (N of 2 to 3), screen, show one pair per world.

Do not generate material or print tiles for a brand without a physical product. Color roles and type behavior are read from the world stills (how the palette appears as light and field, how scale behaves) and then set natively.

Wide still template (Nano Banana Pro and GPT Image 2; collapse to one ordered paragraph for Seedream and FLUX.2):

```text
[USE] Campaign still for <brand, one clause>, 16:9.
[IDEA] One idea: <the world's proposition in one sentence: the room as a single circle of light; a figure crossing the gap in a ring of light; a beam through a round aperture onto a stage>.
[SCENE] <the stage: ground plane and finish, one architectural fact, count of objects, what is absent>.
[SUBJECT] <the dominant form; the invented figure as a form, age, build, clothing, placed against it>.
[LIGHT] <one source, motivation, hard or soft, color as material light, where it lands, shadow falls to ink black>.
[COMPOSITION] <placement and emptiness in words; symmetry held or broken by one named thing; scale contrast literal>.
[PALETTE] <brass-gold light, ink-black ground, cream plaster, one pale blue haze, or the brand's equivalents>.
[REGISTER] <the locked register in conduct words>.
[FINISH] 35 mm equivalent, large-format clarity, fine grain.
[REFERENCES] Image 1: take its light quality, contrast, grain, and finish; the frame contains only <list>.
[KEEP OUT] No text, no logos.
```

Detail template:

```text
[USE] Campaign detail for <brand>, 4:5.
[IDEA] The same idea at close range: <the edge of the light on the wall; a hand at the gap; the haze at the circle's edge>.
[LIGHT] <as the wide still>.
[COMPOSITION] <one form fills the frame; the rest is empty>.
[FINISH] 85 mm equivalent, shallow focus, fine grain.
[REFERENCES] Image 1: light quality and finish only.
```

Stand-in figures: invented, described by age, build, hair, clothing; never a named or real person. The photography treatment for figures follows any lock carried from Gate A.

Single variable across candidates: the world. Far candidate: one world deliberately outside the register. Unbriefed: one pair the agent proposes without brief instruction, labeled.

Consistency screen: honors the register and the flaw tolerance; the mark is present only as concept.

Question: as the shared shape, subject "the world the brand lives in".

Locks: `concept`, `light`, `figure photography`, `color roles as light and field`, each in the shared format, plus the world lock sentence. Dependents: Gates C and D.

## Gate C: Mark behavior and first proof

Inputs: the real mark, uploaded once with the director's authorization, passed as `Image 1: the exact mark, preserve geometry and proportions, do not redraw`. Locked Gate B world stills passed as roles. Mark tiles follow the same art-directed discipline: the mark made visible through one action inside the locked world's light and staging, not as a product shot of an object.

Mark tiles, one action each, N of 2 per action, show the best per action:

```text
Cinematic brand campaign still. The exact mark from Image 1 made visible through one action inside the locked world: <cut as an aperture in a wall of light; wrapped as a band of light around a column; interrupted by a figure standing in its gap; stacked as three concentric circles of light receding into darkness; projected onto the far wall of the locked room; cast as a shadow across a floor; drawn as a single line of light in haze>. <Composition: the action is the dominant form, scale contrast, negative space>. <Locked light and color roles as light against darkness>. <Locked staging>. Large-format clarity.
```

Rough proof: generate one plate of the locked world composed with clean space for type, then composite the real lockup (cropped from the Figma master, never redrawn) and the real test content onto it locally, in scratch, with stand-in type. Show that. The director judges a thing the brand would ship, not a mood. Ask the plate question only after it is visible; never in text.

```text
[USE] Campaign plate for <brand> <artifact>, <aspect ratio>. The title is set later in the empty area; leave it clean.
[IDEA] The locked world composed to hold a title: <the locked form> pushed <left, right, or low>, the rest empty darkness.
[REFERENCES] Image 1 is the approved world: take its light, form, floor, haze, contrast, grain, and staging exactly. Recompose only.
[COMPOSITION] <form placement>, <emptiness placement>; nothing else in the frame.
[KEEP OUT] No text, no logos.
```

Hand test, shown as a pair: the same scene once with the mark's locked behavior and once with the mark absent, no words in either. Send both images together and ask one question: "Would you know this is <brand> without the mark?" A bare question about recognizability with nothing to compare is not understandable and is never asked.

```text
[USE] Campaign still for <brand>, <aspect ratio>. Hand test: the world without its mark.
[REFERENCES] Image 1 is the approved world: take its light, staging, haze, contrast, and grain exactly. Do not reproduce its mark; there is no mark in this image.
[SCENE] <the locked scene with one substitute form of light in the mark's place>.
[KEEP OUT] No text, no logos, no <mark form>.
```

Motion probe, `deluxe` only: three seconds from the strongest tile, one camera move (slow push, slow pan, or slow reveal), no cuts, the physical action of the mark continuing.

Consistency screen: honors register, concept, light, figure photography, and color roles.

Question: "Which physical actions are the mark's behavior?" Options list the actions shown; combine means one action refined with one quality of another.

Locks: `visual verbs` (three to five actions), and in `deluxe` `motion grammar`. Dependents: Gate D and native production.

## Internal step: Style lock

Create Reference Elements: environment from the locked room plate, prop from each locked mark tile, character from the locked stand-in. Record ids. See [Higgsfield mechanics](higgsfield-mechanics.md).

## Gate D: World assembly

Build the matrix per [content matrix](content-matrix.md). Every cell is an image plate for Figma: clean space where type and real portraits go, no text, no mockup objects. Generate one or two images per cell, screen each as it lands, and send passing cells to the director as they land when provider waits are long. Show four to six in all. Repeat the hand test as a pair on one cell. Keep the mark at scene scale in every cell; a close-range detail of the mark fails as a class. In `deluxe`, one hero clip: three to five seconds from the strongest locked still, one camera move, no cuts.

Cell prompt:

```text
[USE] <Artifact> plate for <brand>, <aspect ratio>. <What is set later and where; leave it clean.>
[IDEA] <One locked verb of the mark in this surface's context.>
[SCENE] <<<environment element>>> is the world; <<<prop element>>> is the mark's behavior; <<<character element>>> stands where a person belongs. <What changes for this context, in one clause.>
[COMPOSITION] <Form placement, emptiness placement.>
[KEEP OUT] No text, no logos, <no break in the mark's form>.
```

Consistency screen: every prior lock.

Question: "Does this world hold as one system?" Options: lock the world; lock with one named cell regenerated; reject and name the lock that failed.

Lock: `world`. Dependents: native production and every rerun.

## Reruns

A rerun regenerates one gate's cells against existing locks for new content. Review is lighter: show the set, one question, record. No new locks unless the director asks.
