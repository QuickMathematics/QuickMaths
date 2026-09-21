"""Rebuild the 12 native calculus-bridge teaching diagrams deterministically.

Run from any directory. Matplotlib runs only at authoring time; the exported SVGs
contain no executable content. Optional PNG previews aid visual review.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'content/math/algebra_foundations/skills/media/native-calculus-bridge'

def build(preview_dir: Path | None = None) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if preview_dir:
        preview_dir.mkdir(parents=True, exist_ok=True)
    # Text remains text in SVG; deterministic IDs make rebuilds reproducible.
    plt.rcParams['svg.fonttype'] = 'none'
    plt.rcParams['svg.hashsalt'] = 'quickmaths-calculus-bridge-batch-2'
    plt.rcParams['font.size'] = 12
    def axes(title: str, xlabel: str = 'Input x', ylabel: str = 'Output y'):
        fig, ax = plt.subplots(figsize=(8, 5), dpi=100)
        ax.set(title=title, xlabel=xlabel, ylabel=ylabel)
        ax.grid(True, alpha=.22)
        ax.spines[['top', 'right']].set_visible(False)
        return fig, ax
    def dot(ax, x, y, opened=False):
        ax.plot([x],[y],marker='o',markersize=9,linestyle='none',
                markerfacecolor=ax.get_facecolor() if opened else None,markeredgewidth=1.8,zorder=5)
    def save(fig, name):
        fig.tight_layout(pad=1.8)
        svg = OUT/(name+'.svg')
        fig.savefig(svg, metadata={'Date':None, 'Creator':'QuickMaths Matplotlib authoring'})
        # Normalize Matplotlib's path-line trailing spaces for clean source diffs.
        svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
        if preview_dir: fig.savefig(preview_dir/(name+'.png'),dpi=150)
        plt.close(fig)

    fig,ax=axes('One function, two conditional rules')
    ax.plot([-2,0],[0,2],linewidth=2.5,label='x + 2 for -2 <= x < 0')
    ax.plot([0,2],[3,3],linewidth=2.5,label='3 for 0 <= x <= 2')
    for x,y,op in [(-2,0,False),(0,2,True),(0,3,False),(2,3,False)]: dot(ax,x,y,op)
    ax.annotate('Open point (0, 2)',(0,2),xytext=(.42,1.4),arrowprops={'arrowstyle':'->'})
    ax.annotate('Included point (0, 3)',(0,3),xytext=(-1.9,3.8),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-2.5,2.7),ylim=(-.6,4.5),xticks=range(-2,3),yticks=range(5))
    ax.legend(loc='lower right',fontsize=10);save(fig,'piecewise-branches')

    fig,ax=axes('Absolute value is a piecewise rule')
    ax.plot([-1,3],[4,0],linewidth=2.5,label='Branch for x < 3')
    ax.plot([3,7],[0,4],linewidth=2.5,label='Branch for x >= 3')
    dot(ax,3,0);ax.annotate('Vertex (3, 0)',(3,0),xytext=(3.5,.65),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-1.5,7.5),ylim=(-.5,5));ax.legend(loc='upper center',fontsize=10)
    save(fig,'piecewise-absolute')

    fig,ax=axes('Tiered price: only extra items get the lower rate','Number of items n (whole numbers)','Total price (euros)')
    n=np.arange(0,11);ax.scatter(n,3*n,label='First 10: 3 euros per item')
    n=np.arange(11,19);ax.scatter(n,30+2*(n-10),label='Additional items: 2 euros each')
    ax.annotate('(10, 30)',(10,30),xytext=(6,35),arrowprops={'arrowstyle':'->'})
    ax.annotate('(15, 40)',(15,40),xytext=(12,48),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-.7,19),ylim=(-2,56),xticks=range(0,19,2));ax.legend(loc='upper left',fontsize=10)
    save(fig,'piecewise-tariff')

    fig,ax=axes('Average rate is the secant slope')
    x=np.linspace(-.3,4.5,150);ax.plot(x,x*x/4+1,linewidth=2.5,label='f(x) = x^2/4 + 1')
    ax.plot([0,4],[1,5],linewidth=2,label='Secant through the two endpoints')
    ax.plot([0,4,4],[1,1,5],linestyle='--',linewidth=1.5)
    dot(ax,0,1);dot(ax,4,5)
    ax.text(1.4,.4,'Run = 4');ax.text(4.12,2.65,'Rise = 4')
    ax.annotate('(0, 1)',(0,1),xytext=(-.25,2.1),arrowprops={'arrowstyle':'->'})
    ax.annotate('(4, 5)',(4,5),xytext=(2.8,5.8),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-.6,5.15),ylim=(-.15,7));ax.legend(loc='upper left',fontsize=10)
    save(fig,'rate-secant')

    fig,ax=axes('A changing interval gives a changing average rate')
    x=np.linspace(1.5,3.3,150);ax.plot(x,x*x,linewidth=2.5,label='f(x) = x^2')
    ax.plot([2,3],[4,9],linewidth=2,label='h = 1; slope = 5')
    ax.plot([2,2.5],[4,6.25],linewidth=2,label='h = 0.5; slope = 4.5')
    for p in [(2,4),(2.5,6.25),(3,9)]:dot(ax,*p)
    ax.annotate('Same start (2, 4)',(2,4),xytext=(1.58,5.6),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(1.4,3.55),ylim=(1.5,12));ax.legend(loc='upper left',fontsize=10)
    save(fig,'rate-nearby')

    fig,ax=axes('Position over the time interval [0, 4]','Time t (seconds)','Position s(t) (metres)')
    t=np.linspace(0,4,160);ax.plot(t,t*t-4*t,linewidth=2.5,label='s(t) = t^2 - 4t')
    ax.plot([0,4],[0,0],linestyle='--',label='Equal start and end positions')
    for p in [(0,0),(2,-4),(4,0)]:dot(ax,*p)
    ax.annotate('Turn: (2, -4)',(2,-4),xytext=(1.45,-5),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-.35,4.35),ylim=(-5.5,1.8),xticks=range(5));ax.legend(loc='upper center',fontsize=10)
    save(fig,'rate-position')

    fig,ax=axes('A line with a separately assigned point value')
    ax.plot([-1,3],[0,4],linewidth=2.5,label='f(x) = x + 1 when x != 1')
    dot(ax,1,2,True);dot(ax,1,5)
    ax.annotate('Open point (1, 2)',(1,2),xytext=(1.42,1),arrowprops={'arrowstyle':'->'})
    ax.annotate('Assigned value: f(1) = 5',(1,5),xytext=(-.8,5.8),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-1.2,3.6),ylim=(-.5,6.8),xticks=range(-1,4));ax.legend(loc='upper left',fontsize=10)
    save(fig,'limit-hole')

    fig,ax=axes('Two branches near x = 0')
    ax.plot([-2,0],[-1,1],linewidth=2.5,label='x + 1 for x < 0')
    ax.plot([0,2],[3,5],linewidth=2.5,label='x + 3 for x >= 0')
    dot(ax,0,1,True);dot(ax,0,3)
    ax.annotate('Open point (0, 1)',(0,1),xytext=(-1.9,1.8),arrowprops={'arrowstyle':'->'})
    ax.annotate('Included point (0, 3)',(0,3),xytext=(.45,2.1),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-2.4,2.5),ylim=(-1.4,6.4));ax.legend(loc='upper left',fontsize=10)
    save(fig,'limit-jump')

    fig,ax=axes('Graph of y = 1/x on either side of zero')
    for a,b in [(-3,-.13),(.13,3)]:
        x=np.linspace(a,b,250);ax.plot(x,1/x,linewidth=2.5)
    ax.axvline(0,linestyle='--',linewidth=1);ax.axhline(0,linestyle='--',linewidth=1)
    ax.annotate('Branch with x < 0',(-.2,-5),xytext=(-2.8,-3),arrowprops={'arrowstyle':'->'},fontsize=11)
    ax.annotate('Branch with x > 0',(.2,5),xytext=(.55,2.7),arrowprops={'arrowstyle':'->'},fontsize=11)
    ax.set(xlim=(-3.3,3.3),ylim=(-8,8));save(fig,'limit-reciprocal')

    fig,ax=axes('A rational graph with an excluded input')
    ax.plot([-1,4],[1,6],linewidth=2.5,label='(x^2 - 4)/(x - 2) for x != 2')
    dot(ax,2,4,True)
    ax.annotate('Missing point (2, 4)',(2,4),xytext=(-.6,5.4),arrowprops={'arrowstyle':'->'})
    ax.text(1.65,1.25,'No value assigned\nat the input x = 2.')
    ax.set(xlim=(-1.4,4.4),ylim=(.3,7.3));ax.legend(loc='upper left',fontsize=10)
    save(fig,'continuity-fill')

    fig,ax=axes('Graph of the absolute-value function')
    x=np.linspace(-3,3,151);ax.plot(x,np.abs(x),linewidth=2.5,label='f(x) = |x|')
    dot(ax,0,0)
    ax.annotate('Included vertex (0, 0)',(0,0),xytext=(-2.35,1.75),arrowprops={'arrowstyle':'->'},fontsize=11)
    ax.set(xlim=(-3.4,3.4),ylim=(-.5,4.1));ax.legend(loc='upper center',fontsize=10)
    save(fig,'continuity-corner')

    fig,ax=axes('A polynomial on the closed interval [0, 1]')
    x=np.linspace(0,1,200);ax.plot(x,x**3+x-1,linewidth=2.5,label='f(x) = x^3 + x - 1')
    ax.axhline(0,linestyle='--',label='Target output: 0')
    dot(ax,0,-1);dot(ax,1,1)
    ax.annotate('f(0) = -1',(0,-1),xytext=(.08,-1.4),arrowprops={'arrowstyle':'->'})
    ax.annotate('f(1) = 1',(1,1),xytext=(.64,1.35),arrowprops={'arrowstyle':'->'})
    ax.set(xlim=(-.08,1.1),ylim=(-1.65,1.9));ax.legend(loc='upper left',fontsize=10)
    save(fig,'continuity-ivt')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-dir',type=Path)
    args=parser.parse_args()
    build(args.preview_dir)
    print(f'Wrote 12 SVG figures to {OUT}')
