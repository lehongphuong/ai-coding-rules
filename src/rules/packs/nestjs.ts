import type { RulePack } from '../pack.js';
import { allOf, ev } from './helpers.js';

const nest = ev(['framework', 'nestjs']);

export const nestjsPack: RulePack = {
  id: 'nestjs',
  appliesTo: (q) => q.has('framework', 'nestjs'),
  rules: [
    {
      id: 'nestjs/modules',
      section: 'architecture',
      priority: 10,
      text: 'Organise features as Nest modules (`*.module.ts`); keep controllers thin and put logic in providers.',
      evidence: nest,
    },
    {
      id: 'nestjs/di',
      section: 'architecture',
      priority: 20,
      text: 'Inject dependencies through constructors; never instantiate providers with `new`.',
      evidence: nest,
    },
    {
      id: 'nestjs/dto-validation',
      section: 'architecture',
      priority: 30,
      text: 'Validate request input with DTO classes using class-validator decorators and `ValidationPipe`.',
      evidence: allOf(nest, ev({ dep: 'class-validator' })),
    },
    {
      id: 'nestjs/config',
      section: 'dos-donts',
      priority: 30,
      text: 'Read configuration through `ConfigService`; do not access `process.env` directly in providers.',
      evidence: allOf(nest, ev({ dep: '@nestjs/config' })),
    },
    {
      id: 'nestjs/cli',
      section: 'dos-donts',
      priority: 31,
      text: 'Scaffold modules, controllers and services with the Nest CLI (`nest g ...`) to keep the layout consistent.',
      evidence: allOf(nest, ev({ dep: '@nestjs/cli' })),
    },
    {
      id: 'nestjs/testing',
      section: 'testing',
      priority: 40,
      text: 'Unit-test providers with `Test.createTestingModule`, overriding their dependencies with mocks.',
      evidence: allOf(nest, ev('testRunner'), ev({ dep: '@nestjs/testing' })),
    },
  ],
};
