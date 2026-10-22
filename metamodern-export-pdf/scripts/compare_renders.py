#!/usr/bin/env python3
"""Compare two renders of the same frame, such as a Figma PNG of the original frame and of
its export copy, and say whether they look the same.

Usage: python compare_renders.py ORIGINAL.png COPY.png [--diff OUT.png]

Passes when at most 0.01% of pixels differ by more than 32 levels in any channel, which
allows anti-aliasing noise but fails on any visible line, box, or color change. With --diff
it writes the original and the copy side by side, cropped to where they differ.
"""
import argparse
import sys

import numpy as np
from PIL import Image

LEVEL = 32
SHARE = 0.0001


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("original")
    ap.add_argument("copy")
    ap.add_argument("--diff")
    args = ap.parse_args()
    a_img, b_img = Image.open(args.original).convert("RGB"), Image.open(args.copy).convert("RGB")
    if a_img.size != b_img.size:
        sys.exit(f"sizes differ: {a_img.size} vs {b_img.size}")
    a, b = np.asarray(a_img, dtype=np.int16), np.asarray(b_img, dtype=np.int16)
    d = np.abs(a - b).max(-1)
    bad = int((d > LEVEL).sum())
    share = bad / d.size
    print(f"max difference {int(d.max())}, pixels over {LEVEL}: {bad} ({share:.4%})")
    if args.diff and bad:
        ys, xs = np.where(d > LEVEL)
        box = (max(0, xs.min() - 20), max(0, ys.min() - 20), min(d.shape[1], xs.max() + 20), min(d.shape[0], ys.max() + 20))
        left, right = a_img.crop(box), b_img.crop(box)
        out = Image.new("RGB", (left.width * 2 + 10, left.height), "white")
        out.paste(left, (0, 0))
        out.paste(right, (left.width + 10, 0))
        out.save(args.diff)
        print(f"wrote {args.diff} (original left, copy right)")
    if share > SHARE:
        print("DIFFERENT: the copy changes how the frame looks")
        sys.exit(1)
    print("SAME")


if __name__ == "__main__":
    main()
