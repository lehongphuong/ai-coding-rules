import { BEGIN_MARKER_RE, END_MARKER_RE } from '../../core/markers.js';
import type { Finding, InstructionDoc, InstructionSection } from '../../types.js';
import { loc, type DoctorContext } from '../context.js';

const MIN_LINES = 3;

interface Unit {
  doc: InstructionDoc;
  section: InstructionSection;
  shingles: Set<string>;
}

/** duplicate: near-identical sections in different files (3-word shingles + Jaccard). */
export function checkDuplicate(ctx: DoctorContext): Finding[] {
  const threshold = ctx.config.doctor.duplicateThreshold;
  const units = ctx.docs.flatMap((doc) =>
    doc.sections.map((section) => unitFor(doc, section)).filter((u): u is Unit => u !== undefined),
  );

  // Best match per (section, other file), reported once per pair.
  const best = new Map<string, { a: Unit; b: Unit; score: number }>();
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!;
      const b = units[j]!;
      if (a.doc.path === b.doc.path) continue;
      if (a.section.generated && b.section.generated) continue;
      if (a.doc.imports.includes(b.doc.path) || b.doc.imports.includes(a.doc.path)) continue;
      const score = jaccard(a.shingles, b.shingles);
      if (score < threshold) continue;
      const key = `${a.doc.path}:${a.section.startLine}\u0000${b.doc.path}`;
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { a, b, score });
    }
  }

  const findings: Finding[] = [];
  const used = new Set<string>();
  for (const { a, b, score } of [...best.values()].sort((x, y) => y.score - x.score)) {
    // Each section takes part in at most one finding per other file.
    const ka = `${a.doc.path}:${a.section.startLine}>${b.doc.path}`;
    const kb = `${b.doc.path}:${b.section.startLine}>${a.doc.path}`;
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    const [here, other] = orient(a, b);
    const pct = Math.round(score * 100);
    findings.push({
      checkId: 'duplicate',
      severity: 'warning',
      file: here.doc.path,
      line: here.section.startLine,
      endLine: here.section.endLine,
      related: [
        { file: other.doc.path, line: other.section.startLine, endLine: other.section.endLine },
      ],
      message: `${loc(here.doc.path, here.section.startLine, here.section.endLine)} ≈ ${loc(
        other.doc.path,
        other.section.startLine,
        other.section.endLine,
      )} (${pct}% similar)`,
      hint: here.doc.agents.includes('claude')
        ? `Keep it in one file and import it (e.g. \`@${other.doc.path}\` in ${here.doc.path}).`
        : 'Keep it in one file (e.g. AGENTS.md) and remove the copy.',
    });
  }
  return findings;
}

/** Report on the copy: prefer keeping AGENTS.md as the source, else the later file. */
function orient(a: Unit, b: Unit): [Unit, Unit] {
  const isAgents = (u: Unit): boolean => /(^|\/)AGENTS\.md$/.test(u.doc.path);
  if (isAgents(a) && !isAgents(b)) return [b, a];
  if (isAgents(b) && !isAgents(a)) return [a, b];
  return a.doc.path < b.doc.path ? [b, a] : [a, b];
}

function unitFor(doc: InstructionDoc, section: InstructionSection): Unit | undefined {
  const body: string[] = [];
  for (let n = section.startLine; n <= section.endLine; n++) {
    const line = doc.lines[n - 1] ?? '';
    const t = line.trim();
    if (n === section.startLine && section.level > 0) continue; // heading
    if (!t || BEGIN_MARKER_RE.test(t) || END_MARKER_RE.test(t)) continue;
    body.push(t);
  }
  if (body.length < MIN_LINES) return undefined;
  const shingles = shingle(body.join(' '));
  return shingles.size > 0 ? { doc, section, shingles } : undefined;
}

export function shingle(text: string, size = 3): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
