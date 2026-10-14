import type { RulePack } from '../pack.js';
import { ev } from './helpers.js';

const dart = ev(['language', 'dart']);

export const dartPack: RulePack = {
  id: 'dart',
  appliesTo: (q) => q.has('language', 'dart'),
  rules: [
    {
      id: 'dart/null-safety',
      section: 'code-style',
      priority: 50,
      text: 'Use sound null safety; avoid the `!` operator unless the value is proven non-null.',
      evidence: dart,
    },
    {
      id: 'dart/no-ignore',
      section: 'code-style',
      priority: 51,
      text: 'Fix analyzer warnings instead of adding `// ignore:` comments.',
      evidence: ev('linter'),
    },
    {
      id: 'dart/pub',
      section: 'dos-donts',
      priority: 20,
      text: (q) =>
        `Add packages with \`${q.has('framework', 'flutter') ? 'flutter' : 'dart'} pub add\`; do not edit \`pubspec.lock\` by hand.`,
      evidence: ev(['packageManager', 'pub']),
    },
  ],
};
