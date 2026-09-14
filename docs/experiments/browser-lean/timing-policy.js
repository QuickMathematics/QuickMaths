// Diagnostic-only timing allowance. Never changes a native request or certificate.
export const slowCases=new Set([
 'series_root_monomial_geometric_summable.json',
 'series_root_monomial_geometric_divergent.json',
 'series_root_polynomial_geometric_summable.json',
 'series_root_polynomial_geometric_divergent.json',
 'series_root_polynomial_quotient_denominator_geometric_summable.json',
 'series_root_polynomial_quotient_domain_guard_needed.json',
 'series_root_polynomial_quotient_geometric_divergent.json',
 'series_root_polynomial_quotient_geometric_summable.json',
 'series_root_reciprocal_polynomial_geometric_summable.json',
 'series_ratio_limit_balanced_powered_shifted_factorials.json',
 'series_ratio_limit_extra_denominator_factorial.json',
 'series_ratio_limit_extra_numerator_factorial.json',
]);
export function timingBudget(mode,original){
 if(!['standard','slow'].includes(mode)||!Number.isFinite(original)||original<=0)throw Error('Invalid timing policy');
 return mode==='slow'?Math.max(original,120000):original;
}
