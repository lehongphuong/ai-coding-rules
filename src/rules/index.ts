import { matchGlob } from '../core/glob.js';
import {
  SECTION_IDS,
  type ProjectFacts,
  type ResolvedConfig,
  type Rule,
  type RuleSet,
  type ScopeInfo,
} from '../types.js';
import { DEFAULT_PRIORITY, evaluatePack } from './pack.js';
import { PACKS } from './packs/index.js';
import { createFactQuery } from './query.js';
import { scopeSummary } from './summary.js';

export { PACKS } from './packs/index.js';
export { DEFAULT_PRIORITY, evaluatePack, type RulePack, type RuleTemplate } from './pack.js';
export { COMMAND_KIND_ORDER, INHERITED_KEYS, createFactQuery, type FactQuery } from './query.js';
export { overviewSentence, scopeSummary } from './summary.js';

export const CUSTOM_RULE_EVIDENCE = { file: '.ai-rules/config.yaml', pointer: '#rules.custom' };

/** True when `rule` matches a `rules.disable` entry: exact id, `pack/*`, or a glob. */
export function isDisabled(rule: Pick<Rule, 'id' | 'pack'>, disable: readonly string[]): boolean {
  return disable.some(
    (d) => d === rule.id || d === `${rule.pack}/*` || (d.includes('*') && matchGlob(rule.id, d)),
  );
}

/** Deterministic order: scope ("" first), section, priority, id. */
export function compareRules(a: Rule, b: Rule): number {
  if (a.scope !== b.scope) {
    if (a.scope === '') return -1;
    if (b.scope === '') return 1;
    return a.scope < b.scope ? -1 : 1;
  }
  const s = SECTION_IDS.indexOf(a.section) - SECTION_IDS.indexOf(b.section);
  if (s !== 0) return s;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Build the canonical rule set from facts + config (SPEC §3.2). */
export function buildRuleSet(facts: ProjectFacts, config: ResolvedConfig): RuleSet {
  const disable = config.rules.disable;
  const workspaces = facts.workspaces.some((w) => w.dir === '')
    ? facts.workspaces
    : [{ dir: '', name: facts.name }, ...facts.workspaces];

  let rules: Rule[] = [];
  for (const ws of workspaces) {
    const q = createFactQuery(facts, ws.dir);
    for (const pack of PACKS) {
      if (!pack.appliesTo(q)) continue;
      rules.push(...evaluatePack(pack, q));
    }
  }

  for (const c of config.rules.custom) {
    rules.push({
      id: c.id,
      section: c.section,
      text: c.text.trim(),
      scope: c.scope ?? '',
      pack: 'custom',
      evidence: [{ ...CUSTOM_RULE_EVIDENCE }],
      priority: DEFAULT_PRIORITY,
    });
  }

  rules = rules.filter((r) => !isDisabled(r, disable));

  // Child scopes don't repeat what the root already says.
  const rootTexts = new Set(rules.filter((r) => r.scope === '').map((r) => r.text));
  rules = rules.filter((r) => r.scope === '' || !rootTexts.has(r.text));

  const seen = new Set<string>();
  rules = rules.filter((r) => {
    const k = `${r.scope}\u0000${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  rules.sort(compareRules);

  const withRules = new Set(rules.map((r) => r.scope));
  const names = new Map(workspaces.map((w) => [w.dir, w.name]));
  const scopeDirs = [
    '',
    ...[...withRules].filter((d) => d !== '').sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  ];
  const scopes: ScopeInfo[] = scopeDirs.map((dir) => ({
    dir,
    name: names.get(dir) ?? (dir === '' ? facts.name : dir),
    summary: scopeSummary(createFactQuery(facts, dir)),
  }));

  const project: RuleSet['project'] = { name: facts.name };
  if (facts.description) project.description = facts.description;
  return { project, rules, scopes };
}
