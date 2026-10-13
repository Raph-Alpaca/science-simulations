// Inert envelope validation; no compiler, filesystem, process or network.
import {hash} from '../../packages/contracts/content-source.js';
import {parseCandidate} from './candidate.mjs';
export class RuntimeCheckError extends Error{constructor(code){super(code);this.code=code;this.name='RuntimeCheckError';}}
export const runtimeNeed=(value,code)=>{if(!value)throw new RuntimeCheckError(code);};
const exact=(value,keys)=>runtimeNeed(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'RUNTIME_ENVELOPE_INVALID');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function prepareRuntimeBundle(packet){
 exact(packet,['inputText','candidateText','expected']);
 const {inputText,candidateText,expected}=packet;
 exact(expected,['sourceSnapshotHash','candidateHash','baselineSha','attempt']);
 runtimeNeed(typeof inputText==='string'&&Buffer.byteLength(inputText)<=250000&&/^[a-f0-9]{64}$/.test(expected.sourceSnapshotHash)&&hash(inputText)===expected.sourceSnapshotHash,'RUNTIME_SOURCE_MISMATCH');
 runtimeNeed(/^[a-f0-9]{64}$/.test(expected.candidateHash)&&/^[a-f0-9]{40}$/.test(expected.baselineSha)&&Number.isInteger(expected.attempt)&&expected.attempt>=0&&expected.attempt<=2,'RUNTIME_ENVELOPE_INVALID');
 let source;try{source=JSON.parse(inputText);}catch{throw new RuntimeCheckError('RUNTIME_SOURCE_INVALID');}
 exact(source,['input','context']);runtimeNeed(['interactive_2d','interactive_3d'].includes(source.input?.generationKind),'RUNTIME_SOURCE_INVALID');
 let candidate;try{candidate=parseCandidate(candidateText,source.context);}catch{throw new RuntimeCheckError('RUNTIME_CANDIDATE_INVALID');}
 runtimeNeed(candidate.candidateHash===expected.candidateHash,'RUNTIME_CANDIDATE_MISMATCH');
 return freeze({candidate,generationKind:source.input.generationKind,...expected});
}
