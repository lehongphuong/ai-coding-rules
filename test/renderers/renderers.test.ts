import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { getRenderer, renderTargets, RENDERERS } from '../../src/renderers/index.js';
import { evidenceComment, groupByScope, renderRuleLine, scopeSlug } from '../../src/renderers/shared.js';
import { planWrite } from '../../src/writer/index.js';
import { TARGET_IDS } from '../../src/types.js';
import type { RenderedFile, RenderOptions, TargetId } from '../../src/types.js';
import { rule, sampleRuleSet } from './helpers.js';

const lean: RenderOptions = { claudeMode: 'import', evidence: 'none' };
const withEvidence: RenderOptions = { claudeMode: 'import', evidence: 'comment' };

/** Render files to their final on-disk text, keyed by path. */
function materialise(files: RenderedFile[]): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f.path, planWrite(f, undefined).content]));
}

describe('shared helpers', () => {
  it('slugs scopes', () => {
    expect(scopeSlug('')).toBe('root');
    expect(scopeSlug('apps/api')).toBe('apps-api');
    expect(scopeSlug('packages/@acme/UI kit')).toBe('packages-acme-ui-kit');
  });

  it('formats evidence comments with dedupe and +N', () => {
    expect(evidenceComment([])).toBe('');
    expect(
      evidenceComment([
        { file: 'a' },
        { file: 'a' },
        { file: 'b', pointer: '#x' },
        { file: 'c', pointer: 'y' },
        { file: 'd' },
        { file: 'e' },
      ]),
    ).toBe(' <!-- from: a, b#x, c#y +2 -->');
  });

  it('marks inferred rules and flattens newlines', () => {
    const r = rule('ai/x', 'overview', 'line one\nline two', '', { inferred: true });
    expect(renderRuleLine(r, lean)).toBe('- line one line two _(inferred)_');
    expect(renderRuleLine(r, withEvidence)).toBe('- line one line two _(inferred)_ <!-- from: package.json -->');
  });

  it('groups scopes: root first, scopes with rules only, unknown scopes appended', () => {
    const rs = sampleRuleSet();
    rs.scopes.push({ dir: 'apps/empty', name: 'empty', summary: '' });
    rs.rules.push(rule('x/y', 'overview', 'Orphan.', 'libs/z'));
    expect(groupByScope(rs).map((g) => g.dir)).toEqual(['', 'apps/api', 'apps/mobile', 'libs/z']);
  });
});

describe('renderers (snapshots)', () => {
  for (const target of TARGET_IDS) {
    it(`${target}: lean`, () => {
      expect(materialise(getRenderer(target).render(sampleRuleSet(), lean))).toMatchSnapshot();
    });
  }

  it('agents: with evidence comments', () => {
    expect(materialise(getRenderer('agents').render(sampleRuleSet(), withEvidence))).toMatchSnapshot();
  });

  it('claude: full mode matches agents layout', () => {
    const full = getRenderer('claude').render(sampleRuleSet(), { ...lean, claudeMode: 'full' });
    const agents = getRenderer('agents').render(sampleRuleSet(), lean);
    expect(full.map((f) => f.path)).toEqual(['CLAUDE.md', 'apps/api/CLAUDE.md', 'apps/mobile/CLAUDE.md']);
    expect(full.map((f) => f.blocks)).toEqual(agents.map((f) => f.blocks));
    expect(materialise(full)).toMatchSnapshot();
  });
});

describe('agents renderer', () => {
  it('renders root and scoped files with one block per non-empty section', () => {
    const files = getRenderer('agents').render(sampleRuleSet(), lean);
    expect(files.map((f) => f.path)).toEqual(['AGENTS.md', 'apps/api/AGENTS.md', 'apps/mobile/AGENTS.md']);
    expect(files[0]!.header).toBe('# acme\n\nMonorepo for the Acme apps.');
    expect(files[0]!.blocks.map((b) => b.id)).toEqual(['overview', 'commands', 'code-style', 'architecture', 'security']);
    expect(files[0]!.blocks[1]!.content).toBe(
      '## Commands\n- Use `pnpm` for all package commands; never use npm or yarn.\n- Test: `pnpm test`',
    );
    expect(files[1]!.header).toBe('# @acme/api\n\nNestJS · TypeScript');
  });

  it('is deterministic', () => {
    const a = renderTargets(sampleRuleSet(), TARGET_IDS, withEvidence);
    const b = renderTargets(sampleRuleSet(), TARGET_IDS, withEvidence);
    expect(a).toEqual(b);
  });

  it('renders a root file even without rules', () => {
    const files = getRenderer('agents').render({ project: { name: 'x' }, rules: [], scopes: [] }, lean);
    expect(files).toEqual([{ path: 'AGENTS.md', target: 'agents', header: '# x', blocks: [] }]);
  });
});

describe('claude renderer (import mode)', () => {
  it('imports AGENTS.md and adds notes', () => {
    const files = getRenderer('claude').render(sampleRuleSet(), lean);
    expect(files.map((f) => f.path)).toEqual(['CLAUDE.md', 'apps/api/CLAUDE.md', 'apps/mobile/CLAUDE.md']);
    const root = files[0]!;
    expect(root.header).toBe('# acme');
    expect(root.blocks[0]).toEqual({ id: 'imports', content: '@AGENTS.md' });
    expect(root.blocks[1]!.content).toContain('Run the test command from AGENTS.md');
  });

  it('omits command bullets when there are no commands', () => {
    const mobile = getRenderer('claude').render(sampleRuleSet(), lean)[2]!;
    expect(mobile.blocks[1]!.content).not.toMatch(/command/i);
  });
});

describe('cursor renderer', () => {
  const files = getRenderer('cursor').render(sampleRuleSet(), lean);

  it('emits one .mdc per scope and section', () => {
    expect(files.map((f) => f.path)).toEqual([
      '.cursor/rules/root-overview.mdc',
      '.cursor/rules/root-commands.mdc',
      '.cursor/rules/root-code-style.mdc',
      '.cursor/rules/root-architecture.mdc',
      '.cursor/rules/root-security.mdc',
      '.cursor/rules/apps-api-commands.mdc',
      '.cursor/rules/apps-api-architecture.mdc',
      '.cursor/rules/apps-mobile-architecture.mdc',
      '.cursor/rules/apps-mobile-testing.mdc',
    ]);
    for (const f of files) expect(f.blocks).toHaveLength(1);
  });

  it('front matter is valid YAML with expected keys', () => {
    const fm = (path: string) => parse(files.find((f) => f.path === path)!.frontMatter!);
    expect(fm('.cursor/rules/root-overview.mdc')).toEqual({
      description: 'Project overview for acme',
      alwaysApply: true,
    });
    expect(fm('.cursor/rules/root-security.mdc')).toEqual({ description: 'Security for acme', alwaysApply: false });
    expect(fm('.cursor/rules/apps-api-commands.mdc')).toEqual({
      description: 'Commands for @acme/api',
      globs: 'apps/api/**',
      alwaysApply: false,
    });
  });

  it('quotes values that need it', () => {
    const rs = sampleRuleSet();
    rs.project.name = 'weird: name #1';
    const root = getRenderer('cursor').render(rs, lean)[0]!;
    expect(parse(root.frontMatter!).description).toBe('Project overview for weird: name #1');
  });
});

describe('copilot renderer', () => {
  it('writes repo-wide and path-specific instructions', () => {
    const files = getRenderer('copilot').render(sampleRuleSet(), lean);
    expect(files.map((f) => f.path)).toEqual([
      '.github/copilot-instructions.md',
      '.github/instructions/apps-api.instructions.md',
      '.github/instructions/apps-mobile.instructions.md',
    ]);
    expect(files[0]!.frontMatter).toBeUndefined();
    expect(files[1]!.frontMatter).toBe('applyTo: "apps/api/**"');
    expect(parse(files[2]!.frontMatter!)).toEqual({ applyTo: 'apps/mobile/**' });
  });
});

describe('renderTargets', () => {
  it('keeps target order, de-duplicates targets and sorts files per target', () => {
    const files = renderTargets(sampleRuleSet(), ['gemini', 'agents', 'gemini'] as TargetId[], lean);
    expect(files.map((f) => `${f.target}:${f.path}`)).toEqual([
      'gemini:GEMINI.md',
      'gemini:apps/api/GEMINI.md',
      'gemini:apps/mobile/GEMINI.md',
      'agents:AGENTS.md',
      'agents:apps/api/AGENTS.md',
      'agents:apps/mobile/AGENTS.md',
    ]);
    const cursor = renderTargets(sampleRuleSet(), ['cursor'], lean).map((f) => f.path);
    expect(cursor).toEqual([...cursor].sort());
  });

  it('has a renderer for every target', () => {
    for (const t of TARGET_IDS) expect(RENDERERS[t].target).toBe(t);
    expect(() => getRenderer('nope' as TargetId)).toThrow(/Unknown target/);
  });
});
