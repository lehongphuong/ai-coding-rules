import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/core/index.js';
import { checkBudget } from '../../src/doctor/checks/budget.js';
import { checkDuplicate, jaccard, shingle } from '../../src/doctor/checks/duplicate.js';
import { checkEmpty } from '../../src/doctor/checks/empty.js';
import { checkLegacy } from '../../src/doctor/checks/legacy.js';
import { brief, context, project } from './helpers.js';

const BLOCK = [
  '## Conventions',
  '',
  '- Keep functions small and focused on a single responsibility.',
  '- Prefer composition over inheritance when designing modules.',
  '- Write descriptive commit messages in the imperative mood.',
  '- Never commit secrets or credentials to the repository.',
].join('\n');

describe('duplicate', () => {
  it('computes shingles and Jaccard similarity', () => {
    expect([...shingle('A b, c d!')]).toEqual(['a b c', 'b c d']);
    expect(jaccard(shingle('a b c d'), shingle('a b c d'))).toBe(1);
    expect(jaccard(shingle('a b c d'), shingle('x y z'))).toBe(0);
  });

  it('reports near-duplicate sections across files', () => {
    const facts = project({
      'AGENTS.md': `# Agents\n\nIntro.\n\n${BLOCK}\n`,
      'CLAUDE.md': `# Claude\n\n${BLOCK.replace('small', 'short')}\n\n## Other\nsomething else\n`,
    });
    const findings = checkDuplicate(context(facts));
    expect(brief(findings)).toEqual(['CLAUDE.md:3 duplicate']);
    expect(findings[0]).toMatchObject({
      line: 3,
      endLine: 8,
      related: [{ file: 'AGENTS.md', line: 5, endLine: 10 }],
      severity: 'warning',
    });
    expect(findings[0]!.message).toMatch(/^CLAUDE\.md:3-8 ≈ AGENTS\.md:5-10 \(\d+% similar\)$/);
    expect(findings[0]!.hint).toBe(
      'Keep it in one file and import it (e.g. `@AGENTS.md` in CLAUDE.md).',
    );
  });

  it('compares whole heading-less files', () => {
    const body = BLOCK.split('\n').slice(2).join('\n');
    const facts = project({ '.cursorrules': body, '.windsurfrules': body });
    expect(brief(checkDuplicate(context(facts)))).toEqual(['.windsurfrules:1 duplicate']);
  });

  it('skips pairs where one file imports the other', () => {
    const facts = project({
      'AGENTS.md': `# A\n\n${BLOCK}\n`,
      'CLAUDE.md': `@AGENTS.md\n\n${BLOCK}\n`,
    });
    expect(checkDuplicate(context(facts))).toEqual([]);
  });

  it('skips pairs of generated sections but not generated vs hand-written', () => {
    const generated = (id: string): string =>
      `<!-- ai-rules:begin id=${id} hash=00000000 -->\n${BLOCK}\n<!-- ai-rules:end id=${id} -->`;
    const both = project({ 'AGENTS.md': generated('a'), 'GEMINI.md': `# G\n${generated('b')}\n` });
    expect(checkDuplicate(context(both))).toEqual([]);
    const mixed = project({ 'AGENTS.md': BLOCK, 'GEMINI.md': `# G\n${generated('b')}\n` });
    expect(brief(checkDuplicate(context(mixed)))).toEqual(['GEMINI.md:3 duplicate']);
  });

  it('skips short sections, the same file and dissimilar text', () => {
    const facts = project({
      'AGENTS.md': `# A\n\n${BLOCK}\n\n${BLOCK}\n`,
      'apps/a/AGENTS.md': '## Short\n- one\n- two\n',
      'apps/b/AGENTS.md': '## Short\n- one\n- two\n',
      '.cursorrules': '- Something entirely different here.\n- Use the API client.\n- Ship it.\n',
    });
    expect(checkDuplicate(context(facts))).toEqual([]);
  });

  it('honours the threshold', () => {
    const facts = project({
      'AGENTS.md': BLOCK,
      'GEMINI.md': BLOCK.replace('small', 'tiny').replace('composition', 'mixins'),
    });
    const config = defaultConfig();
    expect(checkDuplicate(context(facts, config))).toHaveLength(0);
    config.doctor.duplicateThreshold = 0.5;
    expect(checkDuplicate(context(facts, config))).toHaveLength(1);
  });
});

describe('budget', () => {
  it('emits an info line per agent and follows Claude imports once', () => {
    const facts = project({
      'AGENTS.md': 'a'.repeat(4400),
      'CLAUDE.md': '@AGENTS.md\n@docs/extra.md\n@AGENTS.md\n'.padEnd(2400, 'x'),
      'docs/extra.md': 'e'.repeat(400),
      '.cursor/rules/x.mdc': 'c'.repeat(40),
    });
    const findings = checkBudget(context(facts));
    expect(findings.map((f) => `${f.severity} ${f.file} ${f.message}`)).toEqual([
      'info CLAUDE.md claude ≈ 1.8k tokens (AGENTS.md 1.1k, CLAUDE.md 600, docs/extra.md 100)',
      'info AGENTS.md codex ≈ 1.1k tokens (AGENTS.md 1.1k)',
      'info .cursor/rules/x.mdc cursor ≈ 1.1k tokens (AGENTS.md 1.1k, .cursor/rules/x.mdc 10)',
      'info AGENTS.md copilot ≈ 1.1k tokens (AGENTS.md 1.1k)',
      'info AGENTS.md windsurf ≈ 1.1k tokens (AGENTS.md 1.1k)',
    ]);
  });

  it('warns per file and per agent over budget', () => {
    const facts = project({ 'AGENTS.md': 'a'.repeat(8800), 'GEMINI.md': 'g'.repeat(100) });
    const config = defaultConfig();
    config.doctor.budget = { perFile: 2000, perAgent: 2100 };
    const warnings = checkBudget(context(facts, config)).filter((f) => f.severity === 'warning');
    expect(warnings.map((f) => `${f.file} ${f.message}`)).toEqual([
      'AGENTS.md ≈ 2.2k tokens (budget 2k per file)',
      'AGENTS.md codex loads ≈ 2.2k tokens of instructions (budget 2.1k)',
      'AGENTS.md cursor loads ≈ 2.2k tokens of instructions (budget 2.1k)',
      'AGENTS.md copilot loads ≈ 2.2k tokens of instructions (budget 2.1k)',
      'AGENTS.md windsurf loads ≈ 2.2k tokens of instructions (budget 2.1k)',
    ]);
  });
});

describe('legacy', () => {
  it('flags .cursorrules and .windsurfrules only', () => {
    const facts = project({ '.cursorrules': 'x', '.windsurfrules': 'y', 'AGENTS.md': 'z' });
    const findings = checkLegacy(context(facts));
    expect(brief(findings)).toEqual(['.cursorrules legacy', '.windsurfrules legacy']);
    expect(findings[0]).toMatchObject({ severity: 'info' });
    expect(findings[0]!.hint).toContain('.cursor/rules/*.mdc');
    expect(findings[1]!.hint).toContain('.windsurf/rules/*.md');
  });
});

describe('empty', () => {
  it('flags files with only headings, front matter, markers or comments', () => {
    const facts = project({
      'AGENTS.md': '# Title\n\n## Section\n',
      'CLAUDE.md': '',
      '.cursor/rules/a.mdc': '---\ndescription: x\n---\n\n',
      'GEMINI.md': '<!-- ai-rules:begin id=a -->\n<!-- note -->\n<!-- ai-rules:end id=a -->\n',
      '.github/copilot-instructions.md': '# Title\nUse pnpm.\n',
      '.windsurfrules': '```\n# code only\n```\n',
    });
    expect(brief(checkEmpty(context(facts)))).toEqual([
      '.cursor/rules/a.mdc empty',
      'AGENTS.md empty',
      'CLAUDE.md empty',
      'GEMINI.md empty',
    ]);
  });
});
