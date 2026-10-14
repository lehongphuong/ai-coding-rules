import type { FileIndex, ProjectFacts } from '../types.js';

export interface ScanOptions {
  /** Extra gitignore-style ignore patterns. */
  ignore?: string[];
}

/** Scan a directory on disk. (T1 — stub) */
export function scan(_root: string, _options: ScanOptions = {}): ProjectFacts {
  throw new Error('scan: not implemented');
}

/** Scan an existing file index (used by tests and by `scan`). (T1 — stub) */
export function scanFiles(_files: FileIndex): ProjectFacts {
  throw new Error('scanFiles: not implemented');
}
