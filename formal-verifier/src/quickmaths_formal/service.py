from __future__ import annotations

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .capabilities import capability_matrix
from .protocol import PROTOCOL_VERSION, handle_message
from .verifier import LEAN_TOOLCHAIN, MATHLIB_REV, VERIFIER_VERSION, _environment_error, _lake_command

MAX_REQUEST_BYTES = 1_000_000
_LOCAL_ORIGIN = re.compile(r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$")


def runtime_status(project_dir: str | Path | None = None) -> dict[str, Any]:
    project = Path(project_dir) if project_dir is not None else Path(__file__).resolve().parents[2]
    command = _lake_command(project)
    error = _environment_error(project, command) if command else "Lean/Lake is not installed."
    return {
        "service": "quickmaths-formal",
        "protocol_version": PROTOCOL_VERSION,
        "verifier_version": VERIFIER_VERSION,
        "lean_available": error is None,
        "environment_error": error,
        "environment": {"backend": "lean4", "lean_toolchain": LEAN_TOOLCHAIN, "library": "mathlib", "mathlib_revision": MATHLIB_REV},
    }


class FormalRequestHandler(BaseHTTPRequestHandler):
    server_version = "QuickMathsFormal/0.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        # The companion service is typically launched from QuickMaths tooling;
        # avoid logging full request data or proof content by default.
        return

    @property
    def _formal_server(self) -> "FormalHTTPServer":
        return self.server  # type: ignore[return-value]

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return bool(_LOCAL_ORIGIN.fullmatch(origin) or origin in self._formal_server.allowed_origins)

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin and self._origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: int, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json(403, {"ok": False, "error": {"code": "origin_forbidden", "message": "Origin is not allowed."}})
            return
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def _bytes(self, status: int, payload: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json(403, {"ok": False, "error": {"code": "origin_forbidden", "message": "Origin is not allowed."}})
            return
        if self.path == "/health":
            self._json(200, runtime_status(self._formal_server.project_dir))
            return
        if self.path == "/capabilities":
            self._json(200, capability_matrix())
            return
        static = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8"),
            "/style.css": ("style.css", "text/css; charset=utf-8"),
        }.get(self.path)
        if static is not None:
            filename, content_type = static
            path = Path(__file__).with_name("web") / filename
            try:
                payload = path.read_bytes()
            except OSError:
                self._json(404, {"ok": False, "error": {"code": "workbench_missing", "message": "Proof workbench assets are unavailable."}})
                return
            self._bytes(200, payload, content_type)
            return
        self._json(404, {"ok": False, "error": {"code": "not_found", "message": "Unknown endpoint."}})

    def do_POST(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json(403, {"ok": False, "error": {"code": "origin_forbidden", "message": "Origin is not allowed."}})
            return
        if self.path != "/v1/rpc":
            self._json(404, {"ok": False, "error": {"code": "not_found", "message": "Unknown endpoint."}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"ok": False, "error": {"code": "bad_length", "message": "Invalid Content-Length."}})
            return
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._json(413, {"ok": False, "error": {"code": "request_size", "message": "RPC body must be between 1 byte and 1 MB."}})
            return
        body = self.rfile.read(length)
        try:
            message = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._json(400, {"ok": False, "error": {"code": "invalid_json", "message": str(exc)}})
            return
        response = handle_message(message, project_dir=self._formal_server.project_dir)
        self._json(200 if response.get("ok") else 400, response)


class FormalHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        *,
        project_dir: str | Path,
        allowed_origins: set[str] | None = None,
    ) -> None:
        super().__init__(server_address, FormalRequestHandler)
        self.project_dir = Path(project_dir)
        self.allowed_origins = set(allowed_origins or set())


def create_server(
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    project_dir: str | Path,
    allowed_origins: set[str] | None = None,
) -> FormalHTTPServer:
    return FormalHTTPServer((host, port), project_dir=project_dir, allowed_origins=allowed_origins)


def run_server(
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    project_dir: str | Path,
    allowed_origins: set[str] | None = None,
) -> None:
    server = create_server(host, port, project_dir=project_dir, allowed_origins=allowed_origins)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
