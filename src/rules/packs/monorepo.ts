import { code, displayName, joinList } from '../names.js';
import type { RulePack, RuleTemplate } from '../pack.js';
import type { FactQuery } from '../query.js';
import { frameworks } from '../summary.js';
import { ev } from './helpers.js';

const MAX_LISTED = 6;

const TOOL_TEXT: Record<string, string> = {
  'pnpm-workspaces':
    'Run a workspace script with `pnpm --filter <name> <script>`; reference internal packages with `workspace:*`.',
  'yarn-workspaces': 'Run a workspace script with `yarn workspace <name> <script>`.',
  'npm-workspaces': 'Run a workspace script with `npm run <script> -w <workspace>`.',
  turborepo: 'Run builds and tests through `turbo run <task>` so task caching and ordering apply.',
  nx: 'Use `nx affected -t <target>` to build and test only the projects touched by a change.',
  lerna: 'Run scripts across packages with `lerna run <script>`.',
  melos:
    'Run `melos bootstrap` after changing package dependencies and `melos run <script>` for shared scripts.',
  'go-work': 'Register new Go modules in `go.work` with `go work use <dir>`.',
};

function workspaceLabel(q: FactQuery, dir: string): string {
  const fw = frameworks(q.scoped(dir))[0];
  const lang = q.scoped(dir).values('language')[0];
  const what = fw ?? lang;
  return what ? `${code(dir)} (${displayName(what)})` : code(dir);
}

function layoutText(q: FactQuery): string {
  const tools = q.values('monorepo').map(displayName);
  const dirs = q.workspaces.map((w) => w.dir).filter((d) => d !== '');
  if (dirs.length === 0) return '';
  const listed = dirs.slice(0, MAX_LISTED).map((d) => workspaceLabel(q, d));
  if (dirs.length > MAX_LISTED) listed.push(`${dirs.length - MAX_LISTED} more`);
  return `Monorepo (${joinList(tools)}) with workspaces ${joinList(listed)}.`;
}

const toolTemplates: RuleTemplate[] = Object.entries(TOOL_TEXT).map(([tool, text], i) => ({
  id: `monorepo/${tool}`,
  section: 'commands',
  priority: 3 + i / 100,
  text,
  evidence: ev(['monorepo', tool]),
}));

export const monorepoPack: RulePack = {
  id: 'monorepo',
  appliesTo: (q) => q.isRoot && q.has('monorepo'),
  rules: [
    {
      id: 'monorepo/layout',
      section: 'overview',
      priority: 30,
      text: layoutText,
      evidence: ['monorepo'],
    },
    {
      id: 'monorepo/scoped-changes',
      section: 'dos-donts',
      priority: 15,
      text: 'Keep each change inside the workspace it belongs to and follow that workspace’s own instructions.',
      evidence: ['monorepo'],
    },
    ...toolTemplates,
  ],
};
