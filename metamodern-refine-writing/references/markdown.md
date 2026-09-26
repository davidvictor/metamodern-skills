# Markdown and Structured Text

Read this guide when the source contains Markdown, structured prose, code, commands, links, citations, frontmatter, tables, directives, or quotations.

## Protected spans

Preserve these exactly unless the user explicitly asks to change them:

- YAML or other frontmatter;
- fenced code and its language label;
- inline code, identifiers, commands, flags, paths, and error strings;
- Markdown link destinations and raw URLs;
- footnote identifiers and citation targets;
- block quotations and attributed quotations;
- HTML, JSX, directives, writing-block markers, and embedded metadata;
- numbers, units, dates, currencies, percentages, and version strings;
- table values and machine-readable labels.

The surrounding prose can change. A link label can change when its meaning stays intact, but its destination cannot.

## Structure

Preserve heading hierarchy, list nesting, table shape, and section order unless a structural change makes the document materially easier to use. Name a material reorganization in the editor note.

Do not convert every sequence into bullets. Do not add a heading to every paragraph. Do not flatten a useful table into prose or turn prose into a decorative table.

## Markdown-aware verification

For a file-based Markdown edit, resolve an absolute `SKILL_DIR` from the loaded skill path. Run that checker, not a project-relative script:

```bash
node "$SKILL_DIR/scripts/check-preservation.mjs" --source before.md --revised after.md --json
```

The checker compares high-confidence anchors. It cannot detect a changed claim, erased uncertainty, or flattened voice when the same anchors remain. Complete the manual preservation-ledger comparison after the script passes.

Do not create source and revision files inside the active project only to check pasted text. Use the manual ledger for chat-only text unless private temporary materialization is explicitly authorized.
