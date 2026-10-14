import { scopeOf } from '../core/facts.js';
import type {
  Claim,
  Fact,
  Finding,
  InstructionDoc,
  ProjectFacts,
  ResolvedConfig,
  Workspace,
} from '../types.js';

export interface DoctorContext {
  facts: ProjectFacts;
  config: ResolvedConfig;
  docs: InstructionDoc[];
  /** Claims per doc path. */
  claimsByDoc: Map<string, Claim[]>;
}

export type Check = (ctx: DoctorContext) => Finding[];

/**
 * Workspace a doc applies to: nearest workspace containing the file, or for
 * Cursor `.mdc` (`globs`) / Copilot `.instructions.md` (`applyTo`) the workspace
 * their globs point into ("" when they span several or none).
 */
export function docScope(doc: InstructionDoc, workspaces: readonly Workspace[]): string {
  const key = doc.path.endsWith('.mdc')
    ? 'globs'
    : doc.path.endsWith('.instructions.md')
      ? 'applyTo'
      : undefined;
  if (key) {
    const globs = toGlobList(doc.frontMatter?.[key]);
    if (globs.length === 0) return scopeOf(doc.path, workspaces);
    const scopes = new Set(globs.map((g) => scopeOf(globPrefix(g), workspaces)));
    return scopes.size === 1 ? [...scopes][0]! : '';
  }
  return scopeOf(doc.path, workspaces);
}

function toGlobList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Literal directory prefix of a glob: "apps/api/**\/*.ts" → "apps/api". */
function globPrefix(glob: string): string {
  const g = glob.replace(/^\.\//, '').replace(/^\//, '');
  const wild = g.search(/[*?{[]/);
  if (wild === -1) return g;
  const lit = g.slice(0, wild);
  const slash = lit.lastIndexOf('/');
  return slash === -1 ? '' : lit.slice(0, slash);
}

/** Groups of mutually exclusive values per claim key; values in different groups don't conflict. */
export const FAMILIES: Record<string, string[][]> = {
  packageManager: [
    ['npm', 'pnpm', 'yarn', 'bun'],
    ['pip', 'poetry', 'uv', 'pipenv'],
  ],
  testRunner: [
    ['jest', 'vitest', 'mocha'],
    ['playwright', 'cypress'],
    ['phpunit', 'pest'],
    ['pytest'],
    ['flutter-test'],
    ['go-test'],
    ['junit'],
  ],
  formatter: [
    ['prettier', 'biome'],
    ['black', 'ruff-format'],
    ['pint', 'php-cs-fixer'],
    ['dart-format'],
    ['gofmt'],
  ],
  indent: [['2', '4', '8', 'tab']],
  quotes: [['single', 'double']],
  semicolons: [['always', 'never']],
};

export function familyOf(key: string, value: string): string[] | undefined {
  return FAMILIES[key]?.find((f) => f.includes(value));
}

/** Values that are compatible with `value` (Pest runs on PHPUnit). */
export function satisfies(claimed: string, actual: readonly string[]): boolean {
  if (actual.includes(claimed)) return true;
  return claimed === 'phpunit' && actual.includes('pest');
}

/** Facts for `key` visible from `scope` (root inherited for packageManager/indent). */
export function scopedFacts(facts: readonly Fact[], key: string, scope: string): Fact[] {
  const inherit = key === 'packageManager' || key === 'indent';
  return facts.filter(
    (f) => f.key === key && (f.scope === scope || (inherit && f.scope === '')),
  );
}

/** "1234" → "1.2k". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** Shorten a source line for messages. */
export function quote(text: string, max = 80): string {
  const t = text.replace(/^[-*+>]\s+|^\d+\.\s+/, '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function loc(file: string, line?: number, endLine?: number): string {
  if (line === undefined) return file;
  return endLine !== undefined && endLine !== line ? `${file}:${line}-${endLine}` : `${file}:${line}`;
}
