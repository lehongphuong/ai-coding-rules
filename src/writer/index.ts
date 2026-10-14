import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type { ManagedBlock, RenderedFile, WritePlan } from '../types.js';
import { isHandEdited, parseBlocks, renderBlock } from './blocks.js';

export { parseBlocks, renderBlock, isHandEdited } from './blocks.js';
export type { ParsedBlock, ParsedFile, ParsedFrontMatter } from './blocks.js';

export interface PlanOptions {
  /** Overwrite hand-edited managed blocks. */
  force?: boolean;
}

function frontMatterText(fm: string, eol: string): string {
  return ['---', fm.replace(/\r\n/g, '\n').trimEnd(), '---', ''].join('\n').replace(/\n/g, eol);
}

/** Content for a file that does not exist yet. */
function renderNew(file: RenderedFile): string {
  const parts: string[] = [];
  if (file.header?.trim()) parts.push(file.header.trim());
  parts.push(...file.blocks.map((b) => renderBlock(b)));
  let out = parts.join('\n\n');
  if (out) out += '\n';
  if (file.frontMatter !== undefined) out = frontMatterText(file.frontMatter, '\n') + (out ? `\n${out}` : '');
  return out;
}

/** Ensure `text` ends with an empty line (or is empty) so a block can follow. */
function withBlankLine(text: string, eol: string): string {
  if (text === '') return text;
  if (!text.endsWith('\n')) text += eol;
  return /\n\r?\n$/.test(text) || text === eol ? text : text + eol;
}

/** Merge generated blocks into existing content; everything outside blocks is preserved. */
function merge(file: RenderedFile, existing: string): { content: string; conflicts: string[] } {
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const parsed = parseBlocks(existing);
  const wanted = new Map<string, ManagedBlock>(file.blocks.map((b) => [b.id, b]));
  const conflicts = [...new Set(parsed.blocks.filter(isHandEdited).map((b) => b.id))];

  let out = '';
  let pos = 0;
  if (file.frontMatter !== undefined) {
    out = frontMatterText(file.frontMatter, eol);
    if (parsed.frontMatter) pos = parsed.frontMatter.endOffset;
    else if (existing !== '') out += eol;
  }

  const placed = new Set<string>();
  const missing = () => file.blocks.filter((b) => !placed.has(b.id) && !parsed.blocks.some((p) => p.id === b.id));
  const insertMissing = () => {
    for (const block of missing()) {
      out = withBlankLine(out, eol) + renderBlock(block, eol) + eol;
      placed.add(block.id);
    }
  };

  parsed.blocks.forEach((block, idx) => {
    out += existing.slice(pos, block.startOffset);
    pos = block.endOffset;
    const next = wanted.get(block.id);
    if (next && !placed.has(block.id)) {
      const hadNewline = existing.slice(block.startOffset, block.endOffset).endsWith('\n');
      out += renderBlock(next, eol) + (hadNewline ? eol : '');
      placed.add(block.id);
    } else {
      // Removed (or duplicate) block: drop it together with one following blank line.
      const blank = /^\r?\n/.exec(existing.slice(pos));
      if (blank) pos += blank[0].length;
    }
    if (idx === parsed.blocks.length - 1) {
      // New blocks go right after the last managed block.
      if (missing().length > 0 && out !== '' && !out.endsWith('\n')) out += eol;
      insertMissing();
    }
  });

  out += existing.slice(pos);
  if (parsed.blocks.length === 0) insertMissing();
  return { content: out, conflicts };
}

/** Merge a rendered file into existing content. */
export function planWrite(
  file: RenderedFile,
  existing: string | undefined,
  options: PlanOptions = {},
): WritePlan {
  const base = { path: file.path, target: file.target };
  if (existing === undefined) {
    const content = renderNew(file);
    return { ...base, status: 'create', content, diff: createTwoFilesPatch(file.path, file.path, '', content), conflicts: [] };
  }
  const { content, conflicts } = merge(file, existing);
  if (content === existing) return { ...base, status: 'unchanged', content, diff: '', conflicts: [] };
  const status = conflicts.length > 0 && !options.force ? 'conflict' : 'update';
  return {
    ...base,
    status,
    content,
    diff: createTwoFilesPatch(file.path, file.path, existing, content),
    conflicts: status === 'conflict' ? conflicts : [],
  };
}

function readExisting(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** planWrite for each file, reading existing content from `root`. */
export function planWrites(root: string, files: readonly RenderedFile[], options: PlanOptions = {}): WritePlan[] {
  return files.map((file) => planWrite(file, readExisting(join(root, file.path)), options));
}

/** Write create/update plans to disk (never conflicts). Returns written (or would-be-written) paths. */
export function applyPlans(root: string, plans: readonly WritePlan[], options: { dryRun?: boolean } = {}): string[] {
  const written: string[] = [];
  for (const plan of plans) {
    if (plan.status !== 'create' && plan.status !== 'update') continue;
    if (!options.dryRun) {
      const target = join(root, plan.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, plan.content, 'utf8');
    }
    written.push(plan.path);
  }
  return written;
}
