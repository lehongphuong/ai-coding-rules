import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ignore from 'ignore';
import type { FileIndex } from '../types.js';
import { globToRegExp } from './glob.js';

export const DEFAULT_IGNORES = [
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.dart_tool',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  '.gradle',
  '.idea',
  'Pods',
  '.turbo',
  '.cache',
  '.claude/worktrees',
];

export const MAX_PATHS = 50_000;
export const MAX_FILE_BYTES = 1_000_000;

export interface FsFileIndexOptions {
  /** Extra gitignore-style patterns. */
  ignore?: string[];
}

abstract class BaseFileIndex implements FileIndex {
  readonly paths: readonly string[];
  private readonly set: Set<string>;
  private readonly dirs: Set<string>;
  private readonly cache = new Map<string, string | undefined>();

  constructor(
    readonly root: string,
    paths: string[],
  ) {
    this.paths = [...paths].sort();
    this.set = new Set(this.paths);
    this.dirs = new Set(['']);
    for (const p of this.paths) {
      let idx = p.lastIndexOf('/');
      while (idx > 0) {
        const d = p.slice(0, idx);
        if (this.dirs.has(d)) break;
        this.dirs.add(d);
        idx = d.lastIndexOf('/');
      }
    }
  }

  protected abstract load(path: string): string | undefined;

  has(path: string): boolean {
    return this.set.has(normalize(path));
  }

  hasDir(dir: string): boolean {
    return this.dirs.has(normalize(dir).replace(/\/$/, ''));
  }

  read(path: string): string | undefined {
    const p = normalize(path);
    if (!this.set.has(p)) return undefined;
    if (!this.cache.has(p)) this.cache.set(p, this.load(p));
    return this.cache.get(p);
  }

  readJson<T = unknown>(path: string): T | undefined {
    const text = this.read(path);
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  glob(pattern: string): string[] {
    const re = globToRegExp(normalize(pattern));
    return this.paths.filter((p) => re.test(p));
  }

  list(dir: string): string[] {
    const d = normalize(dir).replace(/\/$/, '');
    const prefix = d === '' ? '' : `${d}/`;
    const out = new Set<string>();
    for (const p of this.paths) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const name = rest.split('/')[0];
      if (name) out.add(name);
    }
    return [...out].sort();
  }
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

class FsFileIndex extends BaseFileIndex {
  protected load(path: string): string | undefined {
    try {
      const abs = join(this.root, path);
      if (statSync(abs).size > MAX_FILE_BYTES) return undefined;
      const buf = readFileSync(abs);
      if (buf.includes(0)) return undefined; // binary
      return buf.toString('utf8');
    } catch {
      return undefined;
    }
  }
}

class MemoryFileIndex extends BaseFileIndex {
  constructor(
    root: string,
    private readonly contents: Record<string, string>,
  ) {
    super(root, Object.keys(contents).map(normalize));
  }

  protected load(path: string): string | undefined {
    return this.contents[path];
  }
}

/** Walk `root` once, honouring .gitignore and DEFAULT_IGNORES. */
export function createFsFileIndex(root: string, options: FsFileIndexOptions = {}): FileIndex {
  const ig = ignore().add(DEFAULT_IGNORES).add(options.ignore ?? []);
  try {
    ig.add(readFileSync(join(root, '.gitignore'), 'utf8'));
  } catch {
    // no .gitignore
  }
  const paths: string[] = [];
  const walk = (rel: string): void => {
    if (paths.length >= MAX_PATHS) return;
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (ig.ignores(`${p}/`)) continue;
        walk(p);
      } else if (e.isFile()) {
        if (ig.ignores(p)) continue;
        paths.push(p);
        if (paths.length >= MAX_PATHS) return;
      }
    }
  };
  walk('');
  return new FsFileIndex(root, paths);
}

/** In-memory index for tests: `{ "package.json": "{...}" }`. */
export function createMemoryFileIndex(
  contents: Record<string, string>,
  root = '/virtual',
): FileIndex {
  return new MemoryFileIndex(root, contents);
}
