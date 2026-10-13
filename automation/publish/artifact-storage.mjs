// Trusted local filesystem adapter. Never imported by the web approval service.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash,LIMITS} from '../../packages/contracts/content-source.js';
import {ROOT,fileManifest,assertNoLinks} from '../catalog/content.mjs';
import {openArtifactBundle,encodeArtifactBundle} from './artifact-bundle.mjs';
const PACKET_BYTES=Math.ceil(LIMITS.bytes/3)*4+100_000;
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const decode=file=>Buffer.from(file.bytesBase64,'base64');

export async function captureArtifactBundle(directory) {
  const manifest = await fileManifest(directory), files = [];
  for (const file of manifest) {
    await assertNoLinks(path.join(directory,file.path));
    const body = await fs.readFile(path.join(directory,file.path));
    need(hash(body) === file.hash,'RELEASE_SOURCE_CHANGED');
    files.push({path:file.path,bytesBase64:body.toString('base64')});
  }
  const artifact = encodeArtifactBundle(files);
  need(artifact.artifactHash === hash(JSON.stringify(manifest)),'RELEASE_SOURCE_CHANGED');
  return artifact;
}

// Local preparation only, under an ignored root and a fresh random directory.
// The deploy adapter must upload site/ itself without rebuilding or adding files.
export async function stageArtifactBundle({artifactText,expectedArtifactHash}) {
  const bundle = openArtifactBundle(artifactText,expectedArtifactHash);
  const root = path.join(ROOT,'.local/release-artifacts');
  await assertNoLinks(root); await fs.mkdir(root,{recursive:true,mode:0o700});
  const directory = path.join(root,randomUUID());
  await fs.mkdir(directory,{mode:0o700}); await fs.mkdir(path.join(directory,'site'),{mode:0o700});
  try {
    for (const file of bundle.files) {
      const target = path.join(directory,'site',...file.path.split('/'));
      await assertNoLinks(target); await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
      await fs.writeFile(target,decode(file),{flag:'wx',mode:0o600});
    }
    const manifest = await fileManifest(path.join(directory,'site'));
    need(hash(JSON.stringify(manifest)) === expectedArtifactHash,'RELEASE_STAGED_BYTES_CHANGED');
    await fs.writeFile(path.join(directory,'bundle.json'),artifactText,{flag:'wx'});
    await fs.writeFile(path.join(directory,'receipt.json'),JSON.stringify({schemaVersion:1,artifactHash:expectedArtifactHash,manifest}),{flag:'wx'});
    return {directory,site:path.join(directory,'site'),artifactHash:expectedArtifactHash};
  } catch (error) {
    // Keep incomplete private output as evidence; never reuse it for deployment.
    await fs.writeFile(path.join(directory,'INCOMPLETE'),String(error.code || 'RELEASE_STAGE_FAILED'),{flag:'wx'}).catch(()=>{});
    throw new Error('RELEASE_STAGE_FAILED');
  }
}

// Recheck a saved stage immediately before a future same-byte upload. An old
// receipt cannot authorize files changed after preparation or an extra file.
export async function assertStagedArtifact(directory, expectedArtifactHash) {
  const resolved = path.resolve(directory), root = path.join(ROOT,'.local/release-artifacts');
  need(path.dirname(resolved) === root && uuid(path.basename(resolved)),'RELEASE_STAGE_PATH_REJECTED');
  await assertNoLinks(resolved);
  const bundleFile = path.join(resolved,'bundle.json');
  await assertNoLinks(bundleFile);
  need((await fs.stat(bundleFile)).size <= PACKET_BYTES,'RELEASE_ARTIFACT_SIZE_LIMIT');
  openArtifactBundle(await fs.readFile(bundleFile,'utf8'),expectedArtifactHash);
  try { await fs.stat(path.join(resolved,'INCOMPLETE')); throw new Error('RELEASE_STAGE_INCOMPLETE'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const site = path.join(resolved,'site'), manifest = await fileManifest(site);
  need(hash(JSON.stringify(manifest)) === expectedArtifactHash,'RELEASE_STAGED_BYTES_CHANGED');
  return {site,artifactHash:expectedArtifactHash,manifest};
}
