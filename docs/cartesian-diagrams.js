// Bounded mathematical data only. No eval, markup, imports or URLs in a graph.
const fail = () => { throw new Error('Invalid Cartesian diagram.'); };
const text = (v, max = 500) => typeof v === 'string' && v.length <= max ? v : fail();
const number = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6 ? v : fail();
const keys = (v, allowed) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !allowed.includes(k))) fail(); };
const list = (v, max, fn) => Array.isArray(v) && v.length <= max ? v.map(fn) : fail();
const pair = v => { const p = list(v, 2, number); if (p.length !== 2) fail(); return p; };
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Interval evaluation prevents joining samples across a pole, including a pole
// between samples. Deliberately limited to arithmetic, integer powers, sqrt/abs.
export function graphExpression(source) {
  source = text(source, 300);
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\*\*|[()+*/-]|[A-Za-z_]+/gi) ?? [];
  if (!tokens.length || tokens.length > 120 || tokens.join('') !== source.replace(/\s/g, '')) fail();
  let i = 0;
  const parse = (min = 0, depth = 0) => {
    if (depth > 20) fail();
    let token = tokens[i++], node;
    if (token === '+' || token === '-') node = [token === '-' ? 'neg' : 'pos', parse(3, depth + 1)];
    else if (token === '(') { node = parse(0, depth + 1); if (tokens[i++] !== ')') fail(); }
    else if (token === 'x') node = ['x'];
    else if (['sqrt', 'abs'].includes(token)) { if (tokens[i++] !== '(') fail(); node = [token, parse(0, depth + 1)]; if (tokens[i++] !== ')') fail(); }
    else if (token && /^\d|^\./.test(token)) node = ['n', number(Number(token))];
    else fail();
    while (i < tokens.length) {
      const op = tokens[i], prec = {'+':1,'-':1,'*':2,'/':2,'**':4}[op];
      if (!prec || prec < min) break;
      i++;
      const right = parse(prec + (op === '**' ? 0 : 1), depth + 1);
      if (op === '**' && (right[0] !== 'n' || !Number.isInteger(right[1]) || right[1] > 8)) fail();
      node = [op, node, right];
    }
    return node;
  };
  const tree = parse(); if (i !== tokens.length) fail();
  const evaluate = (node, domain) => {
    if (node[0] === 'n') return [node[1], node[1]];
    if (node[0] === 'x') return domain;
    const a = evaluate(node[1], domain); if (!a) return null;
    if (node[0] === 'neg') return [-a[1], -a[0]];
    if (node[0] === 'pos') return a;
    if (node[0] === 'sqrt') return a[0] < 0 ? null : a.map(Math.sqrt);
    if (node[0] === 'abs') return [a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(...a.map(Math.abs)), Math.max(...a.map(Math.abs))];
    const b = evaluate(node[2], domain); if (!b) return null;
    if (node[0] === '+') return [a[0]+b[0], a[1]+b[1]];
    if (node[0] === '-') return [a[0]-b[1], a[1]-b[0]];
    if (node[0] === '/' && b[0] <= 0 && b[1] >= 0) return null;
    if (node[0] === '**') {
      const e = b[0], ends = a.map(v => v ** e);
      return [e && e % 2 === 0 && a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(...ends), Math.max(...ends)];
    }
    const values = a.flatMap(x => b.map(y => node[0] === '*' ? x*y : x/y));
    return values.every(Number.isFinite) ? [Math.min(...values), Math.max(...values)] : null;
  };
  return (lo, hi = lo) => evaluate(tree, [lo, hi]);
}

export function normalizeCartesianDiagram(v) {
  keys(v, ['kind','x_range','y_range','alt','curves','points','segments','asymptotes','labels']);
  if (v.kind !== 'cartesian') fail();
  const range = p => { p = pair(p); if (p[1]-p[0] < 1e-6) fail(); return p; };
  const out = {kind:'cartesian', x_range:range(v.x_range), y_range:range(v.y_range), alt:text(v.alt)};
  if (!out.alt.trim()) fail();
  out.curves = list(v.curves ?? [], 8, c => {
    keys(c, ['expression','interval','endpoints','exclude']);
    const expression = text(c.expression, 300); graphExpression(expression);
    const endpoints = c.endpoints ?? ['none','none'];
    if (!Array.isArray(endpoints) || endpoints.length !== 2 || endpoints.some(x => !['open','closed','none'].includes(x))) fail();
    return {expression, interval:range(c.interval), endpoints:[...endpoints], exclude:list(c.exclude ?? [], 24, number)};
  });
  out.points = list(v.points ?? [], 24, p => { keys(p, ['at','label','endpoint']); if (!['open','closed'].includes(p.endpoint ?? 'closed')) fail(); return {at:pair(p.at),label:text(p.label ?? '',100),endpoint:p.endpoint ?? 'closed'}; });
  out.segments = list(v.segments ?? [], 16, s => { keys(s,['from','to']); return {from:pair(s.from),to:pair(s.to)}; });
  out.asymptotes = list(v.asymptotes ?? [], 8, a => {keys(a,['axis','value']); if (!['x','y'].includes(a.axis)) fail(); return {axis:a.axis,value:number(a.value)};});
  out.labels = list(v.labels ?? [], 16, l => {keys(l,['at','text']); return {at:pair(l.at),text:text(l.text,100)};});
  return out;
}

export function publicDiagramValues(promptTemplate, values) {
  return Object.fromEntries([...String(promptTemplate).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].filter(m => Object.hasOwn(values,m[1])).map(m => [m[1],values[m[1]]]));
}

export function resolveCartesianDiagram(spec, values = {}) {
  const visit = value => {
    if (typeof value === 'string') {
      const numeric = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
      const replaced = value.replace(/\{([^{}]+)\}/g, (_, name) => Object.hasOwn(values,name) ? String(number(Number(values[name]))) : fail());
      return numeric ? number(Number(replaced)) : replaced;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)]));
    return value;
  };
  // alt/labels containing just a placeholder are still text.
  const resolved = visit(spec);
  const coordinate = value => {
    if (typeof value === 'number') return number(value);
    if (typeof value !== 'string' || /\bx\b/.test(value)) fail();
    const result = graphExpression(value)(0);
    return result ? number(result[0]) : fail();
  };
  const coordinates = p => Array.isArray(p) ? p.map(coordinate) : fail();
  resolved.x_range = coordinates(resolved.x_range); resolved.y_range = coordinates(resolved.y_range);
  for (const c of resolved.curves ?? []) { c.interval = coordinates(c.interval); c.exclude = (c.exclude ?? []).map(coordinate); }
  for (const p of [...(resolved.points ?? []), ...(resolved.labels ?? [])]) p.at = coordinates(p.at);
  for (const s of resolved.segments ?? []) { s.from = coordinates(s.from); s.to = coordinates(s.to); }
  for (const a of resolved.asymptotes ?? []) a.value = coordinate(a.value);
  resolved.alt = String(resolved.alt);
  for (const c of resolved.curves ?? []) c.expression = String(c.expression);
  for (const l of resolved.labels ?? []) l.text = String(l.text);
  for (const p of resolved.points ?? []) p.label = String(p.label ?? '');
  return normalizeCartesianDiagram(resolved);
}

export function cartesianSegments(curve, xRange, yRange) {
  const f = graphExpression(curve.expression), low = Math.max(curve.interval[0],xRange[0]), high = Math.min(curve.interval[1],xRange[1]);
  if (low >= high) return [];
  const paths = []; let path = [];
  const flush = () => { if (path.length > 1) paths.push(path); path=[]; };
  let previous;
  for (let i=0;i<=320;i++) {
    const x = low+(high-low)*i/320, y=f(x)?.[0];
    const gap = curve.exclude.some(e => previous != null && e >= previous && e <= x);
    const valid = Number.isFinite(y) && y >= yRange[0] && y <= yRange[1] && !curve.exclude.includes(x);
    if (!valid || gap || (previous != null && !f(previous,x))) flush();
    if (valid) path.push([x,y]);
    previous=x;
  }
  flush(); return paths;
}

export function renderCartesianDiagram(candidate) {
  let s; try { s=normalizeCartesianDiagram(candidate); } catch { return '<p class="lesson-media-status">Diagram unavailable: invalid graph data.</p>'; }
  const [xmin,xmax]=s.x_range, [ymin,ymax]=s.y_range;
  const x=v=>60+(v-xmin)/(xmax-xmin)*600, y=v=>410-(v-ymin)/(ymax-ymin)*360;
  const inside=p=>p[0]>=xmin && p[0]<=xmax && p[1]>=ymin && p[1]<=ymax;
  const line=(a,b,cls='diagram-line')=>`<line x1="${x(a[0])}" y1="${y(a[1])}" x2="${x(b[0])}" y2="${y(b[1])}" class="${cls}"/>`;
  const label=(p,t)=>inside(p)?`<text x="${x(p[0])+8}" y="${y(p[1])-10}">${esc(t)}</text>`:'';
  let svg='<rect x="60" y="50" width="600" height="360" fill="none" class="diagram-axis"/>';
  if (xmin<=0 && xmax>=0) svg+=line([0,ymin],[0,ymax],'diagram-axis');
  if (ymin<=0 && ymax>=0) svg+=line([xmin,0],[xmax,0],'diagram-axis');
  for(let i=0;i<=4;i++) { const xx=xmin+(xmax-xmin)*i/4, yy=ymin+(ymax-ymin)*i/4; svg+=`<text x="${x(xx)}" y="435" text-anchor="middle">${esc(Number(xx.toPrecision(4)))}</text><text x="52" y="${y(yy)}" text-anchor="end">${esc(Number(yy.toPrecision(4)))}</text>`; }
  for(const a of s.asymptotes) if(a.value >= (a.axis==='x'?xmin:ymin) && a.value <= (a.axis==='x'?xmax:ymax)) svg+=line(a.axis==='x'?[a.value,ymin]:[xmin,a.value],a.axis==='x'?[a.value,ymax]:[xmax,a.value],'cartesian-asymptote');
  for(const c of s.curves) {
    for(const path of cartesianSegments(c,s.x_range,s.y_range)) svg+=`<polyline points="${path.map(p=>`${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' ')}" class="diagram-line"/>`;
    const f=graphExpression(c.expression);
    c.endpoints.forEach((type,i)=> {const p=[c.interval[i],f(c.interval[i])?.[0]]; if(type!=='none' && inside(p) && Number.isFinite(p[1])) svg+=`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="6" class="cartesian-endpoint ${type}"/>`;});
  }
  for(const seg of s.segments) if(inside(seg.from)&&inside(seg.to)) svg+=line(seg.from,seg.to);
  for(const p of s.points) if(inside(p.at)) svg+=`<circle cx="${x(p.at[0])}" cy="${y(p.at[1])}" r="6" class="cartesian-endpoint ${p.endpoint}"/>`+label(p.at,p.label);
  for(const l of s.labels) svg+=label(l.at,l.text);
  return `<figure class="question-diagram" data-question-diagram="cartesian"><svg viewBox="0 0 720 470" role="img" aria-label="${esc(s.alt)}"><title>${esc(s.alt)}</title>${svg}</svg><figcaption tabindex="0">${esc(s.alt)}</figcaption></figure>`;
}
