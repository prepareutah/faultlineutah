#!/usr/bin/env python3
"""Local preview server for the site/ folder, with caching off so edits show
up on every reload.  Run from the project root:  python3 scripts/serve.py
Then open http://localhost:8737
"""

import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8737


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    except OSError as e:
        if e.errno not in (48, 98):  # "address already in use" on macOS / Linux
            raise
        sys.exit("Port %d is already in use, so the site is probably already running: open http://localhost:%d\n"
                 "To start another copy anyway, pick a different port:  python3 scripts/serve.py %d" % (PORT, PORT, PORT + 1))
    print("Serving %s at http://localhost:%d  (Ctrl+C to stop)" % (ROOT, PORT))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
