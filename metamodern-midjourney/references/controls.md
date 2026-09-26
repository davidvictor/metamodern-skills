# Midjourney controls

This snapshot was verified against official Midjourney documentation on 2026-09-03. Read this file before asserting syntax, then verify current version, plan, terms, costs, and controls against the official documentation because they can change. When the version shown in the user's interface differs from the one below, treat every version-dependent line as a test until re-verified and record the new verification date when the package is corrected.

## Version boundary

- Default model: V8.2 since 2026-07-24. V8.1 selectable. V8.0 alpha retired. V7 and V6.1 selectable.
- V8 reads prompts literally and rewards longer, more specific description. Official launch guidance: use `--raw` for controlled or photographic looks; lean on personalization, style references, and moodboards for style. V8.2 pushes a bolder house aesthetic than V8.1; `--raw` is the official lever back.
- V7 is the only home of Omni Reference, `--q 2` and `--q 4`, and the old Retexture tool. V6.1 is the only version that honors multi-prompt `::` weighting and `--cref`.
- Not supported on V8.1 and V8.2: multi-prompt `::` weighting, `--q`, Turbo, Omni Reference. Draft mode is documented for V8.x despite a stale chart cell.
- Resolution and cost: SD is 1024 px at 0.8 GPU-minutes; HD is native 2048 px at 1.3 GPU-minutes and cannot be upscaled further; HD caps the aspect ratio at 4:1; Pan, Zoom, and Edit on an HD image return SD. Edit Model jobs cost 1 GPU-minute SD and 2.3 HD.

## Syntax rules

Parameters go at the end of the prompt, one space before the dashes, no commas or periods inside a parameter, nothing after the parameters. Text in an image goes in double quotes only. Describe the picture; never instruct the model ("make it", "copy this style") outside the Edit Model and conversational mode. Negation in prose fails; use `--no`. Counts need numbers or collective nouns.

## What each instrument carries

| Instrument | Carries | Range and default | Facts that shape brand work |
| --- | --- | --- | --- |
| Text prompt | Content: subject, staging, light, composition, medium words | No published limit; a Prompt Shortener triggers past it | Style words compete with references. Hex and Pantone are unsupported; named colors work; ambiguous noun-colors want "-color" appended |
| `--sref` URL or code, `--sw`, `--sv` | Style only: color, medium, texture, light. Never subject or composition | `--sw` 0 to 1000, default 100 | A text prompt is required. Official best practice: keep text simple, avoid style words that conflict with the reference, add matching style words only when the style is not taking. Codes come from Style Explorer, Style Creator, or prior prompts; a code cannot be minted from an upload. V8 ships a new faster style-reference version with `--sv 6` as the documented fallback. The label `--sv 7` is practitioner usage and is absent from the docs. `--sw` has more effect on codes than on image references (official for V7) |
| `--p` profile or moodboard code | A taste profile or a curated image set, applied as style | Strength is `--stylize` 0 to 1000; there is no separate weight | A moodboard becomes a stable code the first time it is used; record the code. Moodboards refuse `--sw`, `--sv`, and `--weird`. Moodboards express a wider aesthetic range than style references, which are more specific (official). No Global V8 profile exists yet; the V7 Global profile works on V8.x; V8 profiles do not run on V7 |
| Image prompt, `--iw` | Content, composition, and color of a reference, as inspiration | `--iw` 0 to 3, default 1 | Crop the reference to the target aspect ratio. Image-only prompts ignore `--stylize` and `--weird`. Image prompts also bleed style |
| Edit Model (V8.1 and V8.2, shipped 2026-08-27) | Identity of up to four references (characters, products, objects), instruction edits, inpainting, outpainting, retexture | No weight parameter | Replaces Omni Reference, Character Reference, and Retexture on V8.x. Matches the first reference's aspect ratio unless `--ar` is given. Descriptive and instruction prompts both work. Style references and moodboards may need explicit style words to activate. Officially a community test with edge cases. Merge several characters into one sheet when they bleed |
| `--oref`, `--ow` | One subject's identity | V7 only; `--ow` 1 to 1000, default 100, keep under 400 | Not on V8.x; docs steer to the Edit Model |
| `--stylize` | House-style strength and personalization strength on one knob | 0 to 1000, default 100 | Log the value with every code; with `--p` on, one knob does two jobs |
| `--raw` | Removes default styling | flag | The V8-family syntax; the older two-word `--style` form belongs to V5.1 through V7 and is never used here. Default for product, photographic, and Edit Model precision work; the official fix when text misrenders |
| `--chaos` | Grid diversity | 0 to 100, default 0 | Keep 0 for reproducible sets; raise only in Draft exploration |
| `--exp` | Detail, dynamics, tone mapping | 0 to 100, default 0 | Above 25 to 50 it overrides stylize and personalization and hurts accuracy |
| `--seed` | Initial noise | 99 percent identical on V8 | Officially never a consistency tool across prompts; use for A and B tests of one frame |
| `--no` | Exclusions | list | Each word is moderated independently ("--no modern clothing" reads as "no modern" and "no clothing") |
| `--ar` | Canvas | integers, max 14:1, HD 4:1 | Web presets include 4:5, 5:4, 21:9, 6:11 |
| `--draft` | 24 images at 512 px for 0.4 GPU-minutes (web, V8.x) | flag | With `--sref random`, 24 images each in a different style: the cheapest style scouting |
| Permutations `{a, b}` and `--repeat` | Batch variants | caps by plan: 4, 10, 40, 40 | Fast mode only; each result bills full GPU time; escape commas with a backslash |
| Text in image | Words in double quotes | short, Latin | Add "with the words"; fix with `--raw` or lower `--s`; V8 is officially better at it |
| `--stealth` | Gallery privacy | Pro and Mega only | Unavailable on Basic and Standard; everything is public, including V8.x Editor and Edit Model outputs |
| `--tile`, `--weird`, `--video` | Seamless tile; oddness; image-to-video | see docs | Do not upscale tiles; weird is stripped with moodboards; video accepts no references |

## Tools around the prompt

- **Describe** writes four V8-style prompts from an image. Use it as an inventory of Midjourney's own words for a look, never as a prompt to paste.
- **Style Explorer** browses codes with search and "similar". **Style Creator** mints a custom code from five to fifteen rounds of grid selection; previews cost GPU time, so use `--draft`; entering with an existing code stacks a second code rather than merging.
- **Editor**: Smart Select, erase and restore, layers (composite an external image; only transparent areas regenerate), Suggest Prompt, Retexture as an Edit Model prompt over the whole image. Vary Region on the web runs on the Edit Model.
- **Organization**: folders with generation inside a folder, saved searches by parameter or reference, bulk download of up to 2,000 items, and a lightbox that copies the prompt, job id, seed, and image URL. The resolved prompt shows the `--p` code and the `--sref` inputs; that is what the ledger records.
- **Conversational mode** writes prompts for you. It hides the recipe; do not use it for brand sets.

## Plan facts

| Plan | Fast hours | Relax images | Stealth | Permutation and repeat cap | Concurrency |
| --- | --- | --- | --- | --- | --- |
| Basic | 3.3 | none | no | 4 | 3 |
| Standard | 15 | unlimited | no | 10 | 3 |
| Pro | 30 | unlimited, plus SD video | yes | 40 | 12 |
| Mega | 60 | unlimited, plus SD video | yes | 40 | 12 |

Companies over one million dollars in gross revenue need Pro or Mega for commercial use. Subscribers own outputs; Midjourney gives no copyright guidance. Every delivered image carries a hidden provenance tag checkable at midjourney.com/verify.

## Terms and automation

The terms of service snapshot reviewed for this file prohibited automated access and account sharing. Recheck the current terms before relying on that boundary. Do not use a third-party "Midjourney API," cookie automation, or browser automation unless the current official terms and the user's instruction clearly authorize it. This is operational guidance, not legal advice.

## Failure modes, official or well evidenced

1. Negation in prose fails; `--no` word-splitting can trigger moderation.
2. Instruction language in a generation prompt is officially discouraged outside the Edit Model.
3. Hex codes and Pantone names have no support anywhere; the routes to a palette are a style reference, a moodboard, an image prompt, named colors, and post-grading.
4. Composition is controlled by shot-size words, `--ar`, image prompts, the Editor, and Edit Model perspective instructions; complex spatial relations are unreliable.
5. Seeds are weak, session-unstable, and unusable in Turbo.
6. Parameter conflicts: `--sw` and `--sv` with moodboards; `--weird` with moodboards, seeds, and image-only prompts; `--stylize` with image-only prompts; HD with Pan, Zoom, and Edit (returns SD); upscaling with `--tile`.
7. High `--exp` and high `--stylize` degrade prompt accuracy and compete with references.
8. Extreme aspect ratios are unpredictable; HD caps at 4:1.
9. External images can trigger moderation on innocent prompts; blocked jobs cost nothing.

## Unverified, and how to treat each

- Per-image style-reference weights (`URL::2 URL::1`) on V8.x: documented for Discord and V6; `::` weighting is unsupported on V8.x. Test before relying on it; until then use one reference, or two with the weaker one dropped rather than weighted.
- `--sv 7` as the V8 default label: practitioner usage. Use the default and `--sv 6` as the two documented settings.
- Whether an `--oref` job under `--v 8.x` errors or silently falls back to V7: test once.
- The prompt length limit (a 256-word warning is reported, unpublished).
- Which model runs Discord Vary Region on V8.x (the web uses the Edit Model).
- Upload size limit (10 MB in one article, 20 MB in another): assume 10 MB.
- The current default resolution for a fresh account (SD or HD): read the settings panel.
- Front-loading (earlier words weigh more): an official statement exists only for the 2022 test models; treat as a heuristic.

## Vocabulary sheets the docs sanction

The Art of Prompting article carries rendered examples for artistic mediums (block print, cyanotype, risograph, ukiyo-e, cut paper), time periods by decade, emotions, colors (millennial pink, acid green, sepia, duotone, CMYK, iridescent, neon), and environments. It is a sanctioned lexicon; a brand's vocabulary sheet draws from it and from Describe.
