import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'parse5';
import { assertMetadata, assertPublicationEvidence } from '@science/contracts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const LIMITS = Object.freeze({ packages: 200, files: 100, bytes: 10 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, depth: 6 });
const extensions = new Set(['.html','.css','.js','.json','.svg','.png','.jpg','.jpeg','.webp','.woff2']);
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

export function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[%:#?\x00-\x1f]/.test(value) || path.posix.isAbsolute(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[<>"|*]/.test(part) || part.endsWith(' ') || part.endsWith('.'))) {
    throw new Error('UNSAFE_PATH');
  }
  return value;
}

export async function assertNoLinks(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!await exists(cursor)) break;
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error('LINK_NOT_ALLOWED');
    if (path.resolve(await fs.realpath(cursor)).toLowerCase() !== cursor.toLowerCase()) throw new Error('REALPATH_MISMATCH');
  }
}

export async function fileManifest(directory) {
  await assertNoLinks(directory);
  const files = [];
  let total = 0;
  async function walk(current, depth) {
    if (depth > LIMITS.depth) throw new Error('DEPTH_LIMIT');
    for (const name of (await fs.readdir(current)).sort()) {
      const full = path.join(current, name);
      const relative = path.relative(directory, full).split(path.sep).join('/');
      relativeFile(relative);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error('LINK_NOT_ALLOWED');
      if (stat.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!stat.isFile() || !extensions.has(path.extname(name).toLowerCase())) throw new Error('FILE_TYPE_NOT_ALLOWED');
      total += stat.size;
      if (stat.size > LIMITS.fileBytes || total > LIMITS.bytes || files.length >= LIMITS.files) throw new Error('CONTENT_SIZE_LIMIT');
      files.push({ path: relative, hash: hash(await fs.readFile(full)) });
    }
  }
  await walk(directory, 0);
  return files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function nodes(tree) {
  return [tree, ...(tree.childNodes || []).flatMap(nodes), ...(tree.content ? nodes(tree.content) : [])];
}
async function checkLinks(directory, manifest) {
  const names = new Set(manifest.map(f => f.path));
  const documents = new Map();
  for (const file of manifest.filter(f => ['.html','.svg'].includes(path.extname(f.path)))) {
    documents.set(file.path, nodes(parse(await fs.readFile(path.join(directory, file.path), 'utf8'))));
  }
  function check(value, from, navigation = false) {
    if (navigation && /^https:\/\//i.test(value)) return;
    const [raw, fragment] = value.split('#');
    const clean = raw.split('?')[0];
    let decoded;
    try { decoded = decodeURIComponent(clean); } catch { throw new Error('UNSAFE_LINK'); }
    if (decoded && (decoded.startsWith('/') || decoded.includes('\\') || /[:%\x00-\x1f]/.test(decoded))) throw new Error('UNSAFE_LINK');
    const resolved = decoded ? path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded)) : from;
    relativeFile(resolved);
    if (!names.has(resolved)) throw new Error(`BROKEN_LINK: ${from}`);
    if (fragment && documents.has(resolved) && !documents.get(resolved).some(node => node.attrs?.some(a => a.name === 'id' && a.value === decodeURIComponent(fragment)))) throw new Error(`BROKEN_FRAGMENT: ${from}`);
  }
  for (const [from, tree] of documents) for (const node of tree) {
    if (['base','iframe','object','embed'].includes(node.tagName)) throw new Error(`UNSUPPORTED_EMBED: ${from}`);
    for (const attr of node.attrs || []) {
      if (['srcset','style'].includes(attr.name)) throw new Error(`INLINE_RESOURCE_NOT_SUPPORTED: ${from}`);
      if (['src','href','poster','xlink:href'].includes(attr.name)) check(attr.value, from, node.tagName === 'a');
    }
    if (node.tagName === 'meta' && node.attrs?.some(a => a.name === 'http-equiv' && a.value.toLowerCase() === 'refresh')) throw new Error('META_REFRESH_NOT_ALLOWED');
  }
  for (const file of manifest.filter(f => ['.css','.js'].includes(path.extname(f.path)))) {
    const text = await fs.readFile(path.join(directory, file.path), 'utf8');
    const patterns = file.path.endsWith('.css')
      ? [/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g, /@import\s+['"]([^'"]+)['"]/g]
      : [/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g];
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) check(match[1], file.path);
  }
}

export async function readPackages(directory, config, sources) {
  if (!await exists(directory)) return [];
  await assertNoLinks(directory);
  const entries = (await fs.readdir(directory)).sort();
  if (entries.length > LIMITS.packages) throw new Error('PACKAGE_LIMIT');
  const ids = new Set();
  const packages = [];
  for (const id of entries) {
    if (ids.has(id.toLowerCase())) throw new Error('DUPLICATE_ID');
    ids.add(id.toLowerCase());
    relativeFile(id);
    const folder = path.join(directory, id);
    const stat = await fs.lstat(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('CONTENT_DIRECTORY_REQUIRED');
    const manifest = await fileManifest(folder);
    if (!manifest.some(f => f.path === 'meta.json')) throw new Error(`MISSING_META: ${id}`);
    const meta = await readJSON(path.join(folder, 'meta.json'));
    assertMetadata(meta, id, config, sources);
    relativeFile(meta.entry);
    if (!meta.entry.endsWith('.html') || !manifest.some(f => f.path === meta.entry)) throw new Error(`MISSING_ENTRY: ${id}`);
    await checkLinks(folder, manifest);
    packages.push({ meta, folder, manifest, candidateHash: hash(JSON.stringify(manifest)) });
  }
  return packages;
}

/** approvals must come from a trusted caller, never from content metadata. */
export function selectApproved(packages, approvals, evidence) {
  const seen = new Set();
  for (const approval of approvals) {
    if (seen.has(approval.contentId)) throw new Error('DUPLICATE_APPROVAL');
    seen.add(approval.contentId);
    if (!packages.some(p => p.meta.id === approval.contentId)) throw new Error('ORPHAN_APPROVAL');
  }
  return packages.filter(p => {
    const approval = approvals.find(a => a.contentId === p.meta.id);
    if (!approval) return false;
    assertPublicationEvidence(p.meta, approval);
    if (p.candidateHash !== approval.candidateHash) throw new Error('CANDIDATE_HASH_MISMATCH');
    for (const key of ['sourceSnapshotHash','checksHash','lockHash','policyVersion']) {
      if (approval.evidenceVersion[key] !== evidence[key]) throw new Error('EVIDENCE_VERSION_MISMATCH');
    }
    return true;
  });
}

export async function productionInputs() {
  const config = await readJSON(path.join(ROOT, 'config/catalog.json'));
  if (config.schemaVersion !== 1 || !/^\/[a-z0-9-]+\/$/.test(config.basePath)) throw new Error('CONFIG_INVALID');
  const sources = await readJSON(path.join(ROOT, 'references/source_index.json'));
  const packages = await readPackages(path.join(ROOT, 'content/simulations'), config, sources.sources);
  const approvalFile = path.join(ROOT, 'automation/publish/approved-content.json');
  // Stage 02 has no trusted main, approval issuer, or deploy authority. Fail closed.
  // Do not treat a newly written local approval file as a trusted public release.
  if (await exists(approvalFile)) {
    await assertNoLinks(approvalFile);
    const list = await readJSON(approvalFile);
    if (!Array.isArray(list) || list.length) throw new Error('TRUSTED_APPROVAL_SOURCE_NOT_CONFIGURED');
  }
  return { config, packages, selected: [], approvals: [] };
}

export function verifyArtifactHash(approvals, artifactHash) {
  if (approvals.some(a => a.artifactHash !== artifactHash)) throw new Error('ARTIFACT_HASH_MISMATCH');
}
