import { SECTION_IDS, SECTION_TITLES } from '../types.js';
import type { Evidence, ManagedBlock, RenderOptions, Rule, RuleSet, SectionId } from '../types.js';

/** Rules of one scope, ready to render. */
export interface ScopeGroup {
  /** "" = repo root. */
  dir: string;
  name: string;
  description?: string;
  rules: Rule[];
}

export interface SectionGroup {
  id: SectionId;
  title: string;
  rules: Rule[];
}

/** Max evidence entries listed per rule before collapsing into "+N". */
const MAX_EVIDENCE = 3;

/** File-name-safe slug for a scope dir: '' → 'root', 'apps/api' → 'apps-api'. */
export function scopeSlug(dir: string): string {
  if (dir === '') return 'root';
  return dir
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Path of `file` inside a scope dir. */
export function scopedPath(dir: string, file: string): string {
  return dir === '' ? file : `${dir}/${file}`;
}

/** Stable rule order inside a section: priority, then id. */
function compareRules(a: Rule, b: Rule): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group rules by scope. Root is always first (even without rules); other scopes
 * follow `ruleSet.scopes` order and are included only when they have rules.
 */
export function groupByScope(ruleSet: RuleSet): ScopeGroup[] {
  const byDir = new Map<string, Rule[]>();
  for (const rule of ruleSet.rules) {
    const list = byDir.get(rule.scope) ?? [];
    list.push(rule);
    byDir.set(rule.scope, list);
  }

  const rootInfo = ruleSet.scopes.find((s) => s.dir === '');
  const groups: ScopeGroup[] = [
    {
      dir: '',
      name: ruleSet.project.name,
      description: ruleSet.project.description ?? (rootInfo?.summary || undefined),
      rules: byDir.get('') ?? [],
    },
  ];

  const seen = new Set<string>(['']);
  for (const scope of ruleSet.scopes) {
    if (seen.has(scope.dir)) continue;
    seen.add(scope.dir);
    const rules = byDir.get(scope.dir);
    if (!rules?.length) continue;
    groups.push({ dir: scope.dir, name: scope.name, description: scope.summary || undefined, rules });
  }
  // Rules whose scope is missing from `scopes`: keep them, sorted by dir.
  for (const dir of [...byDir.keys()].filter((d) => !seen.has(d)).sort()) {
    groups.push({ dir, name: dir, rules: byDir.get(dir) ?? [] });
  }
  return groups;
}

/** Non-empty sections in SECTION_IDS order, rules sorted by priority then id. */
export function groupBySection(rules: readonly Rule[]): SectionGroup[] {
  return SECTION_IDS.map((id) => ({
    id,
    title: SECTION_TITLES[id],
    rules: rules.filter((r) => r.section === id).sort(compareRules),
  })).filter((g) => g.rules.length > 0);
}

function evidenceLabel(ev: Evidence): string {
  if (!ev.pointer) return ev.file;
  return ev.pointer.startsWith('#') ? `${ev.file}${ev.pointer}` : `${ev.file}#${ev.pointer}`;
}

/** ` <!-- from: a, b#ptr, c +2 -->` (empty string when there is no evidence). */
export function evidenceComment(evidence: readonly Evidence[]): string {
  const labels = [...new Set(evidence.map(evidenceLabel))];
  if (labels.length === 0) return '';
  const shown = labels.slice(0, MAX_EVIDENCE).join(', ');
  const extra = labels.length > MAX_EVIDENCE ? ` +${labels.length - MAX_EVIDENCE}` : '';
  // "--" is not allowed inside HTML comments.
  return ` <!-- from: ${`${shown}${extra}`.replace(/--/g, '- -')} -->`;
}

/** One markdown bullet for a rule. */
export function renderRuleLine(rule: Rule, options: RenderOptions): string {
  let line = `- ${rule.text.replace(/\s*\r?\n\s*/g, ' ').trim()}`;
  if (rule.inferred) line += ' _(inferred)_';
  if (options.evidence === 'comment') line += evidenceComment(rule.evidence);
  return line;
}

/** `## Title` followed by one bullet per rule. */
export function renderSectionBody(title: string, rules: readonly Rule[], options: RenderOptions): string {
  return [`## ${title}`, ...rules.map((r) => renderRuleLine(r, options))].join('\n');
}

/** One managed block per non-empty section, id = section id. */
export function sectionBlocks(rules: readonly Rule[], options: RenderOptions): ManagedBlock[] {
  return groupBySection(rules).map((s) => ({
    id: s.id,
    content: renderSectionBody(s.title, s.rules, options),
  }));
}

/** `# Name` plus an optional one-line description. */
export function renderHeader(name: string, description?: string): string {
  const desc = description?.replace(/\s*\r?\n\s*/g, ' ').trim();
  return desc ? `# ${name}\n\n${desc}` : `# ${name}`;
}
