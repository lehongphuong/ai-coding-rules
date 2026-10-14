import { BEGIN_MARKER_RE, END_MARKER_RE } from '../../core/markers.js';
import type { Finding, InstructionDoc } from '../../types.js';
import type { DoctorContext } from '../context.js';

const HEADING_RE = /^ {0,3}#{1,6}(?:\s|$)/;

/** empty: an instruction file with no content besides headings, comments and blanks. */
export function checkEmpty(ctx: DoctorContext): Finding[] {
  return ctx.docs
    .filter((doc) => !hasContent(doc))
    .map((doc) => ({
      checkId: 'empty' as const,
      severity: 'warning' as const,
      file: doc.path,
      message: 'file has no instructions (only headings or blank lines)',
      hint: 'Add instructions or delete the file.',
    }));
}

function hasContent(doc: InstructionDoc): boolean {
  const start = doc.sections[0]?.startLine ?? doc.lines.length + 1;
  // Lines before the first section are front matter or blanks/markers.
  const text = doc.lines
    .slice(start - 1)
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '');
  return text.split('\n').some((line) => {
    const t = line.trim();
    if (!t || BEGIN_MARKER_RE.test(t) || END_MARKER_RE.test(t)) return false;
    return doc.codeLines.size > 0 || !HEADING_RE.test(line);
  });
}
