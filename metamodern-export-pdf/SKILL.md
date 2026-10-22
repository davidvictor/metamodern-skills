---
name: metamodern-export-pdf
description: Use when the user wants a PDF from Figma frames or slides, a client-ready or print-ready PDF, a clickable PDF (logo, button, or text links), or reports that a delivered PDF looks wrong in Preview, Safari, Mail, Chrome, or Acrobat, such as white or missing areas when zooming, solid colored boxes, or links that do not click.
---

# Metamodern Export PDF

## Purpose

Turn approved Figma frames into one PDF that looks the same as Figma in every common viewer, carries the right links, and has been checked before anyone sends it. A PDF that looks right in one viewer can still fail in another, so delivery always waits for the bundled check.

## Establish the source and the target

Figma is the source of record once the director has adjusted it by hand. Export from the live frames, never from an earlier HTML or code version, so manual edits survive. Confirm:

- the exact frames and their order (read them; do not infer order from names alone)
- the output page size: `source`, or a size with the same aspect ratio such as US Letter `[612, 792]` for 816 x 1056 frames
- every link: what is clickable, and the exact URL
- the output file name and folder. Without instructions, use `<Document title> - <Client>.pdf` in an `exports` folder next to the project's other deliverables, and say so

Use `$metamodern-work-in-figma` rules for anything that touches the Figma file. Exporting is read-only. The only write this skill makes is a temporary, clearly named export copy (see below), which is deleted before you finish.

## Workflow

1. **Preflight in Figma.** Run the read-only preflight in [Figma export](references/figma-export.md). It lists the page frames or slides, the link targets with their boxes, and every layer with an effect Figma writes in a fragile way (inner shadows, and drop shadows with "show shadow behind node" off). Those are the known cause of solid boxes in Apple viewers.
2. **Export each frame as PDF** with the Figma MCP `download_assets` tool (`defaultFormat: "pdf"`, no scale), one file per page, named `p01.pdf`, `p02.pdf`, and so on. Keep the untouched exports in an `originals/` folder when you replace any page.
3. **Neutralize fragile effects** only where the preflight or the check found them, using a temporary export copy of that frame. Prove the copy still renders the same as the original in Figma before you use its PDF. When the effect is visible and the copy cannot match, the director chooses between rasterizing that one layer, a recorded waiver, or a design change. The procedure and its safety rules are in [Figma export](references/figma-export.md).
4. **Write the manifest** described in [Manifest](references/manifest.md): pages, page size, links, metadata.
5. **Build** with `scripts/build_pdf.py MANIFEST`. It copies pages without wrapping them, resizes them with a plain transform, removes Figma's no-op page masks, keeps Figma's text links, and adds the links from the manifest.
6. **Check** with `scripts/check_pdf.py MANIFEST`. It must print `PASSED`, with any waiver listed and approved by the director. It lints for fragile constructs, checks sizes, links, and live text, and compares every page with its source in pdfium (Chrome), Poppler, and Apple PDFKit, drawn whole and in zoomed tiles.
7. **Look** at the contact sheet and link crops it writes, and at any page that has a rotated, shadowed, masked, or translucent layer, zoomed in. The automated check catches blank areas and missing links; your eyes catch wrong-but-plausible output.
8. **Deliver** the file with a short note: page count, size, which links exist, and which viewers were checked. If anything was not checked, say so.

## Why each rule exists

These rules come from a client-facing failure, so keep them even when a shortcut looks fine in one viewer.

- A single renderer is not evidence. Chrome's engine drew the broken pages correctly while Preview showed white areas and solid boxes. The check runs three engines and Apple's tiled drawing.
- Figma writes some effects in ways older or newer Apple viewers do not support. Removing them in an export copy is safe only when Figma itself draws nothing for them, which you prove by comparing renders.
- Logo and button links do not survive a Figma export, because Figma only exports links on text. They are added to the PDF as link annotations; see [Links](references/link-annotations.md).
- Rebuilding a PDF from scratch (printing to PDF, rasterizing, or re-rendering HTML) loses either live text, the director's edits, or both.

Read [Renderer pitfalls](references/renderer-pitfalls.md) when a viewer shows anything the source does not, before changing the pipeline.

## Setup

The scripts need Python 3.10 or newer with `pymupdf`, `pypdfium2`, `pillow`, and `numpy`. Install them in a virtual environment, not the system Python. The check also uses Poppler's `pdftoppm` when available and, on macOS, compiles `scripts/render_pdfkit.swift` with `swiftc` to draw pages exactly as Apple's PDF engine does. Without macOS the Apple check cannot run; report that gap rather than calling the PDF verified for Apple viewers.

## Adding links to a PDF that did not come from Figma

The same build and check work for any PDF: point the manifest at its pages and give links as boxes in the source page's coordinates or as text to search for. The method for finding boxes, sizing hit areas, and verifying clicks is in [Links](references/link-annotations.md).

## Closeout

Report the delivered path, the check result per renderer, the links added, and anything replaced through an export copy. Record project facts (frame IDs, the manifest location, replaced pages) with the project, not in this skill.
