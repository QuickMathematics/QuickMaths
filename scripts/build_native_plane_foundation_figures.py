"""Deterministic, geometrically faithful instructional SVGs for plane foundations."""
from pathlib import Path
from math import sin, cos, radians, atan2, degrees
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'content/math/algebra_foundations/skills/media/native-plane-foundations'
OUT.mkdir(parents=True,exist_ok=True)
G='#163f36'; A='#b44d32'; F='#d9eee5'
def line(x1,y1,x2,y2,color=G,dash=False):
 return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="3"'+(' stroke-dasharray="7 5"' if dash else '')+'/>'
def text(x,y,s,size=20,anchor='start'):
 return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}">{s}</text>'
def poly(points,fill=F):
 return '<polygon points="'+' '.join(f'{x},{y}' for x,y in points)+f'" fill="{fill}" stroke="{G}" stroke-width="3"/>'
def rect(x,y,w,h):return poly([(x,y),(x+w,y),(x+w,y+h),(x,y+h)])
def arc(x,y,r,start,end):
 pts=[(x+r*cos(radians(start+(end-start)*i/40)),y-r*sin(radians(start+(end-start)*i/40))) for i in range(41)]
 return '<polyline points="'+' '.join(f'{a:.2f},{b:.2f}' for a,b in pts)+f'" stroke="{A}" stroke-width="3" fill="none"/>'
def save(name,title,body):
 (OUT/(name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360"><rect width="720" height="360" rx="16" fill="#fffdf7"/><g font-family="sans-serif" fill="'+G+'">'+text(28,34,title,23)+body+'</g></svg>',encoding='utf-8')
def parallel():
 return line(80,100,645,100)+line(80,260,645,260)+line(150,320,570,40)+text(58,106,'p')+text(58,266,'q')+text(582,58,'t')+text(80,335,'Given: p ∥ q',18)+text(133,106,'››',24)+text(133,266,'››',24)
a=degrees(atan2(2,3))
save('geom005-transversal','Corresponding angles occupy matching positions',parallel()+arc(480,100,36,0,a)+arc(240,260,36,0,a)+text(528,89,'a')+text(288,249,'a')+text(355,335,'Equal because p ∥ q',18))
save('geom005-angle-families','Same-side interior angles are supplementary',parallel()+arc(480,100,38,180,180+a)+arc(240,260,38,a,180)+text(408,125,'α')+text(219,207,'β')+text(375,335,'α + β = 180°',19))
# A separate assessment diagram shows only the stated angle and the unknown.
from math import tan
qx=400-160/tan(radians(72))
body=line(80,95,650,95)+line(80,255,650,255)+line(qx-15,301,415,49)+text(58,102,'p')+text(58,262,'q')+text(100,101,'››',24)+text(100,261,'››',24)
body+=arc(400,95,35,180,252)+arc(qx,255,35,72,180)+text(339,130,'72°')+text(qx-36,210,'x')+text(80,335,'p ∥ q; a transversal crosses both lines. Not to scale.',18)
save('geom005-capstone','Use the stated parallel-line hypothesis',body)
pts=[(90,245),(150,100),(330,70),(550,120),(600,250),(370,295)]
b=poly(pts)
for i in [2,3,4]:b+=line(*pts[0],*pts[i],color=A,dash=True)
b+=text(67,256,'A')+text(326,61,'C')+text(607,256,'E')+text(110,333,'Six sides → four triangles → 4 × 180°',20)
save('geom006-polygons','A convex hexagon splits into four triangles',b)
b=poly([(65,240),(115,105),(255,105),(305,240)])+poly([(420,110),(620,135),(655,235),(395,255)])
b+=text(185,83,'Isosceles trapezoid',19,'middle')+text(520,84,'General quadrilateral',19,'middle')
b+=text(172,111,'›',24)+text(172,246,'›',24)+line(81,168,99,177,A)+line(272,177,290,168,A)
b+=text(40,299,'One parallel pair; equal legs are marked.',17)+text(400,299,'No special properties given.',17)+text(40,333,'Trapezoid here means at least one pair of parallel sides.',19)
save('geom006-quadrilateral','Classify by properties, not by orientation',b)
b=poly([(90,120),(210,60),(610,60),(610,265),(90,265)])+poly([(90,60),(210,60),(90,120)],'#fffdf7')
b+=line(90,55,210,55,A)+line(85,60,85,120,A)+text(132,51,'b',18)+text(60,96,'h',18)
b+=line(90,285,610,285)+text(350,307,'W',20,'middle')+line(635,60,635,265)+text(650,169,'H',20)
b+=text(120,339,'Remaining area = WH − bh/2',21)
save('geom007-composite','Subtract a triangular corner from a rectangle',b)
b=poly([(100,265),(220,105),(490,105),(610,265)])+line(220,105,220,265,A,True)
b+=line(220,244,241,244,A)+line(241,244,241,265,A)+text(350,94,'a',23)+text(350,294,'b',23)+text(191,190,'h',23)+text(340,111,'›',24)+text(356,271,'›',24)
b+=text(100,335,'Parallel bases a, b; h is the perpendicular distance.',19)
save('geom007-trapezoid','Use the perpendicular height',b)
# Coordinate distance: A(-2,1), B(4,9); equal unit scale on both axes.
def xy(x,y):return 285+24*x,300-24*y
b=''
for x in range(-4,9):b+=line(*xy(x,0),*xy(x,9),color='#d8e3da')
for y in range(10):b+=line(*xy(-4,y),*xy(8,y),color='#d8e3da')
b+=line(*xy(-4,0),*xy(8,0))+line(*xy(0,0),*xy(0,10))+line(*xy(-2,1),*xy(4,9))
b+=line(*xy(-2,1),*xy(4,1),A,True)+line(*xy(4,1),*xy(4,9),A,True)
b+=text(185,273,'A(−2,1)',18)+text(390,75,'B(4,9)',18)+text(305,298,'run: 6',17)+text(392,180,'rise: 8',17)+text(282,322,'0',16)+text(489,318,'x')+text(263,60,'y')
b+=text(65,346,'Horizontal and vertical differences form perpendicular legs.',18)
save('geom008-coordinate','Coordinate distance uses a right triangle',b)
b=poly([(135,280),(135,80),(560,280)])+line(135,253,162,253,A)+line(162,253,162,280,A)
b+=text(74,188,'leg a')+text(330,304,'leg b')+text(325,155,'hypotenuse c')+text(277,335,'a² + b² = c²',23)
save('geom008-right-triangle','The right angle is a required hypothesis',b)
pts=[(75,270),(150,100),(270,270)];shift=350
b=poly(pts)+poly([(x+shift,y) for x,y in pts])+line(290,182,400,182,A)+poly([(400,182),(386,174),(386,190)],A)
for (x,y),label in zip(pts,['A','B','C']):b+=text(x-13,y+(25 if y>200 else -12),label)+text(x+shift-13,y+(25 if y>200 else -12),label+'′')
b+=text(288,159,'translation',18)+text(100,340,'Every vertex moves by the same vector.',20)
save('geom009-transform','Match corresponding vertices',b)
pts=[(100,275),(220,90),(305,235)];b=poly(pts)+poly([(720-x,y) for x,y in pts])+line(360,65,360,305,A,True)
for x,y in pts:b+=line(x,y,720-x,y,'#a5bdb1',True)
b+=text(368,75,'mirror line',18)+text(87,337,'Each point and its image are equally far from the mirror line.',18)
save('geom009-symmetry','Reflection reverses orientation',b)
b=rect(75,185,120,80)+rect(350,105,240,160)
for ox,oy,cols,rows in [(75,185,3,2),(350,105,6,4)]:
 for i in range(1,cols):b+=line(ox+i*40,oy,ox+i*40,oy+rows*40,'#8cb2a2')
 for i in range(1,rows):b+=line(ox,oy+i*40,ox+cols*40,oy+i*40,'#8cb2a2')
b+=text(135,294,'3 × 2 = 6',20,'middle')+text(470,294,'6 × 4 = 24',20,'middle')+text(111,338,'Lengths ×2; perimeter ×2; area ×4.',22)
save('geom010-scale','Count equal area units after enlargement',b)
small=[(90,275),(165,145),(240,275)];large=[(365,275),(477.5,80),(590,275)]
b=poly(small)+poly(large)
for points,labels in [(small,['A','B','C']),(large,['D','E','F'])]:
 for (x,y),label in zip(points,labels):b+=text(x-10,y+(25 if y==275 else -12),label)
b+=text(325,175,'×1.5',21)+text(65,336,'A ↔ D, B ↔ E, C ↔ F; corresponding side ratios all equal.',19)
save('geom010-similar','Similar triangles: preserve shape and correspondence',b)
# Four congruent right triangles leave a central square: an actual area justification.
x0,y0,u=75,63,34
def pt(x,y):return (x0+u*x,y0+u*y)
inner=[pt(3,0),pt(7,3),pt(4,7),pt(0,4)]
b=rect(x0,y0,7*u,7*u)+poly(inner,'#f7ddaa')
b+=text(190,185,'c²',25,'middle')+text(117,56,'a',20)+text(247,56,'b',20)+text(320,120,'a',20)+text(320,240,'b',20)
b+=text(373,112,'Outer area: (a + b)²',23)+text(373,155,'Four triangles: 4 × ab/2',21)+text(373,202,'Remaining square: c²',22)+text(373,252,'a² + 2ab + b² = 2ab + c²',19)
b+=text(28,337,'Each inner angle is 90° because the two acute triangle angles sum to 90°.',14)
save('geom008-dissection','Why the square areas satisfy a² + b² = c²',b)
print(f'Wrote {len(list(OUT.glob("*.svg")))} plane figures')
