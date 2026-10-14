/** Human display names for fact values. */
const NAMES: Record<string, string> = {
  // languages
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  dart: 'Dart',
  php: 'PHP',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  // frameworks
  react: 'React',
  nextjs: 'Next.js',
  vue: 'Vue',
  nuxt: 'Nuxt',
  angular: 'Angular',
  svelte: 'Svelte',
  nestjs: 'NestJS',
  express: 'Express',
  fastify: 'Fastify',
  flutter: 'Flutter',
  laravel: 'Laravel',
  symfony: 'Symfony',
  django: 'Django',
  fastapi: 'FastAPI',
  flask: 'Flask',
  spring: 'Spring Boot',
  android: 'Android',
  // package managers
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'Yarn',
  bun: 'Bun',
  pub: 'pub',
  composer: 'Composer',
  pip: 'pip',
  poetry: 'Poetry',
  uv: 'uv',
  pipenv: 'Pipenv',
  gradle: 'Gradle',
  maven: 'Maven',
  // test runners
  jest: 'Jest',
  vitest: 'Vitest',
  mocha: 'Mocha',
  playwright: 'Playwright',
  cypress: 'Cypress',
  'flutter-test': 'flutter_test',
  phpunit: 'PHPUnit',
  pest: 'Pest',
  pytest: 'pytest',
  'go-test': 'go test',
  junit: 'JUnit',
  // linters / formatters
  eslint: 'ESLint',
  biome: 'Biome',
  'flutter-lints': 'flutter_lints',
  'very-good-analysis': 'very_good_analysis',
  phpstan: 'PHPStan',
  larastan: 'Larastan',
  ruff: 'Ruff',
  flake8: 'Flake8',
  pylint: 'Pylint',
  'golangci-lint': 'golangci-lint',
  ktlint: 'ktlint',
  detekt: 'detekt',
  prettier: 'Prettier',
  'dart-format': 'dart format',
  pint: 'Pint',
  'php-cs-fixer': 'PHP CS Fixer',
  black: 'Black',
  'ruff-format': 'Ruff',
  gofmt: 'gofmt',
  // orm / state / styling
  prisma: 'Prisma',
  typeorm: 'TypeORM',
  drizzle: 'Drizzle',
  mongoose: 'Mongoose',
  sequelize: 'Sequelize',
  eloquent: 'Eloquent',
  doctrine: 'Doctrine',
  sqlalchemy: 'SQLAlchemy',
  'django-orm': 'Django ORM',
  gorm: 'GORM',
  hibernate: 'Hibernate',
  riverpod: 'Riverpod',
  bloc: 'Bloc',
  provider: 'Provider',
  getx: 'GetX',
  redux: 'Redux',
  zustand: 'Zustand',
  pinia: 'Pinia',
  mobx: 'MobX',
  tailwind: 'Tailwind CSS',
  'css-modules': 'CSS Modules',
  'styled-components': 'styled-components',
  sass: 'Sass',
  // ci / monorepo
  'github-actions': 'GitHub Actions',
  'gitlab-ci': 'GitLab CI',
  circleci: 'CircleCI',
  'bitbucket-pipelines': 'Bitbucket Pipelines',
  'azure-pipelines': 'Azure Pipelines',
  'pnpm-workspaces': 'pnpm workspaces',
  'npm-workspaces': 'npm workspaces',
  'yarn-workspaces': 'Yarn workspaces',
  turborepo: 'Turborepo',
  nx: 'Nx',
  lerna: 'Lerna',
  melos: 'Melos',
  'go-work': 'Go workspaces',
};

export function displayName(value: string): string {
  return NAMES[value] ?? value;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[], last = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`;
}

/** Markdown inline code. */
export function code(text: string): string {
  return `\`${text}\``;
}
