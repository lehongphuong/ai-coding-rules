import { describe, expect, it } from 'vitest';
import { createMemoryFileIndex } from '../../src/core/index.js';
import { buildAiContext, isSensitivePath, redactSecrets } from '../../src/ai/index.js';
import type { ProjectFacts } from '../../src/types.js';

function project(files: Record<string, string>, extra: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    root: '/virtual',
    name: 'demo',
    files: createMemoryFileIndex(files),
    facts: [
      {
        key: 'language',
        value: 'typescript',
        confidence: 1,
        evidence: [{ file: 'tsconfig.json' }],
        scope: '',
      },
      {
        key: 'command',
        value: 'pnpm test',
        confidence: 1,
        evidence: [{ file: 'package.json' }],
        scope: '',
        meta: { kind: 'test' },
      },
      {
        key: 'framework',
        value: 'flutter',
        confidence: 1,
        evidence: [{ file: 'apps/mobile/pubspec.yaml' }],
        scope: 'apps/mobile',
      },
    ],
    workspaces: [
      { dir: '', name: 'demo' },
      { dir: 'apps/mobile', name: 'mobile' },
    ],
    scripts: [],
    ...extra,
  };
}

describe('isSensitivePath', () => {
  it.each([
    '.env',
    '.env.local',
    'apps/api/.env.production',
    'certs/server.pem',
    'config/private.key',
    '.ssh/id_rsa',
    'id_ed25519.pub',
    'config/secrets.yaml',
    'secrets/db.json',
    'keystore.p12',
    'credentials.json',
    '.npmrc',
  ])('excludes %s', (p) => {
    expect(isSensitivePath(p)).toBe(true);
  });

  it.each(['src/main.ts', 'lib/main.dart', 'src/keyboard.ts', 'README.md'])('keeps %s', (p) => {
    expect(isSensitivePath(p)).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('redacts secret-looking assignments', () => {
    const out = redactSecrets(
      'const a = 1;\n  apiKey: "abc"\nDB_PASSWORD=hunter2\nconst token = x;\nok',
    );
    expect(out).toBe('const a = 1;\n  [redacted]\n[redacted]\n[redacted]\nok');
  });
});

describe('buildAiContext', () => {
  const files: Record<string, string> = {
    'package.json': '{"name":"demo"}',
    '.env': 'SHOULD_NOT_LEAK=1',
    'config/secret.ts': 'export const SHOULD_NOT_LEAK_2 = 1;',
    'server.pem': 'BEGIN',
    'src/main.ts':
      'import { app } from "./app";\nconst API_KEY = "sk-live-123";\napp.listen(3000);\n',
    'src/app.ts': 'export const app = {};\n',
    'src/users/users.service.ts': 'export class UsersService {}\n',
    'src/users/users.service.spec.ts': 'test\n',
    'apps/mobile/lib/main.dart': 'void main() {}\n',
    'apps/mobile/lib/features/auth/login_page.dart': 'class LoginPage {}\n',
  };

  it('includes name, facts per scope, tree and samples', () => {
    const ctx = buildAiContext(project(files));
    expect(ctx).toContain('# Project: demo');
    expect(ctx).toContain('[root]');
    expect(ctx).toContain('language=typescript');
    expect(ctx).toContain('command=pnpm test (kind: test)');
    expect(ctx).toContain('[apps/mobile]');
    expect(ctx).toContain('framework=flutter');
    // tree collapsed to depth 2
    const tree = ctx.split('## File tree (top levels)\n')[1]!.split('\n## ')[0]!.trim().split('\n');
    expect(tree).toEqual([
      'apps/mobile/',
      'package.json',
      'src/app.ts',
      'src/main.ts',
      'src/users/',
    ]);
    // entry points preferred
    expect(ctx).toContain('### src/main.ts');
    expect(ctx).toContain('### apps/mobile/lib/main.dart');
  });

  it('never includes secret files and redacts secret lines', () => {
    const ctx = buildAiContext(project(files));
    expect(ctx).not.toContain('SHOULD_NOT_LEAK');
    expect(ctx).not.toMatch(/^\.env$/m);
    expect(ctx).not.toContain('server.pem');
    expect(ctx).not.toContain('config/secret.ts');
    expect(ctx).not.toContain('sk-live-123');
    expect(ctx).toContain('[redacted]');
  });

  it('limits samples to 5 files of at most 4 KB and the tree to 200 entries', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 300; i++)
      many[`f${String(i).padStart(3, '0')}.ts`] = `export const v${i} = 1;\n`;
    many['src/main.ts'] = `${'const x = 1;\n'.repeat(1000)}`;
    const ctx = buildAiContext(project(many));
    expect((ctx.match(/^### /gm) ?? []).length).toBe(5);
    expect(ctx).toContain('… (truncated)');
    const mainBlock = ctx.split('### src/main.ts\n```\n')[1]!.split('\n```')[0]!;
    expect(Buffer.byteLength(mainBlock, 'utf8')).toBeLessThanOrEqual(4096);
    expect(ctx).toMatch(/… \(\d+ more entries\)/);
    const tree = ctx.split('## File tree (top levels)\n')[1]!.split('\n## ')[0]!.trim().split('\n');
    expect(tree.length).toBe(201);
  });
});
