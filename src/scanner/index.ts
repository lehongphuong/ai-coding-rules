import type { Fact, FileIndex, ProjectFacts } from '../types.js';
import { createFsFileIndex, dedupeFacts } from '../core/index.js';
import { DETECTORS } from './detectors/index.js';
import { detectScripts } from './scripts.js';
import { detectWorkspaces } from './workspaces.js';
import { isRecord, readYaml } from './util.js';
import { parsePyproject } from './detectors/python.js';

export { DETECTORS } from './detectors/index.js';
export { detectScripts } from './scripts.js';
export { detectWorkspaces } from './workspaces.js';
export { parseJsonc } from './util.js';

export interface ScanOptions {
  /** Extra gitignore-style ignore patterns. */
  ignore?: string[];
}

/** Scan a directory on disk. */
export function scan(root: string, options: ScanOptions = {}): ProjectFacts {
  return scanFiles(createFsFileIndex(root, { ignore: options.ignore ?? [] }));
}

/** Scan an existing file index (used by tests and by `scan`). */
export function scanFiles(files: FileIndex): ProjectFacts {
  const { workspaces, facts: monorepoFacts } = detectWorkspaces(files);
  const raw: Fact[] = [...monorepoFacts];
  for (const ws of workspaces) {
    for (const d of DETECTORS) raw.push(...d.detect({ files, dir: ws.dir }));
  }
  const result: ProjectFacts = {
    root: files.root,
    name: workspaces[0]!.name,
    files,
    facts: dedupeFacts(raw),
    workspaces,
    scripts: detectScripts(files, workspaces),
  };
  const description = rootDescription(files);
  if (description) result.description = description;
  return result;
}

/** package.json → pubspec.yaml → composer.json → pyproject.toml description. */
function rootDescription(files: FileIndex): string | undefined {
  const candidates: unknown[] = [
    files.readJson<unknown>('package.json'),
    readYaml(files, 'pubspec.yaml'),
    files.readJson<unknown>('composer.json'),
  ];
  for (const c of candidates) {
    const d = isRecord(c) ? c.description : undefined;
    if (typeof d === 'string' && d.trim()) return d.trim();
  }
  const py = files.read('pyproject.toml');
  return py !== undefined ? parsePyproject(py, 'pyproject.toml').description : undefined;
}
