import type { Finding, Severity } from '../../types.js';

/** A doctor finding, or a CLI-made one (e.g. `outdated` from `check`). */
export type ReportFinding = Omit<Finding, 'checkId'> & { checkId: string };

export interface FindingSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export function summarize(findings: readonly Pick<Finding, 'severity'>[]): FindingSummary {
  const s: FindingSummary = { errors: 0, warnings: 0, infos: 0 };
  for (const f of findings) {
    if (f.severity === 'error') s.errors++;
    else if (f.severity === 'warning') s.warnings++;
    else s.infos++;
  }
  return s;
}

/** True when findings should fail the run for the given threshold. */
export function failed(
  findings: readonly Pick<Finding, 'severity'>[],
  failOn: 'error' | 'warning',
): boolean {
  const s = summarize(findings);
  return s.errors > 0 || (failOn === 'warning' && s.warnings > 0);
}

export const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** `file:line` or `file:line-end`, or just `file`. */
export function formatLocation(f: { file: string; line?: number; endLine?: number }): string {
  if (!f.line) return f.file;
  return f.endLine && f.endLine !== f.line ? `${f.file}:${f.line}-${f.endLine}` : `${f.file}:${f.line}`;
}
