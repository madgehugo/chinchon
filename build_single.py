#!/usr/bin/env python3
"""Bundle the project into ONE self-contained HTML file.

    python3 build_single.py            ->  chinchon-single.html

It copies index.html and replaces
    <link rel="stylesheet" href="style.css">   with an inline <style> block, and
    <script src="rules.js"></script> ...        with inline <script> blocks,
keeping the same order. Nothing else changes, so the bundled file behaves
exactly like the multi-file version. Edit the separate files, then re-run this.
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
out_name = sys.argv[1] if len(sys.argv) > 1 else "chinchon-single.html"

html = (root / "index.html").read_text(encoding="utf-8")


def read(name: str) -> str:
    return (root / name).read_text(encoding="utf-8")


def inline_css(match: re.Match) -> str:
    return "<style>\n" + read(match.group(1)).rstrip() + "\n</style>"


def inline_js(match: re.Match) -> str:
    code = read(match.group(1)).rstrip()
    if "</script" in code.lower():
        sys.exit(f"{match.group(1)} contains '</script', which would end the inline script early")
    return "<script>\n" + code + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

(root / out_name).write_text(html, encoding="utf-8")
print(f"wrote {out_name} ({len(html) / 1024:.0f} KB)")
