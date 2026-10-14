import { describe, expect, it } from 'vitest';
import { evaluatePack, type RulePack } from '../../src/rules/pack.js';
import { createFactQuery } from '../../src/rules/query.js';
import { fact, project } from './helpers.js';

const pack: RulePack = {
  id: 'demo',
  appliesTo: () => true,
  rules: [
    { id: 'demo/static', section: 'code-style', text: 'Use Go.', evidence: ['language'] },
    {
      id: 'demo/dynamic',
      section: 'testing',
      priority: 5,
      text: (q) => `Run ${q.values('testRunner').join(', ')}.`,
      evidence: (q) => q.evidence('testRunner'),
    },
    {
      id: 'demo/conditional',
      section: 'overview',
      when: (q) => q.has('framework', 'nestjs'),
      text: 'Nest.',
      evidence: ['framework'],
    },
    { id: 'demo/no-evidence', section: 'overview', text: 'Unbacked.', evidence: ['orm'] },
    { id: 'demo/empty-text', section: 'overview', text: () => ' ', evidence: ['language'] },
  ],
  expand: (q) =>
    q.values('ci').map((ci) => ({
      id: `demo/ci-${ci}`,
      section: 'dos-donts' as const,
      text: `CI: ${ci}`,
      evidence: ['ci' as const],
    })),
};

describe('evaluatePack', () => {
  const p = project([
    fact('language', 'go', { evidence: [{ file: 'go.mod' }] }),
    fact('testRunner', 'go-test', { evidence: [{ file: 'go.mod' }] }),
    fact('ci', 'github-actions'),
    fact('framework', 'flutter'),
  ]);
  const rules = evaluatePack(pack, createFactQuery(p));

  it('evaluates text, evidence, scope, pack and default priority', () => {
    expect(rules.find((r) => r.id === 'demo/static')).toEqual({
      id: 'demo/static',
      section: 'code-style',
      text: 'Use Go.',
      scope: '',
      pack: 'demo',
      evidence: [{ file: 'go.mod' }],
      priority: 50,
    });
    expect(rules.find((r) => r.id === 'demo/dynamic')).toMatchObject({
      text: 'Run go-test.',
      priority: 5,
    });
  });

  it('honours when()', () => {
    expect(rules.some((r) => r.id === 'demo/conditional')).toBe(false);
  });

  it('drops rules with empty evidence or empty text', () => {
    expect(rules.some((r) => r.id === 'demo/no-evidence')).toBe(false);
    expect(rules.some((r) => r.id === 'demo/empty-text')).toBe(false);
  });

  it('includes expanded templates', () => {
    expect(rules.find((r) => r.id === 'demo/ci-github-actions')?.text).toBe('CI: github-actions');
  });
});
