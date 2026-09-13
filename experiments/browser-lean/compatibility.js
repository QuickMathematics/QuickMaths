// Experimental compatibility only. Never changes production certificate pins.
export const REFERENCE_ENVIRONMENT = Object.freeze({
  leanCommit: '62b6a2291302d4bbeace37642a066b7510d0145c',
  mathlibCommit: 'de3a9cf33016bbb6d15880d7680643f7ca2d25ba',
});
const IMPORTS = Object.freeze({
  'Mathlib.Basic.Real.Basic': 'Mathlib.Data.Real.Basic',
  'Mathlib.Tactic.Positivity': 'Mathlib.Tactic.Positivity.Basic',
});
export function referenceSource(source, environment) {
  if (environment.leanCommit !== REFERENCE_ENVIRONMENT.leanCommit ||
      environment.mathlibCommit !== REFERENCE_ENVIRONMENT.mathlibCommit) {
    throw Error('Reference import adapter used with an unrecognized environment');
  }
  const substitutions = [];
  const adapted = source.replace(/^import ([A-Za-z0-9_.]+)$/gm, (line, name) => {
    if (!IMPORTS[name]) return line;
    substitutions.push({from: name, to: IMPORTS[name]});
    return 'import '+IMPORTS[name];
  });
  return {source: adapted, substitutions, assessment_eligible: false, certificate: null};
}

export function sourceForExperiment(source, environment) {
  if(environment.leanCommit===REFERENCE_ENVIRONMENT.leanCommit)
    return referenceSource(source,environment);
  if(environment.leanCommit!=='6a10ac8c22beadecabdbb0919c2b50214762f91d' ||
     environment.mathlibCommit!=='42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c' ||
     environment.importPolicy!=='production-private-strict' ||
     !/^[a-f0-9]{64}$/.test(environment.portSha256||''))
    throw Error('Unrecognized aligned experimental environment');
  return {source,substitutions:[],assessment_eligible:false,certificate:null};
}
