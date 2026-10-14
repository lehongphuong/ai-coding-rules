import type { Evidence, Fact, FileIndex, Workspace } from '../types.js';
import { globToRegExp, joinPath } from '../core/index.js';
import { baseName, dirName, ev, fact, isRecord, lineOf, readYaml } from './util.js';
import { parsePyproject } from './detectors/python.js';

/** Files that make a directory a workspace. */
export const MANIFESTS = [
  'package.json',
  'pubspec.yaml',
  'composer.json',
  'pyproject.toml',
  'go.mod',
];

/** Max depth (in path segments) for manifest discovery without a monorepo tool. */
const FALLBACK_DEPTH = 2;

interface MonorepoInfo {
  facts: Fact[];
  /** Workspace globs; negations start with "!". */
  patterns: string[];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function npmWorkspaces(files: FileIndex): string[] {
  const pkg = files.readJson<unknown>('package.json');
  if (!isRecord(pkg)) return [];
  const ws = pkg.workspaces;
  return Array.isArray(ws) ? strings(ws) : isRecord(ws) ? strings(ws.packages) : [];
}

/** go.work `use` directives (single-line or block form). */
export function goWorkUses(text: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (inBlock) {
      if (line === ')') inBlock = false;
      else if (line) out.push(line);
    } else if (/^use\s*\($/.test(line)) {
      inBlock = true;
    } else {
      const m = /^use\s+(\S+)/.exec(line);
      if (m) out.push(m[1]!);
    }
  }
  return out;
}

/** Monorepo tool facts and workspace globs from root config files. */
function detectMonorepo(files: FileIndex): MonorepoInfo {
  const facts: Fact[] = [];
  const patterns: string[] = [];
  const add = (value: string, evidence: Evidence[], globs: string[] = []): void => {
    facts.push(fact('monorepo', value, '', evidence, 1));
    patterns.push(...globs);
  };

  if (files.has('pnpm-workspace.yaml')) {
    add(
      'pnpm-workspaces',
      [ev('pnpm-workspace.yaml', '#packages')],
      strings(readYaml(files, 'pnpm-workspace.yaml')?.packages),
    );
  }
  const npmWs = npmWorkspaces(files);
  if (npmWs.length) {
    const tool = files.has('yarn.lock') ? 'yarn-workspaces' : 'npm-workspaces';
    add(tool, [ev('package.json', '#workspaces')], npmWs);
  }
  if (files.has('turbo.json')) add('turborepo', [ev('turbo.json')]);
  if (files.has('nx.json')) add('nx', [ev('nx.json')]);
  if (files.has('lerna.json')) {
    const lerna = files.readJson<Record<string, unknown>>('lerna.json');
    const globs = strings(lerna?.packages);
    add('lerna', [ev('lerna.json')], globs.length ? globs : ['packages/*']);
  }
  if (files.has('melos.yaml')) {
    add('melos', [ev('melos.yaml', '#packages')], strings(readYaml(files, 'melos.yaml')?.packages));
  }
  const goWork = files.read('go.work');
  if (goWork !== undefined)
    add('go-work', [ev('go.work', '#use', lineOf(goWork, /^use\b/))], goWorkUses(goWork));
  return { facts, patterns: patterns.map(normalizePattern).filter((p) => p !== '' && p !== '!') };
}

function normalizePattern(p: string): string {
  const neg = p.startsWith('!');
  const body = (neg ? p.slice(1) : p).trim().replace(/^\.\//, '').replace(/\/+$/, '');
  return (neg ? '!' : '') + (body === '.' ? '' : body);
}

/** Dirs (other than root) containing a manifest. */
function manifestDirs(files: FileIndex): string[] {
  const dirs = new Set<string>();
  for (const p of files.paths) {
    const name = baseName(p);
    if (!MANIFESTS.includes(name)) continue;
    const d = dirName(p);
    if (d) dirs.add(d);
  }
  return [...dirs];
}

/** Expand workspace globs (with `!` negations) against manifest dirs. */
export function expandPatterns(patterns: readonly string[], dirs: readonly string[]): string[] {
  const pos = patterns.filter((p) => !p.startsWith('!')).map((p) => globToRegExp(p));
  const neg = patterns.filter((p) => p.startsWith('!')).map((p) => globToRegExp(p.slice(1)));
  return dirs.filter((d) => pos.some((re) => re.test(d)) && !neg.some((re) => re.test(d)));
}

/** Display name for a workspace dir from its manifests. */
export function workspaceName(files: FileIndex, dir: string): string | undefined {
  const pkgName = files.readJson<Record<string, unknown>>(joinPath(dir, 'package.json'))?.name;
  if (typeof pkgName === 'string' && pkgName) return pkgName;
  const pubName = readYaml(files, joinPath(dir, 'pubspec.yaml'))?.name;
  if (typeof pubName === 'string' && pubName) return pubName;
  const composerName = files.readJson<Record<string, unknown>>(
    joinPath(dir, 'composer.json'),
  )?.name;
  if (typeof composerName === 'string' && composerName) return composerName;
  const py = files.read(joinPath(dir, 'pyproject.toml'));
  const pyName = py !== undefined ? parsePyproject(py, '').name : undefined;
  if (pyName) return pyName;
  return undefined;
}

function manifestOf(files: FileIndex, dir: string): string | undefined {
  return MANIFESTS.map((m) => joinPath(dir, m)).find((p) => files.has(p));
}

function makeWorkspace(files: FileIndex, dir: string, fallbackName: string): Workspace {
  const ws: Workspace = { dir, name: workspaceName(files, dir) ?? fallbackName };
  const manifest = manifestOf(files, dir);
  if (manifest) ws.manifest = manifest;
  return ws;
}

/** Workspaces (root first, then sorted by dir) and monorepo facts (SPEC §2.3). */
export function detectWorkspaces(files: FileIndex): { workspaces: Workspace[]; facts: Fact[] } {
  const { facts, patterns } = detectMonorepo(files);
  const candidates = manifestDirs(files);
  const dirs = patterns.some((p) => !p.startsWith('!'))
    ? expandPatterns(patterns, candidates)
    : candidates.filter((d) => d.split('/').length <= FALLBACK_DEPTH);
  const root = makeWorkspace(files, '', baseName(files.root));
  const children = [...new Set(dirs)].sort().map((d) => makeWorkspace(files, d, baseName(d)));
  return { workspaces: [root, ...children], facts };
}
