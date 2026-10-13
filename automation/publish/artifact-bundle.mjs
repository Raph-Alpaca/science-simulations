import {isDeepStrictEqual} from 'node:util';
import {assertMetadata, assertPublicationEvidence} from '../../packages/contracts/index.js';
import {hash, LIMITS} from '../../packages/contracts/content-source.js';
import {prepareRuntimeBundle} from '../runner/runtime-envelope.mjs';
import {toCard} from '../catalog/card.mjs';
import {snapshotArtifactManifest} from './verify-artifact.mjs';

const PACKET_BYTES = Math.ceil(LIMITS.bytes / 3) * 4 + 100_000;
const need = (ok, code = 'RELEASE_ARTIFACT_INVALID') => { if (!ok) throw new Error(code); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const exact = (value, keys) => need(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(','));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const sorted = files => [...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const decode = file => Buffer.from(file.bytesBase64,'base64');
const jsonFile = (files, name) => {
  const file = files.find(f => f.path === name); need(file,'RELEASE_FILE_MISSING');
  try { return JSON.parse(decode(file).toString('utf8')); } catch { throw new Error('RELEASE_JSON_INVALID'); }
};

// Inert, bounded, portable storage of exact bytes, including non-text assets.
// Its hash is integrity, not authority. Caller must pin a trusted expected hash.
export function openArtifactBundle(text, expectedArtifactHash) {
  need(typeof text === 'string' && Buffer.byteLength(text) <= PACKET_BYTES && sha(expectedArtifactHash));
  let packet; try { packet = JSON.parse(text); } catch { throw new Error('RELEASE_ARTIFACT_INVALID'); }
  exact(packet,['schemaVersion','artifactHash','files']);
  need(packet.schemaVersion === 1 && packet.artifactHash === expectedArtifactHash && Array.isArray(packet.files) &&
    packet.files.length > 0 && packet.files.length <= LIMITS.files);
  let bytes = 0;
  const manifest = packet.files.map(file => {
    exact(file,['path','bytesBase64']);
    need(typeof file.bytesBase64 === 'string' && file.bytesBase64.length <= Math.ceil(LIMITS.fileBytes/3)*4);
    const body = decode(file);
    need(body.toString('base64') === file.bytesBase64 && body.length <= LIMITS.fileBytes);
    bytes += body.length; need(bytes <= LIMITS.bytes,'RELEASE_ARTIFACT_SIZE_LIMIT');
    return {path:file.path,hash:hash(body)};
  });
  snapshotArtifactManifest(manifest,expectedArtifactHash);
  return freeze({...packet,manifest,bytes});
}

export function encodeArtifactBundle(files) {
  const ordered = sorted(files);
  const manifest = ordered.map(file => ({path:file.path,hash:hash(decode(file))}));
  const artifactHash = hash(JSON.stringify(manifest));
  const artifactText = JSON.stringify({schemaVersion:1,artifactHash,files:ordered});
  openArtifactBundle(artifactText,artifactHash);
  return {artifactText,artifactHash};
}

function inspectCatalog(bundle, config) {
  const catalog = jsonFile(bundle.files,'catalog.json');
  exact(catalog,['schemaVersion','basePath','grades','units','cards']);
  need(catalog.schemaVersion === 1 && catalog.basePath === '/science-simulations/' &&
    catalog.basePath === config.basePath && isDeepStrictEqual(catalog.grades,config.grades) &&
    isDeepStrictEqual(catalog.units,config.units) && Array.isArray(catalog.cards) && catalog.cards.length <= LIMITS.packages,'RELEASE_CATALOG_CHANGED');
  const ids = new Set(), paths = new Set(bundle.files.map(f => f.path));
  for (const card of catalog.cards) {
    need(card && typeof card.id === 'string' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(card.id) && !ids.has(card.id),'RELEASE_CATALOG_INVALID');
    const meta = jsonFile(bundle.files,'simulations/'+card.id+'/meta.json');
    // Source authority is supplied separately by the release registry; this is
    // schema/URL coherence of an already trusted base, not original-source review.
    try { assertMetadata(meta,card.id,config,(meta.sourceIds || []).map(id => ({id}))); } catch { need(false,'RELEASE_CATALOG_INVALID'); }
    need(isDeepStrictEqual(card,toCard({meta},catalog.basePath)) && paths.has('simulations/'+card.id+'/'+meta.entry),'RELEASE_CATALOG_INVALID');
    ids.add(card.id);
  }
  for (const file of bundle.files) {
    if (file.path.startsWith('simulations/')) need(ids.has(file.path.split('/')[1]),'RELEASE_ORPHAN_CONTENT');
    else need(['index.html','catalog.json'].includes(file.path) || file.path.startsWith('assets/'),'RELEASE_UNEXPECTED_FILE');
  }
  return catalog;
}

// No model code, toolchain rebuild, network or publishing occurs here. A full
// catalog snapshot retains every unrelated public file and existing card order.
export function prepareCatalogRelease({jobId, baseArtifactText, expectedBaseArtifactHash, packet, config}) {
  need(uuid(jobId),'RELEASE_JOB_INVALID');
  const base = openArtifactBundle(baseArtifactText,expectedBaseArtifactHash);
  const catalog = inspectCatalog(base,config), runtime = prepareRuntimeBundle(packet);
  const {candidate} = runtime;
  try { assertMetadata(candidate.meta,candidate.contentId,config,candidate.meta.sourceIds.map(id => ({id}))); }
  catch { need(false,'RELEASE_CATALOG_INVALID'); }
  const prefix = 'simulations/'+candidate.contentId+'/';
  const previous = catalog.cards.find(card => card.id === candidate.contentId);
  // Preserve stable public URLs. Entry-point moves need an explicit migration.
  if (previous) need(previous.href === catalog.basePath+prefix+candidate.meta.entry,'RELEASE_ENTRY_CHANGED');
  const card = toCard(candidate,catalog.basePath);
  const cards = previous ? catalog.cards.map(old => old.id === card.id ? card : old) : [...catalog.cards,card];
  const files = base.files.filter(file => file.path !== 'catalog.json' && !file.path.startsWith(prefix)).map(file => ({...file}));
  files.push({path:'catalog.json',bytesBase64:Buffer.from(JSON.stringify({...catalog,cards})).toString('base64')});
  for (const file of candidate.files) files.push({path:prefix+file.path,bytesBase64:Buffer.from(file.content).toString('base64')});
  const artifact = encodeArtifactBundle(files);
  const proposal = {schemaVersion:1,jobId,contentId:candidate.contentId,candidateHash:candidate.candidateHash,
    sourceSnapshotHash:runtime.sourceSnapshotHash,baselineSha:runtime.baselineSha,attempt:runtime.attempt,
    baseArtifactHash:expectedBaseArtifactHash,artifactHash:artifact.artifactHash,entry:candidate.meta.entry};
  const proposalText = JSON.stringify(proposal);
  return freeze({...artifact,proposalText,proposalHash:hash(proposalText)});
}

// A release service must obtain approval/current from its authenticated stores,
// never from candidate files or a request body. This does not issue approval.
export function assertCatalogReleaseApproval({artifactText,proposalText,proposalHash,approval,current}) {
  need(typeof proposalText === 'string' && Buffer.byteLength(proposalText) <= 4000 && sha(proposalHash) && hash(proposalText) === proposalHash,'RELEASE_PROPOSAL_CHANGED');
  let p; try { p = JSON.parse(proposalText); } catch { need(false); }
  exact(p,['schemaVersion','jobId','contentId','candidateHash','sourceSnapshotHash','baselineSha','attempt','baseArtifactHash','artifactHash','entry']);
  need(p.schemaVersion === 1 && uuid(p.jobId) && ['candidateHash','sourceSnapshotHash','baseArtifactHash','artifactHash'].every(key => sha(p[key])) &&
    /^[a-f0-9]{40}$/.test(p.baselineSha) && Number.isInteger(p.attempt) && p.attempt >= 0 && p.attempt <= 2);
  need(current && uuid(current.ownerId) && approval?.schemaVersion === 2 && approval.proposalHash === proposalHash &&
    approval.actorType === 'teacher' && approval.decision === 'approve' && approval.invalidatedAt === null &&
    approval.approverId === current.ownerId && Date.parse(approval.approvedAt) <= Date.now(),'RELEASE_APPROVAL_REQUIRED');
  for (const key of ['jobId','contentId','candidateHash','sourceSnapshotHash','baselineSha','attempt','baseArtifactHash'])
    need(p[key] === current[key],'RELEASE_CONTEXT_CHANGED');
  need(approval.jobId === p.jobId && approval.contentId === p.contentId && approval.candidateHash === p.candidateHash && approval.artifactHash === p.artifactHash,'RELEASE_APPROVAL_CHANGED');
  const bundle = openArtifactBundle(artifactText,p.artifactHash), prefix = 'simulations/'+p.contentId+'/';
  const manifest = bundle.manifest.filter(file => file.path.startsWith(prefix)).map(file => ({path:file.path.slice(prefix.length),hash:file.hash}));
  need(hash(JSON.stringify(manifest)) === p.candidateHash,'RELEASE_CANDIDATE_CHANGED');
  const meta = jsonFile(bundle.files,prefix+'meta.json');
  need(meta.entry === p.entry && bundle.manifest.some(file => file.path === prefix+p.entry),'RELEASE_ENTRY_CHANGED');
  assertPublicationEvidence(meta,approval);
  for (const key of ['sourceSnapshotHash','checksHash','lockHash','educationHash','policyVersion'])
    need(approval.evidenceVersion[key] === current[key],'RELEASE_EVIDENCE_CHANGED');
  return freeze({proposalHash,artifactHash:p.artifactHash,candidateHash:p.candidateHash,
    approvalId:approval.approvalId,contentId:p.contentId,publicPath:'/science-simulations/'+prefix+p.entry});
}
