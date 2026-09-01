from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import tempfile
import threading
import webbrowser
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


BRIDGE_FORMAT = "quickmaths.github-bridge"
BRIDGE_SCHEMA_VERSION = "1.0"
LEARNER_STATE_PATH = "learner-state.json"
AGENT_STATE_PATH = "agent-state.json"
ALLOWED_STATE_PATHS = frozenset({LEARNER_STATE_PATH, AGENT_STATE_PATH})
API_PREFIX = "/__quickmaths_bridge__"
MAX_STATE_BYTES = 10_000_000
MAX_REQUEST_BYTES = MAX_STATE_BYTES + 100_000
_IDENTIFIER = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_CAPABILITY = re.compile(r"^[A-Za-z0-9_-]{32,200}$")


class LocalBridgeError(RuntimeError):
    def __init__(self, message: str, *, status: int = 500, code: str = "local_bridge_error") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class LocalBridgeConflict(LocalBridgeError):
    def __init__(self, message: str = "The GitHub checkpoint changed before this write completed.") -> None:
        super().__init__(message, status=409, code="conflict")


@dataclass(frozen=True)
class RepositoryIdentity:
    owner: str
    repo: str
    branch: str
    url: str


def validate_branch(value: str) -> str:
    branch = str(value or "main").strip()
    invalid = (
        not branch
        or len(branch) > 200
        or branch.startswith("-")
        or branch.endswith(".")
        or any(character.isspace() or character in "~^:?*[\\" for character in branch)
        or ".." in branch
        or "@{" in branch
    )
    if invalid:
        raise LocalBridgeError("Branch name is invalid.", status=400, code="invalid_config")
    return branch


def parse_github_repository_url(value: str, *, branch: str = "main") -> RepositoryIdentity:
    raw = str(value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme != "https" or parsed.hostname != "github.com" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise LocalBridgeError(
            "Repository must be an HTTPS github.com URL without embedded credentials.",
            status=400,
            code="invalid_repository",
        )
    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2:
        raise LocalBridgeError("Repository URL must identify exactly one owner and repository.", status=400, code="invalid_repository")
    owner, repo = parts
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    if not _IDENTIFIER.fullmatch(owner) or not _IDENTIFIER.fullmatch(repo):
        raise LocalBridgeError("Repository owner or name is invalid.", status=400, code="invalid_repository")
    if repo.lower() == "quickmaths":
        raise LocalBridgeError(
            "Use a separate private data repository, not the public QuickMaths source repository.",
            status=400,
            code="source_repository_forbidden",
        )
    normalized = f"https://github.com/{owner}/{repo}.git"
    return RepositoryIdentity(owner=owner, repo=repo, branch=validate_branch(branch), url=normalized)


def default_checkout_root(identity: RepositoryIdentity) -> Path:
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        base = Path(os.environ["LOCALAPPDATA"])
    elif os.environ.get("XDG_DATA_HOME"):
        base = Path(os.environ["XDG_DATA_HOME"])
    else:
        base = Path.home() / ".local" / "share"
    digest = hashlib.sha256(f"{identity.owner}/{identity.repo}@{identity.branch}".encode("utf-8")).hexdigest()[:12]
    return base / "QuickMaths" / "Bridge" / f"{identity.owner}-{identity.repo}-{digest}"


def _creation_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


class GitBridgeRepository:
    """A read checkout plus transactional, short-lived write clones."""

    def __init__(self, identity: RepositoryIdentity, checkout_root: Path) -> None:
        self.identity = identity
        self.checkout_root = Path(checkout_root).resolve()
        self.reader_checkout = self.checkout_root / "reader"
        self.write_root = self.checkout_root / "writes"
        self._lock = threading.RLock()

    def _git(
        self,
        args: list[str],
        *,
        cwd: Path | None = None,
        timeout: int = 60,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["GIT_TERMINAL_PROMPT"] = "0"
        result = subprocess.run(
            ["git", "-c", "credential.interactive=never", *args],
            cwd=str(cwd) if cwd else None,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            shell=False,
            creationflags=_creation_flags(),
            check=False,
        )
        if check and result.returncode:
            detail = (result.stderr or result.stdout or "Git command failed.").strip().splitlines()[-1]
            raise LocalBridgeError(detail[:500], status=502, code="git_error")
        return result

    def _clone(self, destination: Path) -> None:
        self._git([
            "clone", "--quiet", "--depth", "1", "--single-branch",
            "--branch", self.identity.branch, self.identity.url, str(destination),
        ], timeout=120)

    def ensure_checkout(self) -> None:
        with self._lock:
            self.checkout_root.mkdir(parents=True, exist_ok=True)
            self.write_root.mkdir(parents=True, exist_ok=True)
            if self.reader_checkout.exists() and not (self.reader_checkout / ".git").is_dir():
                raise LocalBridgeError("The local Bridge checkout path is occupied by a non-Git directory.", code="checkout_error")
            if not self.reader_checkout.exists():
                self._clone(self.reader_checkout)
            origin = self._git(["remote", "get-url", "origin"], cwd=self.reader_checkout).stdout.strip()
            if origin.rstrip("/").removesuffix(".git").lower() != self.identity.url.removesuffix(".git").lower():
                raise LocalBridgeError("The local Bridge checkout points to a different repository.", code="checkout_error")
            self._refresh_reader()

    def _refresh_reader(self) -> None:
        self._git(["pull", "--quiet", "--ff-only", "origin", self.identity.branch], cwd=self.reader_checkout, timeout=120)

    def _blob_sha(self, checkout: Path, path: str) -> str | None:
        result = self._git(["rev-parse", f"HEAD:{path}"], cwd=checkout, check=False)
        if result.returncode:
            return None
        value = result.stdout.strip()
        return value if re.fullmatch(r"[0-9a-f]{40,64}", value) else None

    def info(self) -> dict[str, Any]:
        self.ensure_checkout()
        revision = self._git(["rev-parse", "HEAD"], cwd=self.reader_checkout).stdout.strip()
        return {
            "transport": "local-git",
            "owner": self.identity.owner,
            "repo": self.identity.repo,
            "branch": self.identity.branch,
            "repository": f"{self.identity.owner}/{self.identity.repo}",
            "revision": revision,
        }

    def read_file(self, path: str) -> dict[str, Any]:
        _validate_state_path(path)
        with self._lock:
            self.ensure_checkout()
            sha = self._blob_sha(self.reader_checkout, path)
            if not sha:
                return {"exists": False, "sha": None, "content": None}
            file_path = (self.reader_checkout / path).resolve()
            if file_path.parent != self.reader_checkout.resolve() or not file_path.is_file():
                raise LocalBridgeError("Bridge checkpoint is not a regular file.", status=422, code="invalid_remote_state")
            if file_path.stat().st_size > MAX_STATE_BYTES:
                raise LocalBridgeError("Bridge checkpoint is too large.", status=422, code="invalid_remote_state")
            return {"exists": True, "sha": sha, "content": file_path.read_text(encoding="utf-8")}

    def write_file(self, path: str, content: str, *, expected_sha: str | None) -> dict[str, Any]:
        channel = _validate_state_path(path)
        _validate_bridge_envelope(content, channel=channel)
        if expected_sha is not None and not re.fullmatch(r"[0-9a-f]{40,64}", expected_sha):
            raise LocalBridgeError("Checkpoint revision is invalid.", status=400, code="invalid_sha")
        with self._lock:
            self.checkout_root.mkdir(parents=True, exist_ok=True)
            self.write_root.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="write-", dir=self.write_root) as raw_checkout:
                checkout = Path(raw_checkout)
                self._clone(checkout)
                current_sha = self._blob_sha(checkout, path)
                if current_sha != expected_sha:
                    raise LocalBridgeConflict("The GitHub checkpoint changed before this write began.")
                (checkout / path).write_text(content, encoding="utf-8", newline="\n")
                self._git(["config", "user.name", "QuickMaths Bridge"], cwd=checkout)
                self._git(["config", "user.email", "quickmaths-bridge@users.noreply.github.com"], cwd=checkout)
                self._git(["add", "--", path], cwd=checkout)
                changed = self._git(["diff", "--cached", "--quiet", "--", path], cwd=checkout, check=False).returncode != 0
                if changed:
                    self._git(["commit", "--quiet", "-m", f"QuickMaths Bridge: {channel} checkpoint"], cwd=checkout)
                    pushed = self._git(
                        ["push", "--quiet", "origin", f"HEAD:refs/heads/{self.identity.branch}"],
                        cwd=checkout,
                        timeout=120,
                        check=False,
                    )
                    if pushed.returncode:
                        detail = (pushed.stderr or pushed.stdout or "").lower()
                        if "rejected" in detail or "fetch first" in detail or "non-fast-forward" in detail:
                            raise LocalBridgeConflict()
                        raise LocalBridgeError("GitHub rejected the Bridge checkpoint push.", status=502, code="git_push_error")
                next_sha = self._blob_sha(checkout, path)
                commit_sha = self._git(["rev-parse", "HEAD"], cwd=checkout).stdout.strip()
            self._refresh_reader()
            return {"sha": next_sha, "commitSha": commit_sha}


def _validate_state_path(path: str) -> str:
    if path not in ALLOWED_STATE_PATHS:
        raise LocalBridgeError("Only QuickMaths learner and agent checkpoints are available.", status=404, code="not_found")
    return "learner" if path == LEARNER_STATE_PATH else "agent"


def _validate_bridge_envelope(content: str, *, channel: str) -> None:
    if not isinstance(content, str) or len(content.encode("utf-8")) > MAX_STATE_BYTES:
        raise LocalBridgeError("Bridge checkpoint is invalid or too large.", status=413, code="invalid_state")
    try:
        value = json.loads(content)
    except json.JSONDecodeError as error:
        raise LocalBridgeError("Bridge checkpoint is not valid JSON.", status=422, code="invalid_state") from error
    valid = (
        isinstance(value, dict)
        and value.get("format") == BRIDGE_FORMAT
        and value.get("schema_version") == BRIDGE_SCHEMA_VERSION
        and value.get("channel") == channel
        and isinstance(value.get("app_state"), dict)
    )
    if channel == "agent":
        valid = valid and isinstance(value.get("base_learner_sha"), str) and bool(value["base_learner_sha"].strip())
    if not valid:
        raise LocalBridgeError("Bridge checkpoint envelope is invalid.", status=422, code="invalid_state")


def _make_handler(
    repository: GitBridgeRepository,
    docs_root: Path,
    capability: str,
    *,
    quiet: bool,
) -> type[SimpleHTTPRequestHandler]:
    root = docs_root.resolve()
    if not root.is_dir() or not (root / "agent-bridge.html").is_file():
        raise LocalBridgeError("QuickMaths docs root is invalid.", code="invalid_docs_root")

    class LocalBridgeHandler(SimpleHTTPRequestHandler):
        server_version = "QuickMathsBridge/1.0"

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, format: str, *args: Any) -> None:
            if not quiet:
                super().log_message(format, *args)

        def translate_path(self, path: str) -> str:
            candidate = Path(super().translate_path(path)).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                return str(root / "__not_found__")
            return str(candidate)

        def end_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _host_allowed(self) -> bool:
            host = self.headers.get("Host", "").lower().split(":", 1)[0]
            return host in {"127.0.0.1", "localhost"}

        def _authorized(self, *, mutating: bool = False) -> bool:
            if not self._host_allowed():
                self._json_error(LocalBridgeError("Invalid local host.", status=403, code="forbidden"))
                return False
            supplied = self.headers.get("X-QuickMaths-Bridge", "")
            if not _CAPABILITY.fullmatch(supplied) or not hmac.compare_digest(supplied, capability):
                self._json_error(LocalBridgeError("Local Bridge capability is missing or invalid.", status=403, code="forbidden"))
                return False
            if mutating:
                origin = self.headers.get("Origin")
                port = self.server.server_address[1]
                allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
                if origin and origin not in allowed_origins:
                    self._json_error(LocalBridgeError("Cross-origin Bridge writes are forbidden.", status=403, code="forbidden"))
                    return False
                fetch_site = self.headers.get("Sec-Fetch-Site")
                if fetch_site and fetch_site not in {"same-origin", "none"}:
                    self._json_error(LocalBridgeError("Cross-site Bridge writes are forbidden.", status=403, code="forbidden"))
                    return False
            return True

        def _send_json(self, value: Any, *, status: int = 200) -> None:
            payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _json_error(self, error: LocalBridgeError) -> None:
            self._send_json({"error": {"code": error.code, "message": str(error)}}, status=error.status)

        def _api_file_path(self) -> str | None:
            parsed = urlparse(self.path)
            prefix = f"{API_PREFIX}/files/"
            if not parsed.path.startswith(prefix):
                return None
            raw = unquote(parsed.path[len(prefix):])
            if "/" in raw or "\\" in raw:
                return None
            return raw

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if not parsed.path.startswith(API_PREFIX):
                super().do_GET()
                return
            if not self._authorized():
                return
            try:
                if parsed.path == f"{API_PREFIX}/info":
                    self._send_json(repository.info())
                    return
                path = self._api_file_path()
                if path is not None:
                    self._send_json(repository.read_file(path))
                    return
                raise LocalBridgeError("Local Bridge endpoint was not found.", status=404, code="not_found")
            except LocalBridgeError as error:
                self._json_error(error)

        def do_PUT(self) -> None:
            path = self._api_file_path()
            if path is None:
                self._json_error(LocalBridgeError("Local Bridge endpoint was not found.", status=404, code="not_found"))
                return
            if not self._authorized(mutating=True):
                return
            try:
                raw_length = self.headers.get("Content-Length", "")
                if not raw_length.isdigit() or int(raw_length) > MAX_REQUEST_BYTES:
                    raise LocalBridgeError("Bridge request is invalid or too large.", status=413, code="invalid_request")
                body = self.rfile.read(int(raw_length))
                try:
                    value = json.loads(body.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise LocalBridgeError("Bridge request is not valid JSON.", status=400, code="invalid_request") from error
                if not isinstance(value, dict) or set(value) - {"content", "sha"}:
                    raise LocalBridgeError("Bridge request contains unknown properties.", status=400, code="invalid_request")
                if not isinstance(value.get("content"), str) or not (value.get("sha") is None or isinstance(value.get("sha"), str)):
                    raise LocalBridgeError("Bridge request fields are invalid.", status=400, code="invalid_request")
                self._send_json(repository.write_file(path, value["content"], expected_sha=value.get("sha")))
            except LocalBridgeError as error:
                self._json_error(error)

        def do_OPTIONS(self) -> None:
            self._json_error(LocalBridgeError("Cross-origin requests are not supported.", status=405, code="method_not_allowed"))

    return LocalBridgeHandler


def create_local_bridge_server(
    repository: GitBridgeRepository,
    *,
    docs_root: Path,
    port: int = 0,
    capability: str | None = None,
    quiet: bool = True,
) -> tuple[ThreadingHTTPServer, str, str]:
    resolved_capability = capability or secrets.token_urlsafe(32)
    if not _CAPABILITY.fullmatch(resolved_capability):
        raise LocalBridgeError("Local Bridge capability is invalid.", status=400, code="invalid_capability")
    handler = _make_handler(repository, Path(docs_root), resolved_capability, quiet=quiet)
    server = ThreadingHTTPServer(("127.0.0.1", int(port)), handler)
    server.daemon_threads = True
    selected_port = server.server_address[1]
    url = f"http://127.0.0.1:{selected_port}/agent-bridge.html#local={resolved_capability}"
    return server, url, resolved_capability


def serve_agent_bridge(
    *,
    repository_url: str,
    branch: str,
    docs_root: Path,
    checkout_root: Path | None,
    port: int,
    open_browser: bool,
) -> int:
    identity = parse_github_repository_url(repository_url, branch=branch)
    repository = GitBridgeRepository(identity, checkout_root or default_checkout_root(identity))
    repository.ensure_checkout()
    server, url, _capability = create_local_bridge_server(repository, docs_root=docs_root, port=port, quiet=False)
    print("QuickMaths local Git Bridge is ready.", flush=True)
    print(url, flush=True)
    print("WebMCP stays in the browser; Git credentials stay in the host Git credential manager.", flush=True)
    if open_browser:
        webbrowser.open(url, new=2)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def add_agent_bridge_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subparsers.add_parser("agent-bridge", help="Serve the WebMCP Agent Bridge using this computer's Git credentials.")
    parser.add_argument("--repo", required=True, help="Private HTTPS GitHub data-repository URL.")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--docs-root", type=Path, default=Path(__file__).resolve().parents[1] / "docs")
    parser.add_argument("--checkout-root", type=Path)
    parser.add_argument("--port", type=int, default=0, help="Loopback port; defaults to a free port.")
    parser.add_argument("--open", action="store_true", dest="open_browser", help="Open the local Agent Bridge in the default browser.")


def run_agent_bridge_from_args(args: argparse.Namespace) -> int:
    if not 0 <= args.port <= 65535:
        raise LocalBridgeError("Port must be between 0 and 65535.", status=400, code="invalid_port")
    return serve_agent_bridge(
        repository_url=args.repo,
        branch=args.branch,
        docs_root=args.docs_root,
        checkout_root=args.checkout_root,
        port=args.port,
        open_browser=args.open_browser,
    )
