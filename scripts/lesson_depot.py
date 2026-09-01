"""Build a deterministic static catalog for the QuickMaths Lesson Depot.

Packages are directories below ``lessons/`` in the form::

    lessons/<slug>/<version>/{metadata.json,lesson-set.json}

The builder deliberately treats lesson files as data: no code is imported or
executed while building a catalog.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_VERSION = re.compile(r"^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$")
_LICENSE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .+()/-]{0,119}$")
_PACK_ID = re.compile(r"^PACK_[A-Z0-9_]+$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SHOWCASE_FORMAT = "quickmaths.lesson-depot.showcase"


class DepotError(ValueError):
    """A package cannot safely or correctly be included in the catalog."""


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DepotError(f"metadata.{field} is required")
    return value.strip()


def _safe_relative(path: Path, root: Path) -> str:
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise DepotError(f"path escapes depot root: {path}") from exc
    if path.is_symlink() or any(part in {"", ".", ".."} for part in relative.parts):
        raise DepotError(f"unsafe path: {relative}")
    return relative.as_posix()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DepotError(f"invalid JSON in {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise DepotError(f"{path.name} must contain a JSON object")
    return value


def _validate_lesson(value: dict[str, Any], path: Path) -> None:
    if value.get("format") != "quickmaths.lesson-set":
        raise DepotError(f"{path.name}: format must be quickmaths.lesson-set")
    if value.get("schema_version") != "2.0":
        raise DepotError(f"{path.name}: schema_version must be '2.0'")
    if not isinstance(value.get("id"), str) or not _PACK_ID.fullmatch(value["id"]):
        raise DepotError(f"{path.name}: id must be a valid PACK_* ID")
    if not isinstance(value.get("skills"), list) or not value["skills"]:
        raise DepotError(f"{path.name}: skills must be a non-empty array")
    ids: set[str] = set()
    for skill in value["skills"]:
        if not isinstance(skill, dict) or not isinstance(skill.get("id"), str) or not skill["id"].strip():
            raise DepotError(f"{path.name}: every skill needs an id")
        if skill["id"] in ids:
            raise DepotError(f"{path.name}: duplicate skill id {skill['id']!r}")
        ids.add(skill["id"])


def _version_key(value: str) -> tuple[int, int, int, str]:
    match = _VERSION.fullmatch(value)
    if not match:
        raise DepotError(f"invalid semantic version: {value}")
    core = value.split("-", 1)[0].split("+", 1)[0]
    major, minor, patch = (int(part) for part in core.split("."))
    return major, minor, patch, value


def _community_count(value: Any, field: str) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise DepotError(f"community {field} must be an integer") from exc
    return max(0, min(1_000_000, count))


def _showcase_packages(root: Path) -> list[dict[str, Any]]:
    """Load metadata-only concept cards that demonstrate a populated Depot.

    Showcase entries deliberately have no lesson path, hash, community thread,
    or install capability. They cannot be mistaken for reviewed lesson content.
    """
    path = root / "showcase.json"
    if not path.is_file():
        return []
    payload = _read_json(path)
    if payload.get("format") != _SHOWCASE_FORMAT or payload.get("schema_version") != "1.0":
        raise DepotError("showcase.json has an unsupported format")
    entries = payload.get("packages")
    if not isinstance(entries, list) or len(entries) > 100:
        raise DepotError("showcase.json packages must be an array of at most 100 entries")
    packages: list[dict[str, Any]] = []
    for index, entry in enumerate(entries, start=1):
        if not isinstance(entry, dict):
            raise DepotError(f"showcase package {index} must be an object")
        package_id = _text(entry.get("id"), "id")
        slug = _text(entry.get("slug"), "slug")
        version = _text(entry.get("version"), "version")
        if not _PACK_ID.fullmatch(package_id) or not package_id.startswith("PACK_PREVIEW_"):
            raise DepotError("showcase package IDs must start with PACK_PREVIEW_")
        if not _SLUG.fullmatch(slug):
            raise DepotError(f"showcase package {package_id} has an invalid slug")
        if not _VERSION.fullmatch(version) or "-preview" not in version:
            raise DepotError(f"showcase package {package_id} must use a preview semantic version")
        tags = entry.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 20 or any(not isinstance(tag, str) or not tag.strip() or len(tag.strip()) > 40 for tag in tags):
            raise DepotError(f"showcase package {package_id} has invalid tags")
        packages.append({
            "id": package_id,
            "slug": slug,
            "version": version,
            "name": _text(entry.get("name"), "name"),
            "description": _text(entry.get("description"), "description"),
            "author": "QuickMaths Preview",
            "license": "Not published",
            "availability": "preview",
            "skills": 0,
            "problems": 0,
            "subject_id": _text(entry.get("subject_id"), "subject_id"),
            "subject_name": _text(entry.get("subject_name"), "subject_name"),
            "tags": sorted({tag.strip().lower() for tag in tags}),
            "published_at": "",
            "updated_at": "",
            "community": {"votes": 0, "comments": 0, "discussion_url": ""},
        })
    return packages


def build_catalog(depot_dir: str | Path, output_dir: str | Path | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate packages and return ``(catalog, search_index)``.

    No output is written unless *output_dir* is supplied. Existing generated
    files are replaced only after all packages have successfully validated.
    """
    root = Path(depot_dir).resolve()
    if not root.is_dir():
        raise DepotError(f"depot directory does not exist: {root}")
    community: dict[str, Any] = {}
    community_path = root / "community.json"
    if community_path.is_file():
        community_file = _read_json(community_path)
        if community_file.get("format") != "quickmaths.lesson-depot.community" or community_file.get("schema_version") != "1.0":
            raise DepotError("community.json has an unsupported format")
        community = community_file.get("packages", {})
        if not isinstance(community, dict):
            raise DepotError("community.json packages must be an object")
    packages: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for metadata_path in sorted(root.rglob("metadata.json"), key=lambda p: p.as_posix()):
        rel = _safe_relative(metadata_path, root)
        package = metadata_path.parent
        parts = Path(rel).parts
        if len(parts) != 4 or parts[0] != "lessons" or parts[3] != "metadata.json":
            raise DepotError(f"metadata must be at lessons/<slug>/<version>: {rel}")
        slug, path_version = parts[1], parts[2]
        if not _SLUG.fullmatch(slug) or not _VERSION.fullmatch(path_version):
            raise DepotError(f"unsafe or invalid package path: {rel}")
        metadata = _read_json(metadata_path)
        metadata_slug = _text(metadata.get("slug"), "slug")
        version = _text(metadata.get("version"), "version")
        author = _text(metadata.get("author"), "author")
        license_name = _text(metadata.get("license"), "license")
        if not _SLUG.fullmatch(metadata_slug) or metadata_slug != slug:
            raise DepotError(f"metadata.slug must match package slug {slug!r}")
        if not _VERSION.fullmatch(version) or version != path_version:
            raise DepotError(f"metadata.version must match package version {path_version!r}")
        if not _LICENSE.fullmatch(license_name):
            raise DepotError("metadata.license is invalid")
        lesson_path = package / "lesson-set.json"
        if not lesson_path.is_file():
            lesson_path = package / "lesson.json"
        if not lesson_path.is_file() or lesson_path.is_symlink():
            raise DepotError(f"{rel}: missing lesson-set.json")
        _safe_relative(lesson_path, root)
        lesson = _read_json(lesson_path)
        _validate_lesson(lesson, lesson_path)
        metadata_id = str(metadata.get("id", lesson["id"])).strip()
        if metadata_id != lesson["id"]:
            raise DepotError("metadata.id must match the lesson-set ID")
        tags = metadata.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 20 or any(not isinstance(tag, str) or not tag.strip() or len(tag.strip()) > 40 for tag in tags):
            raise DepotError("metadata.tags must be a list of at most 20 short strings")
        published_at = str(metadata.get("published_at", "")).strip()
        updated_at = str(metadata.get("updated_at", published_at)).strip()
        if published_at and not _DATE.fullmatch(published_at):
            raise DepotError("metadata.published_at must be YYYY-MM-DD")
        if updated_at and not _DATE.fullmatch(updated_at):
            raise DepotError("metadata.updated_at must be YYYY-MM-DD")
        subject = lesson.get("subject") if isinstance(lesson.get("subject"), dict) else {}
        key = (slug, version)
        if key in seen:
            raise DepotError(f"duplicate package {slug}@{version}")
        seen.add(key)
        raw = lesson_path.read_bytes()
        community_entry = community.get(lesson["id"], {})
        if not isinstance(community_entry, dict):
            raise DepotError(f"community entry for {lesson['id']} must be an object")
        discussion_url = str(community_entry.get("discussion_url", "")).strip()
        if discussion_url:
            parsed_url = urlparse(discussion_url)
            if parsed_url.scheme != "https" or parsed_url.netloc.lower() != "github.com":
                raise DepotError(f"community discussion URL for {lesson['id']} must use github.com")
        entry = {
            "id": lesson["id"], "slug": slug, "version": version, "name": _text(metadata.get("name", metadata.get("title")), "name"),
            "description": str(metadata.get("description", "")).strip(), "author": author,
            "license": license_name, "lesson_path": Path("lessons", slug, version, lesson_path.name).as_posix(),
            "sha256": hashlib.sha256(raw).hexdigest(), "schema_version": lesson["schema_version"],
            "skills": len(lesson["skills"]), "problems": sum(len(skill.get("problems", [])) for skill in lesson["skills"]),
            "subject_id": str(subject.get("id", "SUBJECT_MATHEMATICS")),
            "subject_name": str(subject.get("name", "Mathematics")),
            "tags": sorted({tag.strip().lower() for tag in tags}),
            "published_at": published_at, "updated_at": updated_at,
            # These are periodically materialized from GitHub Discussions by a trusted workflow.
            # Package authors cannot set them in metadata.json.
            "community": {
                "votes": _community_count(community_entry.get("votes", 0), "votes"),
                "comments": _community_count(community_entry.get("comments", 0), "comments"),
                "discussion_url": discussion_url,
            },
        }
        packages.append(entry)
    packages.extend(_showcase_packages(root))
    slugs_by_id: dict[str, str] = {}
    for package in packages:
        prior_slug = slugs_by_id.setdefault(package["id"], package["slug"])
        if prior_slug != package["slug"]:
            raise DepotError(f"package ID {package['id']} appears under multiple slugs")
    latest: dict[str, dict[str, Any]] = {}
    for package in packages:
        prior = latest.get(package["id"])
        if prior is None or _version_key(package["version"]) > _version_key(prior["version"]):
            latest[package["id"]] = package
    packages = sorted(latest.values(), key=lambda x: (x["slug"], x["version"]))
    catalog = {"format": "quickmaths.lesson-depot.catalog", "schema_version": "1.0", "packages": packages}
    search = {"format": "quickmaths.lesson-depot.search", "schema_version": "1.0", "entries": [
        {"id": p["id"], "slug": p["slug"], "version": p["version"], "name": p["name"], "description": p["description"],
         "author": p["author"], "license": p["license"], "subject_name": p["subject_name"], "tags": p["tags"],
         "terms": " ".join((p["slug"], p["name"], p["description"], p["author"], p["subject_name"], *p["tags"])).lower()}
        for p in packages
    ]}
    if output_dir is not None:
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        for name, data in (("catalog.json", catalog), ("search-index.json", search)):
            (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return catalog, search


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("depot", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        catalog, _ = build_catalog(args.depot, args.output)
    except DepotError as exc:
        print(f"lesson depot error: {exc}", file=sys.stderr)
        return 1
    print(f"catalogued {len(catalog['packages'])} package(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
