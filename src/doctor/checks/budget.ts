import { estimateTokens } from '../../core/tokens.js';
import type { AgentId, Finding, InstructionDoc } from '../../types.js';
import { formatTokens, type DoctorContext } from '../context.js';

const AGENTS: AgentId[] = ['claude', 'codex', 'cursor', 'copilot', 'gemini', 'windsurf'];

interface Contribution {
  path: string;
  tokens: number;
}

/** budget: token estimates per file and per agent. */
export function checkBudget(ctx: DoctorContext): Finding[] {
  const { perFile, perAgent } = ctx.config.doctor.budget;
  const findings: Finding[] = [];

  for (const doc of ctx.docs) {
    const tokens = estimateTokens(doc.text);
    if (tokens > perFile) {
      findings.push({
        checkId: 'budget',
        severity: 'warning',
        file: doc.path,
        message: `≈ ${formatTokens(tokens)} tokens (budget ${formatTokens(perFile)} per file)`,
        hint: 'Trim generic advice, move rarely needed detail into separate docs, or split rules by scope.',
      });
    }
  }

  for (const agent of AGENTS) {
    const docs = ctx.docs.filter((d) => d.agents.includes(agent));
    if (docs.length === 0) continue;
    const parts = contributions(ctx, docs, agent);
    const total = parts.reduce((s, p) => s + p.tokens, 0);
    const ranked = [...parts].sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
    if (total > perAgent) {
      findings.push({
        checkId: 'budget',
        severity: 'warning',
        file: ranked[0]!.path,
        message: `${agent} loads ≈ ${formatTokens(total)} tokens of instructions (budget ${formatTokens(perAgent)})`,
        hint: 'Remove duplicated content across files and keep each file focused.',
      });
    }
    findings.push({
      checkId: 'budget',
      severity: 'info',
      file: docs[0]!.path,
      message: `${agent} ≈ ${formatTokens(total)} tokens (${ranked
        .map((p) => `${p.path} ${formatTokens(p.tokens)}`)
        .join(', ')})`,
    });
  }
  return findings;
}

/** Files an agent loads; for Claude, `@imports` are followed (once each). */
function contributions(ctx: DoctorContext, docs: InstructionDoc[], agent: AgentId): Contribution[] {
  const out = new Map<string, number>();
  const byPath = new Map(ctx.docs.map((d) => [d.path, d]));
  const visit = (path: string, depth: number): void => {
    if (out.has(path) || depth > 5) return;
    const doc = byPath.get(path);
    const text = doc?.text ?? ctx.facts.files.read(path);
    if (text === undefined) return;
    out.set(path, estimateTokens(text));
    if (agent === 'claude' && doc) doc.imports.forEach((p) => visit(p, depth + 1));
  };
  docs.forEach((d) => visit(d.path, 0));
  return [...out].map(([path, tokens]) => ({ path, tokens }));
}
