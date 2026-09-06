"""Compile folder-based lesson media and declarative Matplotlib figures.

Only referenced files are included. Importing a lesson never executes Python.
Authors can also use ordinary Matplotlib scripts themselves and reference the
PNG/SVG files produced by savefig from their lesson YAML.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import math
import re
from pathlib import Path

import yaml

from quickmaths.content_loader import _safe_load_unique


MEDIA_TYPES = {
    "png": "image/png", "apng": "image/apng", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "gif": "image/gif", "webp": "image/webp", "avif": "image/avif", "svg": "image/svg+xml", "bmp": "image/bmp",
    "webm": "video/webm", "mp4": "video/mp4", "m4v": "video/mp4", "ogv": "video/ogg",
    "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg", "oga": "audio/ogg",
    "m4a": "audio/mp4", "flac": "audio/flac", "opus": "audio/ogg",
}
MAX_ASSET_BYTES = 25_000_000
MAX_EMBEDDED_BYTES = 1_000_000


def media_path(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 240 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_./ -]*", value):
        raise ValueError("Media paths must stay inside the lesson folder.")
    parts = value.split("/")
    if any(re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", part.split(".")[0], re.IGNORECASE) for part in parts):
        raise ValueError("Use portable media filenames, without reserved device names.")
    if len(parts) > 12 or any(part in {"", ".", ".."} or part.endswith((".", " ")) for part in parts):
        raise ValueError("Media paths must stay inside the lesson folder.")
    if value.rsplit(".", 1)[-1].lower() not in MEDIA_TYPES:
        raise ValueError(f"Unsupported media format: {value}")
    return value


def _number(value, label, *, low=-1_000_000, high=1_000_000):
    if type(value) not in {int, float} or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be a finite number between {low} and {high}.")
    return value


def render_matplotlib_figure(spec: dict) -> bytes:
    try:
        import matplotlib
        from matplotlib.figure import Figure
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        from matplotlib.patches import Arc, Circle, Polygon
    except ImportError as error:
        raise ValueError('Install plotting support with: pip install -e ".[media]"') from error
    import io

    if not isinstance(spec, dict):
        raise ValueError("A Matplotlib figure must be a mapping.")
    allowed = {"path", "width", "height", "dpi", "title", "xlabel", "ylabel", "xlim", "ylim", "grid", "equal_aspect", "axes", "legend", "layers"}
    if set(spec) - allowed:
        raise ValueError("Matplotlib figures accept declarative drawing fields, not Python code or arbitrary options.")
    path = media_path(spec.get("path"))
    extension = path.rsplit(".", 1)[-1].lower()
    if extension not in {"png", "svg"}:
        raise ValueError("Generated Matplotlib figures must use PNG or SVG.")
    width = _number(spec.get("width", 800), "Figure width", low=100, high=4096)
    height = _number(spec.get("height", 500), "Figure height", low=100, high=4096)
    dpi = _number(spec.get("dpi", 120), "Figure DPI", low=72, high=240)
    layers = spec.get("layers", [])
    if not isinstance(layers, list) or not 1 <= len(layers) <= 60:
        raise ValueError("A figure needs 1 to 60 drawing layers.")
    def label(value):
        if not isinstance(value, str) or len(value) > 500:
            raise ValueError("Figure labels must be text of at most 500 characters.")
        return value
    def point(value):
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError("A figure point must be [x, y].")
        return [_number(number, "Coordinate") for number in value]
    with matplotlib.rc_context({"text.usetex": False, "svg.fonttype": "none", "svg.hashsalt": "quickmaths-lesson-figure"}):
        figure = Figure(figsize=(width / dpi, height / dpi), dpi=dpi, layout="constrained")
        FigureCanvasAgg(figure)
        axes = figure.subplots()
        for layer in layers:
            if not isinstance(layer, dict):
                raise ValueError("A drawing layer must be a mapping.")
            kind = layer.get("type")
            color = layer.get("color", "#153f36")
            if not isinstance(color, str) or len(color) > 40 or not matplotlib.colors.is_color_like(color):
                raise ValueError("Invalid figure color.")
            linewidth = _number(layer.get("line_width", 2), "Line width", low=0.1, high=12)
            alpha = _number(layer.get("alpha", 1), "Opacity", low=0, high=1)
            common = {"color": color, "alpha": alpha}
            if kind in {"line", "scatter", "polygon"}:
                points = layer.get("points", [])
                if not isinstance(points, list) or not 2 <= len(points) <= 2000:
                    raise ValueError("Lines, scatter plots and polygons need 2 to 2,000 points.")
                points = [point(value) for value in points]
                if kind == "polygon":
                    axes.add_patch(Polygon(points, closed=True, fill=layer.get("fill", False) is True, linewidth=linewidth, **common))
                elif kind == "scatter":
                    axes.scatter(*zip(*points), s=_number(layer.get("size", 30), "Marker size", low=1, high=300), label=label(layer.get("label", "")), **common)
                else:
                    axes.plot(*zip(*points), linewidth=linewidth, label=label(layer.get("label", "")), **common)
            elif kind in {"circle", "arc"}:
                center = point(layer.get("center", [0, 0]))
                radius = _number(layer.get("radius", 1), "Radius", low=0.000001)
                if kind == "circle":
                    axes.add_patch(Circle(center, radius, fill=layer.get("fill", False) is True, linewidth=linewidth, **common))
                else:
                    axes.add_patch(Arc(center, 2 * radius, 2 * radius, theta1=_number(layer.get("start", 0), "Start angle"), theta2=_number(layer.get("end", 90), "End angle"), linewidth=linewidth, **common))
            elif kind == "text":
                alignment = layer.get("align", "left")
                if alignment not in {"left", "center", "right"}:
                    raise ValueError("Text alignment must be left, center or right.")
                axes.text(*point(layer.get("at")), label(layer.get("text", "")), ha=alignment, fontsize=_number(layer.get("font_size", 12), "Font size", low=6, high=48), **common)
            elif kind == "arrow":
                axes.annotate(label(layer.get("text", "")), xy=point(layer.get("to")), xytext=point(layer.get("from")), color=color, arrowprops={"arrowstyle": "->", "color": color, "linewidth": linewidth})
            else:
                raise ValueError(f"Unsupported Matplotlib layer: {kind}.")
        if spec.get("equal_aspect", True):
            axes.set_aspect("equal", adjustable="box")
        axes.autoscale_view()
        for dimension in ["x", "y"]:
            limits = spec.get(f"{dimension}lim")
            if limits is not None:
                limits = point(limits)
                if limits[0] >= limits[1]:
                    raise ValueError("Figure axis limits must increase.")
                getattr(axes, f"set_{dimension}lim")(*limits)
            getattr(axes, f"set_{dimension}label")(label(spec.get(f"{dimension}label", "")))
        axes.set_title(label(spec.get("title", "")))
        if spec.get("grid", False) is True:
            axes.grid(True, alpha=.2)
        else:
            axes.grid(False)
        if spec.get("axes", True) is False:
            axes.set_axis_off()
        if spec.get("legend", False) is True:
            axes.legend()
        output = io.BytesIO()
        metadata = {"Date": None, "Creator": "QuickMaths"} if extension == "svg" else {"Software": "QuickMaths"}
        figure.savefig(output, format=extension, dpi=dpi, metadata=metadata)
        figure.clear()
        data = output.getvalue()
        if extension == "svg":
            data = ("\n".join(line.rstrip() for line in data.decode("utf-8").splitlines()) + "\n").encode("utf-8")
        return data


def collect_media_paths(pack):
    paths = set()
    for skill in pack.get("skills", []):
        for section in [skill, *skill.get("examples", []), *skill.get("applications", []), *skill.get("problems", [])]:
            media = section.get("media", [])
            if not isinstance(media, list) or len(media) > 12:
                raise ValueError("Each lesson section supports at most 12 media items.")
            for item in media:
                if not isinstance(item, dict) or not isinstance(item.get("alt"), str) or not item["alt"].strip() or len(item["alt"]) > 500:
                    raise ValueError("Every media item needs alternative text.")
                if not isinstance(item.get("caption", ""), str) or len(item.get("caption", "")) > 1000:
                    raise ValueError("Media captions must be text of at most 1,000 characters.")
                if item.get("fit", "contain") not in {"contain", "cover"}:
                    raise ValueError("Media fit must be contain or cover.")
                path = media_path(item.get("src"))
                kind = MEDIA_TYPES[path.rsplit(".", 1)[-1].lower()].split("/")[0]
                if item.get("type", kind) != kind:
                    raise ValueError("Media type must match the file extension.")
                for key in ["width", "height"]:
                    if key in item and (type(item[key]) is not int or not 1 <= item[key] <= 4096):
                        raise ValueError("Media dimensions must be 1 to 4096 pixels.")
                paths.add(path)
                sources = item.get("sources", [])
                if not isinstance(sources, list) or len(sources) > 3 or (kind == "image" and "sources" in item):
                    raise ValueError("Audio and video support up to three fallback sources.")
                for source in sources:
                    source = media_path(source)
                    if not MEDIA_TYPES[source.rsplit(".", 1)[-1].lower()].startswith(kind + "/"):
                        raise ValueError("Fallback sources must have the same media type.")
                    paths.add(source)
                if "poster" in item:
                    poster = media_path(item["poster"])
                    if kind != "video" or not MEDIA_TYPES[poster.rsplit(".", 1)[-1].lower()].startswith("image/"):
                        raise ValueError("Video posters must be images.")
                    paths.add(poster)
    if len(paths) > 60:
        raise ValueError("A lesson pack supports at most 60 media files.")
    return sorted(paths)


def prepare_lesson_media(pack: dict, folder: Path, *, portable=False):
    output = copy.deepcopy(pack)
    figures = output.pop("matplotlib_figures", [])
    if not isinstance(figures, list) or len(figures) > 30:
        raise ValueError("A pack supports at most 30 generated Matplotlib figures.")
    paths = collect_media_paths(output)
    generated = {}
    for figure in figures:
        if not isinstance(figure, dict):
            raise ValueError("A Matplotlib figure must be a mapping.")
        path = media_path(figure.get("path"))
        if path not in paths or path in generated:
            raise ValueError("Each generated figure must have a unique, referenced media path.")
        generated[path] = render_matplotlib_figure(figure)
    assets, files, total = [], {}, 0
    root = folder.resolve()
    for path in paths:
        if path in generated:
            data = generated[path]
        else:
            source = root / path
            if any(parent.is_symlink() for parent in [source, *source.parents] if parent != root and root in parent.parents):
                raise ValueError("Media files cannot use symlinks.")
            if not source.resolve().is_relative_to(root) or not source.is_file():
                raise ValueError(f"Missing or unsafe media file: {path}")
            if source.stat().st_size > MAX_ASSET_BYTES:
                raise ValueError(f"{path} exceeds the 25 MB per-file limit.")
            data = source.read_bytes()
        if not 0 < len(data) <= MAX_ASSET_BYTES:
            raise ValueError(f"{path} must be between 1 byte and 25 MB.")
        asset = {"path": path, "mime_type": MEDIA_TYPES[path.rsplit(".", 1)[-1].lower()], "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        total += len(data)
        if total > 100_000_000:
            raise ValueError("Lesson attachments exceed 100 MB.")
        if portable:
            if total > MAX_EMBEDDED_BYTES:
                raise ValueError("Portable attachments exceed 1 MB. Build and publish a folder package for larger media.")
            asset["data_base64"] = base64.b64encode(data).decode("ascii")
        assets.append(asset); files[path] = data
    if assets:
        output["assets"] = assets
        output["schema_version"] = "2.1"
    else:
        output.pop("assets", None)
    output.pop("asset_base_url", None)
    return output, files


def build_lesson_folder(manifest: Path, output_folder: Path, *, portable=False):
    if manifest.stat().st_size > 2_000_000:
        raise ValueError("Lesson manifest exceeds 2 MB.")
    raw = manifest.read_text(encoding="utf-8-sig")
    try:
        if manifest.suffix.lower() in {".yaml", ".yml"}:
            if any(isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken)) for token in yaml.scan(raw)):
                raise ValueError("Use explicit YAML values; aliases and anchors are not supported in lesson manifests.")
            pack = _safe_load_unique(raw)
        else:
            pack = json.loads(raw)
    except (yaml.YAMLError, RecursionError) as error:
        raise ValueError("Invalid or excessively nested lesson YAML.") from error
    if not isinstance(pack, dict) or pack.get("format") != "quickmaths.lesson-set" or not isinstance(pack.get("skills"), list):
        raise ValueError("Choose a QuickMaths lesson-set YAML or JSON manifest.")
    pack, files = prepare_lesson_media(pack, manifest.parent, portable=portable)
    text = json.dumps(pack, ensure_ascii=False, indent=2) + "\n"
    if len(text.encode("utf-8")) > 2_000_000:
        raise ValueError("Built lesson manifest exceeds 2 MB.")
    root = output_folder.resolve()
    root.mkdir(parents=True, exist_ok=True)
    for name, data in {"lesson-set.json": text.encode("utf-8"), **({} if portable else files)}.items():
        target = root / name
        if not target.resolve().is_relative_to(root) or target.is_symlink():
            raise ValueError("Output paths must stay inside the output folder.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return {"manifest": str(root / "lesson-set.json"), "assets": len(files), "media_bytes": sum(map(len, files.values())), "portable": portable}


def add_media_parser(subparsers):
    parser = subparsers.add_parser("build-lesson", help="Build a YAML/JSON lesson folder, attachments and Matplotlib figures.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--portable", action="store_true", help="Embed up to 1 MB of media into a single lesson-set JSON file.")
