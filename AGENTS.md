# Contributor guide

Each root-level `metamodern-<verb>-<object>` directory is a standalone Agent Skills package.

- Keep package names, `PACKAGE_ID`, `PACKAGE_VERSION`, `SKILL.md`, and `agents/openai.yaml` aligned with root `catalog.json`.
- Keep packages portable: no credentials, client material, machine-specific paths, symlinks, or unlicensed third-party assets.
- Update the root `catalog.json` and README when adding, removing, or renaming a skill.
- Run `npm test` and `npm run validate` before opening a pull request.

The Metamodern Agency repository consumes this repository as a pinned Git submodule at `skills/`. Make changes here first, then update that pin in the Agency repository.
