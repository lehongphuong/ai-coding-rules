import { parse as parseYaml } from 'yaml';
import { agentsForFile, isInstructionFile } from '../core/agent-files.js';
import { BEGIN_MARKER_RE, END_MARKER_RE } from '../core/markers.js';
import type { FileIndex, InstructionDoc, InstructionSection } from '../types.js';

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Parse every known instruction file in the index, sorted by path. */
export function parseInstructionFiles(files: FileIndex): InstructionDoc[] {
  const docs: InstructionDoc[] = [];
  for (const path of [...files.paths].filter(isInstructionFile).sort()) {
    const text = files.read(path);
    if (text !== undefined) docs.push(parseInstructionDoc(path, text));
  }
  return docs;
}

/** Parse one instruction file: front matter, sections, code lines, imports. */
export function parseInstructionDoc(path: string, text: string): InstructionDoc {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  const { frontMatter, bodyStart } = parseFrontMatter(lines);
  const codeLines = new Set<number>();
  const sections: InstructionSection[] = [];
  let current: InstructionSection | undefined;
  let fence: { char: string; len: number } | undefined;
  let inManaged = false;

  const close = (endIdx: number): void => {
    if (!current) return;
    let end = endIdx;
    while (end > current.startLine && (lines[end - 1] ?? '').trim() === '') end--;
    current.endLine = end;
    // Drop a heading-less preamble that has no content at all.
    const empty =
      current.level === 0 &&
      lines.slice(current.startLine - 1, end).every((l) => l.trim() === '');
    if (!empty) sections.push(current);
    current = undefined;
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    const n = i + 1;
    if (fence) {
      codeLines.add(n);
      const m = FENCE_RE.exec(line);
      if (m && m[1]![0] === fence.char && m[1]!.length >= fence.len && line.trim() === m[1]) {
        fence = undefined;
      }
      continue;
    }
    const fm = FENCE_RE.exec(line);
    if (fm) {
      fence = { char: fm[1]![0]!, len: fm[1]!.length };
      codeLines.add(n);
      if (!current) current = { heading: '', level: 0, startLine: n, endLine: n, generated: inManaged };
      continue;
    }
    if (BEGIN_MARKER_RE.test(line.trim())) {
      inManaged = true;
      continue;
    }
    if (END_MARKER_RE.test(line.trim())) {
      inManaged = false;
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      close(i);
      current = {
        heading: (h[2] ?? '').trim(),
        level: h[1]!.length,
        startLine: n,
        endLine: n,
        generated: inManaged,
      };
      continue;
    }
    if (!current && line.trim() !== '') {
      current = { heading: '', level: 0, startLine: n, endLine: n, generated: inManaged };
    }
  }
  close(lines.length);

  return {
    path,
    agents: agentsForFile(path),
    frontMatter,
    lines,
    sections,
    codeLines,
    imports: extractImports(path, lines, codeLines, bodyStart),
    text,
  };
}

function parseFrontMatter(lines: string[]): {
  frontMatter?: Record<string, unknown>;
  bodyStart: number;
} {
  if (lines[0]?.trim() !== '---') return { bodyStart: 0 };
  const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
  if (end === -1) return { bodyStart: 0 };
  let frontMatter: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = parseYaml(lines.slice(1, end).join('\n'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontMatter = parsed as Record<string, unknown>;
    }
  } catch {
    // invalid YAML: ignore, but still treat the block as front matter
  }
  return { frontMatter, bodyStart: end + 1 };
}

const IMPORT_RE = /(^|[\s(])@([^\s`'"()<>[\]]+)/g;

/** Claude "@path" imports outside code, resolved relative to the file's dir. */
function extractImports(
  path: string,
  lines: string[],
  codeLines: Set<number>,
  bodyStart: number,
): string[] {
  const dir = dirname(path);
  const out: string[] = [];
  for (let i = bodyStart; i < lines.length; i++) {
    if (codeLines.has(i + 1)) continue;
    const line = lines[i]!.replace(/`[^`]*`/g, ' ').replace(/<!--.*?-->/g, ' ');
    for (const m of line.matchAll(IMPORT_RE)) {
      const raw = m[2]!.replace(/[.,;:!?]+$/, '');
      if (!isImportPath(raw)) continue;
      const resolved = resolvePath(dir, raw);
      if (resolved !== undefined && !out.includes(resolved)) out.push(resolved);
    }
  }
  return out;
}

function isImportPath(raw: string): boolean {
  if (raw.startsWith('~') || raw.startsWith('/') || raw.includes('://')) return false;
  if (raw.includes('@')) return false;
  // Must look like a file ("@AGENTS.md", "@docs/x.md"); rejects "@scope/pkg" and "@user".
  return /\.[A-Za-z][A-Za-z0-9]*$/.test(raw);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Join `rel` onto `dir`, normalising "." and ".."; undefined if it escapes the root. */
export function resolvePath(dir: string, rel: string): string | undefined {
  const parts = dir ? dir.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}
