import { displayName, joinList } from './names.js';
import type { FactQuery } from './query.js';

/** Most specific first; used to pick the primary framework. */
const FRAMEWORK_ORDER = [
  'nextjs',
  'nuxt',
  'nestjs',
  'laravel',
  'symfony',
  'django',
  'fastapi',
  'flask',
  'spring',
  'android',
  'flutter',
  'angular',
  'svelte',
  'react',
  'vue',
  'express',
  'fastify',
];

/** Frameworks implied by another one (not worth repeating in summaries). */
const IMPLIED_BY: Record<string, string[]> = {
  react: ['nextjs'],
  vue: ['nuxt'],
  express: ['nestjs'],
  fastify: ['nestjs'],
};

const NOUNS: Record<string, string> = {
  nextjs: 'Next.js app',
  nuxt: 'Nuxt app',
  nestjs: 'NestJS API',
  laravel: 'Laravel app',
  symfony: 'Symfony app',
  django: 'Django project',
  fastapi: 'FastAPI service',
  flask: 'Flask app',
  spring: 'Spring Boot service',
  android: 'Android app',
  flutter: 'Flutter app',
  angular: 'Angular app',
  svelte: 'Svelte app',
  react: 'React app',
  vue: 'Vue app',
  express: 'Express API',
  fastify: 'Fastify API',
};

/** Detected frameworks, primary first, without implied ones. */
export function frameworks(q: FactQuery): string[] {
  const all = q.values('framework');
  const rank = (v: string): number => {
    const i = FRAMEWORK_ORDER.indexOf(v);
    return i === -1 ? FRAMEWORK_ORDER.length : i;
  };
  return all
    .filter((f) => !(IMPLIED_BY[f] ?? []).some((p) => all.includes(p)))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function languageNames(q: FactQuery, withStrict: boolean): string[] {
  return q.values('language').map((l) => {
    const name = displayName(l);
    return withStrict && l === 'typescript' && q.has('typescriptStrict', true)
      ? `${name} (strict)`
      : name;
  });
}

function packageManagerName(q: FactQuery): string | undefined {
  const pm = q.values('packageManager')[0];
  if (!pm) return undefined;
  return pm === 'go' ? 'Go modules' : displayName(pm);
}

/** "NestJS API written in TypeScript (strict), managed with pnpm." ('' when nothing is known). */
export function overviewSentence(q: FactQuery): string {
  const fws = frameworks(q);
  const langs = languageNames(q, true);
  const pm = packageManagerName(q);
  const [primary, ...extras] = fws;
  let text: string;
  if (primary) {
    text = NOUNS[primary] ?? `${displayName(primary)} project`;
    if (extras.length) text += ` with ${joinList(extras.map(displayName))}`;
    if (langs.length) text += ` written in ${joinList(langs)}`;
  } else if (langs.length) {
    text = `${joinList(langs)} project`;
  } else {
    // A package manager alone says too little (e.g. a monorepo root).
    return '';
  }
  if (pm) text += `, managed with ${pm}`;
  return `${text}.`;
}

/** Short stack summary, e.g. "NestJS · TypeScript · pnpm". */
export function scopeSummary(q: FactQuery): string {
  const parts = [...frameworks(q).map(displayName), ...languageNames(q, false)];
  if (parts.length === 0) parts.push(...q.values('monorepo').map(displayName));
  const pm = q.values('packageManager')[0];
  if (pm && !parts.some((p) => p.startsWith(`${displayName(pm)} `))) parts.push(displayName(pm));
  return [...new Set(parts)].join(' · ');
}
