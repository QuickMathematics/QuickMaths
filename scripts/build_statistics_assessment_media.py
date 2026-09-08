"""Build the nine declarative assessment figures used by STAT001–003."""
from pathlib import Path
from io import StringIO
import argparse
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Rectangle
matplotlib.rcParams.update({"svg.hashsalt": "quickmaths-statistics-assessment-v1", "svg.fonttype": "none", "font.family": "DejaVu Sans"})

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "content/math/algebra_foundations/skills/media/statistics"
PREVIEW = None
PINE, MINT, CORAL, MUTED, PAPER = "#153f36", "#d8ebe3", "#bc503b", "#728c80", "#fffdf8"


def style(ax, title, xlabel="", ylabel=""):
    ax.set_title(title, color=PINE, fontsize=16, pad=10)
    ax.set_xlabel(xlabel, color=PINE, fontsize=11)
    ax.set_ylabel(ylabel, color=PINE, fontsize=11)
    ax.tick_params(labelsize=10, colors=MUTED)
    ax.grid(color="#dce5dd", linewidth=.6)
    for spine in ax.spines.values(): spine.set_visible(False)


def save(fig, name):
    # Match Git's LF text policy so embedded asset hashes survive checkout
    # on Linux as well as regeneration on Windows.
    output = StringIO()
    fig.savefig(output, format="svg", metadata={"Date": None, "Creator": "QuickMaths"}, facecolor=PAPER)
    svg = "\n".join(line.rstrip() for line in output.getvalue().splitlines()) + "\n"
    (OUT / name).write_bytes(svg.encode("utf-8"))
    if PREVIEW is not None:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        fig.savefig(PREVIEW / name.replace(".svg", ".png"), dpi=120, facecolor=PAPER)
    plt.close(fig)


def build():
    OUT.mkdir(parents=True, exist_ok=True)

    fig, axes = plt.subplots(2, 1, figsize=(7.2, 4.8), sharex=True, facecolor=PAPER)
    for ax, values, label in zip(axes, ([2, 3, 4, 5, 6], [2, 3, 4, 5, 18]), ("Dataset A", "Dataset B")):
        ax.scatter(values, np.ones(len(values)), s=65, color=PINE)
        ax.set_yticks([]); ax.set_xlim(0, 20); ax.set_xticks([0, 4, 8, 12, 16, 20]); ax.set_ylabel(label, rotation=0, labelpad=28, color=PINE, fontsize=12)
        ax.grid(axis="x", color="#dce5dd", linewidth=.6)
        for spine in ax.spines.values(): spine.set_visible(False)
    axes[-1].set_xlabel("value", color=PINE); fig.suptitle("Displayed dot plots", color=PINE, fontsize=16)
    save(fig, "center-outlier-dotplots.svg")

    fig, ax = plt.subplots(figsize=(7.2, 4.8), facecolor=PAPER)
    ax.bxp([{"med": 8, "q1": 5, "q3": 12, "whislo": 2, "whishi": 17, "fliers": []}], vert=False, showfliers=False, patch_artist=True, boxprops={"facecolor": MINT, "edgecolor": PINE}, medianprops={"color": CORAL, "linewidth": 2.5}, whiskerprops={"color": PINE, "linewidth": 2}, capprops={"color": PINE, "linewidth": 2})
    ax.set_yticks([]); ax.set_xlim(0, 19); ax.set_xticks([2, 5, 8, 12, 17]); ax.set_xticklabels(["min 2", "Q1 5", "med 8", "Q3 12", "max 17"], rotation=25, ha="right", fontsize=9); style(ax, "Displayed five-number summary", "landmarks"); save(fig, "five-number-boxplot.svg")

    fig, ax = plt.subplots(figsize=(7.2, 4.8), facecolor=PAPER)
    bins = np.arange(0, 61, 10); counts = [10, 8, 5, 3, 2, 1]; ax.bar(bins[:-1], counts, width=9.5, align="edge", color=MINT, edgecolor=PINE, linewidth=1.2); ax.set_xticks(bins); ax.set_ylim(0, 11); style(ax, "Displayed frequency distribution", "class interval", "frequency"); save(fig, "right-skew-histogram.svg")

    fig, ax = plt.subplots(figsize=(7.2, 4.8), facecolor=PAPER)
    bins = np.arange(0, 36, 5); counts = [2, 7, 3, 1, 3, 7, 2]; ax.bar(bins[:-1], counts, width=4.8, align="edge", color=MINT, edgecolor=PINE, linewidth=1.2); ax.set_xticks(bins); ax.set_ylim(0, 8); style(ax, "Displayed frequency distribution", "class interval", "frequency"); save(fig, "bimodal-histogram.svg")

    fig, ax = plt.subplots(figsize=(7.2, 4.8), facecolor=PAPER)
    specs = [(2, 4, 6, 8, 10), (1, 3, 6, 11, 17)]
    for y, (lo, q1, med, q3, hi), label in zip([1, 2], specs, ("Group A", "Group B")):
        ax.plot([lo, q1], [y, y], color=PINE, lw=2); ax.plot([q3, hi], [y, y], color=PINE, lw=2); ax.plot([lo, hi], [y, y], "|", color=PINE, markersize=12, markeredgewidth=2); ax.add_patch(Rectangle((q1, y-.22), q3-q1, .44, facecolor=MINT, edgecolor=PINE, lw=1.5)); ax.plot([med, med], [y-.22, y+.22], color=CORAL, lw=2.5)
    ax.set_yticks([1, 2], ["Group A", "Group B"]); ax.set_xlim(0, 19); ax.set_xticks([1, 2, 3, 4, 6, 8, 10, 11, 17]); ax.set_xticklabels(["1", "2", "3", "4", "6", "8", "10", "11", "17"], rotation=25, ha="right", fontsize=9); style(ax, "Displayed box plots", "landmarks"); save(fig, "boxplot-comparison.svg")

    fig, axes = plt.subplots(2, 1, figsize=(7.2, 4.8), sharex=True, facecolor=PAPER)
    for ax, values, label in zip(axes, ([4, 5, 5, 6], [1, 5, 5, 9]), ("Dataset A", "Dataset B")):
        for value in sorted(set(values)):
            count = values.count(value)
            ax.scatter([value] * count, np.arange(1, count + 1), s=65, color=PINE)
        ax.set_yticks([]); ax.set_xlim(0, 10); ax.set_ylabel(label, rotation=0, labelpad=28, color=PINE, fontsize=12); ax.grid(axis="x", color="#dce5dd", linewidth=.6)
        for spine in ax.spines.values(): spine.set_visible(False)
    axes[-1].set_xlabel("value", color=PINE); fig.suptitle("Displayed dot plots", color=PINE, fontsize=16, y=.98); fig.subplots_adjust(top=.84, hspace=.28); save(fig, "same-mean-different-spread.svg")

    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.8), facecolor=PAPER)
    x = np.arange(1, 9); axes[0].scatter(x, 1.2*x + 1 + np.array([.2, -.1, .1, -.2, .15, -.1, .1, -.15]), color=PINE, s=35); axes[1].scatter(x, (x-4.5)**2/3 + 1, color=PINE, s=35); axes[0].set_title("Dataset A", color=PINE, fontsize=14); axes[1].set_title("Dataset B", color=PINE, fontsize=14)
    for ax in axes: ax.set_xlim(0, 9); ax.set_ylim(0, 12); ax.set_xlabel("x", color=PINE); ax.set_ylabel("y", color=PINE); ax.tick_params(labelsize=9, colors=MUTED); ax.grid(color="#dce5dd", linewidth=.6); [sp.set_visible(False) for sp in ax.spines.values()]
    fig.suptitle("Displayed scatter plots", color=PINE, fontsize=16, y=.99); fig.subplots_adjust(top=.80, wspace=.28); save(fig, "scatter-patterns.svg")

    fig, ax = plt.subplots(figsize=(7.2, 4.8), facecolor=PAPER)
    x = np.arange(1, 8); y = 1.25*x + 1; xo, yo = 12, 2; ax.scatter(x, y, color=PINE, s=42, label="main points"); ax.scatter([xo], [yo], color=CORAL, marker="D", s=65, label="additional point"); ax.plot(x, y, color=PINE, lw=2, label="main fitted line"); coef = np.polyfit(np.r_[x, xo], np.r_[y, yo], 1); ax.plot(np.r_[x, xo], np.polyval(coef, np.r_[x, xo]), color=CORAL, ls="--", lw=2, label="all-point fitted line"); ax.set_xlim(0, 13); ax.set_ylim(0, 12); style(ax, "Displayed scatter plot", "x", "y"); ax.legend(fontsize=9); save(fig, "scatter-influential.svg")

    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.8), facecolor=PAPER)
    x = np.arange(1, 9); random_res = np.array([.4, -.3, .2, -.1, .3, -.4, .1, -.2]); curve_res = np.array([2.2, .9, -.1, -1.2, -1.5, -.8, .3, 2.0])
    for ax, values, label in zip(axes, (random_res, curve_res), ("Dataset A", "Dataset B")):
        ax.axhline(0, color=MUTED, lw=1); ax.scatter(x, values, color=PINE, s=35); ax.set_title(label, color=PINE, fontsize=14); ax.set_xlim(0, 9); ax.set_ylim(-2.5, 2.5); ax.set_xlabel("x", color=PINE); ax.set_ylabel("residual", color=PINE); ax.tick_params(labelsize=9, colors=MUTED); ax.grid(color="#dce5dd", linewidth=.6); [sp.set_visible(False) for sp in ax.spines.values()]
    fig.suptitle("Displayed residual plots", color=PINE, fontsize=16, y=.99); fig.subplots_adjust(top=.80, wspace=.28); save(fig, "residual-diagnostics.svg")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--preview-dir", type=Path); args = parser.parse_args()
    PREVIEW = args.preview_dir
    build(); print(f"Built 9 assessment figures in {OUT}")
