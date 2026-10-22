# Renderer pitfalls

PDF viewers use different engines: Chrome and Edge use pdfium, Firefox uses pdf.js, Preview, Safari, Mail, and Quick Look use Apple's PDFKit, and Acrobat uses Adobe's engine. A page can be valid PDF and still draw differently in each. These are the failures seen so far, what causes them, and the fix built into the pipeline.

## White or missing areas when zooming (Apple viewers)

**Seen:** Large white rectangles over parts of a dark page in Preview, at any zoom, while Chrome showed the page correctly.

**Cause:** Figma wraps the whole page in a page-size soft mask when a layer has a rotation or effect. That mask is a no-op (an opaque rectangle covering the page), but once the page was scaled, by wrapping it in a form XObject (`show_pdf_page`) or by a plain transform, Apple's engine resolved it at the wrong size and dropped everything outside.

**Fix:** `build_pdf.py` copies pages with `insert_pdf` and removes the mask only when it proves the mask is an opaque alpha mask covering the page. Other masks are kept.

## Solid colored boxes over a layer (some Apple viewers)

**Seen:** A translucent colored box over a rotated card, and a lighter box over a field inside it, in a reader's Preview. The same file drew correctly in a current macOS PDFKit, pdfium, and Poppler, so it depends on the viewer version.

**Cause:** Figma inner shadows, and drop shadows with "show shadow behind node" turned off, become soft masks with PostScript calculator transfer functions (`/TR`, function type 4). A viewer that does not apply them paints the masked layer as a filled box.

**Fix:** `check_pdf.py` fails any page with a soft mask transfer function. Remove the effect in an export copy when Figma draws nothing for it, as described in [Figma export](figma-export.md); otherwise give the director the options listed there.

## Things that look like fixes but are not

- **Checking in one viewer.** The white areas passed in Chrome; the boxes passed in a current macOS PDFKit. Run the full check and still look at risky pages.
- **Deduplicating streams on save** (`garbage=4`) is not the cause of the white areas, but it merges identical mask and artwork streams; the build uses `garbage=3` to keep the file's structure as Figma wrote it.
- **`/UserUnit` for page size.** Many viewers ignore it. Resize with a transform.
- **Rasterizing whole pages.** It hides every rendering problem and loses live text, search, and sharpness when zoomed. Rasterize a single layer only with the director's approval.

## When a client reports something new

1. Get a screenshot, the viewer, and the operating system version if possible.
2. Reproduce with `check_pdf.py` and with `render_pdfkit` at higher zoom. If it does not reproduce, inspect the page's PDF objects (`/SMask`, `/TR`, `/BM`, `/Group`, `/ShadingType`) around the affected area and map them back to the Figma layers there with the preflight.
3. Fix at the source construct, add a lint or comparison to `check_pdf.py` that would have caught it, and record the case in this file.
