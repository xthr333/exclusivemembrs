"""Validate source links using website-root semantics, without network requests."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "index.html", "artists.html", "shop.html", "events.html", "residency.html",
    "studios.html", "updates.html", "submit.html", "about.html", "contact.html",
    "404.html", "style.css", "rollout.css", "script.js", "config.js",
    "rollout.js", "updates.json", "robots.txt", "sitemap.xml", "_headers",
]
STALE = [r"7 OF 12", r"7 LOCKED", r"8 APPROVED DUOS", r"9 LOCKED", r"3 OPEN", r"38BXBY"]


def resolve_reference(root, page, reference):
    """Return a local source path, or None for external/in-page references.

    /style.css means <website root>/style.css, never the runner's /style.css.
    Relative links resolve from the page, and / maps to the homepage.
    """
    parts = urlsplit(reference)
    if parts.scheme.lower() in {"http", "https", "mailto", "tel", "data"} or parts.netloc:
        return None
    if parts.scheme:
        raise ValueError(f"Unsupported URL scheme: {parts.scheme}")
    if not parts.path:
        return None
    root = root.resolve()
    decoded = unquote(parts.path)
    target = ((root / decoded.lstrip("/")) if decoded.startswith("/") else page.parent / decoded).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Reference escapes website root")
    if target.is_dir():
        target /= "index.html"
    return target


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"href", "src"} and value:
                self.refs.append(value)


def validate(root=ROOT):
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    if missing:
        raise ValueError("Missing required files: " + ", ".join(missing))
    for name in ["updates.json", "songwars-public.json", "wrangler.jsonc"]:
        json.loads((root / name).read_text(encoding="utf-8"))
    broken = []
    for page in root.glob("*.html"):
        parser = References()
        parser.feed(page.read_text(encoding="utf-8"))
        for reference in parser.refs:
            try:
                target = resolve_reference(root, page, reference)
                if target is not None and not target.is_file():
                    broken.append(f"{page.name}: {reference}")
            except ValueError as error:
                broken.append(f"{page.name}: {reference} ({error})")
    if broken:
        raise ValueError("Broken local references:\n" + "\n".join(broken))
    combined = "\n".join(p.read_text(encoding="utf-8") for p in root.glob("*.html"))
    hits = [pattern for pattern in STALE if re.search(pattern, combined, re.I)]
    if hits:
        raise ValueError("Stale public SongWars copy found: " + ", ".join(hits))
    print("EXM site files, root-relative links and stale-copy checks passed.")


if __name__ == "__main__":
    try:
        validate()
    except ValueError as error:
        raise SystemExit(str(error))
