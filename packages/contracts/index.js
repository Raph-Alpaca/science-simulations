import Ajv from 'ajv';
import schema from './meta.schema.json' with { type: 'json' };
import {assertEducationEvidence} from './education-evidence.js';

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
export function assertMetadata(meta, folderId, config, sources) {
  if (!validate(meta)) {
    throw new Error(`META_SCHEMA: ${folderId}: ${validate.errors.map(e => `${e.instancePath} ${e.keyword}`).join(', ')}`);
  }
  if (meta.id !== folderId) throw new Error(`ID_FOLDER_MISMATCH: ${folderId}`);
  if (!config.units.some(u => u.grade === meta.grade && u.label === meta.unit)) throw new Error(`UNKNOWN_UNIT: ${folderId}`);
  if (meta.sourceIds.some(id => !sources.some(s => s.id === id))) throw new Error(`UNKNOWN_SOURCE: ${folderId}`);
}

export function assertPublicationEvidence(meta, approval) {
  // v1 retains its historical year binding. New revision-scoped approvals must
  // use v2 with explicit original-source evidence; a year is never invented.
  if (meta.stage !== 'ready' || !meta.curriculumRevision || (approval?.schemaVersion !== 2 && !meta.schoolYear)) throw new Error(`PUBLICATION_NOT_READY: ${meta.id}`);
  const sha = /^[a-f0-9]{64}$/;
  if (!approval || ![1,2].includes(approval.schemaVersion) || approval.contentId !== meta.id ||
      !sha.test(approval.candidateHash) || !sha.test(approval.artifactHash) ||
      !approval.approvalId || !Number.isFinite(Date.parse(approval.approvedAt))) throw new Error(`APPROVAL_INVALID: ${meta.id}`);
  const evidence = approval.evidenceVersion;
  if (!evidence || !sha.test(evidence.sourceSnapshotHash) || !sha.test(evidence.checksHash) ||
      !sha.test(evidence.lockHash) || !evidence.policyVersion ||
      !['curriculum','textbook','rights','science','learning','runtime'].every(key => evidence.checks?.[key] === 'pass')) {
    throw new Error(`EVIDENCE_MISSING: ${meta.id}`);
  }
  if(approval.schemaVersion===2){
    if(meta.schoolYear!==null)throw new Error(`PUBLICATION_SCOPE_MISMATCH: ${meta.id}`);
    assertEducationEvidence(approval.educationEvidence,evidence.educationHash,meta,approval);
  }
}
