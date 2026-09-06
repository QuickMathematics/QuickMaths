"""Companion views for the additional concepts identified in the coverage audit."""
import numpy as np
from matplotlib.patches import Rectangle
from scripts.illustration_drawing import *

KINDS = {"fraction-division", "interval-union", "function-mapping", "shifted-log-domain", "system-cases", "binary-search"}

def draw(ax,kind):
    if kind == "fraction-division":
        canvas(ax,"How many sixths fit into two thirds?")
        for i in range(6):
            ax.add_patch(Rectangle((1+i*1.3,3),1.3,1.2,facecolor=MINT if i<4 else PAPER,edgecolor=PINE,lw=2))
            text(ax,1.65+i*1.3,2.5,"1/6",20)
        ax.plot([1,6.2],[4.65,4.65],color=CORAL,lw=3)
        text(ax,3.6,5.15,"2/3 of the whole",22)
        text(ax,5,1.2,"2/3 ÷ 1/6 = 4 equal groups",24)
    elif kind == "interval-union":
        numberline(ax,-6,7,[(-6,-2),(3,7)],[(-2,True),(3,False)],"OR joins two separate solution regions",[-6,-2,0,3,7])
        arrow(ax,(1.5,3),(.7,3));arrow(ax,(8.5,3),(9.3,3))
        text(ax,5,5.2,"x ≤ −2  or  x > 3",24)
        text(ax,5,1.2,"(−∞, −2] ∪ (3, ∞)",24)
    elif kind == "function-mapping":
        canvas(ax,"Shared outputs still make a function")
        for y,label in [(4.8,"−2"),(3.2,"0"),(1.6,"2")]: box(ax,1,y,2,1,label)
        for y,label in [(4,"4"),(2,"0")]: box(ax,7,y,2,1,label)
        for start,end in [((3,5.3),(7,4.5)),((3,3.7),(7,2.5)),((3,2.1),(7,4.5))]: arrow(ax,start,end)
        text(ax,5,.6,"f(x) = x²: one arrow leaves each input",22)
    elif kind == "shifted-log-domain":
        axes(ax,(0,11),(-4,4),"A logarithm needs a positive argument")
        x=np.linspace(3.07,11,240);ax.plot(x,np.log2(x-3),color=PINE,lw=3,label="y = log₂(x − 3)")
        ax.axvline(3,color=CORAL,ls="--",label="vertical asymptote x = 3")
        ax.axvspan(0,3,color=MINT,alpha=.55);ax.text(.55,-2.7,"Outside\ndomain",fontsize=18,color=PINE)
        ax.legend(fontsize=17,loc="upper left")
    elif kind == "system-cases":
        canvas(ax,"Systems can have one, zero or infinitely many solutions")
        for i,label in enumerate(["One point","No points","Every point"]):
            x=.6+3.2*i;y=2.2
            ax.plot([x,x+2.6],[y+.1,y+.1],color=MUTED,lw=1);ax.plot([x+.15,x+.15],[y,y+2.7],color=MUTED,lw=1)
            ax.plot([x+.3,x+2.4],[y+.4,y+2.2],color=PINE,lw=3)
            ys=[y+2.2,y+.4] if i==0 else [y+.95,y+2.75] if i==1 else [y+.4,y+2.2]
            ax.plot([x+.3,x+2.4],ys,color=CORAL,lw=2.5,ls="--" if i==2 else "-")
            text(ax,x+1.35,1.45,label,20)
        text(ax,5,.6,"Intersecting · parallel and distinct · coincident",20)
    elif kind == "binary-search":
        canvas(ax,"Halve the active search range")
        for j,(lo,hi,mid) in enumerate([(1,16,8),(9,16,12),(13,16,14),(13,13,13)]):
            for n in range(1,17):
                x=.5+(n-1)*.56;y=4.7-j*1.05
                ax.add_patch(Rectangle((x,y),.53,.65,facecolor="#efd0c4" if n==mid else MINT if lo<=n<=hi else PAPER,edgecolor=MUTED,lw=.8))
                text(ax,x+.265,y+.325,str(n),15,color=PINE if lo<=n<=hi else MUTED)
        text(ax,5,.65,"Sorted input · target 13 · check 8 → 12 → 14 → 13",19)
    else: raise ValueError(kind)
