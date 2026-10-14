import { describe, expect, it } from 'vitest';
import { extractClaims } from '../../src/doctor/claims.js';
import { parseInstructionDoc } from '../../src/doctor/parser.js';
import type { Claim } from '../../src/types.js';

function claims(text: string, path = 'AGENTS.md'): Omit<Claim, 'file' | 'text'>[] {
  return extractClaims(parseInstructionDoc(path, text)).map(({ key, value, negated, line }) => ({
    key,
    value,
    negated,
    line,
  }));
}

function values(text: string, key: Claim['key']): string[] {
  return claims(text)
    .filter((c) => c.key === key)
    .map((c) => `${c.negated ? '!' : ''}${c.value}`)
    .sort((a, b) => a.replace('!', '').localeCompare(b.replace('!', '')));
}

describe('extractClaims: package manager', () => {
  it('detects commands and "use X"', () => {
    expect(values('Run tests with `npm test`.', 'packageManager')).toEqual(['npm']);
    expect(values('Use pnpm for everything.', 'packageManager')).toEqual(['pnpm']);
    expect(values('yarn install then go', 'packageManager')).toEqual(['yarn']);
    expect(values('The package manager is bun.', 'packageManager')).toEqual(['bun']);
  });

  it('handles negations', () => {
    expect(values("Don't use npm.", 'packageManager')).toEqual(['!npm']);
    expect(values('Use pnpm, never npm install.', 'packageManager')).toEqual(['!npm', 'pnpm']);
    expect(values('Use pnpm instead of yarn.', 'packageManager')).toEqual(['pnpm', '!yarn']);
    expect(values('We migrated from yarn to pnpm.', 'packageManager')).toEqual(['!yarn']);
    expect(values('Yarn is not used here.', 'packageManager')).toEqual(['!yarn']);
    expect(values('yarn is not used here.', 'packageManager')).toEqual(['!yarn']);
  });

  it('ignores prose, global installs and code fences', () => {
    expect(values('Published on npm.', 'packageManager')).toEqual([]);
    expect(values('Install the CLI with `npm i -g foo`.', 'packageManager')).toEqual([]);
    expect(values('Use `npx tsc`.', 'packageManager')).toEqual([]);
    expect(values('```\nnpm install\n```', 'packageManager')).toEqual([]);
  });
});

describe('extractClaims: tools', () => {
  it('maps synonyms to canonical values', () => {
    expect(values('Run `flutter test` for tests.', 'testRunner')).toEqual(['flutter-test']);
    expect(values('Use go test ./... before pushing.', 'testRunner')).toEqual(['go-test']);
    expect(values('Write tests with Pest.', 'testRunner')).toEqual(['pest']);
    expect(values('Use Jest.', 'testRunner')).toEqual(['jest']);
    expect(values('# Testing\n\nWe rely on Vitest.', 'testRunner')).toEqual(['vitest']);
  });

  it('needs a testing context for test runners', () => {
    expect(values('Jest was popular in 2018.', 'testRunner')).toEqual([]);
    expect(values('Install eslint-plugin-jest.', 'testRunner')).toEqual([]);
    expect(values('Use Vitest (not Jest) for unit tests.', 'testRunner')).toEqual([
      '!jest',
      'vitest',
    ]);
  });

  it('detects formatters and linters', () => {
    expect(values('Format with Prettier.', 'formatter')).toEqual(['prettier']);
    expect(values('Keep it black and white.', 'formatter')).toEqual([]);
    expect(values('Format Python with black.', 'formatter')).toEqual(['black']);
    expect(values('Install eslint-config-prettier.', 'formatter')).toEqual([]);
    expect(values('Lint with ESLint.', 'linter')).toEqual(['eslint']);
  });

  it('detects style claims', () => {
    expect(values('Indent with 2 spaces.', 'indent')).toEqual(['2']);
    expect(values('Use 4-space indentation.', 'indent')).toEqual(['4']);
    expect(values('Use tabs for indentation.', 'indent')).toEqual(['tab']);
    expect(values('Close unused browser tabs.', 'indent')).toEqual([]);
    expect(values('Use single quotes for strings.', 'quotes')).toEqual(['single']);
    expect(values('No semicolons.', 'semicolons')).toEqual(['never']);
    expect(values('Always use semicolons.', 'semicolons')).toEqual(['always']);
    expect(values('TypeScript only. Do not use JavaScript.', 'language')).toEqual([
      '!javascript',
      'typescript',
    ]);
  });
});

describe('extractClaims: commands and paths', () => {
  it('extracts commands from backticks and code fences', () => {
    const text = [
      'Run `pnpm lint && pnpm test:e2e` before pushing.',
      '```bash',
      '$ make lint',
      'php artisan migrate # comment',
      'echo done',
      '```',
      "Don't run `npm run legacy`.",
    ].join('\n');
    expect(claims(text).filter((c) => c.key === 'command')).toEqual([
      { key: 'command', value: 'pnpm lint', negated: false, line: 1 },
      { key: 'command', value: 'pnpm test:e2e', negated: false, line: 1 },
      { key: 'command', value: 'make lint', negated: false, line: 3 },
      { key: 'command', value: 'php artisan migrate', negated: false, line: 4 },
      { key: 'command', value: 'npm run legacy', negated: true, line: 7 },
    ]);
  });

  it('extracts repo-like paths only', () => {
    const text = [
      'See `src/legacy/` and `./src/app.ts:12` and `docs/guide.md`.',
      'Not paths: `@nestjs/core`, `react-dom/client`, `src/**/*.ts`, `https://x.dev/a.md`,',
      '`~/x/y.md`, `/etc/hosts.conf`, `node_modules/a/b.js`, `a b/c.md`, `<name>/x.ts`.',
      '```',
      'see `src/in-code.ts`',
      '```',
    ].join('\n');
    expect(values(text, 'path')).toEqual(['docs/guide.md', 'src/app.ts', 'src/legacy/']);
  });

  it('skips front matter and managed-block markers', () => {
    const text = '---\ndescription: use npm install\n---\n<!-- ai-rules:begin id=x -->\nok\n';
    expect(claims(text, '.cursor/rules/a.mdc')).toEqual([]);
  });
});
