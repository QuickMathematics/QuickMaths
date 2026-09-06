// These sketches read displayed prompts only. No solution keys, generator
// values, eval, Function constructor or imported scripts are used.
const N = "-?\\d+(?:\\.\\d+)?";
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const numeric = n => Number(n.toFixed(3));
const text = (x,y,label,size=25) => '<text x="'+x+'" y="'+y+'" text-anchor="middle" style="font-size:'+size+'px">'+esc(label)+'</text>';
const line = (x1,y1,x2,y2,cls="diagram-line") => '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" class="'+cls+'"/>';
const triangle = extra => ({kind:"triangle",opposite:"?",adjacent:"?",hypotenuse:"?",angle:"θ",caption:"Use the labeled givens. This schematic is not to scale.",...extra});

// Tiny arithmetic grammar for drawing the *given* trigonometric equations.
// Implicit multiplication is accepted; identifiers and complexity are bounded.
export function diagramExpression(source) {
  if (typeof source!=="string" || source.length>160) return null;
  const compact=source.replace(/\s/g,"");
  const raw=compact.match(/\d+(?:\.\d+)?|sin|cos|tan|sqrt|pi|[xt()+*/^.-]/g)??[];
  if(raw.join("")!==compact||raw.length>100)return null;
  const tokens=[];
  const end=t=>/^(?:\d|pi$|[xt]$|\)$)/.test(t);
  const start=t=>/^(?:\d|pi$|[xt]$|\($|sin$|cos$|tan$|sqrt$)/.test(t);
  for (const t of raw) { if(tokens.length&&end(tokens.at(-1))&&start(t))tokens.push("*");tokens.push(t); }
  let i=0,depth=0;
  const node=(op,a,b)=>[op,a,b];
  function atom(){
    if(++depth>24)throw Error("depth");
    const t=tokens[i++];let v;
    if(/^\d/.test(t??"")){v=Number(t);if(!Number.isFinite(v)||v>1e5)throw Error("number");}
    else if(t==="pi")v=Math.PI;
    else if(t==="x"||t==="t")v="x";
    else if(t==="("){v=add();if(tokens[i++]!==")")throw Error("parenthesis");}
    else if(["sin","cos","tan","sqrt"].includes(t)){if(tokens[i++]!=="(")throw Error("function");v=node(t,add());if(tokens[i++]!==")")throw Error("function");}
    else throw Error("token");
    depth--;return v;
  }
  function unary(){if(tokens[i]==="+"||tokens[i]==="-"){const sign=tokens[i++];return node(sign==="-"?"neg":"pos",unary());}return power();}
  function power(){let v=atom();if(tokens[i]==="^"){i++;v=node("^",v,unary());}return v;}
  function mul(){let v=unary();while(tokens[i]==="*"||tokens[i]==="/"){const op=tokens[i++];v=node(op,v,unary());}return v;}
  function add(){let v=mul();while(tokens[i]==="+"||tokens[i]==="-"){const op=tokens[i++];v=node(op,v,mul());}return v;}
  try{const value=add();return i===tokens.length?value:null;}catch{return null;}
}
export function diagramValue(tree,x){
  if(typeof tree==="number")return tree;if(tree==="x")return x;if(!Array.isArray(tree))return NaN;
  const [op,left,right]=tree,a=diagramValue(left,x),b=right===undefined?0:diagramValue(right,x);
  switch(op){case "+":return a+b;case "-":return a-b;case "*":return a*b;case "/":return a/b;case "^":return a**b;case "neg":return-a;case "pos":return a;case "sin":return Math.sin(a);case "cos":return Math.cos(a);case "tan":return Math.tan(a);case "sqrt":return Math.sqrt(a);default:return NaN;}
}
const wave=(expressions,extra={})=>{
  const trees=expressions.map(diagramExpression);
  return trees.some(t=>t===null)?null:{kind:"wave",trees,expressions,xmin:0,xmax:2*Math.PI,caption:"Graphs of the given relationships. Read the axes; no solution points are marked.",...extra};
};

export function extendedQuestionDiagram(problem,skillId=problem?.skill_id){
  if(problem?.media?.length)return null;
  const family={MATH_TRIG_001:/^TRIG_RIGHT_/,MATH_TRIG_002:/^TRIG_(RAD|UNIT)_/,MATH_TRIG_003:/^TRIG_GRAPH_/,MATH_TRIG_004:/^TRIG_ID_/,MATH_TRIG_005:/^TRIG_EQ_/,MATH_TRIG_006:/^TRIG_TRI_/,MATH_GEOM_004:/^TRIANGLE_/}[skillId];
  const id=String(problem?.source_template_id??problem?.template_id??problem?.questionId??"").split("__")[0];
  const p=String(problem?.prompt??"").replace(/−/g,"-");
  if(!family?.test(id)||!p||p.length>2000||/[<>{}]/.test(p))return null;
  const find=pattern=>p.match(new RegExp(pattern));
  let m,spec=null;
  if(skillId==="MATH_TRIG_001"){
    const opposite=find("opposite side ("+N+")"),adjacent=find("adjacent side ("+N+")"),hyp=find("hypotenuse (?:is )?("+N+")");
    if(opposite||adjacent||hyp)spec=triangle({opposite:opposite?.[1]??"?",adjacent:adjacent?.[1]??"?",hypotenuse:hyp?.[1]??"?",angle:find("theta = ("+N+") degrees")?.[1]?.concat("°")??"θ"});
    if((m=find("has legs ("+N+") and ("+N+")")))spec=triangle({opposite:m[1],adjacent:m[2]});
    if((m=find("hypotenuse ("+N+") and one leg ("+N+")")))spec=triangle({hypotenuse:m[1],adjacent:m[2]});
    if((m=find("45-45-90 triangle has a leg of length ("+N+")")))spec=triangle({opposite:m[1],adjacent:m[1],angle:"45°"});
    if((m=find("30-60-90 triangle has shorter leg ("+N+")")))spec=triangle({opposite:m[1],angle:"30°"});
    if((m=find("point ("+N+") meters from.*elevation.*is ("+N+") degrees")))spec=triangle({adjacent:m[1]+" m",opposite:"height ?",angle:m[2]+"°"});
  }else if(skillId==="MATH_TRIG_002"){
    if((m=find("(-?\\d*)pi/([1-9]\\d*)")))spec={kind:"unit",angle:Number(m[1]==="-"?-1:m[1]||1)*Math.PI/+m[2],label:m[0],radius:find("radius ("+N+")")?.[1]??"1"};
    else if((m=find("("+N+") degrees")))spec={kind:"unit",angle:+m[1]*Math.PI/180,label:m[1]+"°",radius:"1"};
    if(spec)spec.caption="The ray shows the terminal direction of the stated angle. Full turns are retained in its label; coordinates and converted angles are not supplied.";
  }else if(skillId==="MATH_TRIG_003"){
    if((m=find("amplitude ("+N+"), period ("+N+"), midline y = ("+N+")"))){
      spec=wave([m[1]+"cos(2*pi*x/"+m[2]+")+"+m[3]],{expressions:["Given periodic model"],xmax:+m[2]*1.15});
    }else if((m=find("(?:y|h\\(t\\)) = (.+?)(?:,|\\. | starts |$)"))){
      const expression=m[1].replace(/\.$/,"").replace(/\s/g,"");
      spec=wave([expression]);
      if(spec){
        const period=expression.match(/2\*pi\*[xt]\/(\d+)/);
        const shifted=expression.match(/(sin|cos)\((-?\d+)\(x([+-])(\d+)\)\)/);
        const frequency=expression.match(/(?:sin|cos)\((-?\d*)x\)/);
        const rate=frequency?.[1]==="-"?-1:Number(frequency?.[1]||1);
        const length=period?+period[1]:2*Math.PI/Math.abs(shifted?+shifted[2]:rate);
        const center=shifted?(shifted[3]==="-"?1:-1)*+shifted[4]:0;
        spec.xmin=shifted?center-length:0;spec.xmax=shifted?center+length:length*1.15;
      }
    }
  }else if(skillId==="MATH_TRIG_004"){
    if(/Quadrant|acute angle/.test(p)){
      const quadrant=p.includes("Quadrant III")?3:p.includes("Quadrant II")?2:1;
      const ratios=[...p.matchAll(/(sin|cos|tan|cot)\(theta\) = (-?\d+)\/(\d+)/g)].map(m=>({fn:m[1],numerator:m[2],denominator:m[3]}));
      if(ratios.length)spec={kind:"ratio",quadrant,ratios,caption:"A reference-triangle schematic in the stated quadrant. Only the supplied ratios are labeled; the missing ratio is for you to find."};
    }
  }else if(skillId==="MATH_TRIG_005"){
    const equation=p.split(": ")[1]?.split(" = ");
    if(equation?.length===2)spec=wave(equation,{interval:p.includes("over the real")?null:p.includes("[0, 2pi]")?"[0, 2π]":"[0, 2π)",caption:p.includes("over the real")?"One complete cycle of the given periodic relationship. The question asks about all real x; no roots are marked.":"Compare the given curves on the stated interval. Square brackets include endpoints; a parenthesis excludes that endpoint. No roots are marked."});
  }else if(skillId==="MATH_TRIG_006"){
    if (!/triangle|walks|^You know (?:angles|sides)/i.test(p)) return null;
    spec={kind:"oblique",a:"a",b:"b",c:"c",A:"A",B:"B",C:"C",caption:"Side a is opposite A, b opposite B, and c opposite C. This schematic is not to scale."};
    for(const angle of ["A","B","C"]){const value=find(angle+" (?:=|is) ("+N+") degrees");if(value)spec[angle]=value[1]+"°";}
    for(const side of ["a","b","c"]){const value=find("(?:side )?\\b"+side+" = ("+N+")");if(value)spec[side]=value[1];}
    if((m=find("angles A = ("+N+") degrees and B = ("+N+") degrees"))){spec.A=m[1]+"°";spec.B=m[2]+"°";spec.C="?";}
    if((m=find("each have length ("+N+"), and their included angle is ("+N+")"))){spec.a=spec.b=m[1];spec.C=m[2]+"°";spec.c="?";}
    if((m=find("sides ("+N+") and ("+N+") enclosing a ("+N+")-degree"))){spec.a=m[1];spec.b=m[2];spec.C=m[3]+"°";}
    if((m=find("side lengths ("+N+"), ("+N+"), and ("+N+")"))){spec.a=m[1];spec.b=m[2];spec.c=m[3];spec.C="?";}
    if((m=find("walks ("+N+") km and the other walks ("+N+") km, with a ("+N+")-degree"))){spec.a=m[1]+" km";spec.b=m[2]+" km";spec.C=m[3]+"°";spec.c="?";}
    if(id.startsWith("TRIG_TRI_SSA_"))spec.caption="Labels show the SSA givens only. This reference sketch does not assert that a triangle exists or how many are possible.";
  }else if(skillId==="MATH_GEOM_004"){
    const base=find("base (?:is )?("+N+"(?:/\\d+)?\\s*(?:cm|mm|m))"),height=find("perpendicular height (?:is )?("+N+"\\s*(?:cm|mm|m))");
    if(base||height)spec={kind:"height",base:base?.[1]??"?",height:height?.[1]??"?",area:find("area (?:is )?("+N+"\\s*(?:cm²|m²))")?.[1],caption:"The height meets the chosen base at a right angle. Use the stated units; this schematic is not to scale."};
    if((m=find("rectangle is ("+N+") cm by ("+N+") cm.*sides ("+N+") cm and ("+N+") cm")))spec={kind:"cutout",w:m[1],h:m[2],b:m[3],a:m[4],caption:"Remove the marked right-triangular corner from the rectangle. Labels are in cm; schematic not to scale."};
  }
  if(!spec)return null;
  const finite=value=>typeof value==="number"?Number.isFinite(value)&&Math.abs(value)<=1e5:Array.isArray(value)?value.every(finite):value&&typeof value==="object"?Object.values(value).every(finite):true;
  return finite(spec)?spec:null;
}

function drawWave(s){
  const samples=Array.from({length:361},(_,i)=>s.xmin+(s.xmax-s.xmin)*i/360);
  const values=s.trees.map(t=>samples.map(x=>diagramValue(t,x)));
  const finite=values.flat().filter(y=>Number.isFinite(y)&&Math.abs(y)<1e6).sort((a,b)=>a-b);
  if(!finite.length)return "";
  const hasTan=JSON.stringify(s.trees).includes('"tan"');
  let lo=Math.min(0,finite[hasTan?Math.floor(finite.length*.08):0]),hi=Math.max(0,finite[hasTan?Math.floor(finite.length*.92):finite.length-1]);
  const margin=Math.max(.3,(hi-lo)*.14);lo-=margin;hi+=margin;
  const px=x=>75+(x-s.xmin)/(s.xmax-s.xmin)*580,py=y=>370-(y-lo)/(hi-lo)*300;
  let svg="";
  for(let i=0;i<5;i++){
    const x=s.xmin+(s.xmax-s.xmin)*i/4,y=lo+(hi-lo)*i/4;
    svg+=line(px(x),70,px(x),370,"diagram-grid")+text(numeric(px(x)),405,String(Number(x.toPrecision(3))),24);
    svg+=line(75,py(y),655,py(y),"diagram-grid")+text(40,numeric(py(y)+6),String(Number(y.toPrecision(3))),24);
  }
  svg+=line(75,py(0),655,py(0),"diagram-axis");
  for(let k=0;k<values.length;k++){
    let points=[];
    const flush=()=>{if(points.length>1)svg+='<polyline points="'+points.join(" ")+'" fill="none" class="'+(k?"diagram-guide":"diagram-line")+'"/>';points=[];};
    for(let i=0;i<samples.length;i++){
      const y=values[k][i],previous=values[k][i-1];
      if(!Number.isFinite(y)||y<lo||y>hi||(Number.isFinite(previous)&&Math.abs(y-previous)>(hi-lo)*.35)){flush();continue;}
      points.push(numeric(px(samples[i]))+","+numeric(py(y)));
    }flush();
  }
  svg+=text(365,450,s.interval ? "x in "+s.interval+" radians" : "x / t (radians where applicable)",22);
  s.expressions.forEach((expression,i)=>{
    svg+=line(95,24+i*28,125,24+i*28,i?"diagram-guide":"diagram-line")+text(385,32+i*28,expression,24);
  });
  return svg;
}
export function renderExtendedDrawing(s){
  if(s.kind==="wave")return drawWave(s);
  if(s.kind==="unit"){
    const cx=360,cy=240,r=150,a=s.angle;
    let svg='<circle cx="360" cy="240" r="150" class="diagram-circle"/>'+line(170,240,550,240,"diagram-axis")+line(360,50,360,430,"diagram-axis");
    svg+=line(cx,cy,numeric(cx+r*Math.cos(a)),numeric(cy-r*Math.sin(a)));
    svg+=text(585,248,"x")+text(380,45,"y")+text(550,85,s.label)+text(150,80,"r = "+s.radius,23);
    return svg;
  }
  if(s.kind==="ratio"){
    const x=s.quadrant===1?535:185,y=s.quadrant===3?355:95;
    return line(100,235,620,235,"diagram-axis")+line(360,40,360,415,"diagram-axis")+'<polygon points="360,235 '+x+',235 '+x+','+y+'" class="diagram-shape"/>'+text(360,455,s.ratios.map(r=>r.fn+" θ = "+r.numerator+"/"+r.denominator).join("; "),24)+text(590,70,"Quadrant "+s.quadrant,22);
  }
  if(s.kind==="triangle"){
    return '<polygon points="150,360 520,360 520,100" class="diagram-shape"/>'+line(500,360,500,340)+line(500,340,520,340)+text(340,415,s.adjacent)+text(610,240,s.opposite,23)+text(300,190,s.hypotenuse)+text(235,341,s.angle,23);
  }
  if(s.kind==="oblique"){
    return '<polygon points="155,350 565,350 320,100" class="diagram-shape"/>'+text(360,410,"c = "+s.c)+text(170,210,"b = "+s.b,23)+text(520,205,"a = "+s.a,23)+text(125,365,s.A,22)+text(605,365,s.B,22)+text(320,65,s.C,22);
  }
  if(s.kind==="height"){
    return '<polygon points="145,350 565,350 395,90" class="diagram-shape"/>'+line(395,350,395,90,"diagram-guide")+line(375,350,375,330)+line(375,330,395,330)+text(345,410,"base "+s.base)+text(540,180,"h = "+s.height,23)+(s.area?text(200,75,"Area = "+s.area,23):"");
  }
  if(s.kind==="cutout"){
    return '<rect x="140" y="100" width="420" height="250" class="diagram-shape"/><polygon points="430,100 560,100 560,210" class="diagram-cutout"/>'+line(430,100,560,210,"diagram-guide")+text(350,410,s.w+" cm")+text(90,235,s.h+" cm",22)+text(495,75,s.b+" cm",22)+text(620,160,s.a+" cm",22);
  }
  return "";
}
