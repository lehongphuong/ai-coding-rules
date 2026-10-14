import type { RulePack } from '../pack.js';
import { allOf, ev } from './helpers.js';

const spring = ev(['framework', 'spring']);
const android = ev(['framework', 'android']);

export const jvmPack: RulePack = {
  id: 'jvm',
  appliesTo: (q) =>
    q.has('language', 'java') ||
    q.has('language', 'kotlin') ||
    q.has('framework', 'spring') ||
    q.has('framework', 'android'),
  rules: [
    {
      id: 'jvm/gradle-wrapper',
      section: 'commands',
      priority: 2,
      text: 'Always use the Gradle wrapper (`./gradlew`), never a system-wide `gradle`.',
      evidence: allOf(ev(['packageManager', 'gradle']), ev({ file: 'gradlew' })),
    },
    {
      id: 'jvm/maven-wrapper',
      section: 'commands',
      priority: 2,
      text: 'Always use the Maven wrapper (`./mvnw`), never a system-wide `mvn`.',
      evidence: allOf(ev(['packageManager', 'maven']), ev({ file: 'mvnw' })),
    },
    {
      id: 'jvm/kotlin',
      section: 'code-style',
      priority: 50,
      when: (q) => !q.has('language', 'java'),
      text: 'Write idiomatic Kotlin: prefer `val`, immutable `data class`es and null-safe types over `!!`.',
      evidence: ev(['language', 'kotlin']),
    },
    {
      id: 'jvm/spring-di',
      section: 'architecture',
      priority: 10,
      text: 'Use constructor injection for Spring beans; do not use field `@Autowired`.',
      evidence: spring,
    },
    {
      id: 'jvm/spring-layers',
      section: 'architecture',
      priority: 20,
      text: 'Keep `@RestController`s thin; put business logic in `@Service` classes and data access in repositories.',
      evidence: spring,
    },
    {
      id: 'jvm/android-viewmodel',
      section: 'architecture',
      priority: 30,
      text: 'Keep UI state and logic in ViewModels; never hold `Context` or `Activity` references in them.',
      evidence: android,
    },
  ],
};
