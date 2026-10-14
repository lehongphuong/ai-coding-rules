import type { Finding, InstructionDoc, Location } from '../../types.js';
import { docScope, FAMILIES, loc, satisfies, scopedFacts, type DoctorContext } from '../context.js';

const KEYS = ['packageManager', 'testRunner', 'indent', 'quotes', 'semicolons'] as const;

const LABELS: Record<(typeof KEYS)[number], string> = {
  packageManager: 'package manager',
  testRunner: 'test runner',
  indent: 'indentation',
  quotes: 'quotes',
  semicolons: 'semicolons',
};

const STYLE_KEYS = new Set(['indent', 'quotes', 'semicolons']);

interface Side {
  doc: InstructionDoc;
  values: string[];
  line: number;
}

/** conflict/files: two files for the same scope make incompatible claims. */
export function checkConflictFiles(ctx: DoctorContext): Finding[] {
  const { workspaces, facts } = ctx.facts;
  const byScope = new Map<string, InstructionDoc[]>();
  for (const doc of ctx.docs) {
    const scope = docScope(doc, workspaces);
    byScope.set(scope, [...(byScope.get(scope) ?? []), doc]);
  }

  const merged = new Map<
    string,
    { finding: Finding; others: { at: Location; values: string[] }[] }
  >();
  for (const [scope, docs] of byScope) {
    for (const key of KEYS) {
      for (const family of FAMILIES[key] ?? []) {
        const sides = docs
          .map((doc) => sideFor(ctx, doc, key, family))
          .filter((s): s is Side => s !== undefined);
        const actual = scopedFacts(facts, key, scope).map((f) => String(f.value));
        for (let i = 0; i < sides.length; i++) {
          for (let j = i + 1; j < sides.length; j++) {
            const a = sides[i]!;
            const b = sides[j]!;
            if (
              a.values.some(
                (v) => satisfies(v, b.values) || b.values.some((w) => satisfies(w, [v])),
              )
            ) {
              continue;
            }
            // Report on the side the repo contradicts; otherwise on the later file.
            const aOk = a.values.every((v) => satisfies(v, actual));
            const bOk = b.values.every((v) => satisfies(v, actual));
            const [bad, good] = bOk && !aOk ? [a, b] : [b, a];
            const id = `${bad.doc.path}\u0000${bad.line}\u0000${key}`;
            let entry = merged.get(id);
            if (!entry) {
              entry = {
                finding: {
                  checkId: 'conflict/files',
                  severity: 'error',
                  file: bad.doc.path,
                  line: bad.line,
                  message: '',
                  related: [],
                  hint: 'Make the files agree, or keep the rule in one file and import/reference it from the others.',
                },
                others: [],
              };
              merged.set(id, entry);
            }
            const at = { file: good.doc.path, line: good.line };
            entry.finding.related!.push(at);
            entry.others.push({ at, values: good.values });
            entry.finding.message = `${LABELS[key]}: says ${fmt(bad.values)} but ${entry.others
              .map((o) => `${loc(o.at.file, o.at.line)} says ${fmt(o.values)}`)
              .join(', ')}`;
          }
        }
      }
    }
  }
  return [...merged.values()].map((e) => e.finding);
}

function sideFor(
  ctx: DoctorContext,
  doc: InstructionDoc,
  key: string,
  family: string[],
): Side | undefined {
  // Style rules in glob-scoped files (e.g. "**/*.py") are file-type specific.
  if (STYLE_KEYS.has(key) && (doc.frontMatter?.globs || doc.frontMatter?.applyTo)) return undefined;
  const claims = (ctx.claimsByDoc.get(doc.path) ?? []).filter(
    (c) => c.key === key && !c.negated && family.includes(c.value),
  );
  if (claims.length === 0) return undefined;
  return { doc, values: [...new Set(claims.map((c) => c.value))], line: claims[0]!.line };
}

function fmt(values: string[]): string {
  return values.map((v) => `"${v}"`).join('/');
}
