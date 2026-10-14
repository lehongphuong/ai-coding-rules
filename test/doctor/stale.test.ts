import { describe, expect, it } from 'vitest';
import { checkStaleCommand } from '../../src/doctor/checks/stale-command.js';
import { checkStalePath } from '../../src/doctor/checks/stale-path.js';
import { brief, context, project, scripts } from './helpers.js';

function staleCommands(
  doc: string,
  opts: Parameters<typeof project>[1] = {},
  extra: Record<string, string> = {},
): string[] {
  const facts = project({ 'AGENTS.md': doc, 'package.json': '{}', ...extra }, opts);
  return checkStaleCommand(context(facts)).map((f) => `${f.line} ${f.message}`);
}

describe('stale/command', () => {
  const npmScripts = scripts(['build', 'test', 'lint', 'test:unit']);

  it('flags missing package.json scripts', () => {
    const doc = [
      'Run `pnpm test:e2e` for e2e tests.',
      'Run `npm run deploy` to ship.',
      '```bash',
      'pnpm build',
      'pnpm typecheck',
      'yarn run storybook',
      'bun run dev',
      '```',
    ].join('\n');
    expect(staleCommands(doc, { scripts: npmScripts })).toEqual([
      '1 `pnpm test:e2e` — script `test:e2e` is not defined in package.json',
      '2 `npm run deploy` — script `deploy` is not defined in package.json',
      '5 `pnpm typecheck` — script `typecheck` is not defined in package.json',
      '6 `yarn run storybook` — script `storybook` is not defined in package.json',
      '7 `bun run dev` — script `dev` is not defined in package.json',
    ]);
  });

  it('allows built-ins, existing scripts, binaries and flags', () => {
    const doc = [
      '```bash',
      'npm install',
      'npm ci && npm test',
      'npm run',
      'npm run test:unit -- --watch',
      'pnpm install --frozen-lockfile',
      'pnpm add -D vitest',
      'pnpm dlx create-vite',
      'pnpm exec tsc --noEmit',
      'pnpm vitest run',
      'pnpm -r build',
      'pnpm --filter api dev',
      'pnpm -F web dev',
      'npm run dev -w apps/web',
      'yarn',
      'yarn add lodash',
      'yarn workspace web dev',
      'yarn eslint .',
      'bun install',
      'bun build ./src/index.ts',
      'bun run src/index.ts',
      'bun test',
      'make',
      'just',
      '```',
    ].join('\n');
    expect(
      staleCommands(doc, {
        scripts: [...npmScripts, ...scripts(['dev'], 'npm', 'apps/web')],
        workspaces: [{ dir: 'apps/web', name: 'web' }],
      }),
    ).toEqual([]);
  });

  it('flags npm commands that are neither built-ins nor scripts', () => {
    expect(staleCommands('Run `npm lint` and `npm deploy`.', { scripts: npmScripts })).toEqual([
      '1 `npm lint` — npm has no `lint` command',
      '1 `npm deploy` — npm has no `deploy` command and no script `deploy` is defined',
    ]);
  });

  it('checks the doc scope and root, not sibling workspaces', () => {
    const facts = project(
      {
        'AGENTS.md': 'Run `pnpm dev`.\n',
        'apps/api/AGENTS.md': 'Run `pnpm dev` and `pnpm build`.\n',
      },
      {
        scripts: [...scripts(['build']), ...scripts(['dev'], 'npm', 'apps/api')],
        workspaces: [
          { dir: 'apps/api', name: 'api' },
          { dir: 'apps/web', name: 'web' },
        ],
      },
    );
    expect(brief(checkStaleCommand(context(facts)))).toEqual(['AGENTS.md:1 stale/command']);
  });

  it('accepts any scope when the doc changes directory or names a workspace', () => {
    const opts = {
      scripts: scripts(['dev'], 'npm', 'apps/web'),
      workspaces: [{ dir: 'apps/web', name: 'web' }],
    };
    expect(staleCommands('```bash\ncd apps/web\npnpm dev\n```', opts)).toEqual([]);
    expect(staleCommands('In apps/web run `pnpm dev`.', opts)).toEqual([]);
  });

  it('skips negated commands', () => {
    expect(staleCommands("Don't use `npm run old-build` anymore.")).toEqual([]);
  });

  it('checks Makefile targets', () => {
    const makefile = '.PHONY: lint\nlint test:\n\tnpm run lint\nVAR := 1\n';
    const extra = { Makefile: makefile };
    expect(staleCommands('Run `make lint`, `make test` and `make deploy`.', {}, extra)).toEqual([
      '1 `make deploy` — target `deploy` is not defined in Makefile',
    ]);
    expect(staleCommands('Run `make lint`.')).toEqual(['1 `make lint` — no Makefile found']);
    const included = { Makefile: 'include common.mk\nlint:\n' };
    expect(staleCommands('Run `make deploy`.', {}, included)).toEqual([]);
    expect(staleCommands('Run `make -C sub deploy`.', {}, extra)).toEqual([]);
  });

  it('checks justfile recipes', () => {
    const extra = {
      justfile: 'build:\n  cargo build\n@test *args:\n  cargo test\nalias b := build\n',
    };
    expect(staleCommands('`just build`, `just test`, `just b`, `just fmt`', {}, extra)).toEqual([
      '1 `just fmt` — recipe `fmt` is not defined in justfile',
    ]);
  });

  it('checks composer scripts, artisan and melos', () => {
    const opts = { scripts: scripts(['test', 'analyse'], 'composer') };
    const doc = [
      '```',
      'composer install',
      'composer test',
      'composer run analyse',
      'composer run-script lint',
      'composer normalize',
      'php artisan migrate',
      'melos run build',
      '```',
    ].join('\n');
    expect(staleCommands(doc, opts, { 'composer.json': '{}' })).toEqual([
      '5 `composer run-script lint` — script `lint` is not defined in composer.json',
      '7 `php artisan migrate` — no `artisan` file found',
      '8 `melos run build` — script `build` is not defined in melos.yaml',
    ]);
    expect(staleCommands('`php artisan migrate`', opts, { artisan: '' })).toEqual([]);
  });
});

describe('stale/path', () => {
  const files = {
    'src/index.ts': '',
    'src/app/main.ts': '',
    'docs/guide.md': '',
    'apps/api/src/main.ts': '',
    '.gitignore': '.env.local\nlocal/\n',
  };

  function stalePaths(doc: string, path = 'AGENTS.md'): string[] {
    const facts = project(
      { ...files, [path]: doc },
      { workspaces: [{ dir: 'apps/api', name: 'api' }] },
    );
    return checkStalePath(context(facts)).map((f) => `${f.file}:${f.line} ${f.message}`);
  }

  it('flags missing files and directories', () => {
    expect(stalePaths('Legacy code lives in `src/legacy/`.\nSee `docs/old.md`.')).toEqual([
      'AGENTS.md:1 references `src/legacy/` — no such file or directory',
      'AGENTS.md:2 references `docs/old.md` — no such file or directory',
    ]);
  });

  it('accepts existing paths relative to root, doc dir or a workspace', () => {
    const doc = [
      'Entry: `src/index.ts`, app in `src/app/`, docs in `./docs/guide.md:3`.',
      'API entry is `src/main.ts`.',
    ].join('\n');
    expect(stalePaths(doc)).toEqual([]);
    expect(
      stalePaths('Entry `src/main.ts`, guide `../../docs/guide.md`.', 'apps/api/AGENTS.md'),
    ).toEqual([]);
  });

  it('skips globs, URLs, ignored dirs, gitignored paths, code and negations', () => {
    const doc = [
      'Tests in `src/**/*.test.ts`, output in `dist/index.js`, deps in `node_modules/x/y.js`.',
      'See `github.com/org/repo.md` and `https://example.com/a/b.md`.',
      'Secrets go to `local/secrets.json`; never create `src/utils/`.',
      '```',
      'cat `src/missing.ts`',
      '```',
    ].join('\n');
    expect(stalePaths(doc)).toEqual([]);
  });
});
