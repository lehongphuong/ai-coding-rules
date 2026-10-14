import { parse as parseYamlText } from 'yaml';
import type { CommandKind, Evidence, Fact, FactKey, FactValue, FileIndex } from '../types.js';
import { joinPath } from '../core/index.js';

/** Direct evidence (dependency, lockfile, config file). */
export const DIRECT = 0.95;

/** Build a fact. */
export function fact(
  key: FactKey,
  value: FactValue,
  scope: string,
  evidence: Evidence[],
  confidence = DIRECT,
  meta?: Record<string, string>,
): Fact {
  const f: Fact = { key, value, confidence, evidence, scope };
  if (meta && Object.keys(meta).length > 0) f.meta = meta;
  return f;
}

/** Build an evidence item, omitting empty fields. */
export function ev(file: string, pointer?: string, line?: number): Evidence {
  const e: Evidence = { file };
  if (pointer) e.pointer = pointer;
  if (line !== undefined) e.line = line;
  return e;
}

/**
 * Parse JSON with comments and trailing commas (tsconfig style).
 * Returns undefined on error.
 */
export function parseJsonc(text: string): unknown {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      // copy string literal verbatim
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  try {
    return JSON.parse(stripTrailingCommas(out));
  } catch {
    return undefined;
  }
}

function stripTrailingCommas(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === ',' && closesNext(text, i + 1)) {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** True if the next non-whitespace char from `i` is `}` or `]`. */
function closesNext(text: string, i: number): boolean {
  let j = i;
  while (j < text.length && /\s/.test(text[j]!)) j++;
  return text[j] === '}' || text[j] === ']';
}

/** Parse YAML, returning undefined on error. */
export function parseYaml(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return parseYamlText(text) as unknown;
  } catch {
    return undefined;
  }
}

export function readYaml(files: FileIndex, path: string): Record<string, unknown> | undefined {
  const data = parseYaml(files.read(path));
  return isRecord(data) ? data : undefined;
}

export function readJsonc(files: FileIndex, path: string): Record<string, unknown> | undefined {
  const text = files.read(path);
  if (text === undefined) return undefined;
  const data = parseJsonc(text);
  return isRecord(data) ? data : undefined;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** String-valued record entries of `obj[key]`, or {}. */
export function stringMap(obj: unknown, key: string): Record<string, string> {
  const v = isRecord(obj) ? obj[key] : undefined;
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = typeof val === 'string' ? val : JSON.stringify(val ?? '');
  }
  return out;
}

/** 1-based line of the first line matching `re`, or undefined. */
export function lineOf(text: string | undefined, re: RegExp): number | undefined {
  if (text === undefined) return undefined;
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => re.test(l));
  return idx === -1 ? undefined : idx + 1;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First existing path among `names` inside `dir`. */
export function firstExisting(
  files: FileIndex,
  dir: string,
  names: readonly string[],
): string | undefined {
  for (const n of names) {
    const p = joinPath(dir, n);
    if (files.has(p)) return p;
  }
  return undefined;
}

/** Strip range operators from a version spec ("^10.2.0" → "10.2.0"). */
export function cleanVersion(spec: string | undefined): string | undefined {
  if (!spec) return undefined;
  const m = /\d+(?:\.\d+){0,2}/.exec(spec);
  return m ? m[0] : undefined;
}

const KIND_BY_NAME: Record<string, CommandKind> = {
  test: 'test',
  'test:unit': 'test',
  unit: 'test',
  e2e: 'e2e',
  'test:e2e': 'e2e',
  lint: 'lint',
  format: 'format',
  fmt: 'format',
  typecheck: 'typecheck',
  'type-check': 'typecheck',
  'check-types': 'typecheck',
  tsc: 'typecheck',
  build: 'build',
  dev: 'dev',
  start: 'dev',
  migrate: 'migrate',
  'db:migrate': 'migrate',
  codegen: 'codegen',
  generate: 'codegen',
};

/** Command kind inferred from a script / target name, or undefined. */
export function inferKind(name: string): CommandKind | undefined {
  return KIND_BY_NAME[name.toLowerCase()];
}

/** Last path segment of a POSIX or Windows path. */
export function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

/** Parent dir of a repo-relative path ("" for top-level files). */
export function dirName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}
