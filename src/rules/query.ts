import { joinPath } from '../core/facts.js';
import type {
  CommandKind,
  Evidence,
  Fact,
  FactKey,
  FactValue,
  FileIndex,
  ProjectFacts,
  Workspace,
} from '../types.js';

/** Keys a child scope inherits from the root scope (SPEC §3.2). */
export const INHERITED_KEYS: readonly FactKey[] = ['packageManager', 'ci', 'monorepo', 'indent'];

/** Order in which command kinds are listed. */
export const COMMAND_KIND_ORDER: readonly CommandKind[] = [
  'install',
  'dev',
  'build',
  'test',
  'e2e',
  'lint',
  'format',
  'typecheck',
  'migrate',
  'codegen',
];

/** Read-only view of the facts of one workspace scope. */
export interface FactQuery {
  readonly scope: string;
  readonly isRoot: boolean;
  readonly files: FileIndex;
  readonly project: ProjectFacts;
  /** True if a fact with `key` (and `value`, when given) exists in scope. */
  has(key: FactKey, value?: FactValue): boolean;
  /** Distinct values for `key`, highest confidence first. */
  values(key: FactKey): string[];
  /** Highest-confidence fact for `key`. */
  best(key: FactKey): Fact | undefined;
  /** Every fact for `key`, highest confidence first. */
  all(key: FactKey): Fact[];
  /** Command facts, optionally filtered by kind, in kind order. */
  commands(kind?: CommandKind): Fact[];
  /** First command string of `kind`, if any. */
  command(kind: CommandKind): string | undefined;
  /** Evidence of every fact for `key` (and `value`), deduplicated. */
  evidence(key: FactKey, value?: FactValue): Evidence[];
  /** Repo-relative path for a scope-relative path. */
  path(rel: string): string;
  /** `[{ file }]` if the scope-relative file exists, else `[]`. */
  fileEvidence(...rels: string[]): Evidence[];
  /** Evidence that a dependency is declared in the scope's manifest, if any. */
  dependency(name: string): Evidence | undefined;
  /** Query for another workspace of the same project. */
  scoped(dir: string): FactQuery;
  readonly workspaces: readonly Workspace[];
}

export function createFactQuery(project: ProjectFacts, scope = ''): FactQuery {
  return new ScopedQuery(project, scope);
}

const same = (a: FactValue, b: FactValue): boolean => String(a) === String(b);

class ScopedQuery implements FactQuery {
  readonly isRoot: boolean;
  private readonly cache = new Map<FactKey, Fact[]>();

  constructor(
    readonly project: ProjectFacts,
    readonly scope: string,
  ) {
    this.isRoot = scope === '';
  }

  get files(): FileIndex {
    return this.project.files;
  }

  get workspaces(): readonly Workspace[] {
    return this.project.workspaces;
  }

  all(key: FactKey): Fact[] {
    let out = this.cache.get(key);
    if (out) return out;
    const own = this.project.facts.filter((f) => f.key === key && f.scope === this.scope);
    out = own;
    if (!this.isRoot && INHERITED_KEYS.includes(key)) {
      const root = this.project.facts.filter((f) => f.key === key && f.scope === '');
      // A weak child guess (e.g. "npm" by default) yields to the root's facts.
      const strongOwn = own.some((f) => f.confidence >= 0.9);
      if (root.length > 0 && !strongOwn) out = root;
    }
    out = stableByConfidence(out);
    this.cache.set(key, out);
    return out;
  }

  has(key: FactKey, value?: FactValue): boolean {
    return this.all(key).some((f) => value === undefined || same(f.value, value));
  }

  values(key: FactKey): string[] {
    return [...new Set(this.all(key).map((f) => String(f.value)))];
  }

  best(key: FactKey): Fact | undefined {
    return this.all(key)[0];
  }

  commands(kind?: CommandKind): Fact[] {
    const rank = (f: Fact): number => {
      const i = COMMAND_KIND_ORDER.indexOf(f.meta?.kind as CommandKind);
      return i === -1 ? COMMAND_KIND_ORDER.length : i;
    };
    const cmds = this.project.facts.filter(
      (f) => f.key === 'command' && f.scope === this.scope && (!kind || f.meta?.kind === kind),
    );
    return cmds
      .map((f, i) => ({ f, i }))
      .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
      .map((x) => x.f);
  }

  command(kind: CommandKind): string | undefined {
    const c = this.commands(kind)[0];
    return c ? String(c.value) : undefined;
  }

  evidence(key: FactKey, value?: FactValue): Evidence[] {
    const facts = this.all(key).filter((f) => value === undefined || same(f.value, value));
    return dedupeEvidence(facts.flatMap((f) => f.evidence));
  }

  path(rel: string): string {
    return joinPath(this.scope, rel);
  }

  fileEvidence(...rels: string[]): Evidence[] {
    return rels.filter((r) => this.files.has(this.path(r))).map((r) => ({ file: this.path(r) }));
  }

  dependency(name: string): Evidence | undefined {
    return findDependency(this.files, this.scope, name);
  }

  scoped(dir: string): FactQuery {
    return dir === this.scope ? this : new ScopedQuery(this.project, dir);
  }
}

function stableByConfidence(facts: Fact[]): Fact[] {
  return facts
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.confidence - a.f.confidence || a.i - b.i)
    .map((x) => x.f);
}

export function dedupeEvidence(list: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of list) {
    const k = `${e.file}\u0000${e.pointer ?? ''}\u0000${e.line ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

type DepMap = Record<string, unknown> | undefined;

/** Look up `name` in package.json, composer.json or pubspec.yaml of `scope`. */
function findDependency(files: FileIndex, scope: string, name: string): Evidence | undefined {
  const pkgPath = joinPath(scope, 'package.json');
  const pkg = files.readJson<Record<string, DepMap>>(pkgPath);
  if (pkg) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg[field];
      if (deps && typeof deps === 'object' && name in deps) {
        return { file: pkgPath, pointer: `#${field}.${name}` };
      }
    }
  }
  const composerPath = joinPath(scope, 'composer.json');
  const composer = files.readJson<Record<string, DepMap>>(composerPath);
  if (composer) {
    for (const field of ['require', 'require-dev']) {
      const deps = composer[field];
      if (deps && typeof deps === 'object' && name in deps) {
        return { file: composerPath, pointer: `#${field}.${name}` };
      }
    }
  }
  const pubspecPath = joinPath(scope, 'pubspec.yaml');
  const pubspec = files.read(pubspecPath);
  if (pubspec) {
    const lines = pubspec.split(/\r?\n/);
    let section = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const top = /^([\w-]+):/.exec(line);
      if (top) {
        section = top[1]!;
        continue;
      }
      if (!/^(dev_)?dependencies$/.test(section)) continue;
      const m = /^\s+([\w-]+)\s*:/.exec(line);
      if (m && m[1] === name) {
        return { file: pubspecPath, pointer: `#${section}.${name}`, line: i + 1 };
      }
    }
  }
  return undefined;
}
