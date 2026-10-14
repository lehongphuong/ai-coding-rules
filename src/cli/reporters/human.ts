import type { Colors } from '../context.js';
import type { Severity } from '../../types.js';
import { formatLocation, plural, SEVERITY_RANK, summarize, type ReportFinding } from './summary.js';

const ICONS: Record<Severity, string> = { error: '✖', warning: '⚠', info: 'ℹ' };

function paint(c: Colors, severity: Severity, text: string): string {
  return severity === 'error' ? c.red(text) : severity === 'warning' ? c.yellow(text) : c.blue(text);
}

/** Human doctor report: grouped by file, token budget lines last, then a summary. */
export function renderHuman(findings: readonly ReportFinding[], c: Colors): string {
  const tokens = findings.filter((f) => f.checkId === 'budget' && f.severity === 'info');
  const rest = findings.filter((f) => !tokens.includes(f));
  const out: string[] = [];

  const groups = new Map<string, ReportFinding[]>();
  for (const f of rest) {
    const key = f.file || '(project)';
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const idWidth = Math.max(0, ...rest.map((f) => f.checkId.length));
  for (const [file, list] of groups) {
    list.sort(
      (a, b) => (a.line ?? 0) - (b.line ?? 0) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
    const locWidth = Math.max(...list.map((f) => formatLocation(f).length));
    out.push(c.underline(c.bold(file)));
    for (const f of list) {
      const icon = paint(c, f.severity, ICONS[f.severity]);
      const id = paint(c, f.severity, f.checkId.padEnd(idWidth));
      const loc = c.dim(formatLocation(f).padEnd(locWidth));
      out.push(`  ${icon} ${id}  ${loc}  ${f.message}`);
      for (const r of f.related ?? []) out.push(c.dim(`    ↳ see ${formatLocation(r)}`));
      if (f.hint) out.push(c.dim(`    ↳ ${f.hint}`));
    }
    out.push('');
  }

  if (tokens.length) {
    out.push(c.underline(c.bold('Tokens')));
    for (const f of tokens) out.push(`  ${c.blue(ICONS.info)} ${f.message}`);
    out.push('');
  }

  const s = summarize(findings);
  if (s.errors + s.warnings === 0) {
    out.push(c.green('✔ No problems found'));
  } else {
    const text = `${plural(s.errors, 'error')}, ${plural(s.warnings, 'warning')}`;
    out.push(s.errors ? c.red(c.bold(`✖ ${text}`)) : c.yellow(c.bold(`⚠ ${text}`)));
  }
  return out.join('\n');
}
