"""Rebuild the Matplotlib illustrations for the native trigonometry lessons."""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.patches import Polygon

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "content/math/algebra_foundations/skills/media/trigonometry"
PINE, MINT, CORAL, MUTED, PAPER = "#153f36", "#d8ebe3", "#bc503b", "#728c80", "#fffdf8"


def label(ax, x, y, text, **kwargs):
    ax.text(x, y, text, fontsize=21, color=PINE, ha="center", va="center",
            bbox={"facecolor": PAPER, "edgecolor": "none", "pad": 3}, **kwargs)


def right_triangle(ax):
    ax.set_xlim(-1, 5.4); ax.set_ylim(-1, 4.5)
    ax.add_patch(Polygon([(0, 0), (4, 0), (4, 3)], facecolor=MINT, edgecolor=PINE, linewidth=3))
    ax.plot([3.7, 3.7, 4], [0, .3, .3], color=PINE, linewidth=2)
    angle = np.linspace(0, np.arctan2(3, 4), 60)
    ax.plot(.8*np.cos(angle), .8*np.sin(angle), color=CORAL, linewidth=2)
    label(ax, 1.12, .32, "θ")
    label(ax, 2, -.45, "adjacent = 4")
    label(ax, 4.7, 1.5, "opposite\n3")
    label(ax, 1.65, 1.85, "hypotenuse = 5", rotation=37)
    label(ax, 2.1, 4, "sin θ = 3/5    cos θ = 4/5")


def unit_circle(ax):
    ax.set_xlim(-1.7, 1.65); ax.set_ylim(-1.55, 1.65)
    t = np.linspace(0, 2*np.pi, 240)
    ax.plot(np.cos(t), np.sin(t), color=PINE, linewidth=2.4)
    ax.axhline(0, color=MUTED); ax.axvline(0, color=MUTED)
    x, y = -.5, np.sqrt(3)/2
    ax.plot([0, x], [0, y], color=CORAL, linewidth=3)
    ax.plot([x, x, 0], [0, y, y], color=MUTED, linestyle="--")
    arc = np.linspace(0, 2*np.pi/3, 80)
    ax.plot(.36*np.cos(arc), .36*np.sin(arc), color=CORAL, linewidth=2)
    ax.scatter(x, y, s=65, color=CORAL, zorder=4)
    label(ax, -.54, 1.2, "(−1/2, √3/2)")
    label(ax, .49, .45, "2π/3")
    label(ax, 1.2, -.17, "x"); label(ax, .15, 1.38, "y")
    label(ax, 0, -1.32, "P = (cos θ, sin θ)")


def axes(ax, ylim):
    ax.set_axis_on(); ax.set_aspect("auto")
    ax.set_xlim(0, 2*np.pi); ax.set_ylim(*ylim)
    ax.set_xticks([0, np.pi/2, np.pi, 3*np.pi/2, 2*np.pi], ["0", "π/2", "π", "3π/2", "2π"])
    ax.tick_params(labelsize=19, colors=MUTED)
    for spine in ax.spines.values(): spine.set_visible(False)
    ax.grid(color="#dce5dd", linewidth=.8)
    ax.axhline(0, color=MUTED, linewidth=1.5)
    ax.set_xlabel("x (radians)", fontsize=20, color=PINE, labelpad=12)


def sine_graph(ax):
    axes(ax, (-8, 5)); ax.set_yticks([-7, -2, 3])
    x = np.linspace(0, 2*np.pi, 300)
    ax.plot(x, 5*np.sin(x)-2, color=PINE, linewidth=3)
    ax.axhline(-2, color=CORAL, linewidth=1.8, linestyle="--")
    ax.annotate("", (np.pi/2, 3), (np.pi/2, -2), arrowprops={"arrowstyle": "<->", "color": CORAL, "linewidth": 2})
    label(ax, 2.3, .45, "5")
    label(ax, 4.8, -1.1, "midline −2")
    ax.set_title("y = 5 sin(x) − 2", fontsize=23, color=PINE, pad=15)


def sine_solutions(ax):
    axes(ax, (-1.25, 1.4)); ax.set_yticks([-1, 0, .5, 1])
    x = np.linspace(0, 2*np.pi, 300)
    ax.plot(x, np.sin(x), color=PINE, linewidth=3)
    ax.axhline(.5, color=CORAL, linewidth=2, linestyle="--")
    for value, text in [(np.pi/6, "π/6"), (5*np.pi/6, "5π/6")]:
        ax.plot([value, value], [0, .5], color=MUTED, linestyle="--")
        ax.scatter(value, .5, color=CORAL, s=70, zorder=4)
        label(ax, value, .85, text)
    ax.set_title("sin(x) = 1/2 on [0, 2π)", fontsize=23, color=PINE, pad=15)


def oblique_triangle(ax):
    # Adjacent sides 5 and 7, opposite side 8: cos(C) = 1/7.
    a, b, c = np.array([0., 0.]), np.array([7., 0.]), np.array([5/7, 5*np.sqrt(48)/7])
    ax.set_xlim(-1.7, 8); ax.set_ylim(-1.1, 6.8)
    ax.add_patch(Polygon([a, b, c], facecolor=MINT, edgecolor=PINE, linewidth=3))
    label(ax, -.55, -.08, "C"); label(ax, 3.5, -.5, "7")
    label(ax, -.35, 2.5, "5"); label(ax, 4.45, 2.8, "c = 8")
    t = np.linspace(0, np.arccos(1/7), 80)
    ax.plot(.8*np.cos(t), .8*np.sin(t), color=CORAL, linewidth=2)
    label(ax, 3, 6.15, "c² = a² + b² − 2ab cos(C)")


def build(preview_dir=None):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if preview_dir: preview_dir.mkdir(parents=True, exist_ok=True)
    drawings = {"right-triangle": right_triangle, "unit-circle": unit_circle,
                "sine-graph": sine_graph, "sine-solutions": sine_solutions, "oblique-triangle": oblique_triangle}
    with matplotlib.rc_context({"text.usetex": False, "svg.fonttype": "none", "svg.hashsalt": "quickmaths-trigonometry", "font.family": "DejaVu Sans"}):
        for name, draw in drawings.items():
            figure = Figure(figsize=(7.2, 6.4), dpi=100, facecolor=PAPER)
            FigureCanvasAgg(figure)
            ax = figure.add_axes((.12, .15, .82, .73) if name.startswith("sine-") else (.02, .02, .96, .96), facecolor=PAPER)
            ax.set_aspect("equal"); ax.set_axis_off(); draw(ax)
            path = OUTPUT / f"{name}.svg"
            figure.savefig(path, format="svg", metadata={"Date": None, "Creator": "QuickMaths"})
            path.write_text("\n".join(line.rstrip() for line in path.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8", newline="\n")
            if preview_dir: figure.savefig(preview_dir / f"{name}.png", metadata={"Software": "QuickMaths"})
            figure.clear()
    print(f"Built {len(drawings)} trigonometry diagrams.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-dir", type=Path)
    build(parser.parse_args().preview_dir)
