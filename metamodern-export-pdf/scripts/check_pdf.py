#!/usr/bin/env python3
"""Check a built PDF against its source pages in several renderers before delivery.

Usage: python check_pdf.py MANIFEST.json [--out CHECK_DIR] [--skip-apple] [--skip-poppler]

Checks, per page:
- no fragile constructs: soft masks with transfer functions (/TR). Figma writes these for
  inner shadows and for drop shadows with show-behind off; some Apple viewers ignore them and
  paint the masked layer as a solid box. A page may waive one with director approval.
- page count and page size match the manifest
- every carried and added link exists with the right URL and position
- text is still live text when the source page had text
- the page looks like its source page in pdfium (Chrome), Poppler, and Apple PDFKit
  (Preview, Safari, Mail), both drawn whole and drawn in zoomed tiles. A blank or
  missing area shows up as a block that differs sharply from the source.

Writes a contact sheet and a strip of link crops (link boxes outlined in red, only in
the check image) to CHECK_DIR, prints one line per page, and exits 1 on any failure.
"""
import argparse
import json
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pymupdf
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
SCALE = 2  # render scale for comparisons (144 dpi for a points-based page)
BLOCK = 24  # comparison block size in pixels
BLOCK_LIMIT = 48  # mean absolute difference that marks a block as wrong
SHARE_LIMIT = 0.002  # share of wrong blocks a page may have (renderer anti-aliasing noise)
WORST_LIMIT = 120  # any block this far off is a missing or blank area
MEAN_LIMIT = 6  # whole-page mean absolute difference limit


def compare(img, ref):
    """Return (page mean diff, worst block diff, share of failing blocks)."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    b = np.asarray(ref.convert("RGB").resize(img.size), dtype=np.float32)
    d = np.abs(a - b).mean(-1)
    h, w = d.shape
    hb, wb = h // BLOCK, w // BLOCK
    blocks = d[: hb * BLOCK, : wb * BLOCK].reshape(hb, BLOCK, wb, BLOCK).mean((1, 3))
    return float(d.mean()), float(blocks.max()), float((blocks > BLOCK_LIMIT).mean())


def fragile_constructs(path):
    """Names of constructs in a PDF file that some viewers render wrongly."""
    doc = pymupdf.open(path)
    found = set()
    for xref in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(xref, compressed=True)
        except Exception:
            continue
        if "/SMask" in obj and "/TR" in obj:
            found.add("soft-mask-transfer")
    return sorted(found)


FRAGILE = {
    "soft-mask-transfer": "soft mask with a transfer function (/TR), from a Figma inner shadow or a drop shadow with show-behind off",
}


def pdfium_pages(path, scale_for_page):
    doc = pdfium.PdfDocument(str(path))
    return [doc[i].render(scale=scale_for_page(i)).to_pil() for i in range(len(doc))]


def build_pdfkit(work):
    if platform.system() != "Darwin" or not shutil.which("swiftc"):
        return None
    exe = work / "render_pdfkit"
    subprocess.run(["swiftc", "-O", str(HERE / "render_pdfkit.swift"), "-o", str(exe)], check=True, capture_output=True)
    return exe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--out")
    ap.add_argument("--skip-apple", action="store_true")
    ap.add_argument("--skip-poppler", action="store_true")
    args = ap.parse_args()
    mpath = Path(args.manifest).resolve()
    root = mpath.parent
    m = json.loads(mpath.read_text())
    pad = m.get("link_padding", 4)
    out_pdf = root / m["output"]
    check_dir = Path(args.out).resolve() if args.out else root / "pdf-check"
    check_dir.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="pdfcheck-"))
    doc = pymupdf.open(out_pdf)
    failures = []

    if len(doc) != len(m["pages"]):
        failures.append(f"page count {len(doc)} != manifest {len(m['pages'])}")

    sources, scales = [], []
    for n, spec in enumerate(m["pages"]):
        src = pymupdf.open(root / spec["file"])[spec.get("page", 1) - 1]
        sources.append(src)
        target = m.get("page_size", "source")
        tw = src.rect.width if target == "source" else target[0]
        scales.append(tw / src.rect.width)

    # Portability: constructs that render as solid boxes in some Apple viewers.
    for n, spec in enumerate(m["pages"], 1):
        for issue in fragile_constructs(root / spec["file"]):
            if issue in spec.get("waive", []):
                print(f"page {n}: WAIVED {FRAGILE[issue]}: {spec.get('waive_reason', 'no reason recorded')}")
                if not spec.get("waive_reason"):
                    failures.append(f"page {n}: waiver for {issue} has no waive_reason")
            else:
                failures.append(f"page {n}: {FRAGILE[issue]}; see references/renderer-pitfalls.md")

    # Structure: size, links, text.
    for n, (spec, src, s) in enumerate(zip(m["pages"], sources, scales), 1):
        if n > len(doc):
            break
        page = doc[n - 1]
        want_w, want_h = src.rect.width * s, src.rect.height * s
        if abs(page.rect.width - want_w) > 0.5 or abs(page.rect.height - want_h) > 0.5:
            failures.append(f"page {n}: size {page.rect.width:g}x{page.rect.height:g}, expected {want_w:g}x{want_h:g}")
        have = [(link.get("uri"), link["from"]) for link in page.get_links()]
        expect = [(link["uri"], link["from"] * s) for link in src.get_links() if link.get("uri")]
        for link in spec.get("links", []):
            p = link.get("padding", pad)
            if "rect" in link:
                x, y, w, h = link["rect"]
                expect.append((link["url"], pymupdf.Rect(x - p, y - p, x + w + p, y + h + p) * s))
            else:
                for r in src.search_for(link["search"]):
                    expect.append((link["url"], pymupdf.Rect(r.x0 - p, r.y0 - p, r.x1 + p, r.y1 + p) * s))
        for uri, rect in expect:
            if not any(u == uri and abs(r.x0 - rect.x0) < 1 and abs(r.y0 - rect.y0) < 1 and abs(r.x1 - rect.x1) < 1 and abs(r.y1 - rect.y1) < 1 for u, r in have):
                failures.append(f"page {n}: missing link {uri} at {[round(v) for v in rect]}")
        if len(have) != len(expect):
            failures.append(f"page {n}: {len(have)} links, expected {len(expect)}")
        src_chars, out_chars = len(src.get_text().strip()), len(page.get_text().strip())
        if src_chars and out_chars < 0.9 * src_chars:
            failures.append(f"page {n}: live text dropped from {src_chars} to {out_chars} characters")

    # Rendering: each renderer against pdfium renders of the untouched source pages.
    refs = [pdfium_pages(root / spec["file"], lambda i, s=s: SCALE * s)[spec.get("page", 1) - 1] for spec, s in zip(m["pages"], scales)]
    renders = {"pdfium": pdfium_pages(out_pdf, lambda i: SCALE)}
    if not args.skip_poppler and shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-r", str(72 * SCALE), "-png", str(out_pdf), str(work / "pop")], check=True)
        renders["poppler"] = [Image.open(p) for p in sorted(work.glob("pop-*.png"))]
    exe = None if args.skip_apple else build_pdfkit(work)
    if exe:
        subprocess.run([str(exe), str(out_pdf), str(work / "apple"), str(SCALE)], check=True)
        renders["apple"] = [Image.open(p) for p in sorted(work.glob("apple-*.png"))]
        subprocess.run([str(exe), str(out_pdf), str(work / "zoom"), str(SCALE * 3), "512"], check=True)
        renders["apple-zoom"] = [Image.open(p).resize(renders["apple"][i].size) for i, p in enumerate(sorted(work.glob("zoom-*.png")))]
    elif not args.skip_apple:
        failures.append("Apple PDFKit check unavailable (needs macOS with swiftc); rerun on a Mac or pass --skip-apple and say so")

    for n in range(1, min(len(doc), len(refs)) + 1):
        cells = []
        for name, pages in renders.items():
            mean, worst, share = compare(pages[n - 1], refs[n - 1])
            ok = mean <= MEAN_LIMIT and worst <= WORST_LIMIT and share <= SHARE_LIMIT
            cells.append(f"{name} {mean:.1f}/{worst:.0f}" + ("" if ok else " FAIL"))
            if not ok:
                failures.append(f"page {n}: {name} differs from the source (mean {mean:.1f}, worst block {worst:.0f}, {share:.1%} of blocks)")
                renders[name][n - 1].save(check_dir / f"FAIL-p{n:02d}-{name}.png")
        print(f"page {n}: " + ", ".join(cells))

    # Review images: contact sheet and link crops.
    thumbs = [p.copy() for p in renders["pdfium"]]
    for t in thumbs:
        t.thumbnail((360, 360))
    cols = min(7, len(thumbs))
    tw, th = max(t.width for t in thumbs), max(t.height for t in thumbs)
    sheet = Image.new("RGB", (cols * (tw + 8), ((len(thumbs) + cols - 1) // cols) * (th + 8)), "white")
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % cols) * (tw + 8), (i // cols) * (th + 8)))
    sheet.save(check_dir / "contact-sheet.png")
    crops = []
    for n, page in enumerate(doc, 1):
        img = renders["pdfium"][n - 1].convert("RGB")
        k = img.width / page.rect.width
        for link in page.get_links():
            r = link["from"]
            box = [r.x0 * k, r.y0 * k, r.x1 * k, r.y1 * k]
            ox, oy = max(0, box[0] - 30), max(0, box[1] - 20)
            crop = img.crop((ox, oy, min(img.width, box[2] + 30), min(img.height, box[3] + 20))).copy()
            ImageDraw.Draw(crop).rectangle([box[0] - ox, box[1] - oy, box[2] - ox, box[3] - oy], outline="red")
            ImageDraw.Draw(crop).text((2, 2), f"p{n} {link.get('uri', '')[:60]}", fill="red")
            crops.append(crop)
    if crops:
        strip = Image.new("RGB", (max(c.width for c in crops), sum(c.height + 6 for c in crops)), "white")
        y = 0
        for c in crops:
            strip.paste(c, (0, y))
            y += c.height + 6
        strip.save(check_dir / "link-crops.png")

    shutil.rmtree(work, ignore_errors=True)
    print(f"renderers: {', '.join(renders)}; review images in {check_dir}")
    if failures:
        print("FAILED:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print("PASSED")


if __name__ == "__main__":
    main()
