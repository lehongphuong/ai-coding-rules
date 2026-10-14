import { summarize, type FindingSummary, type ReportFinding } from './summary.js';

export interface JsonReport {
  findings: ReportFinding[];
  summary: FindingSummary;
}

export function jsonReport(findings: readonly ReportFinding[]): JsonReport {
  return { findings: [...findings], summary: summarize(findings) };
}

export function renderJson(findings: readonly ReportFinding[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...jsonReport(findings), ...extra }, null, 2);
}
