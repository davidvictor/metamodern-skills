# Links

A clickable area in a PDF is a link annotation: a rectangle on the page with a URL. It sits on top of the artwork, so any element can be made clickable without changing how the page looks.

## Decide what links where

Get each link from the director or the approved source, and write the URL exactly, with its scheme (`https://`). Typical sets: the brand logo on every page to the homepage, source citations to their articles, a call-to-action button to a booking or contact page, an email address to `mailto:`. Do not invent destinations, and do not link to pages that do not exist yet.

## Find the box

- **Figma layers:** use the preflight in [Figma export](figma-export.md). The box of the layer relative to its frame is already in PDF units for an unscaled export. Link the outermost layer that represents the whole element, for example the logo group rather than one letter.
- **Text in any PDF:** use a `search` entry; the build links every place the text appears on that page. Check that the phrase is unique enough not to catch other lines.
- **Other PDFs:** open the page with PyMuPDF and read positions from `page.get_text("dict")` for text, `page.get_image_rects(xref)` for images, or `page.get_drawings()` for vector shapes, then convert to `[x, y, width, height]`.

Coordinates use the top left corner as the origin, in points, in the source page's own size. The build scales them with the page.

## Size the hit area

Add a little padding (2 to 6 points) so small marks are easy to hit, but keep neighboring links from overlapping. A link should never cover body text that is not part of it.

## Verify

`check_pdf.py` confirms each expected link exists with the right URL and position, and that no extra links appeared. It also writes `link-crops.png`, with each link's box outlined in red on a crop of the page: look at it to confirm every box sits on its element. The red outline exists only in the check image, never in the PDF. For a final spot check, open the PDF in Preview and in a browser, hover a link, and click one.

## Pitfalls

- Figma exports hyperlinks set on text but drops links on shapes, images, and frames. Adding the logo link in Figma does not make it clickable in the exported PDF.
- Some viewers ignore links that sit inside a page area covered by a form field or another annotation. Keep links clear of form fields.
- Mail clients and file previewers sometimes disable links in previews. Test in a real viewer before concluding a link is broken.
