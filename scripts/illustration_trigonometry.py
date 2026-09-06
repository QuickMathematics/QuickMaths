"""Additional geometry figures cover the concepts flagged in the audit."""
import numpy as np
from matplotlib.patches import Polygon, Circle
from scripts.illustration_drawing import *

def draw(ax,kind):
    if kind=="special-triangles":
        canvas(ax,"Two special right-triangle families")
        for x,b,h,labels in [(.8,3,3,("1","1","√2","45°")),(5.6,3,1.732,("√3","1","2","30°"))]:
            ax.add_patch(Polygon([(x,1.9),(x+b,1.9),(x+b,1.9+h)],facecolor=MINT,edgecolor=PINE,lw=2.5))
            ax.plot([x+b-.2,x+b-.2,x+b],[1.9,2.1,2.1],color=PINE)
            text(ax,x+b/2,1.35,labels[0]);text(ax,x+b+.35,1.9+h/2,labels[1]);text(ax,x+b/2-.2,2.35+h/2,labels[2]);text(ax,x+.65,2.12,labels[3],16)
        text(ax,5,.5,"Multiply all sides by the same scale factor.",20)
    elif kind=="elevation":
        canvas(ax,"An angle of elevation makes a right triangle")
        ax.plot([1,8],[1.8,1.8],color=MUTED);ax.plot([8,8],[1.8,5.8],color=PINE,lw=6);ax.plot([1,8],[1.8,5.8],color=CORAL,lw=3)
        text(ax,4.5,1.2,"horizontal distance d");text(ax,8.7,3.7,"height\nh",20);text(ax,2.5,2.05,"θ",25);text(ax,5,.5,"tan θ = h/d",23)
    elif kind=="radian-arc":
        canvas(ax,"Radians compare arc length with radius")
        ax.set_aspect("equal");t=np.linspace(0,2*np.pi,180);ax.plot(5+2*np.cos(t),3.7+2*np.sin(t),color=MUTED)
        t=np.linspace(0,np.pi/3,60);ax.plot(5+2*np.cos(t),3.7+2*np.sin(t),color=CORAL,lw=5)
        ax.plot([5,7],[3.7,3.7],color=PINE,lw=2);ax.plot([5,6],[3.7,3.7+np.sqrt(3)],color=PINE,lw=2)
        text(ax,6,3.25,"r = 6");text(ax,7.5,5.3,"s = 2π");text(ax,5.7,4,"π/3",17);text(ax,5,.8,"s = rθ = 6 × π/3 = 2π",23)
    elif kind=="reference-turns":
        canvas(ax,"Coterminal angles share a terminal ray")
        ax.set_aspect("equal");ax.add_patch(Circle((5,3.7),2,fill=False,edgecolor=MUTED));ax.plot([2.6,7.4],[3.7,3.7],color=MUTED)
        angle=5*np.pi/4;arrow(ax,(5,3.7),(5+2*np.cos(angle),3.7+2*np.sin(angle)))
        t=np.linspace(np.pi,angle,50);ax.plot(5+.9*np.cos(t),3.7+.9*np.sin(t),color=CORAL,lw=3)
        text(ax,3.6,3.35,"45°",19);text(ax,5,5.95,"225° and −135°",21);text(ax,5,.65,"Reference angle: 225° − 180° = 45°",21)
    elif kind=="period-phase":
        axes(ax,(0,2*np.pi),(-1.5,1.8),"Changing period and phase","x (radians)","y")
        x=np.linspace(0,2*np.pi,400)
        for y,col,label in [(np.sin(x),PINE,"sin(x)"),(np.sin(2*x),BLUE,"sin(2x): half period"),(np.sin(x-np.pi/4),CORAL,"sin(x−π/4): shift right")]:ax.plot(x,y,color=col,lw=2.3,label=label)
        ax.legend(fontsize=15,loc="upper center");ax.set_xticks([0,np.pi,2*np.pi],["0","π","2π"])
    elif kind=="quadrant-signs":
        axes(ax,(-15,4),(-3,9),"Quadrant II determines the signs")
        ax.add_patch(Polygon([(0,0),(-12,0),(-12,5)],facecolor=MINT,edgecolor=PINE,lw=2))
        ax.scatter(-12,5,color=CORAL,s=75);ax.text(-11.5,6.4,"(−12, 5), r = 13",fontsize=20,color=PINE)
        ax.text(-10,-2,"cos θ = −12/13; sin θ = 5/13",fontsize=17,color=PINE);ax.set_aspect("equal")
    elif kind=="restricted-cycles":
        axes(ax,(0,2*np.pi),(-1.4,1.4),"cos(2x) = 0 on [0, 2π)","x (radians)","y")
        x=np.linspace(0,2*np.pi,400);ax.plot(x,np.cos(2*x),color=PINE,lw=3)
        roots=np.array([1,3,5,7])*np.pi/4;ax.scatter(roots,np.zeros(4),color=CORAL,s=75)
        ax.set_xticks(roots,["π/4","3π/4","5π/4","7π/4"])
    elif kind=="tangent":
        axes(ax,(0,2*np.pi),(-3,3),"tan(x) = −1 on [0, 2π)","x (radians)","y")
        for lo,hi in [(0,np.pi/2-.02),(np.pi/2+.02,3*np.pi/2-.02),(3*np.pi/2+.02,2*np.pi)]:
            x=np.linspace(lo,hi,180);ax.plot(x,np.tan(x),color=PINE,lw=2.5)
        ax.axhline(-1,color=CORAL,ls="--");ax.scatter([3*np.pi/4,7*np.pi/4],[-1,-1],color=CORAL,s=75)
        for x in [np.pi/2,3*np.pi/2]:ax.axvline(x,color=MUTED,ls=":")
        ax.set_xticks([0,np.pi,2*np.pi],["0","π","2π"])
    elif kind=="ssa":
        canvas(ax,"SSA can give zero, one or two triangles")
        for i,a in enumerate([3,4,5]):
            left=.45+3.3*i;scale=.24;origin=(left,2);c=(left+8*np.cos(np.pi/6)*scale,2+4*scale)
            ax.plot([left,left+2.95],[2,2],color=MUTED);ax.plot([left,c[0]],[2,c[1]],color=PINE,lw=2)
            ax.add_patch(Circle(c,a*scale,fill=False,edgecolor=CORAL,ls="--"))
            if a>=4:
                delta=np.sqrt(a*a-16)
                for b in set([8*np.cos(np.pi/6)-delta,8*np.cos(np.pi/6)+delta]):ax.plot([c[0],left+b*scale],[c[1],2],color=BLUE,lw=2)
            text(ax,left+1.45,4.6,f"a = {a}",21);text(ax,left+1.45,1.1,["0 triangles","1 triangle","2 triangles"][i],18)
        text(ax,5,5.6,"A = 30°, b = 8 → altitude h = 4",21);text(ax,5,.4,"Circle radius a measures the possible opposite side.",17)
    elif kind=="included-area":
        canvas(ax,"The altitude connects angle and area")
        ax.add_patch(Polygon([(1.5,1.8),(8.5,1.8),(5.5,4.8)],facecolor=MINT,edgecolor=PINE,lw=2.5))
        ax.plot([5.5,5.5],[1.8,4.8],color=CORAL,ls="--",lw=2.5);text(ax,5,1.1,"base b");text(ax,3.2,3.8,"side a");text(ax,6.6,3.3,"h = a sin(C)",18);text(ax,2.8,2.1,"C",21)
        text(ax,5,.4,"Area = ½bh = ½ab sin(C)",23)
    elif kind=="recursion-stack":
        canvas(ax,"Calls return in the reverse order")
        for j,label in enumerate(["factorial(3) → 3 × factorial(2)","factorial(2) → 2 × factorial(1)","factorial(1) → 1 × factorial(0)","factorial(0) → 1"]):
            box(ax,1+j*.35,4.8-j*1.1,7.8,.8,label,size=18)
        arrow(ax,(.7,5.3),(.7,1.4));arrow(ax,(9.6,1.4),(9.6,5.3));text(ax,5,.35,"Unwind: 1 → 1 → 2 → 6",22)
    elif kind=="memoization":
        tree(ax,"Memoization reuses repeated subproblems",("fib(5)","fib(4)","fib(3)","fib(2)","fib(1)"),"A cached fib(3) is reused by fib(4), instead of recalculated.")
        arrow(ax,(2.5,3.5),(6.5,3.5),"reuse")
    else:raise ValueError(kind)
