import path from 'node:path';
import crypto from 'node:crypto';

// Source-data rules shared by offline catalog tools and the Node server.
// No filesystem reads, current working directory or import.meta.dirname.
export const LIMITS = Object.freeze({ packages: 200, files: 100, bytes: 10 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, depth: 6 });
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[%:#?\x00-\x1f]/.test(value) || path.posix.isAbsolute(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[<>"|*]/.test(part) || part.endsWith(' ') || part.endsWith('.'))) {
    throw new Error('UNSAFE_PATH');
  }
  return value;
}
