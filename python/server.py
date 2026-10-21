#!/usr/bin/env python3
"""Run with python3 python/server.py. The server only listens on loopback."""
import json
import os
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit, unquote
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore

from wave_engine import calculate

calculation_slot = BoundedSemaphore(1)
STATIC_ROOT = (Path(__file__).resolve().parent.parent / "dist").resolve()

def resolve_asset(request_path):
    relative = unquote(urlsplit(request_path).path).lstrip("/") or "index.html"
    candidate = (STATIC_ROOT / relative).resolve()
    return candidate if candidate.is_relative_to(STATIC_ROOT) and candidate.is_file() else None


class Handler(BaseHTTPRequestHandler):
    server_version = "DualBeamWave/1.0"

    def reply(self, status, payload):
        body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            self.reply(200, {"status": "ok", "engine": "numpy-scipy-angular-spectrum", "local": True})
        else:
            asset = resolve_asset(self.path)
            if asset is None:
                return self.reply(404, {"error": "Page not found. Run npm run build to serve the local application here."})
            body = asset.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(asset.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/wave":
            return self.reply(404, {"error": "Unknown endpoint"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400, {"error": "Invalid Content-Length"})
        if not 0 < length <= 65536:
            return self.reply(413, {"error": "JSON body must be 1 to 65536 bytes"})
        if not calculation_slot.acquire(blocking=False):
            return self.reply(429, {"error": "Calculation in progress; try again shortly"})
        try:
            payload = json.loads(self.rfile.read(length))
            result = calculate(payload)
            self.reply(200, result)
        except (ValueError, TypeError, OverflowError) as exc:
            self.reply(400, {"error": str(exc)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            print(f"Wave calculation failed: {exc}", flush=True)
            self.reply(500, {"error": "Local calculation failed; check the Python terminal"})
        finally:
            calculation_slot.release()


if __name__ == "__main__":
    port = int(os.environ.get("WAVE_PORT", "8765"))
    print(f"Dual Beam Lab scalar wave engine: http://127.0.0.1:{port}", flush=True)
    print("Open this URL for the built app; keep the terminal open. For development, run npm run dev separately.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
