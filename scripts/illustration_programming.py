"""Programming figures explain state, control flow and relationships."""
import numpy as np
from scripts.illustration_drawing import *

FLOWS={
1:("An algorithm transforms input",["Input\n[3, 1, 4]","Add values\n3 + 1 + 4","Output\n8"],"Each instruction changes the current program state."),
3:("Input text and numeric values differ",['input\n"12"',"int(...)\n12","add 3\n15","print\n15"],"Conversion happens before arithmetic."),
8:("Arguments enter; a value returns",["add(2, 3)","a = 2\nb = 3","return a + b\n5"],"Local parameter names belong to this function call."),
11:("Transform one collection in stages",["[−2, 0, 3]","keep n > 0\n[3]","square n\n[9]"],"Filtering chooses elements; mapping changes each chosen value."),
14:("Decompose around clear responsibilities",["Parse\ntext → data","Validate\ncheck rules","Compute\npure result","Format\nresult → text"],"Small contracts make each part testable."),
15:("A tested data-summary pipeline",["Read\nrecords","Validate\nnumbers","Summarize\ncount / mean","Report\nresult"],"Test empty input, ordinary input and invalid records."),
18:("A context manager closes the file",["Enter with\nopen file","Read or write","Exit with\nclose file"],"Cleanup runs even when the body raises an exception."),
20:("Import a reusable module",["module.py\nfunctions","import module","caller\nmodule.func()"],"Import names identify definitions; they do not copy source text."),
21:("A comprehension filters, then maps",["range(6)\n0…5","if x % 2\n1, 3, 5","x * x\n1, 9, 25"],"[x*x for x in range(6) if x % 2] builds the final list."),
24:("Separate interface, domain and storage",["CLI\nparse arguments","Domain\nrules / results","Storage\nread / write"],"Keep calculations testable without opening files."),
25:("A persistent tracker keeps two states",["Load file","Edit in memory","Validate","Save file"],"Unsaved memory and the last saved file are distinct."),
26:("Validate a dataclass at its boundary",["Constructor\nReading(120, 45)","__post_init__\ncheck invariant","Valid record\n75 pages left"],"Require 0 ≤ pages_read ≤ pages. Type hints do not enforce this.")
}

def draw(ax,id):
    n=int(id[-3:])
    if n in FLOWS:flow(ax,*FLOWS[n]);return
    if n==2:
        canvas(ax,"Variables refer to typed values");box(ax,1,4.2,2,1,"count");box(ax,1,2.2,2,1,"label")
        box(ax,6,4.1,3,1.2,"7  ·  int");box(ax,6,2.1,3,1.2,'"7"  ·  str');arrow(ax,(3.1,4.7),(5.9,4.7));arrow(ax,(3.1,2.7),(5.9,2.7))
        text(ax,5,.9,"The same printed characters can represent different types.",18)
    elif n==4:
        canvas(ax,"Boolean operators combine truth values")
        labels=[["A","B","A and B","A or B"],["False","False","False","False"],["False","True","False","True"],["True","False","False","True"],["True","True","True","True"]]
        for j,row in enumerate(labels):
            for i,value in enumerate(row):box(ax,.5+i*2.3,5.1-j*.95,2.1,.75,value,fill=MINT if value=="True" else PAPER,size=18)
    elif n in {5,6,19}:
        canvas(ax,{5:"Choose one branch",6:"A loop returns to its condition",19:"Exception paths still run finally"}[n])
        box(ax,3.5,4.6,3,1.1,{5:"score ≥ 60?",6:"n < 4?",19:"try: operation"}[n])
        box(ax,.7,2.3,3,1.2,{5:"pass",6:"n += 1",19:"except: handle"}[n]);box(ax,6.3,2.3,3,1.2,{5:"fail",6:"continue after loop",19:"else: success"}[n],size=17)
        arrow(ax,(4,4.5),(2.2,3.6),"yes" if n!=19 else "error");arrow(ax,(6,4.5),(7.8,3.6),"no" if n!=19 else "no error")
        if n==6:
            ax.plot([.6,.6,3.2],[3,6,6],color=CORAL,lw=2);arrow(ax,(3.2,6),(4,5.8));text(ax,5,.9,"Start n = 0 → exit with n = 4",21)
        elif n==19:
            box(ax,3.5,.5,3,1,"finally: cleanup");arrow(ax,(2.2,2.2),(4,1.6));arrow(ax,(7.8,2.2),(6,1.6))
    elif n==7:
        canvas(ax,"Accumulate after each loop iteration")
        for i,(value,total) in enumerate([(1,1),(2,3),(3,6),(4,10)]):
            box(ax,.5+i*2.35,3.3,2,1.3,f"n = {value}\ntotal = {total}",size=20)
            if i<3:arrow(ax,(2.55+i*2.35,3.9),(2.8+i*2.35,3.9))
        text(ax,5,1.6,"total starts at 0; each step adds the current n.",21)
    elif n==9:
        canvas(ax,"Indices address characters; slices use boundaries")
        for i,letter in enumerate("CODE"):
            box(ax,1+i*2,3,1.7,1.4,letter,size=30);text(ax,1.85+i*2,5,str(i),23);text(ax,1.85+i*2,2,str(i-4),23)
        text(ax,5,.9,'text[1:3] → "OD"  (stop index 3 is excluded)',20)
    elif n==10:
        canvas(ax,"An alias shares the same list")
        box(ax,.7,4.4,2,1,"items");box(ax,.7,2.9,2,1,"alias");box(ax,5.7,3.6,3.4,1.4,"[1, 2, 3]");arrow(ax,(2.8,4.9),(5.6,4.5));arrow(ax,(2.8,3.4),(5.6,4))
        box(ax,.7,.7,2,1,"copy");box(ax,5.7,.5,3.4,1.4,"[1, 2]");arrow(ax,(2.8,1.2),(5.6,1.2))
        text(ax,7.4,2.55,"alias.append(3)",18)
    elif n==12:
        canvas(ax,"A dictionary maps keys to values")
        for y,key,value in [(4.5,'"red"',"3"),(2.7,'"blue"',"1")]:
            box(ax,1,y,3,1,key);box(ax,6,y,2,1,value);arrow(ax,(4.1,y+.5),(5.9,y+.5))
        text(ax,5,1,'counts["red"] accesses 3 directly.',23)
    elif n==13:
        canvas(ax,"Test boundaries as well as ordinary cases")
        for i,(label,value) in enumerate([("Empty","[] → 0"),("Ordinary","[2, 3] → 5"),("Invalid",'["x"] → reject')]):
            box(ax,.5+i*3.2,3,2.7,2,f"{label}\n\n{value}",size=19)
        text(ax,5,1.2,"A failing case is evidence: reproduce → isolate → fix.",19)
    elif n==16:
        canvas(ax,"Tuples preserve positions; sets keep unique members")
        box(ax,.6,3,4,1.7,"tuple: (2, 2, 5)\npositions 0, 1, 2",size=20);box(ax,5.4,3,4,1.7,"set: {2, 5}\nunique members",size=20)
        text(ax,5,1.3,"Tuple items cannot be reassigned. Sets have no positional indexing.",18)
    elif n==17:tree(ax,"Nested records form a data structure",("user","name","scores","72","91"),'user["scores"][1] follows the right branch to 91.')
    elif n==22:
        canvas(ax,"Each instance owns its state")
        box(ax,3.2,4.8,3.6,1,"Counter class");box(ax,.6,2.2,3.8,1.6,"first\ncount: 0 → 1");box(ax,5.6,2.2,3.8,1.6,"second\ncount: 0")
        arrow(ax,(4,4.7),(2.5,3.9));arrow(ax,(6,4.7),(7.5,3.9));text(ax,5,.9,"first.increment() does not change second.count.",20)
    elif n==23:
        axes(ax,(1,32),(0,1100),"Growth in work as input increases","Input size n","Illustrative operations")
        x=np.arange(1,33)
        for y,label,col in [(np.log2(x),"log₂ n",BLUE),(x,"n",PINE),(x*x,"n²",CORAL)]:ax.plot(x,y,label=label,color=col,lw=3)
        ax.legend(fontsize=19);ax.text(2,800,"Compare growth rates,\nnot hardware timings.",fontsize=19,color=PINE)
    elif n==27:
        flow(ax,"A generator pauses after each yield",["next()\nstart/resume","yield value\nsuspend","next()\nresume"],"After exhaustion, next() raises StopIteration.")
        text(ax,5,.55,"Only requested values flow through a lazy pipeline.",18)
    elif n==28:
        tree(ax,"Recursive traversal visits one subtree at a time")
    else:raise ValueError(id)
