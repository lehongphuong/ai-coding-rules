import type { FileIndex, ScriptDef, ScriptSource, Workspace } from '../types.js';
import { joinPath } from '../core/index.js';
import { ev, isRecord, lineOf, readYaml, escapeRegExp } from './util.js';

export interface NamedLine {
  name: string;
  /** 1-based line number. */
  line: number;
}

/** Makefile targets: `name:` at line start, not `.PHONY`-style, not `:=` assignments. */
export function makeTargets(text: string): NamedLine[] {
  const out: NamedLine[] = [];
  const seen = new Set<string>();
  text.split('\n').forEach((raw, i) => {
    const m = /^([^\s#:=.][^:=#]*?)\s*::?(?!=)/.exec(raw);
    if (!m || /^\s/.test(raw)) return;
    for (const name of m[1]!.split(/\s+/)) {
      if (!name || name.includes('%') || name.includes('$') || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, line: i + 1 });
    }
  });
  return out;
}

/** justfile recipes: `name args...:` at line start (skips `:=` assignments, settings, aliases). */
export function justRecipes(text: string): NamedLine[] {
  const out: NamedLine[] = [];
  text.split('\n').forEach((raw, i) => {
    if (/^(set|alias|export|import|mod)\s/.test(raw)) return;
    const m = /^@?([A-Za-z_][\w-]*)(?:\s+[^:=]*)?:(?!=)/.exec(raw);
    if (m) out.push({ name: m[1]!, line: i + 1 });
  });
  return out;
}

function jsonScripts(
  files: FileIndex,
  path: string,
  source: ScriptSource,
  scope: string,
): ScriptDef[] {
  const data = files.readJson<unknown>(path);
  const scripts = isRecord(data) ? data.scripts : undefined;
  if (!isRecord(scripts)) return [];
  const text = files.read(path);
  return Object.keys(scripts).map((name) => ({
    source,
    name,
    scope,
    evidence: ev(
      path,
      `#scripts.${name}`,
      lineOf(text, new RegExp(`^\\s*"${escapeRegExp(name)}"\\s*:`)),
    ),
  }));
}

function lineScripts(
  files: FileIndex,
  dir: string,
  names: string[],
  source: ScriptSource,
  parse: (text: string) => NamedLine[],
): ScriptDef[] {
  for (const n of names) {
    const path = joinPath(dir, n);
    const text = files.read(path);
    if (text === undefined) continue;
    return parse(text).map(({ name, line }) => ({
      source,
      name,
      scope: dir,
      evidence: ev(path, `#${name}`, line),
    }));
  }
  return [];
}

function melosScripts(files: FileIndex, dir: string): ScriptDef[] {
  const path = joinPath(dir, 'melos.yaml');
  const scripts = readYaml(files, path)?.scripts;
  if (!isRecord(scripts)) return [];
  const text = files.read(path);
  return Object.keys(scripts).map((name) => ({
    source: 'melos' as const,
    name,
    scope: dir,
    evidence: ev(
      path,
      `#scripts.${name}`,
      lineOf(text, new RegExp(`^\\s+${escapeRegExp(name)}\\s*:`)),
    ),
  }));
}

/** Every named, invokable script per workspace (SPEC §2.4). */
export function detectScripts(files: FileIndex, workspaces: readonly Workspace[]): ScriptDef[] {
  return workspaces.flatMap(({ dir }) => [
    ...jsonScripts(files, joinPath(dir, 'package.json'), 'npm', dir),
    ...jsonScripts(files, joinPath(dir, 'composer.json'), 'composer', dir),
    ...lineScripts(files, dir, ['Makefile', 'makefile', 'GNUmakefile'], 'make', makeTargets),
    ...lineScripts(files, dir, ['justfile', 'Justfile', '.justfile'], 'just', justRecipes),
    ...melosScripts(files, dir),
  ]);
}
