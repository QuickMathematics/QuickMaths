from __future__ import annotations

import json
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from quickmaths.local_bridge import (
    AGENT_STATE_PATH,
    API_PREFIX,
    BRIDGE_FORMAT,
    BRIDGE_SCHEMA_VERSION,
    GitBridgeRepository,
    LocalBridgeConflict,
    LocalBridgeError,
    RepositoryIdentity,
    create_local_bridge_server,
    parse_github_repository_url,
    validate_branch,
)


def envelope(channel: str, *, base_learner_sha: str | None = None, marker: str = "state") -> str:
    return json.dumps(
        {
            "format": BRIDGE_FORMAT,
            "schema_version": BRIDGE_SCHEMA_VERSION,
            "channel": channel,
            "updated_at": "2026-09-01T12:00:00Z",
            "device_id": "test-device",
            "base_learner_sha": base_learner_sha if channel == "agent" else None,
            "app_state": {"version": 10, "marker": marker},
        }
    )


def run_git(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", check=True
    )
    return result.stdout.strip()


def seed_remote(tmp_path: Path) -> Path:
    remote = tmp_path / "sync.git"
    seed = tmp_path / "seed"
    run_git("init", "--bare", str(remote))
    run_git("init", str(seed))
    run_git("config", "user.name", "Test", cwd=seed)
    run_git("config", "user.email", "test@example.invalid", cwd=seed)
    (seed / "README.md").write_text("# data\n", encoding="utf-8")
    (seed / "learner-state.json").write_text(envelope("learner"), encoding="utf-8")
    run_git("add", ".", cwd=seed)
    run_git("commit", "-m", "seed", cwd=seed)
    run_git("branch", "-M", "main", cwd=seed)
    run_git("remote", "add", "origin", str(remote), cwd=seed)
    run_git("push", "-u", "origin", "main", cwd=seed)
    return remote


def test_repository_and_branch_validation_is_narrow() -> None:
    identity = parse_github_repository_url("https://github.com/Srednjak/quickmaths-sync.git", branch="main")
    assert identity.owner == "Srednjak"
    assert identity.repo == "quickmaths-sync"
    assert identity.url == "https://github.com/Srednjak/quickmaths-sync.git"
    with pytest.raises(LocalBridgeError, match="embedded credentials"):
        parse_github_repository_url("https://token@github.com/Srednjak/quickmaths-sync.git")
    with pytest.raises(LocalBridgeError, match="separate private data repository"):
        parse_github_repository_url("https://github.com/Srednjak/QuickMaths.git")
    with pytest.raises(LocalBridgeError, match="Branch name"):
        validate_branch("bad branch")


def test_git_repository_reads_and_transactionally_writes_checkpoints(tmp_path: Path) -> None:
    remote = seed_remote(tmp_path)
    identity = RepositoryIdentity(owner="local", repo="sync", branch="main", url=str(remote))
    repository = GitBridgeRepository(identity, tmp_path / "bridge")
    learner = repository.read_file("learner-state.json")
    assert learner["exists"] is True
    assert json.loads(learner["content"])["channel"] == "learner"

    written = repository.write_file(
        AGENT_STATE_PATH,
        envelope("agent", base_learner_sha=learner["sha"], marker="agent"),
        expected_sha=None,
    )
    assert written["sha"]
    assert repository.read_file(AGENT_STATE_PATH)["sha"] == written["sha"]
    with pytest.raises(LocalBridgeConflict):
        repository.write_file(
            AGENT_STATE_PATH,
            envelope("agent", base_learner_sha=learner["sha"], marker="stale"),
            expected_sha=None,
        )
    with pytest.raises(LocalBridgeError, match="Only QuickMaths"):
        repository.read_file("../secret")


class FakeRepository:
    identity = RepositoryIdentity(
        owner="Srednjak",
        repo="quickmaths-sync",
        branch="main",
        url="https://github.com/Srednjak/quickmaths-sync.git",
    )

    def __init__(self) -> None:
        self.files = {"learner-state.json": {"exists": True, "sha": "a" * 40, "content": envelope("learner")}}

    def info(self) -> dict[str, object]:
        return {"transport": "local-git", "owner": "Srednjak", "repo": "quickmaths-sync", "branch": "main", "revision": "c" * 40}

    def read_file(self, path: str) -> dict[str, object]:
        if path not in {"learner-state.json", "agent-state.json"}:
            raise LocalBridgeError("Only QuickMaths checkpoints are available.", status=404, code="not_found")
        return self.files.get(path, {"exists": False, "sha": None, "content": None})

    def write_file(self, path: str, content: str, *, expected_sha: str | None) -> dict[str, object]:
        current = self.files.get(path)
        if (current or {}).get("sha") != expected_sha:
            raise LocalBridgeConflict()
        value = {"exists": True, "sha": "b" * 40, "content": content}
        self.files[path] = value
        return {"sha": value["sha"], "commitSha": "d" * 40}


def request_json(url: str, *, capability: str | None = None, method: str = "GET", body: dict[str, object] | None = None, origin: str | None = None) -> tuple[int, dict[str, object], dict[str, str]]:
    headers = {}
    if capability:
        headers["X-QuickMaths-Bridge"] = capability
    if origin:
        headers["Origin"] = origin
        headers["Sec-Fetch-Site"] = "same-origin"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8")), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8")), dict(error.headers)


def test_loopback_server_requires_capability_and_denies_cors(tmp_path: Path) -> None:
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "agent-bridge.html").write_text("<!doctype html><title>Bridge</title>", encoding="utf-8")
    capability = "z" * 43
    server, url, _ = create_local_bridge_server(FakeRepository(), docs_root=docs, port=0, capability=capability)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = url.split("/agent-bridge", 1)[0]
    try:
        status, body, _headers = request_json(f"{origin}{API_PREFIX}/info")
        assert status == 403
        assert body["error"]["code"] == "forbidden"

        status, body, headers = request_json(f"{origin}{API_PREFIX}/info", capability=capability)
        assert status == 200
        assert body["transport"] == "local-git"
        assert "Access-Control-Allow-Origin" not in headers

        agent_body = envelope("agent", base_learner_sha="a" * 40)
        status, body, _headers = request_json(
            f"{origin}{API_PREFIX}/files/agent-state.json",
            capability=capability,
            method="PUT",
            body={"content": agent_body, "sha": None},
            origin=origin,
        )
        assert status == 200
        assert body["sha"] == "b" * 40

        status, body, _headers = request_json(
            f"{origin}{API_PREFIX}/files/%2e%2e%2fsecret",
            capability=capability,
        )
        assert status == 404
        status, _body, headers = request_json(f"{origin}{API_PREFIX}/info", method="OPTIONS")
        assert status == 405
        assert "Access-Control-Allow-Origin" not in headers
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
