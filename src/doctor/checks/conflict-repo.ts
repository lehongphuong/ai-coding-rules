import type { Fact, Finding } from '../../types.js';
import {
  docScope,
  familyOf,
  quote,
  satisfies,
  scopedFacts,
  type DoctorContext,
} from '../context.js';

const KEYS = ['packageManager', 'testRunner', 'formatter', 'indent'] as const;
type Key = (typeof KEYS)[number];

const LABELS: Record<Key, string> = {
  packageManager: 'package manager',
  testRunner: 'test runner',
  formatter: 'formatter',
  indent: 'indentation',
};

/** conflict/repo: a claim contradicts a high-confidence fact for the file's scope. */
export function checkConflictRepo(ctx: DoctorContext): Finding[] {
  const { facts, workspaces } = ctx.facts;
  const findings: Finding[] = [];
  for (const doc of ctx.docs) {
    const scope = docScope(doc, workspaces);
    const reported = new Set<string>();
    for (const claim of ctx.claimsByDoc.get(doc.path) ?? []) {
      const key = KEYS.find((k) => k === claim.key);
      if (!key || claim.negated) continue;
      const id = `${claim.line}:${key}`;
      if (reported.has(id)) continue;
      const family = familyOf(key, claim.value);
      if (!family) continue;

      const visible = scopedFacts(facts, key, scope);
      const strong = visible.filter((f) => f.confidence >= 0.9 && family.includes(String(f.value)));
      if (strong.length === 0) continue;

      const accepted = visible.map((f) => String(f.value));
      // A formatter claim may name a tool the repo uses as a linter (biome).
      if (key === 'formatter') {
        accepted.push(...scopedFacts(facts, 'linter', scope).map((f) => String(f.value)));
      }
      // Root files often describe child workspaces: accept values from any scope.
      if (scope === '') {
        accepted.push(...facts.filter((f) => f.key === key).map((f) => String(f.value)));
      }
      if (satisfies(claim.value, accepted)) continue;

      reported.add(id);
      const best = [...strong].sort((a, b) => b.confidence - a.confidence)[0]!;
      const actual = [...new Set(strong.map((f) => String(f.value)))].join(' + ');
      findings.push({
        checkId: 'conflict/repo',
        severity: 'error',
        file: doc.path,
        line: claim.line,
        message: `"${quote(claim.text)}" — repo uses ${actual}${evidenceNote(best)}; ${LABELS[key]} mismatch`,
        hint: hintFor(key, claim.value, String(best.value)),
      });
    }
  }
  return findings;
}

function evidenceNote(fact: Fact): string {
  const e = fact.evidence[0];
  if (!e) return '';
  const where = e.pointer?.startsWith('#') ? `${e.file}${e.pointer}` : (e.pointer ?? e.file);
  return ` (${where})`;
}

function hintFor(key: Key, claimed: string, actual: string): string {
  switch (key) {
    case 'packageManager':
      return `Replace ${claimed} commands with ${actual} (e.g. "${actual} install", "${actual} run <script>").`;
    case 'testRunner':
      return `Tests in this repo use ${actual}; update or remove the reference to ${claimed}.`;
    case 'formatter':
      return `Code is formatted with ${actual}; update or remove the reference to ${claimed}.`;
    case 'indent':
      return `.editorconfig uses ${actual === 'tab' ? 'tabs' : `${actual} spaces`}; align the instruction with it.`;
  }
}
