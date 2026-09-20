import {formalRequestHash} from './formal-proof-trust.js';
// Structural teaching requirements, applied in addition to a fresh Lean verdict.
// Match the terminal goal step exactly as the native generator does.
export const FORMAL_METHODS = Object.freeze({
  derivative_definition: {rule:'derivative_from_limit',label:'Definition of the derivative'},
  induction: {rule:'nat_induction',label:'Natural-number induction'},
  cases: {rule:'or_elim',label:'Proof by cases'},
  contradiction: {rule:'not_intro',label:'Negation by contradiction'},
  universal_introduction: {rule:'forall_intro',label:'Arbitrary-variable proof'},
  implication: {rule:'imp_intro',label:'Implication by a temporary assumption'},
  existential_elimination: {rule:'exists_elim',label:'Reasoning from an existential witness'},
});
export function assertFormalMethod(policy = {}, request) {
  if (!policy || typeof policy!=='object' || Array.isArray(policy)) throw Error('Invalid method assessment policy.');
  if (!Object.keys(policy).length) return;
  if (Object.keys(policy).some(k=>k!=='required_method') || !Object.hasOwn(FORMAL_METHODS,policy.required_method))
    throw Error('This method-specific assessment policy is not supported yet. No assessment credit is available.');
  const method=FORMAL_METHODS[policy.required_method];
  const goalHash=formalRequestHash(request?.goal ?? null);
  const final=(request?.steps ?? []).filter(s=>s.scope==='root'&&formalRequestHash(s.claim)===goalHash).at(-1);
  if (final?.rule!==method.rule) throw Error(`Required method: ${method.label}. The final goal must be established using ${method.rule}; an unused method step does not count.`);
}
