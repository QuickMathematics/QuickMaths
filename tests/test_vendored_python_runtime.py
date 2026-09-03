from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
RUNTIME = ROOT / "docs" / "vendor" / "pyodide-0.28.3"


def test_vendored_pyodide_files_match_the_reviewed_integrity_manifest() -> None:
    manifest = json.loads((RUNTIME / "integrity.json").read_text(encoding="utf-8"))
    assert manifest["package"] == "pyodide@0.28.3"
    for name, expected in manifest["files"].items():
        assert hashlib.sha256((RUNTIME / name).read_bytes()).hexdigest() == expected


def test_python_worker_and_csp_do_not_trust_a_runtime_cdn() -> None:
    worker = (ROOT / "docs" / "python-sandbox-worker.js").read_text(encoding="utf-8")
    page = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    assert "./vendor/pyodide-0.28.3/pyodide-esm.js" in worker
    assert "cdn.jsdelivr.net" not in worker
    assert "cdn.jsdelivr.net" not in page
    notice = (RUNTIME / "NOTICE.md").read_text(encoding="utf-8")
    assert "MPL-2.0" in notice
    assert "pyodide.mjs" in notice and "pyodide-esm.js" in notice
