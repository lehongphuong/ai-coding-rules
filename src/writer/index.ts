import type { RenderedFile, WritePlan } from '../types.js';

export interface PlanOptions {
  /** Overwrite hand-edited managed blocks. */
  force?: boolean;
}

/** Merge a rendered file into existing content. (T3 — stub) */
export function planWrite(
  _file: RenderedFile,
  _existing: string | undefined,
  _options: PlanOptions = {},
): WritePlan {
  throw new Error('planWrite: not implemented');
}

/** planWrite for each file, reading existing content from `root`. (T3 — stub) */
export function planWrites(
  _root: string,
  _files: readonly RenderedFile[],
  _options: PlanOptions = {},
): WritePlan[] {
  throw new Error('planWrites: not implemented');
}

/** Write create/update plans to disk (never conflicts). Returns written paths. (T3 — stub) */
export function applyPlans(
  _root: string,
  _plans: readonly WritePlan[],
  _options: { dryRun?: boolean } = {},
): string[] {
  throw new Error('applyPlans: not implemented');
}
