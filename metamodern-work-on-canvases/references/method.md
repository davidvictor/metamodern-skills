# The method

How a project designs on canvases with this package: the working loops, in the order a design moves through them, and the rules that hold in every loop. The commands are in the references each loop links; this file says when to use them.

The decision-maker is the person who decides the project's designs. The agent does the work in files; the decision-maker looks, comments and decides in the viewer.

## The rules

1. **One lead per set on the app canvas.** A review set asks one question and shows one answer, its lead. Alternatives never sit on the app canvas.
2. **Options only on exploration canvases, at most two open per area.** An area is an app canvas page (or a lab component). Close or decide an exploration before opening a third in the same area.
3. **Components before flows.** Decide a component in its lab before a flow that uses it goes to the app canvas. A flow set that needs an undecided component waits on that component's set (`waits_on`).
4. **Builder, then render check, then show.** Run the canvas's builder script, then `canvas render` for that canvas, and fix every failure before sending a link or asking for a decision. Nothing is shown unrendered.
5. **The pinned kit for anything that counts.** Boards that are recorded, rendered for the decision-maker, or used as a lead or a Live row use the pinned kit. A live worktree kit is only for boards switched to it during a lab session, and the banner on each board names the kit it shows.
6. **Lock only with the decision-maker's own words.** Record them as said. A lock that needs a database, API or permission change stops there and goes back to the decision-maker as product work; it is never built as a design change.
7. **Generated boards are never edited by hand.** Change the builder script and run it again. Builder scripts import the installed package; no canvas gets its own copy of the runtime, the builder or the render check.
8. **The installed package is never edited in the project.** Change it in the package's own repository, release it and update the project ([install.md](install.md)).

## Foundations

The Foundations canvas shows the kit's tokens: colour in every theme, type, space, radius, elevation and motion. Its builder script draws each board from the pinned kit's `tokens.json`, so it never types a value in.

- Rebuild it after every kit sync and render-check it in each theme.
- Every motion pattern the kit uses has a board whose motion the viewer can replay, slow to a quarter and pause ([viewer.md](viewer.md)).
- A token change is decided here, as a review set on this canvas's page, before any component that uses it.

## Component lab

One lab canvas or page per component, with rows such as States, Playground, In place and Directions ([board-builder.md](board-builder.md)).

- **States** shows every variant and state the component supports, from the pinned kit.
- **Playground** exposes the component's properties as board controls, so the properties panel can try values.
- **In place** shows the component inside the screens that use it.
- **Live mode** follows a change being made in a project app worktree:
  1. register the worktree's watch build in `.canvas/live.json` under a short name;
  2. switch only the boards being worked on to `live:<name>`, in the properties panel or with a `?canvas-kit=live:<name>` link; keep a pinned board of the same component beside it;
  3. each save in the worktree reaches the boards on that kit; the banner names the worktree's branch and commit;
  4. when the session ends, switch the boards back to pinned. A live board is never recorded, locked or archived.

## App canvas

One canvas, one page per app area, and on every page the rows Live, Deciding, Building, Next and Later. The project's builder script makes the rows from `review.json` with `appPageRows` ([review-sets.md](review-sets.md)).

- **Live** shows the real screens in every state they support, mounted from the pinned kit. It changes only through a kit sync.
- **Deciding** holds sets that are exploring, ready or waiting, one lead each.
- **Building** holds locked sets with their pull request.
- **Next** holds decided designs that need something the product does not do yet; **Later** holds decided designs held for a later milestone.

## Exploring

A question with more than one plausible answer gets an exploration canvas: `canvas explore create <id> --title <title> --question <question> --set <set id> --copy <canvas>/<board> ...` ([board-builder.md](board-builder.md)).

- Start here states the question. Directions holds the options side by side; options differ in structure and meaning, not decoration.
- Copy in the boards the options start from; the copies are the exploration's own boards.
- Respect rule 2: at most two open explorations per area.
- Render-check the canvas before asking the decision-maker to compare.

## Choosing a lead

When the decision-maker chooses a direction:

1. record the lead on the set: `canvas review create` for a new set, or update the set's `lead` and boards in `review.json`;
2. move the chosen direction onto the app canvas as the set's lead, drawn by the app canvas's builder script in the project's board style (not a copied board);
3. `canvas explore decide <id> --lead <text>` freezes the exploration;
4. `canvas review status <id> ready` when the lead is ready to lock;
5. rebuild and render-check the app canvas.

## Locking

The decision-maker locks a set by saying so and naming it.

1. Check the scope first: if the lead needs a database, API or permission change, do not lock. Say so and hand it back as product work.
2. Render-check the set's lead boards: lock needs a passing render of each one at its current source.
3. `canvas review lock <id> --words "<the decision-maker's words>" --harness claude-code|codex --piece <module, composition or route> ...` records the date, the words and the harness and writes `builds/<set>.md` ([review-sets.md](review-sets.md)).
4. Follow what the lock prints: start the build now, or build it with the set it waits on, in the same pull request.
5. The build is ordinary product work in the product's repository, from the brief, under that repository's own rules. Record its issue, branch and pull request with `canvas review status <id> building --issue <n> --branch <name> --pr <url>`.

## Keeping Live current

The project syncs its kit; the package does not. Run the project's kit sync:

- after a build that changes the kit or a screen merges, then move its set to live with `canvas review status <id> live --commit <sha>`;
- when the product's kit source has moved past the pinned commit (its `kit.json` `inputs` say what to watch);
- before rendering boards for a decision, so leads are compared with what the product really does.

After a sync, rebuild Foundations, the labs and the app canvas, and render-check them. A Live board that no longer matches its set's lead is a finding to report, not something to fix by hand on the board.

## Archiving

When a set goes live and `replaces` other sets, or a set is set aside, archive it: `canvas review archive <id> [--why <text>]` keeps each board as a picture on the archive canvas, with its source kept beside it, and moves the set to archived. The next app canvas build drops its boards. Nothing is deleted without being archived first.

## The comment loop

The decision-maker comments on boards in the viewer and presses **Send all to agent**, which bundles every open comment into one batch. The files, states and command line are in [comments.md](comments.md); in an installed project the commands run as `npm run canvas -- comments ...`.

- **Listening:** `canvas comments wait` blocks until a batch is sent and prints it as JSON. Use it while a design session is open.
- **When asked instead:** `canvas comments list --open` shows what is waiting.
- **Working a batch:** `canvas comments take <batch>`, change the builder scripts or files each comment points at, rebuild and render-check, then `canvas comments reply <id> "<what changed>" --addressed` for each comment and `canvas comments done <batch>`.
- Only the decision-maker resolves a comment. A reply without `--addressed` asks a question and leaves the state as it is. Never edit or delete a comment file by hand.
- Comments point at boards by their viewer links and stable labels, so they survive a rebuild; a comment whose element is gone shows as moved, never lost.
