import { z } from 'zod';
import { SECTION_IDS, TARGET_IDS, type CheckId } from '../types.js';

/** Every doctor check id (runtime mirror of the `CheckId` type). */
export const CHECK_IDS = [
  'conflict/repo',
  'conflict/files',
  'stale/command',
  'stale/path',
  'duplicate',
  'budget',
  'legacy',
  'empty',
] as const satisfies readonly CheckId[];

const customRuleSchema = z
  .object({
    id: z.string().min(1),
    section: z.enum(SECTION_IDS),
    text: z.string().min(1),
    scope: z.string().optional(),
  })
  .strict();

/** Schema of `.ai-rules/config.yaml`. Every key is optional; unknown keys are errors. */
export const configFileSchema = z
  .object({
    targets: z.array(z.enum(TARGET_IDS)).min(1),
    claude: z
      .object({ mode: z.enum(['import', 'full']) })
      .partial()
      .strict(),
    output: z
      .object({ evidence: z.enum(['none', 'comment']) })
      .partial()
      .strict(),
    ignore: z.array(z.string()),
    rules: z
      .object({
        disable: z.array(z.string()),
        custom: z.array(customRuleSchema).superRefine((rules, ctx) => {
          const seen = new Set<string>();
          rules.forEach((r, i) => {
            if (seen.has(r.id)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [i, 'id'],
                message: `Duplicate custom rule id "${r.id}"`,
              });
            }
            seen.add(r.id);
          });
        }),
      })
      .partial()
      .strict(),
    doctor: z
      .object({
        disable: z.array(z.enum(CHECK_IDS)),
        failOn: z.enum(['error', 'warning']),
        duplicateThreshold: z.number().min(0).max(1),
        budget: z
          .object({
            perFile: z.number().int().positive(),
            perAgent: z.number().int().positive(),
          })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    ai: z
      .object({
        provider: z.enum(['ollama', 'anthropic', 'openai']),
        model: z.string().min(1).optional(),
        baseUrl: z.string().url().optional(),
      })
      .strict(),
  })
  .partial()
  .strict();

export type ConfigFile = z.infer<typeof configFileSchema>;

/** Flatten zod issues into `a.b.c: message` lines; unknown keys get their own path. */
export function formatIssues(error: z.ZodError): string[] {
  const lines: string[] = [];
  for (const issue of error.issues) {
    const base = issue.path.map(String);
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      for (const key of issue.keys) lines.push(`${[...base, key].join('.')}: Unknown key`);
    } else {
      lines.push(`${base.length ? base.join('.') : '(root)'}: ${issue.message}`);
    }
  }
  return lines;
}
