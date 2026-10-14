import { describe, expect, it } from 'vitest';
import {
  DETECTORS,
  agentFilesDetector,
  flutterDetector,
  goDetector,
  jvmDetector,
  nodeDetector,
  phpDetector,
  pythonDetector,
  toolingDetector,
} from '../../src/scanner/detectors/index.js';
import { parsePyproject } from '../../src/scanner/detectors/python.js';
import { find, json, run, values } from './helpers.js';

const commands = (facts: ReturnType<typeof run>): string[] =>
  facts.filter((f) => f.key === 'command').map((f) => String(f.value));

describe('DETECTORS', () => {
  it('registers the 8 required detectors', () => {
    expect(DETECTORS.map((d) => d.id).sort()).toEqual(
      ['agent-files', 'flutter', 'go', 'jvm', 'node', 'php', 'python', 'tooling'].sort(),
    );
  });
  it('return nothing for an empty repo', () => {
    for (const d of DETECTORS) expect(run(d, {})).toEqual([]);
  });
});

describe('node detector', () => {
  const pkg = (extra: object): string =>
    json({
      name: 'x',
      scripts: {
        test: 'vitest run',
        lint: 'eslint .',
        'test:e2e': 'playwright test',
        preview: 'vite preview',
      },
      devDependencies: { vitest: '^2.0.0', typescript: '^5.4.0' },
      ...extra,
    });

  it('detects package manager from lockfile and prefixes commands', () => {
    const facts = run(nodeDetector, { 'package.json': pkg({}), 'pnpm-lock.yaml': '' });
    expect(find(facts, 'packageManager', 'pnpm')?.evidence).toEqual([{ file: 'pnpm-lock.yaml' }]);
    expect(commands(facts)).toEqual(['pnpm install', 'pnpm test', 'pnpm lint', 'pnpm test:e2e']);
    const test = find(facts, 'command', 'pnpm test')!;
    expect(test.meta).toEqual({ kind: 'test', name: 'test' });
    expect(test.evidence).toEqual([{ file: 'package.json', pointer: '#scripts.test' }]);
    expect(find(facts, 'command', 'pnpm test:e2e')?.meta?.kind).toBe('e2e');
  });

  it.each([
    ['package-lock.json', ['npm install', 'npm test', 'npm run lint', 'npm run test:e2e']],
    ['yarn.lock', ['yarn install', 'yarn test', 'yarn lint', 'yarn test:e2e']],
    ['bun.lockb', ['bun install', 'bun run test', 'bun run lint', 'bun run test:e2e']],
  ])('uses the right prefix for %s', (lock, expected) => {
    expect(commands(run(nodeDetector, { 'package.json': pkg({}), [lock]: '' }))).toEqual(expected);
  });

  it('falls back to packageManager field, then npm with low confidence', () => {
    const field = run(nodeDetector, { 'package.json': pkg({ packageManager: 'yarn@4.1.0' }) });
    expect(find(field, 'packageManager', 'yarn')?.evidence[0]?.pointer).toBe('#packageManager');
    const none = run(nodeDetector, { 'package.json': pkg({}) });
    expect(find(none, 'packageManager', 'npm')?.confidence).toBe(0.6);
  });

  it('inherits the root lockfile in workspace subdirs without emitting a package manager', () => {
    const facts = run(
      nodeDetector,
      { 'package.json': '{}', 'pnpm-lock.yaml': '', 'apps/web/package.json': pkg({}) },
      'apps/web',
    );
    expect(values(facts, 'packageManager')).toEqual([]);
    expect(commands(facts)).toEqual(['pnpm test', 'pnpm lint', 'pnpm test:e2e']);
    expect(facts.every((f) => f.scope === 'apps/web')).toBe(true);
    expect(find(facts, 'command', 'pnpm test')?.evidence[0]?.file).toBe('apps/web/package.json');
  });

  it('detects language, strictness, frameworks and tooling', () => {
    const facts = run(nodeDetector, {
      'package.json': json({
        engines: { node: '>=20' },
        dependencies: {
          '@nestjs/core': '^10.0.0',
          '@prisma/client': '5',
          zustand: '4',
          tailwindcss: '3',
        },
        devDependencies: { jest: '29', eslint: '9', prettier: '3', typescript: '5' },
      }),
      'tsconfig.json': '{\n  // comment\n  "compilerOptions": { "strict": true, },\n}',
      '.nvmrc': '20.11.0\n',
      'eslint.config.js': '',
      'src/app.module.css': '',
    });
    expect(values(facts, 'language')).toEqual(['typescript']);
    expect(find(facts, 'typescriptStrict', true)?.evidence[0]).toEqual({
      file: 'tsconfig.json',
      pointer: '#compilerOptions.strict',
    });
    expect(find(facts, 'framework', 'nestjs')?.meta).toEqual({ version: '10.0.0' });
    expect(values(facts, 'testRunner')).toEqual(['jest']);
    expect(find(facts, 'linter', 'eslint')?.meta?.config).toBe('eslint.config.js');
    expect(values(facts, 'formatter')).toEqual(['prettier']);
    expect(values(facts, 'orm')).toEqual(['prisma']);
    expect(values(facts, 'stateManagement')).toEqual(['zustand']);
    expect(values(facts, 'styling')).toEqual(['tailwind', 'css-modules']);
    expect(facts.filter((f) => f.key === 'runtime').map((f) => f.meta?.version)).toEqual([
      '>=20',
      '20.11.0',
    ]);
  });

  it('detects javascript and biome', () => {
    const facts = run(nodeDetector, {
      'package.json': json({ devDependencies: { '@biomejs/biome': '1.9.0', mocha: '10' } }),
      'biome.json': '{}',
    });
    expect(values(facts, 'language')).toEqual(['javascript']);
    expect(values(facts, 'linter')).toEqual(['biome']);
    expect(values(facts, 'formatter')).toEqual(['biome']);
    expect(values(facts, 'testRunner')).toEqual(['mocha']);
  });

  it('ignores invalid package.json', () => {
    expect(run(nodeDetector, { 'package.json': '{oops' })).toEqual([]);
  });
});

describe('flutter detector', () => {
  const pubspec = `name: app
environment:
  sdk: ^3.4.0
dependencies:
  flutter:
    sdk: flutter
  flutter_bloc: ^8.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
  very_good_analysis: ^6.0.0
  build_runner: ^2.4.0
`;
  it('detects flutter stack and commands', () => {
    const facts = run(
      flutterDetector,
      {
        'mobile/pubspec.yaml': pubspec,
        'mobile/analysis_options.yaml':
          'include: package:very_good_analysis/analysis_options.yaml\n',
      },
      'mobile',
    );
    expect(values(facts, 'framework')).toEqual(['flutter']);
    expect(values(facts, 'testRunner')).toEqual(['flutter-test']);
    expect(values(facts, 'linter')).toEqual(['very-good-analysis']);
    expect(values(facts, 'stateManagement')).toEqual(['bloc']);
    expect(find(facts, 'language', 'dart')?.meta?.version).toBe('^3.4.0');
    expect(commands(facts)).toEqual([
      'flutter pub get',
      'flutter test',
      'flutter analyze',
      'dart format .',
      'dart run build_runner build --delete-conflicting-outputs',
    ]);
    expect(find(facts, 'framework', 'flutter')?.evidence[0]).toEqual({
      file: 'mobile/pubspec.yaml',
      pointer: '#dependencies.flutter',
      line: 5,
    });
  });
  it('uses dart commands for pure dart packages and survives bad yaml', () => {
    const facts = run(flutterDetector, {
      'pubspec.yaml': 'name: pkg\ndev_dependencies:\n  lints: ^4.0.0\n',
    });
    expect(commands(facts)).toContain('dart pub get');
    expect(values(facts, 'framework')).toEqual([]);
    expect(run(flutterDetector, { 'pubspec.yaml': 'a: [unclosed' })).toEqual([]);
  });
});

describe('php detector', () => {
  it('detects laravel + pest + larastan + pint', () => {
    const facts = run(phpDetector, {
      'composer.json': json({
        require: { php: '^8.2', 'laravel/framework': '^11.0' },
        'require-dev': { 'pestphp/pest': '^3', 'larastan/larastan': '^2', 'laravel/pint': '^1' },
        scripts: { test: 'pest' },
      }),
      artisan: '',
    });
    expect(values(facts, 'framework')).toEqual(['laravel']);
    expect(values(facts, 'orm')).toEqual(['eloquent']);
    expect(values(facts, 'testRunner')).toEqual(['pest']);
    expect(values(facts, 'linter')).toEqual(['larastan']);
    expect(values(facts, 'formatter')).toEqual(['pint']);
    expect(commands(facts)).toEqual([
      'composer install',
      'php artisan test',
      './vendor/bin/phpstan analyse',
      './vendor/bin/pint',
      'php artisan migrate',
      'composer test',
    ]);
  });
  it('detects symfony + phpunit + php-cs-fixer', () => {
    const facts = run(phpDetector, {
      'composer.json': json({
        require: { 'symfony/framework-bundle': '^7', 'doctrine/orm': '^3' },
        'require-dev': {
          'phpunit/phpunit': '^11',
          'friendsofphp/php-cs-fixer': '^3',
          'phpstan/phpstan': '1',
        },
      }),
    });
    expect(values(facts, 'framework')).toEqual(['symfony']);
    expect(values(facts, 'orm')).toEqual(['doctrine']);
    expect(commands(facts)).toContain('./vendor/bin/phpunit');
    expect(commands(facts)).toContain('./vendor/bin/php-cs-fixer fix');
  });
});

describe('python detector', () => {
  it('parses pyproject sections', () => {
    const py = parsePyproject(
      `[project]
name = "svc"
dependencies = ["Django>=5", 'psycopg[binary]']

[project.optional-dependencies]
dev = [
  "pytest>=8",  # tests
  "black",
]

[tool.poetry.group.dev.dependencies]
Flake8 = "^7"
`,
      'pyproject.toml',
    );
    expect(py.name).toBe('svc');
    expect(py.deps.map((d) => d.name)).toEqual(['django', 'psycopg', 'pytest', 'black', 'flake8']);
    expect(py.deps[2]!.evidence).toEqual({
      file: 'pyproject.toml',
      pointer: '#project.optional-dependencies.dev',
      line: 7,
    });
  });

  it('detects django via poetry', () => {
    const facts = run(pythonDetector, {
      'pyproject.toml': `[tool.poetry]
name = "web"

[tool.poetry.dependencies]
python = "^3.12"
django = "^5.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8"
black = "^24"
`,
      'poetry.lock': '',
      'manage.py': '',
    });
    expect(values(facts, 'packageManager')).toEqual(['poetry']);
    expect(values(facts, 'framework')).toEqual(['django']);
    expect(values(facts, 'orm')).toEqual(['django-orm']);
    expect(values(facts, 'formatter')).toEqual(['black']);
    expect(commands(facts)).toEqual([
      'poetry install',
      'poetry run pytest',
      'poetry run black .',
      'poetry run python manage.py migrate',
    ]);
  });

  it('detects flask from requirements.txt with pip', () => {
    const facts = run(pythonDetector, {
      'requirements.txt': '# deps\nFlask==3.0.0\nSQLAlchemy>=2\n-r dev.txt\n',
      'requirements-dev.txt': 'pytest\nflake8\n',
    });
    expect(find(facts, 'packageManager', 'pip')?.confidence).toBeLessThan(0.9);
    expect(values(facts, 'framework')).toEqual(['flask']);
    expect(values(facts, 'orm')).toEqual(['sqlalchemy']);
    expect(values(facts, 'linter')).toEqual(['flake8']);
    expect(commands(facts)).toEqual(['pip install -r requirements.txt', 'pytest']);
    expect(find(facts, 'framework', 'flask')?.evidence[0]).toEqual({
      file: 'requirements.txt',
      line: 2,
    });
  });

  it('detects pipenv', () => {
    const facts = run(pythonDetector, {
      Pipfile: '[packages]\nfastapi = "*"\n\n[dev-packages]\npytest = "*"\n',
    });
    expect(values(facts, 'packageManager')).toEqual(['pipenv']);
    expect(values(facts, 'framework')).toEqual(['fastapi']);
    expect(commands(facts)).toContain('pipenv run pytest');
  });
});

describe('go detector', () => {
  it('detects go module, golangci and gorm', () => {
    const facts = run(goDetector, {
      'go.mod': 'module x\n\ngo 1.23\n\nrequire gorm.io/gorm v1.25.0\n',
      '.golangci.yaml': '',
      'pkg/a_test.go': '',
    });
    expect(find(facts, 'language', 'go')?.meta?.version).toBe('1.23');
    expect(values(facts, 'linter')).toEqual(['golangci-lint']);
    expect(values(facts, 'orm')).toEqual(['gorm']);
    expect(find(facts, 'testRunner', 'go-test')?.evidence[0]?.file).toBe('pkg/a_test.go');
    expect(commands(facts)).toEqual(
      expect.arrayContaining(['go test ./...', 'go build ./...', 'go vet ./...']),
    );
  });
});

describe('jvm detector', () => {
  it('detects spring boot kotlin gradle', () => {
    const facts = run(jvmDetector, {
      'build.gradle.kts': `plugins {
  id("org.springframework.boot") version "3.3.0"
  kotlin("jvm") version "2.0.0"
  id("io.gitlab.arturbosch.detekt") version "1.23.6"
}
dependencies { testImplementation("org.springframework.boot:spring-boot-starter-test") }
`,
      gradlew: '',
    });
    expect(values(facts, 'language')).toEqual(['kotlin']);
    expect(values(facts, 'framework')).toEqual(['spring']);
    expect(values(facts, 'testRunner')).toEqual(['junit']);
    expect(values(facts, 'linter')).toEqual(['detekt']);
    expect(commands(facts)).toEqual(['./gradlew test', './gradlew build', './gradlew detekt']);
    expect(find(facts, 'framework', 'spring')?.evidence[0]).toEqual({
      file: 'build.gradle.kts',
      line: 2,
    });
  });
  it('detects android and maven java', () => {
    const android = run(jvmDetector, {
      'build.gradle': '',
      'app/build.gradle': "plugins { id 'com.android.application' }\n",
      'app/src/main/java/A.java': '',
    });
    expect(values(android, 'framework')).toEqual(['android']);
    const maven = run(jvmDetector, {
      'pom.xml': '<artifactId>junit</artifactId>',
      'src/main/java/A.java': '',
    });
    expect(values(maven, 'language')).toEqual(['java']);
    expect(values(maven, 'packageManager')).toEqual(['maven']);
    expect(commands(maven)).toEqual(['mvn test', 'mvn package']);
  });
});

describe('tooling detector', () => {
  const repo = {
    '.editorconfig': 'root = true\n[*]\nindent_style = space\nindent_size = 2\n',
    'apps/api/.editorconfig': '[*]\nindent_style = tab\n',
    '.github/workflows/ci.yml': '',
    '.github/workflows/release.yaml': '',
    '.gitlab-ci.yml': '',
    Makefile:
      '.PHONY: test\nVERSION := 1\ntest:\n\tgo test ./...\nlint: test\n\tgolangci-lint run\nrelease:\n',
    justfile: 'set shell := ["bash", "-c"]\nbuild:\n  go build\n',
  };
  it('detects indent, CI and task runner commands at root', () => {
    const facts = run(toolingDetector, repo);
    expect(find(facts, 'indent', '2')?.evidence[0]).toEqual({
      file: '.editorconfig',
      pointer: '#[*]',
      line: 3,
    });
    expect(values(facts, 'ci')).toEqual(['github-actions', 'gitlab-ci']);
    expect(find(facts, 'ci', 'github-actions')?.evidence).toHaveLength(2);
    expect(commands(facts)).toEqual(['make test', 'make lint', 'just build']);
  });
  it('only reports per-dir editorconfig in sub scopes', () => {
    const facts = run(toolingDetector, repo, 'apps/api');
    expect(facts.map((f) => [f.key, f.value, f.scope])).toEqual([['indent', 'tab', 'apps/api']]);
  });
});

describe('agent-files detector', () => {
  it('reports instruction files at root only', () => {
    const repo = {
      'AGENTS.md': '',
      'apps/api/AGENTS.md': '',
      'CLAUDE.md': '',
      '.cursor/rules/a.mdc': '',
      '.github/copilot-instructions.md': '',
      'README.md': '',
    };
    const facts = run(agentFilesDetector, repo);
    expect(values(facts, 'agentFile')).toEqual([
      '.cursor/rules/a.mdc',
      '.github/copilot-instructions.md',
      'AGENTS.md',
      'CLAUDE.md',
      'apps/api/AGENTS.md',
    ]);
    expect(find(facts, 'agentFile', 'CLAUDE.md')?.meta).toEqual({ target: 'claude' });
    expect(run(agentFilesDetector, repo, 'apps/api')).toEqual([]);
  });
});
