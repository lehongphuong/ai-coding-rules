import type { Fact, FactKey, FactValue, Workspace } from '../types.js';

/** Facts with `key` in exactly `scope`. */
export function factsFor(facts: readonly Fact[], key: FactKey, scope = ''): Fact[] {
  return facts.filter((f) => f.key === key && f.scope === scope);
}

export function hasFact(
  facts: readonly Fact[],
  key: FactKey,
  value: FactValue,
  scope = '',
): boolean {
  return facts.some((f) => f.key === key && f.value === value && f.scope === scope);
}

/** Highest-confidence fact for `key` in `scope`, or undefined. */
export function bestFact(facts: readonly Fact[], key: FactKey, scope = ''): Fact | undefined {
  let best: Fact | undefined;
  for (const f of facts) {
    if (f.key !== key || f.scope !== scope) continue;
    if (!best || f.confidence > best.confidence) best = f;
  }
  return best;
}

/** Nearest workspace dir containing `path` ("" when only root matches). */
export function scopeOf(path: string, workspaces: readonly Workspace[]): string {
  let best = '';
  for (const w of workspaces) {
    if (w.dir === '') continue;
    if ((path === w.dir || path.startsWith(`${w.dir}/`)) && w.dir.length > best.length) {
      best = w.dir;
    }
  }
  return best;
}

/** Merge facts with identical (key, value, scope), concatenating evidence. */
export function dedupeFacts(facts: readonly Fact[]): Fact[] {
  const map = new Map<string, Fact>();
  for (const f of facts) {
    const k = `${f.scope}\u0000${f.key}\u0000${String(f.value)}\u0000${f.meta?.kind ?? ''}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...f, evidence: [...f.evidence] });
      continue;
    }
    prev.confidence = Math.max(prev.confidence, f.confidence);
    for (const e of f.evidence) {
      if (!prev.evidence.some((x) => x.file === e.file && x.pointer === e.pointer)) {
        prev.evidence.push(e);
      }
    }
    if (f.meta) prev.meta = { ...f.meta, ...prev.meta };
  }
  return [...map.values()];
}

/** Join a workspace dir and a relative path. */
export function joinPath(dir: string, path: string): string {
  return dir ? `${dir}/${path}` : path;
}
