const $ = id => document.getElementById(id);
const lines = value => value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const commaList = value => value.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
let currentRequest = null;
let capabilities = null;

const examples = {
  cancel:{decl:"x:real",asm:"x != 3",goal:"(x^2 - 9)/(x - 3) = x + 3"},
  logic:{decl:"x:real",asm:"",goal:"(x = 0) implies (x = 0)"},
  forall:{decl:"",asm:"",goal:"forall z:real, z = z"},
  funext:{decl:"f:real->real\ng:real->real",asm:"forall x:real, f(x) = g(x)",goal:"f = g"},
  setext:{decl:"A:set[real]\nB:set[real]",asm:"forall x:real, (x in A) iff (x in B)",goal:"A = B"},
};

async function rpc(message){
  const response=await fetch('/v1/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol_version:'0.1',...message})});
  const data=await response.json();
  if(!data.ok) throw new Error(data.error?.message||'Verifier request failed');
  return data.result;
}

function renderContext(context=[]){
  const list=$('context'); list.replaceChildren();
  if(!context.length){const li=document.createElement('li');li.textContent='No assumptions.';list.append(li);return}
  for(const row of context){const li=document.createElement('li');li.textContent=`${row.id} · ${row.claim}`;list.append(li)}
}

function renderSteps(request){
  const list=$('steps'); list.replaceChildren();
  const steps=request?.steps||[];
  if(!steps.length){ const li=document.createElement('li'); li.textContent='No proof steps have been established yet.'; list.append(li); return; }
  for(const step of steps){
    const li=document.createElement('li');
    const premises=step.premises?.length?` · premises: ${step.premises.join(', ')}`:'';
    li.textContent=`${step.id} · ${step.rule}${premises}`;
    list.append(li);
  }
}

function renderObligations(rows){
  const panel=$('obligation-panel'), list=$('obligations'); list.replaceChildren();
  if(!rows?.length){panel.classList.add('hidden');return}
  panel.classList.remove('hidden');
  for(const row of rows){const li=document.createElement('li');li.textContent=row.message||row.code||'Unresolved obligation';list.append(li)}
}

function showResult({status,message,preview,request,context=[],obligations=[],leanSource='',raw={}}){
  $('result').classList.remove('hidden');
  $('status-title').textContent=status.replaceAll('_',' ');
  $('status-badge').textContent=status;
  $('status-badge').className=`badge ${status}`;
  $('message').textContent=message||'';
  $('preview').textContent=preview||'';
  renderContext(context);
  renderSteps(request);
  renderObligations(obligations);
  $('lean').textContent=leanSource||'No Lean artifact was generated for this state.';
  $('raw').textContent=JSON.stringify(raw,null,2);
}

function inputPayload(){
  return {
    request_id:`workbench-${Date.now()}`,
    declarations:lines($('declarations').value),
    assumptions:lines($('assumptions').value),
    goal:$('goal').value,
    max_seconds:30,
  };
}

async function prove(){
  $('prove').disabled=true; $('prove').textContent='Building…';
  try{
    const result=await rpc({op:'prove_text',...inputPayload()});
    const v=result.verification;
    currentRequest=v.resolved_request||result.request;
    showResult({status:v.status,message:v.message,preview:result.preview,request:currentRequest,context:v.proof_state?.context||[],obligations:v.obligations,leanSource:v.lean_source,raw:result});
  }catch(error){
    showResult({status:'engine_error',message:error.message,raw:{error:String(error.stack||error)}});
  }finally{$('prove').disabled=false;$('prove').textContent='Build proof automatically'}
}

function populateRules(){
  const select=$('step-rule');
  const existing=new Set([...select.options].map(x=>x.value));
  for(const [group,rules] of Object.entries(capabilities?.rule_groups||{})){
    const optgroup=document.createElement('optgroup'); optgroup.label=group.replaceAll('_',' ');
    for(const rule of rules){
      if(existing.has(rule)) continue;
      const option=document.createElement('option'); option.value=rule; option.textContent=rule.replaceAll('_',' '); optgroup.append(option); existing.add(rule);
    }
    if(optgroup.children.length) select.append(optgroup);
  }
}

async function startManual(){
  $('manual-start').disabled=true;
  try{
    const result=await rpc({op:'new_text_request',...inputPayload()});
    currentRequest=result.request;
    $('manual-editor').classList.remove('hidden');
    $('manual-state').textContent=result.proof_state.status.replaceAll('_',' ');
    showResult({status:result.proof_state.status,message:result.proof_state.message,preview:result.proof_state.preview,request:currentRequest,context:result.proof_state.context,obligations:result.proof_state.obligations,raw:result});
  }catch(error){
    showResult({status:'engine_error',message:error.message,raw:{error:String(error.stack||error)}});
  }finally{$('manual-start').disabled=false}
}

function parameterKeyForRule(rule){
  if(['add_both_sides','subtract_both_sides','multiply_both_sides','divide_both_sides','add_inequality','scale_inequality_positive','scale_inequality_negative'].includes(rule)) return 'term';
  if(rule==='guarded_cancel') return 'divisor';
  if(rule==='sqrt_square_nonnegative') return 'argument';
  if(rule==='conjugate_identity') return 'radicand';
  if(['exists_intro','forall_elim'].includes(rule)) return 'witness';
  return null;
}

function updateParameterLabel(){
  const key=parameterKeyForRule($('step-rule').value);
  $('step-parameter-label').textContent=key?`${key.replaceAll('_',' ')} (optional unless rule requires it)`:'No expression parameter required';
  $('step-term').disabled=!key;
  if(!key) $('step-term').value='';
}

async function addManualStep(){
  if(!currentRequest){await startManual(); if(!currentRequest) return}
  $('add-step').disabled=true;
  try{
    const term=$('step-term').value.trim();
    const parameterKey=parameterKeyForRule($('step-rule').value);
    const parameters=term&&parameterKey?{[parameterKey]:term}:{};
    const result=await rpc({
      op:'append_text_step',request:currentRequest,claim:$('step-claim').value,rule:$('step-rule').value,
      premises:commaList($('step-premises').value),parameters,
    });
    currentRequest=result.request;
    const state=result.proof_state;
    $('manual-state').textContent=state.status.replaceAll('_',' ');
    showResult({status:state.status,message:state.message,preview:state.preview,request:currentRequest,context:state.context,obligations:state.obligations,raw:result});
    $('step-claim').value=''; $('step-premises').value=''; $('step-term').value='';
  }catch(error){
    showResult({status:'engine_error',message:error.message,request:currentRequest,raw:{error:String(error.stack||error)}});
  }finally{$('add-step').disabled=false}
}

$('prove').addEventListener('click',prove);
$('manual-start').addEventListener('click',startManual);
$('add-step').addEventListener('click',addManualStep);
$('step-rule').addEventListener('change',updateParameterLabel);
$('example').addEventListener('change',event=>{const x=examples[event.target.value];if(!x)return;$('declarations').value=x.decl;$('assumptions').value=x.asm;$('goal').value=x.goal;currentRequest=null;$('manual-editor').classList.add('hidden')});

Promise.all([fetch('/health').then(r=>r.json()),fetch('/capabilities').then(r=>r.json())]).then(([health,caps])=>{
  capabilities=caps; populateRules(); updateParameterLabel();
  $('runtime').textContent=health.lean_available?'Lean kernel available':'Lean unavailable here · candidate artifacts only';
  const groups=caps.rule_groups||{};
  $('capabilities').innerHTML=`<p>${caps.foundation.backend}. Certificates require an actual kernel check.</p><div class="cap-groups">${Object.entries(groups).map(([name,rules])=>`<div class="cap-group"><strong>${name.replaceAll('_',' ')}</strong>${rules.join(', ')}</div>`).join('')}</div>`;
}).catch(error=>{$('runtime').textContent='Verifier health unavailable';$('capabilities').textContent=error.message});
