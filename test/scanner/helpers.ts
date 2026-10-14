import type { Detector, Fact, FactKey } from '../../src/types.js';
import { createMemoryFileIndex } from '../../src/core/index.js';

/** Run a detector over an in-memory repo. */
export function run(detector: Detector, contents: Record<string, string>, dir = ''): Fact[] {
  return detector.detect({ files: createMemoryFileIndex(contents), dir });
}

/** Values of `key` facts (in emission order). */
export function values(facts: readonly Fact[], key: FactKey): unknown[] {
  return facts.filter((f) => f.key === key).map((f) => f.value);
}

export function find(facts: readonly Fact[], key: FactKey, value: unknown): Fact | undefined {
  return facts.find((f) => f.key === key && f.value === value);
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
