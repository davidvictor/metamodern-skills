---
name: metamodern-explore-brand-expression
description: Use when the user wants to explore, vary, compare, refine, expand, lock, or review a brand's visual direction or expression, including brand-guide visuals, identity boards, territories, moodboards, styles, looks, and variations. It develops accepted brand facts into generated guideline boards on Higgsfield and hands locked direction to Figma.
---

# Metamodern Explore Brand Expression

## Purpose

Turn a fixed identity into a chosen visual expression and an expandable brand guide, one director gate at a time. The method holds the brand still (logo as an image input, exact palette, brand facts, exact copy, board contents) and varies one coherent expression per board, so the director judges real alternatives rather than a shuffle of the same defaults. It replaces the earlier visual-direction skill, which produced interfaces and polished generic boards because it briefed with adjectives and let the model invent the identity.

The designated creative director is the only taste authority. The agent proposes, generates, screens, records, and asks. It never selects on the director's behalf.

The method was refined through repeated expression runs and preserves the reusable process without including client evidence.

## Choose the requested outcome

Use an `expression run` when the user asks to create, vary, refine, expand, or lock visual direction. Use a `review` when the user asks for critique, comparison, audit, or advice about supplied boards, imagery, or a locked expression. A review inspects and reports against the accepted brief and failure lines; it does not start Stage 1, upload, generate, open a new ledger, or ask a director-gate question unless the user asks to change or create expression work.

Reuse the accepted PRESERVE block, expression sheets, locked board, recipe bank, and current ledger when their inputs remain valid, and resume at the earliest material gap. A material change to brand facts, fixed identity, imagery rules, or a locked expression reopens the stage that owns it and its dependents. A no-logo expression run remains available when an accepted Brand Platform exists: its without-logo variant treats proposed marks as hypotheses and leaves the real mark for native design.

## Establish authority

Read the project's current instructions, accepted brand authority, and local governance or language guidance when those files exist. Do not assume private Metamodern Agency files are available. Treat every logo, colour, typeface, prior board, and prior generation as evidence until intake fixes its authority.

Require an accepted Brand Platform (foundation, audience, position, character) for an expression run. If it is absent, state `Brand Development required` and route to `metamodern-develop-brand`; do not invent brand facts to fill a preserve block. When the identity itself is missing (no logo), the explicitly requested without-logo variant lets the model propose marks as hypotheses, and the real mark is designed natively afterward.

Generation runs on Higgsfield MCP tools only. Read [Higgsfield routing](references/higgsfield-routing.md) before the first tool call.

## The seven stages

Each stage has an input contract, a tool, an output, and one director gate. Read [stage playbooks](references/stage-playbooks.md) for the full contract, prompt blocks, screen checklist, and lock formats. The short form:

| Stage | Input | Tool | Output | Gate |
| --- | --- | --- | --- | --- |
| 1 Intake | Nine inputs, two of them director decisions | Files, Figma, Dropbox, Higgsfield upload | PRESERVE block | Fixed versus open confirmed when no valid block exists |
| 2 Sheets | Brief, preserve block, prior accepted and rejected work | Writing | Expression sheets side by side | Edited or killed on paper, before credits |
| 3 Boards | Preserve block plus one sheet each | GPT Image 2, 1:1, 2k, high | Boards, screened | Keep, reject, combine; forced pair after the reaction |
| 4 Refine | One base board, named changes, failure line | GPT Image 2 with the board as Image 2 | One refined board | Did the right thing move |
| 5 Expand | Locked board, logo, aspect routing | GPT Image 2; a second model for text-free imagery; Recraft for hard-hex vectors | Full-size applications and the guide's aspects as sets | Each tile holds the expression; the set reads as one brand |
| 6 Language | Everything locked | Writing | Design language, recipe bank, Figma build list | Expression accepted as direction |
| 7 Closeout | Ledger | Writing | Brand facts filed, method lessons filed | none |

Two return paths are part of the method. A rejection at Stage 4 returns to Stage 2 with one axis opened (usually the imagery subject or the mode), never to another refinement. A director synthesis at any gate becomes a new single sheet plus a small convergence run of two candidates that differ by one input.

## The gate contract

Every gate has the same shape.

1. **Recap** the brief, the preserve block, the locks so far, and what a choice commits.
2. **Feedforward** the recipe (model, references with roles, prompt blocks) and the credit cost before spending.
3. **Screen before showing.** Logo reproduced, wordmark not re-set, palette held down to the smallest label, no expression name or verb printed as copy, imagery rules held, subject landed, spelling, every tile present. Discards stay in the ledger with the reason.
4. **State a recommendation, then ask.** Ask whether a board expresses the brief, never whether it is liked. When the set is a matrix, ask by axis (subject, mode, device) so one answer carries three decisions. Choose the forced pair from the boards the director names, after their reaction.
5. **Record Director's words verbatim.**
6. **Lock** in three parts together: image ids, the exact recipe, and one plain sentence. A device lock is provisional until Stage 5 passes; what reads as structure on a dense board can read as a stray line on a single surface.

Send every shown image into the chat as a file. Links do not render for the director.

## The expression sheet

Every candidate is one sheet of eleven lines, written side by side with its rivals before any credits: name, thesis, tension, lineage, verbs, colour roles, typography behaviour, composition, imagery treatment, imagery subject, and the rejected default with the failure line. Read [expression sheet](references/expression-sheet.md) for the lines, the distance-scale and matrix brief shapes, and worked examples.

Three rules make sheets produce different worlds instead of a palette taxonomy. Each candidate bets on a different source of authority. Lineage is named as genres the model already knows, never as studios or competitors. Imagery is two lines, treatment and subject, because the treatment is usually what the director wants to keep and the subject is usually what fails.

## Prompt discipline

Read [prompt blocks](references/prompt-blocks.md) for the templates and [language ledger](references/language-ledger.md) for which wording produced which result. The rules that never bend:

- The PRESERVE block is written once and repeated verbatim on every generation. Anything not in it is fair game for the model.
- The logo is passed as a labeled image input with "reproduce exactly; never redraw, restyle, recolor, or distort it; the wordmark is artwork and is never typeset". Describing a mark in words produces a different mark.
- Colour is given as roles (field, type, signal, light, material) with exact hex, never as swatches alone. Proportion rules ("used at five percent", "never a fill larger than a swatch") are honoured.
- Expression names and visual verbs are internal labels; the prompt says they never appear as words on the board. Without that line they print as taglines and headlines.
- Category objects that must not appear are banned by name (cars, machine parts, microphones), and a photographed environment is described exhaustively because a ban does not stop a room from bringing its furniture.
- Refinement names every change and where it may not go (the logo tile, the app icon), lists screen fixes as explicit changes, and re-screens the output. One change at a time does not reduce drift on boards; it makes the one change over-applied. Subtractive refinements are the cleanest.
- Expansion passes the locked board as Image 2 with "match its drawing treatment, type behaviour, colour roles, line weights, and finish exactly; do not copy its layout". Exact copy goes in quotes.
- The line "the pattern, banner, report cover, and motion frames reuse the drawing" is what turns a subject into a system.

## Guardrails

- No real person is a generation input. Portraits are invented people; real people are placed natively.
- Uploads of logo files to Higgsfield require the director's authorization per run and are logged with the media id.
- Real typefaces are never taken from boards; the model names faces as suggestions.
- Generated boards and tiles are hypotheses until locked and remain out of Git; job ids and recipes are the durable record.
- Waves of eight jobs or fewer; read the model and aspect back from the job record before attributing a result.
- Customer-facing AI language follows the project's approved policy. If no policy is supplied, do not invent one or make disclosure claims on the user's behalf.

## Expanding the guide

Once an expression is locked, Stage 5 applies it aspect by aspect: colour system with computed ramps, pattern and texture families, illustration treatments of the locked subject, a typography specimen, backgrounds and card backgrounds, UI fragments, social ads across formats, and motion frames. Read [guide expansion](references/guide-expansion.md) for the aspect matrix (tool, prompt notes, screen, and native handoff per aspect) and the set-consistency checks: the contact sheet, the hand-test pair, and the screen table.

## Handoff

Stage 6 writes the design language in nine lines (idea, treatment, device, colour roles, type behaviour, composition, copy behaviour, materiality, failure lines), a recipe bank keyed by job id, and a Figma build list. Read [design language and handoff](references/design-language-and-handoff.md). Native production belongs to `metamodern-work-in-figma`. A chosen expression sheet is also the Gate A brief for `metamodern-build-brand-world` when the brand needs art-directed campaign imagery beyond the guide.

## Closeout

A review returns findings without filing brand facts or opening a ledger. For an authorized expression run, separate brand facts from method lessons. Brand facts go to the brand's own workspace and `BRAND.md`, including any naming used on boards that differs from the recorded styling. Method lessons that survive this case and one distinct case are proposed as corrections to this package, reported to the director before any change. Keep the run ledger from [ledger template](references/ledger-template.md) in the project.
