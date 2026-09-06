"""Conceptual geography figures; no diagrams claim to be navigational maps."""
import numpy as np
from matplotlib.patches import Rectangle, Polygon, Ellipse
from scripts.illustration_drawing import *

def draw(ax,id):
    canvas(ax)
    if id=="GEO_FOUND_001":
        canvas(ax,"A question changes with geographic scale")
        for x,y,w,h,label in [(1,1,8,4.8,"Region"),(2,1.5,5.8,3.6,"City"),(3.2,2,3.5,2.4,"Neighborhood")]:
            ax.add_patch(Rectangle((x,y),w,h,facecolor=PAPER,edgecolor=PINE,lw=2));text(ax,x+w-.2,y+h-.3,label,20,ha="right")
        ax.scatter(4.5,2.7,s=90,color=CORAL);text(ax,5.8,.45,"Site → neighborhood → city → region",20)
    elif id=="GEO_CART_001":
        canvas(ax,"Mercator stretches high latitudes")
        for j,(label,transform) in enumerate([("Equal latitude steps",lambda lat:lat/80),("Mercator spacing",lambda lat:np.log(np.tan(np.pi/4+np.deg2rad(lat)/2))/2.5)]):
            left=.6+j*5
            for lat in [-75,-60,-30,0,30,60,75]:
                y=3.5+transform(lat)*2.2;ax.plot([left,left+3.7],[y,y],color=MUTED);text(ax,left-.05,y,str(lat)+"°",12,ha="right")
            for lon in np.linspace(left,left+3.7,5):ax.plot([lon,lon],[1.3,5.7],color=MUTED,lw=.8)
            text(ax,left+1.8,.7,label,18)
    elif id=="GEO_CART_002":
        canvas(ax,"Latitude and longitude locate a point")
        ax.add_patch(Ellipse((5,3.5),5.5,5.5,fill=False,edgecolor=PINE,lw=2))
        for height in [-1.5,0,1.5]:ax.add_patch(Ellipse((5,3.5+height),4.5 if height else 5.5,.65,fill=False,edgecolor=CORAL if height==1.5 else MUTED,lw=2))
        for width in [1.3,3.5]:ax.add_patch(Ellipse((5,3.5),width,5.5,fill=False,edgecolor=BLUE,lw=1.6))
        text(ax,1.45,5,"parallel",18);text(ax,8.6,3.5,"meridian",18);text(ax,5,.4,"Latitude: north/south · Longitude: east/west",18)
    elif id=="GEO_GIS_001":
        canvas(ax,"GIS aligns different layers to one location")
        for offset,label,col in [(2,"Roads",CORAL),(1,"Rivers",BLUE),(0,"Land use",PINE)]:
            y=1.2+offset*1.4;ax.add_patch(Polygon([[1,y],[6.8,y],[9,y+1],[3.2,y+1]],facecolor=MINT if not offset else PAPER,edgecolor=col,lw=2))
            ax.plot([2.7,4.2,5.5,7.2],[y+.2,y+.7,y+.4,y+.8],color=col,lw=3);text(ax,1,y+.6,label,18,ha="right")
    elif id=="GEO_PHYS_001":
        canvas(ax,"At a convergent margin, one plate subducts")
        ax.add_patch(Polygon([[.6,3],[5,3],[8,1.2],[8,.6],[4.7,2.5],[.6,2.5]],facecolor="#bfd8e6",edgecolor=PINE))
        ax.add_patch(Polygon([[4.7,3.1],[6,3.3],[6.8,4.5],[7.4,3.4],[9.4,3.4],[9.4,2.8],[5.1,2.8]],facecolor="#ded8bb",edgecolor=PINE))
        arrow(ax,(1,4.2),(3.5,4.2),"oceanic plate");arrow(ax,(9,4.8),(7.5,4.8))
        arrow(ax,(5.4,2.5),(7.4,1.3));text(ax,5,5.8,"Compression · trench · volcanic arc",21);text(ax,4.5,.45,"Idealized cross-section; not every margin has the same geometry.",16)
    elif id=="GEO_PHYS_002":
        canvas(ax,"Idealized Northern Hemisphere circulation")
        for i,(a,b,name,direction) in enumerate([(0,30,"Hadley",-1),(30,60,"Ferrel",1),(60,90,"Polar",-1)]):
            x=.8+i*3.1;ax.add_patch(Ellipse((x+1.2,3.8),2.4,2.6,fill=False,edgecolor=PINE,lw=2))
            if direction==1: arrow(ax,(x+.3,2.7),(x+2.1,2.7))
            else: arrow(ax,(x+2.1,2.7),(x+.3,2.7))
            text(ax,x+1.2,3.8,name,22);text(ax,x,1.7,f"{a}°",20)
        text(ax,9.8,1.7,"90°",20);text(ax,5,.7,"Surface pressure belts: low · high · low · high",19)
    elif id=="GEO_PHYS_003":
        canvas(ax,"A watershed drains toward a shared outlet")
        boundary=np.array([[1,5],[3,6],[6,5.8],[8.8,5],[8,2.5],[5,1],[2,2.8]])
        ax.add_patch(Polygon(boundary,facecolor=MINT,edgecolor=PINE,lw=2,linestyle="--"))
        for pts in [[(2,4.5),(4,3.5),(5,1)],[(7.8,4.7),(6,3.5),(5,1)],[(5,5.4),(4,3.5)]]:
            ax.plot(*zip(*pts),color=BLUE,lw=3);arrow(ax,pts[-2],pts[-1],color=BLUE)
        text(ax,5,.4,"Outlet · dashed ridge = drainage divide",20)
    elif id=="GEO_PHYS_004":
        canvas(ax,"Climate constrains broad biome patterns")
        for x,y,label in [(1,1.5,"Cold\nTundra"),(4,1.5,"Temperate\nGrassland"),(7,1.5,"Hot / dry\nDesert"),(4,3.8,"Temperate\nForest"),(7,3.8,"Hot / wet\nRainforest")]:box(ax,x,y,2.4,1.5,label,size=18)
        arrow(ax,(.6,.8),(9.5,.8),"Warmer →");arrow(ax,(.5,1.5),(.5,5.5));text(ax,1.1,6.2,"Wetter ↑",19)
    elif id=="GEO_HUMAN_001":
        canvas(ax,"Age structure changes a population pyramid")
        for i,(title,widths) in enumerate([("Youthful",[1.1,.9,.65,.35]),("Stable",[.85,.85,.8,.55]),("Older",[.55,.7,.95,.65])]):
            cx=1.7+3.3*i
            for j,w in enumerate(widths):
                ax.barh(2+j*.7,-w,left=cx,color=BLUE,height=.57);ax.barh(2+j*.7,w,left=cx,color=CORAL,height=.57)
            text(ax,cx,5.5,title,21);text(ax,cx,1.1,"young → old ↑",15)
        text(ax,5,.35,"Illustrative shapes, not measured population data.",17)
    elif id=="GEO_HUMAN_002":
        flow(ax,"Migration connects origins and destinations",["Origin\npush factors","Route\ncosts / barriers","Destination\npull factors"],"Networks, policy and resources shape who can move.")
    elif id=="GEO_URBAN_001":
        canvas(ax,"Urban accessibility changes across space")
        for r,col in [(2.4,"#eceddb"),(1.65,MINT),(.7,"#bfd8e6")]:ax.add_patch(Ellipse((4,3.5),r*2,r*2,facecolor=col,edgecolor=PINE,lw=1.5))
        for a in np.linspace(0,2*np.pi,7)[:-1]:ax.plot([4,4+2.6*np.cos(a)],[3.5,3.5+2.6*np.sin(a)],color=CORAL,lw=1.8)
        text(ax,4,3.5,"CBD",20);text(ax,8,4.5,"Transport\ncorridors",20);text(ax,8,2.5,"Land use\nand access",20);text(ax,5,.5,"A conceptual model; actual cities are less regular.",17)
    elif id=="GEO_ECON_001":flow(ax,"Production networks connect distant places",["Raw\nmaterials","Components","Assembly","Markets"],"Value, jobs, transport costs and environmental impacts differ by stage.")
    elif id=="GEO_POL_001":
        canvas(ax,"State borders and cultural regions can differ")
        ax.add_patch(Rectangle((1,1.5),4,4,facecolor=MINT,edgecolor=PINE,lw=2));ax.add_patch(Rectangle((5,1.5),4,4,facecolor="#bfd8e6",edgecolor=PINE,lw=2))
        ax.add_patch(Ellipse((5,3.5),5.5,2.6,fill=False,edgecolor=CORAL,lw=3,linestyle="--"))
        text(ax,2.5,5,"State A");text(ax,7.5,5,"State B");text(ax,5,3.5,"Cultural region",22);text(ax,5,.6,"Schematic boundaries, not a real territorial claim.",18)
    elif id=="GEO_RISK_001":flow(ax,"A hazard becomes risk through context",["Hazard\nflood","Exposure\npeople / assets","Vulnerability\nsusceptibility"],"Preparedness, protection and recovery capacity can reduce losses.")
    elif id=="GEO_SYNTH_001":
        canvas(ax,"Connect physical and human evidence")
        for x,y,w,h,label in [(1,4,3,1.5,"Terrain\nand water"),(6,4,3,1.5,"Settlement\nand economy"),(1,1.5,3,1.5,"Infrastructure\nand access"),(6,1.5,3,1.5,"Hazards\nand resilience")]:box(ax,x,y,w,h,label)
        arrow(ax,(4.1,4.75),(5.9,4.75));arrow(ax,(4.1,2.25),(5.9,2.25));arrow(ax,(2.5,3.9),(2.5,3.1));arrow(ax,(7.5,3.9),(7.5,3.1))
    else:raise ValueError(id)
