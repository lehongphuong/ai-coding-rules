import { describe, expect, it } from 'vitest';
import { buildRuleSet, compareRules, isDisabled, PACKS } from '../../src/rules/index.js';
import type { Rule } from '../../src/types.js';
import { config, fact, project } from './helpers.js';
import { SCENARIOS } from './scenarios.js';

const ids = (rules: Rule[]): string[] => rules.map((r) => `${r.scope}:${r.id}`);

describe('buildRuleSet', () => {
  it('exposes every required pack in order', () => {
    expect(PACKS.map((p) => p.id)).toEqual([
      'common',
      'typescript',
      'javascript',
      'react',
      'nextjs',
      'vue',
      'nestjs',
      'express',
      'flutter',
      'dart',
      'laravel',
      'php',
      'python',
      'django',
      'fastapi',
      'go',
      'jvm',
      'monorepo',
    ]);
  });

  it('disables rules by exact id and by pack/*', () => {
    const facts = SCENARIOS.nestjs!();
    const all = buildRuleSet(facts, config()).rules;
    expect(all.some((r) => r.id === 'common/no-secrets')).toBe(true);
    expect(all.some((r) => r.pack === 'nestjs')).toBe(true);

    const some = buildRuleSet(facts, config({ disable: ['common/no-secrets', 'nestjs/*'] })).rules;
    expect(some.some((r) => r.id === 'common/no-secrets')).toBe(false);
    expect(some.some((r) => r.pack === 'nestjs')).toBe(false);
    expect(some.some((r) => r.id === 'common/overview')).toBe(true);
  });

  it('matches disable patterns', () => {
    const r = { id: 'common/command-test', pack: 'common' };
    expect(isDisabled(r, ['common/command-test'])).toBe(true);
    expect(isDisabled(r, ['common/*'])).toBe(true);
    expect(isDisabled(r, ['common/command-*'])).toBe(true);
    expect(isDisabled(r, ['common/command'])).toBe(false);
    expect(isDisabled(r, ['nestjs/*'])).toBe(false);
  });

  it('appends custom rules with config evidence', () => {
    const rs = buildRuleSet(
      project([fact('language', 'go')], [{ dir: 'svc', name: 'svc' }]),
      config({
        custom: [
          {
            id: 'team/pr-size',
            section: 'dos-donts',
            text: 'Keep pull requests under 400 changed lines.',
          },
          {
            id: 'team/svc',
            section: 'architecture',
            text: 'Talk to svc over gRPC only.',
            scope: 'svc',
          },
        ],
      }),
    );
    expect(rs.rules.find((r) => r.id === 'team/pr-size')).toEqual({
      id: 'team/pr-size',
      section: 'dos-donts',
      text: 'Keep pull requests under 400 changed lines.',
      scope: '',
      pack: 'custom',
      evidence: [{ file: '.ai-rules/config.yaml', pointer: '#rules.custom' }],
      priority: 50,
    });
    expect(rs.rules.find((r) => r.id === 'team/svc')?.scope).toBe('svc');
    expect(rs.scopes.map((s) => s.dir)).toEqual(['', 'svc']);
  });

  it('custom rules can be disabled too', () => {
    const rs = buildRuleSet(
      project([]),
      config({
        custom: [{ id: 'team/x', section: 'dos-donts', text: 'X.' }],
        disable: ['team/*'],
      }),
    );
    expect(rs.rules).toEqual([]);
  });

  it('does not repeat root rules in child scopes', () => {
    const rs = buildRuleSet(
      project(
        [
          fact('packageManager', 'pnpm'),
          fact('ci', 'github-actions'),
          fact('language', 'typescript', { scope: 'pkg' }),
        ],
        [{ dir: 'pkg', name: 'pkg' }],
      ),
      config(),
    );
    const pm = rs.rules.filter((r) => r.id === 'common/package-manager');
    expect(pm.map((r) => r.scope)).toEqual(['']);
    expect(rs.rules.filter((r) => r.id === 'common/ci').map((r) => r.scope)).toEqual(['']);
    expect(rs.rules.some((r) => r.scope === 'pkg' && r.id === 'typescript/ts-only')).toBe(true);
  });

  it('dedupes identical (scope, id) pairs', () => {
    const rs = buildRuleSet(
      project([fact('language', 'go')]),
      config({
        custom: [
          { id: 'team/a', section: 'dos-donts', text: 'A.' },
          { id: 'team/a', section: 'dos-donts', text: 'A again.' },
        ],
      }),
    );
    expect(rs.rules.filter((r) => r.id === 'team/a').map((r) => r.text)).toEqual(['A.']);
  });

  it('sorts deterministically regardless of fact order', () => {
    const facts = SCENARIOS.monorepo!();
    const a = buildRuleSet(facts, config());
    const b = buildRuleSet({ ...facts, facts: [...facts.facts].reverse() }, config());
    expect(ids(a.rules)).toEqual(ids(b.rules));
    expect([...a.rules].sort(compareRules)).toEqual(a.rules);

    const scopes = a.rules.map((r) => r.scope);
    expect(scopes.indexOf('apps/api')).toBeGreaterThan(scopes.lastIndexOf(''));
    expect(scopes.indexOf('apps/mobile')).toBeGreaterThan(scopes.lastIndexOf('apps/api'));
  });

  it('fills project and scopes', () => {
    const facts = { ...SCENARIOS.nestjs!(), description: 'Orders API' };
    const rs = buildRuleSet(facts, config());
    expect(rs.project).toEqual({ name: 'api', description: 'Orders API' });
    expect(rs.scopes).toEqual([{ dir: '', name: 'api', summary: 'NestJS · TypeScript · pnpm' }]);
  });

  it('always lists the root scope, even without rules', () => {
    const rs = buildRuleSet(project([], [{ dir: 'empty', name: 'empty' }]), config());
    expect(rs.rules).toEqual([]);
    expect(rs.scopes).toEqual([{ dir: '', name: 'demo', summary: '' }]);
  });
});
