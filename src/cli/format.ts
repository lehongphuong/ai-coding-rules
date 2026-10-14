import type { Evidence } from '../types.js';

/** `file#pointer (line N) — note`; pointers may be "#x", "file#x" or "x". */
export function formatEvidence(e: Evidence, withNote = true): string {
  let s = e.file;
  if (e.pointer) {
    if (e.pointer.startsWith('#')) s = `${e.file}${e.pointer}`;
    else if (e.pointer.startsWith(`${e.file}#`)) s = e.pointer;
    else s = `${e.file}#${e.pointer}`;
  }
  if (e.line) s += ` (line ${e.line})`;
  if (withNote && e.note) s += ` — ${e.note}`;
  return s;
}

/** Human scope label: "root" or the workspace dir. */
export function scopeLabel(scope: string): string {
  return scope === '' ? 'root' : scope;
}

/** Pad every row's columns to the widest cell (last column is not padded). */
export function columns(rows: readonly string[][], gap = '  '): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visibleLength(cell));
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) =>
        i === row.length - 1 ? cell : cell + ' '.repeat(widths[i]! - visibleLength(cell)),
      )
      .join(gap),
  );
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function visibleLength(s: string): number {
  return s.replace(ANSI_RE, '').length;
}
