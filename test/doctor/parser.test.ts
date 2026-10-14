import { describe, expect, it } from 'vitest';
import { createMemoryFileIndex } from '../../src/core/index.js';
import { parseInstructionDoc, parseInstructionFiles } from '../../src/doctor/parser.js';

describe('parseInstructionDoc', () => {
  it('parses front matter, sections and code lines', () => {
    const doc = parseInstructionDoc(
      '.cursor/rules/testing.mdc',
      [
        '---',
        'description: Testing',
        'globs: "apps/api/**"',
        'alwaysApply: false',
        '---',
        'Intro line',
        '',
        '# Testing',
        'Use Vitest.',
        '```bash',
        '# not a heading',
        'pnpm test',
        '```',
        '',
        '## More',
        'text',
        '',
      ].join('\n'),
    );
    expect(doc.agents).toEqual(['cursor']);
    expect(doc.frontMatter).toEqual({
      description: 'Testing',
      globs: 'apps/api/**',
      alwaysApply: false,
    });
    expect(doc.lines[0]).toBe('---');
    expect(doc.sections).toEqual([
      { heading: '', level: 0, startLine: 6, endLine: 6, generated: false },
      { heading: 'Testing', level: 1, startLine: 8, endLine: 13, generated: false },
      { heading: 'More', level: 2, startLine: 15, endLine: 16, generated: false },
    ]);
    expect([...doc.codeLines]).toEqual([10, 11, 12, 13]);
  });

  it('ignores invalid front matter YAML', () => {
    const doc = parseInstructionDoc('CLAUDE.md', '---\n: : [\n---\n# Hi\ntext\n');
    expect(doc.frontMatter).toBeUndefined();
    expect(doc.sections[0]).toMatchObject({ heading: 'Hi', startLine: 4 });
  });

  it('flags sections inside managed blocks as generated', () => {
    const doc = parseInstructionDoc(
      'AGENTS.md',
      [
        '# Project',
        'hand written',
        '<!-- ai-rules:begin id=commands hash=1a2b3c4d -->',
        '## Commands',
        '- `pnpm test`',
        '<!-- ai-rules:end id=commands -->',
        '## Notes',
        'mine',
      ].join('\n'),
    );
    expect(doc.sections.map((s) => [s.heading, s.generated])).toEqual([
      ['Project', false],
      ['Commands', true],
      ['Notes', false],
    ]);
  });

  it('extracts Claude imports, ignoring emails, npm scopes and code', () => {
    const doc = parseInstructionDoc(
      'apps/api/CLAUDE.md',
      [
        '@AGENTS.md',
        'See @../../docs/style.md and @./notes.md.',
        'Mail me at dev@example.com or ping @john.',
        'Install @nestjs/core and @types/node.',
        '`@ignored.md`',
        '```',
        '@also-ignored.md',
        '```',
        'Home: @~/.claude/prefs.md',
      ].join('\n'),
    );
    expect(doc.imports).toEqual(['apps/api/AGENTS.md', 'docs/style.md', 'apps/api/notes.md']);
  });
});

describe('parseInstructionFiles', () => {
  it('parses all known instruction files sorted by path', () => {
    const files = createMemoryFileIndex({
      'CLAUDE.md': '# c',
      'AGENTS.md': '# a',
      'apps/web/AGENTS.md': '# w',
      '.cursorrules': 'x',
      '.cursor/rules/a.mdc': 'y',
      '.github/instructions/api.instructions.md': 'z',
      'README.md': '# not an instruction file',
      'src/index.ts': '',
    });
    expect(parseInstructionFiles(files).map((d) => d.path)).toEqual([
      '.cursor/rules/a.mdc',
      '.cursorrules',
      '.github/instructions/api.instructions.md',
      'AGENTS.md',
      'CLAUDE.md',
      'apps/web/AGENTS.md',
    ]);
  });
});
