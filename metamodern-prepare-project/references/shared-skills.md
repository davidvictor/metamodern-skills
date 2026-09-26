# Shared and Project Skills

## Shared Metamodern skills

Canonical packages are published at [`davidvictor/metamodern-skills`](https://github.com/davidvictor/metamodern-skills) and installed copies live in the runtime's shared skill location, such as `~/.agents/skills/`. Projects reference shared skills by name in `AGENTS.md`; they do not copy them into project `.agents/skills/`.

The Metamodern Agency checkout consumes this public collection as a pinned Git submodule at `skills/`. Its local governance may add Agency-specific adapters, but the public package remains the reusable source for installers.

Shared names use:

```text
metamodern-<verb>-<object>
```

Discover the current collection from the public repository's `catalog.json` and README. Do not maintain another exhaustive name list inside a package.

For every shared capability routed by project `AGENTS.md`, add a `REFERENCES.md` entry containing its canonical name, public source, project role and scope, and natural-language use. Record Last verified only when the user-level installation and source parity were actually checked. Confirm each required name is discoverable; when it is missing, the register still tells a clean environment where to obtain it.

Scan both user and repository locations for the same `name`. When both expose the same shared capability name, stop Project Preparation and resolve the collision before writing skill routing into `AGENTS.md`.

## Project skills

Use project `.agents/skills/` only for behavior that belongs to the project or subtree, including project-local tool support such as Impeccable hooks or a deliberate pinned fork.

Give project skills a unique project namespace, such as `deal-room-release`. Do not create a project-local package with the same name as a shared user-level skill. A runtime may not merge same-name packages.

Impeccable is the narrow exception: its Codex hook requires a project-local `.agents/skills/impeccable/` runtime copy with the same upstream name. Allow it only as an exact derived copy of the selected user-scope release. Never edit, fork, register, or treat that copy as a Metamodern-authored skill. Keep it and the entire `.impeccable/` tree out of Git; keep `.codex/hooks.json` reviewable unless the project has another approved tracking policy.

## Updates

Shared skill updates follow:

1. Edit the canonical public package and bump its `PACKAGE_VERSION` and catalog version entry.
2. Run repository tests and validation.
3. Commit the package source.
4. Reinstall the user-level copy.
5. Verify source and installed parity plus the Claude link.
6. Use fresh sessions in the supported runtimes to confirm discovery when external testing is authorized.

Client repositories require no skill-copy update. Another machine, collaborator, or cloud environment installs the selected shared skills from the public collection.

Use the public collection's `install.sh` sync path for user-level installation and parity verification. An Agency checkout may run its local wrapper after updating its pinned submodule.

## Engineering composition

`metamodern-initiate-engineering` owns proportional engineering setup and a first implementation or discovery task. `metamodern-bootstrap-app` independently prepares a selected MakerKit base. They consume existing project decisions; their portable-core-only calls to Project Preparation return without dispatching engineering again.

Project-local development skills contain actual project commands, extension points, consumer boundaries, and relevant local verification. Reference the shared engineering method and current vendor capabilities instead of copying them. Record tool availability separately from authentication, target access, and an observed successful operation. File presence does not prove native discovery, hook activation, or trust. Core build/test commands must work without optional agent hooks or sibling checkouts.
