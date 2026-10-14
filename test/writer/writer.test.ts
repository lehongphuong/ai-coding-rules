import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shortHash } from '../../src/core/hash.js';
import { applyPlans, parseBlocks, planWrite, planWrites, renderBlock } from '../../src/writer/index.js';
import type { RenderedFile } from '../../src/types.js';

const file = (blocks: [string, string][], extra: Partial<RenderedFile> = {}): RenderedFile => ({
  path: 'AGENTS.md',
  target: 'agents',
  header: '# demo',
  blocks: blocks.map(([id, content]) => ({ id, content })),
  ...extra,
});

const base = file([
  ['overview', '## Project overview\n- A demo.'],
  ['commands', '## Commands\n- `npm test`'],
]);

const block = (id: string, content: string) => renderBlock({ id, content });

describe('renderBlock / parseBlocks', () => {
  it('renders markers with the body hash', () => {
    expect(block('commands', '## Commands\n- x\n')).toBe(
      `<!-- ai-rules:begin id=commands hash=${shortHash('## Commands\n- x')} -->\n## Commands\n- x\n<!-- ai-rules:end id=commands -->`,
    );
  });

  it('parses blocks, offsets and front matter', () => {
    const text = `---\na: 1\n---\n\nintro\n${block('x', 'X')}\nmid\n${block('y', 'Y1\nY2')}\n`;
    const parsed = parseBlocks(text);
    expect(parsed.frontMatter).toEqual({ raw: 'a: 1', endOffset: 13 });
    expect(parsed.blocks.map((b) => [b.id, b.body, b.startLine, b.endLine])).toEqual([
      ['x', 'X', 6, 8],
      ['y', 'Y1\nY2', 10, 13],
    ]);
    const y = parsed.blocks[1]!;
    expect(text.slice(y.startOffset, y.endOffset)).toBe(`${block('y', 'Y1\nY2')}\n`);
    expect(y.hash).toBe(shortHash('Y1\nY2'));
  });

  it('ignores unterminated begin markers', () => {
    const text = `<!-- ai-rules:begin id=a hash=00000000 -->\nstray\n${block('b', 'B')}\n`;
    expect(parseBlocks(text).blocks.map((b) => b.id)).toEqual(['b']);
    expect(parseBlocks('<!-- ai-rules:begin id=a -->\nno end\n').blocks).toEqual([]);
  });

  it('normalises CRLF bodies', () => {
    const text = block('a', 'L1\nL2').replace(/\n/g, '\r\n') + '\r\n';
    const [a] = parseBlocks(text).blocks;
    expect(a!.body).toBe('L1\nL2');
    expect(a!.endOffset).toBe(text.length);
  });
});

describe('planWrite', () => {
  it('creates a new file', () => {
    const plan = planWrite(base, undefined);
    expect(plan.status).toBe('create');
    expect(plan.content).toBe(
      `# demo\n\n${block('overview', '## Project overview\n- A demo.')}\n\n${block('commands', '## Commands\n- `npm test`')}\n`,
    );
    expect(plan.diff).toContain('+# demo');
    expect(plan.conflicts).toEqual([]);
  });

  it('creates with front matter', () => {
    const plan = planWrite(file([['a', 'A']], { header: undefined, frontMatter: 'applyTo: "x/**"\n' }), undefined);
    expect(plan.content).toBe(`---\napplyTo: "x/**"\n---\n\n${block('a', 'A')}\n`);
  });

  it('is idempotent', () => {
    const created = planWrite(base, undefined).content;
    const again = planWrite(base, created);
    expect(again).toMatchObject({ status: 'unchanged', diff: '', content: created });
    const withFm = file([['a', 'A']], { frontMatter: 'k: v' });
    expect(planWrite(withFm, planWrite(withFm, undefined).content).status).toBe('unchanged');
  });

  it('preserves user text before, between and after blocks byte-for-byte', () => {
    const existing =
      `# My project\n\nHand-written intro.  \n\n` +
      `${block('overview', 'old overview')}\n` +
      `\n<!-- user comment -->\nBetween text\n\n` +
      `${block('commands', 'old commands')}\n\n## Footer\nkeep me\n`;
    const plan = planWrite(base, existing);
    expect(plan.status).toBe('update');
    expect(plan.content).toBe(
      `# My project\n\nHand-written intro.  \n\n` +
        `${block('overview', '## Project overview\n- A demo.')}\n` +
        `\n<!-- user comment -->\nBetween text\n\n` +
        `${block('commands', '## Commands\n- `npm test`')}\n\n## Footer\nkeep me\n`,
    );
    expect(plan.diff).toContain('-old overview');
    expect(planWrite(base, plan.content).status).toBe('unchanged');
  });

  it('inserts new blocks after the last managed block', () => {
    const existing = `# x\n\n${block('overview', '## Project overview\n- A demo.')}\n\nTail text\n`;
    const plan = planWrite(base, existing);
    expect(plan.content).toBe(
      `# x\n\n${block('overview', '## Project overview\n- A demo.')}\n\n` +
        `${block('commands', '## Commands\n- `npm test`')}\n\nTail text\n`,
    );
  });

  it('appends blocks to a file without managed blocks', () => {
    const plan = planWrite(base, '# Existing\nNotes');
    expect(plan.status).toBe('update');
    expect(plan.content).toBe(
      `# Existing\nNotes\n\n${block('overview', '## Project overview\n- A demo.')}\n\n${block('commands', '## Commands\n- `npm test`')}\n`,
    );
  });

  it('removes blocks that are no longer generated', () => {
    const existing = `# x\n\n${block('overview', 'o')}\n\n${block('legacy', 'gone')}\n\n${block('commands', 'c')}\n\nend\n`;
    const plan = planWrite(base, existing);
    expect(plan.content).not.toContain('legacy');
    expect(plan.content).toBe(
      `# x\n\n${block('overview', '## Project overview\n- A demo.')}\n\n${block('commands', '## Commands\n- `npm test`')}\n\nend\n`,
    );
  });

  it('flags hand-edited blocks as conflicts unless forced', () => {
    const created = planWrite(base, undefined).content;
    const edited = created.replace('- A demo.', '- A demo, edited by hand.');
    const plan = planWrite(base, edited);
    expect(plan.status).toBe('conflict');
    expect(plan.conflicts).toEqual(['overview']);
    expect(plan.content).toBe(created);
    const forced = planWrite(base, edited, { force: true });
    expect(forced).toMatchObject({ status: 'update', content: created, conflicts: [] });
  });

  it('flags a hand-edited block that would be removed', () => {
    const existing = `${block('legacy', 'x').replace('\nx\n', '\nedited\n')}\n`;
    expect(planWrite(base, existing)).toMatchObject({ status: 'conflict', conflicts: ['legacy'] });
  });

  it('replaces existing front matter and inserts missing front matter', () => {
    const f = file([['a', 'A']], { frontMatter: 'description: new\nalwaysApply: true' });
    const existing = `---\ndescription: old\n---\n\nUser note\n${block('a', 'A')}\n`;
    expect(planWrite(f, existing).content).toBe(
      `---\ndescription: new\nalwaysApply: true\n---\n\nUser note\n${block('a', 'A')}\n`,
    );
    expect(planWrite(f, `${block('a', 'A')}\n`).content).toBe(
      `---\ndescription: new\nalwaysApply: true\n---\n\n${block('a', 'A')}\n`,
    );
  });

  it('handles CRLF files and keeps their line endings', () => {
    const created = planWrite(base, undefined).content.replace(/\n/g, '\r\n');
    expect(planWrite(base, created).status).toBe('unchanged');

    const crlf = `Intro\r\n\r\n${block('overview', 'old').replace(/\n/g, '\r\n')}\r\n\r\nOutro\r\n`;
    const plan = planWrite(base, crlf);
    expect(plan.status).toBe('update');
    expect(plan.content).not.toMatch(/[^\r]\n/);
    expect(plan.content.startsWith('Intro\r\n\r\n')).toBe(true);
    expect(plan.content.endsWith('\r\n\r\nOutro\r\n')).toBe(true);
    expect(planWrite(base, plan.content).status).toBe('unchanged');
  });

  it('treats unterminated markers as plain text', () => {
    const existing = `<!-- ai-rules:begin id=overview hash=12345678 -->\nhalf\n`;
    const plan = planWrite(base, existing);
    expect(plan.status).toBe('update');
    expect(plan.content.startsWith(existing)).toBe(true);
    expect(parseBlocks(plan.content).blocks.map((b) => b.id)).toEqual(['overview', 'commands']);
  });
});

describe('planWrites / applyPlans', () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'ai-rules-writer-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const files = [base, file([['a', 'A']], { path: 'apps/api/AGENTS.md' })];

  it('writes create/update plans and nothing on dry run', () => {
    const root = tmp();
    const plans = planWrites(root, files);
    expect(plans.map((p) => p.status)).toEqual(['create', 'create']);

    expect(applyPlans(root, plans, { dryRun: true })).toEqual(['AGENTS.md', 'apps/api/AGENTS.md']);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'apps'))).toBe(false);

    expect(applyPlans(root, plans)).toEqual(['AGENTS.md', 'apps/api/AGENTS.md']);
    expect(readFileSync(join(root, 'apps/api/AGENTS.md'), 'utf8')).toBe(plans[1]!.content);

    const again = planWrites(root, files);
    expect(again.map((p) => p.status)).toEqual(['unchanged', 'unchanged']);
    expect(applyPlans(root, again)).toEqual([]);
  });

  it('never writes conflicts', () => {
    const root = tmp();
    applyPlans(root, planWrites(root, files));
    const path = join(root, 'AGENTS.md');
    const edited = readFileSync(path, 'utf8').replace('- A demo.', '- mine');
    writeFileSync(path, edited);
    const plans = planWrites(root, files);
    expect(plans[0]!.status).toBe('conflict');
    expect(applyPlans(root, plans)).toEqual([]);
    expect(readFileSync(path, 'utf8')).toBe(edited);

    expect(applyPlans(root, planWrites(root, files, { force: true }))).toEqual(['AGENTS.md']);
    expect(readFileSync(path, 'utf8')).not.toContain('- mine');
  });
});
