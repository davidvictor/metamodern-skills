# Impeccable interface foundation

Use Impeccable only when the current request authorizes interface-production setup or implementation for a user-facing website, application, or interface. It is an interface-production foundation, not a project-wide, brand-level, or general creative foundation.

## Boundary

- Empty, brand-only, Figma-only, deck, and document projects do not install or initialize Impeccable.
- Brand Development owns `BRAND.md`; Visual Direction owns brand-level territories; Figma owns editable design sources.
- Impeccable owns confirmed `PRODUCT.md`, application-level structure and composition, interface implementation pressure, mechanical checks, finish review, and implemented `DESIGN.md`.
- A local extension inherits the accepted Brand System and implemented interface world. It does not trigger a new identity exercise.

## Prepare the runtime

Read the current upstream README and the project's Impeccable integration guide when available. An Agency checkout may provide `integrations/impeccable.md`; do not assume that path exists elsewhere.

1. Resolve the saved project root and the application root. Install the hook at the saved project root so Codex can discover it.
2. Verify the selected user-scope Impeccable release. Place an exact derived copy at project `.agents/skills/impeccable/`; this same-name copy is upstream runtime support, not a competing authored skill.
3. Run `node .agents/skills/impeccable/scripts/hook-admin.mjs on` from the project root.
4. Review and trust the project definitions through Codex `/hooks`.
5. Run `hook-admin.mjs status`; require `state: enabled`, `env override: unset`, a valid `.codex/hooks.json`, and byte parity with the selected user-scope release.
6. Configure server-rendered template extensions under `detector.extensions` when the stack needs them.

Do not edit installed Impeccable files. When the official installer fails, use an exact verified official release-tag payload and the payload's own hook administration flow.

## Git boundary

Add these derived/local paths to `.gitignore`:

```gitignore
.agents/skills/impeccable/
.impeccable/
```

The complete `.impeccable/` tree stays out of Git. Promote durable product, brand, design, and project truth into their canonical artifacts. Keep `.codex/hooks.json` reviewable unless the project has another approved tracking policy, and preserve unrelated hook entries.

## Route the work

- New interface with confirmed product truth: run Impeccable init for `PRODUCT.md`, then continue through the accepted Brand System and the relevant surface flow.
- Existing interface without `PRODUCT.md`: init from repository evidence plus focused human confirmation.
- Existing implemented interface without `DESIGN.md`: document current implementation after comparing it with accepted brand authority.
- New or open application surface: Impeccable may explore application structure and composition inside the accepted Brand System.
- Narrow interface change: inherit the existing product, brand, and implemented design; use the relevant scoped Impeccable command.

Do not record comp-first or code-first as a standing default without the user's explicit choice. Setup never authorizes redesign, Figma mutation, publication, deployment, cleanup, or commercial work.
