import { legacyReplacement } from '../../core/agent-files.js';
import type { Finding } from '../../types.js';
import type { DoctorContext } from '../context.js';

/** legacy: deprecated single-file formats (.cursorrules, .windsurfrules). */
export function checkLegacy(ctx: DoctorContext): Finding[] {
  const findings: Finding[] = [];
  for (const doc of ctx.docs) {
    const replacement = legacyReplacement(doc.path);
    if (!replacement) continue;
    findings.push({
      checkId: 'legacy',
      severity: 'info',
      file: doc.path,
      message: `${doc.path} is a legacy format`,
      hint: `Migrate its rules to \`${replacement}\` (or run "ai-rules generate") and delete ${doc.path}.`,
    });
  }
  return findings;
}
