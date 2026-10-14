import type { Finding, ProjectFacts, ResolvedConfig, Severity } from '../types.js';
import { CHECKS } from './checks/index.js';
import { extractClaims } from './claims.js';
import type { DoctorContext } from './context.js';
import { parseInstructionFiles } from './parser.js';

export { CHECKS } from './checks/index.js';
export { extractClaims } from './claims.js';
export { docScope, type Check, type DoctorContext } from './context.js';
export { parseInstructionDoc, parseInstructionFiles } from './parser.js';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Run all enabled checks; findings sorted by file, line, severity, check id. */
export function runDoctor(facts: ProjectFacts, config: ResolvedConfig): Finding[] {
  const docs = parseInstructionFiles(facts.files);
  const ctx: DoctorContext = {
    facts,
    config,
    docs,
    claimsByDoc: new Map(docs.map((d) => [d.path, extractClaims(d)])),
  };
  const disabled = new Set(config.doctor.disable);
  const findings = CHECKS.filter((c) => !disabled.has(c.id)).flatMap((c) => c.run(ctx));
  return sortFindings(findings);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      cmp(a.file, b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      cmp(a.checkId, b.checkId) ||
      cmp(a.message, b.message),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function summarize(findings: readonly Finding[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  return {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  };
}

/** True when findings should fail the run for `failOn` ("error" or "warning"). */
export function failed(findings: readonly Finding[], failOn: 'error' | 'warning'): boolean {
  const { errors, warnings } = summarize(findings);
  return errors > 0 || (failOn === 'warning' && warnings > 0);
}
