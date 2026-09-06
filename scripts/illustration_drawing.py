"""Shared, deterministic Matplotlib drawing vocabulary for lesson figures."""
from __future__ import annotations
import textwrap
import numpy as np
from matplotlib.patches import Rectangle, FancyBboxPatch, Polygon

PINE, MINT, CORAL, MUTED, PAPER, BLUE = "#153f36", "#d8ebe3", "#bc503b", "#728c80", "#fffdf8", "#376c98"

def text(ax, x, y, value, size=21, color=PINE, **kw):
    if x == 5 and kw.get("ha", "center") == "center":
        value = "\n".join(textwrap.fill(line, max(36, int(1000/size)), break_long_words=False, break_on_hyphens=False) for line in value.split("\n"))
    ax.text(x,y,value,fontsize=size,color=color,ha=kw.pop("ha","center"),va=kw.pop("va","center"),**kw)

def canvas(ax, title=None):
    ax.set_xlim(0,10); ax.set_ylim(0,7); ax.axis("off")
    if title: text(ax,5,6.6,title,24)

def box(ax,x,y,w,h,label,fill=MINT,size=20):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle="round,pad=0.06,rounding_size=.12",facecolor=fill,edgecolor=PINE,lw=1.8))
    label = "\n".join(textwrap.fill(line, max(7, int(w*5.7*20/size)), break_long_words=False, break_on_hyphens=False) for line in label.split("\n"))
    text(ax,x+w/2,y+h/2,label,size)

def arrow(ax,start,end,label=None,color=CORAL):
    ax.annotate("",end,start,zorder=.5,arrowprops={"arrowstyle":"->","color":color,"linewidth":2.5,"shrinkA":4,"shrinkB":4})
    if label: text(ax,(start[0]+end[0])/2,(start[1]+end[1])/2+.25,label,17,color)

def flow(ax,title,labels,footer="",branches=None):
    canvas(ax,title)
    count=len(labels); width=min(2.55,8.6/count-.4); gap=(8.8-count*width)/max(1,count-1)
    for i,label in enumerate(labels):
        x=.6+i*(width+gap)
        box(ax,x,3,width,1.8,label,size=17 if count>3 else 18)
        if i: arrow(ax,(x-gap+.06,3.8),(x-.06,3.8))
    text(ax,5,1.55,footer,20)

def axes(ax,xlim,ylim,title="",xlabel="x",ylabel="y"):
    ax.set_axis_on();ax.set_xlim(*xlim);ax.set_ylim(*ylim)
    ax.grid(color="#dce5dd",lw=.7);ax.tick_params(colors=MUTED,labelsize=15)
    for sp in ax.spines.values():sp.set_visible(False)
    if ylim[0]<=0<=ylim[1]:ax.axhline(0,color=MUTED,lw=1.5)
    if xlim[0]<=0<=xlim[1]:ax.axvline(0,color=MUTED,lw=1.5)
    ax.set_xlabel(xlabel,fontsize=19,color=PINE);ax.set_ylabel(ylabel,fontsize=19,color=PINE)
    ax.set_title(title,fontsize=22,color=PINE,pad=15)

def numberline(ax,low=-5,high=8,segments=(),points=(),title="",ticks=None):
    canvas(ax,title)
    px=lambda x:1+(x-low)/(high-low)*8
    ax.plot([.7,9.3],[3,3],color=MUTED,lw=2)
    for x in ticks if ticks is not None else range(low,high+1):
        ax.plot([px(x),px(x)],[2.9,3.1],color=MUTED);text(ax,px(x),2.5,str(x),17)
    for a,b in segments:ax.plot([px(a),px(b)],[3,3],color=CORAL,lw=6,solid_capstyle="round")
    for x,closed in points:ax.scatter(px(x),3,s=170,facecolor=CORAL if closed else PAPER,edgecolor=CORAL,lw=2,zorder=5)

def area(ax,xparts=(3,2),yparts=(3,2),labels=None,title=""):
    canvas(ax,title); totalx=sum(xparts);totaly=sum(yparts)
    width,height=6,4;left,bottom=2,1.5
    x=left
    for i,a in enumerate(xparts):
        y=bottom
        for j,b in enumerate(yparts):
            w,h=width*a/totalx,height*b/totaly
            ax.add_patch(Rectangle((x,y),w,h,facecolor=[MINT,"#eedcb9","#bfd8e6","#eac8be"][(i+2*j)%4],edgecolor=PINE,lw=2))
            label=labels[j][i] if labels else str(a*b)
            text(ax,x+w/2,y+h/2,label,23)
            y+=h
        x+=width*a/totalx

def signchart(ax,rational=False):
    canvas(ax,"Signs change at zeros and exclusions")
    xs=[2,5];edges=[.6,3.2,6.6,9.4]
    for i,sign in enumerate(["+","−","+"]):
        text(ax,(edges[i]+edges[i+1])/2,4.5,sign,36,CORAL)
    ax.plot([.6,9.4],[3.2,3.2],color=PINE,lw=2)
    for x,pos in zip(xs,edges[1:3]):
        ax.plot([pos,pos],[2.8,5.1],color=MUTED,ls="--");text(ax,pos,2.3,str(x),24)
    text(ax,5,1.2,"(x − 2)/(x − 5): 5 is excluded" if rational else "(x − 2)(x − 5): both marked points are zeros",20)
    if rational:ax.scatter(edges[2],3.2,s=160,facecolor=PAPER,edgecolor=CORAL,lw=2,zorder=5)

def tree(ax,title,labels=("root","A","B","C","D"),footer="Preorder: root → A → B → C → D"):
    canvas(ax,title)
    positions=[(5,5.4),(2.5,3.5),(7.2,3.5),(6,1.8),(8.5,1.8)]
    for a,b in [(0,1),(0,2),(2,3),(2,4)]:arrow(ax,positions[a],positions[b],color=MUTED)
    for (x,y),label in zip(positions,labels):box(ax,x-.6,y-.4,1.2,.8,label,size=19)
    text(ax,5,.6,footer,18)
