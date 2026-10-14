import type { Fact, ProjectFacts } from '../../src/types.js';
import { cmd, fact, inScope, project } from './helpers.js';

const json = (v: unknown): string => JSON.stringify(v);

function nestFacts(): Fact[] {
  return [
    fact('language', 'typescript'),
    fact('typescriptStrict', true),
    fact('framework', 'nestjs', { meta: { version: '10.3.0' } }),
    fact('framework', 'express', { confidence: 0.7 }),
    fact('testRunner', 'jest'),
    fact('linter', 'eslint', { evidence: [{ file: 'eslint.config.mjs' }] }),
    fact('formatter', 'prettier', { evidence: [{ file: '.prettierrc' }] }),
    fact('orm', 'prisma', { evidence: [{ file: 'prisma/schema.prisma' }] }),
    cmd('install', 'pnpm install', { name: 'install' }),
    cmd('dev', 'pnpm start:dev', { name: 'start:dev' }),
    cmd('build', 'pnpm build'),
    cmd('test', 'pnpm test'),
    cmd('e2e', 'pnpm test:e2e', { name: 'test:e2e' }),
    cmd('lint', 'pnpm lint'),
    cmd('format', 'pnpm format'),
  ];
}

const NEST_PKG = json({
  name: 'api',
  dependencies: {
    '@nestjs/core': '10.3.0',
    '@nestjs/config': '3.0.0',
    'class-validator': '0.14.0',
  },
  devDependencies: { '@nestjs/cli': '10.0.0', '@nestjs/testing': '10.3.0', jest: '29.0.0' },
});

function flutterFacts(): Fact[] {
  return [
    fact('language', 'dart', { evidence: [{ file: 'pubspec.yaml' }] }),
    fact('framework', 'flutter', {
      evidence: [{ file: 'pubspec.yaml', pointer: '#dependencies.flutter' }],
    }),
    fact('packageManager', 'pub', { evidence: [{ file: 'pubspec.lock' }] }),
    fact('testRunner', 'flutter-test', { evidence: [{ file: 'pubspec.yaml' }] }),
    fact('linter', 'flutter-lints', { evidence: [{ file: 'analysis_options.yaml' }] }),
    fact('formatter', 'dart-format', { evidence: [{ file: 'pubspec.yaml' }] }),
    fact('stateManagement', 'riverpod', { evidence: [{ file: 'pubspec.yaml' }] }),
    cmd('install', 'flutter pub get', { name: 'pub get', evidence: [{ file: 'pubspec.yaml' }] }),
    cmd('test', 'flutter test', { evidence: [{ file: 'pubspec.yaml' }] }),
    cmd('lint', 'flutter analyze', {
      name: 'analyze',
      evidence: [{ file: 'analysis_options.yaml' }],
    }),
    cmd('format', 'dart format .', { evidence: [{ file: 'pubspec.yaml' }] }),
    cmd('codegen', 'dart run build_runner build --delete-conflicting-outputs', {
      name: 'build_runner',
      evidence: [{ file: 'pubspec.yaml', pointer: '#dev_dependencies.build_runner' }],
    }),
  ];
}

const PUBSPEC = [
  'name: mobile',
  'dependencies:',
  '  flutter:',
  '    sdk: flutter',
  '  flutter_riverpod: ^2.5.0',
  '  freezed_annotation: ^2.4.0',
  'dev_dependencies:',
  '  build_runner: ^2.4.0',
  '  freezed: ^2.5.0',
  '  riverpod_generator: ^2.4.0',
  '',
].join('\n');

export const SCENARIOS: Record<string, () => ProjectFacts> = {
  nestjs: () =>
    project(
      [
        ...nestFacts(),
        fact('packageManager', 'pnpm', { evidence: [{ file: 'pnpm-lock.yaml' }] }),
        fact('ci', 'github-actions'),
        fact('indent', '2'),
      ],
      [],
      {
        'package.json': NEST_PKG,
        'pnpm-lock.yaml': '',
        'tsconfig.json': '{}',
        'prisma/schema.prisma': '',
        '.env.example': 'DATABASE_URL=',
        'src/app.module.ts': '',
      },
      'api',
    ),

  react: () =>
    project(
      [
        fact('language', 'typescript'),
        fact('typescriptStrict', true),
        fact('framework', 'react'),
        fact('packageManager', 'npm', { evidence: [{ file: 'package-lock.json' }] }),
        fact('testRunner', 'vitest'),
        fact('linter', 'eslint'),
        fact('styling', 'tailwind'),
        cmd('dev', 'npm run dev'),
        cmd('build', 'npm run build'),
        cmd('test', 'npm test'),
        cmd('lint', 'npm run lint'),
      ],
      [],
      {
        'package.json': json({
          type: 'module',
          dependencies: { react: '18.3.1' },
          devDependencies: { vite: '5.0.0', vitest: '2.0.0', '@testing-library/react': '16.0.0' },
        }),
        'vite.config.ts': '',
        'src/App.tsx': '',
        '.gitignore': 'node_modules\n.env\n',
      },
      'web',
    ),

  flutter: () =>
    project(flutterFacts(), [], { 'pubspec.yaml': PUBSPEC, 'lib/main.dart': '' }, 'mobile'),

  laravel: () =>
    project(
      [
        fact('language', 'php', { evidence: [{ file: 'composer.json' }] }),
        fact('framework', 'laravel', {
          evidence: [{ file: 'composer.json', pointer: '#require.laravel/framework' }],
        }),
        fact('packageManager', 'composer', { evidence: [{ file: 'composer.lock' }] }),
        fact('testRunner', 'pest', { evidence: [{ file: 'composer.json' }] }),
        fact('formatter', 'pint', { evidence: [{ file: 'composer.json' }] }),
        fact('linter', 'larastan', { evidence: [{ file: 'phpstan.neon' }] }),
        fact('orm', 'eloquent', { evidence: [{ file: 'composer.json' }] }),
        cmd('install', 'composer install', { evidence: [{ file: 'composer.json' }] }),
        cmd('test', 'php artisan test', { evidence: [{ file: 'artisan' }] }),
        cmd('format', './vendor/bin/pint', { evidence: [{ file: 'composer.json' }] }),
        cmd('migrate', 'php artisan migrate', { evidence: [{ file: 'artisan' }] }),
      ],
      [],
      {
        'composer.json': json({ require: { 'laravel/framework': '^11.0' } }),
        artisan: '',
        'database/migrations/2024_01_01_000000_create_users_table.php': '',
        'tests/Feature/ExampleTest.php': '',
        '.env.example': 'APP_KEY=',
      },
      'shop',
    ),

  fastapi: () =>
    project(
      [
        fact('language', 'python', { evidence: [{ file: 'pyproject.toml' }] }),
        fact('framework', 'fastapi', { evidence: [{ file: 'pyproject.toml' }] }),
        fact('packageManager', 'uv', { evidence: [{ file: 'uv.lock' }] }),
        fact('testRunner', 'pytest', { evidence: [{ file: 'pyproject.toml' }] }),
        fact('linter', 'ruff', { evidence: [{ file: 'pyproject.toml' }] }),
        fact('formatter', 'ruff-format', { evidence: [{ file: 'pyproject.toml' }] }),
        fact('orm', 'sqlalchemy', { evidence: [{ file: 'pyproject.toml' }] }),
        cmd('test', 'uv run pytest', { evidence: [{ file: 'pyproject.toml' }] }),
        cmd('lint', 'uv run ruff check .', { evidence: [{ file: 'pyproject.toml' }] }),
        cmd('format', 'uv run ruff format .', { evidence: [{ file: 'pyproject.toml' }] }),
      ],
      [],
      { 'pyproject.toml': '', 'uv.lock': '', 'tests/test_main.py': '', 'alembic.ini': '' },
      'svc',
    ),

  go: () =>
    project(
      [
        fact('language', 'go', { evidence: [{ file: 'go.mod' }] }),
        fact('packageManager', 'go', { evidence: [{ file: 'go.mod' }] }),
        fact('testRunner', 'go-test', { evidence: [{ file: 'go.mod' }] }),
        fact('linter', 'golangci-lint', { evidence: [{ file: '.golangci.yml' }] }),
        fact('formatter', 'gofmt', { evidence: [{ file: 'go.mod' }] }),
        cmd('build', 'go build ./...', { evidence: [{ file: 'go.mod' }] }),
        cmd('test', 'go test ./...', { evidence: [{ file: 'go.mod' }] }),
        cmd('lint', 'go vet ./...', { name: 'vet', evidence: [{ file: 'go.mod' }] }),
      ],
      [],
      { 'go.mod': 'module example.com/x', 'cmd/app/main.go': '', 'internal/x/x.go': '' },
      'gosvc',
    ),

  nextjs: () =>
    project(
      [
        fact('language', 'typescript'),
        fact('framework', 'nextjs'),
        fact('framework', 'react'),
        fact('packageManager', 'yarn', { evidence: [{ file: 'yarn.lock' }] }),
        fact('stateManagement', 'zustand'),
        fact('orm', 'drizzle'),
        cmd('dev', 'yarn dev'),
      ],
      [],
      {
        'package.json': json({ dependencies: { next: '14.0.0', zod: '3.0.0' } }),
        'src/app/layout.tsx': '',
      },
      'site',
    ),

  vue: () =>
    project(
      [
        fact('language', 'typescript'),
        fact('framework', 'nuxt'),
        fact('framework', 'vue', { meta: { version: '^3.4.0' } }),
        fact('packageManager', 'bun', { evidence: [{ file: 'bun.lockb' }] }),
        fact('stateManagement', 'pinia'),
        fact('styling', 'css-modules'),
      ],
      [],
      {},
      'nuxt-app',
    ),

  django: () =>
    project(
      [
        fact('language', 'python', { evidence: [{ file: 'requirements.txt' }] }),
        fact('framework', 'django', { evidence: [{ file: 'requirements.txt' }] }),
        fact('packageManager', 'poetry', { evidence: [{ file: 'poetry.lock' }] }),
        fact('linter', 'flake8', { evidence: [{ file: 'setup.cfg' }] }),
        fact('formatter', 'black', { evidence: [{ file: 'pyproject.toml' }] }),
      ],
      [],
      { 'manage.py': '', '.gitignore': '.env\n' },
      'blog',
    ),

  spring: () =>
    project(
      [
        fact('language', 'kotlin', { evidence: [{ file: 'build.gradle.kts' }] }),
        fact('framework', 'spring', { evidence: [{ file: 'build.gradle.kts' }] }),
        fact('packageManager', 'gradle', { evidence: [{ file: 'build.gradle.kts' }] }),
        fact('testRunner', 'junit', { evidence: [{ file: 'build.gradle.kts' }] }),
        fact('linter', 'detekt', { evidence: [{ file: 'build.gradle.kts' }] }),
        cmd('test', './gradlew test', { evidence: [{ file: 'gradlew' }] }),
        cmd('build', './gradlew build', { evidence: [{ file: 'gradlew' }] }),
      ],
      [],
      { gradlew: '', 'build.gradle.kts': '' },
      'orders',
    ),

  express: () =>
    project(
      [
        fact('language', 'javascript'),
        fact('framework', 'express'),
        fact('packageManager', 'npm', { evidence: [{ file: 'package-lock.json' }] }),
        fact('testRunner', 'mocha'),
        fact('testRunner', 'playwright'),
        fact('linter', 'biome'),
        fact('formatter', 'biome'),
        fact('indent', 'tab'),
        cmd('test', 'npm test'),
        cmd('lint', 'npm run check', { name: 'check' }),
      ],
      [],
      { 'package.json': json({ type: 'module' }) },
      'legacy-api',
    ),

  monorepo: () =>
    project(
      [
        fact('packageManager', 'pnpm', { evidence: [{ file: 'pnpm-lock.yaml' }] }),
        fact('monorepo', 'pnpm-workspaces', { evidence: [{ file: 'pnpm-workspace.yaml' }] }),
        fact('ci', 'github-actions'),
        fact('indent', '2'),
        cmd('install', 'pnpm install'),
        ...inScope('apps/api', nestFacts()),
        ...inScope('apps/mobile', flutterFacts()),
      ],
      [
        { dir: 'apps/api', name: 'api', manifest: 'apps/api/package.json' },
        { dir: 'apps/mobile', name: 'mobile', manifest: 'apps/mobile/pubspec.yaml' },
      ],
      {
        'package.json': json({ name: 'mono', private: true }),
        'pnpm-workspace.yaml': 'packages: ["apps/*"]',
        'apps/api/package.json': NEST_PKG,
        'apps/api/prisma/schema.prisma': '',
        'apps/api/tsconfig.json': '{}',
        'apps/mobile/pubspec.yaml': PUBSPEC,
      },
      'mono',
    ),
};
