# Manifest

`build_pdf.py` and `check_pdf.py` both read one JSON manifest. Paths inside it are relative to the manifest's folder, so keep the manifest next to the page exports.

```json
{
  "output": "../Report 2026 - Client.pdf",
  "page_size": [612, 792],
  "link_padding": 4,
  "metadata": {"title": "Report 2026", "author": "Client", "subject": "One-line description"},
  "pages": [
    {"file": "p01.pdf", "links": [{"rect": [56, 56, 149.3, 26.3], "url": "https://example.com"}]},
    {"file": "p02.pdf", "links": [
      {"rect": [672, 984.5, 88, 15.5], "url": "https://example.com"},
      {"search": "example.com/report", "url": "https://example.com/report", "padding": 2}
    ]},
    {"file": "deck.pdf", "page": 3, "links": []}
  ]
}
```

| Field | Meaning |
| --- | --- |
| `output` | The PDF to write. |
| `page_size` | `"source"` keeps the export size. A `[width, height]` in points resizes every page; it must have the same aspect ratio as the source page. US Letter is `[612, 792]`, A4 is `[595.28, 841.89]`. A Figma frame of 816 x 1056 px fits US Letter exactly. |
| `link_padding` | Points of extra clickable area around each link box, in source units. 4 suits small logos. |
| `metadata` | Document title, author, and subject shown by viewers and search. |
| `pages[].file` | A PDF export of one page or a multi-page file. |
| `pages[].page` | Which page of `file` to use, counting from 1. Defaults to 1. |
| `pages[].waive` | Optional, only after the director has seen the page and accepted the risk: a list of check names to report as waived instead of failed, currently `"soft-mask-transfer"`, with `"waive_reason"` saying who approved it and why. The check prints every waiver. |
| `pages[].links[]` | Links to add. `rect` is `[x, y, width, height]` in the source page's coordinates (Figma frame pixels, top left origin). `search` instead finds every occurrence of that text on the page and links each one. `padding` overrides `link_padding`. |

Links already in the source pages, such as Figma text hyperlinks, are kept and moved with the resize. Do not list them again, or the check will report an extra link.
