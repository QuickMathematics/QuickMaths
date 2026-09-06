import base64
import hashlib
import io
import json
from pathlib import Path

import pytest
from PIL import Image

from quickmaths.lesson_media import build_lesson_folder, collect_media_paths, media_path, prepare_lesson_media, render_matplotlib_figure


FIGURE = {"path": "media/triangle.png", "width": 640, "height": 400, "axes": False, "layers": [{"type": "polygon", "points": [[0, 0], [4, 0], [0, 3]]}]}
PACK = {"format": "quickmaths.lesson-set", "schema_version": "2.1", "skills": [{"media": [{"src": FIGURE["path"], "alt": "A right triangle", "width": 640, "height": 400}]}], "matplotlib_figures": [FIGURE]}


def test_matplotlib_png_svg_and_reproducibility():
    png = render_matplotlib_figure(FIGURE)
    assert Image.open(io.BytesIO(png)).size == (640, 400)
    assert render_matplotlib_figure(FIGURE) == png
    svg = render_matplotlib_figure({**FIGURE, "path": "media/triangle.svg"})
    assert b"<svg" in svg
    assert svg == render_matplotlib_figure({**FIGURE, "path": "media/triangle.svg"})


@pytest.mark.parametrize("bad", ["../outside.png", "/outside.svg", "media/../x.png", "x.py", "x.html", "media//x.png", "a\\x.png"])
def test_paths_cannot_escape_or_execute(bad):
    with pytest.raises(ValueError):
        media_path(bad)


@pytest.mark.parametrize("extra", [{"code": "raise Exception('Never executed')"}, {"width": float("inf")}, {"layers": [{"type": "python", "code": "print(1)"}]}])
def test_figures_accept_only_bounded_declarative_content(extra):
    with pytest.raises(ValueError):
        render_matplotlib_figure({**FIGURE, **extra})


def test_build_folder_and_portable_have_verified_bytes(tmp_path):
    source = tmp_path / "lesson-set.json"
    source.write_text(json.dumps(PACK), encoding="utf-8")
    result = build_lesson_folder(source, tmp_path / "built")
    pack = json.loads(Path(result["manifest"]).read_text())
    asset = pack["assets"][0]
    data = (tmp_path / "built" / asset["path"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == asset["sha256"]
    assert "matplotlib_figures" not in pack
    portable = build_lesson_folder(source, tmp_path / "portable", portable=True)
    embedded = json.loads(Path(portable["manifest"]).read_text())["assets"][0]
    assert base64.b64decode(embedded["data_base64"]) == data


def test_only_referenced_files_are_packaged(tmp_path):
    (tmp_path / "media").mkdir()
    (tmp_path / FIGURE["path"]).write_bytes(b"image bytes")
    (tmp_path / "private.txt").write_text("private", encoding="utf-8")
    pack, files = prepare_lesson_media({key: value for key, value in PACK.items() if key != "matplotlib_figures"}, tmp_path)
    assert list(files) == [FIGURE["path"]]
    assert "private" not in json.dumps(pack)


@pytest.mark.parametrize("raw", ["a: &x [1]\nb: *x", "a: 1\na: 2", "a: !!python/object/apply:os.system ['bad']"])
def test_yaml_rejects_aliases_duplicates_and_python_tags(tmp_path, raw):
    source = tmp_path / "lesson-set.yaml"
    source.write_text(raw, encoding="utf-8")
    with pytest.raises(ValueError):
        build_lesson_folder(source, tmp_path / "built")


def test_media_types_and_fallbacks_are_consistent():
    pack = {"skills": [{"media": [{"src": "x.webm", "alt": "Animated construction", "sources": ["x.mp4"], "poster": "x.png"}]}]}
    assert collect_media_paths(pack) == ["x.mp4", "x.png", "x.webm"]
    pack["skills"][0]["media"][0]["sources"] = ["x.mp3"]
    with pytest.raises(ValueError):
        collect_media_paths(pack)
