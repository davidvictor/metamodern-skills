---
name: metamodern-build-brand-world
description: Use when the user wants to develop, explore, lock, assemble, rerun, or review a brand's visual world with image generation under director approval, including the brand's world, mark behavior, world assembly, and motion tiers, before native Figma production.
---

# Metamodern Build Brand World

## Purpose

Develop a brand's visual world one approval at a time, in the order brands are built. Turn an accepted Brand Platform and existing equity into a locked world, locked mark behavior, and an assembled world, then hand native production to Figma with a runnable recipe. Generation supplies art-directed campaign stills: one idea per image, composed, with light as the subject. Exact marks, typography, and layouts are built natively.

The designated creative director is the only taste authority. The agent proposes, generates, screens, records, and asks. It never selects on the director's behalf outside explicit `autonomous` mode.

## Choose the requested outcome

Classify the request before starting a gate. A `review` inspects supplied or recorded world material, locks, recipes, and evidence and reports what holds, what does not, and the next material gap. It does not open a new ledger, choose a tier, upload, generate, or ask a director-gate question unless the director asks to change or create something. A `creation` develops a new or materially changed world through Gates A through D. A `rerun` regenerates a named gate or content cell against valid existing locks.

Use an accepted brief, recorded tier, approved images, recipes, and locks already supplied or found in the project; resume at the earliest material gap. Do not re-run an accepted gate merely to reconstruct it. If an input that owns a lock has materially changed, name the affected dependents and return to that gate before relying on downstream work.

## Establish authority

For creation or a rerun, read the project's current instructions, accepted brand authority, and any local governance or language guidance. Do not assume private Metamodern Agency files are available. Read the provider routing and model prompting guidance kept with `metamodern-explore-brand-expression`. Treat existing logos, colors, portraits, and prior generations as evidence until the brief fixes their authority.

Creation and reruns require an accepted Brand Platform. If it is absent, state `Brand Development required` and route to `metamodern-develop-brand`. Do not start Gate A or generate without it. A review may inspect supplied evidence and report that this authority is missing; it does not create or route work unless the director asks to continue into creation.

Generation runs on Higgsfield MCP tools only. Read [Higgsfield mechanics](references/higgsfield-mechanics.md) before the first tool call. If those tools or an authorized workspace are unavailable, report that prerequisite and continue only with review or preparation that does not require generation. Midjourney is an instrument the user operates in their own account; its method is `metamodern-midjourney`, and the boundary with this package is in [Midjourney instrument](references/midjourney-instrument.md). It is never part of the automated chain.

## Choose the tier for a creation run

After establishing authority, ask one tier question with labeled `normal` and `deluxe` options only when a new creation run has no valid recorded tier. Use the available structured-input mechanism; when one is unavailable, ask the same short labeled question in text. A rerun uses its recorded tier unless the director changes it; changing it reopens the affected motion scope.

- `normal`: stills only. No video generation anywhere in the run. The Gate C motion probe, the Gate D hero clip, and the motion application test are skipped.
- `deluxe`: adds motion. Gate C includes a three-second motion probe and locks motion grammar. Gate D includes one hero clip from the strongest locked still.

That is the only difference between tiers. The reason is cost: the whole system must be testable many times without video. Record the tier in the ledger and repeat it in every gate recap. Never infer the tier.

## Director-gate contract for creation and reruns

Every director gate has the same shape. Do not skip a step to save time.

1. **Recap.** Restate the brief line, the tier, the lock chain so far, and the judging criteria before any image appears. Then say in plain words what the images about to be shown will become and what a choice commits (which artifacts get built on it, what gets placed into it natively). A gate whose purpose is not visible to the director is abstract, and abstract gates stall.
2. **Feedforward.** Show the recipe (model, references with roles, prompt block) and the credit cost. Ask whether the gate is worth its credits before new or changed spend. For a rerun whose exact gate, recipe scope, and budget the director has already authorized in this session, record that authorization and proceed; still stop for any new director taste-lock decision.
3. **Generate many, show few.** Generate N candidates. Run the consistency screen. Show two to four (four to six at Gate D). Keep every discard visible in the ledger with its screen result.
4. **Single variable.** Within one shown set, candidates differ by one input. Record which reference steered what.
5. **One far candidate and one unbriefed image** per gate, labeled as such.
6. **One question.** Labeled options: keep, reject, combine, redirect. Never ask a composition or layout question in text; build the rough proof (plate plus lockup plus real content, composited locally) and show it, then ask. When two candidates are close, add a forced pair: which is closer to the locked brief, and what one thing makes it closer. State a recommendation. Ask whether the candidate expresses the brief, never whether it is liked.
7. **Verbatim record.** The director's words go into the ledger unedited.
8. **Lock.** Approval writes three things together: the approved image ids, the exact recipe that produced them, and one plain sentence. Prose alone is never a lock.
9. **Choose, then refine.** "Combine" is a refinement request against one winner. No merged images. No decoy option.

Consistency screen, from Gate B onward and before the director sees anything: for each prior lock, does the candidate still honor it, yes or no. A failing candidate is discarded and logged.

Reference discipline, every generation: every passed reference carries an explicit role in the prompt; at most four active references; crop or drop a contaminating reference before adding a negative instruction; when drift appears, re-anchor on the closest approved image.

Send every shown image into the chat as a file. Links alone do not render for the director.

## Gates

Read [gate playbooks](references/gate-playbooks.md) for inputs, prompt templates, question shapes, and lock formats.

### Gate A: Brief

No generation. For a new or invalidated brief, collect from evidence, not interview: Brand Platform, equity inventory with each item marked fixed or open and every fixed item inspected as an image (open the master in Figma or the exported file, never describe a mark from a document's wording), register locked from two to four real inspected references (search Savee first), the real test content, three to five judging criteria the director agrees to before seeing images, flaw tolerance (photographic low tolerance by default), tier, and the credit budget per gate. Open `brand-world.md` from [the ledger template](references/ledger-template.md). The director approves the brief. Reuse an accepted brief while its inputs remain valid.

### Internal step: Toolchain check

Cached per register, not per brand. One text-free, logo-free image per candidate model on the locked register with one craft reference. The director sees it only when the choice is ambiguous; otherwise record the pick and reason. Consistency runs on Reference Elements.

### Gate B: World

Two or three world candidates, each answering one question: where does this brand live, and how does its idea become visible there? Each candidate is a pair of art-directed campaign stills (one wide, one detail) built on one visual concept, with a stand-in figure where people belong. Candidates differ by one input: the world. Material and print tiles (color as material, print specimens) are used only for brands with a physical product; for a media or service brand they read as skeuomorphism and are not generated. The director picks one world. Sub-locks record the concept, the light, the photography of figures, and the color roles as they appear in light and field. One revisit of a Gate B sub-lock is allowed later in the run.

### Gate C: Mark behavior and first proof

The real mark passed as a role-labeled input, never described. Each tile shows the mark made visible through one action inside the locked world's light and staging: cut, wrapped, interrupted, stacked, projected, cast as shadow, drawn in light. Plus one rough proof (a plate with the real lockup and real content composited locally so the director judges a thing the brand would ship), one hand test shown as a with-and-without pair (the same scene with the mark and without it) asked as "would you know this is the brand", and, in `deluxe` only, one three-second motion probe. The director locks three to five visual verbs, and in `deluxe` the motion grammar.

### Internal step: Style lock

Consolidate the approved set into Reference Elements: an environment element for the room, prop elements for approved mark tiles, character elements for the stand-in cast. Record element ids in the ledger. Required before `autonomous` mode.

### Gate D: World assembly

A content matrix of surfaces, contexts, and moments drives generation; see [content matrix](references/content-matrix.md). Cells are image plates for Figma (clean space where type and real portraits go), never mockups of objects. Screen against every lock, show passing cells as they land, four to six in all, and repeat the hand test as a pair. In `deluxe`, add one hero clip from the strongest locked still. The director locks the world.

### Native production and handoff

`metamodern-work-in-figma` builds the exact lockup, type, and application tests over generated worlds as image layers: podcast cover or equivalent hero artifact, 16:9 graphic, portrait treatment, information-heavy composition, social quote, and in `deluxe` motion. `metamodern-explore-brand-expression` extracts design language from the locked world. The handoff also contains the runnable recipe: prompt bank per gate, reference set with roles, model choices, element ids, and the standing rules distilled from the ledger.

## Modes

| Mode | Behavior | Unlock condition |
| --- | --- | --- |
| `gated` | Four director stops; feedforward before each; one revisit of a prior lock per run; at most two director gates per session | default for creation |
| `autonomous` | Runs Gates B through D and presents the per-gate chain for one review at the end | a completed gated run for the brand, a style lock, and a recipe that reproduced a locked gate once |
| `rerun` | Regenerates one gate against existing locks with lighter review | any existing lock |
| `review` | Inspects the existing brief, locks, imagery, and ledger and reports the next material gap | no generation or new lock requested |

`autonomous` never changes the brief or the register without returning to `gated`.

## Ledger

One `brand-world.md` per brand in the brand's project directory, built from [the ledger template](references/ledger-template.md). Per gate: tier, status, recipe, generated set with discards and screen results, shown set with far and unbriefed candidates labeled, the director's verbatim words, the lock, invariants passed downstream, standing rules distilled from feedback. Changing a lock invalidates only its dependents; the ledger lists them. Job ids and recipes are stored; generated images are not stored in Git.

## Prompt discipline

Read [prompt craft](references/prompt-craft.md) before writing any generation prompt. It holds the anatomy, the vocabulary, the reference rules, the craft anchors, and worked examples. The rules that never bend:

- Frame the deliverable, not the medium. Open with "Campaign still", "Key visual", or "Campaign plate". Never open with "Photograph of" or "Documentary photograph of"; a prompt that names a record produces a record.
- One idea per image, stated in one sentence with no lists, before anything else. The identity enters as concept (the mark as light, shadow, aperture, path), never as a logo.
- Light is the subject: one source, its motivation, hard or soft as behavior, its color as material light, where it lands, how the shadow side falls.
- Composition as placement and emptiness in words: what sits where, what is empty, symmetry held or broken by one named thing, scale contrast stated literally. No ratios.
- Stage, do not document: name the ground plane, one architectural fact, the count of objects, and what is deliberately absent.
- Palette as light on things, never bare adjectives, never hex until native production (FLUX.2 excepted, tied to a named object).
- Register in conduct words (blunt, still, confident), not mood adjectives (beautiful, premium, professional).
- One lens, one depth-of-field phrase, at most one film character.
- References: content from the text; enumerate the attributes to take from each reference; describe the frame exhaustively so nothing leaks; then a short exclusion. Two references is the sweet spot, four the ceiling, same light temperature and genre, no still lifes for scenes, nothing with text or logos.
- Photographer and cinematographer names are internal lookup keys only; their descriptors go in the prompt, never the names.
- At most five words on any image. The real mark appears only as a labeled input at Gate C.
- Vary one input between candidates in a set. Refine a right idea with one wrong quality; regenerate only when the idea is wrong.
- Rendering the identity as physical objects (cards, bars, swatches) is skeuomorphism for any brand without a physical product. Do not do it.
- Keep a mark rendered as light at scene scale. At close range a line of light turns into inlay, wire, or paint, a material; the detail cell fails as a class when the mark is the subject.

## Guardrails

- No real person is ever a generation input, in any mode. Portraits of real people are placed natively.
- The wordmark is never generated. Deterministic compositing in Figma for flat surfaces.
- Uploads of Figma assets to Higgsfield require the director's authorization per run and are logged.
- Customer-facing AI language follows the project's approved policy. If no policy is supplied, do not invent one or make disclosure claims on the user's behalf.
- Generated images are evidence until locked, never production assets.
- Two concurrent agents may work the same brand; each records under its own heading and never overwrites the other's locks.
- Midjourney runs only in the user's own account through `metamodern-midjourney`, which records every recipe and resolved code. Do not use pooled accounts, unofficial APIs, or proxy services.

## Closeout

A review returns findings without filing brand facts or method changes. At the end of an authorized creation or rerun, separate brand facts from method lessons. Brand facts go to the brand's `brand-world.md` and `BRAND.md`. Method lessons that survive this case and one materially different case may be proposed as corrections to this package or to `metamodern-explore-brand-expression`, reported to the director before any change to a shared skill.
