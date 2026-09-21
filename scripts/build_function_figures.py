"""Rebuild the native Functions batch's teaching and fixed-assessment figures.

Run from the repository root. Outputs are deterministic SVG images; learners do
not execute this Python. Each assessment figure is attached only to a fixed
question whose written givens and alternative text specify the same geometry.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import MaxNLocator

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'content/math/algebra_foundations/skills/media/native-functions'


def canvas(title: str, xlim: tuple[float, float], ylim: tuple[float, float]):
    fig, ax = plt.subplots(figsize=(8, 5), layout='constrained')
    ax.set(title=title, xlim=xlim, ylim=ylim, xlabel='Input x', ylabel='Output y')
    ax.grid(True, alpha=.2)
    ax.axhline(0, linewidth=.7, linestyle=':')
    ax.axvline(0, linewidth=.7, linestyle=':')
    ax.xaxis.set_major_locator(MaxNLocator(integer=True, nbins=8))
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=7))
    return fig, ax


def point(ax, x: float, y: float, *, opened=False, label='', offset=(9, 12)):
    # An unfilled marker leaves an endpoint genuinely open without adding an
    # opaque patch that might conceal another curve.
    ax.plot([x], [y], marker='o', markersize=9, markerfacecolor='none' if opened else None,
            markeredgewidth=2, linestyle='none', zorder=5)
    if label:
        ax.annotate(label, (x, y), xytext=offset, textcoords='offset points', fontsize=11)


def save(fig, name: str, previews: Path | None):
    svg = DEST / f'{name}.svg'
    fig.savefig(svg, metadata={'Date': None}, format='svg')
    # Normalize path-line trailing spaces without changing the SVG geometry.
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
    if previews:
        previews.mkdir(parents=True, exist_ok=True)
        fig.savefig(previews / f'{name}.png', dpi=125)
    plt.close(fig)


def build(previews: Path | None = None):
    DEST.mkdir(parents=True, exist_ok=True)
    with plt.rc_context({'svg.fonttype': 'none', 'svg.hashsalt': 'quickmaths-native-functions-v1',
                         'font.size': 11, 'axes.titlesize': 15, 'axes.titlepad': 16}):
        fig, ax = canvas('Cancellation does not fill a hole', (-3, 6), (-1, 8))
        for lo, hi in [(-3, 1.94), (2.06, 6)]:
            x = np.linspace(lo, hi, 100); ax.plot(x, x+2, linewidth=2.2)
        point(ax, 2, 4, opened=True, label='Excluded point (2, 4)', offset=(15, -25))
        ax.text(.03, .94, r'$y=(x^2-4)/(x-2)=x+2,\quad x\ne 2$', transform=ax.transAxes, va='top')
        save(fig, 'domain-hole', previews)

        fig, ax = canvas('Domain and range begin at the included endpoint', (-1, 11), (-3, 2))
        x = np.linspace(1, 11, 300); ax.plot(x, np.sqrt(x-1)-2, linewidth=2.2, label=r'$y=\sqrt{x-1}-2$')
        point(ax, 1, -2, label='(1, -2)', offset=(9, -22))
        ax.legend(loc='upper left'); save(fig, 'domain-square-root', previews)

        fig, ax = canvas('Read the actual endpoints, not the viewing window', (-3, 4), (0, 5))
        x = np.linspace(-1.96, 3, 100); ax.plot(x, .6*x+2.2, linewidth=2.2)
        point(ax, -2, 1, opened=True, label='(-2, 1), open', offset=(8, -24))
        point(ax, 3, 4, label='(3, 4), included', offset=(-135, 15))
        save(fig, 'domain-segment-test', previews)

        fig, ax = canvas('Transform a parent function, then check key points', (-3, 6), (-6, 10))
        x = np.linspace(-3, 6, 400)
        ax.plot(x, x*x, linewidth=2, label=r'$f(x)=x^2$')
        ax.plot(x, -.5*(x-2)**2+3, linewidth=2.2, label=r'$g(x)=-\frac{1}{2}(x-2)^2+3$')
        point(ax, 0, 0, label='(0, 0)', offset=(-55, -22)); point(ax, 2, 3, label='(2, 3)', offset=(10, -22))
        ax.legend(loc='upper right'); save(fig, 'transformation-overview', previews)

        fig, ax = plt.subplots(figsize=(8, 5), layout='constrained'); ax.set_axis_off()
        ax.set_title('Track input and output separately', fontsize=16, pad=18)
        ax.text(.5, .88, r'$g(x)=-2f(3(x-1))+4$', transform=ax.transAxes, ha='center', fontsize=20)
        ax.text(.16, .61, 'Original point\n(6, 2)', transform=ax.transAxes, ha='center', va='center', fontsize=17)
        ax.annotate('', xy=(.75, .61), xytext=(.30, .61), xycoords='axes fraction', arrowprops={'arrowstyle':'->','linewidth':2})
        ax.text(.84, .61, 'New point\n(3, 0)', transform=ax.transAxes, ha='center', va='center', fontsize=17)
        ax.text(.50, .39, 'Input: 3(x - 1) = 6  gives  x = 3', transform=ax.transAxes, ha='center', fontsize=14)
        ax.text(.50, .24, 'Output: -2(2) + 4 = 0', transform=ax.transAxes, ha='center', fontsize=14)
        ax.text(.50, .08, 'Solve the inner input condition; apply the outer output rule.', transform=ax.transAxes, ha='center', fontsize=11)
        save(fig, 'transformation-point-map', previews)

        fig, ax = canvas('A transformed parabola with its key points', (-4, 2), (-1, 6))
        x = np.linspace(-4, 2, 400); ax.plot(x, -(x+1)**2+4, linewidth=2.2)
        point(ax, -1, 4, label='Vertex (-1, 4)', offset=(-65, 15))
        point(ax, 0, 3, label='(0, 3)', offset=(10, 8)); point(ax, 1, 0, label='(1, 0)', offset=(-50, -23))
        save(fig, 'transformation-test', previews)

        fig, ax = plt.subplots(figsize=(8, 5), layout='constrained'); ax.set_axis_off()
        ax.set_title('Composition: the output of one stage feeds the next', fontsize=15, pad=20)
        ax.text(.5, .86, r'$f(g(3))=f(5)=25$', transform=ax.transAxes, ha='center', fontsize=23)
        for position, text in [(0.08, '3'), (.39, '5'), (.79, '25')]:
            ax.text(position, .52, text, transform=ax.transAxes, ha='center', va='center', fontsize=24)
        for x1,x2 in [(.14,.32),(.47,.71)]:
            ax.annotate('', xy=(x2,.52), xytext=(x1,.52), xycoords='axes fraction', arrowprops={'arrowstyle':'->','linewidth':2})
        ax.text(.235, .34, 'g(x) = 2x - 1', transform=ax.transAxes, ha='center', fontsize=13)
        ax.text(.59, .34, r'$f(t)=t^2$', transform=ax.transAxes, ha='center', fontsize=14)
        ax.text(.5, .12, 'First g: 2(3) - 1 = 5.   Then f: 5 squared = 25.', transform=ax.transAxes, ha='center', fontsize=12)
        save(fig, 'composition-machine', previews)

        fig, ax = canvas('Exchanging the functions changes the output', (-2, 3), (-4, 9))
        x=np.linspace(-2,3,100)
        ax.plot(x,2*x+1,linewidth=2.2,label=r'$f(g(x))=2x+1$')
        ax.plot(x,2*x+2,linewidth=2.2,linestyle='--',label=r'$g(f(x))=2x+2$')
        ax.text(.03,.94,'f(x) = x + 1;   g(x) = 2x',transform=ax.transAxes,va='top')
        ax.legend(loc='lower right'); save(fig, 'composition-order', previews)

        fig, ax = canvas('A simplified composite still has its original hole', (-1,7), (-4,4))
        for lo,hi in [(-1,2.94),(3.06,7)]:
            x=np.linspace(lo,hi,100);ax.plot(x,x-3,linewidth=2.2)
        point(ax,3,0,opened=True,label='Excluded point (3, 0)',offset=(-150,18))
        ax.text(.03,.94,'f(t) = 1/t;   g(x) = 1/(x - 3)',transform=ax.transAxes,va='top')
        ax.text(.03,.85,'f(g(x)) = x - 3 only when x != 3',transform=ax.transAxes,va='top')
        save(fig,'composition-hole',previews)

        fig, ax = canvas('An inverse reflects input-output pairs in y = x', (-2,5), (-2,5))
        x=np.linspace(-2,5,200)
        ax.plot(x,2*x+1,linewidth=2.2,label=r'$f(x)=2x+1$')
        ax.plot(x,(x-1)/2,linewidth=2.2,label=r'$f^{-1}(x)=(x-1)/2$')
        ax.plot(x,x,linestyle='--',linewidth=1,label=r'$y=x$')
        point(ax,1,3,label='(1, 3)',offset=(10,8));point(ax,3,1,label='(3, 1)',offset=(10,-22))
        ax.set_aspect('equal',adjustable='box');ax.legend(loc='upper left',fontsize=9);save(fig,'inverse-linear',previews)

        fig, ax = canvas('Restrict the quadratic before reversing it', (0,8), (0,8))
        x=np.linspace(1,1+np.sqrt(6),250); t=np.linspace(2,8,250)
        ax.plot(x,(x-1)**2+2,linewidth=2.2,label=r'$f(x)=(x-1)^2+2,\ x\geq 1$')
        ax.plot(t,1+np.sqrt(t-2),linewidth=2.2,label=r'$f^{-1}(x)=1+\sqrt{x-2},\ x\geq 2$')
        ax.plot([0,8],[0,8],linestyle='--',linewidth=1,label=r'$y=x$')
        point(ax,1,2,label='(1, 2)',offset=(-12,-23));point(ax,2,1,label='(2, 1)',offset=(8,-17))
        point(ax,3,6,label='(3, 6)',offset=(10,3));point(ax,6,3,label='(6, 3)',offset=(7,-20))
        ax.set_aspect('equal',adjustable='box');ax.legend(loc='upper left',fontsize=8.5);save(fig,'inverse-restricted-quadratic',previews)

        fig, ax = canvas('A function can fail to be one-to-one', (-3,3), (-1,10))
        x=np.linspace(-3,3,300);ax.plot(x,x*x,linewidth=2.2,label=r'$f(x)=x^2$')
        ax.axhline(4,linestyle='--',linewidth=1.5,label=r'$y=4$')
        point(ax,-2,4,label='(-2, 4)',offset=(-16,15));point(ax,2,4,label='(2, 4)',offset=(-48,15))
        ax.legend(loc='upper center');save(fig,'inverse-horizontal-test',previews)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-dir',type=Path,help='Also save PNG previews for visual review.')
    args=parser.parse_args();build(args.preview_dir)
    print(f'Wrote 12 SVG figures to {DEST}')


if __name__=='__main__':
    main()
