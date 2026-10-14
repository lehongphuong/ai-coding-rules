import type { CommandKind, Evidence, FactKey, FactValue } from '../../types.js';
import type { FactQuery } from '../query.js';

type Source =
  | FactKey
  | [FactKey, FactValue]
  | { command: CommandKind }
  | { file: string }
  | { dep: string };

/** Build an evidence resolver from fact keys, (key, value) pairs, commands, files and deps. */
export function ev(...sources: Source[]): (q: FactQuery) => Evidence[] {
  return (q) =>
    sources.flatMap((s): Evidence[] => {
      if (typeof s === 'string') return q.evidence(s);
      if (Array.isArray(s)) return q.evidence(s[0], s[1]);
      if ('command' in s) return q.commands(s.command).flatMap((f) => f.evidence);
      if ('file' in s) return q.fileEvidence(s.file);
      const dep = q.dependency(s.dep);
      return dep ? [dep] : [];
    });
}

/** Evidence only when every resolver yields some; otherwise empty (rule dropped). */
export function allOf(...parts: ((q: FactQuery) => Evidence[])[]): (q: FactQuery) => Evidence[] {
  return (q) => {
    const lists = parts.map((p) => p(q));
    return lists.every((l) => l.length > 0) ? lists.flat() : [];
  };
}

/** First existing scope-relative path among `candidates`. */
export function firstFile(q: FactQuery, candidates: readonly string[]): string | undefined {
  return candidates.find((c) => q.files.has(q.path(c)));
}

/** First file under a scope-relative dir, as evidence for the dir's presence. */
export function dirEvidence(q: FactQuery, dir: string): Evidence[] {
  if (!q.files.hasDir(q.path(dir))) return [];
  const first = q.files.glob(`${q.path(dir)}/**`)[0];
  return first ? [{ file: first, note: `${dir}/ exists` }] : [];
}

/** True when any command of `kind` contains `needle`. */
export function hasCommand(q: FactQuery, kind: CommandKind, needle?: string): boolean {
  return q.commands(kind).some((c) => !needle || String(c.value).includes(needle));
}

/** Prefix to run a locally installed Node binary with the scope's package manager. */
export function nodeExec(q: FactQuery): string {
  switch (q.values('packageManager')[0]) {
    case 'pnpm':
      return 'pnpm';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bunx';
    default:
      return 'npx';
  }
}

/** Prefix to run a Python tool with the scope's package manager ('' for plain pip). */
export function pyExec(q: FactQuery): string {
  switch (q.values('packageManager')[0]) {
    case 'uv':
      return 'uv run ';
    case 'poetry':
      return 'poetry run ';
    case 'pipenv':
      return 'pipenv run ';
    default:
      return '';
  }
}
