import type { Evidence, FactKey, Rule, SectionId } from '../types.js';
import { dedupeEvidence, type FactQuery } from './query.js';

export const DEFAULT_PRIORITY = 50;

export interface RuleTemplate {
  /** Globally unique, e.g. "nestjs/modules". */
  id: string;
  section: SectionId;
  when?(q: FactQuery): boolean;
  text: string | ((q: FactQuery) => string);
  evidence: FactKey[] | ((q: FactQuery) => Evidence[]);
  /** Lower = earlier within a section. Default 50. */
  priority?: number;
}

export interface RulePack {
  id: string;
  /** `q` is scoped to one workspace. */
  appliesTo(q: FactQuery): boolean;
  rules: RuleTemplate[];
  /**
   * Optional data-driven templates computed per scope (e.g. one rule per
   * detected command). Evaluated after `rules`.
   */
  expand?(q: FactQuery): RuleTemplate[];
}

/**
 * Evaluate every template of `pack` against `q` (the caller checks
 * `appliesTo`). Rules whose text or evidence resolves to empty are dropped:
 * a rule without evidence is a bug.
 */
export function evaluatePack(pack: RulePack, q: FactQuery): Rule[] {
  const templates = [...pack.rules, ...(pack.expand?.(q) ?? [])];
  const out: Rule[] = [];
  for (const t of templates) {
    if (t.when && !t.when(q)) continue;
    const text = (typeof t.text === 'function' ? t.text(q) : t.text).trim();
    if (!text) continue;
    const evidence = dedupeEvidence(
      typeof t.evidence === 'function' ? t.evidence(q) : t.evidence.flatMap((k) => q.evidence(k)),
    );
    if (evidence.length === 0) continue;
    out.push({
      id: t.id,
      section: t.section,
      text,
      scope: q.scope,
      pack: pack.id,
      evidence,
      priority: t.priority ?? DEFAULT_PRIORITY,
    });
  }
  return out;
}
