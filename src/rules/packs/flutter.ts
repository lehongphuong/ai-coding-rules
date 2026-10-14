import type { RulePack } from '../pack.js';
import type { FactQuery } from '../query.js';
import { allOf, ev } from './helpers.js';

const flutter = ev(['framework', 'flutter']);

const codegenCommand = (q: FactQuery): string | undefined =>
  q
    .commands('codegen')
    .map((c) => String(c.value))
    .find((c) => c.includes('build_runner'));

const STATE_TEXT: Record<string, string> = {
  riverpod:
    'Manage state with Riverpod providers; use `ref.watch` in `build` and `ref.read` in callbacks, never global singletons.',
  bloc: 'Put business logic in Blocs/Cubits; widgets only add events and render states with `BlocBuilder`/`BlocListener`.',
  provider:
    'Expose state with `ChangeNotifier` classes through Provider; read it with `context.watch`/`context.read`.',
  getx: 'Keep state and logic in GetX controllers; widgets observe them with `Obx`/`GetBuilder`.',
};

export const flutterPack: RulePack = {
  id: 'flutter',
  appliesTo: (q) => q.has('framework', 'flutter'),
  rules: [
    {
      id: 'flutter/widgets',
      section: 'code-style',
      priority: 60,
      text: 'Prefer small `StatelessWidget`s with `const` constructors; split large `build` methods into widgets.',
      evidence: flutter,
    },
    {
      id: 'flutter/state',
      section: 'architecture',
      priority: 10,
      text: (q) => {
        const s = q.values('stateManagement').find((v) => v in STATE_TEXT);
        return s ? STATE_TEXT[s]! : '';
      },
      evidence: (q) =>
        q
          .all('stateManagement')
          .filter((f) => String(f.value) in STATE_TEXT)
          .flatMap((f) => f.evidence),
    },
    {
      id: 'flutter/riverpod-generator',
      section: 'architecture',
      priority: 11,
      when: (q) => q.has('stateManagement', 'riverpod'),
      text: 'Declare providers with `@riverpod` annotations (riverpod_generator) instead of hand-written providers.',
      evidence: ev({ dep: 'riverpod_generator' }),
    },
    {
      id: 'flutter/codegen',
      section: 'dos-donts',
      priority: 10,
      when: (q) => codegenCommand(q) !== undefined,
      text: (q) => `Run \`${codegenCommand(q)}\` after changing annotated files.`,
      evidence: ev({ command: 'codegen' }),
    },
    {
      id: 'flutter/generated-files',
      section: 'dos-donts',
      priority: 11,
      text: (q) =>
        `Do not edit generated ${q.dependency('freezed') ? '`*.g.dart` / `*.freezed.dart`' : '`*.g.dart`'} files; change the source and regenerate.`,
      evidence: ev({ dep: 'build_runner' }),
    },
    {
      id: 'flutter/widget-tests',
      section: 'testing',
      priority: 40,
      // only name `test/` when it exists, so the doctor's stale/path check stays quiet
      text: (q) =>
        q.files.hasDir(q.path('test'))
          ? 'Write widget tests with `testWidgets` and `WidgetTester` in `test/`, mirroring the `lib/` structure.'
          : 'Write widget tests with `testWidgets` and `WidgetTester`, mirroring the `lib/` structure.',
      evidence: allOf(ev(['testRunner', 'flutter-test']), flutter),
    },
  ],
};
