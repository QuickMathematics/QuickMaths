"""Rebuild illustrations for the native Geometry branch with Matplotlib.

Run with the media extra installed. SVGs are committed alongside the lesson;
the curriculum exporter embeds their verified bytes for offline use.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.patches import Polygon

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "content/math/algebra_foundations/skills/media/triangle-area"
GRAPH_OUTPUT = ROOT / "content/math/algebra_foundations/skills/media/coordinate-geometry"
BRIDGE_OUTPUT = ROOT / "content/geography/foundations/media/native-geometry"
PINE, MINT, CORAL, MUTED, PAPER = "#153f36", "#d8ebe3", "#bc503b", "#728c80", "#fffdf8"


def label(ax, x, y, text, *, color=PINE, ha="center", va="center", size=23):
    ax.text(x, y, text, fontsize=size, color=color, ha=ha, va=va,
            bbox={"facecolor": PAPER, "edgecolor": "none", "pad": 3.5})


def right_angle(ax, x, y, scale, *, right=True):
    sign = 1 if right else -1
    ax.plot([x, x + sign * scale, x + sign * scale], [y + scale, y + scale, y], color=PINE, linewidth=1.7)


def horizontal(ax, base, height, apex, *, rectangle=False, slant=None, symbols=True):
    if rectangle:
        ax.add_patch(Polygon([[0, 0], [base, 0], [base, height], [0, height]],
                             facecolor="#eff4ee", edgecolor=MUTED, linewidth=1.7, linestyle=(0, (4, 4))))
    ax.add_patch(Polygon([[0, 0], [base, 0], [apex, height]], facecolor=MINT, edgecolor=PINE, linewidth=2.7))
    if apex < 0:
        ax.plot([apex - .25, 0], [0, 0], color=MUTED, linewidth=1.5, linestyle=(0, (4, 4)))
    ax.plot([apex, apex], [0, height], color=CORAL, linewidth=2.7, linestyle=(0, (5, 3)))
    ax.plot([0, base], [0, 0], color=PINE, linewidth=4)
    right_angle(ax, apex, 0, min(base, height) * .085)
    label(ax, base / 2, -height * .24, f"{'b = ' if symbols else ''}{base} cm")
    label(ax, min(0, apex) - base * .10, height * .54, f"{'h = ' if symbols else ''}{height} cm", color=CORAL, ha="right")
    if slant:
        label(ax, base * .61, height * .70, f"{slant} cm", ha="left", size=21)
    if rectangle:
        label(ax, base * .78, height * .88, "same area", color=MUTED, size=17)
    left = min(0, apex) - base * .62
    right = base * 1.25
    ax.set_xlim(left, right)
    ax.set_ylim(-height * .45, height * 1.23)


def rotated(ax):
    ax.add_patch(Polygon([[0, 0], [0, 6], [4, 6]], facecolor=MINT, edgecolor=PINE, linewidth=2.7))
    ax.plot([0, 0], [0, 6], color=PINE, linewidth=4)
    ax.plot([0, 4], [6, 6], color=CORAL, linewidth=2.7, linestyle=(0, (5, 3)))
    ax.plot([0, .36, .36], [5.64, 5.64, 6], color=PINE, linewidth=1.7)
    label(ax, -.28, 3, "b = 6 cm", ha="right")
    label(ax, 2, 6.65, "h = 4 cm", color=CORAL)
    ax.set_xlim(-3.0, 5.2); ax.set_ylim(-.45, 7.35)


def graph_axes(ax, xlim, ylim, *, xticks, yticks, xlabel="x", ylabel="y", equal=True):
    ax.set_axis_on(); ax.set_xlim(xlim); ax.set_ylim(ylim)
    ax.set_aspect("equal" if equal else "auto", adjustable="box")
    ax.set_xticks(xticks); ax.set_yticks(yticks)
    ax.grid(True, color="#dce5dd", linewidth=.85, zorder=0)
    ax.tick_params(labelsize=15, colors=MUTED, length=3)
    for spine in ax.spines.values(): spine.set_visible(False)
    ax.axhline(0, color=MUTED, linewidth=1.8); ax.axvline(0, color=MUTED, linewidth=1.8)
    ax.set_xlabel(xlabel, fontsize=20, color=PINE, labelpad=8)
    ax.set_ylabel(ylabel, fontsize=20, color=PINE, labelpad=8)


def point_label(ax, point, text, offset=(10, 10), *, color=PINE):
    ax.scatter(*point, s=65, color=color, zorder=5)
    ax.annotate(text, point, xytext=offset, textcoords="offset points", fontsize=19, color=color,
                bbox={"facecolor": PAPER, "edgecolor": "none", "pad": 2}, zorder=6)


def slope_step(ax, first, second, *, run_label, rise_label):
    x1, y1 = first; x2, y2 = second
    ax.annotate("", (x2, y1), (x1, y1), arrowprops={"arrowstyle": "->", "color": CORAL, "linewidth": 2.4})
    ax.annotate("", (x2, y2), (x2, y1), arrowprops={"arrowstyle": "->", "color": CORAL, "linewidth": 2.4})
    ax.annotate(run_label, ((x1+x2)/2, y1), xytext=(0,-26), textcoords="offset points", ha="center", fontsize=19, color=CORAL, bbox={"facecolor": PAPER,"edgecolor":"none","pad":2})
    ax.annotate(rise_label, (x2, (y1+y2)/2), xytext=(10,0), textcoords="offset points", fontsize=19, color=CORAL, bbox={"facecolor":PAPER,"edgecolor":"none","pad":2})


def coordinates(ax):
    graph_axes(ax, (-6,6), (-6,6), xticks=range(-6,7,2), yticks=range(-6,7,2))
    for x,y,name in [(3,4.8,"I"),(-4.6,4.8,"II"),(-4.6,-4.8,"III"),(3,-4.8,"IV")]:
        ax.text(x,y,name,fontsize=20,color=MUTED,ha="center")
    ax.plot([4,4], [0,-3], color=CORAL, linestyle="--", linewidth=1.8)
    ax.plot([0,4], [-3,-3], color=CORAL, linestyle="--", linewidth=1.8)
    point_label(ax,(4,-3),"(4, −3)",(-100,-1))
    point_label(ax,(-3,4),"(−3, 4)",(9,-15))
    point_label(ax,(0,0),"origin",(10,10),color=MUTED)


def slope_points(ax):
    graph_axes(ax, (-1,9), (0,15), xticks=range(0,10,2), yticks=range(0,16,2))
    x=np.linspace(-1,6.5,100); ax.plot(x,2*x+2,color=PINE,linewidth=2.7)
    slope_step(ax,(1,4),(5,12),run_label="run 4",rise_label="rise 8")
    point_label(ax,(1,4),"(1, 4)",(-69,10)); point_label(ax,(5,12),"(5, 12)",(10,3))


def rate_graph(ax):
    graph_axes(ax, (0,6.5), (0,42), xticks=range(0,7), yticks=range(0,41,10), xlabel="Time (minutes)", ylabel="Water (gallons)", equal=False)
    ax.plot([0,6],[12,36],color=PINE,linewidth=2.7)
    slope_step(ax,(0,12),(5,32),run_label="5 minutes",rise_label="20 gal")
    point_label(ax,(0,12),"(0, 12)",(8,10)); point_label(ax,(5,32),"(5, 32)",(-95,14))


def intercept_graph(ax):
    graph_axes(ax, (-4,5), (0,17), xticks=range(-4,6,2), yticks=range(0,18,2))
    x=np.linspace(-4,4,100); ax.plot(x,2*x+9,color=PINE,linewidth=2.7)
    point_label(ax,(0,9),"(0, 9)",(-86,3))
    slope_step(ax,(0,9),(1,11),run_label="1",rise_label="2")
    point_label(ax,(1,11),"(1, 11)",(12,15))
    ax.text(-3.8,15.3,"y = 2x + 9",fontsize=22,color=PINE)


def graphing_line(ax):
    graph_axes(ax, (-3,6), (-4,7), xticks=range(-2,7,2), yticks=range(-4,8,2))
    x=np.linspace(-2,5,100); ax.plot(x,1.5*x-1,color=PINE,linewidth=2.7)
    slope_step(ax,(0,-1),(2,2),run_label="run 2",rise_label="rise 3")
    point_label(ax,(0,-1),"(0, −1)",(-82,4)); point_label(ax,(2,2),"(2, 2)",(-64,14))


def writing_line(ax):
    graph_axes(ax, (-2,8), (0,16), xticks=range(-2,9,2), yticks=range(0,17,2))
    x=np.linspace(-1.5,6.4,100); ax.plot(x,2*x+3,color=PINE,linewidth=2.7)
    slope_step(ax,(0,3),(4,11),run_label="run 4",rise_label="rise 8")
    point_label(ax,(0,3),"b = 3",(-69,12)); point_label(ax,(4,11),"(4, 11)",(10,10))


def compass(ax, wrap=False):
    ax.set_xlim(-1.7,1.7); ax.set_ylim(-1.6,1.7)
    for x,y,name in [(0,1.42,"N · 000°"),(1.42,0,"E"),(0,-1.42,"S"),(-1.42,0,"W")]:
        label(ax,x,y,name,size=22)
    theta=np.linspace(0,2*np.pi,240)
    ax.plot(np.cos(theta),np.sin(theta),color=MUTED,linewidth=1.5)
    ax.plot([-1.1,1.1],[0,0],color="#c9d8ce",linewidth=1);ax.plot([0,0],[-1.1,1.1],color="#c9d8ce",linewidth=1)
    bearings=[350,25] if wrap else [225]
    for bearing in bearings:
        angle=np.deg2rad(bearing)
        end=(1.10*np.sin(angle),1.10*np.cos(angle))
        ax.annotate("",end,(0,0),arrowprops={"arrowstyle":"->","color":PINE,"linewidth":3})
    start,stop=(-10,25) if wrap else (0,225)
    radius=.58 if wrap else .70
    angles=np.deg2rad(np.linspace(start,stop,200));x=radius*np.sin(angles);y=radius*np.cos(angles)
    ax.plot(x,y,color=CORAL,linewidth=3)
    ax.annotate("",(x[-1],y[-1]),(x[-12],y[-12]),arrowprops={"arrowstyle":"->","color":CORAL,"linewidth":2})
    if wrap:
        label(ax,-.46,1.13,"350°",ha="right",size=20);label(ax,.63,1.10,"025°",ha="left",size=20)
        label(ax,.04,.35,"35°",color=CORAL,size=22)
    else:
        label(ax,.65,-.68,"225°",color=CORAL,size=23);label(ax,-.96,-.93,"SW",size=22)


def circle_arc(ax):
    ax.set_xlim(-11,11);ax.set_ylim(-10,11)
    angle=np.linspace(0,2*np.pi,240);ax.plot(8*np.cos(angle),8*np.sin(angle),color=MUTED,linewidth=1.6)
    quarter=np.linspace(0,np.pi/2,100);ax.plot(8*np.cos(quarter),8*np.sin(quarter),color=CORAL,linewidth=5)
    ax.plot([0,8],[0,0],color=PINE,linewidth=2.4);ax.plot([0,0],[0,8],color=PINE,linewidth=2.4)
    right_angle(ax,0,0,.8);ax.scatter(0,0,color=PINE,s=40)
    label(ax,3.5,-1.2,"r = 8",size=23);label(ax,2.1,2.2,"90°",size=23)


def globe(figure):
    ax=figure.add_axes((0,.22,1,.78),projection="3d")
    ax.set_facecolor(PAPER);ax.set_axis_off();ax.set_box_aspect((1,1,1));ax.view_init(elev=22,azim=30)
    angles=np.linspace(0,2*np.pi,240);latitudes=np.deg2rad(np.linspace(-90,90,120))
    for phi in np.deg2rad([-60,-30,30,60]):
        ax.plot(np.cos(phi)*np.cos(angles),np.cos(phi)*np.sin(angles),np.full_like(angles,np.sin(phi)),color="#c4d5c8",linewidth=.9)
    for lam in np.deg2rad(range(0,360,45)):
        ax.plot(np.cos(latitudes)*np.cos(lam),np.cos(latitudes)*np.sin(lam),np.sin(latitudes),color="#c4d5c8",linewidth=.9)
    ax.plot(np.cos(angles),np.sin(angles),np.zeros_like(angles),color=PINE,linewidth=3)
    ax.plot(np.sqrt(3)/2*np.cos(angles),np.sqrt(3)/2*np.sin(angles),np.full_like(angles,.5),color=CORAL,linewidth=3)
    ax.plot(np.cos(latitudes),np.zeros_like(latitudes),np.sin(latitudes),color="#376c98",linewidth=3)
    ax.text(0,0,1.12,"N",fontsize=23,color=PINE);ax.text(0,0,-1.20,"S",fontsize=23,color=PINE)
    for y,text,color in [(.19,"Equator · a great circle",PINE),(.12,"30°N · a smaller parallel",CORAL),(.05,"Meridian · pole to pole", "#376c98")]:
        figure.text(.09,y,text,fontsize=21,color=color,ha="left")


def build_figures(preview_dir=None):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    GRAPH_OUTPUT.mkdir(parents=True, exist_ok=True); BRIDGE_OUTPUT.mkdir(parents=True, exist_ok=True)
    if preview_dir:
        preview_dir.mkdir(parents=True, exist_ok=True)
    drawings = {
        "half-rectangle": lambda ax: horizontal(ax, 4, 3, 0, rectangle=True),
        "inside-height": lambda ax: horizontal(ax, 8, 5, 3),
        "outside-height": lambda ax: horizontal(ax, 6, 4, -2),
        "rotated-triangle": rotated,
        "assessment-right": lambda ax: horizontal(ax, 8, 6, 0, slant=10, symbols=False),
        "assessment-outside": lambda ax: horizontal(ax, 10, 6, -2, symbols=False),
    }
    entries=[(name,draw,OUTPUT,"triangle") for name,draw in drawings.items()]
    entries += [(name,draw,GRAPH_OUTPUT,"graph") for name,draw in {"coordinate-plane":coordinates,"slope-two-points":slope_points,"slope-rate":rate_graph,"slope-intercept":intercept_graph,"graphing-line":graphing_line,"writing-line":writing_line}.items()]
    entries += [(name,draw,BRIDGE_OUTPUT,"bridge") for name,draw in {"bearing-clockwise":compass,"bearing-wrap":lambda ax:compass(ax,True),"circle-arc":circle_arc,"sphere-coordinates":None}.items()]
    with matplotlib.rc_context({"text.usetex": False, "svg.fonttype": "none", "svg.hashsalt": "quickmaths-native-triangle-area", "font.family": "DejaVu Sans"}):
        for name, draw, folder, kind in entries:
            figure = Figure(figsize=(7.2, 4.8 if kind=="triangle" else 6.4), dpi=100, facecolor=PAPER)
            FigureCanvasAgg(figure)
            if draw:
                ax = figure.add_axes((.14,.13,.80,.81) if kind=="graph" else (.025, .025, .95, .95), facecolor=PAPER)
                ax.set_aspect("equal", adjustable="box"); ax.set_axis_off()
                draw(ax)
            else:
                globe(figure)
            path = folder / f"{name}.svg"
            figure.savefig(path, format="svg", metadata={"Date": None, "Creator": "QuickMaths"})
            path.write_text("\n".join(line.rstrip() for line in path.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8", newline="\n")
            if preview_dir:
                figure.savefig(preview_dir / f"{name}.png", metadata={"Software": "QuickMaths"})
            figure.clear()
    return [name for name, *_ in entries]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-dir", type=Path)
    args = parser.parse_args()
    print(f"Built {len(build_figures(args.preview_dir))} native geometry diagrams.")
