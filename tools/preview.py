"""Serve the static build on loopback with external reads and form submissions blocked."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
CONTENT_POLICY = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    "connect-src 'self'; form-action 'none'; frame-src 'none'; "
    "base-uri 'none'; object-src 'none'"
)


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header("Content-Security-Policy", CONTENT_POLICY)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        local = Path(super().translate_path(path))
        if local.suffix or local.exists():
            return str(local)
        html = local.with_suffix(".html")
        return str(html if html.is_file() else local)

    def send_error(self, code, message=None, explain=None):
        if code != 404:
            return super().send_error(code, message, explain)
        page = (DIST / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(page)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3000)
    args = parser.parse_args()
    if not (DIST / "index.html").is_file() or not (DIST / "404.html").is_file():
        parser.error("Run npm run build before starting the preview.")
    with ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler) as server:
        print(f"EXM preview at http://127.0.0.1:{server.server_port}/", flush=True)
        server.serve_forever()
