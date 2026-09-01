import hashlib
import json
from pathlib import Path

import pytest

from scripts.lesson_depot import DepotError, build_catalog


def _package(root: Path, slug="fractions", version="1.0.0", **meta):
    directory = root / "lessons" / slug / version
    directory.mkdir(parents=True)
    metadata = {"slug": slug, "version": version, "name": "Fractions", "author": "Ada", "license": "MIT", **meta}
    safe_id = slug.upper().replace("-", "_")
    lesson = {"format": "quickmaths.lesson-set", "schema_version": "2.0", "id": f"PACK_{safe_id}", "skills": [{"id": f"CUSTOM_{safe_id}_1", "problems": []}]}
    (directory / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    lesson_path = directory / "lesson-set.json"
    lesson_path.write_text(json.dumps(lesson), encoding="utf-8")
    return lesson_path


def test_builds_sorted_catalog_search_and_hash(tmp_path):
    first = _package(tmp_path, "z-topic", "1.0.0", name="Zed")
    _package(tmp_path, "a-topic", "2.0.0", name="Alpha")
    catalog, search = build_catalog(tmp_path, tmp_path / "generated")
    assert [(p["slug"], p["version"]) for p in catalog["packages"]] == [("a-topic", "2.0.0"), ("z-topic", "1.0.0")]
    assert catalog["packages"][1]["sha256"] == hashlib.sha256(first.read_bytes()).hexdigest()
    assert [e["slug"] for e in search["entries"]] == ["a-topic", "z-topic"]
    assert json.loads((tmp_path / "generated/catalog.json").read_text())["packages"] == catalog["packages"]


@pytest.mark.parametrize("field", ["license", "author", "version", "slug"])
def test_required_metadata_is_enforced(tmp_path, field):
    path = _package(tmp_path)
    metadata_path = path.parent / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata[field] = ""
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(DepotError, match=f"metadata.{field}"):
        build_catalog(tmp_path)


def test_rejects_path_mismatch_and_invalid_lesson(tmp_path):
    _package(tmp_path, "Bad_Slug")
    with pytest.raises(DepotError, match="unsafe or invalid"):
        build_catalog(tmp_path)
    tmp_path = tmp_path / "other"
    path = _package(tmp_path)
    path.write_text("{}", encoding="utf-8")
    with pytest.raises(DepotError, match="format"):
        build_catalog(tmp_path)


def test_rejects_duplicate_package_and_unsafe_symlink(tmp_path):
    _package(tmp_path)
    duplicate = tmp_path / "lessons" / "fractions" / "1.0.0-copy"
    duplicate.mkdir(parents=True)
    (duplicate / "metadata.json").write_text(json.dumps({"slug": "fractions", "version": "1.0.0", "name": "X", "author": "A", "license": "MIT"}), encoding="utf-8")
    (duplicate / "lesson-set.json").write_text(json.dumps({"format": "quickmaths.lesson-set", "schema_version": "2.0", "id": "PACK_X", "skills": [{"id": "CUSTOM_X", "problems": []}]}), encoding="utf-8")
    with pytest.raises(DepotError):
        build_catalog(tmp_path)


def test_catalog_publishes_only_latest_version_for_a_stable_package(tmp_path):
    _package(tmp_path, "fractions", "1.2.0")
    _package(tmp_path, "fractions", "1.10.0")
    catalog, _ = build_catalog(tmp_path)
    assert [(item["slug"], item["version"]) for item in catalog["packages"]] == [("fractions", "1.10.0")]


def test_trusted_community_overlay_is_materialized_and_url_checked(tmp_path):
    _package(tmp_path)
    community_path = tmp_path / "community.json"
    community_path.write_text(json.dumps({
        "format": "quickmaths.lesson-depot.community", "schema_version": "1.0",
        "packages": {"PACK_FRACTIONS": {"votes": 12, "comments": 3, "discussion_url": "https://github.com/example/repo/discussions/1"}},
    }), encoding="utf-8")
    catalog, _ = build_catalog(tmp_path)
    assert catalog["packages"][0]["community"]["votes"] == 12
    payload = json.loads(community_path.read_text())
    payload["packages"]["PACK_FRACTIONS"]["discussion_url"] = "javascript:alert(1)"
    community_path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(DepotError, match="github.com"):
        build_catalog(tmp_path)
