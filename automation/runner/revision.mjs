import {hash} from '../../packages/contracts/content-source.js';
import {parseCandidate} from './candidate.mjs';
import {RunnerError,CALL_LIMITS} from './bounded-responses.mjs';

const need=(ok,code)=>{if(!ok)throw new RunnerError(code);};
// The reference is inside the consented input hash; source bytes travel separately.
// Keep room for the fixed schema/runtime contract and the bounded design report.
export function inspectRevisionBase(input,context,baseCandidateText){
 const reference=input?.revision;
 if(!reference){need(baseCandidateText===undefined,'UNEXPECTED_REVISION_BASE');return null;}
 need(Object.keys(reference).sort().join(',')===['parentJobId','feedbackId','headJobId','stateVersion','sourceHash','candidateHash','evidenceHash','candidateTextHash'].sort().join(','),'REVISION_REFERENCE_INVALID');
 need(['parentJobId','feedbackId','headJobId'].every(k=>typeof reference[k]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reference[k]))&&Number.isInteger(reference.stateVersion)&&reference.stateVersion>=0,'REVISION_REFERENCE_INVALID');
 need(['sourceHash','candidateHash','evidenceHash','candidateTextHash'].every(k=>/^[a-f0-9]{64}$/.test(reference[k])),'REVISION_REFERENCE_INVALID');
 need(typeof baseCandidateText==='string'&&Buffer.byteLength(baseCandidateText)<=CALL_LIMITS.responseBytes&&hash(baseCandidateText)===reference.candidateTextHash,'REVISION_BASE_CHANGED');
 const candidate=parseCandidate(baseCandidateText,context);
 need(candidate.candidateHash===reference.candidateHash,'REVISION_BASE_CHANGED');
 need(Array.isArray(input.requirements)&&input.requirements.length<=21&&input.requirements.at(-1)?.id==='revision-'+reference.feedbackId,'REVISION_REQUIREMENTS_INVALID');
 need(Buffer.byteLength(JSON.stringify({input,context,previousCandidate:candidate}))<=CALL_LIMITS.promptBytes-40000,'REVISION_CONTEXT_TOO_LARGE');
 return candidate;
}
