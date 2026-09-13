import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertFormalCertificate, formalRequestHash} from '../../docs/formal-proof-trust.js';

const {request,result}=JSON.parse(fs.readFileSync(process.argv[2] ?? new URL('../../.bridge-runtime/lean-browser/native-certificate.json',import.meta.url)));
assert.equal(result.status,'verified','Requires a fresh real native certificate as the positive control');
assertFormalCertificate(result,request);
const mismatched=structuredClone(result);
mismatched.certificate.environment={lean_toolchain:'lean4-wasm:62b6a2291302d4bbeace37642a066b7510d0145c',mathlib_revision:'de3a9cf33016bbb6d15880d7680643f7ca2d25ba'};
const {certificate_digest,...payload}=mismatched.certificate;
mismatched.certificate.certificate_digest=formalRequestHash(payload);
assert.throws(()=>assertFormalCertificate(mismatched,request),/pinned environment/);
const matchedBrowser=structuredClone(result);
matchedBrowser.certificate.environment={lean_toolchain:'lean4-wasm:6a10ac8c22beadecabdbb0919c2b50214762f91d+port',mathlib_revision:'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c'};
const {certificate_digest:ignoredDigest,...matchedPayload}=matchedBrowser.certificate;
matchedBrowser.certificate.certificate_digest=formalRequestHash(matchedPayload);
assert.throws(()=>assertFormalCertificate(matchedBrowser,request),/pinned environment/);
assert.throws(()=>assertFormalCertificate({...result,certificate:null},request));
console.log('PASS real native certificate accepted; rehashed browser environment rejected; no-certificate result rejected.');
