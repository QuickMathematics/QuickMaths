import json
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from quickmaths_formal.protocol import PROTOCOL_VERSION, handle_message
from quickmaths_formal.service import create_server

FIXTURES = Path(__file__).parents[1] / "fixtures"


def _start_server(*, allowed_origins=None):
    server = create_server(
        "127.0.0.1",
        0,
        project_dir=FIXTURES.parent,
        allowed_origins=set(allowed_origins or set()),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def _stop(server, thread):
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def _url(server, path):
    host, port = server.server_address
    return f"http://{host}:{port}{path}"


def test_health_reports_pinned_environment_and_protocol():
    server, thread = _start_server()
    try:
        with urlopen(_url(server, "/health"), timeout=2) as response:
            body = json.loads(response.read())
        assert body["service"] == "quickmaths-formal"
        assert body["protocol_version"] == PROTOCOL_VERSION
        assert isinstance(body["lean_available"], bool)
        assert body["environment"]["backend"] == "lean4"
        assert body["environment"]["lean_toolchain"]
        assert body["environment"]["library"] == "mathlib"
        assert body["environment"]["mathlib_revision"]
    finally:
        _stop(server, thread)


def test_rpc_parses_declared_school_proposition():
    server, thread = _start_server()
    try:
        payload = json.dumps({
            "protocol_version": PROTOCOL_VERSION,
            "op": "parse_proposition",
            "variables": ["x"],
            "text": "x != 3",
        }).encode()
        request = Request(
            _url(server, "/v1/rpc"),
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json", "Origin": "http://localhost:3000"},
        )
        with urlopen(request, timeout=2) as response:
            body = json.loads(response.read())
            allow_origin = response.headers["Access-Control-Allow-Origin"]
        assert body["ok"] is True
        assert body["result"]["proposition"]["kind"] == "ne"
        assert body["result"]["preview"] == "x ≠ 3"
        assert allow_origin == "http://localhost:3000"
    finally:
        _stop(server, thread)


def test_nonlocal_browser_origin_is_rejected_by_default():
    server, thread = _start_server()
    try:
        request = Request(_url(server, "/health"), headers={"Origin": "https://evil.example"})
        try:
            urlopen(request, timeout=2)
            assert False, "expected forbidden origin"
        except HTTPError as exc:
            assert exc.code == 403
            body = json.loads(exc.read())
            assert body["error"]["code"] == "origin_forbidden"
    finally:
        _stop(server, thread)


def test_explicit_origin_allowlist_is_honored():
    server, thread = _start_server(allowed_origins={"https://quickmaths.example"})
    try:
        request = Request(_url(server, "/health"), headers={"Origin": "https://quickmaths.example"})
        with urlopen(request, timeout=2) as response:
            assert response.status == 200
            assert response.headers["Access-Control-Allow-Origin"] == "https://quickmaths.example"
    finally:
        _stop(server, thread)


def test_oversized_body_is_rejected_before_rpc_processing():
    server, thread = _start_server()
    try:
        request = Request(
            _url(server, "/v1/rpc"),
            data=b"x",
            method="POST",
            headers={"Content-Type": "application/json", "Content-Length": "1000001"},
        )
        try:
            urlopen(request, timeout=2)
            assert False, "expected request-size rejection"
        except HTTPError as exc:
            assert exc.code == 413
            body = json.loads(exc.read())
            assert body["error"]["code"] == "request_size"
    finally:
        _stop(server, thread)


def test_prove_text_rpc_builds_assisted_guarded_cancellation_without_false_certificate(monkeypatch):
    server, thread = _start_server()
    monkeypatch.setenv("PATH", "")
    try:
        payload = json.dumps({
            "protocol_version": PROTOCOL_VERSION,
            "op": "prove_text",
            "request_id": "browser-hole",
            "declarations": ["x:real"],
            "assumptions": ["x != 3"],
            "goal": "(x^2 - 9)/(x - 3) = x + 3",
        }).encode()
        request = Request(
            _url(server, "/v1/rpc"),
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json", "Origin": "http://localhost:3000"},
        )
        with urlopen(request, timeout=2) as response:
            body = json.loads(response.read())
        assert body["ok"] is True
        result = body["result"]
        verification = result["verification"]
        assert verification["status"] == "verification_unavailable"
        assert verification["proof_mode"] == "assisted"
        assert verification["certificate"] is None
        assert [step["rule"] for step in verification["resolved_request"]["steps"]] == [
            "sub_ne_zero_from_ne",
            "field_identity",
        ]
        assert "field_simp" in verification["lean_source"]
        assert "x ≠ 3" in result["preview"]
    finally:
        _stop(server, thread)



def test_workbench_and_capability_endpoints_are_served():
    server, thread = _start_server()
    try:
        with urlopen(_url(server, "/"), timeout=2) as response:
            html = response.read().decode("utf-8")
            assert "Proof workbench" in html
            assert "Start manual proof" in html
            assert "manual-editor" in html
        with urlopen(_url(server, "/capabilities"), timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
            assert data["foundation"]["backend"] == "Lean 4 + mathlib"
            assert "nat_induction" in data["rule_groups"]["logic"]
    finally:
        _stop(server, thread)


def test_prove_text_accepts_function_and_set_declarations(monkeypatch):
    monkeypatch.setenv("PATH", "")
    function = handle_message({
        "op": "prove_text",
        "request_id": "funext-rpc",
        "declarations": ["f:real->real", "g:real->real"],
        "assumptions": ["forall x:real, f(x) = g(x)"],
        "goal": "f = g",
    })
    assert function["ok"] is True
    assert function["result"]["verification"]["status"] == "verification_unavailable"
    assert any(step["rule"] == "function_ext" for step in function["result"]["verification"]["resolved_request"]["steps"])

    sets = handle_message({
        "op": "prove_text",
        "request_id": "setext-rpc",
        "declarations": ["A:set[real]", "B:set[real]"],
        "assumptions": ["forall x:real, (x in A) iff (x in B)"],
        "goal": "A = B",
    })
    assert sets["ok"] is True
    assert sets["result"]["verification"]["status"] == "verification_unavailable"
    assert any(step["rule"] == "set_ext" for step in sets["result"]["verification"]["resolved_request"]["steps"])


def test_http_progress_and_in_place_repair_preserve_guard_and_never_fake_verification(monkeypatch):
    """Real HTTP/parser/rules path, deliberately no Lean and no fake success."""
    monkeypatch.setenv("PATH", "")
    server, thread = _start_server()

    def rpc(op, **fields):
        payload = json.dumps({"protocol_version": PROTOCOL_VERSION, "op": op, **fields}).encode()
        request = Request(_url(server, "/v1/rpc"), data=payload, method="POST", headers={
            "Content-Type": "application/json", "Origin": "http://localhost:3000",
        })
        with urlopen(request, timeout=5) as response:
            body = json.loads(response.read())
        assert body["ok"] is True, body
        return body["result"]

    try:
        goal = "(x^2 - 9)/(x - 3) = x + 3"
        initial = rpc("new_text_request", declarations=["x:real"], assumptions=["x != 3"], goal=goal)["request"]
        first = rpc("append_text_step", request=initial, claim="x - 3 != 0",
                    rule="sub_ne_zero_from_ne", premises=["h1"])["request"]
        second = rpc("append_text_step", request=first, claim=goal,
                     rule="field_identity", premises=["user_step_1"])["request"]
        progress = rpc("check_progress", request=second)
        assert progress["status"] == "verification_unavailable"
        assert progress["verified_step_ids"] == []
        assert progress["assessment_eligible"] is False
        assert "certificate" not in progress

        edited = rpc("replace_text_step", request=second, step_id="user_step_1", claim="x = x", rule="eq_refl")
        assert edited["request"]["goal"] == initial["goal"]
        assert edited["request"]["variables"] == initial["variables"]
        assert edited["request"]["assumptions"] == initial["assumptions"]
        assert edited["request"]["steps"][1] == second["steps"][1]
        assert any(row["code"] == "nonzero_required" for row in edited["proof_state"]["obligations"])
        assert "verification" not in edited
        checked = rpc("check", request=edited["request"])
        assert checked["status"] == "needs_justification"
        assert checked["certificate"] is None
    finally:
        _stop(server, thread)
