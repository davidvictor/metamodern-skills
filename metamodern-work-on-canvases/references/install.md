# Installing and updating

A project installs this package at a pinned version and commits which version it pins. Nobody edits the installed copy inside the project: changes are made in the package's own repository, released, and reach the project by an update. Updates never touch the project's own files.

Code: [`scripts/install.mjs`](../scripts/install.mjs), run through [`scripts/canvas.mjs`](../scripts/canvas.mjs) (`install`, `update`, `verify`). Node built-ins only; `--ref` also needs `git`.

## Install

From a checkout of the skills collection, at a release tag (or any commit):

```sh
node <checkout>/metamodern-work-on-canvases/scripts/canvas.mjs install --project <design repo> --from <checkout> --ref <tag> [--name "<project name>"] [--namespace <kit global>]
```

- `--from` is a checkout of the collection, a repository whose root is the package, or the package folder itself; it defaults to the package the command runs from. With `--ref`, the files come from that tag or commit in Git, whatever the checkout's working tree holds; without it, from the folder as it is (the lock then records no ref or commit).
- The project folder may be empty or missing; it is created. Install refuses a project that already has `canvas.lock.json` (use `update`) and a `--from` inside the project.
- `--dir` changes where the package goes (default `.agents/skills/metamodern-work-on-canvases`); it must not be a project-owned path or overlap `.claude/skills/metamodern-work-on-canvases/` in any letter case.
- `--name` and `--namespace` (a JavaScript identifier) are checked before anything is written.

Install writes:

- the package's files into `.agents/skills/metamodern-work-on-canvases/`, where Codex finds project skills;
- the Claude Code entry point, `.claude/skills/metamodern-work-on-canvases/SKILL.md`, a short loader that points at the installed `SKILL.md`;
- `canvas.lock.json`;
- the project's starting files, each only when absent: `canvas.config.json` (the name, kit namespace `Kit` unless `--namespace`, the pinned kit at `kit/current`, the skin, port 5410 and the six groups), `skin/board.css` (a plain skin for the builder's board shells), a `start` canvas with its builder script in `canvases/start/tools/build.mjs`, which install runs once (only when the project has no `canvases/start/` folder at all, so a builder never runs over existing files), a `.gitignore` holding `.canvas/`, and a `package.json` with a `canvas` script. An existing `package.json` gets the `canvas` script when it has none; an existing `.gitignore` is left alone with a note when it does not ignore `.canvas/`.

The command line is then `npm run canvas -- <view | render | review | explore | comments | update | verify> ...` from the project root.

## The lock file

`canvas.lock.json`, at the project root next to `canvas.config.json`, committed (`canvas-package-lock/1`):

```json
{
  "schema": "canvas-package-lock/1",
  "package": "metamodern-work-on-canvases",
  "version": "0.1.0",
  "source": { "ref": "<tag>", "commit": "<40 hex>" },
  "dir": ".agents/skills/metamodern-work-on-canvases",
  "files": { "<project path>": "sha256:<hex>" },
  "kept": [{ "path": "<project path>", "reason": "<why>", "since": "<version>" }]
}
```

It sits beside the config rather than in `.canvas/`, because `.canvas/` is machine-local and never committed, and every clone and worktree of the project must pin the same version. `files` lists every installed file, including the Claude Code entry point, with the package's hash. Install and update write it last.

## Safety

- Install and update write only real folders inside the project: a symbolic link anywhere on the way to an installed file, the Claude Code entry point or a starting file is refused, so nothing is written outside the project and no two paths name one file.
- Update reads the lock's `dir` and every path it lists, and refuses a lock whose folder leaves the project or whose paths are not the Claude Code entry point or files inside the installed folder (a hand-edited lock is restored from version control, never acted on).
- `--from` must be outside the project: update refuses the installed copy itself as its source.
- The lock is written last. If an install or update stops part way, the files written so far match the package: run update again with the same `--from` and `--ref` (for an install, delete the lock if it was written and install again).

## Project-owned paths

Install and update never write these, apart from install creating the starting files above when they are absent: `canvas.config.json`, `package.json` (install only adds the `canvas` script), `.gitignore`, `review.json`, `skin/`, `canvases/` (builder scripts, boards, heights), `comments/` (comment and batch files, written by the viewer and `canvas comments`), `builds/`, `decisions/`, `kit/` and `.canvas/`. The installed folder is never one of them.

## Update

```sh
node <checkout>/metamodern-work-on-canvases/scripts/canvas.mjs update --project <design repo> --from <checkout> --ref <new tag> [--dry-run]
```

Run it with the new checkout's command, so the updater is the new version's. `npm run canvas -- update --from <checkout> --ref <new tag>` runs the installed version's updater and works the same way.

For each installed file, update compares three hashes: the lock's (what was installed), the new package's, and the file in the project.

| The file in the project | What update does |
| --- | --- |
| matches the lock | takes the new package's version, or deletes it when the package dropped it |
| matches the new package | nothing |
| is missing | restores it |
| differs from both (edited here) | refuses |
| is in the installed folder but in neither package (added here) | refuses |

A refusal writes nothing at all and names each file. Decide each one:

- `--replace <path>` takes the package's version (or deletes a file the package does not have);
- `--keep <path> [--reason "<why>"]` keeps the local file. The lock records it under `kept`, later updates keep it and say when the package changed it, and `verify` reports it. Give one `--reason` per `--keep`, in order.

Both flags repeat. A kept file that is later restored to the package's version leaves `kept`. `--dry-run` reports what would change and writes nothing.

## Verify

`npm run canvas -- verify` checks every installed file against the lock and fails on an edited, missing or added file that is not kept. Restore such a file from a checkout outside the project with `update --from <checkout> --ref <the locked ref> --replace <path>`. A project can run it in CI to hold the rule that the installed copy is never edited.

## The tooling

The browser tooling the render check uses installs once per machine, outside the project: `node .agents/skills/metamodern-work-on-canvases/scripts/tooling.mjs install --browser`. It is keyed by the tooling lockfile's hash, so updates that change it install a fresh copy beside the old one.
