import { BEGIN_MARKER_RE, END_MARKER_RE, beginMarker, endMarker } from '../core/markers.js';
import { shortHash } from '../core/hash.js';
import type { ManagedBlock } from '../types.js';

/** A managed block found in existing file content. */
export interface ParsedBlock {
  id: string;
  /** Hash from the begin marker, if present. */
  hash?: string;
  /** Text between the markers, CRLF normalised to LF, without the final newline. */
  body: string;
  /** 1-based line numbers of the begin and end markers. */
  startLine: number;
  endLine: number;
  /** Offset of the begin marker line; offset just past the end marker line (incl. its newline). */
  startOffset: number;
  endOffset: number;
}

export interface ParsedFrontMatter {
  /** Text between the `---` fences (LF-normalised, no trailing newline). */
  raw: string;
  /** Offset just past the closing fence line (incl. its newline). */
  endOffset: number;
}

export interface ParsedFile {
  blocks: ParsedBlock[];
  frontMatter?: ParsedFrontMatter;
}

interface Line {
  /** Line text without its line terminator. */
  text: string;
  start: number;
  /** Offset past the line terminator. */
  end: number;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf('\n', start);
    const end = nl === -1 ? text.length : nl + 1;
    const raw = text.slice(start, nl === -1 ? text.length : nl);
    lines.push({ text: raw.endsWith('\r') ? raw.slice(0, -1) : raw, start, end });
    start = end;
  }
  return lines;
}

/** Find managed blocks and leading front matter. Unterminated begin markers are ignored. */
export function parseBlocks(text: string): ParsedFile {
  const lines = splitLines(text);
  const result: ParsedFile = { blocks: [] };

  let i = 0;
  if (lines[0]?.text === '---') {
    const close = lines.findIndex((l, idx) => idx > 0 && l.text === '---');
    if (close > 0) {
      result.frontMatter = {
        raw: lines.slice(1, close).map((l) => l.text).join('\n'),
        endOffset: lines[close]!.end,
      };
      i = close + 1;
    }
  }

  for (; i < lines.length; i++) {
    const begin = BEGIN_MARKER_RE.exec(lines[i]!.text);
    if (!begin) continue;
    const id = begin[1]!;
    // Look for the matching end marker; another begin marker first means this one is unterminated.
    let endIdx = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j]!.text;
      if (BEGIN_MARKER_RE.test(t)) break;
      const end = END_MARKER_RE.exec(t);
      if (end && (end[1] === undefined || end[1] === id)) {
        endIdx = j;
        break;
      }
    }
    if (endIdx === -1) continue;
    result.blocks.push({
      id,
      hash: begin[2],
      body: lines.slice(i + 1, endIdx).map((l) => l.text).join('\n'),
      startLine: i + 1,
      endLine: endIdx + 1,
      startOffset: lines[i]!.start,
      endOffset: lines[endIdx]!.end,
    });
    i = endIdx;
  }
  return result;
}

/** Normalised block body as written to disk (LF). */
function blockBody(block: ManagedBlock): string {
  return block.content.replace(/\r\n/g, '\n').trim();
}

/** Begin marker (with hash), body and end marker; no trailing newline. */
export function renderBlock(block: ManagedBlock, eol = '\n'): string {
  const body = blockBody(block);
  return [beginMarker(block.id, shortHash(body)), body, endMarker(block.id)].join('\n').replace(/\n/g, eol);
}

/** True when a parsed block was edited by hand (body no longer matches its hash). */
export function isHandEdited(block: ParsedBlock): boolean {
  return block.hash !== undefined && block.hash !== shortHash(block.body);
}
