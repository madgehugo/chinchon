#!/usr/bin/env python3
"""Bundle the project into ONE self-contained HTML file.

    python3 build_single.py            ->  chinchon-single.html

It copies index.html and replaces
    <link rel="stylesheet" href="style.css">   with an inline <style> block, and
    <link rel="icon" href="favicon.svg" ...>   with a data: URL, and
    <script src="rules.js"></script> ...        with inline <script> blocks,
keeping the same order. Nothing else changes, so the bundled file behaves
exactly like the multi-file version. Edit the separate files, then re-run this.

It only relies on the tag shapes above, so a new script (such as i18n.js, the English
and Spanish text) needs no change here, as long as it is listed in index.html in
exactly that form. The text lives in i18n.js, not in the HTML, apart from the
English fallback written in index.html and the data-i18n attributes, which the
bundle keeps unchanged.
"""
import base64
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


def inline_icon(match: re.Match) -> str:
    # The favicon becomes a data: URL (the file's bytes, base64-encoded, inside the href itself).
    data = base64.b64encode((root / match.group(1)).read_bytes()).decode("ascii")
    return f'<link rel="icon" href="data:image/svg+xml;base64,{data}" type="image/svg+xml">'


html = re.sub(r'<link rel="icon" href="([^"]+)" type="image/svg\+xml">', inline_icon, html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

(root / out_name).write_text(html, encoding="utf-8")
print(f"wrote {out_name} ({len(html) / 1024:.0f} KB)")
