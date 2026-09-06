from __future__ import annotations

import io
import json
import os
import subprocess
from unittest.mock import Mock, mock_open, patch

import pytest

from quickmaths.local_bridge import GitBridgeRepository, LocalBridgeError, RepositoryIdentity
from quickmaths.math_syntax import MathSyntaxError, _parse_expression_unevaluated, parse_expression


@pytest.mark.parametrize("parser", [parse_expression, _parse_expression_unevaluated])
@pytest.mark.parametrize("source", [
    "open('security-audit-probe','w').write('probe')",
    "__import__('os').getcwd()",
    "(1).__class__.__bases__",
    "sqrt.__globals__",
    "[x for x in (1,2)]",
    "lambda: 1",
    "1; 2",
    "9**999999",
    "9**(9**9)",
    "1e999999999",
    "(" * 100 + "1" + ")" * 100,
    "x+" * 300 + "1",
])
def test_math_input_cannot_execute_python_or_request_extreme_computation(parser, source):
    fake = mock_open()
    with patch("builtins.open", fake), pytest.raises(MathSyntaxError):
        parser(source)
    fake.assert_not_called()


def test_safe_math_preserves_school_notation_and_numeric_variables():
    assert parse_expression("2.5x + 1e-2", ["x"]) == parse_expression("2.5*x + 0.01", ["x"])
    assert parse_expression("x_1 + 2x_1", ["x_1"]) == parse_expression("3x_1", ["x_1"])


def repository(tmp_path):
    return GitBridgeRepository(RepositoryIdentity("test", "private-storage", "main", "https://github.com/test/private-storage.git"), tmp_path / "bridge")


@pytest.mark.parametrize("mode,kind", [("120000", "blob"), ("040000", "tree"), ("160000", "commit")])
def test_checkpoint_rejects_non_regular_git_entries_even_without_os_symlinks(tmp_path, mode, kind):
    repo = repository(tmp_path)
    repo._git = Mock(return_value=subprocess.CompletedProcess([], 0, f"{mode} {kind} {'a' * 40}\tlearner-state.json\0", ""))
    with pytest.raises(LocalBridgeError, match="regular Git file"):
        repo._blob_sha(tmp_path, "learner-state.json")


def test_checkpoint_write_cannot_overwrite_a_file_linked_outside_clone(tmp_path, monkeypatch):
    repo = repository(tmp_path)
    sentinel = tmp_path / "unrelated-file.txt"
    sentinel.write_text("untouched", encoding="utf-8")
    def clone(destination):
        os.link(sentinel, destination / "learner-state.json")
    monkeypatch.setattr(repo, "_clone", clone)
    monkeypatch.setattr(repo, "_require_private_repository", lambda: None)
    monkeypatch.setattr(repo, "_blob_sha", lambda *_: "a" * 40)
    monkeypatch.setattr(repo, "_refresh_reader", lambda: None)
    monkeypatch.setattr(repo, "_git", lambda *_args, **_kwargs: subprocess.CompletedProcess([], 0, "b" * 40, ""))
    content = json.dumps({"format": "quickmaths.github-bridge", "schema_version": "1.0", "channel": "learner", "app_state": {}})
    repo.write_file("learner-state.json", content, expected_sha="a" * 40)
    assert sentinel.read_text(encoding="utf-8") == "untouched"


@pytest.mark.parametrize("info", [{"private": False}, {}, {"private": "true"}, []])
def test_local_bridge_refuses_public_or_unverified_repository_before_cloning(tmp_path, monkeypatch, info):
    repo = repository(tmp_path)
    monkeypatch.setattr(repo, "_git", lambda *_args, **_kwargs: subprocess.CompletedProcess([], 0, "username=test\npassword=synthetic-test-token\n", ""))
    opener = Mock()
    opener.open.return_value = io.BytesIO(json.dumps(info).encode())
    monkeypatch.setattr("quickmaths.local_bridge.build_opener", lambda *_: opener)
    clone = Mock()
    monkeypatch.setattr(repo, "_clone", clone)
    content = json.dumps({"format": "quickmaths.github-bridge", "schema_version": "1.0", "channel": "learner", "app_state": {}})
    with pytest.raises(LocalBridgeError, match="private GitHub repository"):
        repo.write_file("learner-state.json", content, expected_sha=None)
    clone.assert_not_called()


def test_local_bridge_privacy_check_keeps_credentials_on_host_and_disables_redirects(tmp_path, monkeypatch):
    repo = repository(tmp_path)
    git = Mock(return_value=subprocess.CompletedProcess([], 0, "username=test\npassword=synthetic-test-token\n", ""))
    monkeypatch.setattr(repo, "_git", git)
    opener = Mock()
    opener.open.return_value = io.BytesIO(b'{"private":true}')
    factory = Mock(return_value=opener)
    monkeypatch.setattr("quickmaths.local_bridge.build_opener", factory)
    repo._require_private_repository()
    request = opener.open.call_args.args[0]
    assert request.full_url == "https://api.github.com/repos/test/private-storage"
    assert request.get_header("Authorization").startswith("Basic ")
    assert "synthetic-test-token" not in repr(git.call_args)
    redirect_handler = factory.call_args.args[0]
    assert redirect_handler.redirect_request(None, None, 302, "", {}, "https://example.invalid") is None


def test_local_bridge_privacy_network_failure_stops_the_write(tmp_path, monkeypatch):
    repo = repository(tmp_path)
    monkeypatch.setattr(repo, "_git", lambda *_args, **_kwargs: subprocess.CompletedProcess([], 0, "username=test\npassword=synthetic-test-token\n", ""))
    opener = Mock()
    opener.open.side_effect = OSError("offline")
    monkeypatch.setattr("quickmaths.local_bridge.build_opener", lambda *_: opener)
    with pytest.raises(LocalBridgeError, match="No checkpoint was written"):
        repo._require_private_repository()
