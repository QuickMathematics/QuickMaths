"""Mathematics illustrations: quantities, transformations and graphs."""
import numpy as np
from matplotlib.patches import Rectangle, Polygon
from scripts.illustration_drawing import *

def draw(ax,id):
    if id=="MATH_ARITH_001":
        numberline(ax,-12,0,title="Adding a negative moves left",ticks=[-12,-10,-8,-6,-4,-2,0])
        arrow(ax,(5,4.2),(2.33,4.2),"−4");text(ax,5,5.5,"−6 + (−4) = −10",25)
    elif id=="MATH_ARITH_002":
        canvas(ax,"Multiplication happens before addition")
        box(ax,1,4,2,1.2,"7");box(ax,5,4,3.5,1.2,"3 × 4 = 12")
        arrow(ax,(2,3.9),(4.1,2.5));arrow(ax,(6.7,3.9),(5.8,2.5));box(ax,3.2,1.2,3.6,1.4,"7 + 12 = 19")
    elif id=="MATH_ARITH_003":
        canvas(ax,"Equal parts make comparable fractions")
        for y,parts,filled,label in [(4.6,8,3,"3/8"),(2.7,8,4,"4/8 = 1/2")]:
            for i in range(parts):ax.add_patch(Rectangle((1+i, y),1,.9,facecolor=MINT if i<filled else PAPER,edgecolor=PINE,lw=1.5))
            text(ax,5,y-.5,label,23)
    elif id=="MATH_ARITH_004":
        canvas(ax,"A fraction of a fraction")
        for i in range(3):
            for j in range(4):ax.add_patch(Rectangle((2+i*2,1.7+j),2,1,facecolor=MINT if i<2 else PAPER,edgecolor=PINE,lw=1.5))
        ax.add_patch(Rectangle((2,1.7),4,3,facecolor=CORAL,alpha=.45))
        text(ax,5,.7,"2/3 × 3/4 = 6/12 = 1/2",24)
    elif id=="MATH_ARITH_005":
        canvas(ax,"35 out of 100 equal squares")
        for i in range(100):ax.add_patch(Rectangle((2.5+(i%10)*.5,1.2+(i//10)*.5),.5,.5,facecolor=MINT if i<35 else PAPER,edgecolor=MUTED,lw=.6))
        text(ax,5,.55,"35% = 35/100 = 0.35",23)
    elif id in {"MATH_PREALG_001","MATH_PREALG_005","MATH_FUNC_001"}:
        if id=="MATH_FUNC_001":
            flow(ax,"A function gives each input one output",["x = 4","f(x) = 5x − 3","f(4) = 17"],"Different inputs may share an output.")
        elif id=="MATH_PREALG_001":flow(ax,"Substitution replaces every occurrence",["x = −3","2x + 5","2(−3) + 5 = −1"])
        else:flow(ax,"Translate quantities into a relationship",["3 packs","x items each","3x + 2 items"],"Two extra items are added after counting the packs.")
    elif id in {"MATH_PREALG_002","MATH_PREALG_004","MATH_POLY_001"}:
        canvas(ax,"Group equal kinds of terms")
        for i in range(5):box(ax,1+i*1.6,3.4,1.2,1.7,"x",MINT if i<3 else "#bfd8e6")
        text(ax,5,2.3,"3x + 2x = 5x",27)
        if id=="MATH_PREALG_004":text(ax,5,1.1,"2(3x + 1) − x = 6x + 2 − x = 5x + 2",19)
        elif id=="MATH_POLY_001":text(ax,5,1.1,"x² terms, x terms and constants form separate groups.",19)
    elif id in {"MATH_PREALG_003","MATH_POLY_002","MATH_POLY_004","MATH_POLY_003","MATH_QUAD_002"}:
        if id=="MATH_PREALG_003":
            area(ax,(4,2),(3,),[["3x","6"]],"3(x + 2) = 3x + 6");text(ax,4,1,"x",22);text(ax,7,1,"2",22);text(ax,1.5,3.5,"3",22)
        elif id=="MATH_POLY_003":
            area(ax,(4,2),(3,),[["3x²","6x"]],"Factor out the shared height 3x");text(ax,4,1,"x");text(ax,7,1,"2");text(ax,1.2,3.5,"3x")
        else:
            square=id=="MATH_QUAD_002";a,b=(3,3) if square else (2,3)
            area(ax,(4,a),(4,b),[["x²",f"{a}x"],[f"{b}x",str(a*b)]],"(x + 3)² = x² + 6x + 9" if square else "(x + 2)(x + 3) = x² + 5x + 6")
            text(ax,4,1,"x");text(ax,7.2,1,str(a));text(ax,1.5,2.9,"x");text(ax,1.5,5,str(b))
    elif id in {"MATH_ALG_001","MATH_ALG_002","MATH_ALG_003"}:
        canvas(ax,"Keep both sides balanced")
        ax.plot([1,9],[3.1,3.1],color=PINE,lw=4);ax.add_patch(Polygon([[4.5,1.5],[5.5,1.5],[5,3.1]],facecolor=MINT,edgecolor=PINE))
        texts={"MATH_ALG_001":("x + 3","7","Subtract 3 from both sides → x = 4"),"MATH_ALG_002":("2x + 3","11","Subtract 3, then divide both sides by 2 → x = 4"),"MATH_ALG_003":("3x + 2","x + 10","Subtract x and 2 from both sides → 2x = 8")}
        left,right,footer=texts[id];box(ax,1,3.3,3,1.4,left);box(ax,6,3.3,3,1.4,right);text(ax,5,.6,footer,18)
    elif id=="MATH_ALG_005":
        area(ax,(6,),(3,),[["A = wh"]],"Rearrange the area relationship")
        text(ax,5,1,"width w");text(ax,1.2,3.5,"h");text(ax,5,.35,"w = A/h  (h ≠ 0)",21)
    elif id in {"MATH_ALG_006","MATH_INEQ_001"}:
        numberline(ax,-4,7,[(-2,5)],[(-2,True),(5,False)],"−2 ≤ x < 5",[-4,-2,0,2,5,7]);text(ax,5,1,"Closed at −2; open at 5 → [−2, 5)",21)
    elif id=="MATH_ALG_007":
        numberline(ax,-5,5,[(-5,2)],[(2,False)],"Multiplying by −1 reflects the number line",[-5,-2,0,2,5]);arrow(ax,(6.6,4.5),(3.4,4.5))
        text(ax,5,5.4,"x < 2  becomes  −x > −2",24);text(ax,5,1,"Reflection reverses left and right.",21)
    elif id=="MATH_ALG_008":
        numberline(ax,-8,8,points=[(-7,True),(7,True)],title="Absolute value measures distance",ticks=[-7,0,7])
        arrow(ax,(5,4),(1.5,4),"7 units");arrow(ax,(5,4),(8.5,4),"7 units");text(ax,5,1,"|x| = 7 has two solutions: −7 and 7",22)
    elif id in {"MATH_SEQ_001","MATH_SEQ_002"}:
        geo=id.endswith("002");x=np.arange(1,6);y=3*2.**(x-1) if geo else 2+3*(x-1)
        axes(ax,(.5,5.5),(0,max(y)*1.22),"Multiply by 2 each step" if geo else "Add 3 each step","Term n","Value")
        ax.scatter(x,y,color=PINE,s=65);ax.plot(x,y,color=MUTED,ls="--");ax.set_xticks(x)
        for a,b in zip(x,y):ax.annotate(str(int(b)),(a,b),xytext=(0,12),textcoords="offset points",ha="center",fontsize=18,color=PINE)
    elif id in {"MATH_EXP_001","MATH_RAD_001","MATH_LOG_002"}:
        if id=="MATH_EXP_001":flow(ax,"Combine factors with the same base",["a² : a · a","a³ : a · a · a","a⁵"],"a² × a³ contains 2 + 3 copies of a.")
        elif id=="MATH_RAD_001":flow(ax,"Extract a complete square factor",["√72","√(36 × 2)","6√2"],"The square of 6√2 is 36 × 2 = 72.")
        else:
            canvas(ax,"Equal log steps represent multiplication")
            for i,label in enumerate(["1","10","100","1000"]):
                box(ax,.5+i*2.4,3.2,1.8,1.1,label);text(ax,1.4+i*2.4,2.4,str(i),22)
                if i<3:arrow(ax,(2.3+i*2.4,3.8),(2.9+i*2.4,3.8),"×10")
            text(ax,5,1.2,"log₁₀(x): 0 → 1 → 2 → 3",24)
    elif id in {"MATH_EXP_002","MATH_EXP_003","MATH_LOG_001","MATH_LOG_003"}:
        if id=="MATH_LOG_001":
            axes(ax,(-2,8),(-3,8),"Exponential and logarithmic inverses")
            x=np.linspace(-2,3,160);y=np.linspace(.125,8,160)
            ax.plot(x,2**x,color=PINE,lw=3,label="y = 2ˣ");ax.plot(y,np.log2(y),color=CORAL,lw=3,label="y = log₂(x)");ax.plot([-2,8],[-2,8],color=MUTED,ls="--",label="y = x")
            ax.set_aspect("equal");ax.legend(fontsize=17,loc="upper left")
        else:
            limit=5 if id!="MATH_EXP_002" else 4;x=np.linspace(0,limit,200)
            axes(ax,(0,limit),(0,40),"Growth and decay" if id=="MATH_EXP_002" else "Solve by locating the intersection")
            if id=="MATH_EXP_002":
                ax.plot(x,2*2**x,lw=3,color=PINE,label="2 × 2ˣ");ax.plot(x,30*.5**x,lw=3,color=CORAL,label="30 × (1/2)ˣ")
            else:
                a,target=(1,16) if id=="MATH_EXP_003" else (3,20)
                ax.plot(x,a*2**x,color=PINE,lw=3,label=f"{a} × 2ˣ");ax.axhline(target,color=CORAL,ls="--",label=str(target))
                root=np.log2(target/a);ax.scatter(root,target,color=CORAL,s=65);ax.plot([root,root],[0,target],color=MUTED,ls=":")
            ax.legend(fontsize=17)
    elif id in {"MATH_INEQ_002","MATH_RAT_007"}:signchart(ax,id=="MATH_RAT_007")
    elif id in {"MATH_RAT_001","MATH_RAT_006"}:
        axes(ax,(-6,10),(-7,8),"A hole is not a vertical asymptote")
        for lo,hi in [(-6,3.9),(4.1,10)]:
            x=np.linspace(lo,hi,180);ax.plot(x,(x+1)/(x-4),color=PINE,lw=2.6)
        ax.axvline(4,color=CORAL,ls="--");ax.axhline(1,color=MUTED,ls="--");ax.scatter(2,-1.5,s=120,facecolor=PAPER,edgecolor=CORAL,lw=2,zorder=5)
        ax.annotate("hole: x = 2",(2,-1.5),xytext=(-5,-5),arrowprops={"arrowstyle":"->","color":CORAL},fontsize=18,color=PINE)
        ax.text(-5,6,"(x−2)(x+1) / [(x−2)(x−4)]",fontsize=16,color=PINE)
    elif id in {"MATH_RAT_002","MATH_RAT_003","MATH_RAT_004","MATH_RAT_005"}:
        specs={"MATH_RAT_002":("Cancel factors, retain exclusions",["(x−2)(x+3)","÷ (x−2)","x + 3"],"x ≠ 2 remains part of the domain."),
               "MATH_RAT_003":("A shared denominator makes units alike",["1/x = 2/(2x)","2/(2x) + 1/(2x)","3/(2x)"],"x ≠ 0; combine numerators after matching denominators."),
               "MATH_RAT_004":("Clear denominators on the allowed domain",["1/x = 1/2","2 = x","x = 2 ✓"],"The excluded value x = 0 is never a candidate."),
               "MATH_RAT_005":("Check candidates in the original equation",["x/(x−1) = 1/(x−1)","x = 1","Rejected"],"The original denominator is zero at x = 1.")}
        flow(ax,*specs[id])
    elif id in {"MATH_QUAD_001","MATH_QUAD_003","MATH_QUAD_004","MATH_QUAD_005"}:
        if id=="MATH_QUAD_001":
            axes(ax,(-1,7),(-4,18),"Zeros connect factors to the graph");x=np.linspace(-1,7,220);ax.plot(x,(x-2)*(x-5),color=PINE,lw=3);ax.scatter([2,5],[0,0],color=CORAL,s=75)
        elif id=="MATH_QUAD_003":
            axes(ax,(-3,3),(-3,7),"The discriminant predicts real intersections");x=np.linspace(-3,3,200)
            for shift,col,label in [(-2,PINE,"D > 0: two"),(0,BLUE,"D = 0: one"),(2,CORAL,"D < 0: none")]:ax.plot(x,x*x+shift,color=col,lw=2.5,label=label)
            ax.legend(fontsize=16,loc="upper center")
        elif id=="MATH_QUAD_004":
            axes(ax,(-2,6),(-5,15),"y = 2(x − 2)² − 3");x=np.linspace(-1,5,180);ax.plot(x,2*(x-2)**2-3,color=PINE,lw=3);ax.axvline(2,color=MUTED,ls="--");ax.scatter(2,-3,color=CORAL,s=85);ax.annotate("vertex (2, −3)",(2,-3),xytext=(-1.5,4),arrowprops={"arrowstyle":"->"},fontsize=18)
        else:
            axes(ax,(0,20),(0,120),"A rectangle with perimeter 40","Width x","Area");x=np.linspace(0,20,200);ax.plot(x,x*(20-x),color=PINE,lw=3);ax.scatter(10,100,color=CORAL,s=85);ax.annotate("maximum: 10 × 10",(10,100),xytext=(3,112),fontsize=18,color=PINE)
    elif id in {"MATH_ALG_004","MATH_SYS_001"}:
        axes(ax,(-1,7),(-1,13),"Two lines: one shared point" if id=="MATH_SYS_001" else "Parallel lines have no common point")
        x=np.linspace(-1,7,100);ax.plot(x,x+4,color=PINE,lw=3,label="y = x + 4");ax.plot(x,(-x+10) if id=="MATH_SYS_001" else x+7,color=CORAL,lw=3,label="y = −x + 10" if id=="MATH_SYS_001" else "y = x + 7")
        if id=="MATH_SYS_001":ax.scatter(3,7,color=BLUE,s=80);ax.annotate("(3, 7)",(3,7),xytext=(4,8),fontsize=21,color=PINE)
        else:ax.text(-.5,0,"Identical lines share every point.",fontsize=17,color=PINE)
        ax.legend(fontsize=17)
    elif id=="CUSTOM_ESTIMATION_SANITY":
        canvas(ax,"Estimate to check the scale")
        for x,w,h,label in [(1,3.5,2.5,"47 × 19 = 893"),(5.2,3.7,2.7,"50 × 20 = 1000")]:
            ax.add_patch(Rectangle((x,2),w,h,facecolor=MINT,edgecolor=PINE,lw=2));text(ax,x+w/2,1.2,label,21)
        text(ax,5,5.5,"The rounded rectangle is slightly larger.",20)
    else:raise ValueError(id)
