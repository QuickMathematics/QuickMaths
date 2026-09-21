"""Rebuild Batch 6's eight deterministic, offline teaching figures.

This is author-side Matplotlib, never learner-side executable lesson content.
Use the tested Matplotlib version in the delivery manifest for byte reproduction.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
from matplotlib.patches import Rectangle

NAMES = ['definition-secants','definition-corner','rules-polynomial','rules-tangent',
         'product-area','quotient-hole','chain-shifted-square','chain-root']

def build(output: Path):
    output.mkdir(parents=True,exist_ok=True)
    with matplotlib.rc_context({'svg.fonttype':'none','svg.hashsalt':'quickmaths-derivatives-batch6','font.size':12}):
        for name in NAMES:
            fig,ax=plt.subplots(figsize=(9,5.8))
            fig.subplots_adjust(left=.12,right=.96,bottom=.22,top=.88)
            ax.grid(True,alpha=.22); ax.set_xlabel('Input x');ax.set_ylabel('Output y')
            if name=='definition-secants':
                x=np.linspace(-.3,2.7,180);ax.plot(x,x*x,label='f(x)=x²',linewidth=2.2)
                for h in [1,.5,.2]:
                    xx=np.array([1,1+h]);ax.plot(xx,xx*xx,marker='o',label=f'Secant: h={h:g}')
                ax.plot(x,2*x-1,linestyle='--',label='Limiting tangent at x=1')
                ax.set_ylim(-1,8);ax.set_title('Secants approach a tangent')
                caption='The point stays at (1,1). The second input approaches 1; h is never set to zero in a secant quotient.'
            elif name=='definition-corner':
                x=np.linspace(-3,3,181);ax.plot(x,np.abs(x),linewidth=2.2,label='f(x)=|x|')
                ax.annotate('Left-hand slope: −1',xy=(-1.5,1.5),xytext=(-2.9,3.0),arrowprops={'arrowstyle':'->'})
                ax.annotate('Right-hand slope: +1',xy=(1.5,1.5),xytext=(.2,3.4),arrowprops={'arrowstyle':'->'})
                ax.set_ylim(-.4,4);ax.set_title('Continuity does not guarantee differentiability')
                caption='At zero the one-sided slopes disagree. There is no finite ordinary two-sided derivative.'
            elif name=='rules-polynomial':
                x=np.linspace(-2,2,180);ax.plot(x,x**3-3*x,linewidth=2.2,label='f(x)=x³−3x')
                ax.plot(x,3*x*x-3,linestyle='--',linewidth=2,label="f′(x)=3x²−3")
                ax.axhline(0,linewidth=.7);ax.set_ylim(-5,10);ax.set_title('A function and its derivative are different functions')
                caption='The function’s roots and the derivative’s roots answer different questions. A zero derivative marks a horizontal tangent.'
            elif name=='rules-tangent':
                x=np.linspace(-.2,2,180);ax.plot(x,x**3,linewidth=2.2,label='f(x)=x³')
                ax.plot(x,3*x-2,linestyle='--',label='Tangent y=1+3(x−1)')
                ax.plot([1],[1],marker='o');ax.set_ylim(-3,9);ax.set_title('The point value locates the tangent; the derivative tilts it')
                caption='At x=1, f(1)=1 and f′(1)=3. The tangent passes through (1,1), not through (1,3).'
            elif name=='product-area':
                ax.grid(False);ax.set_axis_off();ax.set_xlim(-1,8);ax.set_ylim(-1,5.6)
                for rect in [(0,0,5,3,None),(5,0,1,3,'//'),(0,3,5,.8,'\\\\'),(5,3,1,.8,'xx')]:
                    x,y,w,h,hatch=rect;ax.add_patch(Rectangle((x,y),w,h,fill=False,hatch=hatch,linewidth=1.3))
                ax.text(2.5,1.5,'u·v',ha='center',va='center',fontsize=19)
                ax.text(5.5,1.5,'v·Δu',ha='center',va='center',rotation=90)
                ax.text(2.5,3.4,'u·Δv',ha='center',va='center')
                ax.annotate('Δu·Δv',xy=(5.5,3.4),xytext=(6.1,4.5),arrowprops={'arrowstyle':'->'})
                ax.text(2.5,-.45,'u',ha='center');ax.text(5.5,-.45,'Δu',ha='center');ax.text(-.4,1.5,'v',va='center');ax.text(-.6,3.4,'Δv',va='center')
                ax.set_title('Two first-order contributions to changing area')
                caption='For positive changes, ΔA=v·Δu+u·Δv+Δu·Δv. The derivative keeps both first-order terms.'
            elif name=='quotient-hole':
                for a,b in [(-1,1.97),(2.03,4.5)]:
                    x=np.linspace(a,b,80);ax.plot(x,x+2,linewidth=2.2,label='Original f(x)=(x²−4)/(x−2)' if a==-1 else None)
                ax.plot([2],[4],marker='o',markerfacecolor='none',markersize=11,markeredgewidth=1.8)
                ax.annotate('Input 2 remains excluded',xy=(2,4),xytext=(-.7,5.9),arrowprops={'arrowstyle':'->'})
                ax.set_ylim(0,7);ax.set_title('Equal formulas away from a hole do not fill the hole')
                caption='f′(x)=1 only for x≠2. The extension g(x)=x+2 is a different function, defined at x=2.'
            elif name=='chain-shifted-square':
                x=np.linspace(-1.8,.8,181);ax.plot(x,(2*x+1)**2,linewidth=2.2,label='f(x)=(2x+1)²')
                ax.plot(x,4*x+1,linestyle='--',label='Tangent at x=0: slope 4')
                ax.plot([0],[1],marker='o');ax.set_ylim(-2,8);ax.set_title('The inner rate contributes a factor')
                caption='Outer derivative 2u is evaluated at u=2x+1, then multiplied by the inner derivative 2.'
            else:
                x=np.linspace(-1/3,3.0,181);ax.plot(x,np.sqrt(np.maximum(0,3*x+1)),linewidth=2.2,label='f(x)=√(3x+1)')
                ax.plot(x,2+.75*(x-1),linestyle='--',label='Tangent at x=1: slope 3/4')
                ax.plot([-1/3,1],[0,2],marker='o',linestyle='none');ax.set_ylim(-.5,3.8);ax.set_title('A square-root function and its derivative have different domains')
                caption='The function includes x=−1/3. Its finite ordinary derivative formula applies only for x>−1/3.'
            handles,labels=ax.get_legend_handles_labels()
            if handles: ax.legend(handles,labels,loc='best',fontsize=9.5)
            import textwrap
            fig.text(.5,.07,'\n'.join(textwrap.wrap(caption,105)),ha='center',va='center',fontsize=10.5)
            fig.savefig(output/f'{name}.svg',metadata={'Date':None,'Creator':'QuickMaths Batch 6 Matplotlib figures'},format='svg')
            plt.close(fig)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    default=Path(__file__).resolve().parents[1]/'content/math/algebra_foundations/skills/media/native-derivatives-batch6'
    parser.add_argument('--output',type=Path,default=default)
    build(parser.parse_args().output)
