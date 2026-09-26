# Operating contract

Midjourney is an instrument the user operates in their own account. This contract contains no standing account, plan, privacy, or commercial-use decision; verify those facts for the current user and run. In a Metamodern Agency checkout, also read `integrations/midjourney.md` for the owner's private account context, then refresh any time-sensitive fact before relying on it.

## Who does what

- The agent writes complete recipes, delivers a paste sheet, reads back results, screens, records, and asks.
- The user pastes each recipe into their own Midjourney session, attaches the named references, runs one job at a time, and returns the results.
- The agent never operates the session unless the user asks for that in the current session. A prior authorization does not carry over.
- Nothing else touches Midjourney: no third-party wrappers, pooled accounts, proxy APIs, cookie or browser automation, or MCP shims. The terms of service prohibit automated tools and one user per account; that fact is stated in [controls](controls.md) and is never turned into legal advice.

## The paste sheet

Two lines per recipe, grouped by set, in run order: a header line the agent reads, then the paste line the user copies. Nothing but the paste line ever enters Midjourney; an id or an attachment note on the same line would become prompt text.

```text
C.1.1  setting 1, S1 at weight 100, raw on  |  attach S1 in the style reference slot
Campaign still, ... --ar 16:9 --v 8.2 --raw --s 50 --c 0 --exp 0 --sw 100 --no text, logo, watermark

C.1.3  setting 3, raw off (the one control that changes)  |  attach S1 in the style reference slot
Campaign still, ... --ar 16:9 --v 8.2 --s 50 --c 0 --exp 0 --sw 250 --no text, logo, watermark
```

Rules for the sheet:

- Every paste line is complete and self-contained. No fragments to assemble, no "same as above".
- The header line carries the id, the setting or the single variable, and the attachments named by kit id with their slot (style reference, image prompt, Edit Model reference, moodboard on). On the web app the style reference is a slot, so the header says which kit image to drop in; on Discord the paste line carries the hosted URL.
- The parameter policy line is repeated on every recipe.
- The sheet says what to record back for every job: job id, the resolved prompt from the lightbox (it shows the `--p` code and the `--sref` inputs), the seed, and the image URLs.
- Run order puts the calibration grid first, then sets, and marks any line that depends on an earlier result.

## The read-back

The user returns images and the lightbox details as files or pasted text. The agent records each job in the ledger next to its recipe before screening, sends the shown images back into the chat as files, and never reports an image it has not opened. If a resolved prompt differs from the recipe (a stripped parameter, an auto-shortened prompt), the ledger records the difference and the recipe is corrected before the next run.

## Kit images in the user's account

Approved images used as references live in the user's Midjourney account: uploaded through the imagine bar or selected from their gallery. Their URLs go into the ledger as the kit item's source. Uploads of brand assets (an approved plate, a product sheet, a swatch) need the user's authorization per run, recorded with the date. No real person's photograph is ever uploaded as a generation input.

## Plan facts that shape a run

Read the current account tier, available generation modes, concurrency, privacy or gallery visibility, commercial-use terms, and remaining GPU budget before a session-facing run. State material visibility or budget consequences once in the intake recap and obtain the user's current authorization before uploading protected material. Build feedforward estimates from the current official plan and cost information rather than historical account facts.

## Cadence and retention

Modest volumes: what one person generates by hand in a working session. Never batched, never looped, never unattended. Verify current retention behavior. The ledger keeps job ids, URLs, and resolved prompts as the durable record. Download accepted images before closing a run so the handoff has files. File new style codes in a supplied project library with source image and version evidence, or keep them in the brand ledger when no library exists.

## Draft scouting

When the user wants to explore styles cheaply, the sheet may include a currently supported low-cost scouting mode. Results are scouting evidence; any code worth keeping is tested alone on the probe set before it enters the kit.
