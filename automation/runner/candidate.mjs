import path from 'node:path';
import {assertMetadata} from '@science/contracts';
import {hash, LIMITS, relativeFile} from '../../packages/contracts/content-source.js';
import {RunnerError, CALL_LIMITS} from './bounded-responses.mjs';

const need = (condition, code) => { if (!condition) throw new RunnerError(code); };
const contentIdPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const textExtensions = new Set(['.html', '.css', '.js', '.json', '.svg']);
const forbidden = /^(?:agents\.md|package(?:-lock)?\.json|npm-shrinkwrap\.json|tsconfig(?:\..+)?\.json|jsconfig\.json|(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?)$/i;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// Validate inert UTF-8 source only. This does NOT execute, approve or publish it.
// The caller supplies the trusted job identity/catalog/source set, not the model.
// Source bytes remain in memory; a separate credential-free sandbox must inspect
// links, code behavior and the actual 2D/3D experience before review/publication.
export function parseCandidate(text, {contentId, grade, unit, schoolYear, curriculumRevision, config, sources}) {
  need(typeof contentId === 'string' && contentId.length <= 64 && contentIdPattern.test(contentId), 'CANDIDATE_ID_INVALID');
  need(typeof text === 'string' && Buffer.byteLength(text) <= CALL_LIMITS.responseBytes, 'CANDIDATE_SIZE_LIMIT');
  let decoded;
  try { decoded = JSON.parse(text); } catch { throw new RunnerError('CANDIDATE_JSON_INVALID'); }
  need(decoded && !Array.isArray(decoded) && Object.keys(decoded).length === 1 && Array.isArray(decoded.files), 'CANDIDATE_FORMAT_INVALID');
  need(decoded.files.length > 0 && decoded.files.length <= LIMITS.files, 'CANDIDATE_FILE_LIMIT');
  const names = new Set(); let bytes = 0;
  const files = decoded.files.map(file => {
    need(file && typeof file === 'object' && Object.keys(file).sort().join(',') === 'content,path' &&
      typeof file.path === 'string' && typeof file.content === 'string', 'CANDIDATE_FILE_INVALID');
    try { relativeFile(file.path); } catch { throw new RunnerError('CANDIDATE_PATH_REJECTED'); }
    const parts = file.path.split('/');
    need(file.path.length <= 200 && parts.length <= LIMITS.depth + 1 &&
      parts.every(p => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && !forbidden.test(p)) &&
      textExtensions.has(path.posix.extname(file.path)), 'CANDIDATE_PATH_REJECTED');
    need(!names.has(file.path.toLowerCase()), 'CANDIDATE_PATH_COLLISION');
    names.add(file.path.toLowerCase());
    // Do not accept alternate package/config files disguised as data JSON.
    need(!file.path.endsWith('.json') || file.path === 'meta.json' ||
      /^data\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(file.path), 'CANDIDATE_JSON_PATH_REJECTED');
    const size = Buffer.byteLength(file.content); bytes += size;
    need(size <= LIMITS.fileBytes && bytes <= LIMITS.bytes && !file.content.includes('\u0000'), 'CANDIDATE_SIZE_LIMIT');
    return {path:file.path, content:file.content};
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) need(!names.has(parts.slice(0, i).join('/')), 'CANDIDATE_PATH_COLLISION');
  }
  let meta;
  try { meta = JSON.parse(files.find(f => f.path === 'meta.json')?.content); }
  catch { throw new RunnerError('CANDIDATE_META_INVALID'); }
  try { assertMetadata(meta, contentId, config, sources); }
  catch { throw new RunnerError('CANDIDATE_META_INVALID'); }
  need(meta.grade === grade && meta.unit === unit && meta.schoolYear === schoolYear &&
    meta.curriculumRevision === curriculumRevision, 'CANDIDATE_REQUIREMENTS_CHANGED');
  need(['draft', 'in_review'].includes(meta.stage), 'CANDIDATE_SELF_APPROVAL_REJECTED');
  need(meta.entry.endsWith('.html') && files.some(f => f.path === meta.entry), 'CANDIDATE_ENTRY_MISSING');
  const manifest = files.map(file => ({path:file.path, hash:hash(file.content)}));
  return freeze({contentId, meta, files, manifest, candidateHash:hash(JSON.stringify(manifest)), bytes});
}
