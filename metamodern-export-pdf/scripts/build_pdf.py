#!/usr/bin/env python3
"""Merge per-page PDF exports into one PDF, resize pages, and add link annotations.

Usage: python build_pdf.py MANIFEST.json

The manifest describes the source pages, the output page size, and the links to add.
See references/manifest.md for the format. Paths in the manifest are relative to it.

Why the pipeline looks like this:
- Pages are copied with insert_pdf and resized with one `cm` transform at the start of
  the content stream. Wrapping a page in a form XObject (show_pdf_page) changes how
  nested soft masks resolve, and Apple's PDF engine then blanks large areas.
- Figma wraps a whole page in a page-size soft mask when a layer has a rotation or an
  effect. When that mask is provably a no-op (an opaque alpha mask covering the page),
  it is removed, because Apple's engine drops parts of it once the page is scaled.
- Figma keeps text hyperlinks, so existing URI links are carried over and rescaled.
  Links on vectors and images (logos) never survive a Figma export and are added here.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

TOKEN = re.compile(rb"/[^\s/\[\]<>()]+|-?\d*\.?\d+|[A-Za-z*'\"]+")
PATH_OPS = {b"m", b"l", b"c", b"v", b"y", b"re", b"h"}
STYLE_OPS = {b"q", b"Q", b"cm", b"cs", b"CS", b"sc", b"scn", b"g", b"rg", b"k", b"f", b"f*", b"n", b"W", b"W*"}


def resolve(doc, xref, key):
    """Return (kind, value) for key under xref, following one indirect reference."""
    kind, val = doc.xref_get_key(xref, key)
    if kind == "xref":
        return "xref", int(val.split()[0])
    return kind, val


def mask_is_noop(doc, page, gs_name):
    """True when the named ExtGState only applies an opaque alpha soft mask covering the page."""
    base = f"Resources/ExtGState/{gs_name}"
    kind, gs = resolve(doc, page.xref, base)
    if kind == "null":
        return False
    gs_obj = doc.xref_object(gs, compressed=True) if kind == "xref" else gs
    keys = set(re.findall(r"/(\w+)", re.sub(r"<<.*>>", "", gs_obj[2:-2], flags=re.S)))
    if keys - {"Type", "ExtGState", "SMask", "ca", "CA"}:
        return False
    for alpha in re.findall(r"/(?:ca|CA)\s*([\d.]+)", gs_obj):
        if float(alpha) != 1:
            return False
    ref = re.search(r"/SMask\s*(\d+) 0 R", gs_obj)
    mask = doc.xref_object(int(ref.group(1)), compressed=True) if ref else gs_obj
    s = re.search(r"/S\s*/(\w+)", mask)
    g = re.search(r"/G\s*(\d+) 0 R", mask)
    if not s or s.group(1) != "Alpha" or not g or "/TR" in mask or "/BC" in mask:
        return False
    form = int(g.group(1))
    bbox = re.search(r"/BBox\s*\[([^\]]+)\]", doc.xref_object(form, compressed=True))
    page_box = page.mediabox
    if not bbox:
        return False
    x0, y0, x1, y1 = (float(v) for v in bbox.group(1).split())
    if x0 > page_box.x0 or y0 > page_box.y0 or x1 < page_box.x1 or y1 < page_box.y1:
        return False
    # The mask form must be one filled path, drawn untransformed, that covers the page.
    tokens = TOKEN.findall(doc.xref_stream(form))
    nums, points, filled = [], [], False
    for tok in tokens:
        if re.fullmatch(rb"-?\d*\.?\d+", tok):
            nums.append(float(tok))
            continue
        if tok.startswith(b"/"):
            continue
        if tok == b"cm" and [round(v, 6) for v in nums[-6:]] != [1, 0, 0, 1, 0, 0]:
            return False
        if tok in (b"m", b"l"):
            points.append(nums[-2:])
        elif tok == b"re":
            x, y, w, h = nums[-4:]
            points += [[x, y], [x + w, y + h]]
        elif tok in (b"f", b"f*"):
            filled = True
        elif tok not in PATH_OPS and tok not in STYLE_OPS:
            return False
        nums = []
    if not filled or not points:
        return False
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs) <= page_box.x0 and min(ys) <= page_box.y0 and max(xs) >= page_box.x1 and max(ys) >= page_box.y1


def strip_noop_page_mask(doc, page):
    """Remove a leading `/En gs /Xn Do` page mask when the mask is a no-op. Returns True if removed."""
    first = page.get_contents()[0]
    content = doc.xref_stream(first)
    match = re.match(rb"((?:[^\n]*\n){0,6}?q\s*)/(\w+) gs\s*(/\w+ Do)", content)
    if not match or not mask_is_noop(doc, page, match.group(2).decode()):
        return False
    doc.update_stream(first, content[: match.end(1)] + match.group(3) + content[match.end():])
    return True


def new_stream(doc, data):
    xref = doc.get_new_xref()
    doc.update_object(xref, "<<>>")
    doc.update_stream(xref, data)
    return xref


def link_rect(page_src, spec, pad):
    """Rect in source page units for a link spec: explicit rect [x, y, w, h] or a text search."""
    if "rect" in spec:
        x, y, w, h = spec["rect"]
        return [pymupdf.Rect(x - pad, y - pad, x + w + pad, y + h + pad)]
    hits = page_src.search_for(spec["search"])
    if not hits:
        raise SystemExit(f"link text not found on page: {spec['search']!r}")
    return [pymupdf.Rect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad) for r in hits]


def main(manifest_path):
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    m = json.loads(manifest_path.read_text())
    pad = m.get("link_padding", 4)
    out = pymupdf.open()
    report = []
    for n, spec in enumerate(m["pages"], 1):
        src = pymupdf.open(root / spec["file"])
        out.insert_pdf(src, from_page=spec.get("page", 1) - 1, to_page=spec.get("page", 1) - 1)
        page = out[-1]
        src_box = page.mediabox
        target = m.get("page_size", "source")
        tw, th = (src_box.width, src_box.height) if target == "source" else target
        scale = tw / src_box.width
        if abs(th / src_box.height - scale) > 0.005 * scale:
            raise SystemExit(f"page {n}: {src_box.width}x{src_box.height} does not match the aspect of {tw}x{th}")
        notes = []
        if strip_noop_page_mask(out, page):
            notes.append("removed no-op page mask")
        kept = [link for link in page.get_links() if link.get("uri")]
        others = [link for link in page.get_links() if not link.get("uri")]
        if others:
            notes.append(f"dropped {len(others)} non-URI links")
        for link in page.get_links():
            page.delete_link(link)
        if scale != 1 or src_box.x0 or src_box.y0:
            pre = new_stream(out, f"q {scale:.6f} 0 0 {scale:.6f} {-src_box.x0 * scale:.4f} {-src_box.y0 * scale:.4f} cm\n".encode())
            post = new_stream(out, b"\nQ\n")
            body = " ".join(f"{x} 0 R" for x in page.get_contents())
            out.xref_set_key(page.xref, "Contents", f"[{pre} 0 R {body} {post} 0 R]")
            for key in ("CropBox", "TrimBox", "BleedBox", "ArtBox"):
                out.xref_set_key(page.xref, key, "null")
            out.xref_set_key(page.xref, "MediaBox", f"[0 0 {tw:g} {th:g}]")
            page = out[-1]
        for link in kept:
            page.insert_link({"kind": pymupdf.LINK_URI, "uri": link["uri"], "from": link["from"] * scale})
        added = 0
        src_page = src[spec.get("page", 1) - 1]
        for link in spec.get("links", []):
            for rect in link_rect(src_page, link, link.get("padding", pad)):
                page.insert_link({"kind": pymupdf.LINK_URI, "uri": link["url"], "from": rect * scale})
                added += 1
        report.append(f"page {n}: {tw:g}x{th:g}, kept {len(kept)} links, added {added}" + ("; " + "; ".join(notes) if notes else ""))
    if m.get("metadata"):
        out.set_metadata(m["metadata"])
    # garbage=3 compacts without merging identical streams, so mask and artwork copies stay separate.
    output = root / m["output"]
    out.save(output, garbage=3, deflate=True)
    print("\n".join(report))
    print(f"wrote {output} ({output.stat().st_size / 1e6:.1f} MB, {len(out)} pages)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
