import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/core/index.js';
import { withImportedTargets } from '../../src/cli/pipeline.js';

describe('withImportedTargets', () => {
  it('adds agents when CLAUDE.md imports AGENTS.md', () => {
    const config = defaultConfig();
    expect(withImportedTargets(['claude'], config)).toEqual(['agents', 'claude']);
    expect(withImportedTargets(['cursor'], config)).toEqual(['cursor']);
    config.claude.mode = 'full';
    expect(withImportedTargets(['claude'], config)).toEqual(['claude']);
  });
});
